/**
 * AuditLog — append-only para LGPD/segurança.
 *
 * Cada mutação crítica de domínio (create/update/delete em cliente,
 * proposta, dossie, lead) deve emitir um registro aqui. A tabela é PK
 * bigserial — nada de upsert/update, sempre INSERT. Recurso é uma string
 * canônica (`cliente:cli-001`, `proposta:prop-007`).
 *
 * Best-effort: se PG estiver off, o helper é no-op silencioso. Erros de
 * INSERT viram warn (não bloqueiam o caminho de domínio).
 */
import { getDb, isPgEnabled } from './client.js'
import { auditLog as auditLogTable } from './schema.js'

export interface AuditEntry {
  /** Quem agiu: 'system', consultor_id, 'alix:agent_name', etc. */
  ator?: string
  /** Verbo curto: 'create' | 'update' | 'delete' | 'patch' | 'sign' | ... */
  acao: string
  /** Identificador canônico do recurso: 'cliente:cli-001'. */
  recurso: string
  /** Snapshot antes da mutação (opcional). */
  dadosAntes?: unknown
  /** Snapshot depois (opcional). */
  dadosDepois?: unknown
}

export async function audit(entry: AuditEntry): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    await db.insert(auditLogTable).values({
      ator: entry.ator ?? null,
      acao: entry.acao,
      recurso: entry.recurso,
      dadosAntes: (entry.dadosAntes ?? null) as Record<string, unknown> | null,
      dadosDepois: (entry.dadosDepois ?? null) as Record<string, unknown> | null,
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[audit] best-effort fail:', (err as Error).message)
  }
}

/** Mais um helper "fire-and-forget" para não fazer void everywhere no caller. */
export function auditAsync(entry: AuditEntry): void {
  void audit(entry)
}
