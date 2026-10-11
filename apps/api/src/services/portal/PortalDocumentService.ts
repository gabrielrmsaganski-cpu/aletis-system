import { createHash, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import { getPool, isPgEnabled } from '../../db/client.js'
import { cachePortalPendencia, cachePortalUpload, cachePortalEvento, type DocumentoPendencia, type UploadCliente, type PortalEvento } from '../PortalStore.js'
import {
  portalDocumentCreateSchema, portalDocumentPatchSchema, portalDocumentUploadSchema, portalDocumentMetadataSchema, portalDocumentReviewSchema,
  type PortalDocumentCreateInput, type PortalDocumentPatchInput, type PortalDocumentUploadInput,
} from './PortalDocumentSchemas.js'

export interface PortalDocumentRecord extends DocumentoPendencia {
  prioridade: 'normal' | 'alta' | 'urgente'
  prazo: string | null
  tipoDocumento: string | null
  updatedAt: string
  metadata: Record<string, unknown>
}
/** Registro interno. Rotas públicas devem projetar explicitamente os campos permitidos. */
export interface PortalUploadRecord extends UploadCliente {
  versao: number | null
  metadata: Record<string, unknown>
  idempotencyKey?: string
}
export interface PortalDocumentActor {
  ator?: string
  canal?: 'web' | 'mobile' | 'magic' | 'consultor'
  ip?: string
  userAgent?: string
}
export class PortalDocumentError extends Error {
  constructor(message: string, readonly statusCode = 422, readonly code = 'PORTAL_DOCUMENT_INVALID') { super(message) }
}
interface Options {
  pool?: Pool
  pgEnabled?: () => boolean
  mirror?: boolean
}
type JsonRow = Record<string, any>
const objectSchema = z.record(z.unknown())
const clone = <T>(value: T): T => structuredClone(value)
const iso = (value: string | Date): string => new Date(value).toISOString()
const optionalIso = (value: string | Date | null | undefined): string | undefined => value ? iso(value) : undefined
const nextTimestamp = (previous?: string): string => new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString()
const notFound = (): never => { throw new PortalDocumentError('Solicitação ou arquivo não encontrado para este cliente.', 404, 'PORTAL_DOCUMENT_NOT_FOUND') }
function validate<T>(schema: z.ZodType<T, z.ZodTypeDef, any>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new PortalDocumentError(result.error.issues.map(item => `${item.path.join('.')}: ${item.message}`).join('; '), 400, 'PORTAL_DOCUMENT_INVALID')
  return result.data
}
function assertVersion(current: PortalDocumentRecord, expected?: string): void {
  if (!expected) throw new PortalDocumentError('Recarregue a solicitação antes de alterar: a versão é obrigatória.', 428, 'PORTAL_DOCUMENT_VERSION_REQUIRED')
  if (iso(expected) !== current.updatedAt) throw new PortalDocumentError('Esta solicitação foi alterada. Recarregue antes de salvar sua edição.', 409, 'PORTAL_DOCUMENT_CONFLICT')
}
function requestAudit(value: PortalDocumentRecord): Record<string, unknown> {
  return { pendenciaId: value.id, titulo: value.titulo, descricao: value.descricao ?? null, categoria: value.categoria,
    obrigatorio: value.obrigatorio, prioridade: value.prioridade, prazo: value.prazo, tipoDocumento: value.tipoDocumento,
    status: value.status, uploadId: value.uploadId ?? null, observacao: value.observacao ?? null, updatedAt: value.updatedAt }
}
export function portalDocumentFromPg(row: JsonRow): PortalDocumentRecord {
  return {
    id: row.id, clienteId: row.cliente_id, titulo: row.titulo, descricao: row.descricao ?? undefined,
    categoria: row.categoria ?? 'outros', obrigatorio: row.obrigatorio, status: row.status,
    uploadId: row.upload_id ?? undefined, solicitadoPor: row.solicitado_por ?? undefined,
    solicitadoEm: iso(row.solicitado_em), enviadoEm: optionalIso(row.enviado_em), revisadoEm: optionalIso(row.revisado_em),
    observacao: row.observacao ?? undefined, prioridade: row.prioridade ?? 'normal',
    prazo: row.prazo instanceof Date ? row.prazo.toISOString().slice(0, 10) : row.prazo ?? null,
    tipoDocumento: row.tipo_documento ?? null, updatedAt: iso(row.updated_at ?? row.revisado_em ?? row.enviado_em ?? row.solicitado_em),
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {},
  }
}
export function portalUploadFromPg(row: JsonRow): PortalUploadRecord {
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {}
  return {
    id: row.id, clienteId: row.cliente_id, pendenciaId: row.pendencia_id ?? undefined,
    nomeOriginal: row.nome_original, nomeStorage: row.nome_storage, mime: row.mime, tamanho: row.tamanho,
    sha256: row.sha256 ?? undefined, categoria: row.categoria ?? undefined, enviadoPor: row.enviado_por,
    enviadoEm: iso(row.enviado_em), url: `/api/portal/uploads/${encodeURIComponent(row.id)}`,
    versao: Number.isSafeInteger(metadata.requestVersion) && metadata.requestVersion > 0 ? metadata.requestVersion : null,
    metadata, idempotencyKey: row.idempotency_key ?? undefined,
  }
}

/** PostgreSQL é a autoridade. O espelho legado só é atualizado depois de COMMIT. */
export class PortalDocumentService {
  private readonly requests = new Map<string, PortalDocumentRecord>()
  private readonly uploads = new Map<string, PortalUploadRecord>()
  private readonly options: Options
  constructor(options: Options = {}) { this.options = options }
  private enabled(): boolean { return (this.options.pgEnabled ?? isPgEnabled)() }
  private pool(): Pool { return this.options.pool ?? getPool() }
  private rememberRequest(value: PortalDocumentRecord): PortalDocumentRecord {
    this.requests.set(value.id, clone(value))
    if (this.options.mirror !== false) cachePortalPendencia(value)
    return clone(value)
  }
  private rememberUpload(value: PortalUploadRecord): PortalUploadRecord {
    this.uploads.set(value.id, clone(value))
    if (this.options.mirror !== false) cachePortalUpload(value)
    return clone(value)
  }
  private rememberEvent(event: PortalEvento): void { if (this.options.mirror !== false) cachePortalEvento(event) }
  private async transaction<T>(clienteId: string, work: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool().connect()
    try {
      await db.query('BEGIN')
      // Serializa pedidos/envios do mesmo cliente inclusive entre processos distintos.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`portal-document:${clienteId}`])
      const value = await work(db)
      await db.query('COMMIT')
      return value
    } catch (error) { await db.query('ROLLBACK'); throw error }
    finally { db.release() }
  }
  private async assertClient(db: PoolClient, clienteId: string): Promise<void> {
    if (!(await db.query('SELECT id FROM cliente WHERE id=$1', [clienteId])).rowCount) notFound()
  }
  private async loadRequest(db: Pool | PoolClient, clienteId: string, id: string, lock = false): Promise<PortalDocumentRecord> {
    const result = await db.query(`SELECT * FROM portal_documento_pendente WHERE id=$1 AND cliente_id=$2${lock ? ' FOR UPDATE' : ''}`, [id, clienteId])
    return result.rows[0] ? portalDocumentFromPg(result.rows[0]) : notFound()
  }
  private memoryRequest(clienteId: string, id: string): PortalDocumentRecord {
    const value = this.requests.get(id)
    return value?.clienteId === clienteId ? clone(value) : notFound()
  }
  private async event(db: PoolClient, clienteId: string, tipo: string, details: Record<string, unknown>, actor: PortalDocumentActor, before?: Record<string, unknown>): Promise<PortalEvento> {
    const payload = validate(objectSchema, details)
    const now = nextTimestamp()
    const result = await db.query(`INSERT INTO portal_evento(cliente_id,tipo,canal,ip,user_agent,detalhes,criado_em)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [clienteId, tipo, actor.canal ?? 'consultor', actor.ip ?? null, actor.userAgent ?? null, JSON.stringify(payload), now])
    await db.query(`INSERT INTO audit_log(ator,acao,recurso,dados_antes,dados_depois,criado_em) VALUES($1,$2,$3,$4,$5,$6)`,
      [actor.ator ?? 'system', tipo, `cliente:${clienteId}`, before ? JSON.stringify(validate(objectSchema, before)) : null, JSON.stringify(payload), now])
    return { id: Number(result.rows[0].id), clienteId, tipo: tipo as PortalEvento['tipo'], canal: actor.canal ?? 'consultor', ip: actor.ip, userAgent: actor.userAgent, detalhes: payload, criadoEm: now }
  }
  async listarPendencias(clienteId: string): Promise<PortalDocumentRecord[]> {
    if (!this.enabled()) return [...this.requests.values()].filter(item => item.clienteId === clienteId).map(clone).sort((a, b) => a.solicitadoEm.localeCompare(b.solicitadoEm))
    const result = await this.pool().query('SELECT * FROM portal_documento_pendente WHERE cliente_id=$1 ORDER BY solicitado_em,id', [clienteId])
    for (const [id, item] of this.requests) if (item.clienteId === clienteId) this.requests.delete(id)
    return result.rows.map(row => this.rememberRequest(portalDocumentFromPg(row)))
  }
  async buscarPendencia(clienteId: string, id: string): Promise<PortalDocumentRecord | null> {
    if (!this.enabled()) return this.requests.get(id)?.clienteId === clienteId ? clone(this.requests.get(id)!) : null
    const result = await this.pool().query('SELECT * FROM portal_documento_pendente WHERE id=$1 AND cliente_id=$2', [id, clienteId])
    return result.rows[0] ? this.rememberRequest(portalDocumentFromPg(result.rows[0])) : null
  }
  async criarPendencia(clienteId: string, input: PortalDocumentCreateInput, actor: PortalDocumentActor = {}): Promise<PortalDocumentRecord> {
    const data = validate(portalDocumentCreateSchema, input)
    const now = nextTimestamp()
    const value: PortalDocumentRecord = {
      id: `pd-${randomUUID()}`, clienteId, titulo: data.titulo, descricao: data.descricao ?? undefined,
      categoria: data.categoria, obrigatorio: data.obrigatorio, prioridade: data.prioridade,
      prazo: data.prazo ?? null, tipoDocumento: data.tipoDocumento ?? null, solicitadoPor: data.solicitadoPor ?? actor.ator,
      status: 'pendente', solicitadoEm: now, updatedAt: now,
      metadata: validate(objectSchema, data.idempotencyKey ? {
        idempotencyKey: data.idempotencyKey,
        createFingerprint: createHash('sha256').update(JSON.stringify({ ...data, solicitadoPor: data.solicitadoPor ?? actor.ator ?? null })).digest('hex'),
      } : {}),
    }
    const sameRequest = (saved: PortalDocumentRecord) => {
      if (saved.metadata.createFingerprint !== value.metadata.createFingerprint)
        throw new PortalDocumentError('A chave de envio já foi usada com outra solicitação.', 409, 'PORTAL_IDEMPOTENCY_CONFLICT')
      return saved
    }
    if (!this.enabled()) {
      const previous = data.idempotencyKey ? [...this.requests.values()].find(item => item.clienteId === clienteId && item.metadata.idempotencyKey === data.idempotencyKey) : undefined
      return previous ? clone(sameRequest(previous)) : this.rememberRequest(value)
    }
    const result = await this.transaction(clienteId, async db => {
      await this.assertClient(db, clienteId)
      if (data.idempotencyKey) {
        const previous = await db.query(`SELECT * FROM portal_documento_pendente WHERE cliente_id=$1 AND metadata->>'idempotencyKey'=$2`, [clienteId, data.idempotencyKey])
        if (previous.rows[0]) return { value: sameRequest(portalDocumentFromPg(previous.rows[0])) }
      }
      await db.query(`INSERT INTO portal_documento_pendente(id,cliente_id,titulo,descricao,categoria,obrigatorio,status,solicitado_por,solicitado_em,prioridade,prazo,tipo_documento,updated_at,metadata)
        VALUES($1,$2,$3,$4,$5,$6,'pendente',$7,$8,$9,$10,$11,$8,$12)`,
      [value.id, clienteId, value.titulo, value.descricao ?? null, value.categoria, value.obrigatorio, value.solicitadoPor ?? null, now, value.prioridade, value.prazo, value.tipoDocumento, JSON.stringify(value.metadata)])
      const event = await this.event(db, clienteId, 'pendencia_criada', requestAudit(value), actor)
      return { value, event }
    })
    if (result.event) this.rememberEvent(result.event)
    return this.rememberRequest(result.value)
  }
  async atualizarPendencia(clienteId: string, id: string, input: PortalDocumentPatchInput, actor: PortalDocumentActor = {}): Promise<PortalDocumentRecord> {
    const data = validate(portalDocumentPatchSchema, input)
    const change = (current: PortalDocumentRecord): PortalDocumentRecord => {
      assertVersion(current, data.expectedUpdatedAt)
      if (current.status === 'cancelado') throw new PortalDocumentError('Esta solicitação foi cancelada. Crie uma nova solicitação para pedir outro envio.', 409, 'PORTAL_DOCUMENT_CLOSED')
      const status = data.status ?? current.status
      if (['enviado', 'aprovado', 'rejeitado'].includes(status) && !current.uploadId) throw new PortalDocumentError('A solicitação ainda não recebeu um arquivo para revisão.', 422, 'PORTAL_UPLOAD_REQUIRED')
      if ((status === 'aprovado' || status === 'rejeitado') && status !== current.status && current.status !== 'enviado') throw new PortalDocumentError('Somente um envio aguardando revisão pode ser aprovado ou devolvido para correção.', 409, 'PORTAL_DOCUMENT_REVIEW_CONFLICT')
      const now = nextTimestamp(current.updatedAt)
      return {
        ...current, status, titulo: data.titulo ?? current.titulo,
        categoria: data.categoria ?? current.categoria, obrigatorio: data.obrigatorio ?? current.obrigatorio,
        prioridade: data.prioridade ?? current.prioridade,
        prazo: data.prazo === null ? null : data.prazo ?? current.prazo,
        tipoDocumento: data.tipoDocumento === null ? null : data.tipoDocumento ?? current.tipoDocumento,
        descricao: data.descricao === null ? undefined : data.descricao ?? current.descricao,
        observacao: data.observacao === null ? undefined : data.observacao ?? current.observacao,
        revisadoEm: ['aprovado', 'rejeitado'].includes(status) && status !== current.status ? now : current.revisadoEm,
        updatedAt: now,
      }
    }
    if (!this.enabled()) return this.rememberRequest(change(this.memoryRequest(clienteId, id)))
    const result = await this.transaction(clienteId, async db => {
      const current = await this.loadRequest(db, clienteId, id, true)
      const value = change(current)
      let reviewedUpload: PortalUploadRecord | undefined
      if (value.uploadId && ['aprovado', 'rejeitado'].includes(value.status)) {
        const upload = await db.query('SELECT id FROM portal_upload WHERE id=$1 AND cliente_id=$2 AND pendencia_id=$3', [value.uploadId, clienteId, id])
        if (!upload.rowCount) throw new PortalDocumentError('O envio referenciado não pertence a esta solicitação.', 409, 'PORTAL_DOCUMENT_LINK_MISMATCH')
        if (value.status !== current.status || data.observacao !== undefined) {
          const review = validate(portalDocumentReviewSchema, {
            status: value.status, observacao: value.observacao ?? null,
            revisadoEm: value.revisadoEm ?? value.updatedAt, revisadoPor: actor.ator ?? null,
          })
          const updated = await db.query(`UPDATE portal_upload
            SET metadata=COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('review',$4::jsonb)
            WHERE id=$1 AND cliente_id=$2 AND pendencia_id=$3 RETURNING *`, [value.uploadId, clienteId, id, JSON.stringify(review)])
          reviewedUpload = portalUploadFromPg(updated.rows[0])
        }
      }
      await db.query(`UPDATE portal_documento_pendente SET titulo=$3,descricao=$4,categoria=$5,obrigatorio=$6,status=$7,prioridade=$8,prazo=$9,tipo_documento=$10,observacao=$11,revisado_em=$12,updated_at=$13 WHERE id=$1 AND cliente_id=$2`,
      [id, clienteId, value.titulo, value.descricao ?? null, value.categoria, value.obrigatorio, value.status, value.prioridade, value.prazo, value.tipoDocumento, value.observacao ?? null, value.revisadoEm ?? null, value.updatedAt])
      const event = await this.event(db, clienteId, value.status === 'cancelado' ? 'pendencia_cancelada' : ['aprovado', 'rejeitado'].includes(value.status) && current.status !== value.status ? 'pendencia_resolvida' : 'pendencia_atualizada',
        requestAudit(value), actor, requestAudit(current))
      return { value, event, reviewedUpload }
    })
    this.rememberEvent(result.event)
    if (result.reviewedUpload) this.rememberUpload(result.reviewedUpload)
    return this.rememberRequest(result.value)
  }
  async cancelarPendencia(clienteId: string, id: string, input: { expectedUpdatedAt?: string; observacao?: string }, actor: PortalDocumentActor = {}): Promise<PortalDocumentRecord> {
    return this.atualizarPendencia(clienteId, id, { ...input, status: 'cancelado' }, actor)
  }
  async listarUploads(clienteId: string): Promise<PortalUploadRecord[]> {
    if (!this.enabled()) return [...this.uploads.values()].filter(item => item.clienteId === clienteId).map(clone).sort((a, b) => b.enviadoEm.localeCompare(a.enviadoEm))
    const result = await this.pool().query('SELECT * FROM portal_upload WHERE cliente_id=$1 ORDER BY enviado_em DESC,id', [clienteId])
    for (const [id, item] of this.uploads) if (item.clienteId === clienteId) this.uploads.delete(id)
    return result.rows.map(row => this.rememberUpload(portalUploadFromPg(row)))
  }
  async buscarUpload(clienteId: string, id: string): Promise<PortalUploadRecord | null> {
    if (!this.enabled()) return this.uploads.get(id)?.clienteId === clienteId ? clone(this.uploads.get(id)!) : null
    const result = await this.pool().query('SELECT * FROM portal_upload WHERE id=$1 AND cliente_id=$2', [id, clienteId])
    return result.rows[0] ? this.rememberUpload(portalUploadFromPg(result.rows[0])) : null
  }
  async receberUpload(input: PortalDocumentUploadInput, actor: PortalDocumentActor = {}): Promise<{ upload: PortalUploadRecord; pendencia: PortalDocumentRecord | null; replayed: boolean }> {
    const data = validate(portalDocumentUploadSchema, input)
    const idempotencyKey = data.idempotencyKey ?? `sha256:${createHash('sha256').update(JSON.stringify([data.pendenciaId ?? null, data.sha256, data.nomeOriginal, data.mime, data.tamanho, data.categoria ?? null, data.enviadoPor])).digest('hex')}`
    const sameUpload = (previous: PortalUploadRecord): PortalUploadRecord => {
      if (previous.clienteId !== data.clienteId || previous.pendenciaId !== data.pendenciaId || previous.sha256 !== data.sha256 || previous.nomeOriginal !== data.nomeOriginal || previous.mime !== data.mime || previous.tamanho !== data.tamanho || previous.enviadoPor !== data.enviadoPor || (!data.pendenciaId && data.categoria && previous.categoria !== data.categoria))
        throw new PortalDocumentError('A chave de envio já foi utilizada para outro arquivo ou outra solicitação.', 409, 'PORTAL_IDEMPOTENCY_CONFLICT')
      return previous
    }
    const build = (request: PortalDocumentRecord | null, version: number | null): { upload: PortalUploadRecord; pendencia: PortalDocumentRecord | null; replayed: false } => {
      if (request && ['aprovado', 'cancelado'].includes(request.status)) throw new PortalDocumentError('Esta solicitação está encerrada e não aceita novos envios.', 409, 'PORTAL_DOCUMENT_CLOSED')
      const now = nextTimestamp(request?.updatedAt)
      const metadata = validate(portalDocumentMetadataSchema, { version: 1, requestVersion: version, source: 'portal', processing: { analysis: { status: 'pending' }, drive: { status: 'pending' } } })
      const upload: PortalUploadRecord = { ...data, categoria: request?.categoria ?? data.categoria ?? 'outros', enviadoEm: now, url: `/api/portal/uploads/${encodeURIComponent(data.id)}`, versao: version, metadata, idempotencyKey }
      const pendencia = request ? { ...request, uploadId: data.id, status: 'enviado' as const, enviadoEm: now, revisadoEm: undefined, observacao: undefined, updatedAt: now } : null
      return { upload, pendencia, replayed: false }
    }
    if (!this.enabled()) {
      const previous = [...this.uploads.values()].find(item => item.id === data.id || item.clienteId === data.clienteId && item.idempotencyKey === idempotencyKey)
      if (previous) return { upload: clone(sameUpload(previous)), pendencia: data.pendenciaId ? this.memoryRequest(data.clienteId, data.pendenciaId) : null, replayed: true }
      const request = data.pendenciaId ? this.memoryRequest(data.clienteId, data.pendenciaId) : null
      const result = build(request, request ? [...this.uploads.values()].filter(item => item.clienteId === data.clienteId && item.pendenciaId === request.id).length + 1 : null)
      this.rememberUpload(result.upload)
      if (result.pendencia) this.rememberRequest(result.pendencia)
      return result
    }
    const result = await this.transaction(data.clienteId, async db => {
      await this.assertClient(db, data.clienteId)
      const previous = await db.query('SELECT * FROM portal_upload WHERE id=$1 OR (cliente_id=$2 AND idempotency_key=$3)', [data.id, data.clienteId, idempotencyKey])
      if (previous.rows.length) {
        const upload = sameUpload(portalUploadFromPg(previous.rows[0]))
        // Nunca recria job ausente em registro legado por um retry de cliente.
        return { upload, pendencia: data.pendenciaId ? await this.loadRequest(db, data.clienteId, data.pendenciaId) : null, replayed: true }
      }
      const request = data.pendenciaId ? await this.loadRequest(db, data.clienteId, data.pendenciaId, true) : null
      const version = request ? Number((await db.query('SELECT count(*)::int AS total FROM portal_upload WHERE cliente_id=$1 AND pendencia_id=$2', [data.clienteId, request.id])).rows[0].total) + 1 : null
      const value = build(request, version)
      const upload = value.upload
      await db.query(`INSERT INTO portal_upload(id,cliente_id,pendencia_id,nome_original,nome_storage,mime,tamanho,sha256,categoria,enviado_por,enviado_em,metadata,idempotency_key)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [upload.id, upload.clienteId, upload.pendenciaId ?? null, upload.nomeOriginal, upload.nomeStorage, upload.mime, upload.tamanho, upload.sha256, upload.categoria, upload.enviadoPor, upload.enviadoEm, JSON.stringify(upload.metadata), idempotencyKey])
      if (value.pendencia) await db.query(`UPDATE portal_documento_pendente SET upload_id=$3,status='enviado',enviado_em=$4,revisado_em=NULL,observacao=NULL,updated_at=$4 WHERE id=$1 AND cliente_id=$2`,
        [value.pendencia.id, data.clienteId, upload.id, value.pendencia.updatedAt])
      await db.query(`INSERT INTO portal_document_processing_job(id,upload_id,cliente_id,status,available_at,created_at,updated_at) VALUES($1,$1,$2,'queued',$3,$3,$3)`, [upload.id, data.clienteId, upload.enviadoEm])
      const event = await this.event(db, data.clienteId, 'documento_enviado', { uploadId: upload.id, pendenciaId: upload.pendenciaId ?? null, nome: upload.nomeOriginal, tamanho: upload.tamanho, versao: version }, { canal: data.enviadoPor === 'cliente' ? 'web' : 'consultor', ...actor })
      return { ...value, event }
    })
    this.rememberUpload(result.upload)
    if (result.pendencia) this.rememberRequest(result.pendencia)
    if ('event' in result && result.event) this.rememberEvent(result.event)
    return { upload: result.upload, pendencia: result.pendencia, replayed: result.replayed }
  }
}

export const portalDocumentService = new PortalDocumentService()
