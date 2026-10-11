import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const service = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), get: vi.fn(), remove: vi.fn(), chat: vi.fn() }))
vi.mock('../../src/services/PortalAlixService.js', () => ({
  listarSessoesPortal: service.list, criarSessaoPortal: service.create,
  obterSessaoPortal: service.get, deletarSessaoPortal: service.remove, chatPortalAlix: service.chat,
  PortalAlixError: class extends Error {
    constructor(message: string, readonly statusCode = 400, readonly code = 'PORTAL_ALIX_INVALID') { super(message) }
  },
}))
import { PortalAlixError } from '../../src/services/PortalAlixService.js'
import { registerPortalAlixRoutes } from '../../src/services/portal/PortalAlixRoutes.js'

const sessionId = 'pas-route-fixture-a'
const requestId = 'request-route-fixture'
const body = { sessionId, requestId, message: 'O que devo enviar?' }
const headers = { 'x-fixture-owner': 'client-a' }
const sources = [{ id: 'P1', type: 'pedido', label: 'CPF legível', recordId: 'request-a' }]
const actions = [{ id: 'abrir-pedido', label: 'Abrir solicitação', view: 'documentos', requestId: 'request-a' }]
const events = (payload: string) => payload.split('\n\n').filter(part => part.startsWith('event: ')).map(part => {
  const [event, data] = part.split('\n')
  return { event: event.slice(7), data: JSON.parse(data.slice(6)) }
})
let app: FastifyInstance
beforeEach(() => { vi.resetAllMocks() })
afterEach(async () => { if (app) await app.close() })
async function server(options: { rateLimit?: (owner: string) => boolean } = {}) {
  app = Fastify({ logger: false })
  await registerPortalAlixRoutes(app, async (request, reply) => {
    const owner = request.headers['x-fixture-owner']
    if (typeof owner !== 'string' || !['client-a', 'client-b'].includes(owner)) return reply.code(401).send({ error: 'Autentique-se.' })
    Object.assign(request, { clienteId: owner })
  }, options)
  return app
}

describe('Rotas ALIX: validação, escopo e streaming público', () => {
  it('exige autenticação e valida body estrito antes de iniciar SSE', async () => {
    const app = await server()
    expect((await app.inject({ method: 'POST', url: '/api/portal/alix/stream', payload: body })).statusCode).toBe(401)
    for (const payload of [{ message: 'Oi' }, { ...body, message: ' ' }, { ...body, clienteId: 'client-b' }, { ...body, message: 'a'.repeat(4001) }]) {
      const response = await app.inject({ method: 'POST', url: '/api/portal/alix/stream', headers, payload })
      expect(response.statusCode).toBe(400)
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.payload).not.toContain('event: ')
    }
    expect(service.chat).not.toHaveBeenCalled()
  })

  it('aguarda listagem e criação usando somente o cliente autenticado', async () => {
    const app = await server()
    service.list.mockImplementation(async (owner, options) => {
      await Promise.resolve()
      return { items: [{ id: sessionId, clienteId: owner }], nextCursor: options.cursor ?? null }
    })
    const list = await app.inject({ method: 'GET', url: '/api/portal/alix/sessions?limit=3&cursor=fixture', headers })
    expect(list.json().data.items[0].clienteId).toBe('client-a')
    expect(service.list).toHaveBeenCalledWith('client-a', { limit: 3, cursor: 'fixture' })
    service.create.mockResolvedValue({ id: sessionId, clienteId: 'client-a' })
    const created = await app.inject({ method: 'POST', url: '/api/portal/alix/sessions', headers, payload: { titulo: 'Documentos', requestId } })
    expect(created.statusCode).toBe(201)
    expect(service.create).toHaveBeenCalledWith('client-a', 'Documentos', { requestId })
  })

  it('leitura e exclusão assíncronas de outra conta continuam não encontradas', async () => {
    const app = await server()
    service.get.mockImplementation(async (_id, owner) => owner === 'client-a' ? { id: sessionId, messages: [] } : null)
    service.remove.mockImplementation(async (_id, owner) => owner === 'client-a')
    const other = { 'x-fixture-owner': 'client-b' }
    expect((await app.inject({ method: 'GET', url: `/api/portal/alix/sessions/${sessionId}`, headers: other })).statusCode).toBe(404)
    expect(service.get).toHaveBeenCalledWith(sessionId, 'client-b', {})
    expect((await app.inject({ method: 'DELETE', url: `/api/portal/alix/sessions/${sessionId}`, headers: other })).statusCode).toBe(404)
    expect(service.remove).toHaveBeenCalledWith(sessionId, 'client-b')
    expect((await app.inject({ method: 'GET', url: `/api/portal/alix/sessions/${sessionId}?limit=2&beforeOrdinal=5`, headers })).statusCode).toBe(200)
    expect(service.get).toHaveBeenLastCalledWith(sessionId, 'client-a', { limit: 2, beforeOrdinal: 5 })
  })

  it('rejeita paginações excessivas sem consultar o serviço', async () => {
    const app = await server()
    for (const url of ['/api/portal/alix/sessions?limit=51', `/api/portal/alix/sessions/${sessionId}?beforeOrdinal=2147483648`, '/api/portal/alix/sessions?clienteId=client-b']) {
      expect((await app.inject({ method: 'GET', url, headers })).statusCode).toBe(400)
    }
    expect(service.list).not.toHaveBeenCalled()
    expect(service.get).not.toHaveBeenCalled()
  })

  it('done preserva resposta durável, fontes, ações e replay', async () => {
    const app = await server()
    service.chat.mockImplementation(async options => {
      expect(options).toMatchObject({ ...body, clienteId: 'client-a' })
      options.onStart({ sessionId, turnId: 'pat-fixture', requestId, replayed: true })
      options.onToken('Envie o CPF legível. [P1]')
      return { session: { id: sessionId, titulo: 'Documentos' }, reply: { content: 'Envie o CPF legível. [P1]', sources, actions }, turn: { id: 'pat-fixture', status: 'completed', sources, actions }, replayed: true }
    })
    const response = await app.inject({ method: 'POST', url: '/api/portal/alix/stream', headers, payload: body })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('text/event-stream')
    expect(events(response.payload).map(item => item.event)).toEqual(['start', 'thinking', 'token', 'done'])
    expect(events(response.payload).at(-1)?.data).toMatchObject({ sessionId, replayed: true, reply: { sources, actions }, turn: { status: 'completed' } })
  })

  it('conflito de geração retorna evento de erro 409 reconhecível', async () => {
    const app = await server()
    service.chat.mockRejectedValue(new PortalAlixError('A resposta ainda está sendo preparada.', 409, 'PORTAL_ALIX_BUSY'))
    const response = await app.inject({ method: 'POST', url: '/api/portal/alix/stream', headers, payload: body })
    expect(events(response.payload)).toEqual([{ event: 'error', data: { error: 'A resposta ainda está sendo preparada.', code: 'PORTAL_ALIX_BUSY', status: 409, retryable: true } }])
  })

  it('falha externa é sanitizada e não retorna resposta ou detalhes internos', async () => {
    const app = await server()
    service.chat.mockRejectedValue(new Error('PRIVATE_PROVIDER_TOKEN /private/dossier-client-b'))
    const response = await app.inject({ method: 'POST', url: '/api/portal/alix/stream', headers, payload: body })
    expect(response.payload).not.toMatch(/PRIVATE_PROVIDER_TOKEN|private\/dossier|event: done|event: token/)
    expect(events(response.payload)[0]).toMatchObject({ event: 'error', data: { code: 'PORTAL_ALIX_GENERATION_FAILED', status: 503, retryable: true } })
  })

  it('limite de uso é JSON 429 antes do streaming e não chama geração', async () => {
    const limit = vi.fn(() => false)
    const app = await server({ rateLimit: limit })
    const response = await app.inject({ method: 'POST', url: '/api/portal/alix/stream', headers, payload: body })
    expect(response.statusCode).toBe(429)
    expect(response.headers['content-type']).toContain('application/json')
    expect(limit).toHaveBeenCalledWith('client-a')
    expect(service.chat).not.toHaveBeenCalled()
  })
})
