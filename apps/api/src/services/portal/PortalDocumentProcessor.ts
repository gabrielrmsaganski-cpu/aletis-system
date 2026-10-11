import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { open, realpath } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import type { IngestedDocument, IntakeInput } from '../alix/intake/types.js'
import type { DocumentPipelineRunView } from '../alix/intake/DocumentPipelineService.js'
import type { DocumentDeepAnalysis } from '../alix/intake/DocumentAnalysisService.js'
import type { EnqueueResult } from '../alix/jobs/AiJobQueueService.js'
import { PgPortalDocumentJobStore } from './PortalDocumentJobStore.js'
import { PortalDriveArchiver } from './PortalDriveArchiver.js'
import { assessPortalRequest, portalRequestFocus } from './PortalDocumentRequestAssessment.js'
import {
  PortalProcessingError, processingState, processingErrorCode, retryDelay,
  type PortalDocumentJobStore, type PortalProcessingInput, type PortalProcessingLease,
  type PortalProcessingState, type PortalProcessingUpload, type PortalAnalysisState,
} from './PortalDocumentProcessingTypes.js'

const MAX_BYTES = 20 * 1024 * 1024
type Logger = { info(data: unknown, message?: string): void; warn(data: unknown, message?: string): void; error(data: unknown, message?: string): void }
type Job = Record<string, unknown> | null
export interface PortalProcessorDependencies {
  store: PortalDocumentJobStore
  readFile: (upload: PortalProcessingUpload) => Promise<Buffer>
  intake: {
    get(sessionId: string, documentId: string): Promise<IngestedDocument | null>
    ingest(input: IntakeInput): Promise<IngestedDocument>
  }
  pipeline: { getLatestForDocument(documentId: string): Promise<DocumentPipelineRunView | null> }
  queue: {
    ready(): Promise<boolean>
    enqueueDocumentPipeline(input: { sessionId: string; documentId: string; clienteId: string; force?: boolean }): Promise<EnqueueResult>
    enqueueDeepAnalysis(input: { sessionId: string; documentId: string; focus: string }): Promise<EnqueueResult>
    getJob(queue: string, jobId: string): Promise<Job>
  }
  drive: Pick<PortalDriveArchiver, 'archive'>
}

/** O browser entrega apenas IDs. Caminho, nome, MIME e hash vêm do registro
 * confirmado no PG; symlink, tamanho divergente e adulteração falham fechados. */
export async function readPortalUploadFile(upload: PortalProcessingUpload, configuredRoot = process.env.ALETIS_PORTAL_UPLOAD_DIR || join(process.cwd(), 'storage', 'portal-uploads')): Promise<Buffer> {
  if (!upload.nomeStorage || basename(upload.nomeStorage) !== upload.nomeStorage || /[\\/\u0000]/.test(upload.nomeStorage)
    || ['.', '..'].includes(upload.nomeStorage)) throw new PortalProcessingError('UPLOAD_PATH_INVALID', false)
  if (!Number.isSafeInteger(upload.tamanho) || upload.tamanho <= 0 || upload.tamanho > MAX_BYTES) throw new PortalProcessingError('UPLOAD_SIZE_INVALID', false)
  if (!upload.sha256 || !/^[a-f0-9]{64}$/.test(upload.sha256)) throw new PortalProcessingError('UPLOAD_HASH_MISSING', false)
  const root = await realpath(resolve(configuredRoot))
  const file = await open(join(root, upload.nomeStorage), constants.O_RDONLY | constants.O_NOFOLLOW).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') throw new PortalProcessingError('UPLOAD_PATH_INVALID', false)
    throw error
  })
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size !== upload.tamanho || stat.size > MAX_BYTES) throw new PortalProcessingError('UPLOAD_SIZE_MISMATCH', false)
    const buffer = await file.readFile()
    if (buffer.byteLength !== upload.tamanho || createHash('sha256').update(buffer).digest('hex') !== upload.sha256) throw new PortalProcessingError('UPLOAD_HASH_MISMATCH', false)
    return buffer
  } finally { await file.close() }
}

export function portalDocumentIdentity(input: PortalProcessingInput): { sessionId: string; documentId: string } {
  const clientHash = createHash('sha256').update(input.clienteId).digest('hex')
  const hash = createHash('sha256').update(JSON.stringify(['portal', input.clienteId, input.uploadId])).digest('hex')
  return { sessionId: `portal_doc_${clientHash.slice(0, 40)}`, documentId: `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}` }
}

function defaults(): PortalProcessorDependencies {
  const queue = async () => (await import('../alix/jobs/AiJobQueueService.js')).getAiJobQueueService()
  return {
    store: new PgPortalDocumentJobStore(), readFile: readPortalUploadFile, drive: new PortalDriveArchiver(),
    intake: {
      get: async (sessionId, id) => (await import('../alix/intake/DocumentIntakeService.js')).getDocumentIntakeService().get(sessionId, id),
      ingest: async input => (await import('../alix/intake/DocumentIntakeService.js')).getDocumentIntakeService().ingest(input),
    },
    pipeline: { getLatestForDocument: async id => (await import('../alix/intake/DocumentPipelineService.js')).getDocumentPipelineService().getLatestForDocument(id, true) },
    queue: {
      ready: async () => (await queue()).ready(),
      enqueueDocumentPipeline: async input => (await queue()).enqueueDocumentPipeline(input),
      enqueueDeepAnalysis: async input => (await queue()).enqueueDeepAnalysis(input),
      getJob: async (name, id) => (await queue()).getJob(name, id),
    },
  }
}

function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function deepAnalysis(doc: IngestedDocument, job?: Job, focusHash?: string, rootJobId?: string): DocumentDeepAnalysis | undefined {
  const output = object(job?.output)
  const cached = object(doc.metadata.deepAnalysis)
  const cachedMatches = !focusHash || (typeof cached.focus === 'string' && createHash('sha256').update(cached.focus).digest('hex') === focusHash)
  const checkpoint = object(object(doc.metadata.deepAnalysisContinuations)[rootJobId || ''])
  const checkpointMatches = Boolean(focusHash && typeof checkpoint.focus === 'string' && createHash('sha256').update(checkpoint.focus).digest('hex') === focusHash)
  const candidate = output.analysis || (checkpointMatches ? checkpoint.analysis : undefined) || (cachedMatches ? cached.analysis : undefined)
  const analysis = candidate as DocumentDeepAnalysis | undefined
  return analysis?.documentoId === doc.id ? analysis : undefined
}
function isTerminal(state: PortalAnalysisState): boolean { return ['completed', 'needs_review', 'failed'].includes(state.status) }

/** Um trabalhador leve despacha a esteira existente e reconcilia resultados.
 * OCR/IA profunda continuam nos jobs ALIX, com checkpoints e orçamento próprios. */
export class PortalDocumentProcessor {
  private readonly deps: PortalProcessorDependencies
  private timer: ReturnType<typeof setInterval> | null = null
  private active: Promise<boolean> | null = null
  private stopping = false
  private logger?: Logger
  constructor(overrides: Partial<PortalProcessorDependencies> = {}) { this.deps = { ...defaults(), ...overrides } }

  async start(logger?: Logger): Promise<void> {
    if (this.timer || !this.deps.store.enabled() || process.env.ALETIS_PORTAL_PROCESSOR_ENABLED === 'false') return
    this.logger = logger; this.stopping = false
    this.timer = setInterval(() => { void this.runOnce().catch(() => this.logger?.warn({ code: 'PORTAL_PROCESSOR_RETRY' }, 'Portal: a fila será retomada na próxima verificação.')) }, 5_000)
    this.timer.unref()
    this.logger?.info({ intervalMs: 5_000 }, 'Portal: processamento documental automático ativo.')
    void this.runOnce().catch(() => this.logger?.warn({ code: 'PORTAL_PROCESSOR_RETRY' }, 'Portal: aguardando processamento durável.'))
  }

  async stop(): Promise<void> {
    this.stopping = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.active) {
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([this.active.catch(() => undefined), new Promise<void>(resolve => { timer = setTimeout(resolve, 25_000) })])
      if (timer) clearTimeout(timer)
    }
  }
  async enqueue(input: PortalProcessingInput): Promise<void> { await this.deps.store.enqueue(input) }
  async retry(input: PortalProcessingInput & { etapa?: 'analise' | 'drive' | 'todas' }): Promise<void> {
    await this.deps.store.enqueue({ uploadId: input.uploadId, clienteId: input.clienteId }, true, input.etapa || 'todas')
  }

  async runOnce(): Promise<boolean> {
    if (this.active || this.stopping || !this.deps.store.enabled()) return false
    const execution = this.processNext()
    this.active = execution
    try { return await execution } finally { if (this.active === execution) this.active = null }
  }

  private async processNext(): Promise<boolean> {
    const lease = await this.deps.store.claim()
    if (!lease) return false
    let owned = true
    const heartbeat = setInterval(() => { void this.deps.store.heartbeat(lease).then(ok => { if (!ok) owned = false }).catch(() => { owned = false }) }, 30_000)
    heartbeat.unref()
    const assertOwned = () => { if (!owned || this.stopping) throw new PortalProcessingError('LEASE_LOST') }
    try {
      let upload = await this.deps.store.load({ uploadId: lease.uploadId, clienteId: lease.clienteId })
      if (!upload || upload.clienteId !== lease.clienteId || upload.id !== lease.uploadId) throw new PortalProcessingError('UPLOAD_NOT_FOUND', false)
      let state = processingState(upload.metadata)
      const save = async (patch: Record<string, unknown> = {}) => {
        assertOwned()
        upload = await this.deps.store.checkpoint(lease, { ...patch, processing: state })
      }
      const buffer = await this.deps.readFile(upload)
      assertOwned()
      if (!isTerminal(state.analysis) && (!state.analysis.nextAttemptAt || Date.parse(state.analysis.nextAttemptAt) <= Date.now())) {
        try { state.analysis = await this.analyze(upload, buffer, state, save, assertOwned) }
        catch (error) {
          assertOwned()
          const code = processingErrorCode(error, 'ALIX_ANALYSIS_RETRY')
          const terminal = error instanceof PortalProcessingError && !error.retryable
          state.analysis = { ...state.analysis, status: terminal || (state.analysis.attempts || 0) >= 3 ? 'failed' : 'pending', errorCode: code,
            nextAttemptAt: new Date(Date.now() + retryDelay(state.analysis.attempts || 1)).toISOString(), updatedAt: new Date().toISOString() }
          await save()
        }
      }
      // A indisponibilidade da IA não impede a cópia durável do original ao Drive.
      if (state.drive.status !== 'archived' && (!state.drive.nextAttemptAt || Date.parse(state.drive.nextAttemptAt) <= Date.now())) {
        try {
          state.drive = { ...state.drive, attempts: (state.drive.attempts || 0) + 1 }
          await this.deps.drive.archive(upload, buffer, state.drive, async drive => {
            state.drive = drive
            await save(drive.status === 'archived' ? { googleDrive: { status: 'uploaded', fileId: drive.fileId, url: drive.url, subfolder: drive.folderName, syncedAt: drive.archivedAt } } : {})
          })
        } catch (error) {
          assertOwned()
          const code = processingErrorCode(error, 'DRIVE_TEMPORARILY_UNAVAILABLE')
          state.drive = { ...state.drive, status: error instanceof PortalProcessingError && !error.retryable || ['AUTH_REQUIRED', 'ACCOUNT_MISMATCH', 'SERVER_CONFIGURATION', 'PERMISSION_DENIED', 'DRIVE_FOLDER_UNLINKED', 'DRIVE_FOLDER_UNAVAILABLE', 'DRIVE_FOLDER_INVALID', 'DRIVE_FOLDER_AMBIGUOUS', 'DRIVE_BINDING_CHANGED', 'DRIVE_DESTINATION_CHANGED', 'DRIVE_ARCHIVE_INTEGRITY_MISMATCH'].includes(code) ? 'blocked' : 'retry', errorCode: code, updatedAt: new Date().toISOString() }
          state.drive.nextAttemptAt = new Date(Date.now() + (state.drive.status === 'blocked' ? 15 * 60_000 : retryDelay(state.drive.attempts || 1))).toISOString()
          await save()
        }
      }
      assertOwned()
      const complete = isTerminal(state.analysis) && state.drive.status === 'archived'
      const remainingDelay = (at: string | undefined, fallback: number) => at ? Math.max(5_000, Date.parse(at) - Date.now()) : fallback
      const delays = [
        ...(!isTerminal(state.analysis) ? [remainingDelay(state.analysis.nextAttemptAt, 15_000)] : []),
        ...(state.drive.status !== 'archived' ? [remainingDelay(state.drive.nextAttemptAt, 30_000)] : []),
      ]
      await this.deps.store.finish(lease, { status: complete ? 'completed' : 'retry',
        delayMs: complete ? 0 : Math.min(...delays),
        errorCode: state.drive.errorCode || state.analysis.errorCode,
      })
    } catch (error) {
      const code = processingErrorCode(error, 'PORTAL_PROCESSING_RETRY')
      if (owned && code !== 'LEASE_LOST') {
        const terminal = error instanceof PortalProcessingError && !error.retryable
        // Falhas de integridade não geram leitura da IA nem envio externo.
        if (terminal) {
          await this.deps.store.checkpoint(lease, { processing: { analysis: { status: 'failed', errorCode: code }, drive: { status: 'blocked', errorCode: code } } }).catch(() => undefined)
        }
        await this.deps.store.finish(lease, { status: terminal ? 'failed' : 'retry', delayMs: retryDelay(lease.attempts), errorCode: code }).catch(() => undefined)
      }
      this.logger?.warn({ uploadId: lease.uploadId, code }, 'Portal: processamento aguardando recuperação ou revisão.')
    } finally { clearInterval(heartbeat) }
    return true
  }

  private async analyze(upload: PortalProcessingUpload, buffer: Buffer, state: PortalProcessingState,
    save: (patch?: Record<string, unknown>) => Promise<void>, assertOwned: () => void): Promise<PortalAnalysisState> {
    const identity = portalDocumentIdentity({ uploadId: upload.id, clienteId: upload.clienteId })
    let analysis = state.analysis
    const requestContext = portalRequestFocus(upload, analysis.requestContext)
    analysis = { ...analysis, requestContext: requestContext.request, focusHash: requestContext.focusHash }
    const sessionId = analysis.sessionId || identity.sessionId
    if (sessionId !== identity.sessionId) throw new PortalProcessingError('ALIX_DOCUMENT_SCOPE_MISMATCH', false)
    let doc = await this.deps.intake.get(sessionId, analysis.documentId || identity.documentId)
    if (doc && (doc.clienteId !== upload.clienteId || doc.sessionId !== sessionId || doc.metadata.sha256 !== upload.sha256)) throw new PortalProcessingError('ALIX_DOCUMENT_SCOPE_MISMATCH', false)
    if (!doc || !['completed', 'completed_basic'].includes(String(doc.metadata.processingState))) {
      analysis = { ...analysis, status: 'processing', sessionId, documentId: doc?.id || identity.documentId,
        attempts: (analysis.attempts || 0) + 1, startedAt: analysis.startedAt || new Date().toISOString(), errorCode: undefined }
      state.analysis = analysis; await save()
      assertOwned()
      doc = await this.deps.intake.ingest({ buffer, filename: upload.nomeOriginal, mimetype: upload.mime, sessionId, clienteId: upload.clienteId,
        documentId: doc?.id || identity.documentId, processingMode: 'deep', forceProcess: Boolean(doc) })
      // A deduplicação do intake pode devolver outro ID do MESMO cliente/conteúdo.
      if (doc.clienteId !== upload.clienteId || doc.sessionId !== sessionId || doc.metadata.sha256 !== upload.sha256) throw new PortalProcessingError('ALIX_DOCUMENT_SCOPE_MISMATCH', false)
    }
    analysis = { ...analysis, documentId: doc.id, sessionId, status: 'processing', errorCode: undefined, nextAttemptAt: undefined, updatedAt: new Date().toISOString() }
    state.analysis = analysis
    await save({ alixDocumentId: doc.id, alixSessionId: sessionId, textoExtraidoChars: doc.extractedText.length,
      resumoIa: String(doc.metadata.entitySummary || doc.summary || '').slice(0, 12_000), resumoOrigem: doc.metadata.smartExtraction ? 'openai' : 'fallback' })
    if (!doc.extractedText.trim()) {
      state.analysis = { ...analysis, status: 'needs_review', errorCode: 'ALIX_SOURCE_UNREADABLE', progress: 0 }
      await save(); return state.analysis
    }
    if (!(await this.deps.queue.ready())) throw new PortalProcessingError('ALIX_QUEUE_NOT_READY')
    let pipeline = await this.deps.pipeline.getLatestForDocument(doc.id)
    if (pipeline && (pipeline.clienteId !== upload.clienteId || pipeline.sessionId !== sessionId || pipeline.documentId !== doc.id)) throw new PortalProcessingError('ALIX_PIPELINE_SCOPE_MISMATCH', false)
    if (!analysis.pipelineJob && object(doc.metadata.documentPipelineJob).jobId) analysis.pipelineJob = doc.metadata.documentPipelineJob as EnqueueResult
    let pipelineJob = analysis.pipelineJob ? await this.deps.queue.getJob(analysis.pipelineJob.queue, analysis.pipelineJob.jobId) : null
    if ((!pipeline || ['failed', 'cancelled'].includes(pipeline.status)) && (!pipelineJob || pipelineJob.failed === true || pipelineJob.state === 'cancelled')) {
      if ((analysis.pipelineAttempts || 0) < 3) {
        assertOwned()
        analysis.pipelineJob = await this.deps.queue.enqueueDocumentPipeline({ documentId: doc.id, sessionId, clienteId: upload.clienteId, force: Boolean(pipeline) })
        analysis.pipelineAttempts = (analysis.pipelineAttempts || 0) + 1
        state.analysis = analysis; await save()
        pipelineJob = null
      }
    }
    let deepJob = analysis.deepJob ? await this.deps.queue.getJob(analysis.deepJob.queue, analysis.deepJob.jobId) : null
    if (!deepJob && (analysis.deepAttempts || 0) < 3) {
      assertOwned()
      analysis.deepJob = await this.deps.queue.enqueueDeepAnalysis({ documentId: doc.id, sessionId, focus: requestContext.focus })
      analysis.deepAttempts = (analysis.deepAttempts || 0) + 1
      state.analysis = analysis; await save()
      deepJob = await this.deps.queue.getJob(analysis.deepJob.queue, analysis.deepJob.jobId)
    }
    // Nunca considera o simples enqueue como análise concluída.
    pipeline = await this.deps.pipeline.getLatestForDocument(doc.id)
    const fresh = await this.deps.intake.get(sessionId, doc.id)
    if (fresh && fresh.clienteId === upload.clienteId && fresh.metadata.sha256 === upload.sha256) doc = fresh
    const deep = deepAnalysis(doc, deepJob, requestContext.focusHash, analysis.deepJob?.jobId)
    const requestAssessment = assessPortalRequest(requestContext.request, doc, pipeline)
    const pipelineDone = Boolean(pipeline && ['needs_review', 'awaiting_registration', 'registered'].includes(pipeline.status))
    const pipelineFinished = pipelineDone || Boolean((analysis.pipelineAttempts || 0) >= 3
      && ((!pipeline && (!pipelineJob || pipelineJob.failed)) || (pipeline && ['failed', 'cancelled'].includes(pipeline.status))))
    const deepFinished = Boolean(deepJob?.finished || deepJob?.failed || deepJob?.completed || deepJob?.state === 'cancelled'
      || !deepJob && (analysis.deepAttempts || 0) >= 3)
    const realCoverage = deep?.status === 'llm' && deep.readingCoverage?.complete === true && deepJob?.completed === true
    const needsReview = !realCoverage || !pipelineDone || pipeline?.status === 'needs_review'
      || Boolean(requestAssessment && requestAssessment.status !== 'compatible')
    analysis = { ...analysis, pipelineRunId: pipeline?.id, requestAssessment, progress: realCoverage && pipelineDone ? 100 : Math.min(99, Math.floor((Number(deepJob?.progress || 0) + Number(pipeline?.progress || 0)) / 2)),
      ...(deep?.readingCoverage ? { coverage: { ...deep.readingCoverage } } : {}),
      status: pipelineFinished && deepFinished ? needsReview ? 'needs_review' : 'completed' : 'processing',
      ...(pipelineFinished && deepFinished ? { completedAt: new Date().toISOString(), errorCode: needsReview
        ? requestAssessment?.status === 'mismatch' ? 'ALIX_REQUEST_TYPE_MISMATCH'
          : deep?.status !== 'llm' ? 'ALIX_DEEP_REVIEW_REQUIRED' : !realCoverage ? 'ALIX_READING_INCOMPLETE' : 'ALIX_FINDINGS_REVIEW_REQUIRED' : undefined } : {}),
      updatedAt: new Date().toISOString(),
    }
    state.analysis = analysis
    await save({ ...(deep ? { resumoIa: deep.resumoExecutivo.slice(0, 12_000), resumoOrigem: deep.status === 'llm' ? 'openai' : 'fallback' } : {}),
      ...(pipeline ? { specializedPipeline: { runId: pipeline.id, status: pipeline.status, type: pipeline.specializedType,
        fieldCount: pipeline.fields?.length || 0, findingCount: pipeline.findings?.length || 0, reviewId: pipeline.reviewId } } : {}) })
    return analysis
  }

  /** A rota chamadora exige permissão da equipe sobre clienteId. A fonte é
   * carregada por IDs do upload, nunca por referências fornecidas pelo browser. */
  async getAnalysis(input: PortalProcessingInput) {
    const upload = await this.deps.store.load(input)
    if (!upload) throw new PortalProcessingError('UPLOAD_NOT_FOUND', false)
    const state = processingState(upload.metadata)
    const identity = portalDocumentIdentity(input)
    if (state.analysis.sessionId && state.analysis.sessionId !== identity.sessionId) throw new PortalProcessingError('ALIX_DOCUMENT_SCOPE_MISMATCH', false)
    const doc = state.analysis.documentId ? await this.deps.intake.get(identity.sessionId, state.analysis.documentId) : null
    if (doc && (doc.clienteId !== input.clienteId || doc.sessionId !== identity.sessionId || doc.metadata.sha256 !== upload.sha256)) throw new PortalProcessingError('ALIX_DOCUMENT_SCOPE_MISMATCH', false)
    const pipeline = doc ? await this.deps.pipeline.getLatestForDocument(doc.id) : null
    if (pipeline && (pipeline.clienteId !== input.clienteId || pipeline.sessionId !== identity.sessionId)) throw new PortalProcessingError('ALIX_PIPELINE_SCOPE_MISMATCH', false)
    let deepJob: Job = null
    if (state.analysis.deepJob && await this.deps.queue.ready()) {
      deepJob = await this.deps.queue.getJob(state.analysis.deepJob.queue, state.analysis.deepJob.jobId).catch(() => null)
    }
    const deep = doc ? deepAnalysis(doc, deepJob, state.analysis.focusHash, state.analysis.deepJob?.jobId) : undefined
    const achados = [
      ...(state.analysis.requestAssessment && state.analysis.requestAssessment.status !== 'compatible'
        ? [{ titulo: state.analysis.requestAssessment.status === 'mismatch' ? 'Arquivo incompatível com o pedido' : 'Atendimento ao pedido precisa de conferência',
          descricao: state.analysis.requestAssessment.reason, prioridade: state.analysis.requestAssessment.status === 'mismatch' ? 'high' : 'warning' }] : []),
      ...(pipeline?.findings || []).map(f => ({ titulo: f.title, descricao: f.description, prioridade: f.severity })),
      ...(deep?.lacunas || []).map(description => ({ titulo: 'Informação pendente', descricao: description, prioridade: 'warning' })),
      ...(deep?.riscos || []).map(description => ({ titulo: 'Ponto de atenção', descricao: description, prioridade: 'high' })),
    ]
    const campos = (pipeline?.fields || []).map(field => ({ rotulo: field.fieldKey.replace(/_/g, ' '), valor: field.valueText, status: field.status, fonte: field.evidenceText?.slice(0, 800) }))
    return { uploadId: upload.id, clienteId: upload.clienteId, status: state.analysis.status,
      resumo: deep?.resumoExecutivo || String(upload.metadata.resumoIa || ''),
      achados: achados.slice(0, 100), campos: campos.slice(0, 200), totais: { achados: achados.length, campos: campos.length },
      cobertura: deep?.readingCoverage || state.analysis.coverage || null, processing: state,
      document: doc ? { id: doc.id, sessionId: doc.sessionId, filename: doc.filename, kind: doc.kind, pageCount: doc.pageCount, evidenceCount: doc.evidences?.length || 0 } : null,
      pipeline: pipeline ? { ...pipeline, error: pipeline.error ? 'A esteira precisa de nova tentativa ou revisão da equipe.' : undefined,
        stageHistory: pipeline.stageHistory?.map(stage => stage.status === 'failed'
          ? { ...stage, detail: 'Etapa interrompida; consulte o status de processamento.' } : stage) } : null,
      deepAnalysis: deep || null,
    }
  }
}

let singleton: PortalDocumentProcessor | undefined
export function getPortalDocumentProcessor(): PortalDocumentProcessor { return singleton ??= new PortalDocumentProcessor() }
