/**
 * LeadPgfnRepository — espelha o índice em memória (PGFNSource) no Postgres
 * para consultas SQL ad-hoc, BI e queries que exigem JOIN com cliente.
 *
 * O índice em RAM (94MB JSON) continua sendo source-of-truth para hot-path
 * (responsável por `/api/prospeccao/buscar` que busca por nome/UF). Este
 * repositório é populado por uma migração one-shot (script) e mantido
 * sincronizado pelo `ingest-pgfn.ts` no fim do refresh.
 */
import { eq, and, gte, sql } from 'drizzle-orm'
import { getDb, isPgEnabled } from './client.js'
import { leadPgfn as leadPgfnTable } from './schema.js'

export interface LeadPgfnRow {
  cnpjCpf: string
  nome?: string
  uf?: string
  areaEstimadaHa?: number
  totalDivida?: number
  inscricoesCount?: number
  ajuizado?: boolean
  passivoAcelerando?: boolean
  agroScore?: number
  sinais?: string[]
  payload?: unknown
}

/** Insert/upsert em lote — único path. ON CONFLICT (cnpj_cpf) = UPDATE. */
export async function upsertLeadsBatch(
  rows: LeadPgfnRow[],
  chunkSize = 1000,
): Promise<{ written: number; chunks: number }> {
  if (!isPgEnabled() || rows.length === 0) return { written: 0, chunks: 0 }
  const db = getDb()

  let written = 0
  let chunks = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const values = chunk.map((r) => ({
      cnpjCpf: r.cnpjCpf,
      nome: r.nome ?? null,
      uf: r.uf ?? null,
      areaEstimadaHa: r.areaEstimadaHa != null ? String(r.areaEstimadaHa) : null,
      totalDivida: r.totalDivida != null ? String(r.totalDivida) : null,
      inscricoesCount: r.inscricoesCount ?? null,
      ajuizado: r.ajuizado ?? false,
      passivoAcelerando: r.passivoAcelerando ?? false,
      agroScore: r.agroScore ?? null,
      sinais: r.sinais ?? null,
      payload: (r.payload ?? null) as Record<string, unknown> | null,
    }))
    try {
      await db.insert(leadPgfnTable).values(values).onConflictDoUpdate({
        target: leadPgfnTable.cnpjCpf,
        set: {
          nome: sql`EXCLUDED.nome`,
          uf: sql`EXCLUDED.uf`,
          totalDivida: sql`EXCLUDED.total_divida`,
          inscricoesCount: sql`EXCLUDED.inscricoes_count`,
          ajuizado: sql`EXCLUDED.ajuizado`,
          passivoAcelerando: sql`EXCLUDED.passivo_acelerando`,
          agroScore: sql`EXCLUDED.agro_score`,
          sinais: sql`EXCLUDED.sinais`,
          payload: sql`EXCLUDED.payload`,
          ingeridoEm: sql`now()`,
        },
      })
      written += chunk.length
      chunks++
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[LeadPgfnRepo] chunk ${chunks + 1} falhou:`, (err as Error).message)
    }
  }
  return { written, chunks }
}

/** Conta total de leads no PG. */
export async function countLeadsPgfn(): Promise<number> {
  if (!isPgEnabled()) return 0
  try {
    const db = getDb()
    const r = await db.select({ n: sql<number>`count(*)::int` }).from(leadPgfnTable)
    return r[0]?.n ?? 0
  } catch {
    return 0
  }
}

/** Lista hot-leads (score ≥ threshold) por UF — usado por dashboards/queries. */
export async function listHotLeads(opts?: {
  uf?: string
  minScore?: number
  limit?: number
}): Promise<Array<{ cnpjCpf: string; nome: string | null; uf: string | null; agroScore: number | null; totalDivida: string | null }>> {
  if (!isPgEnabled()) return []
  try {
    const db = getDb()
    const minScore = opts?.minScore ?? 75
    const limit = Math.min(opts?.limit ?? 50, 500)
    const filters = [gte(leadPgfnTable.agroScore, minScore)]
    if (opts?.uf) filters.push(eq(leadPgfnTable.uf, opts.uf))
    const rows = await db
      .select({
        cnpjCpf: leadPgfnTable.cnpjCpf,
        nome: leadPgfnTable.nome,
        uf: leadPgfnTable.uf,
        agroScore: leadPgfnTable.agroScore,
        totalDivida: leadPgfnTable.totalDivida,
      })
      .from(leadPgfnTable)
      .where(and(...filters))
      .limit(limit)
    return rows
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[LeadPgfnRepo.listHot] fail:', (err as Error).message)
    return []
  }
}

/** Distribuição por UF (analytics). */
export async function leadsByUf(): Promise<Array<{ uf: string | null; count: number }>> {
  if (!isPgEnabled()) return []
  try {
    const db = getDb()
    const rows = await db
      .select({ uf: leadPgfnTable.uf, count: sql<number>`count(*)::int` })
      .from(leadPgfnTable)
      .groupBy(leadPgfnTable.uf)
    return rows
  } catch {
    return []
  }
}
