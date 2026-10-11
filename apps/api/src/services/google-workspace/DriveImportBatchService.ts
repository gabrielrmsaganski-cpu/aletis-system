import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import { getPool, isPgEnabled } from '../../db/client.js'
import { AlixService } from '../AlixService.js'
import { DataSourceManager } from '../DataSourceManager.js'
import { getDocumentIntakeService, type DocumentIntakeService } from '../alix/intake/DocumentIntakeService.js'
import { readDriveFileForImport } from './DriveImportReader.js'
import type { GoogleWorkspaceActor } from './schemas.js'
import { driveImportDocumentId, driveImportSessionId } from './DriveSourceIdentity.js'

const resultSchema = z.object({
  fileId: z.string(), documentId: z.string(), state: z.enum(['pending', 'reading', 'imported', 'failed']),
  imported: z.boolean(), name: z.string().optional(), reason: z.string().optional(),
  sessionId: z.string().optional(), processingState: z.string().optional(), needsReview: z.boolean().optional(),
  reused: z.boolean().optional(), sourceRevision: z.string().nullable().optional(),
})
const receiptSchema = z.object({
  id: z.string().uuid(), requestId: z.string().uuid(), clientId: z.string(), userId: z.string(), tenantId: z.string(),
  status: z.enum(['pending', 'running', 'paused', 'partial', 'completed']),
  sessionId: z.string().optional(), executionDeadlineAt: z.string().optional(),
  results: z.array(resultSchema), createdAt: z.string(), updatedAt: z.string(),
})
export type DriveImportReceipt = z.infer<typeof receiptSchema>
type BatchInput = { actor: GoogleWorkspaceActor; clientId: string; clientName: string; requestId: string; fileIds: string[]; signal?: AbortSignal }
type Intake = Pick<DocumentIntakeService, 'enqueue' | 'get'>

export class DriveImportBatchError extends Error {
  constructor(message: string, public readonly statusCode = 409) { super(message) }
}

/** Execução síncrona limitada; recibo e checkpoints são duráveis, retomada é explícita. */
export class DriveImportBatchService {
  private sessionService?: AlixService
  constructor(private readonly dependencies?: {
    pool: Pool; intake: Intake; read: typeof readDriveFileForImport;
    ensureSession: (id: string, title: string, owner: string, clientId: string) => Promise<{ id: string }>;
    deadlineMs?: number;
  }) {}

  private pool(): Pool {
    if (this.dependencies) return this.dependencies.pool
    if (!isPgEnabled()) throw new DriveImportBatchError('A importação retomável requer PostgreSQL disponível.', 503)
    return getPool()
  }
  private intake(): Intake { return this.dependencies?.intake || getDocumentIntakeService() }
  private lockKey(actor: GoogleWorkspaceActor, clientId: string) {
    // Seleções diferentes do mesmo cliente também compartilham documentos e não podem duplicar o intake.
    return JSON.stringify([actor.tenantId, actor.userId, clientId])
  }
  private project(receipt: DriveImportReceipt) {
    const imported = receipt.results.filter(result => result.imported).length
    const failed = receipt.results.filter(result => result.state === 'failed').length
    const status = receipt.status === 'running' && receipt.executionDeadlineAt && Date.parse(receipt.executionDeadlineAt) < Date.now() ? 'paused' as const : receipt.status
    return { ...receipt, status, meta: { requested: receipt.results.length, imported, failed, remaining: receipt.results.length - imported, reused: receipt.results.filter(result => result.reused).length, pendingReview: receipt.results.filter(result => result.imported && result.needsReview).length } }
  }
  private async save(client: PoolClient, receipt: DriveImportReceipt) {
    receipt.updatedAt = new Date().toISOString()
    const validated = receiptSchema.parse(receipt)
    await client.query('update google_drive_import_batch set payload=$2::jsonb, updated_at=now() where id=$1', [receipt.id, JSON.stringify(validated)])
  }
  private async ensureSession(id: string, input: BatchInput) {
    if (this.dependencies) return this.dependencies.ensureSession(id, `Drive · ${input.clientName}`, input.actor.userId, input.clientId)
    const service = this.sessionService ??= new AlixService(DataSourceManager.getInstance(), join(process.cwd(), 'storage', 'alix-sessions'))
    return service.ensureSession(id, `Drive · ${input.clientName}`, input.actor.userId, input.clientId)
  }

  private async currentReceipt(receipt: DriveImportReceipt) {
    // Projeta o processamento atual sem sobrescrever um lote que esteja executando.
    if (receipt.sessionId) for (const file of receipt.results.filter(result => result.imported)) {
      const doc = await this.intake().get(receipt.sessionId, file.documentId)
      if (doc) {
        file.processingState = String(doc.metadata.processingState || 'queued')
        file.needsReview = (doc.metadata.clientScopeReview as { status?: string } | undefined)?.status !== 'verified'
      }
    }
    return this.project(receipt)
  }

  async get(actor: GoogleWorkspaceActor, clientId: string, requestId: string) {
    const result = await this.pool().query('select payload from google_drive_import_batch where tenant_id=$1 and user_id=$2 and cliente_id=$3 and request_key=$4', [actor.tenantId, actor.userId, clientId, requestId])
    return result.rows[0] ? this.currentReceipt(receiptSchema.parse(result.rows[0].payload)) : null
  }

  async list(actor: GoogleWorkspaceActor, clientId: string) {
    const result = await this.pool().query('select payload from google_drive_import_batch where tenant_id=$1 and user_id=$2 and cliente_id=$3 order by created_at desc limit 10', [actor.tenantId, actor.userId, clientId])
    const receipts = []
    for (const row of result.rows) receipts.push(await this.currentReceipt(receiptSchema.parse(row.payload)))
    return receipts
  }

  async run(input: BatchInput) {
    const deadlineMs = this.dependencies?.deadlineMs ?? 85_000
    const executionDeadlineAt = new Date(Date.now() + deadlineMs).toISOString()
    const timeout = AbortSignal.timeout(deadlineMs)
    const connectionController = new AbortController()
    const signal = AbortSignal.any([timeout, connectionController.signal, ...(input.signal ? [input.signal] : [])])
    signal.throwIfAborted()
    const fileIds = [...new Set(input.fileIds)].sort()
    const hash = createHash('sha256').update(JSON.stringify(fileIds)).digest('hex')
    const now = new Date().toISOString()
    const initial: DriveImportReceipt = {
      id: randomUUID(), requestId: input.requestId, clientId: input.clientId, userId: input.actor.userId, tenantId: input.actor.tenantId,
      status: 'pending', createdAt: now, updatedAt: now,
      results: fileIds.map(fileId => ({ fileId, documentId: randomUUID(), state: 'pending', imported: false })),
    }
    const pool = this.pool()
    const client = await new Promise<PoolClient>((resolve, reject) => {
      const abort = () => reject(new DriveImportBatchError('Aguarde e retome este lote. O limite de execução foi atingido.', 503))
      signal.addEventListener('abort', abort, { once: true })
      pool.connect().then(connection => {
        signal.removeEventListener('abort', abort)
        if (signal.aborted) { connection.release(); abort() } else resolve(connection)
      }, error => { signal.removeEventListener('abort', abort); reject(error) })
    })
    let connectionError: Error | undefined
    const disconnected = (error?: Error) => {
      connectionError = error || new Error('A conexão do recibo foi interrompida.')
      connectionController.abort(connectionError)
    }
    client.on('error', disconnected)
    client.on('end', disconnected)
    const lockKey = this.lockKey(input.actor, input.clientId)
    let locked = false
    try {
      await client.query('insert into google_drive_import_batch (id, tenant_id, user_id, cliente_id, request_key, request_hash, payload) values($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict (tenant_id,user_id,cliente_id,request_key) do nothing', [initial.id, input.actor.tenantId, input.actor.userId, input.clientId, input.requestId, hash, JSON.stringify(receiptSchema.parse(initial))])
      locked = Boolean((await client.query('select pg_try_advisory_lock(hashtextextended($1,0)) as locked', [lockKey])).rows[0]?.locked)
      const stored = await client.query('select payload, request_hash from google_drive_import_batch where tenant_id=$1 and user_id=$2 and cliente_id=$3 and request_key=$4', [input.actor.tenantId, input.actor.userId, input.clientId, input.requestId])
      if (!stored.rows[0] || stored.rows[0].request_hash !== hash) throw new DriveImportBatchError('Esta chave já pertence a outro conjunto de arquivos. Retome o lote original ou inicie outro.')
      const receipt = receiptSchema.parse(stored.rows[0].payload)
      if (!locked || receipt.status === 'completed') return this.project(receipt)
      signal.throwIfAborted()
      if (!receipt.sessionId) {
        // Persiste o identificador antes do efeito; restart não cria sessão vazia extra.
        receipt.sessionId = driveImportSessionId(input.actor, input.clientId)
        await this.save(client, receipt)
      }
      await this.ensureSession(receipt.sessionId, input)
      signal.throwIfAborted()
      receipt.status = 'running'
      receipt.executionDeadlineAt = executionDeadlineAt
      await this.save(client, receipt)
      const sessionId = receipt.sessionId
      const pending = receipt.results.filter(file => !file.imported)
      let cursor = 0
      const workers = await Promise.allSettled(Array.from({ length: Math.min(2, pending.length) }, async () => {
        while (cursor < pending.length && !signal.aborted) {
          const file = pending[cursor++]
          try {
            // Recupera o intervalo entre intake durável e checkpoint do recibo.
            const recovered = await this.intake().get(sessionId, file.documentId)
            if (recovered) {
              const source = recovered.metadata.source as { fileId?: string } | undefined
              const review = recovered.metadata.clientScopeReview as { requestedBy?: string; requestedClienteId?: string; status?: string } | undefined
              if (source?.fileId !== file.fileId || recovered.sessionId !== sessionId || review?.requestedBy !== input.actor.userId || review.requestedClienteId !== input.clientId) throw new Error('O recibo não corresponde ao arquivo e responsável armazenados. Solicite revisão técnica.')
              Object.assign(file, { imported: true, state: 'imported', name: recovered.filename, sessionId, processingState: String(recovered.metadata.processingState || 'queued'), needsReview: review.status !== 'verified', reason: undefined })
              await this.save(client, receipt)
              continue
            }
            file.state = 'reading'
            file.reason = undefined
            await this.save(client, receipt)
            const read = await (this.dependencies?.read || readDriveFileForImport)({ actor: input.actor, clientId: input.clientId, fileId: file.fileId, signal })
            signal.throwIfAborted()
            file.documentId = driveImportDocumentId({ actor: input.actor, clientId: input.clientId, sessionId, source: read.source, buffer: read.buffer })
            file.sourceRevision = read.source.revisionKey || null
            // O ID determinístico é salvo antes do intake; recuperação também funciona depois de um restart.
            await this.save(client, receipt)
            const previous = await this.intake().get(sessionId, file.documentId)
            if (previous) {
              const source = previous.metadata.source as { fileId?: string } | undefined
              const review = previous.metadata.clientScopeReview as { requestedBy?: string; requestedClienteId?: string; status?: string } | undefined
              if (source?.fileId !== file.fileId || previous.sessionId !== sessionId || review?.requestedBy !== input.actor.userId || review.requestedClienteId !== input.clientId || previous.metadata.sha256 !== createHash('sha256').update(read.buffer).digest('hex')) throw new Error('O documento existente pertence a outro conteúdo ou escopo. Solicite revisão técnica.')
              Object.assign(file, { imported: true, reused: true, state: 'imported', name: previous.filename, sessionId, processingState: String(previous.metadata.processingState || 'queued'), needsReview: review.status !== 'verified', reason: undefined })
              await this.save(client, receipt)
              continue
            }
            const doc = await this.intake().enqueue({ buffer: read.buffer, filename: read.filename, mimetype: read.mimetype, sessionId, source: read.source, processingMode: 'fast', documentId: file.documentId }, { requestedBy: input.actor.userId, requestedClienteId: input.clientId })
            Object.assign(file, { documentId: doc.id, imported: true, state: 'imported', name: read.file.name, sessionId, processingState: String(doc.metadata.processingState || 'queued'), needsReview: true, reason: undefined })
            await this.save(client, receipt)
          } catch (error) {
            // O estado importado nunca regride por falha posterior de checkpoint.
            if (file.imported) throw error
            file.state = signal.aborted ? 'pending' : 'failed'
            file.reason = signal.aborted ? 'Leitura interrompida. Retome este lote para continuar.' : String((error as Error).message || 'Falha de leitura.').slice(0, 400)
            await this.save(client, receipt)
          }
        }
      }))
      const failedWorker = workers.find((worker): worker is PromiseRejectedResult => worker.status === 'rejected')
      if (failedWorker) throw failedWorker.reason
      receipt.status = receipt.results.every(file => file.imported) ? 'completed' : signal.aborted ? 'paused' : 'partial'
      receipt.executionDeadlineAt = undefined
      await this.save(client, receipt)
      return this.project(receipt)
    } finally {
      let unlockError: Error | undefined
      if (locked && !connectionError) await client.query('select pg_advisory_unlock(hashtextextended($1,0))', [lockKey]).catch(error => { unlockError = error as Error })
      client.off('error', disconnected)
      client.off('end', disconnected)
      client.release(connectionError || unlockError)
    }
  }
}

let singleton: DriveImportBatchService | undefined
export function getDriveImportBatchService() { return singleton ??= new DriveImportBatchService() }
