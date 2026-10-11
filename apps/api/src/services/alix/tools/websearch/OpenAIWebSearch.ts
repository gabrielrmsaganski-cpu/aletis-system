// ============================================================
// Busca web nativa da OpenAI Responses API
// ============================================================

import type { LLMTool } from '../../../llm/OpenAIClient.js'
import { searchOpenAIWeb } from '../../../llm/OpenAIClient.js'
import { isOpenAIAuxiliaryEnabled } from '../../../llm/ProviderConfig.js'
import { getModelForRole } from '../../../llm/LLMConfig.js'
import type { WebSearchOpts, WebSearchProvider, WebSearchResponse } from './types.js'

export class OpenAIWebSearch implements WebSearchProvider {
  name = 'openai' as const

  async available(): Promise<boolean> {
    return isOpenAIAuxiliaryEnabled()
  }

  asLLMTool(): LLMTool {
    return {
      name: 'web_search',
      description: 'Pesquisa a web atual pela OpenAI e retorna fontes verificaveis com titulo, URL e resumo.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Consulta objetiva a pesquisar' },
          max_results: { type: 'integer', minimum: 1, maximum: 10 },
          include_domains: { type: 'array', items: { type: 'string' } },
          exclude_domains: { type: 'array', items: { type: 'string' } },
          brOnly: { type: 'boolean' },
        },
        required: ['query'],
      },
    }
  }

  async search(query: string, opts: WebSearchOpts = {}): Promise<WebSearchResponse> {
    const normalized = query.trim()
    if (!normalized) return { query, results: [], note: 'Consulta vazia' }
    try {
      const response = await searchOpenAIWeb(normalized, getModelForRole('web_researcher'), {
        allowedDomains: opts.include_domains,
        excludedDomains: opts.exclude_domains,
        brOnly: opts.brOnly,
        maxResults: opts.max_results,
      })
      return {
        query: normalized,
        results: response.results.map((item) => ({
          ...item,
          source: (() => { try { return new URL(item.url).hostname } catch { return 'openai-web-search' } })(),
        })),
        note: response.results.length ? undefined : response.text || 'Nenhuma fonte encontrada',
      }
    } catch (error) {
      return { query: normalized, results: [], note: `OpenAI web_search: ${(error as Error).message}` }
    }
  }
}
