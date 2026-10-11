import { test } from 'vitest'
import assert from 'node:assert'
import type { WebSearchProvider, WebSearchResult } from '../../src/services/alix/tools/websearch/types.ts'
import { OpenAIWebSearch } from '../../src/services/alix/tools/websearch/OpenAIWebSearch.ts'
import { WebSearchProviderFactory, resetProviderForTests } from '../../src/services/alix/tools/websearch/WebSearchProviderFactory.ts'

test('WebSearchResult tem shape minimo', () => {
  const result: WebSearchResult = { title: 't', url: 'https://example.com', snippet: 's' }
  assert.strictEqual(result.title, 't')
})

test('WebSearchProvider contract aceita OpenAI', () => {
  const provider: WebSearchProvider = {
    name: 'openai',
    available: async () => true,
    search: async () => ({ results: [], query: 'q' }),
    asLLMTool: () => null,
  }
  assert.strictEqual(provider.name, 'openai')
})

test('OpenAIWebSearch expoe schema de busca completo', () => {
  const tool = new OpenAIWebSearch().asLLMTool()
  assert.strictEqual(tool.name, 'web_search')
  assert.ok((tool.input_schema.required ?? []).includes('query'))
  assert.ok((tool.input_schema.properties as Record<string, unknown>).include_domains)
})

test('factory sempre retorna o provider OpenAI', async () => {
  resetProviderForTests()
  const provider = await WebSearchProviderFactory.get()
  assert.strictEqual(provider.name, 'openai')
})
