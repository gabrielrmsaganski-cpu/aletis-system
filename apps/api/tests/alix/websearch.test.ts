import { test } from 'node:test';
import assert from 'node:assert';
import type { WebSearchProvider, WebSearchResult } from '../../src/services/alix/tools/websearch/types.ts';
import { ClaudeNativeWebSearch } from '../../src/services/alix/tools/websearch/ClaudeNativeWebSearch.ts';
import { TavilyWebSearch } from '../../src/services/alix/tools/websearch/TavilyWebSearch.ts';
import { WebSearchProviderFactory, resetProviderForTests } from '../../src/services/alix/tools/websearch/WebSearchProviderFactory.ts';

test('WebSearchResult tem shape mínimo', () => {
  const r: WebSearchResult = { title: 't', url: 'https://example.com', snippet: 's' };
  assert.strictEqual(r.title, 't');
});

test('WebSearchProvider contract shape', () => {
  const p: WebSearchProvider = {
    name: 'fake',
    available: async () => true,
    search: async () => ({ results: [], query: 'q' }),
    asClaudeTool: () => null,
  };
  assert.strictEqual(p.name, 'fake');
});

test('ClaudeNativeWebSearch.asClaudeTool retorna tool com type web_search_20250305', () => {
  const p = new ClaudeNativeWebSearch();
  const tool = p.asClaudeTool();
  assert.strictEqual(tool?.name, 'web_search');
  assert.strictEqual((tool as any).type, 'web_search_20250305');
});

test('TavilyWebSearch.available retorna false sem key', async () => {
  delete process.env.TAVILY_API_KEY;
  const p = new TavilyWebSearch();
  assert.strictEqual(await p.available(), false);
});

test('TavilyWebSearch.asClaudeTool retorna tool custom com schema', () => {
  const p = new TavilyWebSearch();
  const tool = p.asClaudeTool();
  assert.strictEqual(tool?.name, 'web_search');
  assert.ok(tool?.input_schema);
  assert.ok(((tool?.input_schema as any).required ?? []).includes('query'));
});

test('factory retorna Tavily se ALIX_WEB_SEARCH=tavily', async () => {
  process.env.ALIX_WEB_SEARCH = 'tavily';
  resetProviderForTests();
  const p = await WebSearchProviderFactory.get();
  assert.strictEqual(p.name, 'tavily');
});

test('factory retorna Claude native se ALIX_WEB_SEARCH=claude', async () => {
  process.env.ALIX_WEB_SEARCH = 'claude';
  resetProviderForTests();
  const p = await WebSearchProviderFactory.get();
  assert.strictEqual(p.name, 'claude-native');
});
