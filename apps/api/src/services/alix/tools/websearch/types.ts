// ============================================================
// WebSearchProvider — abstração p/ web search no Alix
// ============================================================

import type { ClaudeTool } from '../../../llm/ClaudeFoundryClient.js';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
  /** Fonte da resposta — domínio ou nome do scraper. */
  source?: string;
}

export interface WebSearchOpts {
  max_results?: number;
  include_domains?: string[];
  exclude_domains?: string[];
  /** Usa filtro site:*.br quando true */
  brOnly?: boolean;
}

export interface WebSearchResponse {
  query: string;
  results: WebSearchResult[];
  /** Observação/erro quando provider não retornou resultados. */
  note?: string;
}

export interface WebSearchProvider {
  name: 'claude-native' | 'tavily' | 'fake';
  /** Verifica se provider está disponível (ex: key configurada). */
  available(): Promise<boolean>;
  /** Executa busca direta (usado por scraping / tests). */
  search(query: string, opts?: WebSearchOpts): Promise<WebSearchResponse>;
  /** Retorna o tool-spec que deve ser passado ao LLM — ou null se provider usa tool-use que o LLM executa (nativa). */
  asClaudeTool(): ClaudeTool | null;
}
