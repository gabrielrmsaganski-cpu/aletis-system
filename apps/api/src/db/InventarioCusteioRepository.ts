/**
 * Wave-PG-16 — InventarioRepository + CusteioRepository.
 *
 * Inventario: 1 linha por cliente (PK clienteId), payload JSONB
 * com array `ativos` completo + resumo agregado.
 *
 * PlanoCusteio: id PK; safra (YYYY/AB), status, payload completo.
 *
 * Dual-write best-effort: erros viram warn, hot-path inalterado.
 */
import { eq, sql } from 'drizzle-orm'
import { getDb, isPgEnabled } from './client.js'
import { inventarioCliente, planoCusteio } from './schema.js'

interface InventarioLike {
  clienteId: string
  atualizadoEm?: string
  ativos?: Array<{ valor?: number; status?: string; [k: string]: unknown }>
  resumo?: { valorTotal?: number; [k: string]: unknown }
  [k: string]: unknown
}

interface PlanoCusteioLike {
  id: string
  clienteId?: string
  safra?: string
  status?: string
  valorTotal?: number
  [k: string]: unknown
}

/* ── Inventario ─────────────────────────────────────────── */
export async function upsertInventario(inv: InventarioLike): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    const ativosArr = Array.isArray(inv.ativos) ? inv.ativos : []
    const totalAtivos = ativosArr.filter((a) => a.status === 'ativo').length
    const valorTotal = inv.resumo?.valorTotal
    const row = {
      clienteId: inv.clienteId,
      atualizadoEm: inv.atualizadoEm ? new Date(inv.atualizadoEm) : new Date(),
      totalAtivos,
      valorTotal: valorTotal != null ? String(valorTotal) : null,
      payload: inv as unknown as Record<string, unknown>,
    }
    await db.insert(inventarioCliente).values(row).onConflictDoUpdate({
      target: inventarioCliente.clienteId,
      set: {
        atualizadoEm: row.atualizadoEm,
        totalAtivos: row.totalAtivos,
        valorTotal: row.valorTotal,
        payload: row.payload,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[InventarioRepo.upsert] fail:', (err as Error).message)
  }
}

export async function getInventario(clienteId: string): Promise<InventarioLike | null> {
  if (!isPgEnabled()) return null
  try {
    const db = getDb()
    const rows = await db.select().from(inventarioCliente).where(eq(inventarioCliente.clienteId, clienteId)).limit(1)
    return rows.length === 0 ? null : (rows[0].payload as InventarioLike)
  } catch {
    return null
  }
}

export async function deleteInventario(clienteId: string): Promise<void> {
  if (!isPgEnabled()) return
  try { await getDb().delete(inventarioCliente).where(eq(inventarioCliente.clienteId, clienteId)) } catch { /* ignore */ }
}

export async function countInventarios(): Promise<number> {
  if (!isPgEnabled()) return 0
  try {
    const r = await getDb().select({ n: sql<number>`count(*)::int` }).from(inventarioCliente)
    return r[0]?.n ?? 0
  } catch {
    return 0
  }
}

/* ── PlanoCusteio ────────────────────────────────────────── */
export async function upsertPlanoCusteio(p: PlanoCusteioLike): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    const row = {
      id: p.id,
      clienteId: p.clienteId ?? null,
      safra: p.safra ?? null,
      status: p.status ?? 'rascunho',
      valorTotal: p.valorTotal != null ? String(p.valorTotal) : null,
      payload: p as unknown as Record<string, unknown>,
      atualizadoEm: new Date(),
    }
    await db.insert(planoCusteio).values(row).onConflictDoUpdate({
      target: planoCusteio.id,
      set: {
        clienteId: row.clienteId,
        safra: row.safra,
        status: row.status,
        valorTotal: row.valorTotal,
        payload: row.payload,
        atualizadoEm: row.atualizadoEm,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[PlanoCusteioRepo.upsert] fail:', (err as Error).message)
  }
}

export async function listPlanosCusteio(opts?: {
  clienteId?: string
  safra?: string
  status?: string
}): Promise<Array<Record<string, unknown>>> {
  if (!isPgEnabled()) return []
  try {
    const db = getDb()
    let q = db.select().from(planoCusteio).$dynamic()
    if (opts?.clienteId) q = q.where(eq(planoCusteio.clienteId, opts.clienteId))
    return await q
  } catch {
    return []
  }
}

export async function deletePlanoCusteio(id: string): Promise<void> {
  if (!isPgEnabled()) return
  try { await getDb().delete(planoCusteio).where(eq(planoCusteio.id, id)) } catch { /* ignore */ }
}

export async function countPlanosCusteio(): Promise<number> {
  if (!isPgEnabled()) return 0
  try {
    const r = await getDb().select({ n: sql<number>`count(*)::int` }).from(planoCusteio)
    return r[0]?.n ?? 0
  } catch {
    return 0
  }
}
