/**
 * AlixSessionRepository — dual-write best-effort para Postgres.
 *
 * O OrchestratorService continua escrevendo arquivos em
 * `storage/alix-sessions/{id}.json` (rápido, sem lock); este módulo
 * espelha sessão+mensagens no PG para queryability + restart-safety
 * (sem precisar restaurar 80+ arquivos no boot).
 *
 * Estratégia:
 *   - Sessão: UPSERT em `alix_session` por id (titulo, atualizadoEm)
 *   - Mensagens: INSERT na `alix_message` com `id` único (idempotente
 *     com ON CONFLICT DO NOTHING — re-saves de uma sessão crescente
 *     não duplicam mensagens).
 *
 * Tudo best-effort: erro de PG vira warn; arquivo continua sendo
 * source-of-truth runtime.
 */
import { eq } from 'drizzle-orm'
import { getDb, isPgEnabled } from './client.js'
import { alixSession as sessionTable, alixMessage as messageTable } from './schema.js'

export interface SessionLike {
  id: string
  title?: string
  consultorId?: string
  clienteId?: string
  createdAt?: number | string
  updatedAt?: number | string
  messages?: Array<{
    id: string
    role: string
    content: string
    timestamp?: number | string
    [key: string]: unknown
  }>
}

const toDate = (v: number | string | undefined): Date => {
  if (!v) return new Date()
  if (typeof v === 'number') return new Date(v)
  const d = new Date(v)
  return isNaN(d.getTime()) ? new Date() : d
}

export async function upsertSession(s: SessionLike): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    const now = new Date()
    await db
      .insert(sessionTable)
      .values({
        id: s.id,
        consultorId: s.consultorId ?? null,
        clienteId: s.clienteId ?? null,
        titulo: s.title ?? 'Nova conversa',
        criadoEm: toDate(s.createdAt),
        atualizadoEm: toDate(s.updatedAt) || now,
      })
      .onConflictDoUpdate({
        target: sessionTable.id,
        set: {
          titulo: s.title ?? 'Nova conversa',
          consultorId: s.consultorId ?? null,
          clienteId: s.clienteId ?? null,
          atualizadoEm: now,
        },
      })

    if (s.messages && s.messages.length > 0) {
      // Insere TODAS as mensagens; ON CONFLICT (id) DO NOTHING torna
      // re-saves idempotentes (mensagens antigas não viram update).
      const rows = s.messages.map((m) => ({
        id: m.id,
        sessionId: s.id,
        role: m.role,
        content: m.content,
        criadoEm: toDate(m.timestamp),
      }))
      await db.insert(messageTable).values(rows).onConflictDoNothing({ target: messageTable.id })
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[AlixSessionRepo.upsert] best-effort fail:', (err as Error).message)
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    // Apaga mensagens primeiro (sem FK no schema, ordem por convenção).
    await db.delete(messageTable).where(eq(messageTable.sessionId, sessionId))
    await db.delete(sessionTable).where(eq(sessionTable.id, sessionId))
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[AlixSessionRepo.delete] fail:', (err as Error).message)
  }
}

export async function countSessions(): Promise<number> {
  if (!isPgEnabled()) return 0
  try {
    const db = getDb()
    const r = await db.select().from(sessionTable)
    return r.length
  } catch {
    return 0
  }
}
