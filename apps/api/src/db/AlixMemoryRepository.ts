/**
 * AlixMemoryRepository — dual-write best-effort.
 *
 * Memória ALIX hoje é arquivo Markdown por cliente em
 * apps/api/storage/alix-memory/{clienteId}.md (estrutura serializada
 * de MemoriaCliente). Este módulo espelha em PG quando ALETIS_PG_ENABLED=1
 * — JSONB completa preserva ordem de proximasAcoes, alertas, etc.
 *
 * Insights diários (alix_insight) são append-only por dia + cliente,
 * usados pela ProactiveService.
 */
import { eq, sql, desc, and, gte } from 'drizzle-orm'
import { getDb, isPgEnabled } from './client.js'
import { alixMemory, alixInsight } from './schema.js'

interface MemoriaLike {
  clienteId: string
  clienteNome: string
  atualizadoEm: string
  [k: string]: unknown
}

/* ── Memória estruturada ────────────────────────────────── */
export async function upsertAlixMemory(m: MemoriaLike): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    const row = {
      clienteId: m.clienteId,
      clienteNome: m.clienteNome,
      atualizadoEm: new Date(m.atualizadoEm || Date.now()),
      payload: m as unknown as Record<string, unknown>,
    }
    await db.insert(alixMemory).values(row).onConflictDoUpdate({
      target: alixMemory.clienteId,
      set: {
        clienteNome: row.clienteNome,
        atualizadoEm: row.atualizadoEm,
        payload: row.payload,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[AlixMemoryRepo.upsert] fail:', (err as Error).message)
  }
}

export async function getAlixMemory(clienteId: string): Promise<MemoriaLike | null> {
  if (!isPgEnabled()) return null
  try {
    const db = getDb()
    const rows = await db.select().from(alixMemory).where(eq(alixMemory.clienteId, clienteId)).limit(1)
    if (rows.length === 0) return null
    return rows[0].payload as MemoriaLike
  } catch {
    return null
  }
}

export async function deleteAlixMemory(clienteId: string): Promise<void> {
  if (!isPgEnabled()) return
  try {
    await getDb().delete(alixMemory).where(eq(alixMemory.clienteId, clienteId))
  } catch {
    /* ignore */
  }
}

export async function countAlixMemory(): Promise<number> {
  if (!isPgEnabled()) return 0
  try {
    const db = getDb()
    const r = await db.select({ n: sql<number>`count(*)::int` }).from(alixMemory)
    return r[0]?.n ?? 0
  } catch {
    return 0
  }
}

/* ── Insights diários ────────────────────────────────────── */
interface InsightLike {
  dia: string // YYYY-MM-DD
  clienteId?: string
  tipo: string
  severidade?: string
  titulo: string
  detalhe?: string
  [k: string]: unknown
}

export async function appendAlixInsight(i: InsightLike): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    await db.insert(alixInsight).values({
      dia: i.dia,
      clienteId: i.clienteId ?? null,
      tipo: i.tipo,
      severidade: i.severidade ?? null,
      titulo: i.titulo,
      detalhe: i.detalhe ?? null,
      payload: i as unknown as Record<string, unknown>,
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[AlixInsightRepo.append] fail:', (err as Error).message)
  }
}

export async function listAlixInsights(opts?: {
  desde?: string
  clienteId?: string
  tipo?: string
  limit?: number
}): Promise<Array<Record<string, unknown>>> {
  if (!isPgEnabled()) return []
  try {
    const db = getDb()
    const conds = [] as ReturnType<typeof eq>[]
    if (opts?.desde) conds.push(gte(alixInsight.dia, opts.desde))
    if (opts?.clienteId) conds.push(eq(alixInsight.clienteId, opts.clienteId))
    if (opts?.tipo) conds.push(eq(alixInsight.tipo, opts.tipo))
    const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds)
    const limit = Math.min(Math.max(1, opts?.limit ?? 100), 1000)
    const q = where
      ? db.select().from(alixInsight).where(where).orderBy(desc(alixInsight.id)).limit(limit)
      : db.select().from(alixInsight).orderBy(desc(alixInsight.id)).limit(limit)
    const rows = await q
    return rows
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[AlixInsightRepo.list] fail:', (err as Error).message)
    return []
  }
}

export async function countAlixInsights(): Promise<number> {
  if (!isPgEnabled()) return 0
  try {
    const db = getDb()
    const r = await db.select({ n: sql<number>`count(*)::int` }).from(alixInsight)
    return r[0]?.n ?? 0
  } catch {
    return 0
  }
}
