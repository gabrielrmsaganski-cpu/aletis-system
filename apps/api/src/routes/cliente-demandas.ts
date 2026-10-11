import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { getProposta as pgGetProposta, listPropostas as pgListPropostas } from '../db/PropostaRepository.js'
import { isPgEnabled } from '../db/client.js'
import { resolveInternalSession } from '../lib/internal-auth.js'
import { updateProposalWorkflow } from '../services/propostas/ProposalWorkflowService.js'
import { auditAsync } from '../db/AuditLog.js'
import { clientes } from './clientes.js'
import { propostas } from './propostas.js'
import {
  getClienteDemandaService,
  type ClienteDemandaRecord,
  type DemandProposalLike,
} from '../services/cliente/ClienteDemandaService.js'

const ACTIVE = new Set(['nova', 'em_analise', 'em_proposta', 'negociacao', 'aprovada'])
async function listClientProposals(clienteId: string): Promise<DemandProposalLike[]> {
  const rows = isPgEnabled() ? await pgListPropostas() : [...propostas.values()]
  return rows.filter(proposal => proposal.clienteId === clienteId) as DemandProposalLike[]
}
const demandStatus = z.enum(['nova', 'em_analise', 'em_proposta', 'negociacao', 'aprovada', 'concluida', 'suspensa', 'cancelada'])
const demandPriority = z.enum(['baixa', 'normal', 'alta', 'urgente'])
const demandCategory = z.enum(['credito', 'renegociacao', 'juridico', 'tributario', 'investimento', 'operacional', 'outro'])
const eventType = z.enum(['nota', 'contato', 'proposta', 'documento', 'status', 'tarefa', 'sistema'])
const isoDate = z.string().trim().refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Use uma data no formato YYYY-MM-DD.')
const checklistInputSchema = z.object({
  titulo: z.string().trim().min(1).max(180),
  responsavel: z.string().trim().max(140).optional(),
  prazo: isoDate.optional(),
})
const demandInputSchema = z.object({
  titulo: z.string().trim().min(1).max(180),
  assunto: z.string().trim().max(80).optional(),
  descricao: z.string().trim().max(2000).optional(),
  categoria: demandCategory.optional(),
  status: demandStatus.optional(),
  prioridade: demandPriority.optional(),
  responsavel: z.string().trim().max(140).optional(),
  credor: z.string().trim().max(160).optional(),
  valorPretendido: z.string().trim().max(80).refine((value) => value === '' || (/\d/.test(value) && !value.startsWith('-')), 'Informe um valor monetário não negativo.').optional(),
  prazoAlvo: isoDate.optional(),
  proximaAcao: z.string().trim().max(240).optional(),
  proximaAcaoEm: isoDate.optional(),
  probabilidade: z.number().int().min(0).max(100).optional(),
  resultadoEsperado: z.string().trim().max(1000).optional(),
  origem: z.enum(['manual', 'proposta_existente', 'cadastro_ia', 'gestao_financeira']).optional(),
  propostaIds: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
  documentoIds: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
  checklist: z.array(checklistInputSchema).max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
const demandPatchSchema = demandInputSchema
  .omit({ origem: true, propostaIds: true, checklist: true, metadata: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para atualizar.')
const eventInputSchema = z.object({
  tipo: eventType.default('nota'),
  titulo: z.string().trim().min(1).max(180),
  descricao: z.string().trim().max(2000).optional(),
  autor: z.string().trim().max(140).optional(),
})
const checklistPatchSchema = checklistInputSchema.partial().extend({
  concluido: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para atualizar.')
const primaryProposalSchema = z.object({
  propostaId: z.string().trim().min(1).max(120).nullable(),
})

function validationError(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
}

function proposalSummary(
  proposal: DemandProposalLike,
  principal = false,
  previous?: DemandProposalLike,
) {
  const debt = cents(proposal.valorDivida)
  const offer = cents(proposal.valorProposta)
  const saving = debt > offer ? debt - offer : 0n
  const previousOffer = previous ? cents(previous.valorProposta) : null
  return {
    id: proposal.id,
    demandaId: proposal.demandaId,
    demandaTitulo: proposal.demandaTitulo,
    versaoDemanda: proposal.versaoDemanda,
    titulo: proposal.titulo,
    credor: proposal.credor,
    tipo: proposal.tipo,
    status: proposal.status,
    valorDivida: decimal(debt),
    valorProposta: decimal(offer),
    dataCriacao: proposal.dataCriacao,
    ultimaAtualizacao: proposal.ultimaAtualizacao,
    principal,
    economiaPotencial: decimal(saving),
    descontoPercentual: percentage(saving, debt),
    variacaoVersaoAnterior: previousOffer === null ? undefined : signedDecimal(previousOffer - offer),
  }
}

function withProposals(demand: ClienteDemandaRecord, proposalList: DemandProposalLike[]) {
  const linked = proposalList
    .filter((proposal) => demand.propostaIds.includes(proposal.id) || proposal.demandaId === demand.id)
    .sort((a, b) => (a.versaoDemanda || demand.propostaIds.indexOf(a.id) + 1) - (b.versaoDemanda || demand.propostaIds.indexOf(b.id) + 1))
  const checklistConcluidos = demand.checklist.filter((item) => item.concluido).length
  const today = new Date().toISOString().slice(0, 10)
  const ativa = ACTIVE.has(demand.status)
  const propostaPrincipalId = demand.propostaPrincipalId && linked.some((proposal) => proposal.id === demand.propostaPrincipalId)
    ? demand.propostaPrincipalId
    : undefined
  return {
    ...demand,
    codigo: `DEM-${String(demand.numero).padStart(3, '0')}`,
    atrasada: ativa && Boolean(demand.prazoAlvo && demand.prazoAlvo < today),
    proximaAcaoAtrasada: ativa && Boolean(demand.proximaAcaoEm && demand.proximaAcaoEm < today),
    checklistResumo: {
      total: demand.checklist.length,
      concluidos: checklistConcluidos,
      pendentes: demand.checklist.length - checklistConcluidos,
      percentual: demand.checklist.length > 0 ? Math.round((checklistConcluidos / demand.checklist.length) * 100) : 0,
    },
    ultimaAtividade: [...demand.eventos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))[0],
    totalPropostas: linked.length,
    propostasAtivas: linked.filter((proposal) => ['rascunho', 'em_analise', 'enviada'].includes(String(proposal.status))).length,
    propostas: linked.map((proposal, index) => proposalSummary(proposal, proposal.id === propostaPrincipalId, linked[index - 1])),
  }
}

function cents(value: unknown): bigint {
  const raw = String(value ?? '').trim().replace(/[^\d,.-]/g, '')
  if (!raw) return 0n
  const separator = Math.max(raw.lastIndexOf(','), raw.lastIndexOf('.'))
  const decimal = separator >= 0 && raw.length - separator - 1 <= 2
  const integer = (decimal ? raw.slice(0, separator) : raw).replace(/\D/g, '') || '0'
  const fraction = `${decimal ? raw.slice(separator + 1).replace(/\D/g, '') : ''}00`.slice(0, 2)
  return BigInt(integer) * 100n + BigInt(fraction)
}

function decimal(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`
}

function signedDecimal(value: bigint): string {
  const negative = value < 0n
  const absolute = negative ? -value : value
  return `${negative ? '-' : ''}${decimal(absolute)}`
}

function percentage(value: bigint, base: bigint): string {
  if (base <= 0n) return '0.00'
  const hundredths = value * 10000n / base
  return `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, '0')}`
}

export default async function clienteDemandasRoutes(fastify: FastifyInstance): Promise<void> {
  const service = getClienteDemandaService()

  fastify.post('/api/clientes/:id/demandas/reconciliar', async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string }
    if (!clientes.get(id)) return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
    const proposalList = await listClientProposals(id)
    const demands = await service.organizeProposals(id, proposalList)
    for (const proposal of proposalList) {
      const current = propostas.get(proposal.id)
      const persisted = proposal as unknown as Parameters<typeof propostas.set>[1]
      if ((persisted.revision || 0) >= (current?.revision || 0)) propostas.set(proposal.id, persisted)
    }
    return { success: true, data: demands.map(demand => withProposals(demand, proposalList)) }
  })

  fastify.get('/api/clientes/:id/demandas', async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string }
    if (!clientes.get(id)) return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
    const proposalList = await listClientProposals(id)
    const demands = await service.list(id)
    const data = demands.map((demand) => withProposals(demand, proposalList))
    const totalPretendido = data.reduce((sum, demand) => sum + cents(demand.valorPretendido), 0n)
    const today = new Date().toISOString().slice(0, 10)
    return {
      success: true,
      data,
      resumo: {
        total: data.length,
        ativas: data.filter((demand) => ACTIVE.has(demand.status)).length,
        atrasadas: data.filter((demand) => demand.atrasada || demand.proximaAcaoAtrasada).length,
        urgentes: data.filter((demand) => demand.prioridade === 'urgente').length,
        semResponsavel: data.filter((demand) => ACTIVE.has(demand.status) && !demand.responsavel).length,
        proximasAcoesHoje: data.filter((demand) => ACTIVE.has(demand.status) && demand.proximaAcaoEm === today).length,
        checklistPendentes: data.reduce((total, demand) => total + demand.checklistResumo.pendentes, 0),
        totalPropostas: proposalList.length,
        propostasSemDemanda: proposalList.filter(proposal => !demands.some(demand => demand.propostaIds.includes(proposal.id))).length,
        valorPretendido: decimal(totalPretendido),
      },
    }
  })

  fastify.post('/api/clientes/:id/demandas/:demandaId/eventos', async (request: FastifyRequest, reply) => {
    const { id, demandaId } = request.params as { id: string; demandaId: string }
    if (!clientes.get(id)) return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
    const parsed = eventInputSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Atividade inválida.', detalhes: validationError(parsed.error) })
    try {
      const demand = await service.addEvent(id, demandaId, parsed.data)
      if (!demand) return reply.status(404).send({ success: false, error: 'Demanda não encontrada' })
      const proposalList = await listClientProposals(id)
      auditAsync({ ator: parsed.data.autor || 'crm-consultor', acao: 'registrar_atividade', recurso: `cliente_demanda:${demandaId}`, dadosDepois: parsed.data })
      return reply.status(201).send({ success: true, data: withProposals(demand, proposalList) })
    } catch (error) {
      return reply.status(400).send({ success: false, error: (error as Error).message })
    }
  })

  fastify.post('/api/clientes/:id/demandas/:demandaId/checklist', async (request: FastifyRequest, reply) => {
    const { id, demandaId } = request.params as { id: string; demandaId: string }
    if (!clientes.get(id)) return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
    const parsed = checklistInputSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Item de checklist inválido.', detalhes: validationError(parsed.error) })
    try {
      const demand = await service.addChecklistItem(id, demandaId, parsed.data)
      if (!demand) return reply.status(404).send({ success: false, error: 'Demanda não encontrada' })
      auditAsync({ ator: 'crm-consultor', acao: 'checklist_add', recurso: `cliente_demanda:${demandaId}`, dadosDepois: parsed.data })
      return reply.status(201).send({ success: true, data: withProposals(demand, []) })
    } catch (error) {
      return reply.status(400).send({ success: false, error: (error as Error).message })
    }
  })

  fastify.patch('/api/clientes/:id/demandas/:demandaId/checklist/:itemId', async (request: FastifyRequest, reply) => {
    const { id, demandaId, itemId } = request.params as { id: string; demandaId: string; itemId: string }
    const parsed = checklistPatchSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Atualização do checklist inválida.', detalhes: validationError(parsed.error) })
    const demand = await service.updateChecklistItem(id, demandaId, itemId, parsed.data)
    if (!demand) return reply.status(404).send({ success: false, error: 'Demanda ou item não encontrado' })
    auditAsync({ ator: 'crm-consultor', acao: 'checklist_update', recurso: `cliente_demanda:${demandaId}`, dadosDepois: { itemId, ...parsed.data } })
    return { success: true, data: withProposals(demand, []) }
  })

  fastify.delete('/api/clientes/:id/demandas/:demandaId/checklist/:itemId', async (request: FastifyRequest, reply) => {
    const { id, demandaId, itemId } = request.params as { id: string; demandaId: string; itemId: string }
    const demand = await service.removeChecklistItem(id, demandaId, itemId)
    if (!demand) return reply.status(404).send({ success: false, error: 'Demanda ou item não encontrado' })
    auditAsync({ ator: 'crm-consultor', acao: 'checklist_delete', recurso: `cliente_demanda:${demandaId}`, dadosAntes: { itemId } })
    return { success: true, data: withProposals(demand, []) }
  })

  fastify.post('/api/clientes/:id/demandas/:demandaId/proposta-principal', async (request: FastifyRequest, reply) => {
    const { id, demandaId } = request.params as { id: string; demandaId: string }
    const parsed = primaryProposalSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Proposta principal inválida.', detalhes: validationError(parsed.error) })
    try {
      const demand = await service.setPrimaryProposal(id, demandaId, parsed.data.propostaId || undefined)
      if (!demand) return reply.status(404).send({ success: false, error: 'Demanda não encontrada' })
      const proposalList = await listClientProposals(id)
      auditAsync({ ator: 'crm-consultor', acao: 'proposta_principal', recurso: `cliente_demanda:${demandaId}`, dadosDepois: parsed.data })
      return { success: true, data: withProposals(demand, proposalList) }
    } catch (error) {
      return reply.status(400).send({ success: false, error: (error as Error).message })
    }
  })

  fastify.post('/api/clientes/:id/demandas', async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string }
    if (!clientes.get(id)) return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
    const parsed = demandInputSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Dados da demanda inválidos.', detalhes: validationError(parsed.error) })
    try {
      const demand = await service.create(id, parsed.data)
      auditAsync({ ator: 'crm-consultor', acao: 'create', recurso: `cliente_demanda:${demand.id}`, dadosDepois: demand })
      return reply.status(201).send({ success: true, data: withProposals(demand, []) })
    } catch (error) {
      return reply.status(400).send({ success: false, error: (error as Error).message })
    }
  })

  fastify.patch('/api/clientes/:id/demandas/:demandaId', async (request: FastifyRequest, reply) => {
    const { id, demandaId } = request.params as { id: string; demandaId: string }
    if (!clientes.get(id)) return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
    const parsed = demandPatchSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Dados da demanda inválidos.', detalhes: validationError(parsed.error) })
    const before = await service.get(id, demandaId)
    const demand = await service.update(id, demandaId, parsed.data)
    if (!demand) return reply.status(404).send({ success: false, error: 'Demanda não encontrada' })
    const proposalList = await listClientProposals(id)
    const projected = proposalList.map(proposal => proposal.demandaId === demand.id ? { ...proposal, demandaTitulo: demand.titulo } : proposal)
    auditAsync({ ator: 'crm-consultor', acao: 'update', recurso: `cliente_demanda:${demand.id}`, dadosAntes: before, dadosDepois: demand })
    return { success: true, data: withProposals(demand, projected) }
  })

  fastify.post('/api/clientes/:id/demandas/:demandaId/propostas/:propostaId', async (request: FastifyRequest, reply) => {
    const { id, demandaId, propostaId } = request.params as { id: string; demandaId: string; propostaId: string }
    if (!clientes.get(id)) return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
    if (isPgEnabled()) {
      const stored = await pgGetProposta(propostaId)
      if (!stored || stored.clienteId !== id) return reply.status(404).send({ success: false, error: 'Proposta não encontrada para este cliente' })
      const user = resolveInternalSession(fastify, request)
      const result = await updateProposalWorkflow({ id: propostaId, patch: { demandaId }, expectedRevision: stored.revision as number,
        actor: user ? { id: user.id, nome: user.nome } : { nome: 'sistema' },
      })
      propostas.set(propostaId, result.proposta as unknown as Parameters<typeof propostas.set>[1])
      return { success: true, data: { demanda: withProposals(result.demanda!, [result.proposta]), proposta: { ...proposalSummary(result.proposta), revision: result.proposta.revision } } }
    }
    const proposal = propostas.get(propostaId) as DemandProposalLike | undefined
    if (!proposal || proposal.clienteId !== id) return reply.status(404).send({ success: false, error: 'Proposta não encontrada para este cliente' })
    const previousDemandId = proposal.demandaId
    const demand = await service.linkProposal(id, demandaId, propostaId)
    if (!demand) return reply.status(404).send({ success: false, error: 'Demanda não encontrada' })
    proposal.demandaId = demand.id
    proposal.demandaTitulo = demand.titulo
    proposal.versaoDemanda = Math.max(1, demand.propostaIds.indexOf(propostaId) + 1)
    auditAsync({ ator: 'crm-consultor', acao: 'link_proposta', recurso: `cliente_demanda:${demand.id}`, dadosAntes: { propostaId, demandaId: previousDemandId }, dadosDepois: { propostaId, demandaId: demand.id } })
    return { success: true, data: { demanda: withProposals(demand, [proposal]), proposta: proposalSummary(proposal) } }
  })

  fastify.delete('/api/clientes/:id/demandas/:demandaId', async (request: FastifyRequest, reply) => {
    const { id, demandaId } = request.params as { id: string; demandaId: string }
    if (!clientes.get(id)) return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
    const before = await service.get(id, demandaId)
    const removed = await service.remove(id, demandaId)
    if (!removed) {
      return reply.status(409).send({ success: false, error: 'Demanda não encontrada ou ainda possui propostas vinculadas.' })
    }
    auditAsync({ ator: 'crm-consultor', acao: 'delete', recurso: `cliente_demanda:${demandaId}`, dadosAntes: before })
    return { success: true, data: { id: demandaId, deleted: true } }
  })
}
