/**
 * Rotas FARMS - viabilidade agricola por cliente.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { FarmsCreatePayload, FarmsUpdatePayload } from '@aletis/shared-types'
import { getFarmsService } from '../services/farms/FarmsService.js'
import { gerarPdfFarms } from '../services/farms/FarmsPdfGenerator.js'

function safeId(raw: string): string {
  return (raw || '').replace(/[^a-zA-Z0-9_-]/g, '')
}

export default async function (fastify: FastifyInstance) {
  const service = getFarmsService()

  fastify.get('/api/clientes/:clienteId/farms', async (request: FastifyRequest) => {
    const { clienteId } = request.params as { clienteId: string }
    const planos = service.listarPorCliente(safeId(clienteId))
    return { success: true, data: { total: planos.length, planos } }
  })

  fastify.post('/api/clientes/:clienteId/farms', async (request: FastifyRequest, reply: FastifyReply) => {
    const { clienteId } = request.params as { clienteId: string }
    const body = request.body as FarmsCreatePayload | undefined
    if (!body?.cultura) {
      reply.status(400)
      return { success: false, error: 'cultura e obrigatoria: soja, arroz, milho ou trigo' }
    }
    if (!['soja', 'arroz', 'milho', 'trigo'].includes(body.cultura)) {
      reply.status(400)
      return { success: false, error: 'cultura invalida para FARMS v6' }
    }
    const plano = service.criar(safeId(clienteId), body)
    return { success: true, data: plano }
  })

  fastify.get('/api/farms/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const plano = service.buscar(safeId(id))
    if (!plano) {
      reply.status(404)
      return { success: false, error: 'Plano FARMS nao encontrado' }
    }
    return { success: true, data: plano }
  })

  fastify.put('/api/farms/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const body = request.body as FarmsUpdatePayload | undefined
    if (!body) {
      reply.status(400)
      return { success: false, error: 'Body obrigatorio' }
    }
    const plano = service.atualizar(safeId(id), body)
    if (!plano) {
      reply.status(404)
      return { success: false, error: 'Plano FARMS nao encontrado' }
    }
    return { success: true, data: plano }
  })

  fastify.post('/api/farms/:id/recalcular', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const plano = service.recalcular(safeId(id))
    if (!plano) {
      reply.status(404)
      return { success: false, error: 'Plano FARMS nao encontrado' }
    }
    return { success: true, data: plano }
  })

  fastify.post('/api/farms/:id/duplicar', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { safra?: string } | undefined
    const plano = service.duplicar(safeId(id), body?.safra)
    if (!plano) {
      reply.status(404)
      return { success: false, error: 'Plano FARMS nao encontrado' }
    }
    return { success: true, data: plano }
  })

  fastify.delete('/api/farms/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const ok = service.deletar(safeId(id))
    if (!ok) {
      reply.status(404)
      return { success: false, error: 'Plano FARMS nao encontrado' }
    }
    return { success: true, data: { id } }
  })

  fastify.get('/api/farms/:id/pdf', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const plano = service.buscar(safeId(id))
    if (!plano) {
      reply.status(404)
      return { success: false, error: 'Plano FARMS nao encontrado' }
    }
    try {
      const bytes = await gerarPdfFarms(plano)
      const filename = `farms-${safeId(id)}-${plano.cultura}-${plano.safra.replace(/\//g, '-')}.pdf`
      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('Content-Length', bytes.length.toString())
      return reply.send(Buffer.from(bytes))
    } catch (err) {
      reply.status(500)
      return { success: false, error: `Falha ao gerar PDF FARMS: ${(err as Error).message}` }
    }
  })
}
