import { createHash } from 'node:crypto'
import type { PoolClient } from 'pg'
import { z } from 'zod'

import { getPool, isPgEnabled } from '../../../db/client.js'
import { AlixMissionService, getAlixMissionService, type AlixMissionView } from './AlixMissionService.js'
import { OPERATIONAL_ACTIVE_CLIENT_STAGES, operationalDocumentaryRecordSchema, readOperationalDocumentarySource, type OperationalActor, type OperationalDocumentaryRecord } from './OperationalDocumentarySource.js'

export type OperationalSourceKey = 'clients' | 'demands' | 'proposals' | 'documentary'
export interface OperationalCoverageSource {
  key: OperationalSourceKey
  label: string
  status: 'available' | 'unavailable'
  origin: 'postgres' | 'memory'
  records: number | null
  detail?: string
}
export interface OperationalItem {
  id: string
  /** Versão dos fatos desta prioridade, independente dos outros clientes. */
  fingerprint?: string
  kind: string
  priority: 'critical' | 'attention' | 'info'
  title: string
  reason: string
  nextAction: string
  clienteId: string
  clienteName?: string
  entity: { type: 'client' | 'demand' | 'checklist' | 'proposal' | 'document_finding' | 'document_field' | 'fact_ledger' | 'drive_analysis'; id: string; parentId?: string }
  dueDate?: string
  owner?: string
  to: string
  sources: Array<{ kind: string; id: string; label: string; updatedAt?: string; documentId?: string; revision?: string; excerpt?: string; page?: number; sheet?: string; contentHash?: string; chunkId?: string; quoteHash?: string; excerptHash?: string }>
}
export interface OperationalPlan {
  generatedAt: string
  referenceDate: string
  timeZone: 'America/Cuiaba'
  fingerprint: string
  scope: { clienteId?: string }
  coverage: { status: 'complete' | 'partial' | 'unavailable'; sources: OperationalCoverageSource[] }
  counts: {
    clients: number | null
    activeClients: number | null
    activeDemands: number | null
    openProposals: number | null
    priorities: number
    overdue: number
    dueToday: number
    missingNextAction: number
    missingOwner: number
  }
  items: OperationalItem[]
}
export interface PreparedOperationalPlan { mission: AlixMissionView; plan: OperationalPlan; reused: boolean }
export type OperationalRecords = Record<string, unknown>[]
export interface OperationalReadResult { records: OperationalRecords; origin: 'postgres' | 'memory' }
export interface OperationalPlanDependencies {
  read: (key: OperationalSourceKey, clienteId?: string, actor?: OperationalActor) => Promise<OperationalReadResult>
  missions: AlixMissionService
  now: () => Date
  lock: <T>(key: string, task: () => Promise<T>) => Promise<T>
}

const labels: Record<OperationalSourceKey, string> = { clients: 'Cadastro de clientes', demands: 'Demandas e checklists', proposals: 'Propostas', documentary: 'Pendências documentais e revisão de dados' }
const keys: OperationalSourceKey[] = ['clients', 'demands', 'proposals', 'documentary']
const activeStages = new Set(OPERATIONAL_ACTIVE_CLIENT_STAGES)
const activeDemandStates = new Set(['nova', 'em_analise', 'em_proposta', 'negociacao', 'aprovada'])
const openProposalStates = new Set(['rascunho', 'revisao', 'em_analise', 'em_revisao', 'enviada', 'gerada', 'negociacao'])
const readRecordSchema = z.object({ id: z.string().trim().min(1) }).passthrough()
const preparationSchema = z.object({ clienteId: z.string().trim().min(1).max(180).optional(), actorId: z.string().trim().min(1).max(180).optional() })

const clean = (value: unknown, max = 240): string => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const state = (value: unknown): string => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const encoded = (value: string): string => encodeURIComponent(value)

export function operationalDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (name: string) => parts.find(item => item.type === name)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function dueDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const raw = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00.000Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw ? raw : undefined
  }
  // Timestamps precisam declarar fuso; datas ambíguas não viram prazos.
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return undefined
  const calendarDate = raw.slice(0, 10)
  if (dueDate(calendarDate) !== calendarDate) return undefined
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? undefined : operationalDate(parsed)
}

function sourceTimestamp(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString()
  return clean(value, 60) || undefined
}

function proposalRecord(value: Record<string, unknown>): Record<string, unknown> {
  const intelligent = Boolean(value.secoes && typeof value.secoes === 'object')
  return {
    ...value,
    clienteId: clean(value.clienteId) || clean(object(value.cliente).id),
    titulo: clean(value.titulo) || clean(object(object(value.secoes).capa).titulo),
    // Propostas inteligentes legadas registram a geração no documento, sem
    // coluna de status. A geração não é evidência de envio ou aceitação.
    status: clean(value.status) || (intelligent && dueDate(value.dataGeracao) ? 'gerada' : undefined),
    kind: intelligent ? 'inteligente' : value.kind,
  }
}

/** Projeção sem modelo: cada pendência aponta para o registro que a originou. */
export function projectOperationalPlan(input: {
  records: Partial<Record<OperationalSourceKey, OperationalRecords>>
  coverage: OperationalCoverageSource[]
  now: Date
  clienteId?: string
}): OperationalPlan {
  const today = operationalDate(input.now)
  const horizon = new Date(`${today}T12:00:00.000Z`)
  horizon.setUTCDate(horizon.getUTCDate() + 7)
  const horizonDate = horizon.toISOString().slice(0, 10)
  const byId = (rows: OperationalRecords | undefined) => [...new Map((rows || []).map(row => [clean(row.id), row])).values()]
  const clients = byId(input.records.clients).filter(row => !input.clienteId || row.id === input.clienteId)
  const knownClients = new Map(clients.map(row => [clean(row.id), row]))
  const activeClients = clients.filter(row => activeStages.has(state(row.estagio)))
  const acceptsClient = (id: string) => Boolean(id) && (!input.clienteId || id === input.clienteId)
    && (!knownClients.has(id) || activeStages.has(state(knownClients.get(id)?.estagio)))
  const demands = byId(input.records.demands).filter(row => acceptsClient(clean(row.clienteId)) && activeDemandStates.has(state(row.status)))
  const proposals = byId(input.records.proposals).map(proposalRecord).filter(row => acceptsClient(clean(row.clienteId)) && openProposalStates.has(state(row.status)))
  const items: OperationalItem[] = []
  const name = (id: string) => clean(knownClients.get(id)?.nome, 100) || undefined
  const path = (id: string) => `/clientes/${encoded(id)}`
  const urgency = (date?: string): OperationalItem['priority'] => date && date < today ? 'critical' : date === today ? 'attention' : 'info'
  const dateReason = (date: string) => date < today ? `Prazo registrado em ${date}, anterior a hoje.` : date === today ? `Prazo registrado para hoje (${date}).` : `Prazo registrado em ${date}.`
  const source = (kind: string, row: Record<string, unknown>, label: string) => [{ kind, id: clean(row.id), label, updatedAt: sourceTimestamp(row.ultimaAtualizacao ?? row.atualizadoEm) }]

  for (const client of activeClients) {
    const id = clean(client.id)
    const action = object(client.proximaAcao)
    const description = clean(action.descricao)
    const date = dueDate(action.data)
    const base = { clienteId: id, clienteName: name(id), entity: { type: 'client' as const, id }, owner: clean(client.consultor) || undefined, to: path(id), sources: source('client', client, 'Próxima ação no CRM') }
    if (description && date && date <= horizonDate) {
      items.push({ ...base, id: `client-action:${id}`, kind: 'client_action', priority: urgency(date), title: description, reason: dateReason(date), nextAction: description, dueDate: date })
    } else if (!description || !date) {
      items.push({ ...base, id: `client-missing-action:${id}`, kind: 'client_missing_action', priority: 'attention', title: 'Definir o próximo passo do cliente', reason: !description ? 'O cadastro ativo não informa a descrição da próxima ação.' : 'A próxima ação cadastrada não tem um prazo válido.', nextAction: description ? `Definir prazo para: ${description}` : 'Registrar a próxima ação e seu prazo no CRM.' })
    }
  }
  for (const demand of demands) {
    const id = clean(demand.id)
    const clienteId = clean(demand.clienteId)
    const title = clean(demand.titulo, 160) || 'Demanda sem título'
    const owner = clean(demand.responsavel) || undefined
    const date = dueDate(demand.proximaAcaoEm)
    const deadline = dueDate(demand.prazoAlvo)
    const action = clean(demand.proximaAcao)
    const base = { clienteId, clienteName: name(clienteId), entity: { type: 'demand' as const, id }, owner, to: `${path(clienteId)}?area=negociacao&dealTab=demandas&demanda=${encoded(id)}`, sources: source('demand', demand, title) }
    if (action && date && date <= horizonDate) items.push({ ...base, id: `demand-action:${id}`, kind: 'demand_action', priority: urgency(date), title: `${title} · ${action}`, reason: dateReason(date), nextAction: action, dueDate: date })
    if (!action || !date) items.push({ ...base, id: `demand-missing-action:${id}`, kind: 'demand_missing_action', priority: 'attention', title: `${title} · próximo passo pendente`, reason: !action ? 'A demanda ativa não tem próxima ação registrada.' : 'A próxima ação da demanda não tem prazo válido.', nextAction: action ? `Definir prazo para: ${action}` : 'Registrar a próxima ação desta demanda e seu prazo.' })
    if (deadline && deadline <= horizonDate && deadline !== date) items.push({ ...base, id: `demand-deadline:${id}`, kind: 'demand_deadline', priority: urgency(deadline), title: `${title} · prazo da demanda`, reason: dateReason(deadline), nextAction: 'Revisar o andamento da demanda e atualizar a previsão registrada.', dueDate: deadline })
    if (!owner) items.push({ ...base, id: `demand-owner:${id}`, kind: 'demand_missing_owner', priority: 'attention', title: `${title} · sem responsável`, reason: 'A demanda ativa não possui responsável registrado.', nextAction: 'Definir o responsável por esta demanda.' })
    const checklist = Array.isArray(demand.checklist) ? demand.checklist : []
    for (const raw of checklist) {
      const item = object(raw)
      const itemId = clean(item.id)
      const itemDate = dueDate(item.prazo)
      if (!itemId || item.concluido === true || (itemDate && itemDate > horizonDate)) continue
      items.push({ ...base, id: `checklist:${id}:${itemId}`, kind: itemDate ? 'checklist_due' : 'checklist_pending', priority: itemDate ? urgency(itemDate) : 'attention', title: `${title} · ${clean(item.titulo, 180) || 'Item do checklist'}`, reason: itemDate ? dateReason(itemDate) : 'Item do checklist ainda pendente, sem prazo definido.', nextAction: clean(item.titulo, 180) || 'Revisar este item do checklist.', dueDate: itemDate, owner: clean(item.responsavel) || owner, entity: { type: 'checklist', id: itemId, parentId: id }, sources: [...base.sources, { kind: 'checklist', id: itemId, label: clean(item.titulo, 180) || 'Item do checklist' }] })
    }
  }
  for (const raw of byId(input.records.documentary)) {
    const parsed = operationalDocumentaryRecordSchema.safeParse(raw)
    if (!parsed.success) continue
    const finding: OperationalDocumentaryRecord = parsed.data
    // Uma evidência só aparece na carteira de um cliente ativo conhecido.
    if (!knownClients.has(finding.clienteId) || !acceptsClient(finding.clienteId)) continue
    const kind = finding.source.kind
    if (!['document_finding', 'document_field', 'fact_ledger', 'drive_analysis'].includes(kind)) continue
    items.push({
      id: `documentary:${finding.id}`, kind: `documentary_${finding.kind}`,
      priority: finding.severity === 'critical' ? 'critical' : finding.severity === 'important' ? 'attention' : 'info',
      title: finding.title, reason: finding.description, nextAction: finding.nextAction,
      clienteId: finding.clienteId, clienteName: name(finding.clienteId), owner: clean(knownClients.get(finding.clienteId)?.consultor) || undefined,
      entity: { type: kind as OperationalItem['entity']['type'], id: finding.source.id, parentId: finding.source.documentId },
      to: `${path(finding.clienteId)}?area=workflow&workflow=inteligencia`,
      sources: [finding.source, ...(finding.relatedSources || [])],
    })
  }
  for (const proposal of proposals) {
    const id = clean(proposal.id)
    const clienteId = clean(proposal.clienteId)
    const date = dueDate(proposal.dataValidade ?? proposal.prazoValidade ?? proposal.validoAte)
    if (!date || date > horizonDate) continue
    const intelligent = proposal.kind === 'inteligente' || Boolean(proposal.secoes)
    items.push({
      id: `proposal-expiry:${id}`, kind: date < today ? 'proposal_overdue' : 'proposal_expiring', priority: urgency(date),
      title: `${clean(proposal.titulo, 160) || 'Proposta'} · ${date < today ? 'validade vencida' : 'validade próxima'}`,
      reason: `${dateReason(date)} Situação registrada: ${clean(proposal.status) || 'não informada'}.`,
      nextAction: date < today ? 'Revisar a validade e atualizar a situação da proposta.' : 'Revisar a proposta e definir o próximo contato antes do prazo registrado.',
      clienteId, clienteName: name(clienteId) || clean(proposal.clienteNome, 100) || undefined,
      entity: { type: 'proposal', id }, dueDate: date, owner: clean(knownClients.get(clienteId)?.consultor) || undefined,
      to: intelligent ? `${path(clienteId)}?area=negociacao&dealTab=propostas` : `/propostas?proposta=${encoded(id)}`,
      sources: source('proposal', proposal, 'Situação e validade da proposta'),
    })
  }
  const rank = { critical: 0, attention: 1, info: 2 }
  const unique = [...new Map(items.map(item => [item.id, item])).values()].sort((a, b) => rank[a.priority] - rank[b.priority] || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.id.localeCompare(b.id))
  const available = (key: OperationalSourceKey) => input.coverage.find(item => item.key === key)?.status === 'available'
  const coverage: OperationalPlan['coverage'] = { status: input.coverage.every(item => item.status === 'available') ? 'complete' : input.coverage.some(item => item.status === 'available') ? 'partial' : 'unavailable', sources: input.coverage }
  const counts = {
    clients: available('clients') ? clients.length : null,
    activeClients: available('clients') ? activeClients.length : null,
    activeDemands: available('demands') ? demands.length : null,
    openProposals: available('proposals') ? proposals.length : null,
    priorities: unique.length,
    overdue: unique.filter(item => item.dueDate && item.dueDate < today).length,
    dueToday: unique.filter(item => item.dueDate === today).length,
    missingNextAction: unique.filter(item => item.kind.endsWith('missing_action')).length,
    missingOwner: unique.filter(item => !item.owner).length,
  }
  // Data de consulta e ordem das linhas não versionam o mesmo plano. Mudanças
  // nos prazos, evidências, responsáveis ou cobertura geram outro fingerprint.
  const fingerprint = digest({ version: 1, referenceDate: today, clienteId: input.clienteId || null, coverage, counts, items: unique })
  const versioned = unique.map(item => ({ ...item, fingerprint: digest({ version: 1, referenceDate: today, item }) }))
  return { generatedAt: input.now.toISOString(), referenceDate: today, timeZone: 'America/Cuiaba', fingerprint, scope: input.clienteId ? { clienteId: input.clienteId } : {}, coverage, counts, items: versioned }
}

export async function readOperationalSource(key: OperationalSourceKey, clienteId?: string, actor?: OperationalActor): Promise<OperationalReadResult> {
  if (key === 'documentary') return readOperationalDocumentarySource(clienteId, actor)
  if (isPgEnabled()) {
    // As propostas inteligentes antigas guardam cliente.id no payload.
    // A coluna preenchida prevalece mesmo se o payload ainda estiver antigo.
    const column = key === 'clients' ? 'id' : key === 'proposals' ? "coalesce(nullif(cliente_id, ''), nullif(payload->>'clienteId', ''), payload->'cliente'->>'id')" : 'cliente_id'
    const table = key === 'clients' ? 'cliente' : key === 'demands' ? 'cliente_demanda' : 'proposta'
    const rows = await getPool().query(`select * from ${table}${clienteId ? ` where ${column} = $1` : ''} order by id`, clienteId ? [clienteId] : [])
    const records = rows.rows.map(row => {
      if (key === 'clients') return { ...object(row.payload), id: row.id, nome: row.nome, estagio: row.estagio, consultor: row.consultor, ultimaAtualizacao: sourceTimestamp(row.atualizado_em), atualizadoEm: sourceTimestamp(row.atualizado_em) }
      if (key === 'proposals') {
        const payload = object(row.payload)
        return proposalRecord({ ...payload, id: row.id, clienteId: row.cliente_id || payload.clienteId || object(payload.cliente).id, titulo: row.titulo || payload.titulo, status: row.status || payload.status, dataValidade: row.valid_until || payload.dataValidade || payload.prazoValidade || payload.validoAte, ultimaAtualizacao: sourceTimestamp(row.atualizado_em), atualizadoEm: sourceTimestamp(row.atualizado_em) })
      }
      return { id: row.id, clienteId: row.cliente_id, titulo: row.titulo, status: row.status, responsavel: row.responsavel, prazoAlvo: row.prazo_alvo, proximaAcao: row.proxima_acao, proximaAcaoEm: row.proxima_acao_em, checklist: row.checklist, atualizadoEm: sourceTimestamp(row.atualizado_em) }
    })
    return { records: z.array(readRecordSchema).parse(records), origin: 'postgres' }
  }
  const { clientes } = await import('../../../routes/clientes.js')
  if (key === 'clients') return { records: [...clientes.values()].filter(row => !clienteId || row.id === clienteId) as unknown as OperationalRecords, origin: 'memory' }
  if (key === 'proposals') {
    const { propostas, propostasInteligentes } = await import('../../../routes/propostas.js')
    const rows = [
      ...[...propostas.values()].map(row => ({ ...row, kind: 'padrao' })),
      ...[...propostasInteligentes.values()].map(row => ({ ...row, clienteId: row.cliente?.id, kind: 'inteligente' })),
    ] as unknown as OperationalRecords
    return { records: rows.filter(row => !clienteId || row.clienteId === clienteId), origin: 'memory' }
  }
  const { getClienteDemandaService } = await import('../../cliente/ClienteDemandaService.js')
  const clientIds = clienteId ? [clienteId] : [...clientes.keys()]
  const records: OperationalRecords = []
  for (const id of clientIds) records.push(...await getClienteDemandaService().list(id) as unknown as OperationalRecords)
  return { records, origin: 'memory' }
}

const inFlight = new Map<string, Promise<unknown>>()
export async function withPreparationLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  // Uma preparação interna por processo deixa conexões livres para as leituras
  // e gravações da missão enquanto o lock distribuído está ativo.
  const localKey = 'operational-preparations'
  const previous = inFlight.get(localKey) || Promise.resolve()
  let release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  const tail = previous.catch(() => undefined).then(() => hold)
  inFlight.set(localKey, tail)
  await previous.catch(() => undefined)
  let client: PoolClient | undefined
  try {
    if (isPgEnabled()) {
      client = await getPool().connect()
      await client.query('select pg_advisory_lock(hashtextextended($1, 0))', [`alix-operational-plan:${key}`])
    }
    return await task()
  } finally {
    try {
      if (client) {
        try { await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [`alix-operational-plan:${key}`]) } finally { client.release() }
      }
    } finally {
      release()
      if (inFlight.get(localKey) === tail) inFlight.delete(localKey)
    }
  }
}

export class AlixOperationalPlanService {
  private readonly dependencies: OperationalPlanDependencies
  constructor(dependencies: Partial<OperationalPlanDependencies> = {}) {
    this.dependencies = { read: readOperationalSource, missions: getAlixMissionService(), now: () => new Date(), lock: withPreparationLock, ...dependencies }
  }

  async overview(input: { clienteId?: string; actor?: OperationalActor } = {}): Promise<OperationalPlan> {
    const scope = preparationSchema.pick({ clienteId: true }).parse(input)
    const results = await Promise.allSettled(keys.map(key => this.dependencies.read(key, scope.clienteId, input.actor)))
    const records: Partial<Record<OperationalSourceKey, OperationalRecords>> = {}
    const coverage = results.map((result, index): OperationalCoverageSource => {
      const key = keys[index]
      if (result.status === 'rejected') return { key, label: labels[key], status: 'unavailable', origin: isPgEnabled() ? 'postgres' : 'memory', records: null, detail: 'Não foi possível consultar esta fonte. As contagens desta origem estão indisponíveis.' }
      records[key] = result.value.records
      return { key, label: labels[key], status: 'available', origin: result.value.origin, records: result.value.records.length }
    })
    return projectOperationalPlan({ records, coverage, now: this.dependencies.now(), clienteId: scope.clienteId })
  }

  async prepare(input: { clienteId?: string; actorId?: string; actor?: OperationalActor } = {}): Promise<PreparedOperationalPlan> {
    const parsed = preparationSchema.parse(input)
    const plan = await this.overview({ ...parsed, actor: input.actor })
    if (plan.coverage.status === 'unavailable') throw new Error('As fontes operacionais estão indisponíveis. Tente novamente para preparar o plano com dados atuais.')
    const preparationKey = digest({ fingerprint: plan.fingerprint, actorId: parsed.actorId || 'team' })
    return this.dependencies.lock(preparationKey, async () => {
      const missions = this.dependencies.missions
      const missionId = `mission_operations_${preparationKey}`
      let mission = await missions.get(missionId)
      if (mission?.status === 'completed') return { mission, plan, reused: true }
      if (!mission) mission = await missions.create({
        id: missionId,
        sessionId: `operations_${digest({ clienteId: parsed.clienteId || null, actorId: parsed.actorId || 'team' }).slice(0, 32)}`,
        clienteId: parsed.clienteId, consultorId: parsed.actorId,
        title: `Plano operacional · ${plan.referenceDate}`,
        prompt: 'Preparar prioridades operacionais a partir do CRM, demandas, checklists, propostas e pendências documentais atuais.',
        workMode: 'client_analysis', analysisMode: 'standard',
      })
      if (mission.status === 'cancelled' || mission.status === 'failed') mission = await missions.resume(mission.id, parsed.actorId)
      try {
        await missions.start(mission.id)
        await missions.advance(mission.id, 'gather', 'Registros atuais consultados; cobertura de cada fonte registrada.')
        await missions.addSources(mission.id, [{ kind: 'operational_plan', sourceId: plan.fingerprint, label: `Plano de ${plan.referenceDate}`, evidence: { fingerprint: plan.fingerprint, coverage: plan.coverage, counts: plan.counts } }, ...plan.items.flatMap(item => item.sources.map(itemSource => ({ kind: itemSource.kind, sourceId: itemSource.id, label: itemSource.label, url: item.to, evidence: { updatedAt: itemSource.updatedAt, reason: item.reason, dueDate: item.dueDate, owner: item.owner } })))])
        await missions.advance(mission.id, 'analyze', 'Prazos, responsáveis e próximos passos conferidos por regras determinísticas.')
        const missing = plan.coverage.sources.filter(item => item.status === 'unavailable').map(item => item.label)
        const response = [
          '## Conclusão',
          `${plan.items.length} prioridade(s) identificada(s) nos registros consultados em ${plan.referenceDate}.${missing.length ? ' A análise tem cobertura parcial.' : ''}`,
          '## Fatos',
          ...plan.coverage.sources.filter(item => item.status === 'available').map(item => `- ${item.label}: ${item.records} registro(s) consultado(s), origem ${item.origin}.`),
          '## Riscos',
          ...plan.items.filter(item => item.priority === 'critical').map(item => `- ${item.clienteName || item.clienteId}: ${item.title}. ${item.reason}`),
          '## Lacunas',
          ...missing.map(label => `- ${label}: consulta indisponível.`),
          ...plan.items.filter(item => item.kind.includes('missing')).map(item => `- ${item.clienteName || item.clienteId}: ${item.reason}`),
          '## Próxima ação',
          ...(plan.items.length ? plan.items.map((item, index) => `${index + 1}. [${item.clienteName || item.clienteId} · ${item.title}](${item.to}): ${item.nextAction}${item.dueDate ? ` Prazo registrado: ${item.dueDate}.` : ''}`) : ['Nenhuma pendência foi identificada pelas regras nas fontes disponíveis.']),
        ].join('\n')
        await missions.advance(mission.id, 'synthesize', 'Prioridades organizadas com links para os registros de origem.')
        await missions.advance(mission.id, 'deliver', 'Plano preparado e persistido; ações nos registros permanecem pendentes.')
        mission = await missions.complete(mission.id, { response, model: 'deterministic-operations-v1', costUsd: '0.000000' })
        if (mission.status !== 'completed') throw new Error('A preparação foi interrompida antes de salvar o resultado final.')
        return { mission, plan, reused: false }
      } catch (error) {
        await missions.fail(mission.id, error).catch(() => undefined)
        throw error
      }
    })
  }
}

let singleton: AlixOperationalPlanService | undefined
export function getAlixOperationalPlanService(): AlixOperationalPlanService {
  return singleton ||= new AlixOperationalPlanService()
}
