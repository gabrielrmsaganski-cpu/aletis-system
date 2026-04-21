// ============================================================
// ALETIS — Claude Foundry Client
// Wraps Anthropic SDK against Azure AI Foundry endpoint (Claude Sonnet 4.6)
// Auth: DefaultAzureCredential (AAD Bearer) com cache de token ~55min.
// Fallback: api-key (AZURE_SPEECH_KEY — mesma chave do recurso ALETISAI2).
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { DefaultAzureCredential, type AccessToken } from '@azure/identity';

// ── Config via env (todos com defaults sensatos) ─────────────

const BASE_URL = process.env.CLAUDE_FOUNDRY_BASE_URL || 'https://aletisai2.services.ai.azure.com';
const API_VERSION = process.env.CLAUDE_FOUNDRY_API_VERSION || '2024-10-21';
const ANTHROPIC_VERSION = '2023-06-01';
const AAD_SCOPE = 'https://cognitiveservices.azure.com/.default';

export const CLAUDE_MODEL_SONNET = process.env.CLAUDE_MODEL_SONNET || 'claude-sonnet-4-6';
export const CLAUDE_MODEL_HAIKU = process.env.CLAUDE_MODEL_HAIKU || 'claude-haiku-4-5';
export const CLAUDE_MODEL_OPUS = process.env.CLAUDE_MODEL_OPUS || 'claude-opus-4-7';

// Key fallback — reutilizamos a key do AIServices já presente em .env
const API_KEY_FALLBACK = process.env.AZURE_AI_SERVICES_KEY || process.env.AZURE_SPEECH_KEY;

// Renova token ~5min antes de expirar (AAD normalmente expira em 1h)
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ── Token cache ─────────────────────────────────────────────

class TokenCache {
  private cred: DefaultAzureCredential | null = null;
  private cached: AccessToken | null = null;
  private inflight: Promise<AccessToken> | null = null;

  private getCred(): DefaultAzureCredential {
    if (!this.cred) this.cred = new DefaultAzureCredential();
    return this.cred;
  }

  async get(): Promise<string | null> {
    const now = Date.now();
    if (this.cached && this.cached.expiresOnTimestamp - TOKEN_REFRESH_BUFFER_MS > now) {
      return this.cached.token;
    }
    if (this.inflight) {
      const t = await this.inflight;
      return t.token;
    }
    this.inflight = (async () => {
      const cred = this.getCred();
      const tok = await cred.getToken(AAD_SCOPE);
      if (!tok) throw new Error('DefaultAzureCredential retornou token vazio');
      return tok;
    })();
    try {
      const tok = await this.inflight;
      this.cached = tok;
      return tok.token;
    } catch {
      return null;
    } finally {
      this.inflight = null;
    }
  }

  reset(): void {
    this.cached = null;
  }
}

const tokenCache = new TokenCache();

// ── Anthropic client singleton ──────────────────────────────

let anthropicInstance: Anthropic | null = null;
let usingKeyAuth = false;

async function getClient(): Promise<Anthropic> {
  if (anthropicInstance) return anthropicInstance;

  // 1) Tenta AAD Bearer token
  const token = await tokenCache.get();
  if (token) {
    anthropicInstance = new Anthropic({
      baseURL: `${BASE_URL}/anthropic`,
      authToken: token,
      defaultHeaders: { 'anthropic-version': ANTHROPIC_VERSION },
      defaultQuery: { 'api-version': API_VERSION },
    });
    usingKeyAuth = false;
    return anthropicInstance;
  }

  // 2) Fallback para api-key header (AZURE_SPEECH_KEY)
  if (!API_KEY_FALLBACK) {
    throw new Error('Foundry auth indisponível: sem token AAD e sem AZURE_SPEECH_KEY/AZURE_AI_SERVICES_KEY');
  }
  anthropicInstance = new Anthropic({
    baseURL: `${BASE_URL}/anthropic`,
    apiKey: 'dummy-not-used',
    defaultHeaders: {
      'anthropic-version': ANTHROPIC_VERSION,
      'api-key': API_KEY_FALLBACK,
    },
    defaultQuery: { 'api-version': API_VERSION },
  });
  usingKeyAuth = true;
  return anthropicInstance;
}

// Renova authToken quando token expira — reset do singleton
async function refreshClientToken(): Promise<Anthropic> {
  if (usingKeyAuth) return getClient();
  tokenCache.reset();
  anthropicInstance = null;
  return getClient();
}

// ── Tipos públicos ──────────────────────────────────────────

export type ClaudeTool = {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type ClaudeToolHandler = (input: Record<string, unknown>) => Promise<unknown> | unknown;

export type ClaudeToolRegistry = Record<string, {
  spec: ClaudeTool;
  handler: ClaudeToolHandler;
}>;

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | Array<Record<string, unknown>>;
}

export interface ClaudeRunOpts {
  model?: string;
  maxTokens?: number;
  system?: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
  tools?: ClaudeTool[];
  toolRegistry?: ClaudeToolRegistry;
  maxIterations?: number;
  temperature?: number;
  onToolCall?: (name: string, input: Record<string, unknown>, result: unknown) => void;
}

export interface ClaudeRunResult {
  text: string;
  toolsUsed: string[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  stopReason: string;
  iterations: number;
}

// ── Helpers públicos ────────────────────────────────────────

/**
 * Envia mensagens ao Claude Foundry e executa loop de tool-use quando registry fornecido.
 * Retorna o texto final, total de iterações e tools executadas.
 */
export async function runClaude(
  messages: ClaudeMessage[],
  opts: ClaudeRunOpts = {},
): Promise<ClaudeRunResult> {
  const {
    model = CLAUDE_MODEL_SONNET,
    maxTokens = 2048,
    system,
    tools,
    toolRegistry,
    maxIterations = 6,
    temperature = 0.2,
    onToolCall,
  } = opts;

  const toolsUsed: string[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheCreate = 0;
  let totalCacheRead = 0;

  const convo: ClaudeMessage[] = messages.map(m => ({ ...m }));
  let iteration = 0;
  let stopReason = 'end_turn';

  while (iteration < maxIterations) {
    iteration++;
    let client = await getClient();

    let response;
    try {
      response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        ...(system ? { system: system as any } : {}),
        ...(tools && tools.length > 0 ? { tools: tools as any } : {}),
        messages: convo as any,
      });
    } catch (err: any) {
      // Token expirou mid-request? Tenta uma vez renovando.
      const msg = String(err?.message || err || '');
      if (/401|403|invalid_model_endpoint_authentication|token|expired/i.test(msg)) {
        client = await refreshClientToken();
        response = await client.messages.create({
          model,
          max_tokens: maxTokens,
          temperature,
          ...(system ? { system: system as any } : {}),
          ...(tools && tools.length > 0 ? { tools: tools as any } : {}),
          messages: convo as any,
        });
      } else {
        throw err;
      }
    }

    totalInput += response.usage?.input_tokens || 0;
    totalOutput += response.usage?.output_tokens || 0;
    totalCacheCreate += (response.usage as any)?.cache_creation_input_tokens || 0;
    totalCacheRead += (response.usage as any)?.cache_read_input_tokens || 0;
    stopReason = response.stop_reason || 'end_turn';

    // Adiciona resposta do assistant ao histórico
    convo.push({ role: 'assistant', content: response.content as any });

    if (response.stop_reason !== 'tool_use' || !toolRegistry) {
      // Terminou. Extrai texto final.
      const text = extractText(response.content);
      return {
        text,
        toolsUsed,
        usage: {
          input_tokens: totalInput,
          output_tokens: totalOutput,
          cache_creation_input_tokens: totalCacheCreate,
          cache_read_input_tokens: totalCacheRead,
        },
        stopReason,
        iterations: iteration,
      };
    }

    // Executa todas as tool_use blocks
    const toolResults: Array<Record<string, unknown>> = [];
    for (const block of response.content as any[]) {
      if (block.type !== 'tool_use') continue;
      const toolName = String(block.name);
      const entry = toolRegistry[toolName];
      toolsUsed.push(toolName);
      if (!entry) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          is_error: true,
          content: `Tool desconhecida: ${toolName}`,
        });
        continue;
      }
      try {
        const result = await Promise.resolve(entry.handler(block.input || {}));
        const content = typeof result === 'string' ? result : JSON.stringify(result);
        if (onToolCall) onToolCall(toolName, block.input || {}, result);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: content.length > 16000 ? content.slice(0, 16000) + '\n...[truncado]' : content,
        });
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          is_error: true,
          content: `Erro executando ${toolName}: ${(err as Error).message}`,
        });
      }
    }

    convo.push({ role: 'user', content: toolResults as any });
  }

  // Atingiu maxIterations — devolve o que tiver
  const lastAssistant = convo.reverse().find(m => m.role === 'assistant');
  const text = lastAssistant ? extractText(lastAssistant.content) : '';
  return {
    text: text || '[Alix atingiu limite de iterações de tool-use]',
    toolsUsed,
    usage: {
      input_tokens: totalInput,
      output_tokens: totalOutput,
      cache_creation_input_tokens: totalCacheCreate,
      cache_read_input_tokens: totalCacheRead,
    },
    stopReason: 'max_iterations',
    iterations: iteration,
  };
}

function extractText(content: any): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => String(b.text || ''))
    .join('\n')
    .trim();
}

/**
 * Health-check rápido — usado no startup pra confirmar que o Foundry responde.
 */
export async function pingFoundry(): Promise<{ ok: boolean; model?: string; latencyMs?: number; error?: string; usingKeyAuth?: boolean }> {
  const t0 = Date.now();
  try {
    const client = await getClient();
    const r = await client.messages.create({
      model: CLAUDE_MODEL_HAIKU,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'ping' }],
    });
    return {
      ok: true,
      model: r.model,
      latencyMs: Date.now() - t0,
      usingKeyAuth,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message, latencyMs: Date.now() - t0, usingKeyAuth };
  }
}

export function isLLMEnabled(): boolean {
  const flag = (process.env.ALIX_USE_LLM || '').toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  // Default: habilitado se houver credencial disponível.
  return true;
}
