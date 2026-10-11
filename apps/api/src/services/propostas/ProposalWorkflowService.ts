import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { and, eq, sql } from 'drizzle-orm'
import { getDb, isPgEnabled } from '../../db/client.js'
import {
  auditLog, automationEvent, cliente, clienteDemanda, clientContract,
  clientTimelineEvent, negociacaoCredor, proposta as propostaTable,
} from '../../db/schema.js'
import { crmDiscountPercent, crmMoneySchema, propostaPatchSchema } from '../../lib/crm-write-validation.js'
import { moneyToCents } from '../../lib/parseMoneyPtBr.js'
import { getClientCoreService } from '../core/ClientCoreService.js'
import { getDealRoomService } from '../dealRoom/DealRoomService.js'
import {
  deriveProposalTitle, demandStatusFromProposal, getClienteDemandaService,
  proposalAutoKey, rowToRecord, semanticDemandScore, shouldAdvanceStatus,
  type ClienteDemandaRecord, type DemandProposalLike,
} from '../cliente/ClienteDemandaService.js'

export type ProposalStatus = 'rascunho' | 'em_analise' | 'enviada' | 'aceita' | 'rejeitada' | 'expirada'
export interface WorkflowProposal extends DemandProposalLike, Record<string, unknown> {
  id: string
  clienteId: string
  status: ProposalStatus
  revision: number
}
export interface ProposalWorkflowInput {
  id: string
  patch: unknown
  actor?: { id?: string; nome?: string }
  expectedRevision?: number
}
export interface ProposalWorkflowResult {
  proposta: WorkflowProposal
  previous: WorkflowProposal
  demanda?: ClienteDemandaRecord
  negociacaoId?: string
  contratoId?: string
  changed: boolean
  eventIds: string[]
  createdNegociacao: boolean
  createdContrato: boolean
}
export class ProposalWorkflowError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string) {
    super(message)
    this.name = 'ProposalWorkflowError'
  }
}

const TRANSITIONS: Record<ProposalStatus, ReadonlySet<ProposalStatus>> = {
  rascunho: new Set(['em_analise']), em_analise: new Set(['rascunho', 'enviada']),
  enviada: new Set(['em_analise', 'aceita', 'rejeitada', 'expirada']),
  aceita: new Set(), rejeitada: new Set(), expirada: new Set(),
}
const APPROVABLE_DEALS = new Set(['negociando', 'contraproposta', 'aguardando_doc'])
const NON_MATERIAL_FIELDS = new Set(['observacoes', 'pdfUrl'])
type DemandRow = typeof clienteDemanda.$inferSelect
type DealRow = typeof negociacaoCredor.$inferSelect
type ContractRow = typeof clientContract.$inferSelect
type WorkflowTx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]

function fail(status: number, code: string, message: string): never {
  throw new ProposalWorkflowError(status, code, message)
}
function normalizeStatus(value: unknown): ProposalStatus {
  const raw = String(value ?? '').toLowerCase()
  if (raw === 'revisao' || raw === 'revisão' || raw === 'gerando' || raw === 'gerada') return 'em_analise'
  if (raw === 'visualizada') return 'enviada'
  if (Object.hasOwn(TRANSITIONS, raw)) return raw as ProposalStatus
  return fail(422, 'INVALID_PROPOSAL', 'A proposta possui status inválido e precisa ser revisada.')
}
function money(value: unknown): string {
  const parsed = crmMoneySchema.safeParse(value)
  if (!parsed.success) return fail(422, 'INVALID_MONEY', 'A proposta possui um valor monetário inválido.')
  const cents = moneyToCents(String(parsed.data))!
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`
}
function normalizeMoneyFields<T extends Record<string, unknown>>(value: T): T {
  const next: Record<string, unknown> = structuredClone(value)
  for (const key of ['valorDivida', 'valorProposta']) {
    if (next[key] !== undefined && next[key] !== null) next[key] = money(next[key])
  }
  if (Array.isArray(next.itens)) next.itens = next.itens.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return fail(422, 'INVALID_PROPOSAL', 'Item da proposta inválido.')
    const row = item as Record<string, unknown>
    return { ...row, valor: money(row.valor) }
  })
  return next as T
}

/** Planner puro compartilhado com o modo de desenvolvimento sem PostgreSQL. */
export function prepareProposalPatch(
  input: WorkflowProposal,
  patch: unknown,
  expectedRevision?: number,
): { proposta: WorkflowProposal; changed: boolean } {
  if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) {
    return fail(400, 'INVALID_REVISION', 'A revisão esperada deve ser um inteiro não negativo.')
  }
  const empty = patch !== null && typeof patch === 'object' && !Array.isArray(patch) && Object.keys(patch).length === 0
  const parsed = empty ? { success: true as const, data: {} } : propostaPatchSchema.safeParse(patch)
  if (!parsed.success) return fail(400, 'INVALID_PATCH', 'Atualização da proposta inválida.')
  const previous = normalizeMoneyFields({ ...input, status: normalizeStatus(input.status), revision: input.revision ?? 0 }) as WorkflowProposal
  const { expectedRevision: embeddedRevision, ...businessPatch } = parsed.data as Record<string, unknown>
  if (embeddedRevision !== undefined && expectedRevision !== undefined && embeddedRevision !== expectedRevision) {
    return fail(400, 'INVALID_REVISION', 'As revisões esperadas informadas são diferentes.')
  }
  expectedRevision ??= embeddedRevision as number | undefined
  const normalizedPatch = normalizeMoneyFields(businessPatch)
  const next = { ...previous, ...normalizedPatch } as WorkflowProposal
  if (Object.hasOwn(normalizedPatch, 'valorDivida') || Object.hasOwn(normalizedPatch, 'valorProposta') || Object.hasOwn(normalizedPatch, 'descontoPercentual')) {
    next.descontoPercentual = crmDiscountPercent(money(next.valorDivida), money(next.valorProposta))
  }
  // A URL é uma projeção do próprio registro, nunca um arquivo escolhido pelo cliente.
  if (Object.hasOwn(normalizedPatch, 'pdfUrl') && next.pdfUrl !== null && next.pdfUrl !== `/api/propostas/${input.id}/pdf`) {
    return fail(400, 'INVALID_PATCH', 'A URL do PDF deve apontar para esta proposta.')
  }
  const changed = !isDeepStrictEqual(previous, next)
  // Resposta perdida: reenviar exatamente os valores já aplicados é um no-op.
  if (changed && expectedRevision !== undefined && expectedRevision !== previous.revision) {
    return fail(409, 'REVISION_CONFLICT', 'A proposta foi atualizada por outra operação. Recarregue antes de editar.')
  }
  if (next.status !== previous.status && !TRANSITIONS[previous.status].has(next.status)) {
    return fail(409, 'INVALID_STATUS_TRANSITION', `Transição de status não permitida: ${previous.status} → ${next.status}.`)
  }
  if (previous.status === 'aceita') {
    for (const key of Object.keys(normalizedPatch)) {
      if (!NON_MATERIAL_FIELDS.has(key) && !isDeepStrictEqual(previous[key], next[key])) {
        return fail(409, 'ACCEPTED_TERMS_IMMUTABLE', 'Os termos e vínculos de uma proposta aceita são imutáveis. Crie uma nova versão para alterá-los.')
      }
    }
  }
  return { proposta: next, changed }
}

function ids(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))] : []
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function event(tipo: string, titulo: string, actor: string, now: Date, descricao?: string) {
  return { id: `evt_${randomUUID()}`, tipo, titulo, descricao, autor: actor, criadoEm: now.toISOString() }
}
function contractType(type: unknown): string {
  if (type === 'liquidacao' || type === 'acordo_judicial') return 'acordo_extrajudicial'
  return type === 'memoria_calculo' ? 'memoria_calculo' : 'termo_renegociacao'
}
function sameClient(row: { clienteId: string }, clienteId: string): void {
  if (row.clienteId !== clienteId) fail(409, 'LINK_CONFLICT', 'Um vínculo da proposta pertence a outro cliente.')
}
function checkContractLinks(contract: ContractRow, proposal: WorkflowProposal): void {
  sameClient(contract, proposal.clienteId)
  if (!contract.demandaId || !contract.negociacaoId || contract.propostaId !== proposal.id) {
    fail(409, 'LINK_CONFLICT', 'O contrato existente possui vínculos incompletos. Revise o cadastro antes de continuar.')
  }
  if (proposal.demandaId && proposal.demandaId !== contract.demandaId) {
    fail(409, 'LINK_CONFLICT', 'A demanda da proposta diverge do contrato existente.')
  }
}

async function persistDemand(tx: WorkflowTx, record: DemandRow): Promise<void> {
  const { id, ...values } = record
  await tx.insert(clienteDemanda).values(record).onConflictDoUpdate({ target: clienteDemanda.id, set: values })
}

/**
 * Uma única transação para proposta, demanda, negociação, contrato e eventos.
 * Nenhuma chamada à rede, memória ALIX ou publicação de cache ocorre no callback.
 */
export async function updateProposalWorkflow(input: ProposalWorkflowInput): Promise<ProposalWorkflowResult> {
  if (!isPgEnabled()) return fail(503, 'PG_REQUIRED', 'O fechamento transacional exige PostgreSQL disponível.')
  if (typeof input.id !== 'string' || !input.id.trim()) return fail(400, 'INVALID_PATCH', 'Informe a proposta.')
  let committedDemands: DemandRow[] = []
  let committedDeal: DealRow | undefined
  let committedContract: ContractRow | undefined
  const result = await getDb().transaction(async tx => {
    await tx.execute(sql`set local lock_timeout = '5s'`)
    await tx.execute(sql`set local statement_timeout = '20s'`)
    const [identity] = await tx.select({ clienteId: propostaTable.clienteId }).from(propostaTable).where(eq(propostaTable.id, input.id)).limit(1)
    if (!identity) return fail(404, 'PROPOSAL_NOT_FOUND', 'Proposta não encontrada.')
    if (!identity.clienteId) return fail(422, 'INVALID_PROPOSAL', 'Vincule a proposta a um cliente antes de continuar.')
    // O cliente serializa também a escolha da demanda/numeração entre propostas distintas.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`proposal-workflow:${identity.clienteId}`}, 0))`)
    const [stored] = await tx.select().from(propostaTable).where(eq(propostaTable.id, input.id)).for('update')
    if (!stored) return fail(404, 'PROPOSAL_NOT_FOUND', 'Proposta não encontrada.')
    if (stored.clienteId !== identity.clienteId) return fail(409, 'LINK_CONFLICT', 'O cliente da proposta mudou. Recarregue o registro.')
    const [client] = await tx.select({ id: cliente.id }).from(cliente).where(eq(cliente.id, identity.clienteId)).limit(1).for('key share')
    if (!client) return fail(404, 'CLIENT_NOT_FOUND', 'O cliente da proposta não foi encontrado.')
    const previous = normalizeMoneyFields({
      ...object(stored.payload), id: stored.id, clienteId: identity.clienteId,
      status: normalizeStatus(stored.status ?? object(stored.payload).status), revision: stored.revision,
      ...(stored.demandaId !== null ? { demandaId: stored.demandaId } : {}),
    }) as WorkflowProposal
    const prepared = prepareProposalPatch(previous, input.patch, input.expectedRevision)
    const proposal = prepared.proposta
    const actorId = input.actor?.id?.trim() || 'system'
    const actorName = input.actor?.nome?.trim() || actorId
    const now = new Date()
    const commercial = proposal.status === 'enviada' || proposal.status === 'aceita'
    if (commercial && (!String(proposal.credor ?? '').trim() || /^(?:credor|institui[cç][aã]o)\s+(?:a\s+)?confirmar$/i.test(String(proposal.credor)))) {
      return fail(422, 'INVALID_PROPOSAL', 'Defina o credor da proposta antes de enviá-la para negociação.')
    }
    if (commercial) {
      proposal.valorDivida = money(proposal.valorDivida)
      proposal.valorProposta = money(proposal.valorProposta)
    }

    const [existingContract] = await tx.select().from(clientContract).where(eq(clientContract.propostaId, proposal.id)).for('update')
    if (existingContract) checkContractLinks(existingContract, proposal)
    const demands = await tx.select().from(clienteDemanda).where(eq(clienteDemanda.clienteId, proposal.clienteId)).for('update')
    const requestedDemandId = existingContract?.demandaId || proposal.demandaId
    let demand = requestedDemandId ? demands.find(row => row.id === requestedDemandId) : undefined
    if (requestedDemandId && !demand) return fail(409, 'LINK_CONFLICT', 'A demanda informada não existe ou pertence a outro cliente.')
    if (!demand) {
      const linked = demands.filter(row => ids(row.propostaIds).includes(proposal.id))
      if (linked.length > 1) return fail(409, 'LINK_CONFLICT', 'A proposta está vinculada a mais de uma demanda. Revise os vínculos.')
      demand = linked[0]
    }
    const autoKey = proposalAutoKey(proposal)
    if (!demand) demand = demands.find(row => object(row.metadata).autoKey === autoKey)
    if (!demand) {
      const candidate = demands.filter(row => row.origem === 'manual' || row.origem === 'cadastro_ia')
        .map(row => ({ row, score: semanticDemandScore(rowToRecord(row), proposal) }))
        .sort((a, b) => b.score - a.score || b.row.atualizadoEm.getTime() - a.row.atualizadoEm.getTime())[0]
      if (candidate && candidate.score >= 8) demand = candidate.row
    }
    const changedDemands = new Map<string, DemandRow>()
    if (!demand) {
      demand = {
        id: `dem_${randomUUID()}`, clienteId: proposal.clienteId,
        numero: Math.max(0, ...demands.map(row => row.numero)) + 1,
        titulo: deriveProposalTitle(proposal), assunto: String(proposal.tipo || 'proposta').slice(0, 80),
        descricao: `Demanda criada automaticamente a partir da proposta ${String(proposal.titulo || proposal.id).slice(0, 180)}.`,
        categoria: 'renegociacao', status: demandStatusFromProposal(proposal), prioridade: 'normal',
        responsavel: null, credor: String(proposal.credor || '') || null,
        valorPretendido: proposal.valorDivida != null ? money(proposal.valorDivida) : proposal.valorProposta != null ? money(proposal.valorProposta) : null,
        prazoAlvo: null, proximaAcao: null, proximaAcaoEm: null, probabilidade: 10,
        resultadoEsperado: null, propostaPrincipalId: null, origem: 'proposta_existente',
        propostaIds: [], documentoIds: [], eventos: [event('sistema', 'Demanda criada', actorName, now)],
        checklist: [], tags: [], metadata: { autoKey }, criadoEm: now, atualizadoEm: now,
      }
      changedDemands.set(demand.id, demand)
    } else {
      demand = structuredClone(demand)
    }
    if (commercial && ['cancelada', 'suspensa'].includes(demand.status)) {
      return fail(409, 'LINK_CONFLICT', 'Reative a demanda antes de enviar ou aceitar uma proposta vinculada.')
    }
    for (const other of demands) {
      if (other.id === demand.id || !ids(other.propostaIds).includes(proposal.id)) continue
      if (existingContract) return fail(409, 'LINK_CONFLICT', 'O contrato possui um vínculo de demanda ambíguo.')
      changedDemands.set(other.id, {
        ...other, propostaIds: ids(other.propostaIds).filter(id => id !== proposal.id),
        propostaPrincipalId: other.propostaPrincipalId === proposal.id ? null : other.propostaPrincipalId,
        eventos: [...array(other.eventos), event('proposta', 'Proposta movida para outra demanda', actorName, now, proposal.id)].slice(-200), atualizadoEm: now,
      })
    }
    const originalDemand = demands.find(row => row.id === demand!.id)
    const proposalIds = ids(demand.propostaIds)
    if (!proposalIds.includes(proposal.id)) {
      proposalIds.push(proposal.id)
      demand.propostaIds = proposalIds
      demand.eventos = [...array(demand.eventos), event('proposta', 'Proposta vinculada', actorName, now, proposal.id)].slice(-200)
    }
    const status = demandStatusFromProposal(proposal)
    if (shouldAdvanceStatus(demand.status as ClienteDemandaRecord['status'], status)) {
      demand.status = status
      demand.eventos = [...array(demand.eventos), event('status', `Status atualizado para ${status}`, actorName, now)].slice(-200)
    }
    const sourceId = proposal.arquivoOrigem?.cofreUploadId
    if (sourceId && !ids(demand.documentoIds).includes(sourceId)) demand.documentoIds = [...ids(demand.documentoIds), sourceId]
    if (proposal.status === 'aceita') {
      demand.probabilidade = 100
      // Um retry de uma versão antiga não desfaz a principal escolhida depois.
      if (!demand.propostaPrincipalId || previous.status !== 'aceita') demand.propostaPrincipalId = proposal.id
    }
    proposal.demandaId = demand.id
    proposal.demandaTitulo = demand.titulo
    proposal.versaoDemanda = proposalIds.indexOf(proposal.id) + 1
    if (!originalDemand || !isDeepStrictEqual(originalDemand, demand)) {
      demand.atualizadoEm = now
      changedDemands.set(demand.id, demand)
    }

    const linkedDeals = await tx.select().from(negociacaoCredor).where(eq(negociacaoCredor.propostaId, proposal.id)).for('update')
    for (const deal of linkedDeals) sameClient(deal, proposal.clienteId)
    let deal: DealRow | undefined
    let createdNegociacao = false
    let changedDeal = false
    if (existingContract) {
      const [canonical] = await tx.select().from(negociacaoCredor).where(eq(negociacaoCredor.id, existingContract.negociacaoId!)).for('update')
      if (!canonical || canonical.propostaId !== proposal.id) return fail(409, 'LINK_CONFLICT', 'A negociação do contrato existente não corresponde à proposta.')
      sameClient(canonical, proposal.clienteId)
      if (linkedDeals.some(row => row.id !== canonical.id && row.status !== 'encerrado')) {
        return fail(409, 'LINK_CONFLICT', 'Existe outra negociação ativa para a proposta contratada. Revise os vínculos.')
      }
      deal = canonical
    } else {
      const active = linkedDeals.filter(row => row.status !== 'encerrado')
      if (active.length > 1) return fail(409, 'LINK_CONFLICT', 'Existe mais de uma negociação ativa para a proposta.')
      deal = active[0]
    }
    if (commercial && !deal) {
      deal = {
        id: `neg_${randomUUID()}`, clienteId: proposal.clienteId, credor: String(proposal.credor).trim(),
        status: 'negociando', responsavel: null, valorAtual: money(proposal.valorDivida), valorProposto: money(proposal.valorProposta),
        taxaAtual: null, taxaProposta: null, prazoMeses: null, carenciaMeses: null, garantias: null,
        docsPendentes: [], propostaId: proposal.id, proximaData: null, ultimaInteracao: now,
        observacoes: proposal.titulo ? `Negociação criada a partir da proposta: ${proposal.titulo}` : null,
        historico: [{ ts: now.toISOString(), tipo: 'criacao', texto: `Negociação aberta com ${proposal.credor}.`,
          snapshot: { valor: money(proposal.valorDivida) }, usuarioId: input.actor?.id, usuarioNome: actorName }],
        criadoEm: now, atualizadoEm: now,
      }
      createdNegociacao = true
      changedDeal = true
    }
    if (commercial && deal && !createdNegociacao && !existingContract) {
      const terms = { credor: String(proposal.credor).trim(), valorAtual: money(proposal.valorDivida), valorProposto: money(proposal.valorProposta) }
      const differences = (Object.keys(terms) as Array<keyof typeof terms>).filter(key => deal![key] !== terms[key])
      if (differences.length && !APPROVABLE_DEALS.has(deal.status)) {
        return fail(409, 'LINK_CONFLICT', 'Os termos da negociação já encerrada ou decidida divergem da proposta. Revise a negociação antes de continuar.')
      }
      if (differences.length) {
        deal = { ...deal, ...terms, atualizadoEm: now, ultimaInteracao: now,
          historico: [...array(deal.historico), ...differences.map(campo => ({
            ts: now.toISOString(), tipo: 'nota', campo, anterior: deal![campo], novo: terms[campo],
            texto: `${campo} sincronizado com a proposta.`, usuarioId: input.actor?.id, usuarioNome: actorName,
          }))],
        }
        changedDeal = true
      }
    }
    if (deal && proposal.status === 'aceita' && deal.status !== 'aprovado' && !(existingContract && deal.status === 'encerrado')) {
      if (!APPROVABLE_DEALS.has(deal.status)) return fail(409, 'INVALID_STATUS_TRANSITION', `A negociação ${deal.status} não pode ser aprovada automaticamente.`)
      deal = {
        ...deal, status: 'aprovado', atualizadoEm: now, ultimaInteracao: now,
        historico: [...array(deal.historico), { ts: now.toISOString(), tipo: 'mudanca_status', campo: 'status',
          anterior: deal.status, novo: 'aprovado', texto: 'status alterado.', usuarioId: input.actor?.id, usuarioNome: actorName }],
      }
      changedDeal = true
    }

    let contract: ContractRow | undefined = existingContract
    let createdContrato = false
    if (proposal.status === 'aceita' && !contract) {
      if (!deal) return fail(409, 'LINK_CONFLICT', 'Não foi possível determinar a negociação da proposta.')
      contract = {
        id: `ctr_${randomUUID()}`, clienteId: proposal.clienteId, titulo: String(proposal.titulo || `Contrato decorrente da proposta ${proposal.id}`).slice(0, 220),
        credor: String(proposal.credor).trim(), numeroContrato: null, tipo: contractType(proposal.tipo), status: 'rascunho',
        valorOriginal: money(proposal.valorDivida), valorAtual: money(proposal.valorProposta), moeda: 'BRL',
        dataAssinatura: null, dataVencimento: null, documentoId: null,
        propostaId: proposal.id, negociacaoId: deal.id, demandaId: demand.id,
        metadata: { origem: 'proposta_aceita', propostaId: proposal.id, negociacaoId: deal.id, demandaId: demand.id,
          propostaTitulo: proposal.titulo, statusGeracao: 'pendente_revisao_juridica' }, criadoEm: now, atualizadoEm: now,
      }
      createdContrato = true
    }
    const changed = prepared.changed || !isDeepStrictEqual(previous, proposal) || changedDemands.size > 0 || changedDeal || createdContrato
    const eventIds: string[] = []
    if (changed) {
      if (stored.revision >= 2147483647) return fail(409, 'REVISION_CONFLICT', 'Limite de revisões atingido.')
      proposal.revision = stored.revision + 1
      proposal.ultimaAtualizacao = now.toISOString().slice(0, 10)
      // Ordem fixa de gravação. Qualquer falha reverte também históricos e outbox.
      for (const row of changedDemands.values()) await persistDemand(tx, row)
      if (createdNegociacao) await tx.insert(negociacaoCredor).values(deal!)
      else if (changedDeal) {
        const { id, ...values } = deal!
        await tx.update(negociacaoCredor).set(values).where(eq(negociacaoCredor.id, id))
      }
      if (createdContrato) await tx.insert(clientContract).values(contract!)
      const saved = await tx.update(propostaTable).set({
        demandaId: proposal.demandaId, status: proposal.status, tipo: proposal.tipo ?? stored.tipo,
        titulo: proposal.titulo ?? stored.titulo, valorProposto: proposal.valorProposta != null ? money(proposal.valorProposta) : stored.valorProposto,
        pdfPath: typeof proposal.pdfUrl === 'string' ? proposal.pdfUrl : null,
        payload: proposal, revision: proposal.revision, atualizadoEm: now,
      }).where(and(eq(propostaTable.id, proposal.id), eq(propostaTable.revision, stored.revision))).returning({ id: propostaTable.id })
      if (saved.length !== 1) return fail(409, 'REVISION_CONFLICT', 'Não foi possível confirmar a revisão da proposta.')
      const links = { clienteId: proposal.clienteId, propostaId: proposal.id, demandaId: demand.id,
        negociacaoId: deal?.id, contratoId: contract?.id, revision: proposal.revision }
      const title = proposal.status === 'aceita' && previous.status !== 'aceita'
        ? 'Proposta aceita e fechamento registrado' : 'Proposta atualizada'
      await tx.insert(clientTimelineEvent).values({
        id: `proposal:${proposal.id}:revision:${proposal.revision}:timeline`, clienteId: proposal.clienteId,
        eventType: 'proposal_updated', title, source: 'proposal_workflow', sourceId: proposal.id,
        visibility: 'internal', createdBy: actorId, metadata: links, createdAt: now,
      })
      await tx.insert(auditLog).values({
        ator: actorId, acao: 'proposal_workflow_updated', recurso: `proposta:${proposal.id}`,
        dadosAntes: previous, dadosDepois: { ...proposal, ...links }, criadoEm: now,
      })
      if (createdContrato) await tx.insert(auditLog).values({
        ator: actorId, acao: 'client_contract_created', recurso: `contrato:${contract!.id}`,
        dadosAntes: null, dadosDepois: { ...links, status: 'rascunho' }, criadoEm: now,
      })
      const eventTypes = createdContrato ? ['proposal.updated', 'contract.created'] : ['proposal.updated']
      for (const eventType of eventTypes) {
        const id = `proposal:${proposal.id}:revision:${proposal.revision}:${eventType}`
        eventIds.push(id)
        await tx.insert(automationEvent).values({
          id, eventType, payload: { ...links, proposta: proposal, previous, actor: { id: actorId, nome: actorName } },
          status: 'queued', attempts: 0, targetProvider: 'internal',
          metadata: { source: 'proposal_workflow', revision: proposal.revision }, criadoEm: now,
        })
      }
      committedDemands = [...changedDemands.values()]
      committedDeal = changedDeal ? deal : undefined
      committedContract = createdContrato ? contract : undefined
    }
    return { proposta: proposal, previous, demanda: rowToRecord(demand), negociacaoId: deal?.id,
      contratoId: contract?.id, changed, eventIds, createdNegociacao, createdContrato }
  })
  // O cache nunca informa sucesso antes do COMMIT do PostgreSQL.
  getClienteDemandaService().publishCommittedRows(committedDemands)
  if (committedDeal) getDealRoomService().publishCommittedNegotiation(committedDeal)
  if (committedContract) getClientCoreService().publishCommittedContract(committedContract)
  return result
}

/** Exclusão de rascunhos sem negociação; propostas comerciais preservam seus vínculos. */
export async function deleteProposalWorkflow(input: Omit<ProposalWorkflowInput, 'patch'>): Promise<{
  id: string; previous: WorkflowProposal; deleted: true
}> {
  if (!isPgEnabled()) return fail(503, 'PG_REQUIRED', 'A exclusão transacional exige PostgreSQL disponível.')
  if (typeof input.id !== 'string' || !input.id.trim()) return fail(400, 'INVALID_PATCH', 'Informe a proposta.')
  if (input.expectedRevision !== undefined && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)) {
    return fail(400, 'INVALID_REVISION', 'A revisão esperada deve ser um inteiro não negativo.')
  }
  let committedDemands: DemandRow[] = []
  const result = await getDb().transaction(async tx => {
    await tx.execute(sql`set local lock_timeout = '5s'`)
    await tx.execute(sql`set local statement_timeout = '20s'`)
    const [identity] = await tx.select({ clienteId: propostaTable.clienteId }).from(propostaTable).where(eq(propostaTable.id, input.id)).limit(1)
    if (!identity) return fail(404, 'PROPOSAL_NOT_FOUND', 'Proposta não encontrada.')
    if (!identity.clienteId) return fail(422, 'INVALID_PROPOSAL', 'A proposta precisa de um cliente vinculado.')
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`proposal-workflow:${identity.clienteId}`}, 0))`)
    const [stored] = await tx.select().from(propostaTable).where(eq(propostaTable.id, input.id)).for('update')
    if (!stored) return fail(404, 'PROPOSAL_NOT_FOUND', 'Proposta não encontrada.')
    if (stored.clienteId !== identity.clienteId) return fail(409, 'LINK_CONFLICT', 'O cliente da proposta mudou. Recarregue o registro.')
    if (input.expectedRevision !== undefined && input.expectedRevision !== stored.revision) {
      return fail(409, 'REVISION_CONFLICT', 'A proposta foi atualizada por outra operação. Recarregue antes de excluir.')
    }
    const previous = {
      ...object(stored.payload), id: stored.id, clienteId: identity.clienteId,
      status: normalizeStatus(stored.status ?? object(stored.payload).status), revision: stored.revision,
      ...(stored.demandaId ? { demandaId: stored.demandaId } : {}),
    } as WorkflowProposal
    if (!['rascunho', 'em_analise'].includes(previous.status)) {
      return fail(409, 'PROPOSAL_DELETE_FORBIDDEN', 'Somente propostas em rascunho ou análise podem ser excluídas.')
    }
    const contracts = await tx.select({ id: clientContract.id }).from(clientContract).where(eq(clientContract.propostaId, input.id)).for('update')
    const deals = await tx.select({ id: negociacaoCredor.id }).from(negociacaoCredor).where(eq(negociacaoCredor.propostaId, input.id)).for('update')
    if (contracts.length || deals.length) return fail(409, 'PROPOSAL_DELETE_FORBIDDEN', 'Propostas vinculadas a negociação ou contrato não podem ser excluídas.')
    const demands = await tx.select().from(clienteDemanda).where(eq(clienteDemanda.clienteId, identity.clienteId)).for('update')
    const now = new Date()
    const actor = input.actor?.id || 'system'
    const updates: DemandRow[] = []
    for (const row of demands) {
      if (!ids(row.propostaIds).includes(input.id) && row.propostaPrincipalId !== input.id) continue
      const next = { ...row, propostaIds: ids(row.propostaIds).filter(id => id !== input.id),
        propostaPrincipalId: row.propostaPrincipalId === input.id ? null : row.propostaPrincipalId,
        eventos: [...array(row.eventos), event('proposta', 'Rascunho de proposta excluído', input.actor?.nome || actor, now, input.id)].slice(-200),
        atualizadoEm: now,
      }
      await persistDemand(tx, next)
      updates.push(next)
    }
    await tx.insert(auditLog).values({ ator: actor, acao: 'proposal_workflow_deleted', recurso: `proposta:${input.id}`,
      dadosAntes: previous, dadosDepois: null, criadoEm: now })
    const deleted = await tx.delete(propostaTable).where(and(eq(propostaTable.id, input.id), eq(propostaTable.revision, stored.revision))).returning({ id: propostaTable.id })
    if (deleted.length !== 1) return fail(409, 'REVISION_CONFLICT', 'Não foi possível confirmar a exclusão da proposta.')
    committedDemands = updates
    return { id: input.id, previous, deleted: true as const }
  })
  getClienteDemandaService().publishCommittedRows(committedDemands)
  return result
}
