/**
 * AlixConfirmationFeedbackRepository — dual-write best-effort para PG.
 *
 * Cobre 2 entidades operacionais da Alix:
 *  - alix_confirmation: pendings + batches de confirmação (TTL via expiraEm)
 *  - alix_feedback: NPS / thumbs em respostas geradas
 *
 * Em runtime, a fonte de verdade continua sendo o disco
 * (storage/alix-confirmations/snapshot.json + alix-feedback/{YYYY-MM}.jsonl).
 * Este módulo espelha em PG quando ALETIS_PG_ENABLED=1, habilitando:
 *  - SELECT por session, status, rating
 *  - Aggregação cross-meses sem juntar arquivos
 *  - GC de confirmações expiradas via WHERE expira_em < now()
 */
import { eq, and, sql, desc, gte } from 'drizzle-orm'
import { getDb, isPgEnabled } from './client.js'
import { alixConfirmation, alixFeedback } from './schema.js'

interface ConfirmationLike {
  id: string
  sessionId?: string
  status?: string // 'pending'|'approved'|'rejected'|'expired'
  expiraEm?: number | string
  [k: string]: unknown
}

interface BatchLike {
  id: string
  sessionId?: string
  status?: string
  expiraEm?: number | string
  [k: string]: unknown
}

interface FeedbackLike {
  ts?: string
  sessionId?: string
  messageId?: string
  rating?: string
  motivo?: string
  comentario?: string
  [k: string]: unknown
}

function toDateOpt(v: number | string | undefined): Date | null {
  if (v == null) return null
  const d = typeof v === 'number' ? new Date(v) : new Date(v)
  return isNaN(d.getTime()) ? null : d
}

/* ── Confirmations ──────────────────────────────────────── */
export async function upsertConfirmation(c: ConfirmationLike, tipo: 'pending' | 'batch'): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    const row = {
      id: c.id,
      sessionId: c.sessionId ?? null,
      tipo,
      status: c.status ?? 'pending',
      expiraEm: toDateOpt(c.expiraEm),
      payload: c as unknown as Record<string, unknown>,
      atualizadoEm: new Date(),
    }
    await db.insert(alixConfirmation).values(row).onConflictDoUpdate({
      target: alixConfirmation.id,
      set: {
        sessionId: row.sessionId,
        tipo: row.tipo,
        status: row.status,
        expiraEm: row.expiraEm,
        payload: row.payload,
        atualizadoEm: row.atualizadoEm,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[AlixConfirmationRepo.upsert] fail:', (err as Error).message)
  }
}

/** Dump completo do snapshot (pendings + batches) — espelha o JSON em disco. */
export async function dumpConfirmations(opts: {
  pendings: Iterable<ConfirmationLike>
  batches: Iterable<BatchLike>
}): Promise<{ written: number }> {
  if (!isPgEnabled()) return { written: 0 }
  let n = 0
  for (const p of opts.pendings) {
    await upsertConfirmation(p, 'pending'); n++
  }
  for (const b of opts.batches) {
    await upsertConfirmation(b as ConfirmationLike, 'batch'); n++
  }
  return { written: n }
}

export async function listConfirmations(opts?: {
  sessionId?: string
  status?: string
  limit?: number
}): Promise<Array<Record<string, unknown>>> {
  if (!isPgEnabled()) return []
  try {
    const db = getDb()
    const conds = [] as ReturnType<typeof eq>[]
    if (opts?.sessionId) conds.push(eq(alixConfirmation.sessionId, opts.sessionId))
    if (opts?.status) conds.push(eq(alixConfirmation.status, opts.status))
    const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds)
    const limit = Math.min(Math.max(1, opts?.limit ?? 100), 500)
    const q = where
      ? db.select().from(alixConfirmation).where(where).orderBy(desc(alixConfirmation.criadoEm)).limit(limit)
      : db.select().from(alixConfirmation).orderBy(desc(alixConfirmation.criadoEm)).limit(limit)
    return await q
  } catch {
    return []
  }
}

export async function deleteConfirmation(id: string): Promise<void> {
  if (!isPgEnabled()) return
  try { await getDb().delete(alixConfirmation).where(eq(alixConfirmation.id, id)) } catch { /* ignore */ }
}

export async function countConfirmations(): Promise<number> {
  if (!isPgEnabled()) return 0
  try {
    const db = getDb()
    const r = await db.select({ n: sql<number>`count(*)::int` }).from(alixConfirmation)
    return r[0]?.n ?? 0
  } catch {
    return 0
  }
}

/* ── Feedback ────────────────────────────────────────────── */
export async function appendFeedback(f: FeedbackLike): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    await db.insert(alixFeedback).values({
      sessionId: f.sessionId ?? null,
      messageId: f.messageId ?? null,
      rating: f.rating ?? null,
      motivo: f.motivo ?? null,
      comentario: f.comentario ?? null,
      payload: f as unknown as Record<string, unknown>,
      criadoEm: f.ts ? new Date(f.ts) : new Date(),
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[AlixFeedbackRepo.append] fail:', (err as Error).message)
  }
}

export async function listFeedback(opts?: {
  sessionId?: string
  rating?: string
  desde?: string
  limit?: number
}): Promise<Array<Record<string, unknown>>> {
  if (!isPgEnabled()) return []
  try {
    const db = getDb()
    const conds = [] as ReturnType<typeof eq>[]
    if (opts?.sessionId) conds.push(eq(alixFeedback.sessionId, opts.sessionId))
    if (opts?.rating) conds.push(eq(alixFeedback.rating, opts.rating))
    if (opts?.desde) conds.push(gte(alixFeedback.criadoEm, new Date(opts.desde)))
    const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds)
    const limit = Math.min(Math.max(1, opts?.limit ?? 100), 1000)
    const q = where
      ? db.select().from(alixFeedback).where(where).orderBy(desc(alixFeedback.id)).limit(limit)
      : db.select().from(alixFeedback).orderBy(desc(alixFeedback.id)).limit(limit)
    return await q
  } catch {
    return []
  }
}

export async function feedbackStats(): Promise<{ total: number; positive: number; negative: number; neutral: number }> {
  const out = { total: 0, positive: 0, negative: 0, neutral: 0 }
  if (!isPgEnabled()) return out
  try {
    const db = getDb()
    const rows = await db
      .select({ rating: alixFeedback.rating, n: sql<number>`count(*)::int` })
      .from(alixFeedback)
      .groupBy(alixFeedback.rating)
    for (const r of rows) {
      out.total += r.n
      if (r.rating === 'positive') out.positive = r.n
      else if (r.rating === 'negative') out.negative = r.n
      else if (r.rating === 'neutral') out.neutral = r.n
    }
  } catch {
    /* ignore */
  }
  return out
}
