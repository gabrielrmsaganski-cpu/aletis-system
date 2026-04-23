// ============================================================
// WebSearchProviderFactory — auto-detect + singleton
// Boot loga qual provider foi escolhido.
// ============================================================

import type { WebSearchProvider } from './types.js';
import { ClaudeNativeWebSearch } from './ClaudeNativeWebSearch.js';
import { TavilyWebSearch } from './TavilyWebSearch.js';

let cached: WebSearchProvider | null = null;

export function resetProviderForTests(): void {
  cached = null;
}

async function detect(): Promise<WebSearchProvider> {
  const forced = process.env.ALIX_WEB_SEARCH?.toLowerCase();
  if (forced === 'tavily') {
    console.log('[ALIX] WebSearch: tavily (forçado via ALIX_WEB_SEARCH)');
    return new TavilyWebSearch();
  }
  if (forced === 'claude') {
    console.log('[ALIX] WebSearch: claude-native (forçado via ALIX_WEB_SEARCH)');
    return new ClaudeNativeWebSearch();
  }

  const native = new ClaudeNativeWebSearch();
  if (await native.available()) {
    console.log('[ALIX] WebSearch: claude-native (auto-detect)');
    return native;
  }

  const tavily = new TavilyWebSearch();
  if (await tavily.available()) {
    console.log('[ALIX] WebSearch: tavily (fallback — sem suporte nativo)');
    return tavily;
  }

  console.warn('[ALIX] WebSearch: NENHUM provider disponível. Tools de web não funcionarão.');
  return tavily; // retorna mas available()=false — chamadas vão ignorar
}

export const WebSearchProviderFactory = {
  async get(): Promise<WebSearchProvider> {
    if (!cached) cached = await detect();
    return cached;
  },
  /** Retorna provider já cached ou null. Útil em contextos síncronos. */
  getSync(): WebSearchProvider | null {
    return cached;
  },
  /** Warm-up no boot: resolve provider e cacheia. */
  async warmUp(): Promise<WebSearchProvider> {
    return this.get();
  },
};
