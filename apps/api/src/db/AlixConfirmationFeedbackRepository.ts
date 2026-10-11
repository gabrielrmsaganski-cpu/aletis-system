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
  id?: string
  batchId?: string
  sessionId?: string
  status?: string // 'pending'|'approved'|'rejected'|'expired'
  expiraEm?: number | string
  expiresAt?: number | string
  [k: string]: unknown
}

interface BatchLike {
  id?: string
  batchId?: string
  sessionId?: string
  status?: string
  expiraEm?: number | string
  expiresAt?: number | string
  [k: string]: unknown
}

interface FeedbackLike {
  ts?: string
  sessionId?: string
  messageId?: string
  msgId?: string
  rating?: string
  motivo?: string
  reason?: string
  comentario?: string
  notas?: string
  clienteId?: string
  missionId?: string
  notebookId?: string
  artifactId?: string
  category?: string
  responseExcerpt?: string
  expectedCorrection?: string
  triageStatus?: string
  priority?: string
  [k: string]: unknown
}

function toDateOpt(v: number | string | undefined): Date | null {
  if (v == null) return null
  const d = typeof v === 'number' ? new Date(v) : new Date(v)
  return isNaN(d.getTime()) ? null : d
}

function resolveConfirmationId(c: ConfirmationLike, tipo: 'pending' | 'batch'): string | null {
  const id = tipo === 'batch' ? c.batchId ?? c.id : c.id ?? c.batchId
  const normalized = String(id ?? '').trim()
  return normalized || null
}

function resolveExpiry(c: ConfirmationLike): number | string | undefined {
  if (c.expiraEm != null) return c.expiraEm
  if (c.expiresAt != null) return c.expiresAt
  const pendings = Array.isArray(c.pendings) ? c.pendings : []
  const expirations = pendings
    .map((p) => (p && typeof p === 'object' ? (p as { expiresAt?: unknown; expiraEm?: unknown }).expiresAt ?? (p as { expiraEm?: unknown }).expiraEm : undefined))
    .map((v) => (typeof v === 'number' || typeof v === 'string' ? toDateOpt(v)?.getTime() : undefined))
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  return expirations.length > 0 ? Math.max(...expirations) : undefined
}

/* ── Confirmations ──────────────────────────────────────── */
export async function upsertConfirmation(c: ConfirmationLike, tipo: 'pending' | 'batch'): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    const id = resolveConfirmationId(c, tipo)
    if (!id) throw new Error(`Confirmação ${tipo} sem id/batchId`)
    const row = {
      id,
      sessionId: c.sessionId ?? null,
      tipo,
      status: c.status ?? 'pending',
      expiraEm: toDateOpt(resolveExpiry(c)),
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
export async function appendFeedback(f: FeedbackLike): Promise<number | null> {
  if (!isPgEnabled()) return null
  try {
    const db = getDb()
    const inserted = await db.insert(alixFeedback).values({
      sessionId: f.sessionId ?? null,
      messageId: f.messageId ?? f.msgId ?? null,
      clienteId: f.clienteId ?? null,
      missionId: f.missionId ?? null,
      notebookId: f.notebookId ?? null,
      artifactId: f.artifactId ?? null,
      rating: f.rating ?? null,
      motivo: f.motivo ?? f.reason ?? null,
      comentario: f.comentario ?? f.notas ?? null,
      category: f.category ?? null,
      responseExcerpt: f.responseExcerpt ?? null,
      expectedCorrection: f.expectedCorrection ?? null,
      triageStatus: f.triageStatus ?? 'unreviewed',
      priority: f.priority ?? 'normal',
      payload: f as unknown as Record<string, unknown>,
      criadoEm: f.ts ? new Date(f.ts) : new Date(),
    }).returning({ id: alixFeedback.id })
    return inserted[0]?.id ?? null
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[AlixFeedbackRepo.append] fail:', (err as Error).message)
    return null
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

export interface FeedbackStats {
  total: number
  /** Compat: positive/negative/neutral (3 buckets canônicos). */
  positive: number
  negative: number
  neutral: number
  /** Distribuição completa por rating (qualquer string, mantém ordem desc). */
  porRating: Array<{ rating: string | null; n: number }>
}

const POSITIVE_RATINGS = new Set(['positive', 'positivo', 'util', 'útil', 'thumbs-up'])
const NEGATIVE_RATINGS = new Set(['negative', 'negativo', 'incompleta', 'incorreto', 'irrelevante', 'off-tom', 'thumbs-down'])

export async function feedbackStats(): Promise<FeedbackStats> {
  const out: FeedbackStats = {
    total: 0,
    positive: 0,
    negative: 0,
    neutral: 0,
    porRating: [],
  }
  if (!isPgEnabled()) return out
  try {
    const db = getDb()
    const rows = await db
      .select({ rating: alixFeedback.rating, n: sql<number>`count(*)::int` })
      .from(alixFeedback)
      .groupBy(alixFeedback.rating)
    out.porRating = rows
      .map((r) => ({ rating: r.rating, n: r.n }))
      .sort((a, b) => b.n - a.n)
    for (const r of out.porRating) {
      out.total += r.n
      const k = (r.rating ?? '').toLowerCase()
      if (POSITIVE_RATINGS.has(k)) out.positive += r.n
      else if (NEGATIVE_RATINGS.has(k)) out.negative += r.n
      else out.neutral += r.n
    }
  } catch {
    /* ignore */
  }
  return out
}
