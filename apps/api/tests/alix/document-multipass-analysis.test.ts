import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IngestedDocument } from '../../src/services/alix/intake/types.js'

const provider = vi.hoisted(() => ({ enabled: true, calls: [] as string[], fail: '', fake: false }))
vi.mock('../../src/services/llm/OpenAIClient.js', () => ({
  isOpenAIEnabled: () => provider.enabled,
  generateStructured: async (messages: Array<{ content: string }>) => {
    const prompt = messages[0].content
    provider.calls.push(prompt)
    const text = String(JSON.parse(prompt).textoExtraido)
    if (provider.fail && text.includes(provider.fail)) throw new Error('Falha sintética do modelo')
    const quote = text.match(/Fato sintético [A-Z]+: [^.]+\./)?.[0] || ''
    return { data: { tipoDocumento: 'Contrato sintético', resumoExecutivo: 'Resumo', achadosChave: ['Alegação sem prova'], achadosFundamentados: quote ? [{ tipo: 'achado', descricao: quote, evidencia: provider.fake ? 'Fonte inexistente.' : quote }] : [], indicadores: [], riscos: [], lacunas: [], acoesSugeridas: [], acoesSistema: [], evidencias: quote ? [quote] : [] } }
  },
}))
vi.mock('../../src/services/llm/LLMConfig.js', () => ({ getModelForRole: () => 'fixture' }))
vi.mock('../../src/services/alix/intake/DocumentModelInput.js', () => ({ buildDocumentModelContent: async (_doc: unknown, prompt: string) => prompt }))

import { analyzeDocumentDeep } from '../../src/services/alix/intake/DocumentAnalysisService.js'
const document = (text: string): IngestedDocument => ({ id: 'fixture', sessionId: 'session-fixture', filename: 'contrato.txt', kind: 'text', mimetype: 'text/plain', sizeBytes: text.length, uploadedAt: '2026-09-07T00:00:00Z', extractedText: text, metadata: {} })
beforeEach(() => { provider.enabled = true; provider.calls.length = 0; provider.fail = ''; provider.fake = false; vi.stubEnv('ALIX_DEEP_ANALYSIS_MAX_SEGMENTS', '48') })
afterEach(() => vi.unstubAllEnvs())

describe('análise profunda por segmentos com retomada', () => {
  it('lê um fato no trecho que a amostragem antiga omitia e outro no final', async () => {
    const text = 'a'.repeat(110_000) + '\nFato sintético MEIO: garantia omitida pela amostragem.\n' + 'b'.repeat(210_000) + '\nFato sintético FIM: vencimento especial no último anexo.'
    const result = await analyzeDocumentDeep({ doc: document(text) })
    expect(result.readingCoverage).toMatchObject({ complete: true, analyzedCharacters: text.length })
    expect(result.achadosChave.join(' ')).toContain('garantia omitida')
    expect(result.achadosChave.join(' ')).toContain('vencimento especial')
    expect(provider.calls.length).toBeGreaterThan(3)
    expect(result.achadosChave.join(' ')).not.toContain('Alegação sem prova')
  })
  it('retoma somente segmentos restantes após o orçamento da rodada', async () => {
    vi.stubEnv('ALIX_DEEP_ANALYSIS_MAX_SEGMENTS', '1')
    const doc = document('x'.repeat(70_000) + '\nFato sintético FINAL: parcela extraordinária.')
    const first = await analyzeDocumentDeep({ doc })
    expect(first.readingCoverage).toMatchObject({ complete: false, analyzedSegments: 1, totalSegments: 3 })
    expect(first.aviso).toContain('Orçamento')
    const second = await analyzeDocumentDeep({ doc, previous: first })
    expect(second.readingCoverage?.analyzedSegments).toBe(2)
    const third = await analyzeDocumentDeep({ doc, previous: second })
    expect(third.readingCoverage?.complete).toBe(true)
    expect(provider.calls).toHaveLength(3)
    expect(third.achadosChave.join(' ')).toContain('parcela extraordinária')
  })
  it('falha no meio preserva leitura concluída e reexecuta apenas a parte falha', async () => {
    const doc = document('a'.repeat(32_000) + 'MARCADOR_FALHA' + 'b'.repeat(64_000))
    provider.fail = 'MARCADOR_FALHA'
    const first = await analyzeDocumentDeep({ doc })
    expect(first.readingCoverage?.complete).toBe(false)
    expect(first.readingCoverage?.failedSegments.length).toBeGreaterThan(0)
    const count = provider.calls.length
    provider.fail = ''
    const second = await analyzeDocumentDeep({ doc, previous: first })
    expect(second.readingCoverage?.complete).toBe(true)
    expect(provider.calls.length - count).toBe(first.readingCoverage?.pendingSegments.length)
  })
  it('rejeita evidência inventada e não reutiliza leitura de conteúdo alterado', async () => {
    provider.fake = true
    const first = await analyzeDocumentDeep({ doc: document('Fato sintético A: informação original.') })
    expect(first.achadosChave).toEqual([])
    provider.fake = false
    const second = await analyzeDocumentDeep({ doc: document('Fato sintético B: informação nova.'), previous: first })
    expect(provider.calls).toHaveLength(2)
    expect(second.achadosChave.join(' ')).toContain('informação nova')
  })
  it('não chama fallback determinístico de leitura integral nem ignora páginas sem OCR', async () => {
    provider.enabled = false
    const disabled = await analyzeDocumentDeep({ doc: document('Fato sintético A: garantia documentada.') })
    expect(disabled.readingCoverage).toMatchObject({ complete: false, analyzedSegments: 0 })
    provider.enabled = true
    const doc = document('Fato sintético A: garantia documentada.')
    doc.metadata.extractionCoverage = { status: 'partial', totalPages: 3, pendingPages: [2, 3], limitations: ['OCR pendente nas páginas 2 e 3.'] }
    const partial = await analyzeDocumentDeep({ doc })
    expect(partial.readingCoverage).toMatchObject({ complete: false, pendingSegments: [] })
    expect(partial.aviso).toContain('OCR pendente')
  })
})
