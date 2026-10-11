import type { AlixUser } from '../../middleware/alixAuth.js'
import { getSessionAccess, getSessionsAccess, type AlixSessionAccess } from '../../db/AlixSessionRepository.js'

/** O bypass anterior fica limitado aos testes/dev que desligam autenticação. */
export function isAlixAccessEnforced(user: AlixUser | undefined): boolean {
  return process.env.ALETIS_INTERNAL_AUTH_ENABLED !== '0'
    || (process.env.ALIX_AUTH_STRICT || '').toLowerCase() === 'true'
    || Boolean(user && user.id !== 'anonymous')
}

export function isAlixAdmin(user: AlixUser | undefined): boolean {
  return Boolean(user && user.id !== 'anonymous' && ['admin_master', 'admin', 'master'].includes(String(user.role || '').toLowerCase()))
}

export function alixOwnerIds(user: AlixUser | undefined): string[] {
  if (!user || user.id === 'anonymous') return []
  return [...new Set([user.id, user.sub, user.consultorId].filter((id): id is string => Boolean(id && !['anonymous', 'unknown'].includes(id))))]
}

export function canAccessAlixOwner(user: AlixUser | undefined, ownerId?: string | null): boolean {
  if (!isAlixAccessEnforced(user) || isAlixAdmin(user)) return true
  // Históricos sem proprietário não são atribuídos ao primeiro visitante.
  return Boolean(ownerId && alixOwnerIds(user).includes(ownerId))
}

/** Compatibilidade deliberada: somente IDs históricos e identidade interna. */
export function isAlixLegacySharedSession(user: AlixUser | undefined, session: AlixSessionAccess): boolean {
  if (user?.authSource !== 'internal' || session.consultorId) return false
  const ids = (process.env.ALIX_LEGACY_SHARED_SESSION_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
  return ids.includes(session.id)
}

export function canAccessAlixSession(user: AlixUser | undefined, session: AlixSessionAccess): boolean {
  return canAccessAlixOwner(user, session.consultorId) || isAlixLegacySharedSession(user, session)
}

export async function accessibleLegacySharedSessionIds(user: AlixUser | undefined): Promise<string[]> {
  if (user?.authSource !== 'internal') return []
  const ids = [...new Set((process.env.ALIX_LEGACY_SHARED_SESSION_IDS || '').split(',').map(id => id.trim()).filter(id => /^[A-Za-z0-9_-]{1,180}$/.test(id)))]
  const sessions = await getSessionsAccess(ids)
  return sessions.filter(session => isAlixLegacySharedSession(user, session)).map(session => session.id)
}

export function alixAccessError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode })
}

export async function assertAlixSessionAccess(user: AlixUser | undefined, sessionId: string): Promise<AlixSessionAccess & { legacyShared?: boolean }> {
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,180}$/.test(sessionId)) {
    throw alixAccessError(400, 'Identificador de sessão inválido.')
  }
  const session = await getSessionAccess(sessionId)
  if (!session || !canAccessAlixSession(user, session)) {
    // A mesma resposta não revela a existência de conversa de outro consultor.
    throw alixAccessError(404, 'Sessão não encontrada ou indisponível para este usuário.')
  }
  return { ...session, ...(isAlixLegacySharedSession(user, session) ? { legacyShared: true } : {}) }
}

export async function filterAlixSessions<T extends { id: string }>(user: AlixUser | undefined, rows: T[]): Promise<Array<T & { legacyShared?: boolean }>> {
  if (!isAlixAccessEnforced(user)) return rows
  // Mesmo a listagem consulta a fonte de autorização, sem herdar fallback do cache.
  const sessions = new Map((await getSessionsAccess(rows.map(row => row.id))).map(session => [session.id, session]))
  const result = rows.map(row => {
    const session = sessions.get(row.id)
    return session && canAccessAlixSession(user, session)
      ? { ...row, ...(isAlixLegacySharedSession(user, session) ? { legacyShared: true } : {}) } : null
  })
  return result.filter((row): row is T & { legacyShared?: boolean } => row !== null)
}

export async function filterAlixSessionResources<T extends { sessionId?: string }>(user: AlixUser | undefined, rows: T[]): Promise<T[]> {
  if (!isAlixAccessEnforced(user) || isAlixAdmin(user)) return rows
  const ids = rows.map(row => row.sessionId).filter((id): id is string => Boolean(id))
  const sessions = new Map((await getSessionsAccess(ids)).map(session => [session.id, session]))
  const visible = rows.map(row => {
    if (!row.sessionId) return false
    const resolved = sessions.get(row.sessionId)
    return Boolean(resolved && canAccessAlixSession(user, resolved))
  })
  return rows.filter((_row, index) => visible[index])
}
