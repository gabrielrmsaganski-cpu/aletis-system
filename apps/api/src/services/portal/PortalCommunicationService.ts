import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Pool } from 'pg'
import { getPool, isPgEnabled } from '../../db/client.js'
import { clientes } from '../../routes/clientes.js'
import { PortalConversationError, portalConversationInputSchema, portalMessageKeySchema, portalReadMessagesSchema,
  type PortalConversationActor, type PortalConversationAttachment, type PortalConversationMessage } from './PortalConversationTypes.js'

const updateSchema = z.object({ titulo: z.string().trim().min(2).max(160), descricao: z.string().trim().min(1).max(3000) }).strict()
const memoryUpdates = new Map<string, Array<{ id: string; data: string; tipo: string; descricao: string; detalhes?: string }>>()
const metadataSchema = z.object({ version: z.literal(1), actorId: z.string(), idempotencyKey: z.string().optional(), fingerprint: z.string(),
  uploadIds: z.array(z.string()).max(10), pendenciaId: z.string().optional() }).strict()
const iso = (value: string | Date) => new Date(value).toISOString()
const clone = <T>(value: T): T => structuredClone(value)
function parse<T>(schema: z.ZodType<T, any, any>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new PortalConversationError('Mensagem, anexos ou identificadores inválidos.')
  return result.data
}
function message(row: Record<string, any>): PortalConversationMessage {
  return { id: String(row.id), de: row.de, autorNome: row.autor_nome || 'Equipe ALETIS', texto: String(row.texto || ''),
    criadoEm: iso(row.criado_em), ...(row.lida_em ? { lidaEm: iso(row.lida_em) } : {}) }
}

/** Leituras não produzem recibo. Mensagem, contexto, idempotência e auditoria
 * são confirmados juntos; espelhos de memória só observam commits completos. */
export class PortalCommunicationService {
  private readonly memory = new Map<string, PortalConversationMessage[]>()
  private readonly keys = new Map<string, { fingerprint: string; message: PortalConversationMessage }>()
  constructor(private readonly deps: { enabled: () => boolean; pool: () => Pick<Pool, 'query' | 'connect'>;
    mirror: (id: string, rows: PortalConversationMessage[]) => void;
    legacy: (id: string) => PortalConversationMessage[] } = {
    enabled: isPgEnabled, pool: getPool,
    mirror: (id, rows) => { const client = clientes.get(id); if (client) client.portalMensagens = rows },
    legacy: id => clientes.get(id)?.portalMensagens || [],
  }) {}
  private remember(clienteId: string, rows: PortalConversationMessage[]) {
    const merged = [...new Map([...(this.memory.get(clienteId) || []), ...rows].map(row => [row.id, row])).values()]
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id)).slice(-1000)
    this.memory.set(clienteId, merged); this.deps.mirror(clienteId, clone(merged))
  }
  async list(clienteId: string, before?: { criadoEm: string; id: string }, messageId?: string): Promise<PortalConversationMessage[]> {
    if (!this.deps.enabled()) {
      const rows = this.memory.get(clienteId) || this.deps.legacy(clienteId)
      return clone(rows.filter(row => (!messageId || row.id === messageId) && (!before || row.criadoEm < before.criadoEm || row.criadoEm === before.criadoEm && row.id < before.id)).slice(-200))
    }
    const rows = (await this.deps.pool().query(`select * from portal_mensagem where cliente_id=$1
      and ($2::timestamptz is null or (criado_em,id)<($2::timestamptz,$3::text)) and ($4::text is null or id=$4) order by criado_em desc,id desc limit 200`,
    [clienteId, before?.criadoEm || null, before?.id || null, messageId || null])).rows.reverse()
    const ids = [...new Set(rows.flatMap(row => Array.isArray(row.metadata?.uploadIds) ? row.metadata.uploadIds : []))] as string[]
    const requests = [...new Set(rows.map(row => row.metadata?.pendenciaId).filter(Boolean))] as string[]
    const uploads = ids.length ? (await this.deps.pool().query(`select id,nome_original,mime,tamanho from portal_upload
      where cliente_id=$1 and id=any($2::text[]) and (enviado_por='cliente' or metadata->>'portalCompartilhado'='true')`, [clienteId, ids])).rows : []
    const pending = requests.length ? (await this.deps.pool().query('select id,titulo from portal_documento_pendente where cliente_id=$1 and id=any($2::text[])', [clienteId, requests])).rows : []
    const uploadMap = new Map(uploads.map(row => [row.id, row])); const requestMap = new Map(pending.map(row => [row.id, row]))
    const result = rows.map(row => {
      const view = message(row)
      if (Array.isArray(row.metadata?.uploadIds)) view.anexos = row.metadata.uploadIds.map((id: string) => {
        const file = uploadMap.get(id)
        return { uploadId: id, nome: file?.nome_original || 'Arquivo indisponível', mime: file?.mime || '', tamanho: Number(file?.tamanho || 0), disponivel: Boolean(file) }
      })
      const request = requestMap.get(row.metadata?.pendenciaId)
      if (request) view.solicitacao = { id: request.id, titulo: request.titulo }
      return view
    })
    this.remember(clienteId, result)
    return result
  }
  async add(clienteId: string, input: unknown, actor: PortalConversationActor, key?: string): Promise<PortalConversationMessage & { replayed: boolean }> {
    const parsed = parse(portalConversationInputSchema, input)
    const identity = parse(z.object({ de: z.enum(['cliente', 'consultor']), actorId: z.string().min(1).max(200), autorNome: z.string().trim().min(1).max(150) }).strict(), actor)
    const idempotencyKey = key === undefined ? undefined : parse(portalMessageKeySchema, key)
    const uploadIds = [...new Set(parsed.uploadIds)].sort()
    const payload = { texto: parsed.texto, uploadIds, ...(parsed.pendenciaId ? { pendenciaId: parsed.pendenciaId } : {}) }
    const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
    const lockKey = JSON.stringify([clienteId, identity.de, identity.actorId, idempotencyKey])
    const existing = this.keys.get(lockKey)
    if (!this.deps.enabled()) {
      if (uploadIds.length || parsed.pendenciaId) throw new PortalConversationError('Anexos e solicitações exigem persistência disponível.', 503)
      if (idempotencyKey && existing) {
        if (existing.fingerprint !== fingerprint) throw new PortalConversationError('Este envio já foi usado com outro conteúdo.', 409, 'PORTAL_MESSAGE_CONFLICT')
        return { ...clone(existing.message), replayed: true }
      }
      const view: PortalConversationMessage = { id: `pm-${randomUUID()}`, de: identity.de, autorNome: identity.autorNome, texto: parsed.texto, criadoEm: new Date().toISOString() }
      this.remember(clienteId, [...(this.memory.get(clienteId) || this.deps.legacy(clienteId)), view])
      if (idempotencyKey) this.keys.set(lockKey, { fingerprint, message: view })
      return { ...view, replayed: false }
    }
    const tx = await this.deps.pool().connect()
    let view!: PortalConversationMessage; let replayed = false
    try {
      await tx.query('BEGIN')
      if (idempotencyKey) {
        await tx.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`portal-message:${lockKey}`])
        const prior = await tx.query(`select * from portal_mensagem where cliente_id=$1 and de=$2 and metadata->>'actorId'=$3 and metadata->>'idempotencyKey'=$4`, [clienteId, identity.de, identity.actorId, idempotencyKey])
        if (prior.rows[0]) {
          if (prior.rows[0].metadata?.fingerprint !== fingerprint) throw new PortalConversationError('Este envio já foi usado com outro conteúdo.', 409, 'PORTAL_MESSAGE_CONFLICT')
          view = message(prior.rows[0]); replayed = true
        }
      }
      const attachments: PortalConversationAttachment[] = []
      if (!replayed) {
        if (uploadIds.length) {
          const found = await tx.query(`select id,nome_original,mime,tamanho from portal_upload where cliente_id=$1 and id=any($2::text[])
            and (enviado_por='cliente' or metadata->>'portalCompartilhado'='true') for share`, [clienteId, uploadIds])
          if (found.rowCount !== uploadIds.length) throw new PortalConversationError('Um arquivo não está disponível para esta conversa.', 404, 'PORTAL_ATTACHMENT_UNAVAILABLE')
          attachments.push(...found.rows.map(file => ({ uploadId: file.id, nome: file.nome_original, mime: file.mime, tamanho: Number(file.tamanho), disponivel: true })))
        }
        let request: { id: string; titulo: string } | undefined
        if (parsed.pendenciaId) {
          const found = await tx.query('select id,titulo from portal_documento_pendente where id=$1 and cliente_id=$2 for share', [parsed.pendenciaId, clienteId])
          if (!found.rowCount) throw new PortalConversationError('Solicitação não encontrada para este cliente.', 404, 'PORTAL_REQUEST_UNAVAILABLE')
          request = found.rows[0]
        }
        const metadata = metadataSchema.parse({ version: 1, actorId: identity.actorId, idempotencyKey, fingerprint, uploadIds, pendenciaId: parsed.pendenciaId })
        const id = `pm-${randomUUID()}`
        const result = await tx.query(`insert into portal_mensagem(id,cliente_id,de,autor_nome,texto,anexos,metadata)
          values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) returning *`, [id, clienteId, identity.de, identity.autorNome, parsed.texto, JSON.stringify(uploadIds), JSON.stringify(metadata)])
        view = { ...message(result.rows[0]), ...(attachments.length ? { anexos: attachments } : {}), ...(request ? { solicitacao: request } : {}) }
        await tx.query(`insert into audit_log(ator,acao,recurso,dados_depois) values($1,'portal_mensagem_enviada',$2,$3::jsonb)`,
          [identity.actorId, `cliente:${clienteId}`, JSON.stringify({ id, de: identity.de, uploadIds, pendenciaId: parsed.pendenciaId })])
      }
      await tx.query('COMMIT')
    } catch (error) { await tx.query('ROLLBACK').catch(() => undefined); throw error } finally { tx.release() }
    // Replays devolvem os anexos com a disponibilidade atual, nunca um snapshot antigo de compartilhamento.
    if (replayed) {
      const latest = await this.list(clienteId, undefined, view.id)
      view = latest.find(row => row.id === view.id) || view
    }
    this.remember(clienteId, [view])
    return { ...view, replayed }
  }
  async markRead(clienteId: string, from: 'cliente' | 'consultor', ids: string[], actorId: string): Promise<{ marcadas: number; ids: string[]; lidaEm: string }> {
    const requested = [...new Set(parse(portalReadMessagesSchema, { ids }).ids)]
    const now = new Date().toISOString()
    let changed: string[] = []
    if (this.deps.enabled()) {
      const tx = await this.deps.pool().connect()
      try {
        await tx.query('BEGIN')
        changed = (await tx.query(`update portal_mensagem set lida_em=$4 where cliente_id=$1 and de=$2 and id=any($3::text[]) and lida_em is null returning id`, [clienteId, from, requested, now])).rows.map(row => row.id)
        if (changed.length) await tx.query(`insert into audit_log(ator,acao,recurso,dados_depois) values($1,'portal_mensagens_lidas',$2,$3::jsonb)`, [actorId, `cliente:${clienteId}`, JSON.stringify({ ids: changed, de: from, lidaEm: now })])
        await tx.query('COMMIT')
      } catch (error) { await tx.query('ROLLBACK').catch(() => undefined); throw error } finally { tx.release() }
    } else changed = (this.memory.get(clienteId) || this.deps.legacy(clienteId)).filter(row => requested.includes(row.id) && row.de === from && !row.lidaEm).map(row => row.id)
    this.remember(clienteId, (this.memory.get(clienteId) || this.deps.legacy(clienteId)).map(row => changed.includes(row.id) ? { ...row, lidaEm: now } : row))
    return { marcadas: changed.length, ids: changed, lidaEm: now }
  }
}
export const portalCommunicationService = new PortalCommunicationService()
export async function listPortalMessages(clienteId: string): Promise<PortalConversationMessage[]> { return portalCommunicationService.list(clienteId) }
export async function addPortalMessage(clienteId: string, input: { de: 'cliente' | 'consultor'; autorNome: string; texto: string }) {
  return portalCommunicationService.add(clienteId, { texto: input.texto }, { de: input.de, autorNome: input.autorNome, actorId: `${input.de}:${clienteId}` })
}
/** IDs são obrigatórios: chamadas antigas sem IDs não marcam conversas inteiras. */
export async function markPortalMessagesRead(clienteId: string, from: 'cliente' | 'consultor', ids: string[] = []): Promise<number> {
  if (!ids.length) return 0
  return (await portalCommunicationService.markRead(clienteId, from, ids, `legacy:${clienteId}`)).marcadas
}

export async function publishPortalUpdate(clienteId: string, input: z.input<typeof updateSchema>, actorId: string, idempotencyKey?: string) {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) throw Object.assign(new Error('Informe título e descrição válidos para o andamento.'), { statusCode: 400 })
  const data = parsed.data
  const createdAt = new Date().toISOString()
  let id: string = randomUUID()
  if (isPgEnabled()) {
    const tx = await getPool().connect()
    try {
      await tx.query('BEGIN')
      if (idempotencyKey) {
        await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`portal-update:${clienteId}:${idempotencyKey}`])
        const prior = await tx.query("SELECT id,criado_em,detalhes FROM portal_evento WHERE cliente_id=$1 AND tipo='andamento_publicado' AND detalhes->>'idempotencyKey'=$2 LIMIT 1", [clienteId, idempotencyKey])
        if (prior.rows[0]) {
          const row = prior.rows[0]
          if (row.detalhes.titulo !== data.titulo || row.detalhes.descricao !== data.descricao) throw Object.assign(new Error('A chave deste envio já foi usada com outro andamento.'), { statusCode: 409 })
          await tx.query('COMMIT')
          return { id: String(row.id), data: new Date(row.criado_em).toISOString(), tipo: 'andamento', descricao: data.titulo, detalhes: data.descricao }
        }
      }
      const result = await tx.query("INSERT INTO portal_evento(cliente_id,tipo,canal,detalhes,criado_em) VALUES($1,'andamento_publicado','consultor',$2,$3) RETURNING id", [clienteId, JSON.stringify({ ...data, idempotencyKey }), createdAt])
      id = String(result.rows[0].id)
      await tx.query("INSERT INTO audit_log(ator,acao,recurso,dados_depois) VALUES($1,'portal_andamento_publicado',$2,$3)", [actorId, `cliente:${clienteId}`, JSON.stringify({ id, ...data })])
      await tx.query('COMMIT')
    } catch (error) { await tx.query('ROLLBACK'); throw error } finally { tx.release() }
  }
  const view = { id, data: createdAt, tipo: 'andamento', descricao: data.titulo, detalhes: data.descricao }
  memoryUpdates.set(clienteId, [view, ...(memoryUpdates.get(clienteId) || [])].slice(0, 100))
  return view
}

/** Somente publicações explícitas; notas e recomendações internas do CRM ficam fora do portal. */
export async function listPortalUpdates(clienteId: string) {
  if (!isPgEnabled()) return memoryUpdates.get(clienteId) || []
  const { rows } = await getPool().query("SELECT id,criado_em,detalhes FROM portal_evento WHERE cliente_id=$1 AND tipo='andamento_publicado' ORDER BY criado_em DESC,id DESC LIMIT 100", [clienteId])
  return rows.map(row => ({ id: String(row.id), data: new Date(row.criado_em).toISOString(), tipo: 'andamento', descricao: String(row.detalhes?.titulo || 'Atualização da equipe'), detalhes: String(row.detalhes?.descricao || '') }))
}

export async function sharePortalUpload(clienteId: string, uploadId: string, available: boolean, actorId: string) {
  if (!isPgEnabled()) throw Object.assign(new Error('Compartilhamento requer persistência disponível.'), { statusCode: 503 })
  const tx = await getPool().connect()
  try {
    await tx.query('BEGIN')
    const result = await tx.query("UPDATE portal_upload SET metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{portalCompartilhado}',$3::jsonb,true) WHERE id=$1 AND cliente_id=$2 RETURNING id", [uploadId, clienteId, JSON.stringify(available)])
    if (!result.rowCount) throw Object.assign(new Error('Documento não encontrado.'), { statusCode: 404 })
    await tx.query("INSERT INTO audit_log(ator,acao,recurso,dados_depois) VALUES($1,'portal_documento_compartilhado',$2,$3)", [actorId, `cliente:${clienteId}`, JSON.stringify({ uploadId, disponivel: available })])
    await tx.query('COMMIT')
    return { uploadId, portalCompartilhado: available }
  } catch (error) { await tx.query('ROLLBACK'); throw error } finally { tx.release() }
}
