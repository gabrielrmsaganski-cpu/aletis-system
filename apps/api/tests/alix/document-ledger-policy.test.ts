import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FactLedgerInput } from '../../src/services/alix/knowledge/FactLedgerService.js'

const db = vi.hoisted(() => ({
  query: vi.fn(), release: vi.fn(),
  current: null as Record<string, unknown> | null,
  document: null as Record<string, unknown> | null,
  revisions: [] as Array<Record<string, unknown>>,
}))
vi.mock('../../src/db/client.js', () => ({
  isPgEnabled: () => true,
  getPool: () => ({ query: db.query, connect: async () => ({ query: db.query, release: db.release }) }),
}))
vi.mock('../../src/services/alix/jobs/AiJobQueueService.js', () => ({ getAiJobQueueService: () => ({ ready: () => false }) }))
import { ingestFactsFromAlixDocument, reviewLedgerFact, upsertLedgerFact } from '../../src/services/alix/knowledge/FactLedgerService.js'

// Adaptador SQL em memória: exercita transições completas sem banco, rede ou modelo.
beforeEach(() => {
  db.current = null; db.document = null; db.revisions = []; db.release.mockReset()
  db.query.mockReset().mockImplementation(async (sql: string, values: unknown[] = []) => {
    if (/from alix_document where/.test(sql)) return { rows: db.document ? [db.document] : [], rowCount: db.document ? 1 : 0 }
    if (/select \* from alix_memory_fact/.test(sql)) return { rows: db.current ? [{ ...db.current }] : [], rowCount: db.current ? 1 : 0 }
    if (/select 1 from alix_fact_revision/.test(sql)) {
      const found = db.revisions.some(row => row.fact_id === values[0] && row.source === values[1] && row.source_id === values[2] && row.fact_value === values[3])
      return { rows: found ? [{ '?column?': 1 }] : [], rowCount: found ? 1 : 0 }
    }
    if (/insert into alix_memory_fact/.test(sql)) {
      db.current = { id: 1, cliente_id: values[0], fact_type: values[3], fact_key: values[4], canonical_key: values[5], fact_value: values[6], confidence: values[7], source: values[8], source_id: values[9], status: values[10], version: 1, value_hash: values[11], evidence: JSON.parse(String(values[12])), expires_at: values[13], metadata: JSON.parse(String(values[14])) }
      return { rows: [{ ...db.current }], rowCount: 1 }
    }
    if (/insert into alix_fact_revision/.test(sql)) {
      db.revisions.push({ fact_id: values[0], version: values[1], previous_value: values[2], fact_value: values[3], previous_confidence: values[4], confidence: values[5], previous_status: values[6], status: values[7], source: values[8], source_id: values[9], evidence: JSON.parse(String(values[10])), change_reason: values[11] })
      return { rows: [], rowCount: 1 }
    }
    if (/update alix_memory_fact/.test(sql)) {
      if (!db.current) throw new Error('Fixture sem fato para atualizar')
      if (/source = 'manual'/.test(sql)) {
        db.current = { ...db.current, fact_value: values[1], value_hash: values[2], status: values[3], source: 'manual', source_id: values[4], version: values[5], evidence: JSON.parse(String(values[6])), metadata: JSON.parse(String(values[7])) }
      } else if (/fact_value = \$5/.test(sql)) {
        db.current = { ...db.current, fact_key: values[3], fact_value: values[4], confidence: values[5], source: values[6], source_id: values[7], status: values[8], version: values[9], value_hash: values[10], evidence: JSON.parse(String(values[11])), expires_at: values[12] }
      }
      return { rows: [{ ...db.current }], rowCount: 1 }
    }
    if (/^(begin|commit|rollback)$/.test(sql.trim()) || sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 0 }
    throw new Error(`SQL não previsto na fixture: ${sql.slice(0, 100)}`)
  })
})

function documentFact(patch: Partial<FactLedgerInput> = {}): FactLedgerInput {
  return { clienteId: 'cliente-fixture', factType: 'financeiro', factKey: 'saldo_devedor', factValue: '125000.00', confidence: 0.99, source: 'documento', sourceId: 'documento-fixture', evidence: [{ source: 'documento', documentId: 'documento-fixture', page: 12, excerpt: 'Saldo devedor: 125000.00' }], ...patch }
}

describe('Livro de Fatos — extração documental é candidata, não confirmação', () => {
  it.each([undefined, 'confirmed'] as const)('mantém alta confiança com status sugerido %s em revisão', async status => {
    const fact = await upsertLedgerFact(documentFact({ status }))
    expect(fact).toMatchObject({ status: 'pending_review', confidence: 0.99, factValue: '125000.00' })
    expect(fact?.evidence[0]).toMatchObject({ page: 12, excerpt: 'Saldo devedor: 125000.00' })
    expect(db.revisions[0]).toMatchObject({ status: 'pending_review', change_reason: 'created' })
  })

  it.each([{ evidence: [] }, { evidence: [{ source: 'documento' as const, fieldPath: 'saldo_devedor' }] }])('não confirma extração sem trecho literal: $evidence', async ({ evidence }) => {
    const fact = await upsertLedgerFact(documentFact({ confidence: 1, status: 'confirmed', evidence }))
    expect(fact?.status).toBe('pending_review')
  })

  it.each([true, false])('ingestão real de metadados agro com confiança alta e evidência=%s permanece pendente', async hasEvidence => {
    db.document = { id: 'doc-agro', session_id: 'sessao-fixture', cliente_id: 'cliente-fixture', filename: 'documento.pdf', payload: {
      metadata: { agroCampos: { saldo_devedor: '125000.00' }, agroConfianca: 0.99 },
      evidences: hasEvidence ? [{ page: 8, text: 'Saldo devedor: 125000.00' }] : [],
    } }
    expect(await ingestFactsFromAlixDocument('doc-agro')).toEqual({ createdOrUpdated: 1, skipped: 0 })
    expect(db.current).toMatchObject({ status: 'pending_review', fact_value: '125000.00', source: 'documento' })
    expect(db.revisions[0]?.status).toBe('pending_review')
  })

  it('preserva o valor confirmado em conflitos sucessivos, até revisão humana', async () => {
    await upsertLedgerFact(documentFact({ source: 'manual', sourceId: 'revisor-fixture', status: 'confirmed', factValue: '100000.00', evidence: [{ source: 'manual', sourceId: 'revisor-fixture', excerpt: 'Saldo conferido em extrato: 100000.00' }] }))
    for (const [index, value] of ['125000.00', '150000.00', '100000.00'].entries()) {
      const fact = await upsertLedgerFact(documentFact({ sourceId: `doc-${index}`, status: 'confirmed', factValue: value }))
      expect(fact).toMatchObject({ status: 'contested', factValue: '100000.00' })
    }
    expect(db.revisions[1]).toMatchObject({ previous_value: '100000.00', fact_value: '125000.00', change_reason: 'conflict_detected' })
    expect(db.revisions[2]).toMatchObject({ previous_value: '100000.00', fact_value: '150000.00', change_reason: 'conflict_detected' })
    const reviewed = await reviewLedgerFact({ factId: 1, status: 'confirmed', factValue: '150000.00', reviewer: 'revisor-fixture', note: 'Conferido na nova versão do extrato.' })
    expect(reviewed).toMatchObject({ status: 'confirmed', factValue: '150000.00', source: 'manual', version: 5 })
    expect(db.revisions.at(-1)).toMatchObject({ source: 'manual', source_id: 'revisor-fixture', change_reason: 'human_review' })
    expect(reviewed?.evidence.at(-1)).toMatchObject({ source: 'manual', sourceId: 'revisor-fixture', excerpt: 'Conferido na nova versão do extrato.' })
  })

  it('documento que corrobora um fato confirmado não remove a confirmação humana', async () => {
    await upsertLedgerFact(documentFact({ source: 'manual', sourceId: 'revisor-fixture', status: 'confirmed' }))
    expect(await upsertLedgerFact(documentFact())).toMatchObject({ status: 'confirmed', factValue: '125000.00' })
    expect(db.revisions.at(-1)?.change_reason).toBe('corroborated')
  })

  it.each(['manual', 'crm'] as const)('preserva a confirmação legítima da origem %s', async source => {
    expect(await upsertLedgerFact(documentFact({ source, sourceId: 'origem-verificada', evidence: [{ source, sourceId: 'origem-verificada', excerpt: 'Saldo já verificado no cadastro.' }] }))).toMatchObject({ status: 'confirmed', source })
  })

  it('revisão humana pode confirmar um candidato, mesmo com baixa confiança do extrator', async () => {
    await upsertLedgerFact(documentFact({ confidence: 0.4 }))
    const fact = await reviewLedgerFact({ factId: 1, status: 'confirmed', reviewer: 'revisor-fixture', note: 'Trecho conferido no arquivo original.' })
    expect(fact).toMatchObject({ status: 'confirmed', confidence: 0.4, source: 'manual', version: 2 })
    expect(db.revisions.at(-1)?.change_reason).toBe('human_review')
  })

  it('nova confirmação manual explícita pode resolver a contestação do mesmo valor', async () => {
    await upsertLedgerFact(documentFact({ source: 'manual', sourceId: 'primeira-conferencia', status: 'confirmed' }))
    await upsertLedgerFact(documentFact({ factValue: '150000.00' }))
    const fact = await upsertLedgerFact(documentFact({ source: 'manual', sourceId: 'segunda-conferencia', status: 'confirmed', evidence: [{ source: 'manual', sourceId: 'segunda-conferencia', excerpt: 'Saldo original confirmado após conferir ambas as fontes.' }] }))
    expect(fact).toMatchObject({ status: 'confirmed', factValue: '125000.00', source: 'manual' })
    expect(fact?.evidence.at(-1)).toMatchObject({ source: 'manual', sourceId: 'segunda-conferencia' })
  })
})
