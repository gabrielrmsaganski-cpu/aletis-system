/**
 * Drizzle client + pool global. Cria singleton lazy.
 *
 * Habilita-se via env `ALETIS_PG_ENABLED=1`. Sem a flag, o cliente
 * existe mas a tentativa de uso não acontece (callers checam
 * `isPgEnabled()` antes de tocar). DATABASE_URL é obrigatório quando
 * a flag está ativa.
 */
import pg from 'pg'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from './schema.js'

const { Pool } = pg

let cachedPool: pg.Pool | null = null
let cachedDb: NodePgDatabase<typeof schema> | null = null

export function isPgEnabled(): boolean {
  return process.env.ALETIS_PG_ENABLED === '1'
}

export function getPool(): pg.Pool {
  if (cachedPool) return cachedPool
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL não setado (necessário quando ALETIS_PG_ENABLED=1).')
  }
  cachedPool = new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
  })
  // Não derruba o processo em erro idle — log e segue; caller decide retry.
  cachedPool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.warn('[db] pool error:', err.message)
  })
  return cachedPool
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (cachedDb) return cachedDb
  cachedDb = drizzle(getPool(), { schema })
  return cachedDb
}

/** Fecha o pool (testes, shutdown limpo). */
export async function closeDb(): Promise<void> {
  if (cachedPool) {
    await cachedPool.end()
    cachedPool = null
    cachedDb = null
  }
}

export { schema }
