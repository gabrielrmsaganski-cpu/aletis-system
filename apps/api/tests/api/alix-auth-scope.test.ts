import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applyAlixAuth } from '../../src/middleware/alixAuth.js'

const mocks = vi.hoisted(() => ({ session: vi.fn() }))
vi.mock('../../src/db/AlixSessionRepository.js', () => ({ getSessionAccess: mocks.session, getSessionsAccess: async (ids: string[]) => (await Promise.all(ids.map(id => mocks.session(id)))).filter(Boolean) }))
import { assertAlixSessionAccess, canAccessAlixOwner, filterAlixSessionResources } from '../../src/services/alix/AlixAccessService.js'

const apps: ReturnType<typeof Fastify>[] = []
beforeEach(() => {
  vi.stubEnv('ALETIS_INTERNAL_AUTH_ENABLED', '1')
  vi.stubEnv('ALIX_AUTH_STRICT', 'false')
  vi.stubEnv('ALIX_ADMIN_USER_IDS', '')
  vi.stubEnv('ALIX_LEGACY_SHARED_SESSION_IDS', '')
  mocks.session.mockReset().mockImplementation(async (id: string) => ({ id, consultorId: id === 'own' ? 'consultor-a' : id === 'other' ? 'consultor-b' : undefined }))
})
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); vi.unstubAllEnvs() })
async function app() {
  const server = Fastify()
  apps.push(server)
  await server.register(jwt, { secret: 'fixture-secret-for-alix-auth-only' })
  await server.register(cookie)
  await server.register(async scoped => {
    applyAlixAuth(scoped)
    scoped.get('/identity', request => request.alixUser)
    scoped.get<{ Params: { id: string } }>('/session/:id', request => assertAlixSessionAccess(request.alixUser, request.params.id))
  })
  await server.ready()
  return server
}

it('cookie e Bearer internos resolvem a mesma identidade real sem conceder AdminMaster', async () => {
  const server = await app()
  const token = server.jwt.sign({ sub: 'consultor-regis', username: 'regis', kind: 'internal', role: 'admin_master' })
  const fromCookie = await server.inject({ url: '/identity', cookies: { aletis_session: token }, headers: { 'x-aletis-role': 'admin_master', 'x-user-id': 'outro' } })
  const fromBearer = await server.inject({ url: '/identity', headers: { authorization: `Bearer ${token}` } })
  expect(fromCookie.statusCode).toBe(200)
  expect(fromCookie.json()).toMatchObject({ id: 'consultor-regis', consultorId: 'consultor-regis', role: 'consultor' })
  expect(fromCookie.json()).toEqual(fromBearer.json())
})

it('allowlist explícita pode conceder administração à identidade interna verificada', async () => {
  vi.stubEnv('ALIX_ADMIN_USER_IDS', 'consultor-regis')
  const server = await app()
  const token = server.jwt.sign({ sub: 'consultor-regis', username: 'regis', kind: 'internal' })
  expect((await server.inject({ url: '/identity', cookies: { aletis_session: token } })).json().role).toBe('admin_master')
})

it('compartilhamento legado exige ID permitido, ausência de dono e origem interna verificada', async () => {
  vi.stubEnv('ALIX_LEGACY_SHARED_SESSION_IDS', 'legacy,other')
  const server = await app()
  const token = server.jwt.sign({ sub: 'consultor-regis', username: 'regis', kind: 'internal' })
  const cookies = { aletis_session: token }
  const legacy = await server.inject({ url: '/session/legacy', cookies })
  expect(legacy.statusCode).toBe(200)
  expect(legacy.json()).toMatchObject({ id: 'legacy', legacyShared: true })
  expect((await server.inject({ url: '/session/other', cookies })).statusCode).toBe(404)
  expect((await server.inject({ url: '/session/not-listed', cookies })).statusCode).toBe(404)
  const forgedSource = server.jwt.sign({ sub: 'consultor-regis', role: 'consultor', authSource: 'internal' })
  expect((await server.inject({ url: '/session/legacy', headers: { authorization: `Bearer ${forgedSource}`, 'x-alix-auth-source': 'internal' } })).statusCode).toBe(404)
  mocks.session.mockRejectedValueOnce(new Error('PG indisponível'))
  expect((await server.inject({ url: '/session/legacy', cookies })).statusCode).toBe(500)
})

it('credencial inválida não vira anonymous mesmo no modo ALIX não estrito', async () => {
  const server = await app()
  expect((await server.inject('/identity')).statusCode).toBe(401)
  expect((await server.inject({ url: '/identity', cookies: { aletis_session: 'invalid' } })).statusCode).toBe(401)
  vi.stubEnv('ALETIS_INTERNAL_AUTH_ENABLED', '0')
  expect((await server.inject({ url: '/identity', headers: { authorization: 'Bearer invalid' } })).statusCode).toBe(401)
  expect((await server.inject('/identity')).json()).toMatchObject({ id: 'anonymous' })
})

it('papel restrito acessa só a própria sessão; legado sem dono não é apropriado', async () => {
  const server = await app()
  const token = server.jwt.sign({ sub: 'consultor-a', role: 'consultor' })
  const headers = { authorization: `Bearer ${token}` }
  expect((await server.inject({ url: '/session/own', headers })).statusCode).toBe(200)
  expect((await server.inject({ url: '/session/other', headers })).statusCode).toBe(404)
  expect((await server.inject({ url: '/session/legacy', headers })).statusCode).toBe(404)
  const admin = server.jwt.sign({ sub: 'admin-a', role: 'admin_master' })
  expect((await server.inject({ url: '/session/legacy', headers: { authorization: `Bearer ${admin}` } })).statusCode).toBe(200)
})

it('filtra recursos por sessão sem considerar headers e não oculta falha de autorização no banco', async () => {
  const user = { id: 'consultor-a', sub: 'consultor-a', nome: 'A', role: 'consultor' }
  const rows = [{ sessionId: 'own' }, { sessionId: 'other' }, { sessionId: 'legacy' }, {}]
  expect(await filterAlixSessionResources(user, rows)).toEqual([{ sessionId: 'own' }])
  expect(canAccessAlixOwner(user, 'consultor-b')).toBe(false)
  mocks.session.mockRejectedValueOnce(new Error('PG indisponível'))
  await expect(assertAlixSessionAccess(user, 'own')).rejects.toThrow('PG indisponível')
  await expect(assertAlixSessionAccess(user, '../other')).rejects.toMatchObject({ statusCode: 400 })
})
