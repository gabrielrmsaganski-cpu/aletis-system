// ============================================================
// fetch_url — GET HTTP + readability → markdown limpo
// Leitura progressiva com timeout de 15s e limite de 8 MB (configurável até 16 MB).
// ============================================================

import type { LLMTool, LLMToolRegistry } from '../../../llm/OpenAIClient.js';
import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability } from '@mozilla/readability';

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const ABSOLUTE_MAX_BYTES = 16 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

function maxPageBytes(): number {
  const value = Number(process.env.ALIX_WEB_FETCH_MAX_BYTES || DEFAULT_MAX_BYTES);
  return Number.isFinite(value) && value > 0 ? Math.min(Math.max(1, Math.floor(value)), ABSOLUTE_MAX_BYTES) : DEFAULT_MAX_BYTES;
}

class PageTooLargeError extends Error {
  constructor(public readonly limitBytes: number) {
    super(`Página excede o limite de leitura (${Number((limitBytes / 1024 / 1024).toFixed(2))} MB)`);
  }
}

async function readHtmlLimited(response: Response, controller: AbortController, limit: number): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel().catch(() => undefined);
    controller.abort();
    throw new PageTooLargeError(limit);
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  const parts: string[] = [];
  let total = 0;
  const cancelReader = () => { void reader.cancel(controller.signal.reason).catch(() => undefined); };
  controller.signal.addEventListener('abort', cancelReader, { once: true });
  try {
    while (true) {
      controller.signal.throwIfAborted();
      const { value, done } = await reader.read();
      controller.signal.throwIfAborted();
      if (done) break;
      total += value.byteLength;
      // O total mede os bytes recebidos/descomprimidos; Content-Length não basta.
      if (total > limit) {
        await reader.cancel();
        controller.abort();
        throw new PageTooLargeError(limit);
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join('');
  } finally {
    controller.signal.removeEventListener('abort', cancelReader);
    reader.releaseLock();
  }
}

export function buildFetchUrlTool(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tool: LLMTool = {
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

  const registry: LLMToolRegistry = {
    fetch_url: {
      spec: tool,
      handler: async (input) => {
        const url = String(input.url || '');
        const requestedChars = Number(input.max_chars ?? 8000);
        const maxChars = Number.isFinite(requestedChars) && requestedChars > 0 ? Math.min(Math.max(1, Math.floor(requestedChars)), 20000) : 8000;
        if (!/^https?:\/\//i.test(url)) {
          return { error: 'URL inválida: aceita apenas http:// ou https://' };
        }
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
          const r = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 ALETIS-Alix/1.0' } });
          if (!r.ok) {
            await r.body?.cancel().catch(() => undefined);
            return { error: `HTTP ${r.status}`, url };
          }
          const html = await readHtmlLimited(r, ctrl, maxPageBytes());
          ctrl.signal.throwIfAborted();
          // A extração não renderiza CSS; diagnósticos de estilos modernos não devem despejar a página no log.
          const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
          const article = (() => {
            try { return new Readability(dom.window.document).parse(); }
            finally { dom.window.close(); }
          })();
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
          return { error: (err as Error).message, url,
            ...(err instanceof PageTooLargeError ? { code: 'page_too_large', limitBytes: err.limitBytes } : {}),
          };
        } finally {
          clearTimeout(to);
        }
      },
    },
  };

  return { tools: [tool], registry };
}
