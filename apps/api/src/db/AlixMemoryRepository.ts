/**
 * AlixMemoryRepository — memória canônica e atualização transacional no PostgreSQL.
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
import { getDb, getPool, isPgEnabled } from './client.js'
import { z } from 'zod'
import { resolveClienteId } from './ClienteRepository.js'
import { clientMergedError, mergedClientIdentity } from '../services/core/ClientIdentity.js'
import { alixMemory, alixInsight } from './schema.js'

export interface MemoriaLike {
  clienteId: string
  clienteNome: string
  atualizadoEm: string
  [k: string]: unknown
}

/* ── Memória estruturada ────────────────────────────────── */
export const memoriaEnvelope = z.object({
  clienteId: z.string().min(1), clienteNome: z.string().min(1), atualizadoEm: z.string().min(1),
  perfil: z.array(z.string()).default([]), dividasAtivas: z.array(z.string()).default([]), decisoes: z.array(z.string()).default([]),
  proximasAcoes: z.array(z.string()).default([]), alertas: z.array(z.string()).default([]),
  historico: z.array(z.object({ data: z.string(), texto: z.string() }).passthrough()).default([]),
}).passthrough()

/** Lock transacional evita perda de notas quando dois processos atualizam a memória simultaneamente. */
export async function updateAlixMemoryStrict(clienteId: string, update: (previous: MemoriaLike | null, canonicalId: string) => MemoriaLike): Promise<MemoriaLike> {
  if (!isPgEnabled()) throw new Error('Atualização transacional de memória exige PostgreSQL.')
  const canonicalId = await resolveClienteId(clienteId)
  const connection = await getPool().connect()
  try {
    await connection.query('begin')
    const identity = await connection.query('select payload from cliente where id=$1 for share', [canonicalId])
    const merged = mergedClientIdentity(identity.rows[0]?.payload)
    if (merged) throw clientMergedError(merged.canonicalId)
    await connection.query('select pg_advisory_xact_lock(hashtext($1))', [`alix-memory:${canonicalId}`])
    const current = await connection.query('select payload from alix_memory where cliente_id=$1 for update', [canonicalId])
    const next = memoriaEnvelope.parse(update(current.rows[0]?.payload ?? null, canonicalId))
    if (next.clienteId !== canonicalId) throw new Error('A memória não pode mudar de identidade.')
    await connection.query('insert into alix_memory(cliente_id,cliente_nome,atualizado_em,payload) values($1,$2,$3,$4::jsonb) on conflict(cliente_id) do update set cliente_nome=excluded.cliente_nome,atualizado_em=excluded.atualizado_em,payload=excluded.payload', [canonicalId, next.clienteNome, next.atualizadoEm, JSON.stringify(next)])
    await connection.query('commit')
    return next
  } catch (error) { await connection.query('rollback'); throw error } finally { connection.release() }
}

export async function upsertAlixMemory(m: MemoriaLike): Promise<void> {
  if (!isPgEnabled()) return
  await updateAlixMemoryStrict(m.clienteId, (previous, canonicalId) => ({ ...previous, ...m, clienteId: canonicalId }))
}

export async function getAlixMemory(clienteId: string): Promise<MemoriaLike | null> {
  if (!isPgEnabled()) return null
  const canonicalId = await resolveClienteId(clienteId)
  const rows = await getDb().select().from(alixMemory).where(eq(alixMemory.clienteId, canonicalId)).limit(1)
  return rows.length ? memoriaEnvelope.parse(rows[0].payload) : null
}

export async function listAlixMemories(): Promise<MemoriaLike[]> {
  if (!isPgEnabled()) return []
  const result = await getPool().query("select m.payload from alix_memory m left join cliente c on c.id=m.cliente_id where (c.payload->'identityMerge'->>'status') is distinct from 'merged' order by m.atualizado_em desc")
  return result.rows.map(row => memoriaEnvelope.parse(row.payload))
}

export async function deleteAlixMemory(clienteId: string): Promise<void> {
  if (!isPgEnabled()) return
  const canonicalId = await resolveClienteId(clienteId)
  if (canonicalId !== clienteId) throw new Error('A memória do cadastro consolidado não pode excluir a memória canônica.')
  await getDb().delete(alixMemory).where(eq(alixMemory.clienteId, canonicalId))
}

export async function countAlixMemory(): Promise<number> {
  if (!isPgEnabled()) return 0
  const r = await getDb().select({ n: sql<number>`count(*)::int` }).from(alixMemory)
  return r[0]?.n ?? 0
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
