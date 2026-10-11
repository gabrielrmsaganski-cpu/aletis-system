import { afterAll, describe, expect, it } from 'vitest'

import { getPool, isPgEnabled } from '../../src/db/client.js'
import {
  canonicalFactKey,
  extractStructuredFactCandidates,
  listFactRevisions,
  listLedgerFacts,
  reviewLedgerFact,
  upsertLedgerFact,
} from '../../src/services/alix/knowledge/FactLedgerService.js'

describe('FactLedgerService — normalização determinística', () => {
  it('gera chave canônica estável em português', () => {
    expect(canonicalFactKey('Área Total (ha)')).toBe('area_total_ha')
    expect(canonicalFactKey('Número do Contrato')).toBe('numero_do_contrato')
  })

  it('transforma dados estruturados em fatos tipados sem serializar objetos inteiros', () => {
    const facts = extractStructuredFactCandidates({
      nome: 'Produtor Exemplo',
      divida: { credor: 'Banco Exemplo', saldo: '125000.00' },
      propriedades: [{ matricula: '1234', areaHa: '98.5' }],
      culturas: ['soja', 'milho'],
      rawFile: { path: '/segredo/arquivo.pdf' },
    }, { prefix: 'documento', confidence: 0.82 })

    expect(facts.some((fact) => fact.factType === 'identidade' && fact.factValue === 'Produtor Exemplo')).toBe(true)
    expect(facts.some((fact) => fact.factType === 'financeiro' && fact.factValue === 'Banco Exemplo')).toBe(true)
    expect(facts.some((fact) => fact.factType === 'patrimonio' && fact.factValue === '1234')).toBe(true)
    expect(facts.some((fact) => fact.factType === 'dado_operacional' && fact.factValue.includes('soja'))).toBe(true)
    expect(facts.some((fact) => fact.factValue.includes('/segredo/'))).toBe(false)
  })
})

const describePg = isPgEnabled() ? describe : describe.skip

describePg('FactLedgerService — versionamento PostgreSQL', () => {
  const clienteId = `fact-ledger-vitest-${Date.now()}`
  let factId = 0

  afterAll(async () => {
    await getPool().query(`delete from alix_memory_fact where cliente_id = $1`, [clienteId])
  })

  it('preserva fato confirmado quando documento divergente chega', async () => {
    const confirmed = await upsertLedgerFact({
      clienteId,
      factType: 'financeiro',
      factKey: 'saldo_devedor',
      factValue: 'R$ 100.000,00',
      confidence: 1,
      source: 'crm',
      sourceId: clienteId,
      status: 'confirmed',
      evidence: [{ source: 'crm', sourceId: clienteId, fieldPath: 'saldo_devedor' }],
    })
    expect(confirmed?.status).toBe('confirmed')
    factId = confirmed?.id || 0

    const conflicting = await upsertLedgerFact({
      clienteId,
      factType: 'financeiro',
      factKey: 'saldo_devedor',
      factValue: 'R$ 120.000,00',
      confidence: 0.8,
      source: 'documento',
      sourceId: 'doc-conflict-test',
      status: 'pending_review',
      evidence: [{ source: 'documento', documentId: 'doc-conflict-test', page: 2 }],
    })

    expect(conflicting?.status).toBe('contested')
    expect(conflicting?.factValue).toBe('R$ 100.000,00')
    const revisions = await listFactRevisions(factId)
    expect(revisions).toHaveLength(2)
    expect(revisions[0]?.change_reason).toBe('conflict_detected')
  })

  it('permite revisão humana explícita sem apagar o histórico', async () => {
    const reviewed = await reviewLedgerFact({
      factId,
      status: 'confirmed',
      factValue: 'R$ 120.000,00',
      reviewer: 'vitest',
      note: 'Conferido no contrato assinado.',
    })
    expect(reviewed?.status).toBe('confirmed')
    expect(reviewed?.factValue).toBe('R$ 120.000,00')
    expect(reviewed?.version).toBe(3)
    const current = await listLedgerFacts(clienteId)
    expect(current).toHaveLength(1)
    expect(current[0]?.evidence.length).toBeGreaterThanOrEqual(2)
  })
})
