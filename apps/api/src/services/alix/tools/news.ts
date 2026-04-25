// ============================================================
// news — tool de notícias agro com cache (Fase A)
// ============================================================
// Usa o provider de web search (Claude nativo > Tavily) com TTL 30min
// para servir notícias relevantes sem burst em cada mensagem.
//
// Queries padrão cobrem 4 eixos: macro/SELIC, safra/produção,
// crise/recuperação judicial, legislação rural/MCR.
// ============================================================
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js'
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

export function buildNewsTools(): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  const tools: ClaudeTool[] = []
  const registry: ClaudeToolRegistry = {}

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
      if (!provider) {
        return {
          error: 'nenhum provider de web search disponível (Claude nativo não suporta este Foundry e TAVILY_API_KEY não configurada)',
          hint: 'Defina TAVILY_API_KEY no .env ou aguarde a Fase de auth; notícias indisponíveis hoje.',
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

      // Se o provider é Claude nativo, delegamos via tool embutida — retornamos
      // uma instrução pro LLM chamar `web_search` com essas queries. Se for
      // Tavily (ou outro com .search()), executamos aqui e cacheamos.
      if (typeof (provider as any).search === 'function' && provider.name !== 'claude-native') {
        const out: Record<string, unknown> = { kind: provider.name, cached: false, resultados: {} }
        for (const q of queries) {
          const cached = getCached(q)
          if (cached) {
            ;(out.resultados as Record<string, unknown>)[q] = cached
            continue
          }
          try {
            const r = await (provider as any).search(q, { maxResults: 5 })
            setCached(q, r)
            ;(out.resultados as Record<string, unknown>)[q] = r
          } catch (err) {
            ;(out.resultados as Record<string, unknown>)[q] = { error: (err as Error).message }
          }
        }
        return out
      }

      // Claude nativo — retornamos hint para o LLM usar `web_search` tool.
      return {
        kind: provider.name,
        hint: 'Use a tool web_search embutida do Claude nativo com cada uma destas queries — elas são cacheadas pelo infraprovider.',
        queries,
      }
    },
  }

  return { tools, registry }
}
