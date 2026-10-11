import { describe, expect, it } from 'vitest'
import { collectWebSearchSources } from '../../src/services/llm/OpenAIClient.js'

describe('fontes da pesquisa web', () => {
  it('prioriza a URL citada antes do corte de resultados periféricos', () => {
    const response = { output: [
      { type: 'web_search_call', action: { sources: [
        { url: 'https://example.test/peripheral', title: 'Periférico' },
        { url: 'https://example.test/relevant', title: 'Fonte', snippet: 'Trecho real do provedor' },
      ] } },
      { type: 'message', content: [{ annotations: [{ type: 'url_citation', url: 'https://example.test/relevant', title: 'Fonte citada' }] }] },
    ] }
    expect(collectWebSearchSources(response, 1)).toEqual([{ url: 'https://example.test/relevant', title: 'Fonte citada', snippet: 'Trecho real do provedor' }])
  })

  it('não transforma texto gerado em trecho documental quando falta snippet', () => {
    expect(collectWebSearchSources({ output: [{ type: 'message', content: [{ text: 'Afirmação gerada', annotations: [{ type: 'url_citation', url: 'https://example.test', title: 'Fonte' }] }] }] })[0].snippet).toBe('')
  })
})
