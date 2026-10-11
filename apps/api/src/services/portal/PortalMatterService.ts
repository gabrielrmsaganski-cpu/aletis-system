import { createHash, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import { getPool, isPgEnabled } from '../../db/client.js'
import {
  portalMatterCreateSchema, portalMatterUpdateSchema, portalMatterIdSchema,
  type PortalMatter, type PortalMatterPlan, type PortalMatterEvent, type PortalMatterList,
  type PortalMatterHistory, type PortalMatterRevisionPage, type PortalMatterSummary,
} from './PortalMatterTypes.js'

const idempotencySchema = z.string().min(8).max(200).regex(/^[A-Za-z0-9_.:-]+$/)
const cursorSchema = z.object({ data: z.string().datetime({ offset: true }), id: portalMatterIdSchema }).strict()
const revisionCursorSchema = z.coerce.number().int().min(1).max(2147483647)
const HISTORY_PAGE_SIZE = 200
const MAX_MATTERS = 200
const statusLabels: Record<PortalMatterPlan['status'], string> = {
  nao_iniciado: 'Não iniciado', em_andamento: 'Em andamento', aguardando_cliente: 'Aguardando o cliente',
  aguardando_terceiro: 'Aguardando terceiro', concluido: 'Concluído', cancelado: 'Cancelado',
}

export class PortalMatterError extends Error {
  constructor(message: string, readonly statusCode = 400, readonly code = 'PORTAL_MATTER_INVALID') { super(message) }
}
function validated<T>(schema: z.ZodType<T, z.ZodTypeDef, any>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new PortalMatterError(parsed.error.issues.map(issue => issue.message).join(' '))
  return parsed.data
}
const iso = (value: string | Date): string => new Date(value).toISOString()
const fingerprint = (value: PortalMatterPlan): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const ended = (status: PortalMatterPlan['status']): boolean => status === 'concluido' || status === 'cancelado'

function projection(row: Record<string, any>, today: string): PortalMatter {
  // Projeção explícita: autoria, recibos, metadados e demanda interna nunca entram no DTO.
  const plan = portalMatterCreateSchema.parse(row.payload)
  const active = plan.marcos.filter(item => item.status !== 'cancelado')
  const completed = active.filter(item => item.status === 'concluido').length
  return {
    ...plan, id: row.id, clienteId: row.cliente_id,
    criadoEm: iso(row.created_at), atualizadoEm: iso(row.updated_at),
    publicadoEm: row.published_at ? iso(row.published_at) : undefined,
    progresso: { concluidos: completed, total: active.length, percentual: active.length ? Math.round(completed / active.length * 100) : null },
    atrasado: !ended(plan.status) && Boolean(plan.prazo && plan.prazo < today),
  }
}
function summary(values: PortalMatter[]): PortalMatterSummary {
  const published = values.filter(value => value.visibilidade === 'publicado')
  const statusCount = (status: PortalMatter['status']) => published.filter(value => value.status === status).length
  const considered = published.filter(value => value.status !== 'cancelado')
  const completed = considered.reduce((sum, value) => sum + value.progresso.concluidos, 0)
  const active = considered.reduce((sum, value) => sum + value.progresso.total, 0)
  return {
    total: published.length, naoIniciados: statusCount('nao_iniciado'), emAndamento: statusCount('em_andamento'),
    aguardandoCliente: statusCount('aguardando_cliente'), aguardandoTerceiro: statusCount('aguardando_terceiro'),
    concluidos: statusCount('concluido'), cancelados: statusCount('cancelado'), atrasados: published.filter(value => value.atrasado).length,
    marcosConcluidos: completed, marcosAtivos: active, progressoPercentual: active ? Math.round(completed / active * 100) : null,
  }
}
function eventProjection(row: Record<string, any>): PortalMatterEvent {
  return { id: row.id, assuntoId: row.assunto_id, titulo: row.titulo, descricao: row.descricao,
    data: iso(row.created_at), tipo: row.tipo, versao: row.versao, marcoId: row.marco_id || undefined }
}
function readCursor(cursor?: string): z.infer<typeof cursorSchema> | undefined {
  if (!cursor) return undefined
  if (cursor.length > 600 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new PortalMatterError('O marcador do histórico é inválido.')
  try { return validated(cursorSchema, JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))) }
  catch { throw new PortalMatterError('O marcador do histórico é inválido.') }
}
const encodeCursor = (value: PortalMatterEvent) => Buffer.from(JSON.stringify({ data: value.data, id: value.id })).toString('base64url')

/** Planejamento público separado da demanda interna; PG é a única fonte de leitura. */
export class PortalMatterService {
  constructor(private options: { pool?: Pool; pgEnabled?: () => boolean; now?: () => Date } = {}) {}
  private pool(): Pool {
    if (!(this.options.pgEnabled || isPgEnabled)()) throw new PortalMatterError('O acompanhamento está temporariamente indisponível. Tente novamente.', 503, 'PORTAL_MATTER_UNAVAILABLE')
    return this.options.pool || getPool()
  }
  private now(): Date { return (this.options.now || (() => new Date()))() }
  private today(): string {
    // Prazos são dias de calendário da operação em Mato Grosso, sem vencer à meia-noite UTC.
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit' }).format(this.now())
  }
  private async owner(tx: PoolClient, clienteId: string): Promise<void> {
    const row = (await tx.query("SELECT id FROM cliente WHERE id=$1 AND (payload->'identityMerge'->>'status') IS DISTINCT FROM 'merged' FOR SHARE", [clienteId])).rows[0]
    if (!row) throw new PortalMatterError('Cliente não encontrado.', 404)
  }
  private async demand(tx: PoolClient, clienteId: string, demandaId?: string): Promise<void> {
    if (!demandaId) return
    const row = (await tx.query('SELECT id FROM cliente_demanda WHERE id=$1 AND cliente_id=$2 FOR SHARE', [demandaId, clienteId])).rows[0]
    if (!row) throw new PortalMatterError('Assunto interno não encontrado para este cliente.', 404)
  }
  private checkMilestones(plan: PortalMatterPlan, previous?: PortalMatter): void {
    for (const milestone of plan.marcos) {
      if (milestone.concluidoEm && Date.parse(milestone.concluidoEm) > this.now().getTime()) throw new PortalMatterError('A data de conclusão não pode estar no futuro.')
    }
    if (previous?.visibilidade !== 'publicado') return
    if (plan.visibilidade !== 'publicado') throw new PortalMatterError('Um assunto publicado mantém seu histórico. Atualize a informação ou cancele o assunto.', 409)
    const current = new Map(plan.marcos.map(milestone => [milestone.id, milestone]))
    for (const milestone of previous.marcos) {
      const next = current.get(milestone.id)
      if (!next) throw new PortalMatterError('Preserve as etapas já publicadas. Cancele uma etapa que deixou de ser necessária.', 409)
      if (milestone.status === 'concluido' && (next.status !== 'concluido' || iso(next.concluidoEm!) !== iso(milestone.concluidoEm!))) throw new PortalMatterError('Uma etapa concluída publicada mantém a data e o registro da conclusão.', 409)
    }
  }
  private async audit(tx: PoolClient, value: PortalMatter, actorId: string, action: string, version: number): Promise<void> {
    const details = JSON.stringify({ assuntoId: value.id, versao: version, status: value.status, visibilidade: value.visibilidade })
    await tx.query('INSERT INTO audit_log(ator,acao,recurso,dados_depois) VALUES($1,$2,$3,$4)', [actorId, action, `cliente:${value.clienteId}`, details])
    await tx.query('INSERT INTO portal_evento(cliente_id,tipo,canal,detalhes) VALUES($1,$2,$3,$4)', [value.clienteId, action, 'consultor', details])
  }
  private async appendRevision(tx: PoolClient, value: PortalMatter, actorId: string, version: number, previous?: PortalMatter): Promise<void> {
    // O snapshot vem somente da projeção validada, nunca de dados operacionais internos.
    await tx.query('INSERT INTO portal_matter_revision(assunto_id,cliente_id,versao,snapshot,actor_id,created_at) VALUES($1,$2,$3,$4,$5,$6)',
      [value.id, value.clienteId, version, JSON.stringify(value), actorId, value.atualizadoEm])
    if (value.visibilidade !== 'publicado') return
    const append = async (type: PortalMatterEvent['tipo'], title: string, description: string, milestoneId?: string) => {
      await tx.query('INSERT INTO portal_matter_event(id,assunto_id,cliente_id,versao,tipo,titulo,descricao,marco_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [`pme-${randomUUID()}`, value.id, value.clienteId, version, type, title, description, milestoneId || null, value.atualizadoEm])
    }
    const firstPublication = previous?.visibilidade !== 'publicado'
    if (firstPublication) await append('publicacao', `Assunto publicado: ${value.titulo}`, value.resumo)
    else {
      const changes: string[] = []
      if (previous.status !== value.status) changes.push(`Situação: ${statusLabels[value.status]}.`)
      if (previous.resumo !== value.resumo) changes.push(value.resumo)
      if (previous.proximoPasso !== value.proximoPasso) changes.push(value.proximoPasso ? `Próximo passo: ${value.proximoPasso}` : 'O próximo passo foi encerrado.')
      if (previous.prazo !== value.prazo) changes.push(value.prazo ? `Prazo informado: ${value.prazo.split('-').reverse().join('/')}.` : 'O prazo foi retirado para revisão pela equipe.')
      if (previous.responsavel !== value.responsavel) changes.push(value.responsavel ? `Responsável informado: ${value.responsavel}.` : 'Responsável em definição pela equipe.')
      await append('atualizacao', `Atualização: ${value.titulo}`, changes.join(' ') || 'O plano de etapas deste assunto foi atualizado pela equipe.')
    }
    const completedBefore = new Set(previous?.visibilidade === 'publicado' ? previous.marcos.filter(item => item.status === 'concluido').map(item => item.id) : [])
    for (const milestone of value.marcos) {
      if (milestone.status === 'concluido' && !completedBefore.has(milestone.id)) {
        await append('marco_concluido', `Conclusão registrada: ${milestone.titulo}`, `Conclusão informada em ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'America/Cuiaba'}).format(new Date(milestone.concluidoEm!))}.${milestone.descricao ? ` ${milestone.descricao}` : ''}`, milestone.id)
      }
    }
    if (value.status === 'concluido' && (firstPublication || previous?.status !== 'concluido')) await append('conclusao', `Conclusão informada: ${value.titulo}`, value.resumo)
  }
  private async events(tx: Pool | PoolClient, clienteId: string, cursor?: string, assuntoId?: string): Promise<PortalMatterHistory> {
    const position = readCursor(cursor)
    if (assuntoId) validated(portalMatterIdSchema, assuntoId)
    const rows = (await tx.query(`SELECT e.id,e.assunto_id,e.versao,e.tipo,e.titulo,e.descricao,e.marco_id,e.created_at FROM portal_matter_event e
      JOIN portal_matter_revision r ON (r.assunto_id,r.cliente_id,r.versao)=(e.assunto_id,e.cliente_id,e.versao)
      WHERE e.cliente_id=$1 AND r.snapshot->>'visibilidade'='publicado' AND ($2::text IS NULL OR e.assunto_id=$2)
        AND ($3::timestamptz IS NULL OR (e.created_at,e.id)<($3::timestamptz,$4::text))
      ORDER BY e.created_at DESC,e.id DESC LIMIT $5`, [clienteId, assuntoId || null, position?.data || null, position?.id || null, HISTORY_PAGE_SIZE + 1])).rows
    const values = rows.slice(0, HISTORY_PAGE_SIZE).map(eventProjection)
    return { eventos: values, proximoCursor: rows.length > HISTORY_PAGE_SIZE ? encodeCursor(values[values.length - 1]!) : null }
  }
  private async list(clienteId: string, publishedOnly: boolean): Promise<PortalMatterList> {
    validated(portalMatterIdSchema, clienteId)
    const tx = await this.pool().connect()
    try {
      await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      const rows = (await tx.query(`SELECT * FROM portal_matter WHERE cliente_id=$1 AND ($2::boolean=false OR visibilidade='publicado') ORDER BY updated_at DESC,id DESC LIMIT $3`, [clienteId, publishedOnly, MAX_MATTERS])).rows
      const values = rows.map(row => projection(row, this.today()))
      const history = await this.events(tx, clienteId)
      await tx.query('COMMIT')
      return { assuntos: values, eventos: history.eventos, resumo: summary(values), atualizadoEm: values[0]?.atualizadoEm || null, paginacaoEventos: { proximoCursor: history.proximoCursor } }
    } catch (error) { await tx.query('ROLLBACK'); throw error } finally { tx.release() }
  }
  async listPublic(clienteId: string): Promise<PortalMatterList> { return this.list(clienteId, true) }
  async listStaff(clienteId: string): Promise<PortalMatterList> { return this.list(clienteId, false) }
  async history(clienteId: string, cursor?: string, assuntoId?: string): Promise<PortalMatterHistory> {
    validated(portalMatterIdSchema, clienteId)
    return this.events(this.pool(), clienteId, cursor, assuntoId)
  }
  async versions(clienteId: string, assuntoId: string, cursor?: string): Promise<PortalMatterRevisionPage> {
    validated(portalMatterIdSchema, clienteId); validated(portalMatterIdSchema, assuntoId)
    const position = cursor ? validated(revisionCursorSchema, cursor) : null
    const rows = (await this.pool().query(`SELECT versao,snapshot,created_at FROM portal_matter_revision WHERE cliente_id=$1 AND assunto_id=$2
      AND ($3::integer IS NULL OR versao<$3) ORDER BY versao DESC LIMIT 51`, [clienteId, assuntoId, position])).rows
    const values = rows.slice(0, 50).map(row => {
      const snapshot = row.snapshot as Record<string, any>
      const { id, clienteId: ownerId, criadoEm, atualizadoEm, publicadoEm, progresso: _progress, atrasado: _late, ...plan } = snapshot
      return { versao: row.versao, data: iso(row.created_at), assunto: projection({ id, cliente_id: ownerId, created_at: criadoEm, updated_at: atualizadoEm, published_at: publicadoEm, payload: plan }, this.today()) }
    })
    return { versoes: values, proximoCursor: rows.length > 50 ? String(values[values.length - 1]!.versao) : null }
  }
  async create(clienteId: string, input: unknown, key: string, actorId: string): Promise<{ assunto: PortalMatter; replayed: boolean }> {
    validated(portalMatterIdSchema, clienteId)
    const plan = validated(portalMatterCreateSchema, input)
    const idempotencyKey = validated(idempotencySchema, key)
    this.checkMilestones(plan)
    const tx = await this.pool().connect()
    try {
      await tx.query('BEGIN')
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`portal-matter:${clienteId}`])
      await this.owner(tx, clienteId)
      const prior = (await tx.query('SELECT * FROM portal_matter WHERE cliente_id=$1 AND idempotency_key=$2', [clienteId, idempotencyKey])).rows[0]
      if (prior) {
        if (prior.create_fingerprint !== fingerprint(plan)) throw new PortalMatterError('Este comprovante já pertence a outro assunto. Inicie um novo cadastro.', 409, 'PORTAL_MATTER_CONFLICT')
        await tx.query('COMMIT'); return { assunto: projection(prior, this.today()), replayed: true }
      }
      await this.demand(tx, clienteId, plan.demandaId)
      const count = (await tx.query('SELECT count(*)::integer total FROM portal_matter WHERE cliente_id=$1', [clienteId])).rows[0].total
      if (count >= MAX_MATTERS) throw new PortalMatterError('O cliente já possui 200 assuntos. Atualize um assunto existente.', 429)
      const now = this.now().toISOString()
      const row = (await tx.query(`INSERT INTO portal_matter(id,cliente_id,demanda_id,status,visibilidade,payload,versao,idempotency_key,create_fingerprint,created_at,updated_at,published_at)
        VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$9,$10) RETURNING *`, [`pm-${randomUUID()}`, clienteId, plan.demandaId || null, plan.status, plan.visibilidade, JSON.stringify(plan), idempotencyKey, fingerprint(plan), now, plan.visibilidade === 'publicado' ? now : null])).rows[0]
      const value = projection(row, this.today())
      await this.appendRevision(tx, value, actorId, 1)
      await this.audit(tx, value, actorId, 'portal_assunto_criado', 1)
      await tx.query('COMMIT')
      return { assunto: value, replayed: false }
    } catch (error) { await tx.query('ROLLBACK'); throw error } finally { tx.release() }
  }
  async update(clienteId: string, assuntoId: string, input: unknown, actorId: string): Promise<PortalMatter> {
    validated(portalMatterIdSchema, clienteId); validated(portalMatterIdSchema, assuntoId)
    if (!input || typeof input !== 'object' || !('expectedUpdatedAt' in input)) throw new PortalMatterError('Atualize o assunto antes de salvar uma revisão.', 428)
    const { expectedUpdatedAt, ...plan } = validated(portalMatterUpdateSchema, input)
    const tx = await this.pool().connect()
    try {
      await tx.query('BEGIN')
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`portal-matter:${clienteId}`])
      await this.owner(tx, clienteId)
      const row = (await tx.query('SELECT * FROM portal_matter WHERE cliente_id=$1 AND id=$2 FOR UPDATE', [clienteId, assuntoId])).rows[0]
      if (!row) throw new PortalMatterError('Assunto não encontrado.', 404)
      const previous = projection(row, this.today())
      if (previous.atualizadoEm !== iso(expectedUpdatedAt)) throw new PortalMatterError('Este assunto mudou. Recarregue antes de salvar para preservar a atualização da equipe.', 409, 'PORTAL_MATTER_CONFLICT')
      this.checkMilestones(plan, previous)
      await this.demand(tx, clienteId, plan.demandaId)
      if (fingerprint(plan) === fingerprint(portalMatterCreateSchema.parse(row.payload))) {
        await tx.query('COMMIT'); return previous
      }
      const now = new Date(Math.max(this.now().getTime(), Date.parse(previous.atualizadoEm) + 1)).toISOString()
      const version = row.versao + 1
      const updated = (await tx.query(`UPDATE portal_matter SET demanda_id=$3,status=$4,visibilidade=$5,payload=$6,versao=$7,updated_at=$8,
        published_at=CASE WHEN $5='publicado' THEN coalesce(published_at,$8) ELSE published_at END WHERE cliente_id=$1 AND id=$2 RETURNING *`,
        [clienteId, assuntoId, plan.demandaId || null, plan.status, plan.visibilidade, JSON.stringify(plan), version, now])).rows[0]
      const value = projection(updated, this.today())
      await this.appendRevision(tx, value, actorId, version, previous)
      await this.audit(tx, value, actorId, 'portal_assunto_atualizado', version)
      await tx.query('COMMIT')
      return value
    } catch (error) { await tx.query('ROLLBACK'); throw error } finally { tx.release() }
  }
}

export const portalMatterService = new PortalMatterService()
