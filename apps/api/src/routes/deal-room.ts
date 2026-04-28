// ============================================================
// /api/deal-room — REST do Deal Room Multi-Credor
// ============================================================
import type { FastifyInstance } from 'fastify'
import { getDealRoomService, type NegociacaoStatus } from '../services/dealRoom/DealRoomService.js'

interface CreateBody {
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

  // Listar por cliente
  fastify.get<{ Params: { clienteId: string } }>(
    '/api/deal-room/cliente/:clienteId',
    async (req, reply) => {
      const list = await getDealRoomService().listByCliente(req.params.clienteId)
      const resumo = await getDealRoomService().resumoCliente(req.params.clienteId)
      return reply.send({ success: true, data: { negociacoes: list, resumo } })
    },
  )

  // Detalhe de uma negociação
  fastify.get<{ Params: { id: string } }>('/api/deal-room/negociacoes/:id', async (req, reply) => {
    const n = await getDealRoomService().get(req.params.id)
    if (!n) return reply.status(404).send({ success: false, error: 'Negociação não encontrada' })
    return reply.send({ success: true, data: n })
  })

  // Criar
  fastify.post<{ Body: CreateBody }>('/api/deal-room/negociacoes', async (req, reply) => {
    try {
      const b = req.body
      if (!b?.clienteId || !b?.credor) {
        return reply.status(400).send({ success: false, error: 'clienteId e credor são obrigatórios' })
      }
      const n = await getDealRoomService().create(b)
      return reply.status(201).send({ success: true, data: n })
    } catch (err) {
      return reply.status(400).send({ success: false, error: (err as Error).message })
    }
  })

  // Atualizar
  fastify.patch<{ Params: { id: string }; Body: any }>(
    '/api/deal-room/negociacoes/:id',
    async (req, reply) => {
      try {
        const updated = await getDealRoomService().update(req.params.id, req.body || {})
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
            tipo: (req.body?.tipo as any) ?? 'nota',
            texto: texto.slice(0, 2000),
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

  console.log('[DealRoom] Rotas registradas: GET/POST/PATCH/DELETE /api/deal-room/negociacoes, GET /api/deal-room/cliente/:id')
}
