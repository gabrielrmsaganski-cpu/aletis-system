// ============================================================
// DealRoomService — Deal Room Multi-Credor
// ============================================================
// Acompanha negociação por banco/credor:
//   status, valor atual vs proposto, taxa, prazo, carência,
//   contrapropostas, docs pendentes, histórico, próximo deadline.
//
// Uma linha por (cliente × credor). Mais de uma negociação simultânea
// com o mesmo credor é rara — quando ocorre, encerra-se a anterior.
// ============================================================
import { randomUUID } from 'crypto'
import { and, eq, desc, sql } from 'drizzle-orm'
import { getDb, isPgEnabled } from '../../db/client.js'
import { clientContract, negociacaoCredor, proposta, type NegociacaoCredor, type Proposta } from '../../db/schema.js'
import { parseMoneyPtBr } from '../../lib/parseMoneyPtBr.js'
import { isDeepStrictEqual } from 'node:util'

type DealWriteTx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]

function linkedWriteConflict(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 409, code: 'LINK_CONFLICT' })
}

export type NegociacaoStatus =
  | 'negociando'
  | 'contraproposta'
  | 'aguardando_doc'
  | 'aprovado'
  | 'recusado'
  | 'encerrado'
  | 'suspenso'

export interface DocPendente {
  titulo: string
  descricao?: string
  solicitadoEm: string
  status: 'pendente' | 'enviado' | 'aprovado'
}

export interface HistoricoEntry {
  ts: string
  tipo: 'criacao' | 'mudanca_status' | 'contraproposta' | 'doc_solicitado' | 'doc_recebido' | 'reuniao' | 'nota'
  texto: string
  usuarioId?: string
  usuarioNome?: string
  campo?: string
  anterior?: string | number | null
  novo?: string | number | null
  /** Snapshot dos valores no momento (para comparação histórica). */
  snapshot?: {
    valor?: number | string
    taxa?: number
    prazo?: number
    carencia?: number
  }
}

export interface CriarNegociacaoInput {
  clienteId: string
  credor: string
  responsavel?: string
  valorAtual?: number | string
  valorProposto?: number | string
  taxaAtual?: number | string
  taxaProposta?: number | string
  prazoMeses?: number
  carenciaMeses?: number
  garantias?: string[]
  observacoes?: string
  proximaData?: string
  /** Wave OS — vincular já na criação a uma proposta global. */
  propostaId?: string
  usuarioId?: string
  usuarioNome?: string
}

export interface PropostaParaNegociacao {
  id: string
  clienteId: string
  credor: string
  titulo?: string
  valorDivida?: number | string | null
  valorProposta?: number | string | null
  status?: string
}

export interface VinculoPropostaNegociacao {
  negociacao: NegociacaoCredor
  criada: boolean
}

export interface AtualizarNegociacaoInput {
  credor?: string
  status?: NegociacaoStatus
  responsavel?: string
  valorAtual?: number | string | null
  valorProposto?: number | string | null
  taxaAtual?: number | string | null
  taxaProposta?: number | string | null
  prazoMeses?: number
  carenciaMeses?: number
  garantias?: string[]
  observacoes?: string
  proximaData?: string | null
  /** Adiciona uma entrada ao histórico (não substitui). */
  appendHistorico?: HistoricoEntry
  /** Atualiza array completo de docs pendentes. */
  docsPendentes?: DocPendente[]
  /** Wave OS — vincular esta negociação a uma proposta global. */
  propostaId?: string | null
  usuarioId?: string
  usuarioNome?: string
}

const STATUS = new Set<NegociacaoStatus>(['negociando', 'contraproposta', 'aguardando_doc', 'aprovado', 'recusado', 'encerrado', 'suspenso'])
const ACTIVE = new Set<NegociacaoStatus>(['negociando', 'contraproposta', 'aguardando_doc'])
const TRANSITIONS: Record<NegociacaoStatus, Set<NegociacaoStatus>> = {
  negociando: new Set(['contraproposta', 'aguardando_doc', 'aprovado', 'recusado', 'suspenso', 'encerrado']),
  contraproposta: new Set(['negociando', 'aguardando_doc', 'aprovado', 'recusado', 'suspenso', 'encerrado']),
  aguardando_doc: new Set(['negociando', 'contraproposta', 'aprovado', 'recusado', 'suspenso', 'encerrado']),
  aprovado: new Set(['encerrado']), recusado: new Set(['encerrado']), encerrado: new Set(['negociando']), suspenso: new Set(['negociando', 'encerrado']),
}

function decimal(value: unknown, label: string, { nullable = true, max = 1_000_000_000_000 } = {}): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return nullable ? null : undefined
  const raw = String(value).trim()
  const n = typeof value === 'string' ? Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw) : Number(value)
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(`${label} deve ser um número válido e não negativo.`)
  return n.toFixed(2)
}

function integer(value: unknown, label: string): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > 1200) throw new Error(`${label} deve ser um inteiro não negativo.`)
  return n
}

function isoDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Próximo deadline inválido.')
  return date
}

function credorElegivel(value: unknown): string | null {
  const credor = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!credor || /^(?:credor|institui[cç][aã]o)\s+(?:a\s+)?confirmar$/i.test(credor)) return null
  return credor
}

export class DealRoomService {
  private readonly memory = new Map<string, NegociacaoCredor>()
  private readonly proposalLinksInFlight = new Map<string, Promise<VinculoPropostaNegociacao>>()

  /** Publica apenas o resultado de uma transação já confirmada. */
  publishCommittedNegotiation(record: NegociacaoCredor): void {
    this.memory.set(record.id, record)
  }

  async list(filters?: { clienteId?: string; status?: NegociacaoStatus }): Promise<NegociacaoCredor[]> {
    if (!isPgEnabled()) {
      return [...this.memory.values()].filter((n) => (!filters?.clienteId || n.clienteId === filters.clienteId) && (!filters?.status || n.status === filters.status)).sort((a, b) => b.atualizadoEm.getTime() - a.atualizadoEm.getTime())
    }
    const db = getDb()
    let q = db.select().from(negociacaoCredor).$dynamic()
    const conditions = []
    if (filters?.clienteId) conditions.push(eq(negociacaoCredor.clienteId, filters.clienteId))
    if (filters?.status) conditions.push(eq(negociacaoCredor.status, filters.status))
    if (conditions.length) q = q.where(and(...conditions))
    return q.orderBy(desc(negociacaoCredor.atualizadoEm))
  }

  async listByCliente(clienteId: string): Promise<NegociacaoCredor[]> {
    return this.list({ clienteId })
  }

  /**
   * Wave OS — combinar Deal Room + propostas globais.
   * Retorna negociações enriquecidas com a proposta vinculada (se houver),
   * mais o conjunto de propostas do cliente que NÃO estão linkadas a
   * nenhuma negociação (sugestões de vínculo).
   */
  async listByClienteWithPropostas(clienteId: string): Promise<{
    negociacoes: Array<NegociacaoCredor & { proposta?: Proposta | null }>
    propostasOrfas: Proposta[]
  }> {
    if (!isPgEnabled()) {
      const { propostas } = await import('../../routes/propostas.js')
      const props = [...propostas.values()].filter((p) => p.clienteId === clienteId)
      const linkedIds = new Set((await this.listByCliente(clienteId)).map((n) => n.propostaId).filter((id): id is string => Boolean(id)))
      return {
        negociacoes: (await this.listByCliente(clienteId)).map((n) => ({ ...n, proposta: (n.propostaId ? propostas.get(n.propostaId) ?? null : null) as unknown as Proposta })),
        propostasOrfas: props.filter((p) => !linkedIds.has(p.id)) as unknown as Proposta[],
      }
    }
    const db = getDb()
    const [negs, props] = await Promise.all([
      this.listByCliente(clienteId),
      db.select().from(proposta).where(eq(proposta.clienteId, clienteId)).orderBy(desc(proposta.atualizadoEm)),
    ])
    const propMap = new Map(props.map((p) => [p.id, p]))
    const linkedIds = new Set<string>()
    const enriched = negs.map((n) => {
      const linked = n.propostaId ? propMap.get(n.propostaId) ?? null : null
      if (n.propostaId && linked) linkedIds.add(n.propostaId)
      return { ...n, proposta: linked }
    })
    const propostasOrfas = props.filter((p) => !linkedIds.has(p.id))
    return { negociacoes: enriched, propostasOrfas }
  }

  async get(id: string): Promise<NegociacaoCredor | null> {
    if (!isPgEnabled()) return this.memory.get(id) ?? null
    const db = getDb()
    const rows = await db.select().from(negociacaoCredor).where(eq(negociacaoCredor.id, id)).limit(1)
    return rows[0] ?? null
  }

  async create(input: CriarNegociacaoInput, options: { verificarProposta?: boolean } = {}): Promise<NegociacaoCredor> {
    if (isPgEnabled()) {
      const created = await getDb().transaction(async tx => {
        await tx.execute(sql`set local lock_timeout = '5s'`)
        if (input.propostaId) {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`proposal-workflow:${input.clienteId}`}, 0))`)
          const [linked] = await tx.select().from(proposta).where(eq(proposta.id, input.propostaId)).for('update')
          if (!linked || linked.clienteId !== input.clienteId) linkedWriteConflict('A proposta vinculada não existe ou pertence a outro cliente.')
          const [contract] = await tx.select().from(clientContract).where(eq(clientContract.propostaId, input.propostaId))
          if (contract || linked.status === 'aceita') {
            const [canonical] = contract?.negociacaoId
              ? await tx.select().from(negociacaoCredor).where(eq(negociacaoCredor.id, contract.negociacaoId)) : []
            if (canonical?.clienteId === input.clienteId && canonical.propostaId === input.propostaId) return canonical
            linkedWriteConflict('A negociação de uma proposta aceita deve ser reconciliada pelo fechamento transacional.')
          }
        }
        return this.createInContext(input, options, tx)
      })
      this.publishCommittedNegotiation(created)
      return created
    }
    return this.createInContext(input, options)
  }

  private async createInContext(input: CriarNegociacaoInput, options: { verificarProposta?: boolean }, tx?: DealWriteTx): Promise<NegociacaoCredor> {
    const credor = String(input.credor ?? '').trim()
    if (!input.clienteId || !credor) throw new Error('clienteId e credor são obrigatórios.')
    const valorAtual = decimal(input.valorAtual, 'Valor atual')
    const valorProposto = decimal(input.valorProposto, 'Valor proposto')
    const taxaAtual = decimal(input.taxaAtual, 'Taxa atual', { max: 100 })
    const taxaProposta = decimal(input.taxaProposta, 'Taxa proposta', { max: 100 })
    const prazoMeses = integer(input.prazoMeses, 'Prazo')
    const carenciaMeses = integer(input.carenciaMeses, 'Carência')
    const proximaData = isoDate(input.proximaData)
    if (input.propostaId && options.verificarProposta !== false) {
      if (isPgEnabled()) {
        const linked = await tx!.select({ id: proposta.id, clienteId: proposta.clienteId }).from(proposta).where(eq(proposta.id, input.propostaId)).limit(1)
        if (!linked[0]) throw new Error('Proposta vinculada não encontrada.')
        if (linked[0].clienteId !== input.clienteId) throw new Error('A proposta pertence a outro cliente.')
      } else {
        const { propostas } = await import('../../routes/propostas.js')
        const linked = propostas.get(input.propostaId)
        if (!linked) throw new Error('Proposta vinculada não encontrada.')
        if (linked.clienteId !== input.clienteId) throw new Error('A proposta pertence a outro cliente.')
      }
      const rows = tx ? await tx.select().from(negociacaoCredor).where(eq(negociacaoCredor.clienteId, input.clienteId)) : await this.listByCliente(input.clienteId)
      const duplicate = rows.find((n) => n.propostaId === input.propostaId && n.status !== 'encerrado')
      if (duplicate) return duplicate
    }
    const id = `neg_${randomUUID()}`
    const now = new Date()
    const historicoInicial: HistoricoEntry[] = [
      {
        ts: now.toISOString(),
        tipo: 'criacao',
        texto: `Negociação aberta com ${credor}.`,
        snapshot: {
          valor: valorAtual ? Number(valorAtual) : undefined,
          taxa: taxaAtual ? Number(taxaAtual) : undefined,
          prazo: prazoMeses ?? undefined,
          carencia: carenciaMeses ?? undefined,
        },
        usuarioId: input.usuarioId,
        usuarioNome: input.usuarioNome,
      },
    ]
    const row: typeof negociacaoCredor.$inferInsert = {
      id,
      clienteId: input.clienteId,
      credor,
      status: 'negociando',
      responsavel: input.responsavel ?? null,
      valorAtual: valorAtual ?? null,
      valorProposto: valorProposto ?? null,
      taxaAtual: taxaAtual ?? null,
      taxaProposta: taxaProposta ?? null,
      prazoMeses: prazoMeses ?? null,
      carenciaMeses: carenciaMeses ?? null,
      garantias: input.garantias ?? null,
      docsPendentes: [],
      propostaId: input.propostaId ?? null,
      historico: historicoInicial,
      proximaData: proximaData ?? null,
      ultimaInteracao: now,
      observacoes: input.observacoes ?? null,
      criadoEm: now,
      atualizadoEm: now,
    }
    if (tx) return (await tx.insert(negociacaoCredor).values(row).returning())[0]
    this.memory.set(id, row as NegociacaoCredor)
    return row as NegociacaoCredor
  }

  async ensureForProposal(proposta: PropostaParaNegociacao, actor?: { id?: string; nome?: string }): Promise<VinculoPropostaNegociacao> {
    const lockKey = `${String(proposta.clienteId ?? '').trim()}:${proposta.id}`
    const inFlight = this.proposalLinksInFlight.get(lockKey)
    if (inFlight) return inFlight
    const task = this.ensureForProposalUnlocked(proposta, actor)
    this.proposalLinksInFlight.set(lockKey, task)
    try {
      return await task
    } finally {
      this.proposalLinksInFlight.delete(lockKey)
    }
  }

  private async ensureForProposalUnlocked(proposta: PropostaParaNegociacao, actor?: { id?: string; nome?: string }): Promise<VinculoPropostaNegociacao> {
    const clienteId = String(proposta.clienteId ?? '').trim()
    const credor = credorElegivel(proposta.credor)
    if (!clienteId) throw new Error('Proposta sem cliente não pode abrir negociação.')
    if (!credor) throw new Error('Defina o credor da proposta antes de enviá-la para negociação.')

    const existing = (await this.listByCliente(clienteId)).find((item) => item.propostaId === proposta.id && item.status !== 'encerrado')
    if (existing) {
      return this.finalizeProposalLink(existing, proposta, actor, false)
    }

    try {
      const created = await this.create({
        clienteId,
        credor,
        valorAtual: proposta.valorDivida ?? undefined,
        valorProposto: proposta.valorProposta ?? undefined,
        observacoes: proposta.titulo ? `Negociação criada a partir da proposta: ${proposta.titulo}` : undefined,
        propostaId: proposta.id,
        usuarioId: actor?.id,
        usuarioNome: actor?.nome || 'sistema',
      }, { verificarProposta: false })
      return this.finalizeProposalLink(created, proposta, actor, true)
    } catch (error) {
      const concurrent = (await this.listByCliente(clienteId)).find((item) => item.propostaId === proposta.id && item.status !== 'encerrado')
      if (concurrent) return this.finalizeProposalLink(concurrent, proposta, actor, false)
      throw error
    }
  }

  private async finalizeProposalLink(
    negociacao: NegociacaoCredor,
    proposta: PropostaParaNegociacao,
    actor: { id?: string; nome?: string } | undefined,
    criada: boolean,
  ): Promise<VinculoPropostaNegociacao> {
    if (String(proposta.status).toLowerCase() !== 'aceita' || negociacao.status === 'aprovado') {
      return { negociacao, criada }
    }
    const updated = await this.update(negociacao.id, {
      status: 'aprovado',
      usuarioId: actor?.id,
      usuarioNome: actor?.nome || 'sistema',
    })
    return { negociacao: updated || negociacao, criada }
  }

  async update(id: string, patch: AtualizarNegociacaoInput): Promise<NegociacaoCredor | null> {
    if (!isPgEnabled()) return this.updateInContext(id, patch)
    const updated = await getDb().transaction(async tx => {
      await tx.execute(sql`set local lock_timeout = '5s'`)
      const [identity] = await tx.select().from(negociacaoCredor).where(eq(negociacaoCredor.id, id)).limit(1)
      if (!identity) return null
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`proposal-workflow:${identity.clienteId}`}, 0))`)
      let linkedProposal: Proposta | undefined
      if (identity.propostaId) {
        ;[linkedProposal] = await tx.select().from(proposta).where(eq(proposta.id, identity.propostaId)).for('update')
        if (!linkedProposal || linkedProposal.clienteId !== identity.clienteId) linkedWriteConflict('O vínculo da negociação com a proposta precisa ser revisado.')
      }
      if (patch.propostaId && patch.propostaId !== identity.propostaId) {
        const [target] = await tx.select().from(proposta).where(eq(proposta.id, patch.propostaId)).limit(1)
        if (!target || target.clienteId !== identity.clienteId) linkedWriteConflict('A proposta pertence a outro cliente ou não existe.')
        if (target.status === 'aceita') linkedWriteConflict('Uma proposta aceita não pode receber outra negociação.')
        await tx.select({ id: proposta.id }).from(proposta).where(eq(proposta.id, target.id)).for('update')
      }
      const [contract] = await tx.select().from(clientContract).where(eq(clientContract.negociacaoId, id)).for('update')
      const [current] = await tx.select().from(negociacaoCredor).where(eq(negociacaoCredor.id, id)).for('update')
      if (!current) return null
      if (current.propostaId !== identity.propostaId) linkedWriteConflict('A negociação mudou. Recarregue antes de editar.')
      if (contract || linkedProposal?.status === 'aceita') {
        const protectedFields = ['credor', 'propostaId', 'valorAtual', 'valorProposto', 'taxaAtual', 'taxaProposta', 'prazoMeses', 'carenciaMeses', 'garantias'] as const
        for (const key of protectedFields) {
          if (patch[key] === undefined) continue
          const supplied = key === 'valorAtual' || key === 'valorProposto'
            ? patch[key] === null ? null : parseMoneyPtBr(String(patch[key])).amount
            : patch[key]
          if (!isDeepStrictEqual(current[key], supplied)) linkedWriteConflict('Os termos da negociação contratada são imutáveis. Crie uma nova versão da proposta.')
        }
        if (patch.status !== undefined && !['aprovado', 'encerrado'].includes(patch.status)) linkedWriteConflict('Uma negociação contratada só pode ser encerrada.')
      }
      return this.updateInContext(id, patch, tx, current)
    })
    if (updated) this.publishCommittedNegotiation(updated)
    return updated
  }

  private async updateInContext(id: string, patch: AtualizarNegociacaoInput, tx?: DealWriteTx, current?: NegociacaoCredor): Promise<NegociacaoCredor | null> {
    const existing = current || await this.get(id)
    if (!existing) return null
    const now = new Date()
    if (patch.status !== undefined && !STATUS.has(patch.status)) throw new Error('Status de negociação inválido.')
    if (patch.status !== undefined && patch.status !== existing.status && !TRANSITIONS[existing.status as NegociacaoStatus]?.has(patch.status)) throw new Error(`Transição de status não permitida: ${existing.status} → ${patch.status}.`)
    const updates: Partial<typeof negociacaoCredor.$inferInsert> = {
      atualizadoEm: now,
      ultimaInteracao: now,
    }
    if (patch.credor !== undefined) {
      const credor = patch.credor.trim()
      if (!credor) throw new Error('Credor é obrigatório.')
      updates.credor = credor
    }
    if (patch.status !== undefined) updates.status = patch.status
    if (patch.responsavel !== undefined) updates.responsavel = patch.responsavel
    if (patch.valorAtual !== undefined) updates.valorAtual = decimal(patch.valorAtual, 'Valor atual') ?? null
    if (patch.valorProposto !== undefined) updates.valorProposto = decimal(patch.valorProposto, 'Valor proposto') ?? null
    if (patch.taxaAtual !== undefined) updates.taxaAtual = decimal(patch.taxaAtual, 'Taxa atual', { max: 100 }) ?? null
    if (patch.taxaProposta !== undefined) updates.taxaProposta = decimal(patch.taxaProposta, 'Taxa proposta', { max: 100 }) ?? null
    if (patch.prazoMeses !== undefined) updates.prazoMeses = integer(patch.prazoMeses, 'Prazo') ?? null
    if (patch.carenciaMeses !== undefined) updates.carenciaMeses = integer(patch.carenciaMeses, 'Carência') ?? null
    if (patch.garantias !== undefined) updates.garantias = patch.garantias
    if (patch.observacoes !== undefined) updates.observacoes = patch.observacoes
    if (patch.proximaData !== undefined) updates.proximaData = isoDate(patch.proximaData) ?? null
    if (patch.docsPendentes !== undefined) updates.docsPendentes = patch.docsPendentes
    if (patch.propostaId !== undefined) updates.propostaId = patch.propostaId

    if (patch.appendHistorico) {
      const hist = Array.isArray(existing.historico) ? [...(existing.historico as HistoricoEntry[])] : []
      hist.push(patch.appendHistorico)
      updates.historico = hist
    } else {
      const hist = Array.isArray(existing.historico) ? [...(existing.historico as HistoricoEntry[])] : []
      const fields: Array<[string, unknown, unknown]> = [
        ['status', existing.status, patch.status], ['credor', existing.credor, patch.credor],
        ['responsavel', existing.responsavel, patch.responsavel], ['valorProposto', existing.valorProposto, updates.valorProposto],
        ['taxaProposta', existing.taxaProposta, updates.taxaProposta], ['prazoMeses', existing.prazoMeses, updates.prazoMeses],
        ['carenciaMeses', existing.carenciaMeses, updates.carenciaMeses], ['proximaData', existing.proximaData?.toISOString(), updates.proximaData instanceof Date ? updates.proximaData.toISOString() : updates.proximaData],
      ]
      for (const [campo, anterior, novo] of fields) if (novo !== undefined && String(anterior ?? '') !== String(novo ?? '')) hist.push({ ts: now.toISOString(), tipo: campo === 'status' ? 'mudanca_status' : 'nota', campo, anterior: anterior as never, novo: novo as never, texto: `${campo} alterado.`, usuarioId: patch.usuarioId, usuarioNome: patch.usuarioNome })
      updates.historico = hist
    }
    if (tx) return (await tx.update(negociacaoCredor).set(updates).where(eq(negociacaoCredor.id, id)).returning())[0] ?? null
    this.memory.set(id, { ...existing, ...updates } as NegociacaoCredor)
    return this.get(id)
  }

  async delete(id: string): Promise<boolean> {
    const now = new Date()
    const updated = await this.update(id, { status: 'encerrado', appendHistorico: {
      ts: now.toISOString(), tipo: 'nota', texto: 'Negociação arquivada pelo usuário.', usuarioNome: 'sistema',
    } })
    return Boolean(updated)
  }

  /** Resumo agregado por cliente — usado no Command Center. */
  async resumoCliente(clienteId: string): Promise<{
    total: number
    porStatus: Record<string, number>
    valorEmNegociacao: number
    proximoDeadline: { credor: string; data: string } | null
  }> {
    const list = await this.listByCliente(clienteId)
    const porStatus: Record<string, number> = {}
    let valorEmNegociacao = 0
    let proximo: { credor: string; data: string } | null = null
    const ativos = ACTIVE
    for (const n of list) {
      porStatus[n.status] = (porStatus[n.status] ?? 0) + 1
      if (ativos.has(n.status as NegociacaoStatus)) {
        const v = n.valorAtual ? Number(n.valorAtual) : 0
        valorEmNegociacao += v
        if (n.proximaData) {
          const dt = n.proximaData.toISOString()
          if (!proximo || dt < proximo.data) {
            proximo = { credor: n.credor, data: dt }
          }
        }
      }
    }
    return { total: list.length, porStatus, valorEmNegociacao, proximoDeadline: proximo }
  }
}

let _instance: DealRoomService | null = null
export function getDealRoomService(): DealRoomService {
  if (!_instance) _instance = new DealRoomService()
  return _instance
}
