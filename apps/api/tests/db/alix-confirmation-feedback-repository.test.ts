/**
 * Wave-PG-17 — AlixConfirmationFeedbackRepository smoke.
 * Skip se ALETIS_PG_ENABLED!=1.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  upsertConfirmation,
  listConfirmations,
  deleteConfirmation,
  countConfirmations,
  appendFeedback,
  listFeedback,
  feedbackStats,
} from '../../src/db/AlixConfirmationFeedbackRepository.js'
import { isPgEnabled, closeDb, getDb } from '../../src/db/client.js'
import { alixFeedback } from '../../src/db/schema.js'
import { eq, gte } from 'drizzle-orm'

const PG = isPgEnabled()
const describeIf = PG ? describe : describe.skip

describeIf('AlixConfirmation + Feedback Repository', () => {
  const confId = `conf-vitest-${Date.now()}`
  const sessionTag = `vitest-session-${Date.now()}`

  beforeAll(async () => {
    await deleteConfirmation(confId)
    if (PG) {
      const db = getDb()
      await db.delete(alixFeedback).where(eq(alixFeedback.sessionId, sessionTag))
    }
  })

  afterAll(async () => {
    await deleteConfirmation(confId)
    if (PG) {
      const db = getDb()
      await db.delete(alixFeedback).where(eq(alixFeedback.sessionId, sessionTag))
    }
    await closeDb()
  })

  it('upsertConfirmation pending → list devolve com status', async () => {
    await upsertConfirmation(
      {
        id: confId,
        sessionId: 'sess-x',
        status: 'pending',
        expiraEm: Date.now() + 60_000,
      } as any,
      'pending',
    )
    const list = await listConfirmations({ status: 'pending', limit: 50 })
    const found = list.find((r: any) => r.id === confId)
    expect(found).toBeTruthy()
  })

  it('idempotente — upsert mesmo id atualiza ao invés de duplicar', async () => {
    const before = await countConfirmations()
    await upsertConfirmation(
      { id: confId, sessionId: 'sess-x', status: 'approved' } as any,
      'pending',
    )
    const after = await countConfirmations()
    expect(after).toBe(before)
  })

  it('appendFeedback + listFeedback ordenado desc por id', async () => {
    await appendFeedback({
      sessionId: sessionTag,
      messageId: 'msg-1',
      rating: 'positive',
      motivo: 'útil',
      ts: new Date().toISOString(),
    })
    await appendFeedback({
      sessionId: sessionTag,
      messageId: 'msg-2',
      rating: 'negative',
      motivo: 'errado',
      ts: new Date().toISOString(),
    })
    const list = await listFeedback({ sessionId: sessionTag, limit: 10 })
    expect(list.length).toBe(2)
    // Ordem desc por id (mais recente primeiro = msg-2 com rating negative)
    expect((list[0] as any).rating).toBe('negative')
  })

  it('feedbackStats agrega ratings', async () => {
    const stats = await feedbackStats()
    expect(stats.total).toBeGreaterThanOrEqual(2)
    expect(stats.positive).toBeGreaterThanOrEqual(1)
    expect(stats.negative).toBeGreaterThanOrEqual(1)
  })
})
