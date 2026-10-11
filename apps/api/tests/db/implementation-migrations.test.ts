import { it, expect } from 'vitest'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const fixtureUrl = process.env.ALETIS_IMPLEMENTATION_PG_URL

it.skipIf(!fixtureUrl)('aplica as migrações pendentes pelo journal duas vezes, preservando dados e chaves', async () => {
  const url = new URL(fixtureUrl!)
  if (url.hostname !== '127.0.0.1' || url.port !== '55436' || url.pathname !== '/aletis_implementation_fixture') throw new Error('Somente PostgreSQL descartável local.')
  const schema = 'aletis_impl_migrations'
  const ledger = 'aletis_impl_migration_ledger'
  url.searchParams.set('options', `-c search_path=${schema},public`)
  const pool = new pg.Pool({ connectionString: url.toString(), max: 2 })
  try {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE; DROP SCHEMA IF EXISTS ${ledger} CASCADE; CREATE SCHEMA ${schema}; CREATE SCHEMA ${ledger}`)
    await pool.query(`CREATE TABLE ${schema}.cliente(id text PRIMARY KEY); CREATE TABLE ${schema}.proposta(id text PRIMARY KEY); CREATE TABLE ${schema}.alix_message(id text PRIMARY KEY,content text)`)
    await pool.query(`INSERT INTO ${schema}.alix_message VALUES('fixture-message','Histórico sintético preservado')`)
    await pool.query(`CREATE TABLE ${ledger}.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint)`)
    const folder = fileURLToPath(new URL('../../src/db/migrations/', import.meta.url))
    const journal = JSON.parse(await readFile(`${folder}/meta/_journal.json`, 'utf8'))
    const previous = journal.entries.find((entry: { idx: number }) => entry.idx === 38)
    const hash = createHash('sha256').update(await readFile(`${folder}/${previous.tag}.sql`)).digest('hex')
    await pool.query(`INSERT INTO ${ledger}.__drizzle_migrations(hash,created_at) VALUES($1,$2)`, [hash, previous.when])
    const options = { migrationsFolder: folder, migrationsSchema: ledger }
    await migrate(drizzle(pool), options)
    await migrate(drizzle(pool), options)
    expect((await pool.query(`SELECT content,payload FROM ${schema}.alix_message`)).rows).toEqual([{ content: 'Histórico sintético preservado', payload: null }])
    expect((await pool.query(`SELECT count(*)::int AS count FROM ${ledger}.__drizzle_migrations`)).rows[0].count).toBe(4)
    const columns = (await pool.query('SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=$1', [schema])).rows
    expect(columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ table_name: 'generated_contract', column_name: 'valor_total', data_type: 'numeric' }),
      expect.objectContaining({ table_name: 'google_drive_import_batch', column_name: 'payload', data_type: 'jsonb' }),
    ]))
    const foreignKeys = (await pool.query('SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema=$1 AND table_name=$2 AND constraint_type=$3', [schema, 'generated_contract', 'FOREIGN KEY'])).rows
    expect(foreignKeys).toHaveLength(2)
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE; DROP SCHEMA IF EXISTS ${ledger} CASCADE`)
    await pool.end()
  }
})
