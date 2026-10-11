import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ clients: new Map<string, { id: string }>(), access: vi.fn(), list: vi.fn(), create: vi.fn(), revoke: vi.fn(), review: vi.fn() }))
vi.mock('../../src/routes/clientes.js', () => ({ clientes: state.clients }))
vi.mock('../../src/services/core/AccessControlService.js', () => ({ getAccessControlService: () => ({ assertClienteAccess: state.access }) }))
vi.mock('../../src/services/portal/PortalFiscalService.js', () => ({ portalFiscalService: { list: state.list, create: state.create, revoke: state.revoke, review: state.review } }))
// Serviços documentais não são executados aqui; o guard real de sessão e carteira é preservado.
vi.mock('../../src/services/portal/PortalDocumentService.js', () => ({ portalDocumentService: {} }))
vi.mock('../../src/services/portal/PortalDocumentProcessor.js', () => ({ getPortalDocumentProcessor: vi.fn() }))
vi.mock('../../src/services/portal/PortalCommunicationService.js', () => ({ listPortalUpdates: vi.fn(), publishPortalUpdate: vi.fn(), sharePortalUpload: vi.fn() }))
import { registerPortalFiscalRoutes } from '../../src/services/portal/PortalFiscalRoutes.js'

describe('rotas fiscais com JWT e guard real da equipe', () => {
  let app: FastifyInstance
  let portalA: string; let portalB: string; let staff: string
  beforeEach(async () => {
    vi.resetAllMocks(); state.clients.clear()
    state.clients.set('client-a', { id: 'client-a' }); state.clients.set('client-b', { id: 'client-b' })
    state.access.mockResolvedValue(undefined)
    state.list.mockImplementation(async (clienteId: string) => ({ autorizacoes: [{ id: `authorization-${clienteId}`, clienteId }], consultaAutomatica: false }))
    state.create.mockResolvedValue({ autorizacao: { id: 'authorization-a', consultaAutomatica: false }, replayed: false })
    state.revoke.mockResolvedValue({ id: 'authorization-a', status: 'revogada' }); state.review.mockResolvedValue({ id: 'authorization-a', status: 'em_conferencia' })
    app = Fastify()
    await app.register(jwt, { secret: 'fiscal-local-fixture-only-never-a-production-key-123456789' })
    await app.register(cookie)
    await registerPortalFiscalRoutes(app, async (request, reply) => {
      try { await request.jwtVerify() } catch { return reply.code(401).send({ success: false }) }
      const claims = request.user as { sub?: string; kind?: string }
      if (claims.kind !== 'portal-cliente' || !claims.sub || !state.clients.has(claims.sub)) return reply.code(401).send({ success: false })
      ;(request as any).clienteId = claims.sub
    })
    await app.ready()
    portalA = app.jwt.sign({ sub: 'client-a', kind: 'portal-cliente' })
    portalB = app.jwt.sign({ sub: 'client-b', kind: 'portal-cliente' })
    staff = app.jwt.sign({ sub: 'consultor-christian', kind: 'internal', username: 'christian' })
  })
  afterEach(async () => { await app.close() })
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
  const input = { uf: 'MT', servicos: ['certidoes'], modalidade: 'procuracao_eletronica', consentimento: true }

  it('todas as operações públicas exigem JWT do cliente; sessão interna não substitui o cliente', async () => {
    const requests = [
      { method: 'GET' as const, url: '/api/portal/fiscal' },
      { method: 'POST' as const, url: '/api/portal/fiscal/autorizacoes', payload: input },
      { method: 'PATCH' as const, url: '/api/portal/fiscal/autorizacoes/authorization-a/suspender', payload: { expectedUpdatedAt: '2026-09-13T10:00:00.000Z' } },
    ]
    for (const request of requests) {
      expect((await app.inject(request)).statusCode).toBe(401)
      expect((await app.inject({ ...request, headers: bearer(staff) })).statusCode).toBe(401)
    }
    expect(state.list).not.toHaveBeenCalled(); expect(state.create).not.toHaveBeenCalled(); expect(state.revoke).not.toHaveBeenCalled()
  })

  it('JWT de portal, cabeçalhos declaratórios e token na URL não acessam endpoints fiscais da equipe', async () => {
    const targets = [
      { method: 'GET' as const, url: '/api/clientes/client-a/portal/fiscal' },
      { method: 'PATCH' as const, url: '/api/clientes/client-a/portal/fiscal/autorizacoes/authorization-a', payload: {} },
    ]
    for (const target of targets) {
      expect((await app.inject(target)).statusCode).toBe(401)
      expect((await app.inject({ ...target, headers: { ...bearer(portalA), 'x-role': 'admin', 'x-user-id': 'consultor-christian' } })).statusCode).toBe(401)
      expect((await app.inject({ ...target, url: `${target.url}?token=${staff}` })).statusCode).toBe(401)
      expect((await app.inject({ ...target, headers: { cookie: `aletis_session=${portalA}` } })).statusCode).toBe(401)
    }
    expect(state.access).not.toHaveBeenCalled(); expect(state.list).not.toHaveBeenCalled(); expect(state.review).not.toHaveBeenCalled()
  })

  it('identidade interna desconhecida, adulterada ou expirada é recusada pelo guard real', async () => {
    const tokens = [
      app.jwt.sign({ sub: 'client-a', kind: 'internal', username: 'christian' }),
      app.jwt.sign({ sub: 'consultor-christian', kind: 'internal', username: 'unknown' }),
      app.jwt.sign({ sub: 'consultor-christian', kind: 'internal', username: 'christian', exp: Math.floor(Date.now() / 1000) - 60 }),
      `${staff.slice(0, -5)}xxxxx`,
    ]
    for (const token of tokens) expect((await app.inject({ url: '/api/clientes/client-a/portal/fiscal', headers: bearer(token) })).statusCode).toBe(401)
    expect(state.access).not.toHaveBeenCalled(); expect(state.list).not.toHaveBeenCalled()
  })

  it('leitura usa o cliente autenticado e bloqueia cache de autorizações', async () => {
    const result = await app.inject({ url: '/api/portal/fiscal?clienteId=client-b', headers: bearer(portalA) })
    expect(result.statusCode).toBe(200); expect(result.headers['cache-control']).toContain('no-store')
    expect(result.json().data.autorizacoes[0].clienteId).toBe('client-a')
    expect(state.list).toHaveBeenLastCalledWith('client-a')
    const other = await app.inject({ url: '/api/portal/fiscal', headers: bearer(portalB) })
    expect(other.json().data.autorizacoes[0].clienteId).toBe('client-b')
    expect(state.list).toHaveBeenLastCalledWith('client-b')
  })

  it('cadastro encaminha o recibo estável e retorna 201 apenas na criação', async () => {
    const request = { method: 'POST' as const, url: '/api/portal/fiscal/autorizacoes?clienteId=client-b', headers: { ...bearer(portalA), 'idempotency-key': 'fiscal-request-1234' }, payload: input }
    expect((await app.inject(request)).statusCode).toBe(201)
    expect(state.create).toHaveBeenCalledWith('client-a', input, 'fiscal-request-1234')
    state.create.mockResolvedValue({ autorizacao: { id: 'authorization-a' }, replayed: true })
    const replay = await app.inject(request)
    expect(replay.statusCode).toBe(200); expect(replay.json().replayed).toBe(true)
    state.create.mockRejectedValueOnce(Object.assign(new Error('Confirmação de envio ausente'), { statusCode: 400 }))
    expect((await app.inject({ ...request, headers: bearer(portalA) })).statusCode).toBe(400)
    expect(state.create).toHaveBeenLastCalledWith('client-a', input, undefined)
  })

  it('suspensão permanece no cliente autenticado e respeita recusa do serviço para outro titular', async () => {
    const payload = { expectedUpdatedAt: '2026-09-13T10:00:00.000Z' }
    const target = { method: 'PATCH' as const, url: '/api/portal/fiscal/autorizacoes/authorization-b/suspender', headers: bearer(portalA), payload }
    state.revoke.mockRejectedValueOnce(Object.assign(new Error('Autorização não encontrada'), { statusCode: 404 }))
    expect((await app.inject(target)).statusCode).toBe(404)
    expect(state.revoke).toHaveBeenCalledWith('client-a', 'authorization-b', payload)
    expect(state.review).not.toHaveBeenCalled()
  })

  it('equipe sem carteira autorizada não vê nem confere autorizações fiscais', async () => {
    state.access.mockRejectedValue(Object.assign(new Error('Fora da carteira'), { statusCode: 403 }))
    expect((await app.inject({ url: '/api/clientes/client-a/portal/fiscal', headers: bearer(staff) })).statusCode).toBe(403)
    expect((await app.inject({ method: 'PATCH', url: '/api/clientes/client-a/portal/fiscal/autorizacoes/authorization-a', headers: bearer(staff), payload: {} })).statusCode).toBe(403)
    expect(state.list).not.toHaveBeenCalled(); expect(state.review).not.toHaveBeenCalled()
    expect(state.access.mock.calls.map(call => call[0].action)).toEqual(['document:read', 'document:write'])
  })

  it('conferência exige também escrita no CRM depois da escrita documental', async () => {
    state.access.mockImplementation(async ({ action }: { action: string }) => {
      if (action === 'write') throw Object.assign(new Error('Sem permissão de edição cadastral'), { statusCode: 403 })
    })
    const request = { method: 'PATCH' as const, url: '/api/clientes/client-a/portal/fiscal/autorizacoes/authorization-a', headers: bearer(staff), payload: { status: 'em_conferencia', expectedUpdatedAt: '2026-09-13T10:00:00.000Z', orientacao: 'Conferência iniciada.' } }
    expect((await app.inject(request)).statusCode).toBe(403)
    expect(state.access.mock.calls.map(call => call[0].action)).toEqual(['document:write', 'write'])
    expect(state.review).not.toHaveBeenCalled()
    state.access.mockResolvedValue(undefined)
    expect((await app.inject(request)).statusCode).toBe(200)
    expect(state.review).toHaveBeenCalledWith('client-a', 'authorization-a', request.payload, 'consultor-christian')
  })

  it('leitura interna admite cookie oficial e mantém identidade verificada e cache desabilitado', async () => {
    const result = await app.inject({ url: '/api/clientes/client-b/portal/fiscal', headers: { cookie: `aletis_session=${staff}` } })
    expect(result.statusCode).toBe(200); expect(result.headers['cache-control']).toContain('no-store')
    expect(state.access).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 'client-b', action: 'document:read', actor: expect.objectContaining({ id: 'consultor-christian' }) }))
    expect(state.list).toHaveBeenCalledWith('client-b')
  })
})
