import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { closeDb } from '../../src/db/client.js'
import { ensureSession, getSession, getSessionAccess, upsertSession } from '../../src/db/AlixSessionRepository.js'

const fixtureUrl = process.env.ALETIS_IMPLEMENTATION_PG_URL
const suite = fixtureUrl ? describe : describe.skip
suite('autoria e criação idempotente no PostgreSQL descartável', () => {
  let pool: pg.Pool
  const prefix = `alix-review-${randomUUID()}`
  const ids: string[] = []
  const sessionId = (suffix: string) => { const id = `${prefix}-${suffix}`; ids.push(id); return id }
  beforeAll(async () => {
    const url = new URL(fixtureUrl!)
    if (url.hostname !== '127.0.0.1' || url.port !== '55436' || url.pathname !== '/aletis_implementation_fixture') throw new Error('Exige fixture local descartável na porta 55436.')
    await closeDb()
    vi.stubEnv('DATABASE_URL', fixtureUrl!)
    vi.stubEnv('ALETIS_PG_ENABLED', '1')
    pool = new pg.Pool({ connectionString: fixtureUrl, max: 4 })
  })
  afterAll(async () => {
    await closeDb()
    if (pool) {
      await pool.query('DELETE FROM alix_message WHERE session_id = ANY($1::text[])', [ids])
      await pool.query('DELETE FROM alix_session WHERE id = ANY($1::text[])', [ids])
      await pool.end()
    }
    vi.unstubAllEnvs()
  })

  it('escritor sem dono preserva autoria; dono diferente é recusado sem alterar sessão ou mensagem', async () => {
    const id = sessionId('owner')
    await upsertSession({ id, title: 'Inicial', consultorId: 'owner-a', clienteId: 'client-a' }, { strict: true })
    await upsertSession({ id, title: 'Escritor antigo', clienteId: 'client-a' }, { strict: true })
    expect(await getSessionAccess(id)).toMatchObject({ consultorId: 'owner-a' })
    await expect(upsertSession({ id, title: 'Invasor', consultorId: 'owner-b', messages: [{ id: `${id}-message`, role: 'assistant', content: 'Não persistir' }] }, { strict: true })).rejects.toMatchObject({ statusCode: 409 })
    expect(await getSession(id, { strict: true })).toMatchObject({ title: 'Escritor antigo', consultorId: 'owner-a', clienteId: 'client-a', messages: [] })
  })

  it('repetição e concorrência com mesmo escopo preservam título, mensagens e datas originais', async () => {
    const id = sessionId('retry')
    const input = { id, title: 'Original', consultorId: 'owner-a', clienteId: 'client-a', createdAt: 1000 }
    await Promise.all([ensureSession(input), ensureSession(input)])
    await upsertSession({ ...input, title: 'Revisado', messages: [{ id: `${id}-message`, role: 'assistant', content: 'Histórico original', timestamp: 2000 }] }, { strict: true })
    const saved = await ensureSession({ ...input, title: 'Não reverter', createdAt: 3000 })
    expect(saved).toMatchObject({ title: 'Revisado', createdAt: 1000, messages: [{ content: 'Histórico original' }] })
  })

  it('criações concorrentes com donos diferentes permitem apenas o vencedor', async () => {
    const id = sessionId('race')
    const results = await Promise.allSettled(['owner-a', 'owner-b'].map(consultorId => ensureSession({ id, title: consultorId, consultorId, clienteId: 'client-a' })))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    const winner = (results.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<any>).value
    expect(await getSessionAccess(id)).toMatchObject({ consultorId: winner.consultorId })
  })

  it('retry rejeita mudança de cliente e nunca se apropria de sessão legada sem dono', async () => {
    const id = sessionId('scope')
    await ensureSession({ id, consultorId: 'owner-a', clienteId: 'client-a' })
    await expect(ensureSession({ id, consultorId: 'owner-a', clienteId: 'client-b' })).rejects.toMatchObject({ statusCode: 409 })
    const legacy = sessionId('legacy')
    await upsertSession({ id: legacy, clienteId: 'client-a' }, { strict: true })
    await expect(ensureSession({ id: legacy, consultorId: 'owner-a', clienteId: 'client-a' })).rejects.toMatchObject({ statusCode: 409 })
    expect(await getSessionAccess(legacy)).toEqual({ id: legacy, consultorId: undefined, clienteId: 'client-a' })
  })
})
