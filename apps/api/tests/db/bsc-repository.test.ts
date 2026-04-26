/**
 * Wave-PG-15 — BscRepository smoke. Skip se ALETIS_PG_ENABLED!=1.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  appendBscSnapshot,
  listBscSnapshots,
  countBscSnapshots,
  bscStatusCounts,
} from '../../src/db/BscRepository.js'
import { isPgEnabled, closeDb, getDb } from '../../src/db/client.js'
import { bscSnapshot } from '../../src/db/schema.js'
import { eq } from 'drizzle-orm'

const PG = isPgEnabled()
const describeIf = PG ? describe : describe.skip

describeIf('BscRepository (Postgres append-only)', () => {
  const cliId = `cli-vitest-bsc-${Date.now()}`

  beforeAll(async () => {
    if (PG) {
      await getDb().delete(bscSnapshot).where(eq(bscSnapshot.clienteId, cliId))
    }
  })

  afterAll(async () => {
    if (PG) {
      await getDb().delete(bscSnapshot).where(eq(bscSnapshot.clienteId, cliId))
    }
    await closeDb()
  })

  it('append + list devolve em ordem decrescente por calculadoEm', async () => {
    await appendBscSnapshot({
      clienteId: cliId,
      calculadoEm: '2026-04-01T10:00:00Z',
      resultado: { statusGeral: 'verde', notaGlobal: 8.5 },
      contexto: { foo: 'bar' },
    } as any)
    await appendBscSnapshot({
      clienteId: cliId,
      calculadoEm: '2026-04-25T10:00:00Z',
      resultado: { statusGeral: 'amarelo', notaGlobal: 6.7 },
    } as any)
    const rows = await listBscSnapshots({ clienteId: cliId, limit: 10 })
    expect(rows.length).toBe(2)
    // Ordem desc: 25/04 antes de 01/04
    expect((rows[0] as any).statusGeral).toBe('amarelo')
    expect((rows[1] as any).statusGeral).toBe('verde')
  })

  it('count e statusCounts agregam', async () => {
    const total = await countBscSnapshots()
    expect(total).toBeGreaterThanOrEqual(2)
    const counts = await bscStatusCounts()
    expect(Array.isArray(counts)).toBe(true)
  })
})
