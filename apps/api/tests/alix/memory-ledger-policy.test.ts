import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }))
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => true, getPool: () => ({ connect: async () => ({ query: mocks.query, release: mocks.release }) }) }))
vi.mock('../../src/services/alix/jobs/AiJobQueueService.js', () => ({ getAiJobQueueService: () => ({ ready: () => false }) }))
import { upsertLedgerFact } from '../../src/services/alix/knowledge/FactLedgerService.js'

beforeEach(() => {
  mocks.release.mockReset()
  mocks.query.mockReset().mockImplementation(async (sql: string, values: unknown[]) => {
    if (sql.includes('insert into alix_memory_fact')) return { rows: [{ id: 1, cliente_id: values[0], fact_type: values[3], fact_key: values[4], canonical_key: values[5], fact_value: values[6], confidence: values[7], source: values[8], source_id: values[9], status: values[10], version: 1, evidence: JSON.parse(String(values[12])) }] }
    return { rows: [], rowCount: 0 }
  })
})

it.each([undefined, 'confirmed'] as const)('o ledger não confirma conversa por confiança ou status sugerido: %s', async status => {
  const excerpt = 'Cliente A informou:\n  possui 500 hectares de soja.'
  const fact = await upsertLedgerFact({ clienteId: 'a', sessionId: 's', sourceId: 'm', source: 'conversation', factType: 'dado_operacional', factKey: 'area', factValue: '500 hectares', confidence: 1, status, evidence: [{ source: 'conversation', sourceId: 'm', excerpt }] })
  expect(fact?.status).toBe('pending_review')
  expect(fact?.evidence[0].excerpt).toBe(excerpt)
  expect(mocks.release).toHaveBeenCalledTimes(1)
})
