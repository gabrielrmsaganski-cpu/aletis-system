// ============================================================
// news — tool de notícias agro com cache (Fase A)
// ============================================================
// Usa web_search nativo da OpenAI com TTL de 30 minutos
// para servir notícias relevantes sem burst em cada mensagem.
//
// Queries padrão cobrem 4 eixos: macro/SELIC, safra/produção,
// crise/recuperação judicial, legislação rural/MCR.
// ============================================================
import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import { WebSearchProviderFactory } from './websearch/WebSearchProviderFactory.js'

type NewsCacheEntry = { at: number; data: unknown }

const CACHE_TTL_MS = 30 * 60 * 1000 // 30 min
const cache = new Map<string, NewsCacheEntry>()

// Queries default quando o LLM não passa nada específico.
const QUERIES_DEFAULT = [
  'Selic Copom decisão última reunião',
  'safra 2026 Brasil soja milho produção',
  'recuperação judicial agro 2026 Brasil',
  'MCR crédito rural plano safra Brasil',
]

function cacheKey(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ')
}

function getCached(q: string): unknown | null {
  const e = cache.get(cacheKey(q))
  if (!e) return null
  if (Date.now() - e.at > CACHE_TTL_MS) {
    cache.delete(cacheKey(q))
    return null
  }
  return e.data
}

function setCached(q: string, data: unknown): void {
  cache.set(cacheKey(q), { at: Date.now(), data })
}

export function buildNewsTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}

  tools.push({
    name: 'noticias_agro_hoje',
    description:
      'Retorna notícias recentes de macro/safra/crise/legislação agro brasileira. Usa cache de 30min para não desperdiçar busca. Aceita queries customizadas; sem query, traz panorama dos 4 eixos principais.',
    input_schema: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Lista de queries específicas; se vazio, usa panorama default (Selic, safra, crise agro, MCR).',
        },
        topico: {
          type: 'string',
          description: 'Atalho: "macro" | "safra" | "crise" | "legislacao"',
          enum: ['macro', 'safra', 'crise', 'legislacao'],
        },
      },
    },
  })
  registry['noticias_agro_hoje'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const provider = WebSearchProviderFactory.getSync() || (await WebSearchProviderFactory.warmUp())
      if (!provider || !(await provider.available())) {
        return {
          error: 'OpenAI web_search indisponivel',
          hint: 'Configure OPENAI_API_KEY para habilitar noticias atuais.',
        }
      }

      const queries = Array.isArray(input.queries) && input.queries.length > 0
        ? (input.queries as string[]).slice(0, 6)
        : input.topico === 'macro'
          ? [QUERIES_DEFAULT[0]]
          : input.topico === 'safra'
            ? [QUERIES_DEFAULT[1]]
            : input.topico === 'crise'
              ? [QUERIES_DEFAULT[2]]
              : input.topico === 'legislacao'
                ? [QUERIES_DEFAULT[3]]
                : QUERIES_DEFAULT

      const out: Record<string, unknown> = { kind: provider.name, cached: false, resultados: {} }
      for (const q of queries) {
        const cached = getCached(q)
        if (cached) {
          ;(out.resultados as Record<string, unknown>)[q] = cached
          continue
        }
        try {
          const r = await provider.search(q, { max_results: 5, brOnly: true })
          setCached(q, r)
          ;(out.resultados as Record<string, unknown>)[q] = r
        } catch (err) {
          ;(out.resultados as Record<string, unknown>)[q] = { error: (err as Error).message }
        }
      }
      return out
    },
  }

  return { tools, registry }
}
