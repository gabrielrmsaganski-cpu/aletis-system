import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInternalPasswordHash, isInternalAuthPublicPath } from '../../src/lib/internal-auth.js'
import authRoutes from '../../src/routes/auth.js'

const TEST_PASSWORD = 'aletis2026'
let app: FastifyInstance

beforeEach(async () => {
  process.env.ALETIS_AUTH_PASSWORD_HASH = createInternalPasswordHash(
    TEST_PASSWORD,
    Buffer.alloc(24, 7),
  )
  app = Fastify({ logger: false })
  await app.register(jwt, { secret: 'auth-test-secret-with-enough-entropy' })
  await app.register(cookie)
  await app.register(authRoutes)
  await app.ready()
})

afterEach(async () => {
  delete process.env.ALETIS_AUTH_PASSWORD_HASH
  await app.close()
})

describe('autenticação interna', () => {
  it.each([
    ['christian', 'Christian Kohler'],
    ['regis', 'Regis'],
    ['eliandra', 'Eliandra'],
  ])('autentica %s e cria cookie HttpOnly', async (username, expectedName) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-forwarded-proto': 'https' },
      payload: { username, password: TEST_PASSWORD },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.nome).toBe(expectedName)
    const setCookie = String(response.headers['set-cookie'])
    expect(setCookie).toContain('aletis_session=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('SameSite=Lax')
  })

  it('rejeita senha e usuário inválidos com a mesma resposta genérica', async () => {
    const [wrongPassword, wrongUser] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'christian', password: 'incorreta' },
      }),
      app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'desconhecido', password: TEST_PASSWORD },
      }),
    ])

    expect(wrongPassword.statusCode).toBe(401)
    expect(wrongUser.statusCode).toBe(401)
    expect(wrongPassword.json().error).toBe('Usuário ou senha inválidos.')
    expect(wrongUser.json().error).toBe('Usuário ou senha inválidos.')
  })

  it('resolve a sessão pelo cookie e bloqueia acesso sem cookie', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'regis', password: TEST_PASSWORD },
    })
    const sessionCookie = String(login.headers['set-cookie']).split(';')[0]

    const [authenticated, anonymous] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: sessionCookie } }),
      app.inject({ method: 'GET', url: '/api/auth/me' }),
    ])

    expect(authenticated.statusCode).toBe(200)
    expect(authenticated.json().data.username).toBe('regis')
    expect(anonymous.statusCode).toBe(401)
  })

  it('mantém somente integrações públicas necessárias fora do guard', () => {
    expect(isInternalAuthPublicPath('POST', '/api/auth/login')).toBe(true)
    expect(isInternalAuthPublicPath('POST', '/api/portal/auth/login')).toBe(true)
    expect(isInternalAuthPublicPath('POST', '/api/whatsapp/webhook')).toBe(true)
    expect(isInternalAuthPublicPath('GET', '/api/clientes')).toBe(false)
    expect(isInternalAuthPublicPath('POST', '/api/alix/chat')).toBe(false)
  })
})
