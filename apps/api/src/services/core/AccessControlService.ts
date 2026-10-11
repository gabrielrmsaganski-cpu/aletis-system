import type { FastifyRequest } from 'fastify'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb, isPgEnabled } from '../../db/client.js'
import { clientPermission } from '../../db/schema.js'
import type { AletisActor, ClientAction, ClientContextSnapshot, PermissionDecision } from './CoreTypes.js'

const STRICT = () => (process.env.ALETIS_RBAC_STRICT || '').toLowerCase() === 'true'

const ROLE_ALLOW_ALL = new Set(['admin_master'])
const GESTOR_ROLES = new Set(['gestor'])

function normalizeRole(value: unknown): AletisActor['role'] {
  const role = String(value ?? '').toLowerCase()
  if (role === 'admin' || role === 'admin_master' || role === 'master') return 'admin_master'
  if (role === 'gestor' || role === 'manager') return 'gestor'
  if (role === 'operacional' || role === 'operation') return 'operacional'
  if (role === 'cliente' || role === 'cliente_externo') return 'cliente_externo'
  return 'consultor'
}

function roleAllows(role: string, action: ClientAction): boolean {
  if (ROLE_ALLOW_ALL.has(role)) return true
  if (GESTOR_ROLES.has(role)) return action !== 'delete'
  if (role === 'consultor') return action !== 'delete'
  if (role === 'operacional') return action === 'read' || action === 'document:read' || action === 'document:write'
  if (role === 'cliente_externo') return action === 'read' || action === 'document:read'
  return false
}

function permissionAllows(permissions: string[] | null | undefined, action: ClientAction): boolean {
  if (!permissions?.length) return false
  return permissions.includes('*') || permissions.includes(action)
}

export function actorFromRequest(request: FastifyRequest): AletisActor {
  const user = (request as any).alixUser ?? (request as any).user ?? {}
  const role = normalizeRole(user.role ?? user.perfil ?? request.headers['x-aletis-role'])
  return {
    id: String(user.id ?? user.sub ?? request.headers['x-user-id'] ?? 'consultor-001'),
    nome: String(user.nome ?? user.name ?? request.headers['x-user-name'] ?? 'Christian Kohler'),
    email: user.email,
    consultorId: String(user.consultorId ?? user.sub ?? user.id ?? 'consultor-001'),
    role,
    clienteId: user.clienteId,
  }
}

export class AccessControlService {
  async canAccessCliente(params: {
    actor: AletisActor
    clienteId: string
    action: ClientAction
    cliente?: ClientContextSnapshot | null
  }): Promise<PermissionDecision> {
    const strict = STRICT()
    const { actor, clienteId, action, cliente } = params

    if (ROLE_ALLOW_ALL.has(actor.role)) {
      return { allowed: true, reason: 'Admin Master possui acesso global.', strict, source: 'role' }
    }

    if (actor.role === 'cliente_externo') {
      const allowed = actor.clienteId === clienteId && roleAllows(actor.role, action)
      return {
        allowed,
        reason: allowed ? 'Cliente externo acessa apenas o próprio cadastro.' : 'Cliente externo sem permissão para este cliente.',
        strict,
        source: allowed ? 'assignment' : 'denied',
      }
    }

    if (cliente?.consultor && actor.nome && String(cliente.consultor).toLowerCase() === actor.nome.toLowerCase()) {
      return {
        allowed: roleAllows(actor.role, action),
        reason: 'Consultor responsável pelo cliente.',
        strict,
        source: 'assignment',
      }
    }

    if (isPgEnabled()) {
      try {
        const db = getDb()
        const rows = await db
          .select()
          .from(clientPermission)
          .where(and(eq(clientPermission.clienteId, clienteId), eq(clientPermission.userId, actor.id), isNull(clientPermission.revokedAt)))
          .limit(1)
        const row = rows[0]
        if (row && (roleAllows(row.role, action) || permissionAllows(row.permissions, action))) {
          return { allowed: true, reason: 'Permissão explícita vinculada ao cliente.', strict, source: 'permission' }
        }
      } catch (err) {
        if (strict) {
          return {
            allowed: false,
            reason: `Falha ao validar permissão no banco: ${(err as Error).message}`,
            strict,
            source: 'denied',
          }
        }
      }
    }

    if (!strict && roleAllows(actor.role, action)) {
      return {
        allowed: true,
        reason: 'Modo compatibilidade: RBAC estrito desligado.',
        strict,
        source: 'compat',
      }
    }

    return { allowed: false, reason: 'Usuário sem permissão para esta ação.', strict, source: 'denied' }
  }

  async assertClienteAccess(params: {
    actor: AletisActor
    clienteId: string
    action: ClientAction
    cliente?: ClientContextSnapshot | null
  }): Promise<PermissionDecision> {
    const decision = await this.canAccessCliente(params)
    if (!decision.allowed) {
      const err = new Error(decision.reason) as Error & { statusCode?: number }
      err.statusCode = 403
      throw err
    }
    return decision
  }
}

let singleton: AccessControlService | null = null

export function getAccessControlService(): AccessControlService {
  if (!singleton) singleton = new AccessControlService()
  return singleton
}
