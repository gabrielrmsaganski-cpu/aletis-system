// ============================================================
// Autenticação do ambiente interno ALETIS.
//
// A sessão usa JWT em cookie HttpOnly. O navegador não recebe nem
// persiste o token, reduzindo a superfície para vazamento via XSS.
// ============================================================
import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  findInternalUser,
  INTERNAL_SESSION_COOKIE,
  INTERNAL_SESSION_TTL_SECONDS,
  normalizeUsername,
  resolveInternalSession,
  verifyInternalPassword,
} from '../lib/internal-auth.js'

const LoginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(256),
})

function isSecureRequest(request: FastifyRequest): boolean {
  const forwardedProto = request.headers['x-forwarded-proto']
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto
  return request.protocol === 'https' || proto?.split(',')[0]?.trim() === 'https'
}

function cookieOptions(request: FastifyRequest) {
  return {
    path: '/',
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: 'lax' as const,
    maxAge: INTERNAL_SESSION_TTL_SECONDS,
  }
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/api/auth/login', {
    config: {
      rateLimit: {
        max: Number(process.env.ALETIS_AUTH_RATE_LIMIT_MAX ?? 8),
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: 'Informe usuário e senha.',
        code: 'INVALID_LOGIN_PAYLOAD',
      })
    }

    const configuredHash = process.env.ALETIS_AUTH_PASSWORD_HASH?.trim()
    if (!configuredHash) {
      request.log.error('[auth] ALETIS_AUTH_PASSWORD_HASH não configurado')
      return reply.status(503).send({
        success: false,
        error: 'O acesso interno ainda não foi configurado no servidor.',
        code: 'AUTH_NOT_CONFIGURED',
      })
    }

    const username = normalizeUsername(parsed.data.username)
    const user = findInternalUser(username)
    // Executa scrypt mesmo para usuário inexistente, evitando diferença de
    // tempo que permita enumerar os logins cadastrados.
    const passwordMatches = await verifyInternalPassword(parsed.data.password, configuredHash)
    if (!user || !passwordMatches) {
      request.log.warn({ ip: request.ip }, '[auth] tentativa de login interno rejeitada')
      return reply.status(401).send({
        success: false,
        error: 'Usuário ou senha inválidos.',
        code: 'INVALID_CREDENTIALS',
      })
    }

    const token = fastify.jwt.sign(
      {
        sub: user.id,
        kind: 'internal',
        username: user.username,
        jti: randomUUID(),
      },
      { expiresIn: INTERNAL_SESSION_TTL_SECONDS },
    )

    reply.setCookie(INTERNAL_SESSION_COOKIE, token, cookieOptions(request))
    request.log.info({ userId: user.id }, '[auth] login interno realizado')
    return reply.send({ success: true, data: user })
  })

  fastify.post('/api/auth/logout', async (request, reply) => {
    reply.clearCookie(INTERNAL_SESSION_COOKIE, {
      path: '/',
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: 'lax',
    })
    return reply.send({ success: true, data: { loggedOut: true } })
  })

  fastify.get('/api/auth/me', async (request, reply) => {
    const user = resolveInternalSession(fastify, request)
    if (!user) {
      return reply.status(401).send({
        success: false,
        error: 'Sessão ausente ou expirada.',
        code: 'UNAUTHORIZED',
      })
    }
    return reply.send({ success: true, data: user })
  })
}
