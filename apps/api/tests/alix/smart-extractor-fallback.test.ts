import assert from 'node:assert'
import { afterEach, beforeEach, test } from 'vitest'
import { smartExtract } from '../../src/services/alix/extraction/SmartExtractor.ts'
import type { IngestedDocument } from '../../src/services/alix/intake/types.ts'

let previousKey: string | undefined
let previousUseLlm: string | undefined

beforeEach(() => {
  previousKey = process.env.OPENAI_API_KEY
  previousUseLlm = process.env.ALIX_USE_LLM
  process.env.OPENAI_API_KEY = ''
  process.env.ALIX_USE_LLM = 'false'
})

afterEach(() => {
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = previousKey
  if (previousUseLlm === undefined) delete process.env.ALIX_USE_LLM
  else process.env.ALIX_USE_LLM = previousUseLlm
})

test('extrai campos CRM e evidências sem depender da IA', async () => {
  const doc: IngestedDocument = {
    id: 'doc-fallback-1',
    sessionId: 'crm-intake-test-fallback',
    filename: 'contrato-credito-rural.txt',
    mimetype: 'text/plain',
    sizeBytes: 420,
    uploadedAt: new Date().toISOString(),
    kind: 'text',
    extractedText: [
      'CONTRATO DE CRÉDITO RURAL PRONAMP',
      'Devedor: Fazenda Boa Esperança Ltda',
      'CNPJ: 12.345.678/0001-90',
      'Município: Canarana',
      'UF: MT',
      'Banco: Banco do Brasil',
      'Saldo devedor: R$ 1.250.000,50',
      'Vencimento: 28/02/2027',
      'Área total: 1.850,75 ha',
      'E-mail: financeiro@boaesperanca.com.br',
    ].join('\n'),
    metadata: {},
  }

  const extracted = await smartExtract(doc)
  assert.ok(extracted.result)
  assert.strictEqual(extracted.result.clienteData.nome, 'Fazenda Boa Esperança Ltda')
  assert.strictEqual(extracted.result.clienteData.cpfCnpj, '12345678000190')
  assert.strictEqual(extracted.result.clienteData.cidade, 'Canarana')
  assert.strictEqual(extracted.result.clienteData.uf, 'MT')
  assert.strictEqual(extracted.result.dividas[0]?.valorAtualizado, 1_250_000.5)
  assert.strictEqual(extracted.result.dividas[0]?.vencimento, '2027-02-28')
  assert.ok(extracted.result.evidencias.some((evidence) => evidence.field === 'valorTotalDivida'))
})
