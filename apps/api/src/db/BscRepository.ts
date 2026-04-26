/**
 * BscRepository — append-only no PG (espelha o JSONL de disco).
 *
 * BscService.snapshot() escreve em `storage/bsc/{clienteId}.jsonl`
 * (append-only por design — histórico imutável de KPIs por cliente).
 * Este repo registra o mesmo record na tabela `bsc_snapshot` quando
 * ALETIS_PG_ENABLED=1 — habilitando queries SQL por cliente, status,
 * período e tendências cross-clientes.
 */
import { sql, eq, desc, and, gte } from 'drizzle-orm'
import { getDb, isPgEnabled } from './client.js'
import { bscSnapshot } from './schema.js'

interface BscSnapshotLike {
  clienteId: string
  calculadoEm: string
  resultado?: {
    statusGeral?: string | null
    notaGlobal?: number | null
    [k: string]: unknown
  }
  contexto?: unknown
  [k: string]: unknown
}

export async function appendBscSnapshot(rec: BscSnapshotLike): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    await db.insert(bscSnapshot).values({
      clienteId: rec.clienteId,
      calculadoEm: new Date(rec.calculadoEm),
      statusGeral: rec.resultado?.statusGeral ?? null,
      notaGlobal: rec.resultado?.notaGlobal != null ? String(rec.resultado.notaGlobal) : null,
      payload: rec as unknown as Record<string, unknown>,
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[BscRepo.append] best-effort fail:', (err as Error).message)
  }
}

export async function listBscSnapshots(opts: {
  clienteId?: string
  desde?: string
  limit?: number
}): Promise<Array<Record<string, unknown>>> {
  if (!isPgEnabled()) return []
  try {
    const db = getDb()
    const conds = [] as ReturnType<typeof eq>[]
    if (opts.clienteId) conds.push(eq(bscSnapshot.clienteId, opts.clienteId))
    if (opts.desde) conds.push(gte(bscSnapshot.calculadoEm, new Date(opts.desde)))
    const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds)
    const limit = Math.min(Math.max(1, opts.limit ?? 50), 500)
    const q = where
      ? db.select().from(bscSnapshot).where(where).orderBy(desc(bscSnapshot.calculadoEm)).limit(limit)
      : db.select().from(bscSnapshot).orderBy(desc(bscSnapshot.calculadoEm)).limit(limit)
    return await q
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[BscRepo.list] fail:', (err as Error).message)
    return []
  }
}

export async function countBscSnapshots(): Promise<number> {
  if (!isPgEnabled()) return 0
  try {
    const db = getDb()
    const r = await db.select({ n: sql<number>`count(*)::int` }).from(bscSnapshot)
    return r[0]?.n ?? 0
  } catch {
    return 0
  }
}

/** Resumo por status (smoke). */
export async function bscStatusCounts(): Promise<Array<{ statusGeral: string | null; n: number }>> {
  if (!isPgEnabled()) return []
  try {
    const db = getDb()
    const rows = await db
      .select({ statusGeral: bscSnapshot.statusGeral, n: sql<number>`count(*)::int` })
      .from(bscSnapshot)
      .groupBy(bscSnapshot.statusGeral)
    return rows
  } catch {
    return []
  }
}
