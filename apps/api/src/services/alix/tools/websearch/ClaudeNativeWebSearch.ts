// ============================================================
// ClaudeNativeWebSearch — wrapper p/ web_search_20250305
// ============================================================

import type { ClaudeTool } from '../../../llm/ClaudeFoundryClient.js';
import { pingFoundryWebSearch } from '../../../llm/ClaudeFoundryClient.js';
import type { WebSearchOpts, WebSearchProvider, WebSearchResponse } from './types.js';

export class ClaudeNativeWebSearch implements WebSearchProvider {
  name = 'claude-native' as const;
  private _available: boolean | null = null;

  async available(): Promise<boolean> {
    if (this._available !== null) return this._available;
    try {
      const res = await pingFoundryWebSearch();
      this._available = res.supported;
    } catch {
      this._available = false;
    }
    return this._available;
  }

  asClaudeTool(): ClaudeTool {
    // O SDK Anthropic usa `type: 'web_search_20250305'` para ativar o tool nativo.
    // Nosso tipo ClaudeTool é restrito → cast. Foundry aceita passar assim.
    return {
      name: 'web_search',
      description: 'Busca na web pública.',
      type: 'web_search_20250305',
    } as unknown as ClaudeTool;
  }

  async search(query: string, _opts?: WebSearchOpts): Promise<WebSearchResponse> {
    // Com provider nativo, a busca é executada PELO LLM dentro do loop — este método
    // só existe p/ chamadas diretas em scripts. O flow normal é expor o tool
    // via asClaudeTool() e deixar o modelo invocar.
    return {
      query,
      results: [],
      note: 'ClaudeNativeWebSearch: busca é feita pelo LLM durante o tool-use; use asClaudeTool().',
    };
  }
}
