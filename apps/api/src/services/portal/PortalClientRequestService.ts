import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import { getPool, isPgEnabled } from '../../db/client.js'
import { clientes } from '../../routes/clientes.js'

const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] as const
const changesSchema = z.object({
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()).optional(),
  telefone: z.string().trim().min(8).max(30).regex(/^[+()\d\s.-]+$/).refine(value => value.replace(/\D/g, '').length >= 8, 'Informe um telefone completo.').optional(),
  cidade: z.string().trim().min(2).max(150).optional(),
  uf: z.string().trim().toUpperCase().pipe(z.enum(states)).optional(),
}).strict()
const createSchema = z.object({
  tipo: z.enum(['atualizacao_cadastral', 'duvida', 'contato']),
  assunto: z.string().trim().min(3).max(160),
  mensagem: z.string().trim().min(3).max(3000),
  alteracoes: changesSchema.optional(),
}).strict().superRefine((value, ctx) => {
  const fields = Object.keys(value.alteracoes || {})
  if (value.tipo === 'atualizacao_cadastral' && !fields.length) ctx.addIssue({ code: 'custom', path: ['alteracoes'], message: 'Informe ao menos um dado para corrigir.' })
  if (value.tipo !== 'atualizacao_cadastral' && fields.length) ctx.addIssue({ code: 'custom', path: ['alteracoes'], message: 'Dados cadastrais exigem um pedido de correção.' })
})
const reviewSchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  status: z.enum(['em_atendimento', 'concluida', 'cancelada']),
  resposta: z.string().trim().max(3000).optional(),
  aplicarAlteracoes: z.boolean().default(false),
}).strict().superRefine((value, ctx) => {
  if (['concluida','cancelada'].includes(value.status) && !value.resposta?.trim()) ctx.addIssue({ code: 'custom', path: ['resposta'], message: 'Explique ao cliente o resultado do atendimento.' })
  if (value.aplicarAlteracoes && value.status !== 'concluida') ctx.addIssue({ code: 'custom', path: ['status'], message: 'A aplicação dos dados exige concluir a conferência.' })
})
const metadataSchema = z.object({
  baseProfile: z.record(z.union([z.string(), z.null()])), cadastroAtualizado: z.boolean(),
  actorId: z.string().optional(), respondidoEm: z.string().datetime().optional(),
}).strict()
const idempotencySchema = z.string().min(8).max(200).regex(/^[A-Za-z0-9_.:-]+$/)
export type PortalClientChanges = z.infer<typeof changesSchema>
export interface PortalClientRequest {
  id: string; clienteId: string; tipo: 'atualizacao_cadastral' | 'duvida' | 'contato'; assunto: string; mensagem: string
  alteracoes: PortalClientChanges; status: 'aberta' | 'em_atendimento' | 'concluida' | 'cancelada'
  resposta?: string; criadoEm: string; updatedAt: string; cadastroAtualizado: boolean; respondidoEm?: string
}
export class PortalClientRequestError extends Error {
  constructor(message: string, readonly statusCode = 400, readonly code = 'PORTAL_REQUEST_INVALID') { super(message) }
}
const iso = (value: string | Date) => new Date(value).toISOString()
const scalar = (value: unknown): string | null => typeof value === 'string' ? value : null
const cache = new Map<string, Map<string, PortalClientRequest>>()
function publicRequest(row: Record<string, any>): PortalClientRequest {
  return { id: row.id, clienteId: row.cliente_id, tipo: row.tipo, assunto: row.assunto, mensagem: row.mensagem,
    alteracoes: changesSchema.parse(row.alteracoes || {}), status: row.status, resposta: row.resposta || undefined,
    criadoEm: iso(row.created_at), updatedAt: iso(row.updated_at), cadastroAtualizado: row.metadata?.cadastroAtualizado === true,
    respondidoEm: typeof row.metadata?.respondidoEm === 'string' ? row.metadata.respondidoEm : undefined }
}
function validated<T>(schema: z.ZodType<T, z.ZodTypeDef, any>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new PortalClientRequestError(parsed.error.issues.map(issue => issue.message).join(' '))
  return parsed.data
}
function remember(value: PortalClientRequest) {
  const client = cache.get(value.clienteId) || new Map<string, PortalClientRequest>()
  client.set(value.id, structuredClone(value)); cache.set(value.clienteId, client)
  while (client.size > 200) client.delete(client.keys().next().value!)
}
async function audit(tx: PoolClient, value: PortalClientRequest, actorId: string, action: string) {
  const payload = { requestId: value.id, tipo: value.tipo, status: value.status, cadastroAtualizado: value.cadastroAtualizado }
  await tx.query('INSERT INTO audit_log(ator,acao,recurso,dados_depois) VALUES($1,$2,$3,$4)', [actorId, action, `cliente:${value.clienteId}`, JSON.stringify(payload)])
  await tx.query('INSERT INTO portal_evento(cliente_id,tipo,canal,detalhes) VALUES($1,$2,$3,$4)', [value.clienteId, action, actorId === value.clienteId ? 'web' : 'consultor', JSON.stringify(payload)])
}

/** Pedidos do cliente são conferidos pela equipe antes de modificar o cadastro. */
export class PortalClientRequestService {
  constructor(private options: { pool?: Pool; pgEnabled?: () => boolean; mirror?: boolean } = {}) {}
  private pool(): Pool {
    if (!(this.options.pgEnabled || isPgEnabled)()) throw new PortalClientRequestError('O atendimento está temporariamente indisponível. Tente novamente.', 503)
    return this.options.pool || getPool()
  }
  async list(clienteId: string): Promise<PortalClientRequest[]> {
    const rows = (await this.pool().query("SELECT * FROM portal_client_request WHERE cliente_id=$1 ORDER BY CASE WHEN status IN ('aberta','em_atendimento') THEN 0 ELSE 1 END,created_at DESC,id DESC LIMIT 200", [clienteId])).rows
    const result = rows.map(publicRequest)
    if (this.options.mirror !== false) for (const value of result) remember(value)
    return result
  }
  async create(clienteId: string, input: unknown, key: string): Promise<{ request: PortalClientRequest; replayed: boolean }> {
    const body = validated(createSchema, input)
    const idempotencyKey = validated(idempotencySchema, key)
    const changes = body.alteracoes || {}
    const tx = await this.pool().connect()
    let result: PortalClientRequest
    try {
      await tx.query('BEGIN')
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`portal-client-request:${clienteId}`])
      const prior = (await tx.query('SELECT * FROM portal_client_request WHERE cliente_id=$1 AND idempotency_key=$2', [clienteId, idempotencyKey])).rows[0]
      if (prior) {
        const value = publicRequest(prior)
        if (value.tipo !== body.tipo || value.assunto !== body.assunto || value.mensagem !== body.mensagem || JSON.stringify(value.alteracoes) !== JSON.stringify(changes)) throw new PortalClientRequestError('Este comprovante já pertence a outro pedido. Inicie um novo envio.', 409)
        await tx.query('COMMIT'); return { request: value, replayed: true }
      }
      const owner = (await tx.query("SELECT payload FROM cliente WHERE id=$1 AND (payload->'identityMerge'->>'status') IS DISTINCT FROM 'merged' FOR SHARE", [clienteId])).rows[0]
      if (!owner) throw new PortalClientRequestError('Cliente não encontrado.', 404)
      const active = (await tx.query("SELECT count(*)::int total FROM portal_client_request WHERE cliente_id=$1 AND status IN ('aberta','em_atendimento')", [clienteId])).rows[0].total
      if (active >= 20) throw new PortalClientRequestError('Há 20 pedidos em atendimento. Acompanhe um pedido existente ou fale com a equipe.', 429)
      const metadata = metadataSchema.parse({ baseProfile: Object.fromEntries(Object.keys(changes).map(field => [field, scalar(owner.payload?.[field])])), cadastroAtualizado: false })
      const now = new Date().toISOString()
      const row = (await tx.query(`INSERT INTO portal_client_request(id,cliente_id,tipo,assunto,mensagem,alteracoes,status,idempotency_key,metadata,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,'aberta',$7,$8,$9,$9) RETURNING *`, [`pr-${randomUUID()}`, clienteId, body.tipo, body.assunto, body.mensagem, JSON.stringify(changes), idempotencyKey, JSON.stringify(metadata), now])).rows[0]
      result = publicRequest(row)
      await audit(tx, result, clienteId, 'portal_atendimento_solicitado')
      await tx.query('COMMIT')
    } catch (error) { await tx.query('ROLLBACK'); throw error } finally { tx.release() }
    if (this.options.mirror !== false) remember(result)
    return { request: result, replayed: false }
  }
  async review(clienteId: string, id: string, input: unknown, actorId: string): Promise<PortalClientRequest> {
    if (!input || typeof input !== 'object' || !('expectedUpdatedAt' in input)) throw new PortalClientRequestError('Atualize o pedido antes de responder.', 428)
    const body = validated(reviewSchema, input)
    const tx = await this.pool().connect()
    let result: PortalClientRequest; let applied: PortalClientChanges | undefined
    try {
      await tx.query('BEGIN')
      // Mesma ordem de locks em todas as aplicações cadastrais.
      const owner = (await tx.query("SELECT payload FROM cliente WHERE id=$1 AND (payload->'identityMerge'->>'status') IS DISTINCT FROM 'merged' FOR UPDATE", [clienteId])).rows[0]
      if (!owner) throw new PortalClientRequestError('Cliente não encontrado.', 404)
      const row = (await tx.query('SELECT * FROM portal_client_request WHERE cliente_id=$1 AND id=$2 FOR UPDATE', [clienteId, id])).rows[0]
      if (!row) throw new PortalClientRequestError('Pedido não encontrado.', 404)
      if (iso(row.updated_at) !== iso(body.expectedUpdatedAt)) throw new PortalClientRequestError('Este pedido foi atualizado. Recarregue antes de responder.', 409, 'PORTAL_REQUEST_CONFLICT')
      if (['concluida','cancelada'].includes(row.status)) throw new PortalClientRequestError('Este pedido já foi encerrado. Preserve o histórico e abra um novo atendimento.', 409)
      const metadata = validated(metadataSchema, row.metadata)
      if (body.aplicarAlteracoes) {
        if (row.tipo !== 'atualizacao_cadastral') throw new PortalClientRequestError('Este pedido não contém uma correção cadastral.')
        applied = validated(changesSchema, row.alteracoes)
        for (const field of Object.keys(applied)) {
          if (scalar(owner.payload?.[field]) !== metadata.baseProfile[field]) throw new PortalClientRequestError('O cadastro mudou depois deste pedido. Confira os dados atuais antes de fazer a correção pelo CRM.', 409, 'PORTAL_PROFILE_CONFLICT')
        }
        // Atualiza somente campos explicitamente permitidos; preserva todo o restante do cadastro.
        await tx.query(`UPDATE cliente SET payload=coalesce(payload,'{}'::jsonb)||$2::jsonb,
          email=CASE WHEN $2::jsonb ? 'email' THEN $2::jsonb->>'email' ELSE email END,
          telefone=CASE WHEN $2::jsonb ? 'telefone' THEN $2::jsonb->>'telefone' ELSE telefone END,
          cidade=CASE WHEN $2::jsonb ? 'cidade' THEN $2::jsonb->>'cidade' ELSE cidade END,
          uf=CASE WHEN $2::jsonb ? 'uf' THEN $2::jsonb->>'uf' ELSE uf END,
          atualizado_em=now() WHERE id=$1`, [clienteId, JSON.stringify(applied)])
        await tx.query("INSERT INTO audit_log(ator,acao,recurso,dados_antes,dados_depois) VALUES($1,'portal_cadastro_atualizado',$2,$3,$4)", [actorId, `cliente:${clienteId}`, JSON.stringify(metadata.baseProfile), JSON.stringify(applied)])
      }
      const now = new Date(Math.max(Date.now(), Date.parse(iso(row.updated_at)) + 1)).toISOString()
      const nextMetadata = metadataSchema.parse({ ...metadata, actorId, respondidoEm: now, cadastroAtualizado: Boolean(applied) })
      const updated = (await tx.query('UPDATE portal_client_request SET status=$3,resposta=$4,metadata=$5,updated_at=$6 WHERE cliente_id=$1 AND id=$2 RETURNING *', [clienteId,id,body.status,body.resposta || null,JSON.stringify(nextMetadata),now])).rows[0]
      result = publicRequest(updated)
      await audit(tx, result, actorId, 'portal_atendimento_respondido')
      await tx.query('COMMIT')
    } catch (error) { await tx.query('ROLLBACK'); throw error } finally { tx.release() }
    if (this.options.mirror !== false) {
      remember(result)
      const client = clientes.get(clienteId)
      if (client && applied) Object.assign(client, applied)
    }
    return result
  }
  async cancel(clienteId: string, id: string, expectedUpdatedAt: string): Promise<PortalClientRequest> {
    const version = validated(z.string().datetime({ offset: true }), expectedUpdatedAt)
    const tx = await this.pool().connect()
    let result: PortalClientRequest
    try {
      await tx.query('BEGIN')
      const row = (await tx.query('SELECT * FROM portal_client_request WHERE cliente_id=$1 AND id=$2 FOR UPDATE', [clienteId,id])).rows[0]
      if (!row) throw new PortalClientRequestError('Pedido não encontrado.',404)
      if (iso(row.updated_at) !== iso(version)) throw new PortalClientRequestError('O atendimento mudou. Recarregue antes de cancelar.',409)
      if (row.status !== 'aberta') throw new PortalClientRequestError('O pedido já está em atendimento ou encerrado. Fale com a equipe para alterar.',409)
      const now = new Date(Math.max(Date.now(),Date.parse(iso(row.updated_at))+1)).toISOString()
      result = publicRequest((await tx.query("UPDATE portal_client_request SET status='cancelada',resposta='Cancelado a pedido do cliente.',updated_at=$3 WHERE cliente_id=$1 AND id=$2 RETURNING *",[clienteId,id,now])).rows[0])
      await audit(tx,result,clienteId,'portal_atendimento_cancelado')
      await tx.query('COMMIT')
    } catch (error) { await tx.query('ROLLBACK'); throw error } finally { tx.release() }
    if (this.options.mirror !== false) remember(result)
    return result
  }
}
export const portalClientRequestService = new PortalClientRequestService()
