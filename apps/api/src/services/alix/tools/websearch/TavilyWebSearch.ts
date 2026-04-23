// ============================================================
// TavilyWebSearch — fallback quando Foundry não expõe web_search nativa
// ============================================================

import type { ClaudeTool } from '../../../llm/ClaudeFoundryClient.js';
import type { WebSearchOpts, WebSearchProvider, WebSearchResponse } from './types.js';

interface TavilyResponse {
  query: string;
  results: Array<{ title: string; url: string; content: string; score?: number }>;
}

export class TavilyWebSearch implements WebSearchProvider {
  name = 'tavily' as const;

  async available(): Promise<boolean> {
    return Boolean(process.env.TAVILY_API_KEY);
  }

  asClaudeTool(): ClaudeTool {
    return {
      name: 'web_search',
      description: 'Busca na web via Tavily. Retorna lista com título, URL, conteúdo resumido e score. Use include_domains para restringir; brOnly=true para sites .br (útil notícias agro BR).',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          max_results: { type: 'number', description: '1-10, default 5' },
          include_domains: { type: 'array', items: { type: 'string' } },
          exclude_domains: { type: 'array', items: { type: 'string' } },
          brOnly: { type: 'boolean' },
        },
        required: ['query'],
      },
    };
  }

  async search(query: string, opts: WebSearchOpts = {}): Promise<WebSearchResponse> {
    const key = process.env.TAVILY_API_KEY;
    if (!key) return { query, results: [], note: 'TAVILY_API_KEY não configurada' };

    const includeDomains = opts.include_domains ?? (opts.brOnly ? ['*.br'] : undefined);

    const body = {
      api_key: key,
      query,
      max_results: opts.max_results ?? 5,
      ...(includeDomains ? { include_domains: includeDomains } : {}),
      ...(opts.exclude_domains ? { exclude_domains: opts.exclude_domains } : {}),
      search_depth: 'basic',
    };

    try {
      const r = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) return { query, results: [], note: `Tavily HTTP ${r.status}` };
      const data = (await r.json()) as TavilyResponse;
      return {
        query,
        results: data.results.map(it => ({
          title: it.title,
          url: it.url,
          snippet: it.content,
          score: it.score,
          source: safeHost(it.url),
        })),
      };
    } catch (err) {
      return { query, results: [], note: `Tavily erro: ${(err as Error).message}` };
    }
  }
}

function safeHost(url: string): string | undefined {
  try { return new URL(url).hostname; } catch { return undefined; }
}
