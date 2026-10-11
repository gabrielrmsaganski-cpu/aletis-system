import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as alix from '../PortalAlixService.js'

const id = z.string().trim().min(8).max(100).regex(/^[A-Za-z0-9_.:-]+$/)
const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).optional(), cursor: z.string().max(1000).optional() }).strict()
const historyQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).optional(), beforeOrdinal: z.coerce.number().int().positive().max(2147483647).optional() }).strict()
const createBody = z.object({ titulo: z.string().trim().min(1).max(160).optional(), requestId: id.optional() }).strict()
const chatBody = z.object({ sessionId: id, requestId: id, message: z.string().trim().min(1).max(4000) }).strict()
const clienteId = (request: FastifyRequest) => (request as FastifyRequest & { clienteId: string }).clienteId
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new alix.PortalAlixError('Confira os dados da conversa e tente novamente.', 400, 'PORTAL_ALIX_INVALID')
  return result.data
}

export async function registerPortalAlixRoutes(fastify: FastifyInstance,
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>,
  options: { rateLimit?: (clienteId: string) => boolean } = {}) {
  const auth = { preHandler: authenticate }
  fastify.get('/api/portal/alix/sessions', auth, async request => ({ success: true,
    data: await alix.listarSessoesPortal(clienteId(request), parse(listQuery, request.query || {})) }))
  fastify.post('/api/portal/alix/sessions', auth, async (request, reply) => {
    const body = parse(createBody, request.body || {})
    const session = await alix.criarSessaoPortal(clienteId(request), body.titulo, { requestId: body.requestId })
    return reply.code(201).send({ success: true, data: session })
  })
  fastify.get('/api/portal/alix/sessions/:id', auth, async (request, reply) => {
    const session = await alix.obterSessaoPortal(parse(id, (request.params as { id: string }).id), clienteId(request), parse(historyQuery, request.query || {}))
    if (!session) return reply.code(404).send({ success: false, error: 'Conversa não encontrada.', code: 'PORTAL_ALIX_NOT_FOUND' })
    return { success: true, data: session }
  })
  fastify.delete('/api/portal/alix/sessions/:id', auth, async (request, reply) => {
    const removed = await alix.deletarSessaoPortal(parse(id, (request.params as { id: string }).id), clienteId(request))
    if (!removed) return reply.code(404).send({ success: false, error: 'Conversa não encontrada.', code: 'PORTAL_ALIX_NOT_FOUND' })
    return { success: true }
  })
  fastify.post('/api/portal/alix/stream', auth, async (request, reply) => {
    const body = parse(chatBody, request.body)
    const owner = clienteId(request)
    if (options.rateLimit && !options.rateLimit(owner)) return reply.code(429).send({ success: false, error: 'Muitas perguntas. Aguarde um minuto.', code: 'PORTAL_ALIX_RATE_LIMIT' })
    reply.hijack()
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    const send = (event: string, data: unknown) => {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }
    const heartbeat = setInterval(() => send('ping', { ts: Date.now() }), 10_000)
    const close = () => clearInterval(heartbeat)
    reply.raw.once('close', close)
    try {
      const result = await alix.chatPortalAlix({ ...body, clienteId: owner,
        onStart: value => { send('start', value); send('thinking', { text: 'Consultando as informações publicadas do seu atendimento…' }) },
        onToken: text => send('token', { text }),
      })
      send('done', { reply: result.reply, sessionId: result.session.id, titulo: result.session.titulo, turn: result.turn, replayed: result.replayed })
    } catch (error) {
      request.log.error({ err: error, clienteId: owner }, '[Portal/ALIX] Resposta não concluída')
      const known = error instanceof alix.PortalAlixError
      send('error', { error: known ? error.message : 'A ALIX não conseguiu concluir esta resposta. Retome a mesma pergunta em instantes.',
        code: known ? error.code : 'PORTAL_ALIX_GENERATION_FAILED', status: known ? error.statusCode : 503, retryable: true })
    } finally {
      close()
      reply.raw.removeListener('close', close)
      if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.end()
    }
  })
}
