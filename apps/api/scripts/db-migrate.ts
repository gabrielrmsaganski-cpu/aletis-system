/**
 * Aplica migrations Drizzle no banco apontado por DATABASE_URL.
 * Uso: pnpm --filter @aletis/api run db:migrate
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { getDb, closeDb } from '../src/db/client.js'

async function main() {
  const db = getDb()
  console.log('[db:migrate] aplicando migrations...')
  await migrate(db, { migrationsFolder: './src/db/migrations' })
  console.log('[db:migrate] OK')
  await closeDb()
}

main().catch(async (err) => {
  console.error('[db:migrate] FALHOU:', err)
  await closeDb().catch(() => {})
  process.exit(1)
})
