export type AletisRole =
  | 'admin_master'
  | 'gestor'
  | 'consultor'
  | 'operacional'
  | 'cliente_externo'

export type ClientAction =
  | 'read'
  | 'write'
  | 'delete'
  | 'document:read'
  | 'document:write'
  | 'ai:ask'
  | 'automation:emit'

export interface AletisActor {
  id: string
  nome: string
  email?: string
  consultorId?: string
  role: AletisRole
  clienteId?: string
}

export interface PermissionDecision {
  allowed: boolean
  reason: string
  strict: boolean
  source: 'role' | 'assignment' | 'permission' | 'compat' | 'denied'
}

export interface ClientContextSnapshot {
  id: string
  nome?: string
  consultor?: string
  estagio?: string
  [key: string]: unknown
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function cleanText(value: unknown, max = 2000): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 3)).trim()}...`
}

export function toDateOrNull(value: unknown): Date | null {
  if (!value) return null
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d
}
