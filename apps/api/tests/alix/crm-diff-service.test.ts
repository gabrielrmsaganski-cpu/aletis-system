import { test } from 'vitest'
import assert from 'node:assert'
import { buildClienteDocumentDiff } from '../../src/services/alix/crm/CrmDiffService.ts'

test('buildClienteDocumentDiff separa preenchimentos, novos anexos e conflitos', () => {
  const diff = buildClienteDocumentDiff(
    {
      id: 'cli-1',
      nome: 'Cliente Teste',
      cidade: 'Toledo',
      telefone: '',
      culturas: ['soja'],
      dividas: [
        { numeroContrato: 'CCR-001', credor: 'Banco Alfa', valorAtualizado: 100000 },
      ],
      propriedades: [
        { car: 'PR-123', municipio: 'Toledo', areaHa: 100 },
      ],
    },
    {
      cidade: 'Cascavel',
      telefone: '(45) 99999-9999',
      culturas: ['soja', 'milho'],
      dividas: [
        { numeroContrato: 'CCR-001', credor: 'Banco Alfa', valorAtualizado: 120000 },
        { numeroContrato: 'CCR-002', credor: 'Banco Beta', valorAtualizado: 50000 },
      ],
      propriedades: [
        { car: 'PR-123', municipio: 'Toledo', areaHa: 110 },
        { car: 'PR-456', municipio: 'Cascavel', areaHa: 80 },
      ],
    },
  )

  assert.strictEqual(diff.summary.camposNovos, 1)
  assert.strictEqual(diff.summary.camposConflitantes, 2)
  assert.strictEqual(diff.summary.dividasNovas, 1)
  assert.strictEqual(diff.summary.dividasConflitantes, 1)
  assert.strictEqual(diff.summary.propriedadesNovas, 1)
  assert.strictEqual(diff.summary.propriedadesConflitantes, 1)
  assert.strictEqual(diff.summary.totalConflitos, 4)
  assert.strictEqual(diff.novosCampos[0].field, 'telefone')
  assert.strictEqual(diff.dividasConflitantes[0].fields.includes('valorAtualizado'), true)
  assert.strictEqual(diff.propriedadesConflitantes[0].fields.includes('areaHa'), true)
})
