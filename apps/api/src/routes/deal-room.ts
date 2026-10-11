// ============================================================
// /api/deal-room — REST do Deal Room Multi-Credor
// ============================================================
import type { FastifyInstance } from 'fastify'
import { getDealRoomService, type NegociacaoStatus } from '../services/dealRoom/DealRoomService.js'
import { resolveInternalSession } from '../lib/internal-auth.js'

const createRequests = new Map<string, { id: string; createdAt: number }>()

interface CreateBody {
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
  propostaId?: string
}

export default async function dealRoomRoutes(fastify: FastifyInstance): Promise<void> {
  // Listar tudo (com filtros)
  fastify.get<{ Querystring: { clienteId?: string; status?: NegociacaoStatus } }>(
    '/api/deal-room/negociacoes',
    async (req, reply) => {
      const list = await getDealRoomService().list({
        clienteId: req.query.clienteId,
        status: req.query.status,
      })
      return reply.send({ success: true, data: list, total: list.length })
    },
  )

  fastify.get('/api/deal-room/resumo', async (_req, reply) => {
    const list = await getDealRoomService().list()
    const porStatus: Record<string, number> = {}
    let valorEmNegociacao = 0
    let economiaProjetada = 0
    let proximoDeadline: { credor: string; data: string } | null = null
    for (const n of list) {
      porStatus[n.status] = (porStatus[n.status] ?? 0) + 1
      if (['negociando', 'contraproposta', 'aguardando_doc'].includes(n.status)) {
        valorEmNegociacao += Number(n.valorAtual ?? 0)
        economiaProjetada += Math.max(0, Number(n.valorAtual ?? 0) - Number(n.valorProposto ?? 0))
        if (n.proximaData && (!proximoDeadline || n.proximaData < new Date(proximoDeadline.data))) proximoDeadline = { credor: n.credor, data: n.proximaData.toISOString() }
      }
    }
    return reply.send({ success: true, data: { total: list.length, porStatus, valorEmNegociacao: valorEmNegociacao.toFixed(2), economiaProjetada: economiaProjetada.toFixed(2), proximoDeadline } })
  })

  // Listar por cliente
  fastify.get<{ Params: { clienteId: string } }>(
    '/api/deal-room/cliente/:clienteId',
    async (req, reply) => {
      const list = await getDealRoomService().listByCliente(req.params.clienteId)
      const resumo = await getDealRoomService().resumoCliente(req.params.clienteId)
      return reply.send({ success: true, data: { negociacoes: list, resumo } })
    },
  )

  // Wave OS — Deal Room enriquecido com propostas globais (evita duplicação)
  fastify.get<{ Params: { clienteId: string } }>(
    '/api/deal-room/cliente/:clienteId/with-propostas',
    async (req, reply) => {
      const data = await getDealRoomService().listByClienteWithPropostas(req.params.clienteId)
      const resumo = await getDealRoomService().resumoCliente(req.params.clienteId)
      return reply.send({ success: true, data: { ...data, resumo } })
    },
  )

  // Detalhe de uma negociação
  fastify.get<{ Params: { id: string } }>('/api/deal-room/negociacoes/:id', async (req, reply) => {
    const n = await getDealRoomService().get(req.params.id)
    if (!n) return reply.status(404).send({ success: false, error: 'Negociação não encontrada' })
    return reply.send({ success: true, data: n })
  })

  fastify.post('/api/deal-room/backfill-propostas', async (req, reply) => {
    const actor = resolveInternalSession(fastify, req)
    const { reconcilePropostasComNegociacoes } = await import('./propostas.js')
    const result = await reconcilePropostasComNegociacoes()
    return reply.send({ success: true, data: result, ator: actor?.id ?? 'sistema' })
  })

  // Criar
  fastify.post<{ Body: CreateBody }>('/api/deal-room/negociacoes', async (req, reply) => {
    try {
      const b = req.body
      if (!b?.clienteId || !b?.credor) {
        return reply.status(400).send({ success: false, error: 'clienteId e credor são obrigatórios' })
      }
      const actor = resolveInternalSession(fastify, req)
      const idempotencyKey = String(req.headers['idempotency-key'] ?? '').trim()
      if (idempotencyKey) {
        const prior = createRequests.get(idempotencyKey)
        if (prior && Date.now() - prior.createdAt < 10 * 60_000) {
          const existing = await getDealRoomService().get(prior.id)
          if (existing) return reply.status(200).send({ success: true, data: existing, idempotent: true })
        }
      }
      const n = await getDealRoomService().create({ ...b, usuarioId: actor?.id, usuarioNome: actor?.nome })
      if (idempotencyKey) createRequests.set(idempotencyKey, { id: n.id, createdAt: Date.now() })
      return reply.status(201).send({ success: true, data: n })
    } catch (err) {
      return reply.status(400).send({ success: false, error: (err as Error).message })
    }
  })

  // Atualizar
  fastify.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/api/deal-room/negociacoes/:id',
    async (req, reply) => {
      try {
        const actor = resolveInternalSession(fastify, req)
        const updated = await getDealRoomService().update(req.params.id, { ...(req.body || {}), usuarioId: actor?.id, usuarioNome: actor?.nome })
        if (!updated) return reply.status(404).send({ success: false, error: 'Negociação não encontrada' })
        return reply.send({ success: true, data: updated })
      } catch (err) {
        return reply.status(400).send({ success: false, error: (err as Error).message })
      }
    },
  )

  // Adicionar nota ao histórico
  fastify.post<{ Params: { id: string }; Body: { texto: string; tipo?: string } }>(
    '/api/deal-room/negociacoes/:id/nota',
    async (req, reply) => {
      try {
        const texto = String(req.body?.texto ?? '').trim()
        if (!texto) return reply.status(400).send({ success: false, error: 'texto obrigatório' })
        const updated = await getDealRoomService().update(req.params.id, {
          appendHistorico: {
            ts: new Date().toISOString(),
            tipo: req.body?.tipo === 'reuniao' || req.body?.tipo === 'contraproposta' ? req.body.tipo : 'nota',
            texto: texto.slice(0, 2000),
            usuarioId: resolveInternalSession(fastify, req)?.id,
            usuarioNome: resolveInternalSession(fastify, req)?.nome,
          },
        })
        if (!updated) return reply.status(404).send({ success: false, error: 'Negociação não encontrada' })
        return reply.send({ success: true, data: updated })
      } catch (err) {
        return reply.status(400).send({ success: false, error: (err as Error).message })
      }
    },
  )

  // Deletar
  fastify.delete<{ Params: { id: string } }>(
    '/api/deal-room/negociacoes/:id',
    async (req, reply) => {
      const ok = await getDealRoomService().delete(req.params.id)
      if (!ok) return reply.status(404).send({ success: false, error: 'Negociação não encontrada' })
      return reply.send({ success: true })
    },
  )

}
