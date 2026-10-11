import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IngestedDocument } from '../../src/services/alix/intake/types.js'

const provider = vi.hoisted(() => ({ enabled: false, fields: [] as Record<string, unknown>[] }))
vi.mock('../../src/services/llm/OpenAIClient.js', () => ({ isOpenAIEnabled: () => provider.enabled, generateStructured: async () => ({ data: { fields: provider.fields } }) }))
vi.mock('../../src/services/llm/LLMConfig.js', () => ({ getModelForRole: () => 'fixture' }))
vi.mock('../../src/services/alix/intake/DocumentModelInput.js', () => ({ buildDocumentModelContent: async (_doc: unknown, text: string) => text }))
vi.mock('../../src/services/alix/extraction/DocumentClassifierV2.js', () => ({ classifyDocument: vi.fn(() => { throw new Error('Classificador externo não permitido') }) }))

import { extractSpecializedDocument } from '../../src/services/alix/extraction/SpecializedDocumentExtractor.js'

const classification = { type: 'contrato' as const, confidence: 1, method: 'content' as const, signals: [] }
const document = (text: string, metadata = {}): IngestedDocument => ({ id: 'fixture', sessionId: 'fixture', filename: 'fixture.pdf', kind: 'pdf', mimetype: 'application/pdf', sizeBytes: text.length, uploadedAt: '2026-09-06T00:00:00Z', extractedText: text, metadata })
beforeEach(() => { provider.enabled = false; provider.fields = [] })

describe('prova documental no extrator real', () => {
  for (const offset of [0, 2400, 40_000]) {
    it(`preserva evidência smart no caractere ${offset}`, async () => {
      const quote = 'A entidade beneficiária é Cooperativa Sintética.'
      const result = await extractSpecializedDocument(document('x'.repeat(offset) + quote, { smartExtraction: { evidencias: [{ field: 'credor_nome', value: 'Cooperativa Sintética', trecho: quote, confianca: 0.99 }] } }), classification)
      expect(result.fields).toContainEqual(expect.objectContaining({ fieldKey: 'credor_nome', valueText: 'Cooperativa Sintética', extractor: 'smart' }))
    })
    it(`preserva evidência structured no caractere ${offset}`, async () => {
      provider.enabled = true
      const quote = 'A entidade beneficiária é Cooperativa Sintética.'
      provider.fields = [{ fieldKey: 'credor_nome', valueText: 'Cooperativa Sintética', evidenceText: quote, confidence: 0.99 }]
      const result = await extractSpecializedDocument(document('x'.repeat(offset) + quote), classification)
      expect(result.fields).toContainEqual(expect.objectContaining({ fieldKey: 'credor_nome', extractor: 'structured_output' }))
    })
  }
  it.each(['smart', 'structured'])('rejeita nome inventado com trecho verdadeiro em %s', async channel => {
    const quote = 'As partes devem conferir os dados antes do cadastro.'
    provider.enabled = channel === 'structured'
    provider.fields = [{ fieldKey: 'credor_nome', valueText: 'Cooperativa Inventada', evidenceText: quote, confidence: 0.99 }]
    const metadata = channel === 'smart' ? { smartExtraction: { evidencias: [{ field: 'credor_nome', value: 'Cooperativa Inventada', trecho: quote, confianca: 0.99 }] } } : {}
    const result = await extractSpecializedDocument(document(quote, metadata), classification)
    expect(result.fields.find(field => field.fieldKey === 'credor_nome')).toBeUndefined()
  })
  it('rejeita trecho inventado mesmo com nome correto', async () => {
    provider.enabled = true
    provider.fields = [{ fieldKey: 'credor_nome', valueText: 'Cooperativa Sintética', evidenceText: 'Este trecho inventado cita Cooperativa Sintética.', confidence: 0.99 }]
    const result = await extractSpecializedDocument(document('Entidade: Cooperativa Sintética.'), classification)
    expect(result.fields).toEqual([])
  })
  it('aceita identificador com formatação e rejeita valor numérico divergente', async () => {
    provider.enabled = true
    const quote = 'Identificador informado: 123.456.789-09. Montante comprovado: 123,00.'
    provider.fields = [
      { fieldKey: 'devedor_cpf_cnpj', valueText: '12345678909', evidenceText: quote, confidence: 0.99 },
      { fieldKey: 'valor_original', valueText: '777,00', evidenceText: quote, confidence: 0.99 },
    ]
    const result = await extractSpecializedDocument(document(quote), classification)
    expect(result.fields.map(field => field.fieldKey)).toEqual(['devedor_cpf_cnpj'])
  })
  it.each([['1500,00', '500,00'], ['500,99', '500']])('não aceita %s como prova de %s', async (observed, value) => {
    provider.enabled = true
    const quote = `O montante indicado é ${observed}.`
    provider.fields = [{ fieldKey: 'valor_original', valueText: value, evidenceText: quote, confidence: 0.99 }]
    const result = await extractSpecializedDocument(document(quote), classification)
    expect(result.fields).toEqual([])
  })
})
