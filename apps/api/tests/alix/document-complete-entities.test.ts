import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const provider = vi.hoisted(() => ({ calls: [] as string[], fail: '', fake: false }))
vi.mock('../../src/services/llm/OpenAIClient.js', () => ({
  isOpenAIEnabled: () => true,
  generateStructured: async (messages: Array<{ content: string }>) => {
    const text = messages[0].content; provider.calls.push(text)
    if (provider.fail && text.includes(provider.fail)) throw new Error('Falha sintética')
    const quote = text.match(/Credor: Banco Sintético Final/)?.[0]
    return { data: { tipoDocumento: 'Contrato', entidades: quote ? [{ tipo: 'banco', categoria: 'credor', nome: 'Banco Sintético Final', fonte: provider.fake ? 'Fonte inventada' : quote, confianca: .95 }] : [], resumoExecutivo: 'Segmento analisado', acoesSugeridas: [], camposEstruturados: [] } }
  },
}))
vi.mock('../../src/services/llm/LLMConfig.js', () => ({ getModelForRole: () => 'fixture' }))
import { extractEntitiesFromDocument } from '../../src/services/alix/intake/DocEntityExtractor.js'
beforeEach(() => { provider.calls.length = 0; provider.fail = ''; provider.fake = false; vi.stubEnv('ALIX_ENTITY_MAX_SEGMENTS', '16') })
afterEach(() => vi.unstubAllEnvs())

describe('extração de entidades por todas as faixas', () => {
  it('encontra e fundamenta entidade após o antigo corte de12000 caracteres', async () => {
    const text = 'x'.repeat(34_000) + '\nCredor: Banco Sintético Final'
    const result = await extractEntitiesFromDocument({ text, kind: 'text' })
    expect(result?.entidades).toContainEqual(expect.objectContaining({ nome: 'Banco Sintético Final', fonte: 'Credor: Banco Sintético Final' }))
    expect(result?.readingCoverage).toMatchObject({ complete: true, analyzedCharacters: text.length })
    expect(provider.calls).toHaveLength(3)
  })
  it('retorna cobertura parcial quando o orçamento termina', async () => {
    vi.stubEnv('ALIX_ENTITY_MAX_SEGMENTS', '1')
    const result = await extractEntitiesFromDocument({ text: 'x'.repeat(34_000) + '\nCredor: Banco Sintético Final', kind: 'text' })
    expect(result?.readingCoverage).toMatchObject({ complete: false, analyzedSegments: 1, pendingSegments: [1, 2] })
    expect(result?.entidades).toEqual([])
  })
  it('falha parcial não descarta entidades de outro segmento nem finge leitura completa', async () => {
    provider.fail = 'ERRO_FIXTURE'
    const result = await extractEntitiesFromDocument({ text: 'ERRO_FIXTURE' + 'x'.repeat(34_000) + '\nCredor: Banco Sintético Final', kind: 'text' })
    expect(result?.readingCoverage?.failedSegments).toEqual([0])
    expect(result?.readingCoverage?.complete).toBe(false)
    expect(result?.entidades[0]?.nome).toBe('Banco Sintético Final')
  })
  it('rejeita fonte inexistente em qualquer parte do documento', async () => {
    provider.fake = true
    const result = await extractEntitiesFromDocument({ text: 'x'.repeat(20_000) + '\nCredor: Banco Sintético Final', kind: 'text' })
    expect(result?.entidades).toEqual([])
  })
})
