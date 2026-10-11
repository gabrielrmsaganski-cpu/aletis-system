import { z } from 'zod'
import { getPool, isPgEnabled } from '../../db/client.js'
import { findInternalUserById } from '../../lib/internal-auth.js'
import { getAccessControlService } from '../core/AccessControlService.js'
import { getGcloudDriveCredentials } from './gcloudDriveCredentials.js'
import type { GoogleWorkspaceActor } from './schemas.js'
import { corpusHash, readCorpusPage, driveCorpusTimestamp } from './DriveCorpusTypes.js'
import { driveIncrementalProgress } from './DriveCorpusMetadataEvents.js'

const querySchema = z.object({
  clienteId: z.string().trim().min(1).max(180).optional(), query: z.string().trim().max(300).default(''),
  category: z.string().max(100).optional(), status: z.enum(['pending','complete','partial','failed','unsupported','changed','deferred']).optional(),
  changedSince: driveCorpusTimestamp.optional(),
  corporateOnly: z.boolean().default(false), offset: z.number().int().min(0).max(2_000_000).default(0),
  limit: z.number().int().min(1).max(100).default(30),
})
export type DriveCorpusQuery = z.input<typeof querySchema>
export class DriveCorpusError extends Error {
  constructor(message: string, public statusCode = 400, public code = 'DRIVE_CORPUS_ERROR') { super(message) }
}

export function isDriveCorpusAdministrator(actor: GoogleWorkspaceActor): boolean {
  const configured = findInternalUserById(actor.userId)
  const account = getGcloudDriveCredentials().account()
  const administrators = (process.env.GOOGLE_DRIVE_ADMIN_USER_IDS || '').split(',').map(x => x.trim()).filter(Boolean)
  return Boolean((configured && account && configured.email.toLowerCase() === account.toLowerCase()) || administrators.includes(actor.userId)
    || ['admin_master','admin','master'].includes(actor.role))
}

function publicFile(row: Record<string, any>) {
  return { fileId: row.file_id, name: row.name, mimeType: row.mime_type, path: row.path,
    clienteId: row.cliente_id, category: row.category, readStatus: row.read_status, coverage: publicCoverage(row.coverage),
    characters: Number(row.characters || 0), modifiedAt: row.modified_at, readAt: row.read_at,
    revision: row.revision_key, corporateScope: row.corporate_scope, matching: row.metadata?.matching || null,
    lastChangeAt: row.metadata?.availability?.checkedAt || null,
    readIssue: row.metadata?.ingestionError ? 'A extração precisa de nova conferência antes de entrar no catálogo.' : null,
    url: `https://drive.google.com/file/d/${encodeURIComponent(row.file_id)}/view`,
  }
}
export function publicCoverage(value: any): Record<string,unknown> {
  if (!value || typeof value !== 'object') return {status:'unknown',limitations:['A cobertura ainda não foi conferida.']}
  const output = Object.fromEntries(['status','totalPages','readablePages','pendingPages','failedPages','totalRows','extractedRows','imagePages','ocrAttemptedPages'].filter(key => value[key] !== undefined).map(key => [key,value[key]]))
  const limitations = (Array.isArray(value.limitations) ? value.limitations : []).filter((x:unknown):x is string=>typeof x==='string').map((text:string)=>{
    if (/google_http_401|auth_pending|token.*expir/i.test(text)) return 'A leitura aguarda a renovação da conexão com o Google.'
    if (/google_http_(429|5\d\d)/.test(text)) return 'O Google limitou temporariamente a leitura; será necessária nova tentativa.'
    if (/\/root\/|\/tmp\/|postgres(?:ql)?:\/\/|Traceback|ENOENT|EACCES/.test(text)) return 'A extração encontrou uma limitação técnica. Consulte o original enquanto a leitura é revisada.'
    return text
  })
  return {...output,limitations:[...new Set(limitations)]}
}

export class DriveCorpusService {
  private pool() {
    if (!isPgEnabled()) throw new DriveCorpusError('O catálogo do Drive requer PostgreSQL disponível.', 503, 'DRIVE_CORPUS_UNAVAILABLE')
    return getPool()
  }
  async authorize(actor: GoogleWorkspaceActor, clienteId?: string) {
    if (!actor.userId || ['anonymous','unknown'].includes(actor.userId)) throw new DriveCorpusError('Entre no sistema para consultar o Drive.', 401, 'AUTH_REQUIRED')
    if (isDriveCorpusAdministrator(actor)) return
    if (!clienteId) throw new DriveCorpusError('Selecione um cliente autorizado. A visão geral do Drive é reservada ao responsável pela conexão.', 403, 'DRIVE_SCOPE_REQUIRED')
    const row = (await this.pool().query("SELECT payload FROM cliente WHERE id=$1 AND COALESCE(payload->'identityMerge'->>'status','') <> 'merged'", [clienteId])).rows[0]
    if (!row) throw new DriveCorpusError('Cliente não encontrado.', 404, 'CLIENT_NOT_FOUND')
    const decision = await getAccessControlService().canAccessCliente({ actor: { id: actor.userId, nome: actor.userName, role: actor.role as any, consultorId: actor.userId }, clienteId, cliente: row.payload, action: 'document:read' })
    if (!decision.allowed || decision.source === 'compat') throw new DriveCorpusError('Você precisa estar vinculado a este cliente para consultar seu acervo.', 403, 'DRIVE_CLIENT_FORBIDDEN')
  }
  private scope(actor: GoogleWorkspaceActor, clienteId?: string, corporateOnly = false) {
    const values: unknown[] = [actor.tenantId]
    let where = "f.tenant_id=$1 AND COALESCE(f.metadata->'availability'->>'status','available')='available'"
    if (clienteId) { values.push(clienteId); where += ` AND f.cliente_id=$${values.length}` }
    if (corporateOnly) where += ' AND f.corporate_scope=true'
    return { where, values }
  }
  async overview(actor: GoogleWorkspaceActor, input: DriveCorpusQuery = {}) {
    const query = querySchema.parse(input); await this.authorize(actor, query.clienteId)
    const { where, values } = this.scope(actor, query.clienteId, query.corporateOnly)
    const pool = this.pool()
    const [totals, states, clients, categories, run] = await Promise.all([
      pool.query(`SELECT count(*) FILTER(WHERE f.read_status<>'folder')::int AS files,count(*) FILTER(WHERE f.read_status='folder')::int AS folders,
        count(*) FILTER(WHERE f.read_status='complete')::int AS extracted,count(*) FILTER(WHERE f.read_status='partial')::int AS partial,
        count(*) FILTER(WHERE f.read_status IN ('pending','changed','deferred'))::int AS pending,count(*) FILTER(WHERE f.read_status='failed')::int AS failed,
        count(*) FILTER(WHERE f.read_status='unsupported' AND f.mime_type<>'application/vnd.google-apps.shortcut')::int AS unsupported,
        count(*) FILTER(WHERE f.mime_type='application/vnd.google-apps.shortcut')::int AS shortcuts,
        count(*) FILTER(WHERE f.cliente_id IS NULL AND f.read_status<>'folder')::int AS "withoutClient",
        coalesce(sum(f.extracted_characters),0)::text AS characters FROM alix_drive_corpus f WHERE ${where}`, values),
      pool.query(`SELECT f.read_status AS status,count(*)::int AS count FROM alix_drive_corpus f WHERE ${where} GROUP BY f.read_status`, values),
      pool.query(`SELECT f.cliente_id AS id,c.nome,count(*)::int AS files,count(*) FILTER(WHERE f.read_status='complete')::int AS extracted,
        count(*) FILTER(WHERE f.read_status='partial')::int AS partial FROM alix_drive_corpus f JOIN cliente c ON c.id=f.cliente_id
        WHERE ${where} AND f.read_status<>'folder' GROUP BY f.cliente_id,c.nome ORDER BY c.nome`, values),
      pool.query(`SELECT f.category,count(*)::int AS files FROM alix_drive_corpus f WHERE ${where} AND f.read_status<>'folder' GROUP BY f.category ORDER BY count(*) DESC`, values),
      pool.query('SELECT payload,updated_at FROM alix_drive_corpus_run WHERE tenant_id=$1', [actor.tenantId]),
    ])
    const incremental = driveIncrementalProgress.safeParse(run.rows[0]?.payload?.incrementalProgress)
    return { checkedAt: new Date().toISOString(), source: 'postgresql', scope: { clienteId: query.clienteId || null, corporateOnly: query.corporateOnly },
      canViewAll: isDriveCorpusAdministrator(actor), totals: totals.rows[0], states: states.rows, clients: clients.rows, categories: categories.rows,
      organization: isDriveCorpusAdministrator(actor) && /^[A-Za-z0-9_-]{1,200}$/.test(run.rows[0]?.payload?.organization?.hubId || '')
        ? { hubUrl: `https://drive.google.com/drive/folders/${run.rows[0].payload.organization.hubId}` } : null,
      inventory: { complete: Boolean(run.rows[0]?.payload?.inventoryComplete), completedAt: run.rows[0]?.payload?.inventoryCompletedAt || null, updatedAt: run.rows[0]?.updated_at || null },
      monitoring: incremental.success ? { status: incremental.data.status, updatedAt: incremental.data.updatedAt,
        lastSuccessfulSyncAt: incremental.data.lastSuccessfulSyncAt || null,
        note: incremental.data.status === 'watching' ? 'Novos arquivos, alterações e remoções são acompanhados automaticamente.'
          : incremental.data.status === 'reconciling' ? 'Conferindo o inventário atual antes de acompanhar novas mudanças.'
            : incremental.data.status === 'awaiting_authorization' ? 'A sincronização aguarda a conexão com o Google.'
              : 'O Google está temporariamente indisponível. A sincronização tentará novamente.' } : null,
      reading: { status: run.rows[0]?.payload?.readingStatus || 'not_started', lastUpdate: run.rows[0]?.payload?.readingUpdatedAt || null,
        note: run.rows[0]?.payload?.readingStatus === 'paused_auth' ? 'A leitura está aguardando a renovação da conexão com o Google. O texto já extraído permanece disponível.'
          : run.rows[0]?.payload?.readingStatus === 'paused' ? 'A leitura está pausada. O conteúdo já extraído permanece disponível, com as limitações de cada arquivo.'
            : 'Extração textual, leitura por IA e validação dos dados são etapas diferentes. Conteúdo pendente ou parcial continua sinalizado.' },
    }
  }
  async list(actor: GoogleWorkspaceActor, input: DriveCorpusQuery = {}) {
    const query = querySchema.parse(input); await this.authorize(actor, query.clienteId)
    const scoped = this.scope(actor, query.clienteId, query.corporateOnly); const values = scoped.values; let where = scoped.where + " AND f.read_status<>'folder'"
    if (query.status) { values.push(query.status); where += ` AND f.read_status=$${values.length}` }
    if (query.category) { values.push(query.category); where += ` AND f.category=$${values.length}` }
    if (query.changedSince) { values.push(query.changedSince); where += ` AND f.metadata->'availability'->>'checkedAt' IS NOT NULL AND f.scanned_at>=$${values.length}::timestamptz` }
    if (query.query) { values.push(`%${query.query.replace(/[\\%_]/g, '\\$&')}%`); where += ` AND (f.name ILIKE $${values.length} OR f.path ILIKE $${values.length})` }
    const result = await this.pool().query(`SELECT f.file_id,f.name,f.mime_type,f.path,f.cliente_id,f.category,f.read_status,f.coverage,f.modified_at,f.read_at,f.revision_key,f.corporate_scope,f.metadata,f.extracted_characters AS characters,count(*) OVER()::int AS total FROM alix_drive_corpus f WHERE ${where}
      ORDER BY ${query.changedSince ? 'f.scanned_at DESC,' : ''} f.name,f.file_id LIMIT $${values.length+1} OFFSET $${values.length+2}`, [...values,query.limit,query.offset])
    const total = result.rows[0]?.total || 0
    return { files: result.rows.map(publicFile), total, nextOffset: query.offset + result.rows.length < total ? query.offset + result.rows.length : null,
      searchType: 'name_and_path', contentSearchAvailable: true }
  }
  async search(actor: GoogleWorkspaceActor, input: DriveCorpusQuery) {
    const query = querySchema.parse(input); await this.authorize(actor, query.clienteId)
    if (query.query.length < 2) throw new DriveCorpusError('Digite pelo menos dois caracteres para pesquisar o conteúdo.')
    const scoped = this.scope(actor, query.clienteId, query.corporateOnly); const values = [...scoped.values,query.query]; const position = values.length
    const rows = (await this.pool().query(`SELECT f.file_id,f.name,f.path,f.cliente_id,f.category,f.read_status,f.coverage,f.revision_key,
      c.id AS chunk_id,c.ordinal,c.text,c.source,c.page,c.sheet,
      ts_rank_cd(c.search_vector,websearch_to_tsquery('portuguese',$${position})) AS rank
      FROM alix_drive_corpus_chunk c JOIN alix_drive_corpus f ON f.file_id=c.file_id AND f.tenant_id=c.tenant_id AND f.revision_key=c.revision_key
      WHERE ${scoped.where} AND f.read_status IN ('complete','partial') AND c.search_vector @@ websearch_to_tsquery('portuguese',$${position})
      ORDER BY rank DESC,f.file_id,c.ordinal LIMIT $${position+1} OFFSET $${position+2}`, [...values,query.limit,query.offset])).rows
    return { query: query.query, searchType: 'full_text', source: 'postgresql', results: rows.map(row => ({ fileId: row.file_id,name: row.name,path: row.path,clienteId: row.cliente_id,
      category: row.category,readStatus: row.read_status,coverage: publicCoverage(row.coverage),revision: row.revision_key,
      chunkId: row.chunk_id,ordinal: row.ordinal,text: row.text,source: row.source,page: row.page,sheet: row.sheet,
      quoteHash: corpusHash(row.text),
      url: `https://drive.google.com/file/d/${encodeURIComponent(row.file_id)}/view` })),
      nextOffset: rows.length === query.limit ? query.offset + rows.length : null,
      instruction: 'Busca no texto extraído disponível. Ausência de resultado não comprova ausência em arquivos ainda pendentes ou páginas sem OCR.' }
  }
  async getChunk(actor: GoogleWorkspaceActor, input: { clienteId?: string; fileId: string; chunkId: string; revision: string; quoteHash: string }) {
    await this.authorize(actor, input.clienteId)
    const params = [actor.tenantId,input.fileId,input.chunkId,input.revision]
    if (input.clienteId) params.push(input.clienteId)
    const row = (await this.pool().query(`SELECT f.file_id,f.name,f.cliente_id,f.revision_key,f.coverage,f.read_status,f.modified_at,f.source_sha256,c.id,c.text,c.page,c.sheet
      FROM alix_drive_corpus_chunk c JOIN alix_drive_corpus f ON f.tenant_id=c.tenant_id AND f.file_id=c.file_id AND f.revision_key=c.revision_key
      WHERE f.tenant_id=$1 AND f.file_id=$2 AND c.id=$3 AND f.revision_key=$4 AND f.read_status IN ('complete','partial')
        AND COALESCE(f.metadata->'availability'->>'status','available')='available'${input.clienteId ? ' AND f.cliente_id=$5' : ''}`, params)).rows[0]
    if (!row || corpusHash(row.text) !== input.quoteHash) throw new DriveCorpusError('A fonte mudou ou não está disponível neste contexto. Pesquise e selecione novamente o trecho.',409,'DRIVE_SOURCE_CHANGED')
    return {fileId:row.file_id,chunkId:row.id,revision:row.revision_key,quoteHash:corpusHash(row.text),text:row.text,name:row.name,
      url:`https://drive.google.com/file/d/${encodeURIComponent(row.file_id)}/view`,page:row.page??undefined,sheet:row.sheet??undefined,
      clienteId:row.cliente_id as string|null,readStatus:row.read_status as 'complete'|'partial',coverage:publicCoverage(row.coverage),modifiedAt:row.modified_at,sourceSha256:row.source_sha256}
  }
  async read(actor: GoogleWorkspaceActor, fileId: string, options: { clienteId?: string; cursor?: string; maxChars?: number } = {}) {
    await this.authorize(actor, options.clienteId)
    const values: unknown[] = [actor.tenantId,fileId]
    const row = (await this.pool().query(`SELECT f.*,f.extracted_characters AS characters FROM alix_drive_corpus f WHERE f.tenant_id=$1 AND f.file_id=$2
      AND COALESCE(f.metadata->'availability'->>'status','available')='available'${options.clienteId ? ' AND f.cliente_id=$3' : ''}`, options.clienteId ? [...values,options.clienteId] : values)).rows[0]
    if (!row) throw new DriveCorpusError('Arquivo indisponível neste contexto.', 404, 'DRIVE_FILE_NOT_FOUND')
    if (!['complete','partial'].includes(row.read_status)) return { file: publicFile(row), available: false, text: '', nextCursor: null,
      instruction: 'O conteúdo ainda não está disponível para leitura. Confira o estado de extração; não conclua sobre o documento a partir do nome.' }
    let page
    try { page = readCorpusPage({ fileId,revision: row.revision_key,text: row.extracted_text || '',cursor: options.cursor,maxChars: options.maxChars }) }
    catch(error) { throw new DriveCorpusError((error as Error).message,409,'DRIVE_SOURCE_CHANGED') }
    return { file: publicFile(row),available: true,...page }
  }
}
let singleton: DriveCorpusService | undefined
export function getDriveCorpusService() { return singleton ||= new DriveCorpusService() }
