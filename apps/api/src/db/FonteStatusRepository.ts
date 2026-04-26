/**
 * FonteStatusRepository — espelha o estado das 36 fontes externas (BCB,
 * CEPEA, CONAB, INMET, IBGE, ANP, NASA, etc.) no Postgres a cada probe.
 *
 * Hot-path runtime (DataSourceManager em memória) continua sendo o que
 * o dashboard /fontes lê em tempo real. O PG é fonte para:
 *   - Histórico/SLA via audit_log em transições de status
 *   - Queries SQL ad-hoc (uptime médio, top latência, errors24h)
 *   - Persistência entre restarts (sem precisar re-probar imediato)
 *
 * Tudo best-effort: erro de PG vira warn, probe continua.
 */
import { sql } from 'drizzle-orm'
import { getDb, isPgEnabled } from './client.js'
import { fonteStatus as fonteTable } from './schema.js'
import { auditAsync } from './AuditLog.js'

export interface FonteStatusRow {
  nome: string
  status: 'online' | 'offline' | 'degraded'
  ultimaAtualizacao?: Date
  latenciaMs?: number
  ultimoErro?: string
  erros24h?: number
}

const lastStatusByName = new Map<string, string>()

/** Upsert em lote — chamado pelo probe periódico. */
export async function upsertFontesBatch(rows: FonteStatusRow[]): Promise<{ written: number; transitions: number }> {
  if (!isPgEnabled() || rows.length === 0) return { written: 0, transitions: 0 }
  const db = getDb()
  let transitions = 0

  // Detecta state transition (online↔offline↔degraded) para gerar audit_log
  for (const r of rows) {
    const prev = lastStatusByName.get(r.nome)
    if (prev && prev !== r.status) {
      auditAsync({
        ator: 'system:probe',
        acao: 'fonte_state_transition',
        recurso: `fonte:${r.nome}`,
        dadosAntes: { status: prev },
        dadosDepois: { status: r.status, latenciaMs: r.latenciaMs, ultimoErro: r.ultimoErro },
      })
      transitions++
    }
    lastStatusByName.set(r.nome, r.status)
  }

  try {
    const values = rows.map((r) => ({
      nome: r.nome,
      status: r.status,
      ultimaAtualizacao: r.ultimaAtualizacao ?? new Date(),
      latenciaMs: r.latenciaMs ?? null,
      ultimoErro: r.ultimoErro ?? null,
      erros24h: r.erros24h ?? 0,
    }))
    await db.insert(fonteTable).values(values).onConflictDoUpdate({
      target: fonteTable.nome,
      set: {
        status: sql`EXCLUDED.status`,
        ultimaAtualizacao: sql`EXCLUDED.ultima_atualizacao`,
        latenciaMs: sql`EXCLUDED.latencia_ms`,
        ultimoErro: sql`EXCLUDED.ultimo_erro`,
        erros24h: sql`EXCLUDED.erros_24h`,
      },
    })
    return { written: rows.length, transitions }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[FonteStatusRepo.upsertBatch] best-effort fail:', (err as Error).message)
    return { written: 0, transitions }
  }
}

/** Lista status atual de todas as fontes (snapshot do PG). */
export async function listFonteStatus(): Promise<FonteStatusRow[]> {
  if (!isPgEnabled()) return []
  try {
    const db = getDb()
    const rows = await db.select().from(fonteTable).orderBy(fonteTable.nome)
    return rows.map((r) => ({
      nome: r.nome,
      status: r.status as 'online' | 'offline' | 'degraded',
      ultimaAtualizacao: r.ultimaAtualizacao ?? undefined,
      latenciaMs: r.latenciaMs ?? undefined,
      ultimoErro: r.ultimoErro ?? undefined,
      erros24h: r.erros24h ?? 0,
    }))
  } catch {
    return []
  }
}

/** Conta de fontes em cada estado (para health-check rápido). */
export async function fonteStatusCounts(): Promise<{ online: number; offline: number; degraded: number; total: number }> {
  if (!isPgEnabled()) return { online: 0, offline: 0, degraded: 0, total: 0 }
  try {
    const db = getDb()
    const rows = await db
      .select({ status: fonteTable.status, count: sql<number>`count(*)::int` })
      .from(fonteTable)
      .groupBy(fonteTable.status)
    const out = { online: 0, offline: 0, degraded: 0, total: 0 }
    for (const r of rows) {
      const s = r.status as 'online' | 'offline' | 'degraded'
      out[s] = r.count
      out.total += r.count
    }
    return out
  } catch {
    return { online: 0, offline: 0, degraded: 0, total: 0 }
  }
}
