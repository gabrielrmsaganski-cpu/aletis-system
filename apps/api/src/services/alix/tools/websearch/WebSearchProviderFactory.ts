import type { WebSearchProvider } from './types.js'
import { OpenAIWebSearch } from './OpenAIWebSearch.js'

let cached: WebSearchProvider | null = null

export function resetProviderForTests(): void {
  cached = null
}

export const WebSearchProviderFactory = {
  async get(): Promise<WebSearchProvider> {
    if (!cached) cached = new OpenAIWebSearch()
    return cached
  },
  getSync(): WebSearchProvider | null {
    return cached
  },
  async warmUp(): Promise<WebSearchProvider> {
    return this.get()
  },
}
