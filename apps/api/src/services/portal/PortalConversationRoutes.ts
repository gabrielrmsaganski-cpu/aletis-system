import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { clientes } from '../../routes/clientes.js'
import { assertPortalStaff } from './PortalDocumentRoutes.js'
import { portalCommunicationService, type PortalCommunicationService } from './PortalCommunicationService.js'
import { PortalConversationError, portalMessageKeySchema, portalReadMessagesSchema, type PortalConversationMessage } from './PortalConversationTypes.js'

const querySchema = z.object({ before: z.string().datetime().optional(), beforeId: z.string().min(1).max(180).optional() })
  .refine(value => Boolean(value.before) === Boolean(value.beforeId))
function before(request: FastifyRequest) {
  const parsed = querySchema.safeParse(request.query || {})
  if (!parsed.success) throw new PortalConversationError('Página da conversa inválida.')
  return parsed.data.before ? { criadoEm: parsed.data.before, id: parsed.data.beforeId! } : undefined
}
function key(request: FastifyRequest): string | undefined {
  if (request.headers['idempotency-key'] === undefined) return undefined
  const parsed = portalMessageKeySchema.safeParse(request.headers['idempotency-key'])
  if (!parsed.success) throw new PortalConversationError('Chave deste envio inválida.')
  return parsed.data
}
function readIds(request: FastifyRequest): string[] {
  const parsed = portalReadMessagesSchema.safeParse(request.body)
  if (!parsed.success) throw new PortalConversationError('Informe somente as mensagens visualizadas (até 200 IDs).')
  return parsed.data.ids
}
export async function registerPortalConversationRoutes(fastify: FastifyInstance,
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>, options: {
    service?: PortalCommunicationService
    staffGuard?: typeof assertPortalStaff
    clientName?: (clienteId: string) => string | undefined
    afterStaffMessage?: (input: { clienteId: string; message: PortalConversationMessage }) => Promise<unknown>
  } = {}) {
  const service = options.service || portalCommunicationService
  const staff = options.staffGuard || assertPortalStaff
  const portalId = (request: FastifyRequest) => (request as FastifyRequest & { clienteId: string }).clienteId
  const clientOptions = { preHandler: authenticate }
  fastify.get('/api/portal/mensagens', clientOptions, async request => ({ success: true, data: await service.list(portalId(request), before(request)) }))
  fastify.post('/api/portal/mensagens', clientOptions, async (request, reply) => {
    const clienteId = portalId(request)
    const name = options.clientName ? options.clientName(clienteId) : clientes.get(clienteId)?.nome
    if (!name) throw new PortalConversationError('Cliente não encontrado.', 404)
    const saved = await service.add(clienteId, request.body, { de: 'cliente', actorId: `portal:${clienteId}`, autorNome: name }, key(request))
    return reply.code(saved.replayed ? 200 : 201).send({ success: true, data: saved })
  })
  fastify.post('/api/portal/mensagens/marcar-lidas', clientOptions, async request => ({ success: true,
    data: await service.markRead(portalId(request), 'consultor', readIds(request), `portal:${portalId(request)}`) }))
  fastify.get('/api/clientes/:id/portal-mensagens', async request => {
    const { client } = await staff(fastify, request, (request.params as { id: string }).id)
    return { success: true, data: await service.list(client.id, before(request)) }
  })
  fastify.post('/api/clientes/:id/portal-mensagens', async (request, reply) => {
    const { client, user } = await staff(fastify, request, (request.params as { id: string }).id, true)
    const saved = await service.add(client.id, request.body, { de: 'consultor', actorId: user.id, autorNome: user.nome }, key(request))
    if (!saved.replayed && options.afterStaffMessage) {
      await options.afterStaffMessage({ clienteId: client.id, message: saved }).catch(() => request.log.warn({ code: 'PORTAL_MESSAGE_NOTIFICATION_FAILED' }, 'Mensagem salva; notificação não concluída.'))
    }
    return reply.code(saved.replayed ? 200 : 201).send({ success: true, data: saved })
  })
  const markStaff = async (request: FastifyRequest) => {
    const { client, user } = await staff(fastify, request, (request.params as { id: string }).id, true)
    return { success: true, data: await service.markRead(client.id, 'cliente', readIds(request), user.id) }
  }
  fastify.patch('/api/clientes/:id/portal-mensagens/marcar-lidas', markStaff)
  fastify.post('/api/clientes/:id/portal-mensagens/marcar-lidas', markStaff)
}
