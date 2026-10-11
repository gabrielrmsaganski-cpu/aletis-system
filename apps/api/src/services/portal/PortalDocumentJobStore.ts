import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Pool } from 'pg'
import { getPool, isPgEnabled } from '../../db/client.js'
import {
  PortalProcessingError, portalProcessingSchema, portalRequestContextSchema,
  type PortalDocumentJobStore, type PortalProcessingInput, type PortalProcessingLease, type PortalProcessingUpload,
} from './PortalDocumentProcessingTypes.js'

const LEASE_MS = 5 * 60_000
const inputSchema = z.object({ uploadId: z.string().min(1).max(180), clienteId: z.string().min(1).max(180) }).strict()
const recordSchema = z.record(z.unknown())

function upload(row: Record<string, unknown>): PortalProcessingUpload {
  return {
    id: String(row.id), clienteId: String(row.cliente_id), nomeOriginal: String(row.nome_original),
    nomeStorage: String(row.nome_storage), mime: String(row.mime), tamanho: Number(row.tamanho),
    sha256: row.sha256 ? String(row.sha256) : null, categoria: row.categoria ? String(row.categoria) : null,
    metadata: recordSchema.parse(row.metadata || {}),
    pendenciaId: row.pendencia_id ? String(row.pendencia_id) : null,
    ...(row.request_context ? { request: portalRequestContextSchema.parse(row.request_context) } : {}),
  }
}

/** A fila pertence ao mesmo commit do upload. O lease impede que um processo
 * antigo confirme trabalho depois de outro trabalhador ter retomado a tarefa. */
export class PgPortalDocumentJobStore implements PortalDocumentJobStore {
  constructor(private readonly deps: {
    pool: () => Pick<Pool, 'query' | 'connect'>
    enabled: () => boolean
    mirror: (clienteId: string, uploadId: string) => Promise<unknown>
  } = {
    pool: getPool, enabled: isPgEnabled,
    mirror: async (clienteId, id) => {
      const { portalDocumentService } = await import('./PortalDocumentService.js')
      await portalDocumentService.buscarUpload(clienteId, id)
    },
  }) {}

  enabled(): boolean { return this.deps.enabled() }
  private requireEnabled(): void { if (!this.enabled()) throw new PortalProcessingError('POSTGRES_REQUIRED') }

  async enqueue(input: PortalProcessingInput, resetFailed = false, stage: 'analise' | 'drive' | 'todas' = 'todas'): Promise<void> {
    this.requireEnabled()
    const parsed = inputSchema.parse(input)
    const client = await this.deps.pool().connect()
    try {
      await client.query('BEGIN')
      const found = await client.query('select id, metadata from portal_upload where id=$1 and cliente_id=$2 for update', [parsed.uploadId, parsed.clienteId])
      if (!found.rowCount) throw new PortalProcessingError('UPLOAD_NOT_FOUND', false)
      const job = await client.query(`insert into portal_document_processing_job (id,upload_id,cliente_id)
        values ($1,$1,$2) on conflict(upload_id) do update set status=case
          when portal_document_processing_job.status='processing' then 'processing' else 'queued' end,
          available_at=now(), updated_at=now(), last_error=null
        where portal_document_processing_job.cliente_id=excluded.cliente_id
        returning status`, [parsed.uploadId, parsed.clienteId])
      if (!job.rowCount) throw new PortalProcessingError('JOB_SCOPE_MISMATCH', false)
      if (resetFailed && job.rows[0].status !== 'processing') {
        const metadata = recordSchema.parse(found.rows[0].metadata || {})
        const state = portalProcessingSchema.parse(metadata.processing || {})
        if (stage !== 'drive' && ['failed', 'needs_review'].includes(state.analysis.status)) {
          state.analysis = { ...state.analysis, status: 'pending', attempts: 0, pipelineAttempts: 0, deepAttempts: 0, deepJob: undefined, errorCode: undefined, nextAttemptAt: undefined }
        }
        if (stage !== 'analise' && state.drive.status !== 'archived') state.drive = { ...state.drive, status: 'pending', attempts: 0, errorCode: undefined, nextAttemptAt: undefined }
        await client.query('update portal_upload set metadata=$3::jsonb where id=$1 and cliente_id=$2', [parsed.uploadId, parsed.clienteId, JSON.stringify({ ...metadata, processing: state })])
      }
      await client.query('COMMIT')
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error }
    finally { client.release() }
    await this.deps.mirror(parsed.clienteId, parsed.uploadId)
  }

  async claim(): Promise<PortalProcessingLease | null> {
    this.requireEnabled()
    const token = randomUUID()
    const result = await this.deps.pool().query(`with candidate as (
      select j.id from portal_document_processing_job j join portal_upload u on u.id=j.upload_id and u.cliente_id=j.cliente_id
      where ((j.status in ('queued','retry') and j.available_at<=now()) or
        (j.status='processing' and (j.locked_at is null or j.locked_at<now()-($1::bigint*interval '1 millisecond'))))
      order by j.available_at,j.created_at for update of j skip locked limit 1
    ) update portal_document_processing_job j set status='processing',locked_at=now(),lease_token=$2,
      attempts=j.attempts+1,updated_at=now() from candidate c where j.id=c.id
      returning j.upload_id,j.cliente_id,j.attempts`, [LEASE_MS, token])
    const row = result.rows[0]
    return row ? { uploadId: row.upload_id, clienteId: row.cliente_id, token, attempts: Number(row.attempts) } : null
  }

  async heartbeat(lease: PortalProcessingLease): Promise<boolean> {
    const result = await this.deps.pool().query(`update portal_document_processing_job set locked_at=now(),updated_at=now()
      where upload_id=$1 and cliente_id=$2 and lease_token=$3 and status='processing'`, [lease.uploadId, lease.clienteId, lease.token])
    return result.rowCount === 1
  }

  async load(input: PortalProcessingInput): Promise<PortalProcessingUpload | null> {
    this.requireEnabled()
    const parsed = inputSchema.parse(input)
    const result = await this.deps.pool().query(`select u.*, case when p.id is not null then jsonb_build_object(
      'id',p.id,'clienteId',p.cliente_id,'titulo',p.titulo,'descricao',p.descricao,'tipoDocumento',p.tipo_documento,'categoria',p.categoria) end request_context
      from portal_upload u left join portal_documento_pendente p on p.id=u.pendencia_id and p.cliente_id=u.cliente_id
      where u.id=$1 and u.cliente_id=$2`, [parsed.uploadId, parsed.clienteId])
    if (!result.rows[0]) return null
    if (result.rows[0].pendencia_id && !result.rows[0].request_context) throw new PortalProcessingError('UPLOAD_REQUEST_SCOPE_MISMATCH', false)
    return upload(result.rows[0])
  }

  async checkpoint(lease: PortalProcessingLease, patch: Record<string, unknown>): Promise<PortalProcessingUpload> {
    recordSchema.parse(patch)
    if (patch.processing !== undefined) portalProcessingSchema.parse(patch.processing)
    const result = await this.deps.pool().query(`update portal_upload u set metadata=coalesce(u.metadata,'{}'::jsonb)||$4::jsonb
      from portal_document_processing_job j where u.id=$1 and u.cliente_id=$2 and j.upload_id=u.id
      and j.cliente_id=u.cliente_id and j.lease_token=$3 and j.status='processing' returning u.*`,
    [lease.uploadId, lease.clienteId, lease.token, JSON.stringify(patch)])
    if (!result.rowCount) throw new PortalProcessingError('LEASE_LOST')
    await this.deps.mirror(lease.clienteId, lease.uploadId)
    return upload(result.rows[0])
  }

  async finish(lease: PortalProcessingLease, outcome: { status: 'retry' | 'completed' | 'failed'; delayMs?: number; errorCode?: string }): Promise<void> {
    const result = await this.deps.pool().query(`update portal_document_processing_job set status=$4,locked_at=null,lease_token=null,
      available_at=now()+($5::bigint*interval '1 millisecond'),last_error=$6,updated_at=now()
      where upload_id=$1 and cliente_id=$2 and lease_token=$3 and status='processing'`,
    [lease.uploadId, lease.clienteId, lease.token, outcome.status, Math.max(0, Math.min(86_400_000, outcome.delayMs || 0)), outcome.errorCode?.slice(0, 120) || null])
    if (!result.rowCount) throw new PortalProcessingError('LEASE_LOST')
  }
}
