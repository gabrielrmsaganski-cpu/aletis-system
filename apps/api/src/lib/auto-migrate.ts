/**
 * auto-migrate.ts — aplica migrations Drizzle no boot do servidor
 * quando ALETIS_AUTO_MIGRATE=1.
 *
 * Idempotente: Drizzle gerencia tabela __drizzle_migrations e só
 * aplica o que ainda não foi aplicado. Re-runs são seguros.
 *
 * Em dev (ALETIS_AUTO_MIGRATE=0 ou unset): no-op com log informativo.
 * Em produção (Docker compose seta=1): garante que o banco está
 * sempre alinhado com o código deployado, sem precisar comando extra.
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import type { FastifyBaseLogger } from 'fastify'
import { getDb } from '../db/client.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Aplica migrations se ALETIS_AUTO_MIGRATE=1.
 * Procura migrations em ../db/migrations relativo ao bundle.
 * Em dev (tsx): src/db/migrations · em prod (compiled): src/db/migrations
 * (tsc copia .sql automaticamente quando estão em rootDir; senão
 * mantemos o caminho via fallback para a raiz do workspace).
 */
export async function runAutoMigrationsIfEnabled(log?: FastifyBaseLogger): Promise<void> {
  if (process.env.ALETIS_AUTO_MIGRATE !== '1') {
    log?.info('[auto-migrate] desabilitado (ALETIS_AUTO_MIGRATE != 1)')
    return
  }
  if (process.env.ALETIS_PG_ENABLED !== '1') {
    log?.warn('[auto-migrate] ALETIS_PG_ENABLED != 1 — skip (sem PG ativado)')
    return
  }

  // Procura por migrations em dois caminhos comuns:
  // 1. dist/lib/auto-migrate.js → ../db/migrations (compilado)
  // 2. src/lib/auto-migrate.ts (tsx)  → ../db/migrations
  // 3. fallback: process.cwd()/src/db/migrations
  const candidates = [
    join(__dirname, '..', 'db', 'migrations'),
    join(__dirname, '..', '..', 'src', 'db', 'migrations'),
    join(process.cwd(), 'src', 'db', 'migrations'),
    join(process.cwd(), 'apps', 'api', 'src', 'db', 'migrations'),
  ]
  const migrationsFolder = candidates.find((p) => existsSync(p))
  if (!migrationsFolder) {
    log?.error(
      { tried: candidates },
      '[auto-migrate] pasta de migrations não encontrada — skip'
    )
    return
  }

  log?.info({ migrationsFolder }, '[auto-migrate] aplicando migrations…')
  const start = Date.now()
  try {
    const db = getDb()
    await migrate(db, { migrationsFolder })
    log?.info({ tookMs: Date.now() - start }, '[auto-migrate] OK')
  } catch (err) {
    log?.error({ err }, '[auto-migrate] FALHOU')
    throw err
  }
}
