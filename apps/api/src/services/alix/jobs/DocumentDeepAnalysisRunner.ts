import { z } from 'zod'
import type { PoolClient } from 'pg'
import { getPool, isPgEnabled } from '../../../db/client.js'
import { analyzeDocumentDeep, type DocumentDeepAnalysis } from '../intake/DocumentAnalysisService.js'
import { getDocumentIntakeService } from '../intake/DocumentIntakeService.js'
import { buildDocumentReadingPlan, boundedReadingNumber, type DocumentExtractionCoverage } from '../intake/DocumentReadingPlan.js'
import { getModelForRole } from '../../llm/LLMConfig.js'

export type DeepAnalysisProcessingStatus = 'completed' | 'continuation_required' | 'paused_budget' | 'paused_no_progress' | 'awaiting_source'
export interface DeepAnalysisJobContext {
  jobId: string
  rootJobId: string
  pass: number
  sourceHash: string
  model: string
  maxPasses: number
  maxDurationMs: number
}
export interface DeepAnalysisJobResult {
  analysis: DocumentDeepAnalysis
  cached: boolean
  continuationRequired: boolean
  sourceReprocessingRequired: boolean
  processing: {
    status: DeepAnalysisProcessingStatus
    reason: string
    nextStep: string | null
    rootJobId?: string
    nextPass?: number
    passesUsed: number
    maxPasses: number
    reservedDurationMs: number
    maxDurationMs: number
    progressSegments: number
    continuationJobId?: string
    continuationStatusUrl?: string
  }
  sourceReadiness: {
    extractedTextChars: number
    evidenceCount: number
    hasNativeFile: boolean
    clientScope: 'cliente' | 'sessao'
    extractionCoverage: DocumentExtractionCoverage
  }
}

type DeepAnalysisInput = {
  sessionId: string
  documentId: string
  focus?: string
  autoContinue?: boolean
  job?: DeepAnalysisJobContext
}

type Checkpoint = {
  version: 1
  rootJobId: string
  jobId: string
  pass: number
  sourceHash: string
  model: string
  focus: string
  status: DeepAnalysisProcessingStatus | 'running'
  passesUsed: number
  maxPasses: number
  reservedDurationMs: number
  maxDurationMs: number
  progressSegments: number
  updatedAt: string
  analysis?: DocumentDeepAnalysis
}
const checkpointSchema = z.object({
  version: z.literal(1), rootJobId: z.string().uuid(), jobId: z.string().uuid(), pass: z.number().int().min(0).max(64),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/), model: z.string().min(1), focus: z.string(),
  status: z.enum(['running', 'completed', 'continuation_required', 'paused_budget', 'paused_no_progress', 'awaiting_source']),
  passesUsed: z.number().int().min(0).max(64), maxPasses: z.number().int().min(1).max(64),
  reservedDurationMs: z.number().int().min(0), maxDurationMs: z.number().int().min(1_000).max(14_400_000),
  progressSegments: z.number().int().min(0), updatedAt: z.string().datetime(),
  analysis: z.custom<DocumentDeepAnalysis>(value => Boolean(value && typeof value === 'object' && 'documentoId' in value && 'readingCoverage' in value)).optional(),
}).strict()

const running = new Map<string, Promise<DeepAnalysisJobResult>>()
const documentLocks = new Map<string, Promise<void>>()

/** Uma fonte por vez também entre processos; o bloqueio não mantém transação de dados aberta durante a IA. */
async function withDocumentLock<T>(key: string, execute: () => Promise<T>): Promise<T> {
  const previous = documentLocks.get(key) || Promise.resolve()
  let release!: () => void
  const next = new Promise<void>(resolve => { release = resolve })
  documentLocks.set(key, next)
  await previous.catch(() => undefined)
  let client: PoolClient | null = null
  let locked = false
  try {
    if (isPgEnabled()) client = await getPool().connect()
    if (client) { await client.query('select pg_advisory_lock(hashtextextended($1, 0))', [`alix-deep-document:${key}`]); locked = true }
    return await execute()
  } finally {
    if (client) {
      let destroy = false
      if (locked) await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [`alix-deep-document:${key}`]).catch(() => { destroy = true })
      client.release(destroy)
    }
    release()
    if (documentLocks.get(key) === next) documentLocks.delete(key)
  }
}

export async function runDocumentDeepAnalysis(input: DeepAnalysisInput): Promise<DeepAnalysisJobResult> {
  const key = JSON.stringify([input.sessionId, input.documentId, input.focus?.trim() || '', Boolean(input.autoContinue), input.job?.jobId || ''])
  const existing = running.get(key)
  if (existing) return existing
  const execution = withDocumentLock(JSON.stringify([input.sessionId, input.documentId]), () => executeDocumentDeepAnalysis(input))
    .finally(() => { running.delete(key) })
  running.set(key, execution)
  return execution
}

export function deepAnalysisBudget(): { maxPasses: number; maxDurationMs: number } {
  return {
    maxPasses: boundedReadingNumber(process.env.ALIX_DEEP_ANALYSIS_MAX_PASSES, 12, 1, 64),
    maxDurationMs: boundedReadingNumber(process.env.ALIX_DEEP_ANALYSIS_BUDGET_MS, 3_600_000, 1_000, 14_400_000),
  }
}

async function executeDocumentDeepAnalysis(input: DeepAnalysisInput): Promise<DeepAnalysisJobResult> {
  const svc = getDocumentIntakeService()
  const doc = await svc.get(input.sessionId, input.documentId)
  if (!doc) throw new Error('Documento não encontrado.')
  const plan = buildDocumentReadingPlan(doc)
  const focus = input.focus?.trim() || ''
  const model = getModelForRole('doc_analyzer')
  if (input.job && (input.job.sourceHash !== plan.sourceHash || input.job.model !== model)) {
    throw new Error('A fonte ou o modelo mudou durante a análise; solicite uma leitura da revisão atual.')
  }

  const cached = doc.metadata?.deepAnalysis as {
    version?: number; focus?: string; sourceHash?: string; model?: string; analysis?: DocumentDeepAnalysis
  } | undefined
  const matches = cached?.version === 3 && cached.sourceHash === plan.sourceHash && cached.model === model && focus === (cached.focus || '')
  const checkpointCandidate = input.job && (doc.metadata?.deepAnalysisContinuations as Record<string, unknown> | undefined)?.[input.job.rootJobId]
  const parsedCheckpoint = checkpointSchema.safeParse(checkpointCandidate)
  if (checkpointCandidate && !parsedCheckpoint.success) throw new Error('Checkpoint de leitura inválido; é necessária revisão antes de retomar.')
  let checkpoint: Checkpoint | undefined = parsedCheckpoint.success ? parsedCheckpoint.data : undefined
  if (checkpoint && (checkpoint.sourceHash !== plan.sourceHash || checkpoint.model !== model || checkpoint.focus !== focus)) {
    throw new Error('O checkpoint pertence a outra revisão ou foco de leitura.')
  }
  let analysis = checkpoint?.analysis || (matches ? cached?.analysis : undefined)
  if (!checkpoint && input.job) {
    // Novo orçamento para o mesmo foco recupera os segmentos mesmo se outra análise atualizou o cache principal.
    for (const value of Object.values((doc.metadata?.deepAnalysisContinuations as Record<string, unknown>) || {})) {
      const prior = checkpointSchema.safeParse(value)
      if (!prior.success || prior.data.sourceHash !== plan.sourceHash || prior.data.focus !== focus || prior.data.model !== model) continue
      const candidate = prior.data.analysis
      if (candidate?.readingCoverage?.sourceHash === plan.sourceHash
        && (!analysis || candidate.readingCoverage.analyzedSegments > (analysis.readingCoverage?.analyzedSegments || 0))) analysis = candidate
    }
  }
  if (matches && cached?.analysis?.readingCoverage?.sourceHash === plan.sourceHash) {
    const cachedSegments = new Set(cached.analysis.segmentAnalyses?.map(segment => segment.index) || [])
    if (!analysis || (analysis.segmentAnalyses || []).every(segment => cachedSegments.has(segment.index))) analysis = cached.analysis
  }
  const reusable = analysis?.readingCoverage?.sourceHash === plan.sourceHash && analysis.readingCoverage.complete === true
  let status: DeepAnalysisProcessingStatus = reusable ? 'completed' : 'continuation_required'
  let progressSegments = 0
  let reusedPass = false
  const budget = deepAnalysisBudget()

  if (input.job && checkpoint && (input.job.pass < checkpoint.pass || input.job.pass === checkpoint.pass && checkpoint.status !== 'running')) {
    // A passagem já foi confirmada antes de uma falha de enqueue/ack. Não chama a IA outra vez.
    status = reusable ? 'completed' : checkpoint.status === 'running' ? 'continuation_required' : checkpoint.status
    progressSegments = checkpoint.progressSegments
    reusedPass = true
  } else if (input.job && checkpoint && input.job.pass > checkpoint.pass + 1) {
    throw new Error('Continuação fora de ordem; o checkpoint anterior ainda não foi confirmado.')
  }

  const save = async () => {
    const patch: { deepAnalysis?: Record<string, unknown>; continuation?: { rootJobId: string; checkpoint: Record<string, unknown> } } = {}
    if (analysis) patch.deepAnalysis = { version: 3, focus, sourceHash: plan.sourceHash, model, generatedAt: new Date().toISOString(), analysis }
    if (checkpoint) {
      checkpoint.updatedAt = new Date().toISOString()
      checkpoint.analysis = analysis
      patch.continuation = { rootJobId: checkpoint.rootJobId, checkpoint: checkpointSchema.parse(checkpoint) }
    }
    await svc.saveDeepAnalysisCheckpoint(input.sessionId, input.documentId, plan.sourceHash, patch)
  }

  if (!reusable && !reusedPass) {
    let duration = input.autoContinue ? boundedReadingNumber(process.env.ALIX_DEEP_ANALYSIS_JOB_TIMEOUT_MS, 300_000, 1_000, 600_000) : 70_000
    if (input.job) {
      const maxPasses = Math.min(budget.maxPasses, input.job.maxPasses, checkpoint?.maxPasses ?? 64)
      const maxDurationMs = Math.min(budget.maxDurationMs, input.job.maxDurationMs, checkpoint?.maxDurationMs ?? 14_400_000)
      const passesUsed = checkpoint?.passesUsed || 0
      const reservedDurationMs = checkpoint?.reservedDurationMs || 0
      duration = Math.min(duration, maxDurationMs - reservedDurationMs)
      checkpoint = {
        version: 1, rootJobId: input.job.rootJobId, jobId: input.job.jobId, pass: input.job.pass,
        sourceHash: plan.sourceHash, model, focus, status: 'running', passesUsed, maxPasses,
        reservedDurationMs, maxDurationMs, progressSegments: 0, updatedAt: new Date().toISOString(), analysis,
      }
      if (passesUsed >= maxPasses || duration < 1_000) status = 'paused_budget'
      else {
        // Reserva conservadora antes do modelo: reinício não apaga o custo autorizado desta tentativa.
        checkpoint.passesUsed++
        checkpoint.reservedDurationMs += duration
      }
      checkpoint.status = status === 'paused_budget' ? status : 'running'
      await save()
    }
    if (status !== 'paused_budget') {
      const beforePass = analysis?.readingCoverage?.analyzedSegments || 0
      const deadline = Date.now() + duration
      const rounds = input.autoContinue ? 12 : 1
      for (let round = 0; round < rounds; round++) {
        const previousCount = analysis?.readingCoverage?.analyzedSegments || 0
        analysis = await analyzeDocumentDeep({ doc, foco: focus, previous: analysis, maxDurationMs: Math.max(1_000, deadline - Date.now()) })
        await save()
        if (!analysis.readingCoverage?.pendingSegments.length || analysis.readingCoverage.analyzedSegments <= previousCount || Date.now() >= deadline - 1_000) break
      }
      progressSegments = Math.max(0, (analysis?.readingCoverage?.analyzedSegments || 0) - beforePass)
      status = analysis?.readingCoverage?.complete ? 'completed'
        : !analysis?.readingCoverage?.pendingSegments.length ? 'awaiting_source'
          : progressSegments === 0 ? 'paused_no_progress'
            : checkpoint && (checkpoint.passesUsed >= checkpoint.maxPasses || checkpoint.reservedDurationMs >= checkpoint.maxDurationMs) ? 'paused_budget'
              : 'continuation_required'
      if (checkpoint) { checkpoint.status = status; checkpoint.progressSegments = progressSegments; await save() }
    }
  }
  if (!analysis) {
    // Uma queda antes da primeira resposta pode consumir o orçamento inteiro: representa cobertura zero sem novo custo.
    const { documentReadingCoverage } = await import('../intake/DocumentReadingPlan.js')
    analysis = {
      documentoId: doc.id, filename: doc.filename, kind: doc.kind, status: 'deterministic', tipoDocumento: doc.kind,
      resumoExecutivo: 'A leitura ainda não produziu segmentos analisados.', achadosChave: [], indicadores: [], riscos: [],
      lacunas: ['Nenhum segmento foi concluído antes da pausa.'], acoesSugeridas: [], acoesSistema: [], evidencias: [],
      readingCoverage: documentReadingCoverage(plan, []), segmentAnalyses: [],
    }
    if (checkpoint) await save()
  }
  if (checkpoint && reusable && checkpoint.status !== 'completed') {
    checkpoint.status = 'completed'
    await save()
  }
  const messages: Record<DeepAnalysisProcessingStatus, [string, string | null]> = {
    completed: ['Leitura de todos os segmentos do texto extraído concluída, com extração completa registrada.', null],
    continuation_required: ['Há segmentos pendentes; a próxima passagem retoma os resultados confirmados.', 'Aguardar a continuação automática da leitura.'],
    paused_budget: ['O orçamento de passagens ou tempo reservado desta cadeia foi atingido; o progresso foi preservado.', 'Solicitar outra leitura para liberar novo orçamento e retomar os segmentos pendentes.'],
    paused_no_progress: ['A última passagem não concluiu novos segmentos; novas chamadas automáticas foram pausadas.', 'Verificar a disponibilidade do modelo e os segmentos que falharam, depois retomar a leitura.'],
    awaiting_source: ['Todo o texto disponível foi analisado, mas a extração/OCR do original ainda está incompleta.', 'Concluir o OCR ou reprocessar o original e analisar a revisão atualizada.'],
  }
  return {
    analysis, cached: Boolean(reusable || reusedPass),
    continuationRequired: Boolean(analysis.readingCoverage?.pendingSegments.length),
    sourceReprocessingRequired: plan.extraction.status !== 'complete',
    processing: {
      status, reason: messages[status][0], nextStep: messages[status][1],
      ...(checkpoint ? { rootJobId: checkpoint.rootJobId, nextPass: checkpoint.pass + (checkpoint.status === 'running' ? 0 : 1) } : {}),
      passesUsed: checkpoint?.passesUsed || 0, maxPasses: checkpoint?.maxPasses || budget.maxPasses,
      reservedDurationMs: checkpoint?.reservedDurationMs || 0, maxDurationMs: checkpoint?.maxDurationMs || budget.maxDurationMs,
      progressSegments,
    },
    sourceReadiness: {
      extractedTextChars: doc.extractedText?.length ?? 0, evidenceCount: doc.evidences?.length ?? 0,
      hasNativeFile: Boolean(doc.metadata?.rawFile), clientScope: doc.clienteId ? 'cliente' : 'sessao', extractionCoverage: plan.extraction,
    },
  }
}
