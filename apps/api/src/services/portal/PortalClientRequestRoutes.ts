import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { portalClientRequestService, PortalClientRequestError } from './PortalClientRequestService.js'
import { assertPortalStaff } from './PortalDocumentRoutes.js'
import { getAccessControlService } from '../core/AccessControlService.js'

const clientId = (request: FastifyRequest) => (request as unknown as { clienteId: string }).clienteId
export async function registerPortalClientRequestRoutes(fastify: FastifyInstance, authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) {
  const auth = { preHandler: authenticate }
  fastify.get('/api/portal/solicitacoes', auth, async request => ({ success: true, data: await portalClientRequestService.list(clientId(request)) }))
  fastify.post('/api/portal/solicitacoes', auth, async (request, reply) => {
    const key = request.headers['idempotency-key']
    if (typeof key !== 'string') throw new PortalClientRequestError('Confirmação do envio ausente. Atualize o formulário e tente novamente.')
    const result = await portalClientRequestService.create(clientId(request),request.body,key)
    return reply.code(result.replayed ? 200 : 201).send({ success: true, data: result.request, replayed: result.replayed })
  })
  fastify.patch('/api/portal/solicitacoes/:requestId/cancelar', auth, async request => {
    const parsed = z.object({ expectedUpdatedAt: z.string().datetime({offset:true}) }).strict().safeParse(request.body)
    if (!parsed.success) throw new PortalClientRequestError('Atualize o pedido antes de cancelar.',428)
    return { success:true,data:await portalClientRequestService.cancel(clientId(request),(request.params as {requestId:string}).requestId,parsed.data.expectedUpdatedAt) }
  })
  fastify.get('/api/clientes/:id/portal/solicitacoes', async request => {
    const { client } = await assertPortalStaff(fastify,request,(request.params as {id:string}).id)
    return { success: true, data: await portalClientRequestService.list(client.id) }
  })
  fastify.patch('/api/clientes/:id/portal/solicitacoes/:requestId', async request => {
    const { id,requestId } = request.params as {id:string;requestId:string}
    const { client,user } = await assertPortalStaff(fastify,request,id,true)
    if (request.body && typeof request.body === 'object' && 'aplicarAlteracoes' in request.body && request.body.aplicarAlteracoes === true) {
      await getAccessControlService().assertClienteAccess({ actor:{ id:user.id,nome:user.nome,role:'consultor',consultorId:user.consultorId },clienteId:client.id,action:'write' })
    }
    return { success:true,data:await portalClientRequestService.review(client.id,requestId,request.body,user.id) }
  })
}
