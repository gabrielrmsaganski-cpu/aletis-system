import { randomUUID } from 'crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import type {
  ClienteDemanda,
  ClienteDemandaCategoria,
  ClienteDemandaChecklistItem,
  ClienteDemandaEvento,
  ClienteDemandaEventoTipo,
  ClienteDemandaPrioridade,
  ClienteDemandaStatus,
} from '@aletis/shared-types'

import { getDb, getPool, isPgEnabled } from '../../db/client.js'
import { clientContract, clienteDemanda, portalMatter, proposta as propostaTable } from '../../db/schema.js'

export type DemandaStatus = ClienteDemandaStatus
export type DemandaPrioridade = ClienteDemandaPrioridade
export type ClienteDemandaRecord = ClienteDemanda

export interface DemandProposalLike {
  id: string
  clienteId?: string
  demandaId?: string
  demandaTitulo?: string
  versaoDemanda?: number
  assunto?: string
  titulo?: string
  tipo?: string
  status?: string
  credor?: string
  valorDivida?: string | number | null
  valorProposta?: string | number | null
  dataCriacao?: string
  ultimaAtualizacao?: string
  arquivoOrigem?: {
    cofreUploadId?: string
    alixDocumentId?: string
  }
}

const VALID_STATUS = new Set<DemandaStatus>([
  'nova', 'em_analise', 'em_proposta', 'negociacao', 'aprovada', 'concluida', 'suspensa', 'cancelada',
])
const VALID_PRIORITY = new Set<DemandaPrioridade>(['baixa', 'normal', 'alta', 'urgente'])
const VALID_CATEGORY = new Set<ClienteDemandaCategoria>([
  'credito', 'renegociacao', 'juridico', 'tributario', 'investimento', 'operacional', 'outro',
])
const VALID_EVENT_TYPE = new Set<ClienteDemandaEventoTipo>([
  'nota', 'contato', 'proposta', 'documento', 'status', 'tarefa', 'sistema',
])

function clean(value: unknown, max = 240): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function list(value: unknown, max = 30): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => clean(item, 160)).filter(Boolean))).slice(0, max)
}

function normalize(value: unknown): string {
  return clean(value, 500)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
}

function moneyString(value: unknown): string | undefined {
  const raw = String(value ?? '').trim().replace(/[^\d,.-]/g, '')
  if (!raw) return undefined
  if (raw.startsWith('-')) return undefined
  const comma = raw.lastIndexOf(',')
  const dot = raw.lastIndexOf('.')
  const separator = Math.max(comma, dot)
  const decimal = separator >= 0 && raw.length - separator - 1 <= 2
  const integer = (decimal ? raw.slice(0, separator) : raw).replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0'
  const fraction = `${decimal ? raw.slice(separator + 1).replace(/\D/g, '') : ''}00`.slice(0, 2)
  return `${integer}.${fraction}`
}

function statusOf(value: unknown): DemandaStatus {
  return VALID_STATUS.has(value as DemandaStatus) ? value as DemandaStatus : 'nova'
}

function priorityOf(value: unknown): DemandaPrioridade {
  return VALID_PRIORITY.has(value as DemandaPrioridade) ? value as DemandaPrioridade : 'normal'
}

function categoryOf(value: unknown): ClienteDemandaCategoria {
  return VALID_CATEGORY.has(value as ClienteDemandaCategoria) ? value as ClienteDemandaCategoria : 'outro'
}

function probabilityOf(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : fallback
}

function eventTypeOf(value: unknown): ClienteDemandaEventoTipo {
  return VALID_EVENT_TYPE.has(value as ClienteDemandaEventoTipo) ? value as ClienteDemandaEventoTipo : 'nota'
}

function eventsOf(value: unknown): ClienteDemandaEvento[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw): ClienteDemandaEvento[] => {
    if (!raw || typeof raw !== 'object') return []
    const item = raw as Record<string, unknown>
    const titulo = clean(item.titulo, 180)
    if (!titulo) return []
    return [{
      id: clean(item.id, 120) || `evt_${randomUUID()}`,
      tipo: eventTypeOf(item.tipo),
      titulo,
      descricao: clean(item.descricao, 2000) || undefined,
      autor: clean(item.autor, 140) || undefined,
      criadoEm: clean(item.criadoEm, 40) || new Date().toISOString(),
    }]
  }).slice(-200)
}

function checklistOf(value: unknown): ClienteDemandaChecklistItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw): ClienteDemandaChecklistItem[] => {
    if (!raw || typeof raw !== 'object') return []
    const item = raw as Record<string, unknown>
    const titulo = clean(item.titulo, 180)
    if (!titulo) return []
    return [{
      id: clean(item.id, 120) || `chk_${randomUUID()}`,
      titulo,
      concluido: item.concluido === true,
      responsavel: clean(item.responsavel, 140) || undefined,
      prazo: clean(item.prazo, 10) || undefined,
      concluidoEm: clean(item.concluidoEm, 40) || undefined,
      criadoEm: clean(item.criadoEm, 40) || new Date().toISOString(),
    }]
  }).slice(0, 100)
}

function createEvent(
  tipo: ClienteDemandaEventoTipo,
  titulo: string,
  descricao?: string,
  autor?: string,
): ClienteDemandaEvento {
  return {
    id: `evt_${randomUUID()}`,
    tipo,
    titulo: clean(titulo, 180),
    descricao: clean(descricao, 2000) || undefined,
    autor: clean(autor, 140) || undefined,
    criadoEm: new Date().toISOString(),
  }
}

export function rowToRecord(row: typeof clienteDemanda.$inferSelect): ClienteDemandaRecord {
  return {
    id: row.id,
    clienteId: row.clienteId,
    numero: row.numero || 1,
    titulo: row.titulo,
    assunto: row.assunto,
    descricao: row.descricao ?? undefined,
    categoria: categoryOf(row.categoria),
    status: statusOf(row.status),
    prioridade: priorityOf(row.prioridade),
    responsavel: row.responsavel ?? undefined,
    credor: row.credor ?? undefined,
    valorPretendido: row.valorPretendido ?? undefined,
    prazoAlvo: row.prazoAlvo ?? undefined,
    proximaAcao: row.proximaAcao ?? undefined,
    proximaAcaoEm: row.proximaAcaoEm ?? undefined,
    probabilidade: probabilityOf(row.probabilidade),
    resultadoEsperado: row.resultadoEsperado ?? undefined,
    propostaPrincipalId: row.propostaPrincipalId ?? undefined,
    origem: (row.origem || 'manual') as ClienteDemandaRecord['origem'],
    propostaIds: list(row.propostaIds, 200),
    documentoIds: list(row.documentoIds, 200),
    eventos: eventsOf(row.eventos),
    checklist: checklistOf(row.checklist),
    tags: list(row.tags),
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {},
    criadoEm: row.criadoEm.toISOString(),
    atualizadoEm: row.atualizadoEm.toISOString(),
  }
}

export function deriveProposalTitle(proposal: DemandProposalLike): string {
  const explicit = clean(proposal.assunto || proposal.demandaTitulo, 180)
  if (explicit) return explicit
  const title = clean(proposal.titulo, 180)
    .replace(/^nova\s+proposta\s+(de\s+)?/i, '')
    .replace(/^proposta\s+(de\s+|para\s+)?/i, '')
    .replace(/\s+-\s+[^-]+$/i, '')
    .trim()
  const type = clean(proposal.tipo, 80).replace(/_/g, ' ') || 'Demanda'
  const creditor = clean(proposal.credor, 120)
  if (title && !/^negocia[cç][aã]o$/i.test(title)) {
    return creditor && normalize(title) === normalize(type) ? `${title} - ${creditor}` : title
  }
  return creditor ? `${type} - ${creditor}` : type
}

export function proposalAutoKey(proposal: DemandProposalLike): string {
  return [normalize(deriveProposalTitle(proposal)), normalize(proposal.credor), normalize(proposal.tipo)].join('|')
}

const MATCH_STOP_WORDS = new Set(['a', 'ao', 'com', 'da', 'de', 'do', 'e', 'em', 'nova', 'novo', 'para', 'por', 'proposta', 'demanda'])

function meaningfulTokens(value: unknown): Set<string> {
  return new Set(normalize(value).split(' ').filter((token) => token.length >= 3 && !MATCH_STOP_WORDS.has(token)))
}

export function semanticDemandScore(demand: ClienteDemandaRecord, proposal: DemandProposalLike): number {
  const demandTitle = normalize(demand.titulo)
  const proposalTitle = normalize(deriveProposalTitle(proposal))
  const demandSubject = normalize(demand.assunto)
  const proposalSubject = normalize(proposal.assunto || proposal.tipo)
  const demandCreditor = normalize(demand.credor)
  const proposalCreditor = normalize(proposal.credor)
  let score = 0

  if (demandTitle && demandTitle === proposalTitle) score += 12
  else if (demandTitle.length >= 5 && proposalTitle.length >= 5 && (demandTitle.includes(proposalTitle) || proposalTitle.includes(demandTitle))) score += 8
  if (demandSubject && proposalSubject && demandSubject === proposalSubject) score += 5
  if (demandCreditor && proposalCreditor && demandCreditor === proposalCreditor) score += 5
  else if (demandCreditor && proposalCreditor && demandCreditor !== proposalCreditor) score -= 5

  const demandTokens = meaningfulTokens(`${demand.titulo} ${demand.assunto}`)
  const proposalTokens = meaningfulTokens(`${deriveProposalTitle(proposal)} ${proposal.assunto || ''} ${proposal.tipo || ''}`)
  const shared = [...demandTokens].filter((token) => proposalTokens.has(token)).length
  if (shared >= 2) score += 5
  else if (shared === 1) score += 2
  const demandNumbers = new Set(demandTitle.match(/\b\d{2,}\b/g) || [])
  const proposalNumbers = new Set(proposalTitle.match(/\b\d{2,}\b/g) || [])
  if (demandNumbers.size > 0 && proposalNumbers.size > 0 && ![...demandNumbers].some((number) => proposalNumbers.has(number))) {
    score -= 12
  }
  return score
}

export function demandStatusFromProposal(proposal: DemandProposalLike): DemandaStatus {
  if (proposal.status === 'aceita') return 'aprovada'
  if (proposal.status === 'enviada') return 'negociacao'
  return 'em_proposta'
}

export function shouldAdvanceStatus(current: DemandaStatus, next: DemandaStatus): boolean {
  const order: DemandaStatus[] = ['nova', 'em_analise', 'em_proposta', 'negociacao', 'aprovada', 'concluida']
  const currentIndex = order.indexOf(current)
  const nextIndex = order.indexOf(next)
  return currentIndex >= 0 && nextIndex > currentIndex
}

export class ClienteDemandaService {
  private readonly records = new Map<string, ClienteDemandaRecord>()
  private readonly loadedClients = new Set<string>()
  private readonly importedFinancialClients = new Set<string>()
  private readonly loadingClients = new Map<string, Promise<void>>()
  private readonly importingFinancialClients = new Map<string, Promise<void>>()

  private async ensureLoaded(clienteId: string): Promise<void> {
    if (this.loadedClients.has(clienteId) && !isPgEnabled()) return
    const inFlight = this.loadingClients.get(clienteId)
    if (inFlight) return inFlight
    const task = (async () => {
      if (isPgEnabled()) {
        const rows = await getDb()
          .select()
          .from(clienteDemanda)
          .where(eq(clienteDemanda.clienteId, clienteId))
          .orderBy(desc(clienteDemanda.atualizadoEm))
        const ids = new Set(rows.map(row => row.id))
        for (const [id, record] of this.records) {
          if (record.clienteId === clienteId && !ids.has(id)) this.records.delete(id)
        }
        for (const row of rows) this.records.set(row.id, rowToRecord(row))
      }
      this.loadedClients.add(clienteId)
    })()
    this.loadingClients.set(clienteId, task)
    try {
      await task
    } finally {
      this.loadingClients.delete(clienteId)
    }
  }

  private async persist(record: ClienteDemandaRecord): Promise<void> {
    if (!isPgEnabled()) {
      this.records.set(record.id, record)
      return
    }
    const expectedUpdatedAt = this.records.get(record.id)?.atualizadoEm
    const row = {
      id: record.id,
      clienteId: record.clienteId,
      numero: record.numero,
      titulo: record.titulo,
      assunto: record.assunto,
      descricao: record.descricao ?? null,
      categoria: record.categoria,
      status: record.status,
      prioridade: record.prioridade,
      responsavel: record.responsavel ?? null,
      credor: record.credor ?? null,
      valorPretendido: record.valorPretendido ?? null,
      prazoAlvo: record.prazoAlvo ?? null,
      proximaAcao: record.proximaAcao ?? null,
      proximaAcaoEm: record.proximaAcaoEm ?? null,
      probabilidade: record.probabilidade,
      resultadoEsperado: record.resultadoEsperado ?? null,
      propostaPrincipalId: record.propostaPrincipalId ?? null,
      origem: record.origem,
      propostaIds: record.propostaIds,
      documentoIds: record.documentoIds,
      eventos: record.eventos,
      checklist: record.checklist,
      tags: record.tags,
      metadata: record.metadata,
      criadoEm: new Date(record.criadoEm),
      atualizadoEm: new Date(record.atualizadoEm),
    }
    const { id: _id, ...updateRow } = row
    await getDb().transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`proposal-workflow:${record.clienteId}`}, 0))`)
      const [stored] = await tx.select().from(clienteDemanda).where(eq(clienteDemanda.id, record.id)).for('update')
      if (stored && (stored.clienteId !== record.clienteId || (expectedUpdatedAt && stored.atualizadoEm.toISOString() !== expectedUpdatedAt))) {
        throw Object.assign(new Error('A demanda foi atualizada por outra operação. Recarregue antes de editar.'), { statusCode: 409, code: 'DEMAND_REVISION_CONFLICT' })
      }
      const bound = await tx.select().from(propostaTable).where(and(eq(propostaTable.clienteId, record.clienteId), sql`${propostaTable.revision} > 0`))
      for (const proposal of bound) {
        const isCanonical = proposal.demandaId === record.id
        if (record.propostaIds.includes(proposal.id) !== isCanonical) {
          throw Object.assign(new Error('Altere os vínculos da proposta pelo fluxo transacional.'), { statusCode: 409, code: 'LINK_CONFLICT' })
        }
        if (isCanonical && proposal.status === 'aceita' && !['aprovada', 'concluida'].includes(record.status)) {
          throw Object.assign(new Error('Uma demanda com proposta aceita não pode regredir de status.'), { statusCode: 409, code: 'LINK_CONFLICT' })
        }
      }
      await tx.insert(clienteDemanda).values(row).onConflictDoUpdate({ target: clienteDemanda.id, set: updateRow })
    })
    this.records.set(record.id, record)
  }

  /** Publica somente linhas cuja transação já foi confirmada pelo coordenador. */
  publishCommittedRows(rows: Array<typeof clienteDemanda.$inferSelect>): void {
    for (const row of rows) this.records.set(row.id, rowToRecord(row))
  }

  private async importFinancialDemands(clienteId: string): Promise<void> {
    if (this.importedFinancialClients.has(clienteId)) return
    const inFlight = this.importingFinancialClients.get(clienteId)
    if (inFlight) return inFlight
    const task = (async () => {
      if (!isPgEnabled()) return
      try {
        const result = await getPool().query(
          `select d.* from gf_demanda d join gf_grupo g on g.id = d.grupo_id where g.cliente_id = $1`,
          [clienteId],
        )
        for (const source of result.rows) {
          const legacyTitle = clean(
            source.finalidade || source.modalidade || source.credor || (source.numero ? `Demanda ${source.numero}` : ''),
            180,
          ) || 'Demanda financeira'
          const existing = [...this.records.values()].find((item) =>
            item.clienteId === clienteId && item.metadata.gfDemandaId === source.id,
          )
          if (existing) {
            if (normalize(existing.titulo) === 'demanda') {
              await this.update(clienteId, existing.id, { titulo: legacyTitle })
            }
            continue
          }
          await this.create(clienteId, {
            titulo: legacyTitle,
            assunto: clean(source.finalidade || 'credito', 80),
            categoria: 'credito',
            descricao: clean(source.estrategia || source.parecer_tex, 1600),
            status: source.status === 'aprovada' ? 'aprovada' : 'em_analise',
            prioridade: 'normal',
            credor: source.credor,
            valorPretendido: source.valor,
            origem: 'gestao_financeira',
            metadata: { gfDemandaId: source.id, grupoId: source.grupo_id },
          })
        }
      } catch {
        // Gestão Financeira pode ainda não estar migrada neste ambiente.
      }
    })()
    this.importingFinancialClients.set(clienteId, task)
    try {
      await task
      this.importedFinancialClients.add(clienteId)
    } finally {
      this.importingFinancialClients.delete(clienteId)
    }
  }

  async list(clienteId: string): Promise<ClienteDemandaRecord[]> {
    await this.ensureLoaded(clienteId)
    return [...this.records.values()]
      .filter((item) => item.clienteId === clienteId)
      .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm))
  }

  async get(clienteId: string, id: string): Promise<ClienteDemandaRecord | null> {
    await this.ensureLoaded(clienteId)
    const record = this.records.get(id)
    return record?.clienteId === clienteId ? record : null
  }

  async create(clienteId: string, input: Record<string, unknown>): Promise<ClienteDemandaRecord> {
    await this.ensureLoaded(clienteId)
    const now = new Date().toISOString()
    const title = clean(input.titulo, 180)
    if (!title) throw new Error('Título da demanda é obrigatório.')
    const numeroInformado = Number(input.numero)
    const maiorNumero = [...this.records.values()]
      .filter((item) => item.clienteId === clienteId)
      .reduce((max, item) => Math.max(max, item.numero || 0), 0)
    const initialEvents = eventsOf(input.eventos)
    const record: ClienteDemandaRecord = {
      id: clean(input.id, 120) || `dem_${randomUUID()}`,
      clienteId,
      numero: Number.isInteger(numeroInformado) && numeroInformado > 0 ? numeroInformado : maiorNumero + 1,
      titulo: title,
      assunto: clean(input.assunto, 80) || 'outro',
      descricao: clean(input.descricao, 2000) || undefined,
      categoria: categoryOf(input.categoria),
      status: statusOf(input.status),
      prioridade: priorityOf(input.prioridade),
      responsavel: clean(input.responsavel, 140) || undefined,
      credor: clean(input.credor, 160) || undefined,
      valorPretendido: moneyString(input.valorPretendido),
      prazoAlvo: clean(input.prazoAlvo, 10) || undefined,
      proximaAcao: clean(input.proximaAcao, 240) || undefined,
      proximaAcaoEm: clean(input.proximaAcaoEm, 10) || undefined,
      probabilidade: probabilityOf(input.probabilidade, 10),
      resultadoEsperado: clean(input.resultadoEsperado, 1000) || undefined,
      propostaPrincipalId: clean(input.propostaPrincipalId, 120) || undefined,
      origem: (['manual', 'proposta_existente', 'cadastro_ia', 'gestao_financeira'].includes(String(input.origem))
        ? input.origem
        : 'manual') as ClienteDemandaRecord['origem'],
      propostaIds: list(input.propostaIds, 200),
      documentoIds: list(input.documentoIds, 200),
      eventos: [...initialEvents, createEvent('sistema', 'Demanda criada', undefined, clean(input.autor, 140) || 'CRM')].slice(-200),
      checklist: checklistOf(input.checklist),
      tags: list(input.tags),
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata as Record<string, unknown> : {},
      criadoEm: now,
      atualizadoEm: now,
    }
    await this.persist(record)
    return record
  }

  async update(clienteId: string, id: string, patch: Record<string, unknown>): Promise<ClienteDemandaRecord | null> {
    const current = await this.get(clienteId, id)
    if (!current) return null
    const changes: string[] = []
    const track = (label: string, before: unknown, after: unknown) => {
      if (String(before ?? '') !== String(after ?? '')) changes.push(label)
    }
    const nextStatus = patch.status !== undefined ? statusOf(patch.status) : current.status
    const nextPriority = patch.prioridade !== undefined ? priorityOf(patch.prioridade) : current.prioridade
    const nextCategory = patch.categoria !== undefined ? categoryOf(patch.categoria) : current.categoria
    const nextProbability = patch.probabilidade !== undefined
      ? probabilityOf(patch.probabilidade, current.probabilidade)
      : current.probabilidade
    track('status', current.status, nextStatus)
    track('prioridade', current.prioridade, nextPriority)
    track('categoria', current.categoria, nextCategory)
    if (patch.responsavel !== undefined) track('responsável', current.responsavel, clean(patch.responsavel, 140))
    if (patch.prazoAlvo !== undefined) track('prazo-alvo', current.prazoAlvo, clean(patch.prazoAlvo, 10))
    if (patch.proximaAcao !== undefined) track('próxima ação', current.proximaAcao, clean(patch.proximaAcao, 240))
    if (patch.proximaAcaoEm !== undefined) track('data da próxima ação', current.proximaAcaoEm, clean(patch.proximaAcaoEm, 10))
    track('probabilidade', current.probabilidade, nextProbability)
    const next: ClienteDemandaRecord = {
      ...current,
      ...(patch.titulo !== undefined ? { titulo: clean(patch.titulo, 180) || current.titulo } : {}),
      ...(patch.assunto !== undefined ? { assunto: clean(patch.assunto, 80) || 'outro' } : {}),
      ...(patch.descricao !== undefined ? { descricao: clean(patch.descricao, 2000) || undefined } : {}),
      ...(patch.categoria !== undefined ? { categoria: nextCategory } : {}),
      ...(patch.status !== undefined ? { status: nextStatus } : {}),
      ...(patch.prioridade !== undefined ? { prioridade: nextPriority } : {}),
      ...(patch.responsavel !== undefined ? { responsavel: clean(patch.responsavel, 140) || undefined } : {}),
      ...(patch.credor !== undefined ? { credor: clean(patch.credor, 160) || undefined } : {}),
      ...(patch.valorPretendido !== undefined ? { valorPretendido: moneyString(patch.valorPretendido) } : {}),
      ...(patch.prazoAlvo !== undefined ? { prazoAlvo: clean(patch.prazoAlvo, 10) || undefined } : {}),
      ...(patch.proximaAcao !== undefined ? { proximaAcao: clean(patch.proximaAcao, 240) || undefined } : {}),
      ...(patch.proximaAcaoEm !== undefined ? { proximaAcaoEm: clean(patch.proximaAcaoEm, 10) || undefined } : {}),
      ...(patch.probabilidade !== undefined ? { probabilidade: nextProbability } : {}),
      ...(patch.resultadoEsperado !== undefined ? { resultadoEsperado: clean(patch.resultadoEsperado, 1000) || undefined } : {}),
      ...(patch.propostaPrincipalId !== undefined ? { propostaPrincipalId: clean(patch.propostaPrincipalId, 120) || undefined } : {}),
      ...(patch.documentoIds !== undefined ? { documentoIds: list(patch.documentoIds, 200) } : {}),
      ...(patch.tags !== undefined ? { tags: list(patch.tags) } : {}),
      eventos: changes.length > 0
        ? [...current.eventos, createEvent(nextStatus !== current.status ? 'status' : 'sistema', `Demanda atualizada: ${changes.join(', ')}`, undefined, clean(patch.autor, 140) || 'CRM')].slice(-200)
        : current.eventos,
      atualizadoEm: new Date().toISOString(),
    }
    await this.persist(next)
    return next
  }

  async addEvent(
    clienteId: string,
    demandaId: string,
    input: Record<string, unknown>,
  ): Promise<ClienteDemandaRecord | null> {
    const current = await this.get(clienteId, demandaId)
    if (!current) return null
    const titulo = clean(input.titulo, 180)
    if (!titulo) throw new Error('O título da atividade é obrigatório.')
    const next = {
      ...current,
      eventos: [...current.eventos, createEvent(eventTypeOf(input.tipo), titulo, clean(input.descricao, 2000), clean(input.autor, 140))].slice(-200),
      atualizadoEm: new Date().toISOString(),
    }
    await this.persist(next)
    return next
  }

  async addChecklistItem(
    clienteId: string,
    demandaId: string,
    input: Record<string, unknown>,
  ): Promise<ClienteDemandaRecord | null> {
    const current = await this.get(clienteId, demandaId)
    if (!current) return null
    const titulo = clean(input.titulo, 180)
    if (!titulo) throw new Error('O título do item é obrigatório.')
    if (current.checklist.length >= 100) throw new Error('A demanda atingiu o limite de 100 itens no checklist.')
    const item: ClienteDemandaChecklistItem = {
      id: `chk_${randomUUID()}`,
      titulo,
      concluido: false,
      responsavel: clean(input.responsavel, 140) || undefined,
      prazo: clean(input.prazo, 10) || undefined,
      criadoEm: new Date().toISOString(),
    }
    const next = {
      ...current,
      checklist: [...current.checklist, item],
      eventos: [...current.eventos, createEvent('tarefa', `Checklist adicionado: ${titulo}`, undefined, clean(input.autor, 140))].slice(-200),
      atualizadoEm: new Date().toISOString(),
    }
    await this.persist(next)
    return next
  }

  async updateChecklistItem(
    clienteId: string,
    demandaId: string,
    itemId: string,
    patch: Record<string, unknown>,
  ): Promise<ClienteDemandaRecord | null> {
    const current = await this.get(clienteId, demandaId)
    if (!current) return null
    const existing = current.checklist.find((item) => item.id === itemId)
    if (!existing) return null
    const concluido = patch.concluido === undefined ? existing.concluido : patch.concluido === true
    const updated: ClienteDemandaChecklistItem = {
      ...existing,
      ...(patch.titulo !== undefined ? { titulo: clean(patch.titulo, 180) || existing.titulo } : {}),
      ...(patch.responsavel !== undefined ? { responsavel: clean(patch.responsavel, 140) || undefined } : {}),
      ...(patch.prazo !== undefined ? { prazo: clean(patch.prazo, 10) || undefined } : {}),
      concluido,
      concluidoEm: concluido ? existing.concluidoEm || new Date().toISOString() : undefined,
    }
    const stateChanged = existing.concluido !== concluido
    const next = {
      ...current,
      checklist: current.checklist.map((item) => item.id === itemId ? updated : item),
      eventos: stateChanged
        ? [...current.eventos, createEvent('tarefa', `${concluido ? 'Concluído' : 'Reaberto'}: ${updated.titulo}`, undefined, clean(patch.autor, 140))].slice(-200)
        : current.eventos,
      atualizadoEm: new Date().toISOString(),
    }
    await this.persist(next)
    return next
  }

  async removeChecklistItem(clienteId: string, demandaId: string, itemId: string): Promise<ClienteDemandaRecord | null> {
    const current = await this.get(clienteId, demandaId)
    if (!current || !current.checklist.some((item) => item.id === itemId)) return null
    const next = {
      ...current,
      checklist: current.checklist.filter((item) => item.id !== itemId),
      atualizadoEm: new Date().toISOString(),
    }
    await this.persist(next)
    return next
  }

  async setPrimaryProposal(clienteId: string, demandaId: string, proposalId?: string): Promise<ClienteDemandaRecord | null> {
    const current = await this.get(clienteId, demandaId)
    if (!current) return null
    if (proposalId && !current.propostaIds.includes(proposalId)) {
      throw new Error('A proposta principal precisa estar vinculada a esta demanda.')
    }
    const next = {
      ...current,
      propostaPrincipalId: proposalId,
      eventos: [...current.eventos, createEvent('proposta', proposalId ? 'Proposta principal definida' : 'Proposta principal removida', proposalId)].slice(-200),
      atualizadoEm: new Date().toISOString(),
    }
    await this.persist(next)
    return next
  }

  async remove(clienteId: string, id: string): Promise<boolean> {
    if (isPgEnabled()) {
      const removed = await getDb().transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`proposal-workflow:${clienteId}`}, 0))`)
        const [stored] = await tx.select().from(clienteDemanda).where(and(eq(clienteDemanda.id, id), eq(clienteDemanda.clienteId, clienteId))).for('update')
        if (!stored || list(stored.propostaIds, 200).length) return false
        const linked = await tx.select({ id: propostaTable.id }).from(propostaTable).where(eq(propostaTable.demandaId, id)).limit(1)
        const contracted = await tx.select({ id: clientContract.id }).from(clientContract).where(eq(clientContract.demandaId, id)).limit(1)
        if (linked.length || contracted.length) return false
        // A origem de um plano publicado ou em preparação preserva seus vínculos e seu histórico.
        const portal = await tx.select({ id: portalMatter.id }).from(portalMatter).where(eq(portalMatter.demandaId, id)).limit(1)
        if (portal.length) return false
        await tx.delete(clienteDemanda).where(eq(clienteDemanda.id, id))
        return true
      })
      if (removed) this.records.delete(id)
      return removed
    }
    const current = await this.get(clienteId, id)
    if (!current || current.propostaIds.length > 0) return false
    this.records.delete(id)
    return true
  }

  async linkProposal(clienteId: string, demandaId: string, proposalId: string): Promise<ClienteDemandaRecord | null> {
    if (isPgEnabled()) {
      const [stored] = await getDb().select().from(propostaTable).where(eq(propostaTable.id, proposalId)).limit(1)
      if (stored) {
        if (stored.clienteId !== clienteId) throw Object.assign(new Error('A proposta pertence a outro cliente.'), { statusCode: 409, code: 'LINK_CONFLICT' })
        const { updateProposalWorkflow } = await import('../propostas/ProposalWorkflowService.js')
        const result = await updateProposalWorkflow({ id: proposalId, patch: { demandaId }, expectedRevision: stored.revision })
        return result.demanda ?? null
      }
    }
    const target = await this.get(clienteId, demandaId)
    if (!target) return null
    for (const record of await this.list(clienteId)) {
      if (record.id === demandaId || !record.propostaIds.includes(proposalId)) continue
      await this.persist({
        ...record,
        propostaIds: record.propostaIds.filter((id) => id !== proposalId),
        propostaPrincipalId: record.propostaPrincipalId === proposalId ? undefined : record.propostaPrincipalId,
        eventos: [...record.eventos, createEvent('proposta', 'Proposta movida para outra demanda', proposalId)].slice(-200),
        atualizadoEm: new Date().toISOString(),
      })
    }
    if (!target.propostaIds.includes(proposalId)) {
      const next = {
        ...target,
        propostaIds: [...target.propostaIds, proposalId],
        status: (target.status === 'nova' || target.status === 'em_analise' ? 'em_proposta' : target.status) as DemandaStatus,
        eventos: [...target.eventos, createEvent('proposta', 'Proposta vinculada', proposalId)].slice(-200),
        atualizadoEm: new Date().toISOString(),
      }
      await this.persist(next)
      return next
    }
    return target
  }

  async unlinkProposal(clienteId: string, proposalId: string): Promise<void> {
    if (isPgEnabled()) {
      const [stored] = await getDb().select({ id: propostaTable.id }).from(propostaTable).where(eq(propostaTable.id, proposalId)).limit(1)
      if (stored) throw Object.assign(new Error('Mova ou exclua a proposta pelo fluxo transacional para alterar seus vínculos.'), { statusCode: 409, code: 'LINK_CONFLICT' })
    }
    for (const record of await this.list(clienteId)) {
      if (!record.propostaIds.includes(proposalId)) continue
      await this.persist({
        ...record,
        propostaIds: record.propostaIds.filter((id) => id !== proposalId),
        propostaPrincipalId: record.propostaPrincipalId === proposalId ? undefined : record.propostaPrincipalId,
        eventos: [...record.eventos, createEvent('proposta', 'Proposta desvinculada', proposalId)].slice(-200),
        atualizadoEm: new Date().toISOString(),
      })
    }
  }

  async ensureForProposal(proposal: DemandProposalLike): Promise<{ demanda: ClienteDemandaRecord; versao: number }> {
    const clienteId = clean(proposal.clienteId, 120)
    if (!clienteId) throw new Error('Proposta sem cliente para organização por demanda.')
    if (isPgEnabled()) {
      const [stored] = await getDb().select({ clienteId: propostaTable.clienteId }).from(propostaTable).where(eq(propostaTable.id, proposal.id)).limit(1)
      if (stored) {
        if (stored.clienteId !== clienteId) throw Object.assign(new Error('A proposta pertence a outro cliente.'), { statusCode: 409, code: 'LINK_CONFLICT' })
        const { updateProposalWorkflow } = await import('../propostas/ProposalWorkflowService.js')
        const result = await updateProposalWorkflow({ id: proposal.id, patch: {} })
        Object.assign(proposal, result.proposta)
        return { demanda: result.demanda!, versao: result.proposta.versaoDemanda ?? 1 }
      }
    }
    const demands = await this.list(clienteId)
    let demand = proposal.demandaId ? demands.find((item) => item.id === proposal.demandaId) : undefined
    const autoKey = proposalAutoKey(proposal)
    if (!demand) {
      demand = demands.find((item) => item.metadata.autoKey === autoKey)
    }
    if (!demand) {
      const candidate = demands
        .filter((item) => item.origem === 'manual' || item.origem === 'cadastro_ia')
        .map((item) => ({ item, score: semanticDemandScore(item, proposal) }))
        .sort((a, b) => b.score - a.score || b.item.atualizadoEm.localeCompare(a.item.atualizadoEm))[0]
      if (candidate?.score >= 8) demand = candidate.item
    }
    if (!demand) {
      demand = await this.create(clienteId, {
        titulo: deriveProposalTitle(proposal),
        assunto: clean(proposal.tipo, 80) || 'proposta',
        categoria: 'renegociacao',
        descricao: `Demanda criada automaticamente a partir da proposta ${clean(proposal.titulo || proposal.id, 180)}.`,
        status: demandStatusFromProposal(proposal),
        credor: proposal.credor,
        valorPretendido: proposal.valorDivida || proposal.valorProposta,
        origem: 'proposta_existente',
        metadata: { autoKey },
      })
    }
    const derivedTitle = deriveProposalTitle(proposal)
    if (demand.origem === 'proposta_existente' && normalize(demand.titulo) === normalize(proposal.tipo) && derivedTitle !== demand.titulo) {
      demand = await this.update(clienteId, demand.id, { titulo: derivedTitle, credor: proposal.credor }) || demand
    }
    const linked = await this.linkProposal(clienteId, demand.id, proposal.id) || demand
    const nextStatus = demandStatusFromProposal(proposal)
    let progressed = shouldAdvanceStatus(linked.status, nextStatus)
      ? await this.update(clienteId, linked.id, { status: nextStatus }) || linked
      : linked
    const sourceDocumentId = clean(proposal.arquivoOrigem?.cofreUploadId, 120)
    if (sourceDocumentId && !progressed.documentoIds.includes(sourceDocumentId)) {
      progressed = await this.update(clienteId, progressed.id, {
        documentoIds: [...progressed.documentoIds, sourceDocumentId],
      }) || progressed
    }
    const versao = Math.max(1, progressed.propostaIds.indexOf(proposal.id) + 1)
    proposal.demandaId = progressed.id
    proposal.demandaTitulo = progressed.titulo
    proposal.versaoDemanda = versao
    return { demanda: progressed, versao }
  }

  async organizeProposals(clienteId: string, proposals: DemandProposalLike[]): Promise<ClienteDemandaRecord[]> {
    await this.ensureLoaded(clienteId)
    await this.importFinancialDemands(clienteId)
    for (const proposal of proposals) {
      if (proposal.clienteId === clienteId) await this.ensureForProposal(proposal)
    }
    const validProposalIds = new Set(proposals.filter((proposal) => proposal.clienteId === clienteId).map((proposal) => proposal.id))
    for (const demand of await this.list(clienteId)) {
      const reconciled = demand.propostaIds.filter((id) => validProposalIds.has(id))
      if (reconciled.length !== demand.propostaIds.length) {
        await this.persist({
          ...demand,
          propostaIds: reconciled,
          propostaPrincipalId: demand.propostaPrincipalId && reconciled.includes(demand.propostaPrincipalId)
            ? demand.propostaPrincipalId
            : undefined,
          atualizadoEm: new Date().toISOString(),
        })
      }
    }
    return this.list(clienteId)
  }
}

let singleton: ClienteDemandaService | null = null

export function getClienteDemandaService(): ClienteDemandaService {
  if (!singleton) singleton = new ClienteDemandaService()
  return singleton
}
