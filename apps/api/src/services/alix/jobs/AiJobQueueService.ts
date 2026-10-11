import { createHash, randomUUID } from 'node:crypto'
import { PgBoss, type JobWithMetadata, type QueueResult } from 'pg-boss'

import { getPool, isPgEnabled } from '../../../db/client.js'
import { ingestFactsFromAlixDocument, ingestFactsFromCrmClient } from '../knowledge/FactLedgerService.js'
import { indexAlixDocument, indexCoreDocument, type KnowledgeSourceKind } from '../knowledge/RagKnowledgeService.js'
import { deepAnalysisBudget, runDocumentDeepAnalysis, type DeepAnalysisJobContext, type DeepAnalysisJobResult } from './DocumentDeepAnalysisRunner.js'
import { buildDocumentReadingPlan } from '../intake/DocumentReadingPlan.js'
import { getDocumentIntakeService } from '../intake/DocumentIntakeService.js'
import { getModelForRole } from '../../llm/LLMConfig.js'
import type { IngestedDocument } from '../intake/types.js'
import { runSpecializedDocumentPipeline, type DocumentPipelineRunView } from '../intake/DocumentPipelineService.js'
import { runDossierRefresh, type DossierRefreshInput } from '../governance/DossierRefreshRunner.js'

export const AI_JOB_QUEUES = {
  ragIndex: 'alix-rag-index-v1',
  factExtract: 'alix-fact-extract-v1',
  deepAnalysis: 'alix-document-deep-analysis-v1',
  driveAnalysis: 'alix-drive-corpus-analysis-v1',
  documentPipeline: 'alix-document-pipeline-v1',
  backfill: 'alix-knowledge-backfill-v1',
  dossierRefresh: 'alix-dossier-refresh-v1',
  deadLetter: 'alix-ai-dead-letter-v1',
} as const

export type AiJobQueueName = typeof AI_JOB_QUEUES[keyof typeof AI_JOB_QUEUES]

type QueueState = 'disabled' | 'stopped' | 'starting' | 'ready' | 'degraded'

type LoggerLike = {
  info: (data: unknown, message?: string) => void
  warn: (data: unknown, message?: string) => void
  error: (data: unknown, message?: string) => void
}

type RagIndexJob = {
  sourceKind: KnowledgeSourceKind
  documentId: string
  force?: boolean
}

type FactExtractJob = (
  | {
      sourceKind: 'alix_document'
      sourceId: string
      revision?: string
    }
  | {
      sourceKind: 'crm_client'
      sourceId: string
    }
  | {
      sourceKind: 'conversation'
      sourceId: string
      clienteId: string
      sessionId: string
      consultorId?: string
      conversationText: string
    }
) & { clienteId?: string }

type DeepAnalysisJob = {
  sessionId: string
  documentId: string
  focus?: string
  execution?: Omit<DeepAnalysisJobContext, 'jobId'>
}

type DocumentPipelineJob = {
  sessionId: string
  documentId: string
  clienteId?: string
  force?: boolean
}

type DriveCorpusAnalysisJob = { analysisId: string; tenantId: string; clienteId: string; pass: number }

type BackfillJob = {
  includeSessionDocuments?: boolean
  force?: boolean
}

type DossierRefreshJob = DossierRefreshInput

export interface EnqueueResult {
  queue: AiJobQueueName
  jobId: string
  statusUrl: string
}

const queueNames = new Set<string>(Object.values(AI_JOB_QUEUES))

function safeKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 48)
}

function deepAnalysisKey(input: DeepAnalysisJob, sourceHash: string, model: string): string {
  return safeKey(JSON.stringify([input.sessionId, input.documentId, input.focus?.trim() || '', sourceHash, model]))
}

function continuationId(rootJobId: string, pass: number): string {
  const hex = createHash('sha256').update(`alix-deep-continuation:${rootJobId}:${pass}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function cleanError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000)
}

export class AiJobQueueService {
  private boss: PgBoss | null = null
  private state: QueueState = 'stopped'
  private lastError: string | null = null
  private startedAt: string | null = null
  private logger: LoggerLike | null = null
  private driveDispatchTimer: ReturnType<typeof setInterval> | null = null
  private driveDispatching = false

  enabled(): boolean {
    return isPgEnabled()
      && Boolean(process.env.DATABASE_URL)
      && (process.env.ALETIS_AI_QUEUE_ENABLED ?? 'true').toLowerCase() !== 'false'
  }

  ready(): boolean {
    return this.state === 'ready' && Boolean(this.boss)
  }

  async start(logger?: LoggerLike): Promise<void> {
    if (this.ready() || this.state === 'starting') return
    this.logger = logger || null
    if (!this.enabled()) {
      this.state = 'disabled'
      return
    }

    this.state = 'starting'
    this.lastError = null
    const boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: process.env.ALETIS_AI_QUEUE_SCHEMA || 'pgboss',
      application_name: 'aletis-ai-jobs',
      max: Math.max(2, Number(process.env.ALETIS_AI_QUEUE_POOL_MAX || 4)),
      useListenNotify: true,
      supervise: true,
      migrate: true,
      createSchema: true,
      monitorIntervalSeconds: 30,
      superviseIntervalSeconds: 30,
      persistWarnings: true,
      warningRetentionDays: 30,
    })
    boss.on('error', (error) => {
      this.lastError = cleanError(error)
      this.state = 'degraded'
      this.logger?.error({ err: error }, '[ALIX Queue] erro do pg-boss')
    })
    boss.on('warning', (warning) => {
      this.logger?.warn({ warning }, '[ALIX Queue] aviso do pg-boss')
    })

    try {
      await boss.start()
      this.boss = boss
      await this.configureQueues()
      await this.registerWorkers()
      this.state = 'ready'
      this.startedAt = new Date().toISOString()
      this.driveDispatchTimer = setInterval(() => { void this.dispatchDriveAnalyses() }, 30_000)
      this.driveDispatchTimer.unref()
      this.logger?.info({ queues: Object.values(AI_JOB_QUEUES) }, '[ALIX Queue] fila durável iniciada')
    } catch (error) {
      this.lastError = cleanError(error)
      this.state = 'degraded'
      this.boss = boss
      await boss.stop({ graceful: false, close: true }).catch(() => undefined)
      this.boss = null
      throw error
    }
  }

  async stop(): Promise<void> {
    if (this.driveDispatchTimer) clearInterval(this.driveDispatchTimer)
    this.driveDispatchTimer = null
    const boss = this.boss
    this.boss = null
    if (boss) await boss.stop({ graceful: true, close: true, timeout: 30_000 })
    this.state = this.enabled() ? 'stopped' : 'disabled'
  }

  private async dispatchDriveAnalyses(): Promise<void> {
    if (!this.ready() || this.driveDispatching) return
    this.driveDispatching = true
    try {
      const { dispatchDriveCorpusAnalyses } = await import('../intake/DriveCorpusAnalysisService.js')
      await dispatchDriveCorpusAnalyses(input => this.enqueueDriveCorpusAnalysis(input))
    } catch {
      this.logger?.warn({ code: 'DRIVE_ANALYSIS_DISPATCH_FAILED' }, '[ALIX Queue] despacho do acervo aguardará nova tentativa')
    } finally { this.driveDispatching = false }
  }

  private requireBoss(): PgBoss {
    if (!this.boss || !this.ready()) throw new Error('Fila de IA ainda não está pronta')
    return this.boss
  }

  private async configureQueues(): Promise<void> {
    const boss = this.boss as PgBoss
    await boss.createQueue(AI_JOB_QUEUES.deadLetter, {
      policy: 'standard',
      retentionSeconds: 2_592_000,
      deleteAfterSeconds: 2_592_000,
      warningQueueSize: 25,
    })
    await boss.createQueue(AI_JOB_QUEUES.ragIndex, {
      policy: 'standard',
      retryLimit: 4,
      retryDelay: 3,
      retryBackoff: true,
      retryDelayMax: 300,
      expireInSeconds: 900,
      retentionSeconds: 1_209_600,
      deleteAfterSeconds: 604_800,
      deadLetter: AI_JOB_QUEUES.deadLetter,
      warningQueueSize: 100,
      notify: true,
    })
    await boss.createQueue(AI_JOB_QUEUES.factExtract, {
      policy: 'standard',
      retryLimit: 3,
      retryDelay: 2,
      retryBackoff: true,
      retryDelayMax: 120,
      expireInSeconds: 300,
      retentionSeconds: 1_209_600,
      deleteAfterSeconds: 604_800,
      deadLetter: AI_JOB_QUEUES.deadLetter,
      warningQueueSize: 150,
      notify: true,
    })
    await boss.createQueue(AI_JOB_QUEUES.deepAnalysis, {
      policy: 'standard',
      retryLimit: 2,
      retryDelay: 5,
      retryBackoff: true,
      retryDelayMax: 180,
      expireInSeconds: 900,
      retentionSeconds: 1_209_600,
      deleteAfterSeconds: 604_800,
      deadLetter: AI_JOB_QUEUES.deadLetter,
      warningQueueSize: 30,
      notify: true,
    })
    await boss.createQueue(AI_JOB_QUEUES.driveAnalysis, {
      policy: 'standard', retryLimit: 2, retryDelay: 10, retryBackoff: true, retryDelayMax: 180,
      expireInSeconds: 600, retentionSeconds: 1_209_600, deleteAfterSeconds: 604_800,
      deadLetter: AI_JOB_QUEUES.deadLetter, warningQueueSize: 100, notify: true,
    })
    await boss.createQueue(AI_JOB_QUEUES.documentPipeline, {
      policy: 'standard',
      retryLimit: 3,
      retryDelay: 5,
      retryBackoff: true,
      retryDelayMax: 300,
      expireInSeconds: 1_800,
      retentionSeconds: 1_209_600,
      deleteAfterSeconds: 604_800,
      deadLetter: AI_JOB_QUEUES.deadLetter,
      warningQueueSize: 50,
      notify: true,
    })
    await boss.createQueue(AI_JOB_QUEUES.backfill, {
      policy: 'exclusive',
      retryLimit: 2,
      retryDelay: 10,
      retryBackoff: true,
      expireInSeconds: 600,
      retentionSeconds: 604_800,
      deleteAfterSeconds: 259_200,
      deadLetter: AI_JOB_QUEUES.deadLetter,
      notify: true,
    })
    await boss.createQueue(AI_JOB_QUEUES.dossierRefresh, {
      policy: 'standard',
      retryLimit: 2,
      retryDelay: 20,
      retryBackoff: true,
      retryDelayMax: 300,
      expireInSeconds: 1_800,
      retentionSeconds: 1_209_600,
      deleteAfterSeconds: 604_800,
      deadLetter: AI_JOB_QUEUES.deadLetter,
      warningQueueSize: 30,
      notify: true,
    })
  }

  private async registerWorkers(): Promise<void> {
    const boss = this.boss as PgBoss
    await boss.work<RagIndexJob, object>(AI_JOB_QUEUES.ragIndex, {
      includeMetadata: true,
      localConcurrency: Math.max(1, Number(process.env.ALIX_RAG_WORKER_CONCURRENCY || 1)),
      pollingIntervalSeconds: 1,
      notifyPollingIntervalSeconds: 20,
    }, async (jobs) => {
      const job = jobs[0] as JobWithMetadata<RagIndexJob>
      if (!job) return {}
      if (job.data.sourceKind === 'core_document') {
        return indexCoreDocument(job.data.documentId, { jobId: job.id, force: job.data.force })
      }
      return indexAlixDocument(job.data.documentId, { jobId: job.id, force: job.data.force })
    })

    await boss.work<FactExtractJob, object>(AI_JOB_QUEUES.factExtract, {
      includeMetadata: true,
      localConcurrency: Math.max(1, Number(process.env.ALIX_FACT_WORKER_CONCURRENCY || 2)),
      pollingIntervalSeconds: 1,
      notifyPollingIntervalSeconds: 20,
    }, async (jobs) => {
      const job = jobs[0] as JobWithMetadata<FactExtractJob>
      if (!job) return {}
      let result: Record<string, unknown>
      if (job.data.sourceKind === 'crm_client') {
        result = await ingestFactsFromCrmClient(job.data.sourceId)
      } else if (job.data.sourceKind === 'alix_document') {
        result = await ingestFactsFromAlixDocument(job.data.sourceId)
      } else {
        const { extractFactsFromConversation } = await import('../memory/AlixMemoryFactExtractor.js')
        const facts = await extractFactsFromConversation(job.data.conversationText, {
          clienteId: job.data.clienteId,
          consultorId: job.data.consultorId,
          sessionId: job.data.sessionId,
          sourceId: job.data.sourceId,
        })
        result = { extracted: facts.length }
      }
      // O próprio Livro de Fatos agenda o refresh apenas quando cria uma
      // versão nova. Reprocessamentos idempotentes não versionam dossiês.
      return result
    })

    await boss.work<DeepAnalysisJob, DeepAnalysisJobResult>(AI_JOB_QUEUES.deepAnalysis, {
      includeMetadata: true,
      localConcurrency: Math.max(1, Number(process.env.ALIX_DEEP_ANALYSIS_CONCURRENCY || 1)),
      pollingIntervalSeconds: 1,
      notifyPollingIntervalSeconds: 20,
    }, async (jobs) => {
      const job = jobs[0] as JobWithMetadata<DeepAnalysisJob>
      if (!job) throw new Error('Job de análise profunda ausente')
      let execution = job.data.execution
      if (!execution) {
        // Compatibilidade com jobs persistidos antes da adoção das continuações.
        const doc = await getDocumentIntakeService().get(job.data.sessionId, job.data.documentId)
        if (!doc) throw new Error('Documento não encontrado.')
        execution = { rootJobId: job.id, pass: 0, sourceHash: buildDocumentReadingPlan(doc).sourceHash, model: getModelForRole('doc_analyzer'), ...deepAnalysisBudget() }
      }
      const result = await runDocumentDeepAnalysis({ ...job.data, autoContinue: true, job: { ...execution, jobId: job.id } })
      if (result.processing.status !== 'continuation_required' || !result.continuationRequired) return result
      const currentJob = await boss.getJobById<DeepAnalysisJob>(AI_JOB_QUEUES.deepAnalysis, job.id)
      if (job.signal?.aborted || currentJob?.state === 'cancelled') return result
      const pass = result.processing.nextPass
      if (!Number.isInteger(pass) || pass! <= execution.pass || pass! > 64) throw new Error('Checkpoint sem próxima passagem válida.')
      const nextJobId = continuationId(execution.rootJobId, pass!)
      const nextExecution = { ...execution, pass: pass! }
      const sent = await boss.send(AI_JOB_QUEUES.deepAnalysis, { ...job.data, execution: nextExecution }, {
        id: nextJobId, singletonKey: deepAnalysisKey(job.data, execution.sourceHash, execution.model),
        group: { id: job.data.sessionId }, priority: 9, startAfter: 2,
      })
      if (!sent) {
        const existing = await boss.getJobById<DeepAnalysisJob>(AI_JOB_QUEUES.deepAnalysis, nextJobId)
        if (!existing || existing.data.execution?.rootJobId !== execution.rootJobId || existing.data.execution.pass !== pass) {
          throw new Error('Não foi possível confirmar a persistência da continuação documental.')
        }
      }
      // Só retorna sucesso da passagem depois de confirmar que a continuação existe na fila durável.
      return { ...result, processing: { ...result.processing, continuationJobId: nextJobId,
        continuationStatusUrl: `/api/alix/jobs/${AI_JOB_QUEUES.deepAnalysis}/${nextJobId}` } }
    })

    await boss.work<DocumentPipelineJob, DocumentPipelineRunView>(AI_JOB_QUEUES.documentPipeline, {
      includeMetadata: true,
      localConcurrency: Math.max(1, Number(process.env.ALIX_DOCUMENT_PIPELINE_CONCURRENCY || 1)),
      pollingIntervalSeconds: 1,
      notifyPollingIntervalSeconds: 20,
    }, async (jobs) => {
      const job = jobs[0] as JobWithMetadata<DocumentPipelineJob>
      if (!job) throw new Error('Job da esteira documental ausente')
      return runSpecializedDocumentPipeline({
        sessionId: job.data.sessionId,
        documentId: job.data.documentId,
        jobId: job.id,
        force: job.data.force,
      })
    })

    await boss.work<DriveCorpusAnalysisJob, object>(AI_JOB_QUEUES.driveAnalysis, {
      includeMetadata: true, localConcurrency: 1, pollingIntervalSeconds: 2, notifyPollingIntervalSeconds: 30,
    }, async (jobs) => {
      const job = jobs[0] as JobWithMetadata<DriveCorpusAnalysisJob>
      if (!job) throw new Error('Job da análise do acervo ausente')
      const { runDriveCorpusAnalysis } = await import('../intake/DriveCorpusAnalysisService.js')
      return runDriveCorpusAnalysis({ ...job.data, jobId: job.id })
    })

    await boss.work<BackfillJob, object>(AI_JOB_QUEUES.backfill, {
      includeMetadata: true,
      localConcurrency: 1,
      pollingIntervalSeconds: 2,
      notifyPollingIntervalSeconds: 30,
    }, async (jobs) => {
      const job = jobs[0] as JobWithMetadata<BackfillJob>
      if (!job) return {}
      return this.enqueueBackfillChildren(job.data)
    })

    await boss.work<DossierRefreshJob, object>(AI_JOB_QUEUES.dossierRefresh, {
      includeMetadata: true,
      localConcurrency: Math.max(1, Number(process.env.ALIX_DOSSIER_REFRESH_CONCURRENCY || 1)),
      pollingIntervalSeconds: 2,
      notifyPollingIntervalSeconds: 30,
    }, async (jobs) => {
      const job = jobs[0] as JobWithMetadata<DossierRefreshJob>
      if (!job) return {}
      return runDossierRefresh(job.data)
    })
  }

  private async send(queue: AiJobQueueName, data: object, options: {
    singletonKey?: string
    singletonSeconds?: number
    priority?: number
    groupId?: string
  } = {}): Promise<EnqueueResult> {
    const boss = this.requireBoss()
    const jobId = await boss.send(queue, data, {
      ...(options.singletonKey ? { singletonKey: options.singletonKey } : {}),
      ...(options.singletonSeconds ? { singletonSeconds: options.singletonSeconds } : {}),
      ...(Number.isFinite(options.priority) ? { priority: options.priority } : {}),
      ...(options.groupId ? { group: { id: options.groupId } } : {}),
    })
    if (!jobId) throw new Error(`Job não foi enfileirado em ${queue}; já existe trabalho equivalente em andamento`)
    return { queue, jobId, statusUrl: `/api/alix/jobs/${encodeURIComponent(queue)}/${encodeURIComponent(jobId)}` }
  }

  async enqueueRagIndex(input: RagIndexJob & { clienteId?: string }): Promise<EnqueueResult> {
    return this.send(AI_JOB_QUEUES.ragIndex, input, {
      singletonKey: safeKey(`${input.sourceKind}:${input.documentId}:${input.force ? 'force' : 'normal'}`),
      singletonSeconds: 30,
      groupId: input.clienteId || input.documentId,
      priority: input.force ? 10 : 0,
    })
  }

  async enqueueFactExtraction(input: FactExtractJob & { clienteId?: string }): Promise<EnqueueResult> {
    return this.send(AI_JOB_QUEUES.factExtract, input, {
      singletonKey: safeKey(`${input.sourceKind}:${input.sourceId}:${'revision' in input ? input.revision || 'base' : 'base'}`),
      singletonSeconds: 30,
      groupId: input.clienteId || input.sourceId,
    })
  }

  async enqueueConversationFacts(input: {
    sourceId: string
    clienteId: string
    sessionId: string
    consultorId?: string
    conversationText: string
  }): Promise<EnqueueResult> {
    return this.enqueueFactExtraction({
      sourceKind: 'conversation',
      sourceId: input.sourceId,
      clienteId: input.clienteId,
      sessionId: input.sessionId,
      consultorId: input.consultorId,
      conversationText: input.conversationText.slice(0, 4_000),
    })
  }

  async enqueueDocumentKnowledge(input: { documentId: string; clienteId?: string; force?: boolean }): Promise<EnqueueResult[]> {
    const jobs = [await this.enqueueRagIndex({
      sourceKind: 'alix_document',
      documentId: input.documentId,
      clienteId: input.clienteId,
      force: input.force,
    })]
    if (input.clienteId) {
      jobs.push(await this.enqueueFactExtraction({
        sourceKind: 'alix_document',
        sourceId: input.documentId,
        clienteId: input.clienteId,
      }))
    }
    return jobs
  }

  async enqueueDeepAnalysis(input: DeepAnalysisJob): Promise<EnqueueResult> {
    const boss = this.requireBoss()
    const client = await getPool().connect()
    try {
      await client.query('BEGIN')
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`alix-deep-enqueue:${JSON.stringify([input.sessionId, input.documentId, input.focus?.trim() || ''])}`])
      const current = await client.query('select payload from alix_document where session_id = $1 and id = $2', [input.sessionId, input.documentId])
      const doc = current.rows[0]?.payload as IngestedDocument | undefined
      if (!doc) throw new Error('Documento não encontrado no banco autoritativo.')
      const sourceHash = buildDocumentReadingPlan(doc).sourceHash
      const model = getModelForRole('doc_analyzer')
      const key = deepAnalysisKey(input, sourceHash, model)
      const db = { executeSql: (sql: string, values?: unknown[]) => client.query(sql, values) }
      const existing = (await boss.findJobs<DeepAnalysisJob>(AI_JOB_QUEUES.deepAnalysis, { key, db }))
        .find(job => ['created', 'retry', 'active'].includes(job.state))
      let jobId = existing?.data.execution?.rootJobId || existing?.id
      if (!jobId) {
        jobId = randomUUID()
        const data: DeepAnalysisJob = { sessionId: input.sessionId, documentId: input.documentId, focus: input.focus?.trim() || undefined,
          execution: { rootJobId: jobId, pass: 0, sourceHash, model, ...deepAnalysisBudget() } }
        const sent = await boss.send(AI_JOB_QUEUES.deepAnalysis, data, { id: jobId, singletonKey: key, group: { id: input.sessionId }, priority: 10, db })
        if (!sent) throw new Error('Não foi possível persistir a leitura documental.')
      }
      await client.query('COMMIT')
      return { queue: AI_JOB_QUEUES.deepAnalysis, jobId, statusUrl: `/api/alix/jobs/${AI_JOB_QUEUES.deepAnalysis}/${jobId}` }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  }

  async enqueueDocumentPipeline(input: DocumentPipelineJob): Promise<EnqueueResult> {
    return this.send(AI_JOB_QUEUES.documentPipeline, input, {
      singletonKey: safeKey(`${input.documentId}:${input.force ? 'force' : 'normal'}`),
      singletonSeconds: 30,
      groupId: input.clienteId || input.sessionId,
      priority: input.force ? 8 : 2,
    })
  }

  async enqueueDriveCorpusAnalysis(input: DriveCorpusAnalysisJob): Promise<EnqueueResult> {
    return this.send(AI_JOB_QUEUES.driveAnalysis, input, {
      singletonKey: safeKey(JSON.stringify([input.tenantId, input.analysisId, input.pass])),
      singletonSeconds: 30, groupId: input.clienteId, priority: -5,
    })
  }

  async enqueueBackfill(input: BackfillJob = {}): Promise<EnqueueResult> {
    return this.send(AI_JOB_QUEUES.backfill, input, {
      singletonKey: 'knowledge-backfill',
      singletonSeconds: 60,
      priority: -10,
    })
  }

  async enqueueDossierRefresh(input: DossierRefreshJob): Promise<EnqueueResult> {
    return this.send(AI_JOB_QUEUES.dossierRefresh, input, {
      singletonKey: safeKey(`dossier:${input.clienteId}`),
      singletonSeconds: 300,
      groupId: input.clienteId,
      priority: -2,
    })
  }

  private async enqueueBackfillChildren(input: BackfillJob): Promise<Record<string, number>> {
    const documents = await getPool().query(
      `select id, session_id, cliente_id
       from alix_document
       where coalesce(payload->>'extractedText','') <> ''
         and ($1::boolean or cliente_id is not null)
       order by uploaded_at asc`,
      [Boolean(input.includeSessionDocuments)],
    )
    const clients = await getPool().query(`select id from cliente where (payload->'identityMerge'->>'status') is distinct from 'merged' order by criado_em asc`)
    let ragJobs = 0
    let factJobs = 0
    let pipelineJobs = 0
    for (const row of documents.rows) {
      try {
        await this.enqueueRagIndex({
          sourceKind: 'alix_document',
          documentId: String(row.id),
          clienteId: row.cliente_id ? String(row.cliente_id) : undefined,
          force: input.force,
        })
        ragJobs += 1
      } catch (error) {
        if (!cleanError(error).includes('equivalente')) throw error
      }
      try {
        const sessionId = String(row.session_id || '')
        if (sessionId) {
          await this.enqueueDocumentPipeline({
            sessionId,
            documentId: String(row.id),
            clienteId: row.cliente_id ? String(row.cliente_id) : undefined,
            force: input.force,
          })
          pipelineJobs += 1
        }
      } catch (error) {
        if (!cleanError(error).includes('equivalente')) throw error
      }
      if (row.cliente_id) {
        try {
          await this.enqueueFactExtraction({
            sourceKind: 'alix_document',
            sourceId: String(row.id),
            clienteId: String(row.cliente_id),
          })
          factJobs += 1
        } catch (error) {
          if (!cleanError(error).includes('equivalente')) throw error
        }
      }
    }
    for (const row of clients.rows) {
      try {
        await this.enqueueFactExtraction({
          sourceKind: 'crm_client',
          sourceId: String(row.id),
          clienteId: String(row.id),
        })
        factJobs += 1
      } catch (error) {
        if (!cleanError(error).includes('equivalente')) throw error
      }
    }
    return { sourceDocuments: documents.rowCount || 0, clients: clients.rowCount || 0, ragJobs, factJobs, pipelineJobs }
  }

  async cancelJob(queue: string, jobId: string): Promise<boolean> {
    if (!queueNames.has(queue)) throw new Error('Fila desconhecida')
    const current = queue === AI_JOB_QUEUES.deepAnalysis ? await this.getJob(queue, jobId) : null
    const result = await this.requireBoss().cancel(queue, String(current?.currentJobId || jobId))
    return Boolean(result)
  }

  async resumeJob(queue: string, jobId: string): Promise<boolean> {
    if (!queueNames.has(queue)) throw new Error('Fila desconhecida')
    const current = queue === AI_JOB_QUEUES.deepAnalysis ? await this.getJob(queue, jobId) : null
    const result = await this.requireBoss().resume(queue, String(current?.currentJobId || jobId))
    return Boolean(result)
  }

  async retryJob(queue: string, jobId: string): Promise<boolean> {
    if (!queueNames.has(queue)) throw new Error('Fila desconhecida')
    const current = queue === AI_JOB_QUEUES.deepAnalysis ? await this.getJob(queue, jobId) : null
    const result = await this.requireBoss().retry(queue, String(current?.currentJobId || jobId))
    return Boolean(result)
  }

  async getJob(queue: string, jobId: string): Promise<Record<string, unknown> | null> {
    if (!queueNames.has(queue)) throw new Error('Fila desconhecida')
    if (queue === AI_JOB_QUEUES.driveAnalysis) throw new Error('Fila interna do acervo não expõe trabalhos pela consulta genérica.')
    const job = await this.requireBoss().getJobById(queue, jobId)
    if (!job) return null
    if (queue === AI_JOB_QUEUES.deepAnalysis) {
      const root = job as JobWithMetadata<DeepAnalysisJob>
      let latest = root
      let output = latest.output as DeepAnalysisJobResult | undefined
      const seen = new Set([jobId])
      for (let depth = 0; depth < 64; depth++) {
        const nextId = output?.processing?.continuationJobId
        if (!nextId || latest.state !== 'completed') break
        if (seen.has(nextId)) throw new Error('Ciclo inválido na continuação documental.')
        const child = await this.requireBoss().getJobById<DeepAnalysisJob>(queue, nextId)
        if (!child || child.data.execution?.rootJobId !== (root.data.execution?.rootJobId || root.id)) break
        seen.add(nextId)
        latest = child
        // Enquanto o próximo trecho está em execução, a cobertura anterior permanece disponível.
        if ((child.output as DeepAnalysisJobResult | undefined)?.analysis) output = child.output as DeepAnalysisJobResult
      }
      const physicalFinished = ['completed', 'failed', 'cancelled'].includes(latest.state)
      const completed = latest.state === 'completed' && output?.analysis?.readingCoverage?.complete === true
      const processingStatus = output?.processing?.status
      const waitingContinuation = latest.state === 'completed' && processingStatus === 'continuation_required'
      const finished = physicalFinished && !waitingContinuation
      const coverage = output?.analysis?.readingCoverage
      const progress = completed ? 100 : coverage?.totalSegments ? Math.min(99, Math.floor(coverage.analyzedSegments / coverage.totalSegments * 100)) : 0
      return {
        id: root.id, queue: root.name, currentJobId: latest.id, state: latest.state === 'completed' && !completed ? processingStatus || 'partial' : latest.state,
        queueState: latest.state, progress, retryCount: latest.retryCount, retryLimit: latest.retryLimit,
        createdOn: root.createdOn, startedOn: root.startedOn, completedOn: finished ? latest.completedOn : null,
        output, failed: latest.state === 'failed', completed, finished,
      }
    }
    return {
      id: job.id,
      queue: job.name,
      state: job.state,
      progress: job.state === 'completed' ? 100 : job.state === 'active' ? 50 : job.state === 'failed' ? 100 : 0,
      retryCount: job.retryCount,
      retryLimit: job.retryLimit,
      createdOn: job.createdOn,
      startedOn: job.startedOn,
      completedOn: job.completedOn,
      output: job.output,
      failed: job.state === 'failed',
      completed: job.state === 'completed',
    }
  }

  async status(): Promise<Record<string, unknown>> {
    let queues: QueueResult[] = []
    if (this.boss && (this.state === 'ready' || this.state === 'degraded')) {
      try {
        queues = await this.boss.getQueues(Object.values(AI_JOB_QUEUES))
      } catch (error) {
        this.lastError = cleanError(error)
      }
    }
    const schema = /^[a-z_][a-z0-9_]*$/i.test(process.env.ALETIS_AI_QUEUE_SCHEMA || '')
      ? String(process.env.ALETIS_AI_QUEUE_SCHEMA)
      : 'pgboss'
    const durableCounts = new Map<string, {
      ready: number
      active: number
      failed: number
      completed: number
      total: number
    }>()
    if (this.boss) {
      try {
        const result = await getPool().query(
          `select name,
             count(*) filter (where state in ('created','retry'))::int as ready,
             count(*) filter (where state = 'active')::int as active,
             count(*) filter (where state = 'failed')::int as failed,
             count(*) filter (where state = 'completed')::int as completed,
             count(*)::int as total
           from "${schema}".job
           where name = any($1::text[])
           group by name`,
          [Object.values(AI_JOB_QUEUES)],
        )
        for (const row of result.rows) {
          durableCounts.set(String(row.name), {
            ready: Number(row.ready || 0),
            active: Number(row.active || 0),
            failed: Number(row.failed || 0),
            completed: Number(row.completed || 0),
            total: Number(row.total || 0),
          })
        }
      } catch (error) {
        this.lastError = cleanError(error)
      }
    }
    const queueByName = new Map(queues.map((queue) => [queue.name, queue]))
    return {
      enabled: this.enabled(),
      state: this.state,
      ready: this.ready(),
      startedAt: this.startedAt,
      lastError: this.lastError,
      queues: Object.values(AI_JOB_QUEUES).map((name) => {
        const durable = durableCounts.get(name)
        const queue = queueByName.get(name)
        return {
          name,
          ready: durable?.ready ?? queue?.readyCount ?? 0,
          active: durable?.active ?? queue?.activeCount ?? 0,
          failed: durable?.failed ?? queue?.failedCount ?? 0,
          completed: durable?.completed ?? 0,
          total: durable?.total ?? queue?.totalCount ?? 0,
        }
      }),
    }
  }
}

let singleton: AiJobQueueService | null = null

export function getAiJobQueueService(): AiJobQueueService {
  if (!singleton) singleton = new AiJobQueueService()
  return singleton
}

export async function enqueueAlixDocumentKnowledge(input: { documentId: string; clienteId?: string; force?: boolean }): Promise<EnqueueResult[]> {
  const queue = getAiJobQueueService()
  if (!queue.ready()) return []
  return queue.enqueueDocumentKnowledge(input)
}
