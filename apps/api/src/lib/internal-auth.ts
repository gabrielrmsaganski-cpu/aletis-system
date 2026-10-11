import { randomBytes, scrypt as nodeScrypt, scryptSync, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { FastifyInstance, FastifyRequest } from 'fastify'

export const INTERNAL_SESSION_COOKIE = 'aletis_session'
export const INTERNAL_SESSION_TTL_SECONDS = 12 * 60 * 60

export interface InternalUser {
  id: string
  username: string
  nome: string
  primeiroNome: string
  iniciais: string
  cargo: string
  email: string
  consultorId: string
}

interface InternalSessionClaims {
  sub: string
  kind: 'internal'
  username: string
}

const INTERNAL_USERS: Readonly<Record<string, InternalUser>> = Object.freeze({
  christian: {
    id: 'consultor-christian',
    username: 'christian',
    nome: 'Christian Kohler',
    primeiroNome: 'Christian',
    iniciais: 'CK',
    cargo: 'Consultor sênior',
    email: 'christian@aletis.com.br',
    consultorId: 'consultor-christian',
  },
  regis: {
    id: 'consultor-regis',
    username: 'regis',
    nome: 'Regis',
    primeiroNome: 'Regis',
    iniciais: 'RG',
    cargo: 'Consultor',
    email: 'regis@aletis.com.br',
    consultorId: 'consultor-regis',
  },
  eliandra: {
    id: 'consultora-eliandra',
    username: 'eliandra',
    nome: 'Eliandra',
    primeiroNome: 'Eliandra',
    iniciais: 'EL',
    cargo: 'Consultora',
    email: 'eliandra@aletis.com.br',
    consultorId: 'consultora-eliandra',
  },
})

const scrypt = promisify(nodeScrypt)

export function normalizeUsername(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR')
}

export function findInternalUser(username: string): InternalUser | null {
  return INTERNAL_USERS[normalizeUsername(username)] ?? null
}

/** Consulta identidade configurada no servidor; não concede papel por cabeçalho. */
export function findInternalUserById(id: string): InternalUser | null {
  return Object.values(INTERNAL_USERS).find(user => user.id === id) ?? null
}

/**
 * Formato persistido: scrypt$<salt-base64url>$<hash-base64url>.
 * A senha nunca é armazenada nem incluída no bundle do frontend.
 */
export async function verifyInternalPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, saltEncoded, expectedEncoded] = encodedHash.split('$')
  if (algorithm !== 'scrypt' || !saltEncoded || !expectedEncoded) return false

  try {
    const salt = Buffer.from(saltEncoded, 'base64url')
    const expected = Buffer.from(expectedEncoded, 'base64url')
    if (salt.length < 16 || expected.length !== 64) return false
    const actual = Buffer.from(await scrypt(password, salt, expected.length) as ArrayBuffer)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

/** Utilitário de provisionamento e testes; retorna somente salt + hash. */
export function createInternalPasswordHash(password: string, salt = randomBytes(24)): string {
  const derived = scryptSync(password, salt, 64)
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

export function internalSessionToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7).trim() || null
  return request.cookies?.[INTERNAL_SESSION_COOKIE] ?? null
}

export function resolveInternalSession(
  fastify: FastifyInstance,
  request: FastifyRequest,
): InternalUser | null {
  const token = internalSessionToken(request)
  if (!token) return null

  try {
    const claims = fastify.jwt.verify<InternalSessionClaims>(token)
    if (claims.kind !== 'internal' || !claims.username || !claims.sub) return null
    const user = findInternalUser(claims.username)
    if (!user || user.id !== claims.sub) return null
    return user
  } catch {
    return null
  }
}

export function isInternalAuthPublicPath(method: string, url: string): boolean {
  if (method === 'OPTIONS') return true
  const path = url.split('?')[0]
  if (path === '/api/health') return true
  if (path === '/api/auth/login' || path === '/api/auth/logout') return true
  if (path.startsWith('/api/portal/')) return true
  if (path === '/api/whatsapp/webhook') return true
  if (path.startsWith('/api/webhooks/')) return true
  if (path === '/api/gestao-financeira/webhooks/nfe') return true
  if (path === '/api/integrations/google/callback') return true
  return false
}
