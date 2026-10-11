import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import pg from 'pg'
import { closeDb } from '../../src/db/client.js'
import { getSession, upsertSession } from '../../src/db/AlixSessionRepository.js'
import { parseAlixMessageExtras } from '../../src/db/AlixMessagePayload.js'
import { backfillAlixMessageExtras } from '../../scripts/backfill-alix-message-extras.js'

// Exclusivamente banco descartável informado pelo executor; nunca usa DATABASE_URL do ambiente real.
const testUrl = process.env.ALETIS_TEST_PG_URL
const suite = testUrl ? describe : describe.skip

describe('validação dos extras de mensagem', () => {
  it('preserva extras válidos, remove campos core e isola um campo inválido', () => {
    expect(parseAlixMessageExtras({
      id: 'fake', content: 'fake', metadata: { routing: { model: 'gpt-5.6-luna', provider: 'foundry' }, absent: undefined },
      toolsUsed: ['consultar_cliente'], sources: [123], audit: null, intent: 'consulta',
    })).toEqual({ metadata: { routing: { model: 'gpt-5.6-luna', provider: 'foundry' } }, toolsUsed: ['consultar_cliente'], audit: null, intent: 'consulta' })
  })
})

suite('persistência ALIX em PostgreSQL isolado + migração 0039', () => {
  let pool: pg.Pool
  let sessionsDir: string
  const oldUrl = process.env.DATABASE_URL
  const oldEnabled = process.env.ALETIS_PG_ENABLED
  const timestamp = Date.parse('2026-09-06T10:00:00Z')
  const extras = {
    metadata: { routing: { model: 'gpt-5.6-luna', deployment: 'gpt-5.6-luna', provider: 'foundry' }, executionStatus: 'completed', stopReason: 'completed' },
    toolsUsed: ['descobrir_ferramentas'], sources: ['https://example.org/evidencia'],
    audit: { messageId: 'm1', sessionId: 's1', toolCalls: [], totalLatencyMs: 3200 }, intent: 'consulta',
  }

  beforeAll(async () => {
    const parsed = new URL(testUrl!)
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.pathname !== '/aletis_message_fixture') {
      throw new Error('A regressão exige PostgreSQL local descartável aletis_message_fixture.')
    }
    await closeDb()
    process.env.DATABASE_URL = testUrl
    process.env.ALETIS_PG_ENABLED = '1'
    pool = new pg.Pool({ connectionString: testUrl, max: 2 })
    await pool.query(`CREATE TABLE alix_session (
      id text PRIMARY KEY, consultor_id text, cliente_id text, titulo text,
      arquivado_em timestamptz, fixado_em timestamptz,
      criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now()
    ); CREATE TABLE alix_message (
      id text PRIMARY KEY, session_id text NOT NULL, role text NOT NULL, content text NOT NULL,
      tokens_in integer, tokens_out integer, modelo text, criado_em timestamptz NOT NULL DEFAULT now()
    )`)
    const migration = await readFile(new URL('../../src/db/migrations/0039_alix_message_payload.sql', import.meta.url), 'utf8')
    await pool.query(migration)
    await pool.query(migration)
    sessionsDir = await mkdtemp(join(tmpdir(), 'aletis-message-fixture-'))
  })

  beforeEach(async () => { await pool.query('TRUNCATE alix_session, alix_message') })
  afterAll(async () => {
    await closeDb()
    if (pool) await pool.end()
    if (sessionsDir) await rm(sessionsDir, { recursive: true, force: true })
    if (oldUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = oldUrl
    if (oldEnabled === undefined) delete process.env.ALETIS_PG_ENABLED
    else process.env.ALETIS_PG_ENABLED = oldEnabled
  })

  it('recarrega modelo, fontes, ferramentas e auditoria após gravação e regravação legada', async () => {
    await upsertSession({ id: 's1', messages: [{ id: 'm1', role: 'assistant', content: 'Resposta comprovada', timestamp, ...extras }] })
    await upsertSession({ id: 's1', messages: [{ id: 'm1', role: 'user', content: 'Texto antigo divergente', timestamp: timestamp + 1000 }] })
    const row = (await pool.query('SELECT * FROM alix_message WHERE id = $1', ['m1'])).rows[0]
    expect(row.modelo).toBe('gpt-5.6-luna')
    expect(row.payload).toEqual(extras)
    const session = await getSession('s1')
    expect(session?.messages).toEqual([{ id: 'm1', role: 'assistant', content: 'Resposta comprovada', timestamp, ...extras }])
  })

  it('enriquece mensagem existente sem trocar campos core e impede colisão entre sessões', async () => {
    await upsertSession({ id: 's1', messages: [{ id: 'm1', role: 'assistant', content: 'Texto SQL original', timestamp }] })
    await upsertSession({ id: 's1', messages: [{ id: 'm1', role: 'system', content: 'Outro texto', timestamp: timestamp + 1000, ...extras }] })
    await upsertSession({ id: 's1', messages: [{ id: 'm1', role: 'assistant', content: 'irrelevante', metadata: { confidence: 1 } }] })
    await upsertSession({ id: 's2', messages: [{ id: 'm1', role: 'assistant', content: 'Colisão', metadata: { routing: { model: 'outro-modelo' } }, sources: ['outra sessão'] }] })
    const rows = (await pool.query('SELECT * FROM alix_message')).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ session_id: 's1', role: 'assistant', content: 'Texto SQL original', modelo: 'gpt-5.6-luna', payload: { ...extras, metadata: { ...extras.metadata, confidence: 1 } } })
    expect(rows[0].criado_em.getTime()).toBe(timestamp)
    expect((await getSession('s2'))?.messages).toEqual([])
  })

  it('lê payload legado ou malformado sem permitir que extras substituam identidade/texto SQL', async () => {
    await upsertSession({ id: 's1', messages: [{ id: 'm1', role: 'assistant', content: 'SQL autoritativo', timestamp }] })
    await pool.query('UPDATE alix_message SET payload = $1::jsonb WHERE id = $2', [JSON.stringify({ ...extras, id: 'forjado', role: 'system', content: 'forjado', timestamp: 0, toolsUsed: [12] }), 'm1'])
    expect((await getSession('s1'))?.messages?.[0]).toEqual({ id: 'm1', role: 'assistant', content: 'SQL autoritativo', timestamp, metadata: extras.metadata, sources: extras.sources, audit: extras.audit, intent: extras.intent })
  })

  it('backfill dry-run não escreve; apply exige id/sessão/conteúdo e repetição é idempotente', async () => {
    await upsertSession({ id: 's1', messages: [
      { id: 'm1', role: 'assistant', content: 'Igual', timestamp, metadata: { routing: { provider: 'foundry' }, existing: true } },
      { id: 'm2', role: 'assistant', content: 'Texto SQL divergente', timestamp },
    ] })
    await upsertSession({ id: 's2', messages: [{ id: 'm3', role: 'assistant', content: 'Outra sessão', timestamp }] })
    await writeFile(join(sessionsDir, 's1.json'), JSON.stringify({ id: 's1', messages: [
      { id: 'm1', content: 'Igual', ...extras, metadata: { ...extras.metadata, existing: false } },
      { id: 'm2', content: 'Arquivo diferente', ...extras },
      { id: 'm3', content: 'Outra sessão', ...extras },
      { id: 'm4', content: 'Não existe no SQL', ...extras },
    ] }))
    const before = (await pool.query('SELECT * FROM alix_message ORDER BY id')).rows
    const preview = await backfillAlixMessageExtras(pool, { sessionsDir, sessionIds: ['s1'] })
    expect(preview).toMatchObject({ eligible: 1, updated: 0, skipped: { noSqlMatch: 2, contentMismatch: 1 } })
    expect((await pool.query('SELECT * FROM alix_message ORDER BY id')).rows).toEqual(before)
    const applied = await backfillAlixMessageExtras(pool, { sessionsDir, sessionIds: ['s1'], apply: true })
    expect(applied.updated).toBe(1)
    const after = (await pool.query('SELECT * FROM alix_message ORDER BY id')).rows
    expect(after.map(({ payload, modelo, ...core }) => core)).toEqual(before.map(({ payload, modelo, ...core }) => core))
    expect(after[0]).toMatchObject({ modelo: 'gpt-5.6-luna', payload: { ...extras, metadata: { ...extras.metadata, existing: true } } })
    expect(after[1].payload).toBeNull()
    expect(after[2].payload).toBeNull()
    const repeated = await backfillAlixMessageExtras(pool, { sessionsDir, sessionIds: ['s1'], apply: true })
    expect(repeated).toMatchObject({ eligible: 0, updated: 0, unchanged: 1 })
  })
})
