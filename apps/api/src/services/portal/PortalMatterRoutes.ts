import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { portalMatterService, PortalMatterError } from './PortalMatterService.js'
import { portalMatterIdSchema } from './PortalMatterTypes.js'
import { assertPortalStaff } from './PortalDocumentRoutes.js'
import { getAccessControlService } from '../core/AccessControlService.js'

const authenticatedClient = (request: FastifyRequest) => (request as unknown as { clienteId: string }).clienteId
const historyQuery = z.object({ cursor: z.string().min(1).max(600).optional(), assuntoId: portalMatterIdSchema.optional() }).strict()
const versionQuery = z.object({ cursor: z.string().regex(/^\d+$/).max(10).optional() }).strict()
function query<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new PortalMatterError('Os filtros do histórico são inválidos.')
  return result.data
}

export async function registerPortalMatterRoutes(fastify: FastifyInstance, authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) {
  const auth = { preHandler: authenticate }
  const noStore = (reply: FastifyReply) => reply.header('Cache-Control', 'private, no-store')
  const writeAccess = async (request: FastifyRequest, id: string) => {
    const result = await assertPortalStaff(fastify, request, id, true)
    await getAccessControlService().assertClienteAccess({
      actor: { id: result.user.id, nome: result.user.nome, role: 'consultor', consultorId: result.user.consultorId },
      clienteId: result.client.id, action: 'write',
    })
    return result
  }
  fastify.get('/api/portal/assuntos', auth, async (request, reply) => {
    noStore(reply)
    return { success: true, data: await portalMatterService.listPublic(authenticatedClient(request)) }
  })
  fastify.get('/api/portal/assuntos/historico', auth, async (request, reply) => {
    noStore(reply)
    const filters = query(historyQuery, request.query)
    return { success: true, data: await portalMatterService.history(authenticatedClient(request), filters.cursor, filters.assuntoId) }
  })
  fastify.get('/api/clientes/:id/portal/assuntos', async (request, reply) => {
    const { client } = await assertPortalStaff(fastify, request, (request.params as { id: string }).id)
    noStore(reply)
    return { success: true, data: await portalMatterService.listStaff(client.id) }
  })
  fastify.get('/api/clientes/:id/portal/assuntos/historico', async (request, reply) => {
    const { client } = await assertPortalStaff(fastify, request, (request.params as { id: string }).id)
    noStore(reply)
    const filters = query(historyQuery, request.query)
    return { success: true, data: await portalMatterService.history(client.id, filters.cursor, filters.assuntoId) }
  })
  fastify.get('/api/clientes/:id/portal/assuntos/:matterId/versoes', async (request, reply) => {
    const { id, matterId } = request.params as { id: string; matterId: string }
    const { client } = await assertPortalStaff(fastify, request, id)
    const filters = query(versionQuery, request.query)
    noStore(reply)
    return { success: true, data: await portalMatterService.versions(client.id, matterId, filters.cursor) }
  })
  fastify.post('/api/clientes/:id/portal/assuntos', { bodyLimit: 512 * 1024 }, async (request, reply) => {
    const { client, user } = await writeAccess(request, (request.params as { id: string }).id)
    const key = request.headers['idempotency-key']
    if (typeof key !== 'string') throw new PortalMatterError('Confirmação do cadastro ausente. Atualize o formulário e tente novamente.')
    const result = await portalMatterService.create(client.id, request.body, key, user.id)
    noStore(reply)
    return reply.code(result.replayed ? 200 : 201).send({ success: true, data: result.assunto, replayed: result.replayed })
  })
  fastify.patch('/api/clientes/:id/portal/assuntos/:matterId', { bodyLimit: 512 * 1024 }, async (request, reply) => {
    const { id, matterId } = request.params as { id: string; matterId: string }
    const { client, user } = await writeAccess(request, id)
    noStore(reply)
    return { success: true, data: await portalMatterService.update(client.id, matterId, request.body, user.id) }
  })
}
