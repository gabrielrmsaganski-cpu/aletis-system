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
import { eq, desc } from 'drizzle-orm'
import { getDb } from '../../db/client.js'
import { negociacaoCredor, proposta, type NegociacaoCredor, type Proposta } from '../../db/schema.js'

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
  /** Snapshot dos valores no momento (para comparação histórica). */
  snapshot?: {
    valor?: number
    taxa?: number
    prazo?: number
    carencia?: number
  }
}

export interface CriarNegociacaoInput {
  clienteId: string
  credor: string
  responsavel?: string
  valorAtual?: number
  valorProposto?: number
  taxaAtual?: number
  taxaProposta?: number
  prazoMeses?: number
  carenciaMeses?: number
  garantias?: string[]
  observacoes?: string
  proximaData?: string
  /** Wave OS — vincular já na criação a uma proposta global. */
  propostaId?: string
}

export interface AtualizarNegociacaoInput {
  status?: NegociacaoStatus
  responsavel?: string
  valorAtual?: number
  valorProposto?: number
  taxaAtual?: number
  taxaProposta?: number
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
}

export class DealRoomService {
  async list(filters?: { clienteId?: string; status?: NegociacaoStatus }): Promise<NegociacaoCredor[]> {
    const db = getDb()
    let q = db.select().from(negociacaoCredor).$dynamic()
    if (filters?.clienteId) q = q.where(eq(negociacaoCredor.clienteId, filters.clienteId))
    if (filters?.status) q = q.where(eq(negociacaoCredor.status, filters.status))
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
    const db = getDb()
    const rows = await db.select().from(negociacaoCredor).where(eq(negociacaoCredor.id, id)).limit(1)
    return rows[0] ?? null
  }

  async create(input: CriarNegociacaoInput): Promise<NegociacaoCredor> {
    const db = getDb()
    const id = `neg_${randomUUID()}`
    const now = new Date()
    const historicoInicial: HistoricoEntry[] = [
      {
        ts: now.toISOString(),
        tipo: 'criacao',
        texto: `Negociação aberta com ${input.credor}.`,
        snapshot: {
          valor: input.valorAtual,
          taxa: input.taxaAtual,
          prazo: input.prazoMeses,
          carencia: input.carenciaMeses,
        },
      },
    ]
    const row: typeof negociacaoCredor.$inferInsert = {
      id,
      clienteId: input.clienteId,
      credor: input.credor,
      status: 'negociando',
      responsavel: input.responsavel ?? null,
      valorAtual: input.valorAtual != null ? String(input.valorAtual) : null,
      valorProposto: input.valorProposto != null ? String(input.valorProposto) : null,
      taxaAtual: input.taxaAtual != null ? String(input.taxaAtual) : null,
      taxaProposta: input.taxaProposta != null ? String(input.taxaProposta) : null,
      prazoMeses: input.prazoMeses ?? null,
      carenciaMeses: input.carenciaMeses ?? null,
      garantias: input.garantias ?? null,
      docsPendentes: [],
      propostaId: input.propostaId ?? null,
      historico: historicoInicial,
      proximaData: input.proximaData ? new Date(input.proximaData) : null,
      ultimaInteracao: now,
      observacoes: input.observacoes ?? null,
      criadoEm: now,
      atualizadoEm: now,
    }
    await db.insert(negociacaoCredor).values(row)
    return (await this.get(id))!
  }

  async update(id: string, patch: AtualizarNegociacaoInput): Promise<NegociacaoCredor | null> {
    const existing = await this.get(id)
    if (!existing) return null
    const now = new Date()
    const updates: Partial<typeof negociacaoCredor.$inferInsert> = {
      atualizadoEm: now,
      ultimaInteracao: now,
    }
    if (patch.status !== undefined) updates.status = patch.status
    if (patch.responsavel !== undefined) updates.responsavel = patch.responsavel
    if (patch.valorAtual !== undefined) updates.valorAtual = patch.valorAtual != null ? String(patch.valorAtual) : null
    if (patch.valorProposto !== undefined) updates.valorProposto = patch.valorProposto != null ? String(patch.valorProposto) : null
    if (patch.taxaAtual !== undefined) updates.taxaAtual = patch.taxaAtual != null ? String(patch.taxaAtual) : null
    if (patch.taxaProposta !== undefined) updates.taxaProposta = patch.taxaProposta != null ? String(patch.taxaProposta) : null
    if (patch.prazoMeses !== undefined) updates.prazoMeses = patch.prazoMeses
    if (patch.carenciaMeses !== undefined) updates.carenciaMeses = patch.carenciaMeses
    if (patch.garantias !== undefined) updates.garantias = patch.garantias
    if (patch.observacoes !== undefined) updates.observacoes = patch.observacoes
    if (patch.proximaData !== undefined) updates.proximaData = patch.proximaData ? new Date(patch.proximaData) : null
    if (patch.docsPendentes !== undefined) updates.docsPendentes = patch.docsPendentes
    if (patch.propostaId !== undefined) updates.propostaId = patch.propostaId

    if (patch.appendHistorico) {
      const hist = Array.isArray(existing.historico) ? [...(existing.historico as HistoricoEntry[])] : []
      hist.push(patch.appendHistorico)
      updates.historico = hist
    } else if (patch.status && patch.status !== existing.status) {
      const hist = Array.isArray(existing.historico) ? [...(existing.historico as HistoricoEntry[])] : []
      hist.push({
        ts: now.toISOString(),
        tipo: 'mudanca_status',
        texto: `Status: ${existing.status} → ${patch.status}`,
      })
      updates.historico = hist
    }

    const db = getDb()
    await db.update(negociacaoCredor).set(updates).where(eq(negociacaoCredor.id, id))
    return this.get(id)
  }

  async delete(id: string): Promise<boolean> {
    const db = getDb()
    const res = await db.delete(negociacaoCredor).where(eq(negociacaoCredor.id, id))
    return (res.rowCount ?? 0) > 0
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
    const ativos = new Set(['negociando', 'contraproposta', 'aguardando_doc'])
    for (const n of list) {
      porStatus[n.status] = (porStatus[n.status] ?? 0) + 1
      if (ativos.has(n.status)) {
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
