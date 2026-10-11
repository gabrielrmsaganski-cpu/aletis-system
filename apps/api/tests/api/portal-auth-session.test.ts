import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ clients: new Map<string, any>(), login: vi.fn(), consume: vi.fn(), save: vi.fn() }))
vi.mock('../../src/routes/clientes.js', () => ({ clientes: state.clients }))
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => false, getPool: vi.fn() }))
vi.mock('../../src/services/portal/PortalDocumentRoutes.js', () => ({ registerPortalDocumentRoutes: vi.fn() }))
vi.mock('../../src/services/portal/PortalConversationRoutes.js', () => ({ registerPortalConversationRoutes: vi.fn() }))
vi.mock('../../src/services/portal/PortalClientRequestRoutes.js', () => ({ registerPortalClientRequestRoutes: vi.fn() }))
vi.mock('../../src/services/portal/PortalAlixRoutes.js', () => ({ registerPortalAlixRoutes: vi.fn() }))
vi.mock('../../src/services/portal/PortalDocumentService.js', () => ({ portalDocumentService: {} }))
vi.mock('../../src/services/portal/PortalAccountService.js', () => ({
  loadPortalAccess: async (id: string) => state.clients.get(id)?.portalAcesso || null,
  refreshPortalAccesses: async () => {}, recordPortalLogin: state.login, savePortalAccess: state.save,
}))
vi.mock('../../src/services/portal/PortalCommunicationService.js', () => ({ listPortalMessages: vi.fn(), addPortalMessage: vi.fn(), markPortalMessagesRead: vi.fn(), listPortalUpdates: vi.fn() }))
vi.mock('../../src/services/PortalTokenService.js', () => ({ emitirToken: vi.fn(), consumirToken: state.consume, revogarTokensCliente: vi.fn() }))
vi.mock('../../src/services/PortalNotificationService.js', () => ({ enviarMagicLink: vi.fn(), enviarResetSenha: vi.fn(), enviarBoasVindas: vi.fn() }))
vi.mock('../../src/services/PushService.js', () => ({ getVapidPublicKey: vi.fn() }))
vi.mock('../../src/services/HonorariosService.js', () => ({ projetarHonorarios: vi.fn() }))
vi.mock('../../src/services/PortalAlixService.js', () => ({ chatPortalAlix: vi.fn(), criarSessaoPortal: vi.fn(), listarSessoesPortal: vi.fn(), obterSessaoPortal: vi.fn(), deletarSessaoPortal: vi.fn() }))
vi.mock('../../src/services/PortalStore.js', () => ({ registrarEvento: vi.fn(), listarEventos: vi.fn() }))

import portalRoutes from '../../src/routes/portal.js'
import { hashSenha } from '../../src/services/PortalAuthService.js'

describe('sessões do portal e alterações concorrentes de credenciais', () => {
  let app: FastifyInstance
  let client: any
  let sequence = 0
  const oldVersion = '2026-09-11T12:00:00.000Z'
  const newVersion = '2026-09-11T12:01:00.000Z'
  const password = 'Synthetic-only-9012'
  beforeEach(async () => {
    vi.clearAllMocks(); state.clients.clear(); sequence++
    client = { id: `auth-fixture-${sequence}`, nome: 'Cliente fictício', cpfCnpj: `TEST${sequence}`, dividas: [],
      portalAcesso: { usuario: `auth-fixture-${sequence}`, ...hashSenha(password), ativo: true, forcaTrocaSenha: false, criadoEm: oldVersion, atualizadoEm: oldVersion } }
    state.clients.set(client.id, client)
    state.login.mockResolvedValue(undefined)
    state.consume.mockReturnValue({ clienteId: client.id })
    state.save.mockImplementation(async (id: string, access: any) => {
      const next = { ...access, atualizadoEm: newVersion }
      state.clients.get(id).portalAcesso = next
      return next
    })
    app = Fastify()
    await app.register(jwt, { secret: 'portal-auth-fixture-never-production-123456789', sign: { expiresIn: '12h' } })
    await app.register(cookie)
    await app.register(portalRoutes)
    await app.ready()
  })
  afterEach(async () => { await app.close() })
  const login = () => app.inject({ method: 'POST', url: '/api/portal/auth/login', headers: { 'x-forwarded-proto': 'https' }, payload: { usuario: client.portalAcesso.usuario, senha: password } })
  const me = (token: string) => app.inject({ url: '/api/portal/auth/me', headers: { authorization: `Bearer ${token}` } })

  for (const mode of ['senha', 'magic'] as const) {
    it(`um reset durante login por ${mode} não assina a versão da nova credencial`, async () => {
      let entered!: () => void; let release!: () => void
      const started = new Promise<void>(resolve => { entered = resolve })
      state.login.mockImplementationOnce(async () => { entered(); await new Promise<void>(resolve => { release = resolve }) })
      const pending = mode === 'senha' ? login() : app.inject({ method: 'POST', url: '/api/portal/auth/magic/redeem', payload: { token: 'fixture-magic-token-only' } })
      const responsePromise = Promise.resolve(pending)
      await started
      client.portalAcesso = { ...client.portalAcesso, ...hashSenha('New-synthetic-password'), atualizadoEm: newVersion }
      release()
      const response = await responsePromise
      expect(response.statusCode).toBe(200)
      const token = response.json().data.token
      expect(app.jwt.verify<any>(token).authVersion).toBe(oldVersion)
      expect((await me(token)).statusCode).toBe(401)
    })
  }
  it('trocar senha emite sessão nova, invalida a anterior e mantém cookie HTTPS protegido', async () => {
    const first = await login()
    expect(first.statusCode).toBe(200)
    expect(first.headers['set-cookie']).toMatch(/HttpOnly/)
    expect(first.headers['set-cookie']).toMatch(/Secure/)
    const oldToken = first.json().data.token
    const changed = await app.inject({ method: 'POST', url: '/api/portal/auth/trocar-senha', headers: { authorization: `Bearer ${oldToken}`, 'x-forwarded-proto': 'https' }, payload: { senhaAtual: password, novaSenha: 'Changed-synthetic-9012' } })
    expect(changed.statusCode).toBe(200)
    expect(changed.headers['set-cookie']).toMatch(/Secure/)
    const token = changed.json().data.token
    expect((await me(oldToken)).statusCode).toBe(401)
    const current = await me(token)
    expect(current.statusCode).toBe(200)
    expect(current.headers['cache-control']).toBe('private, no-store')
    expect(current.body).not.toMatch(/senhaHash|salt|Changed-synthetic/)
    expect((await app.inject({ url: '/api/portal/auth/me', headers: { cookie: `portal_token=${token}` } })).statusCode).toBe(200)
  })
  it('credencial revogada e token colocado na URL não autorizam leitura', async () => {
    const response = await login()
    const token = response.json().data.token
    expect((await app.inject({ url: `/api/portal/auth/me?_t=${token}` })).statusCode).toBe(401)
    client.portalAcesso.ativo = false
    expect((await me(token)).statusCode).toBe(403)
  })
})
