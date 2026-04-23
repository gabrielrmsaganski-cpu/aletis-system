// ============================================================
// fetch_url — GET HTTP + readability → markdown limpo
// Blindagem: só http/https, timeout 15s, max 1MB
// ============================================================

import type { ClaudeTool, ClaudeToolRegistry } from '../../../llm/ClaudeFoundryClient.js';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 15_000;

export function buildFetchUrlTool(): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  const tool: ClaudeTool = {
    name: 'fetch_url',
    description: 'Baixa uma página web e retorna o conteúdo principal limpo (via readability). Use APÓS web_search achar uma URL interessante para ler o conteúdo completo.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL HTTP/HTTPS' },
        max_chars: { type: 'number', description: 'Limite de caracteres retornados. Default 8000.' },
      },
      required: ['url'],
    },
  };

  const registry: ClaudeToolRegistry = {
    fetch_url: {
      spec: tool,
      handler: async (input) => {
        const url = String(input.url || '');
        const maxChars = Math.min(Number(input.max_chars ?? 8000), 20000);
        if (!/^https?:\/\//i.test(url)) {
          return { error: 'URL inválida: aceita apenas http:// ou https://' };
        }
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
          const r = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 ALETIS-Alix/1.0' } });
          if (!r.ok) return { error: `HTTP ${r.status}`, url };
          const buf = await r.arrayBuffer();
          if (buf.byteLength > MAX_BYTES) return { error: 'Página muito grande (>1MB)', url };
          const html = new TextDecoder('utf-8').decode(buf);
          const dom = new JSDOM(html, { url });
          const reader = new Readability(dom.window.document);
          const article = reader.parse();
          if (!article) return { error: 'Não conseguiu extrair conteúdo legível', url, rawLength: html.length };
          const text = (article.textContent || '').trim();
          return {
            ok: true,
            url,
            title: article.title,
            byline: article.byline,
            excerpt: article.excerpt,
            content: text.length > maxChars ? text.slice(0, maxChars) + '…' : text,
            contentChars: text.length,
            truncated: text.length > maxChars,
          };
        } catch (err) {
          return { error: (err as Error).message, url };
        } finally {
          clearTimeout(to);
        }
      },
    },
  };

  return { tools: [tool], registry };
}
