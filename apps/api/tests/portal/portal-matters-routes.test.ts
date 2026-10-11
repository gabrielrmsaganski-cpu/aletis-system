import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const calls = vi.hoisted(() => ({ listPublic: vi.fn(), listStaff: vi.fn(), create: vi.fn(), update: vi.fn(), history: vi.fn(), versions: vi.fn(), staff: vi.fn(), access: vi.fn() }))
vi.mock('../../src/services/portal/PortalMatterService.js', () => ({
  portalMatterService: calls,
  PortalMatterError: class extends Error { constructor(message: string, public statusCode = 400) { super(message) } },
}))
vi.mock('../../src/services/portal/PortalDocumentRoutes.js', () => ({ assertPortalStaff: calls.staff }))
vi.mock('../../src/services/core/AccessControlService.js', () => ({ getAccessControlService: () => ({ assertClienteAccess: calls.access }) }))
import { registerPortalMatterRoutes } from '../../src/services/portal/PortalMatterRoutes.js'

describe('rotas de assuntos separam cliente e equipe com autorização explícita', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    vi.resetAllMocks()
    calls.listPublic.mockResolvedValue({ assuntos: [], eventos: [] }); calls.listStaff.mockResolvedValue({ assuntos: [] })
    calls.staff.mockResolvedValue({ client: { id: 'canonical-client' }, user: { id: 'staff-a', nome: 'Equipe', consultorId: 'staff-a' } })
    calls.create.mockResolvedValue({ assunto: { id: 'matter-a' }, replayed: false }); calls.update.mockResolvedValue({ id: 'matter-a' })
    calls.history.mockResolvedValue({ eventos: [], proximoCursor: null }); calls.versions.mockResolvedValue({ versoes: [], proximoCursor: null })
    app = Fastify()
    await registerPortalMatterRoutes(app, async (request, reply) => {
      if (request.headers['x-fixture-client'] !== 'client-a') return reply.code(401).send({ success: false })
      ;(request as any).clienteId = 'client-a'
    })
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  it('lista pública usa exclusivamente a identidade autenticada e não permite cache compartilhado', async () => {
    expect((await app.inject({ url: '/api/portal/assuntos' })).statusCode).toBe(401)
    expect(calls.listPublic).not.toHaveBeenCalled()
    const result = await app.inject({ url: '/api/portal/assuntos?clienteId=client-b', headers: { 'x-fixture-client': 'client-a' } })
    expect(result.statusCode).toBe(200); expect(result.headers['cache-control']).toBe('private, no-store')
    expect(calls.listPublic).toHaveBeenCalledWith('client-a'); expect(calls.listStaff).not.toHaveBeenCalled()
  })

  it('não oferece rotas públicas para publicar, editar ou consultar versões privadas', async () => {
    for (const input of [
      { method: 'POST' as const, url: '/api/portal/assuntos' },
      { method: 'PATCH' as const, url: '/api/portal/assuntos/matter-a' },
      { method: 'GET' as const, url: '/api/portal/assuntos/matter-a/versoes' },
    ]) expect((await app.inject({ ...input, headers: { 'x-fixture-client': 'client-a' } })).statusCode).toBe(404)
    expect(calls.create).not.toHaveBeenCalled(); expect(calls.update).not.toHaveBeenCalled(); expect(calls.versions).not.toHaveBeenCalled()
  })

  it('equipe sem acesso à carteira não lista, publica, revisa nem consulta versões', async () => {
    calls.staff.mockRejectedValue(Object.assign(new Error('Carteira não autorizada'), { statusCode: 403 }))
    for (const input of [
      { method: 'GET' as const, url: '/api/clientes/client-b/portal/assuntos' },
      { method: 'GET' as const, url: '/api/clientes/client-b/portal/assuntos/historico' },
      { method: 'GET' as const, url: '/api/clientes/client-b/portal/assuntos/matter-a/versoes' },
      { method: 'POST' as const, url: '/api/clientes/client-b/portal/assuntos' },
      { method: 'PATCH' as const, url: '/api/clientes/client-b/portal/assuntos/matter-a' },
    ]) expect((await app.inject(input)).statusCode).toBe(403)
    for (const method of ['listStaff', 'history', 'versions', 'create', 'update'] as const) expect(calls[method]).not.toHaveBeenCalled()
  })

  it('publicar e revisar exigem escrita documental e autorização de escrita no CRM', async () => {
    calls.access.mockRejectedValue(Object.assign(new Error('Escrita não autorizada'), { statusCode: 403 }))
    const create = { method: 'POST' as const, url: '/api/clientes/alias/portal/assuntos', headers: { 'idempotency-key': 'request-1234' }, payload: { titulo: 'Assunto público' } }
    expect((await app.inject(create)).statusCode).toBe(403)
    expect((await app.inject({ method: 'PATCH', url: '/api/clientes/alias/portal/assuntos/matter-a', payload: {} })).statusCode).toBe(403)
    expect(calls.staff.mock.calls.map(call => [call[2], call[3]])).toEqual([['alias', true], ['alias', true]])
    expect(calls.access).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 'canonical-client', action: 'write', actor: expect.objectContaining({ id: 'staff-a' }) }))
    expect(calls.create).not.toHaveBeenCalled(); expect(calls.update).not.toHaveBeenCalled()
  })

  it('recibo é obrigatório, retries retornam 200 e a criação confirmada retorna 201', async () => {
    const request = { method: 'POST' as const, url: '/api/clientes/alias/portal/assuntos', payload: { titulo: 'Assunto público' } }
    expect((await app.inject(request)).statusCode).toBe(400); expect(calls.create).not.toHaveBeenCalled()
    expect((await app.inject({ ...request, headers: { 'idempotency-key': 'request-1234' } })).statusCode).toBe(201)
    expect(calls.create).toHaveBeenCalledWith('canonical-client', request.payload, 'request-1234', 'staff-a')
    calls.create.mockResolvedValue({ assunto: { id: 'matter-a' }, replayed: true })
    expect((await app.inject({ ...request, headers: { 'idempotency-key': 'request-1234' } })).statusCode).toBe(200)
  })

  it('paginação e filtro de assunto não substituem o cliente autenticado', async () => {
    const input = { url: '/api/portal/assuntos/historico?assuntoId=matter-a&cursor=cursor-value', headers: { 'x-fixture-client': 'client-a' } }
    expect((await app.inject(input)).statusCode).toBe(200)
    expect(calls.history).toHaveBeenCalledWith('client-a', 'cursor-value', 'matter-a')
    expect((await app.inject({ ...input, url: `${input.url}&clienteId=client-b` })).statusCode).toBe(400)
    expect((await app.inject({ url: '/api/clientes/alias/portal/assuntos/matter-a/versoes?cursor=50' })).statusCode).toBe(200)
    expect(calls.versions).toHaveBeenCalledWith('canonical-client', 'matter-a', '50')
    expect((await app.inject({ url: '/api/clientes/alias/portal/assuntos/matter-a/versoes?cursor=invalid' })).statusCode).toBe(400)
  })

  it('versão CAS e identidade da equipe seguem para o serviço sem aceitar cliente no caminho como autorização', async () => {
    const payload = { expectedUpdatedAt: '2026-09-13T12:00:00.000Z', titulo: 'Assunto revisado' }
    expect((await app.inject({ method: 'PATCH', url: '/api/clientes/alias/portal/assuntos/matter-a', payload })).statusCode).toBe(200)
    expect(calls.update).toHaveBeenCalledWith('canonical-client', 'matter-a', payload, 'staff-a')
  })
})
