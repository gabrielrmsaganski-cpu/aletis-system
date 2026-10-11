// ============================================================
// ALETIS - contratos internos da camada OpenAI
// ============================================================

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | Array<Record<string, unknown>>
}

export interface LLMTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
    [key: string]: unknown
  }
}

export type LLMToolHandler = (input: Record<string, unknown>) => Promise<unknown> | unknown

export interface LLMToolEntry {
  spec: LLMTool
  handler: LLMToolHandler
}

export type LLMToolRegistry = Record<string, LLMToolEntry>

export type LLMProviderName = 'openai' | 'foundry'

export interface LLMRunOpts {
  model?: string
  maxTokens?: number
  system?: string | Array<{ type: 'text'; text: string; cache_control?: unknown }>
  tools?: LLMTool[]
  toolRegistry?: LLMToolRegistry
  maxIterations?: number
  /** Limite de retentativas HTTP desta chamada; ausente preserva a política do SDK. */
  requestMaxRetries?: number
  /** Prazo HTTP desta chamada em milissegundos (1 a 600000); ausente preserva o padrão do SDK. */
  requestTimeoutMs?: number
  temperature?: number
  signal?: AbortSignal
  onToolStart?: (name: string, input: Record<string, unknown>) => void | Promise<void>
  onToolCall?: (name: string, input: Record<string, unknown>, result: unknown, latencyMs: number) => void
  onTextDelta?: (text: string) => void
  onReasoningDelta?: (text: string) => void
  reasoning?: {
    effort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
    summary?: 'auto' | 'concise' | 'detailed'
    context?: 'auto' | 'all_turns' | 'current_turn'
    mode?: 'standard' | 'pro'
  }
  /** Compatibilidade temporaria com agentes antigos; convertido em reasoning.effort. */
  thinking?: { type: 'enabled'; budget_tokens: number }
  parallelToolCalls?: boolean
  previousResponseId?: string
  promptCacheKey?: string
  metadata?: Record<string, string>
  store?: boolean
  verbosity?: 'low' | 'medium' | 'high'
}

export interface LLMUsage {
  input_tokens: number
  output_tokens: number
  reasoning_tokens?: number
  cached_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  total_tokens?: number
}

export interface LLMRunResult {
  text: string
  toolsUsed: string[]
  usage: LLMUsage
  stopReason: string
  iterations: number
  model?: string
  provider?: LLMProviderName
  deployment?: string
  responseId?: string
  requestId?: string
}

export interface LLMStructuredOpts<T> extends Omit<LLMRunOpts, 'tools' | 'toolRegistry' | 'onToolCall'> {
  name: string
  schema: Record<string, unknown>
  description?: string
  validate?: (value: unknown) => T
}

export interface LLMStructuredResult<T> extends LLMRunResult {
  data: T
}

export type StreamChunkType =
  | 'text'
  | 'reasoning'
  | 'tool_call'
  | 'tool_result'
  | 'usage'
  | 'finish'
  | 'error'

export interface StreamChunk {
  type: StreamChunkType
  text?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  usage?: LLMUsage
  stopReason?: string
  error?: string
  iterations?: number
  toolsUsed?: string[]
  responseId?: string
  model?: string
  provider?: LLMProviderName
  deployment?: string
}

export interface LLMStreamOpts extends LLMRunOpts {
  onChunk?: (chunk: StreamChunk) => void
}

export interface EmbeddingOpts {
  model?: string
  dimensions?: number
}

export interface EmbeddingResult {
  embeddings: number[][]
  model: string
  provider?: LLMProviderName
  usage: { prompt_tokens: number; total_tokens: number }
  requestId?: string
}

export interface LLMHealthResult {
  ok: boolean
  model?: string
  provider: LLMProviderName
  latencyMs?: number
  error?: string
  responseId?: string
  streamingSupported?: boolean
  toolCallingSupported?: boolean
  reasoningSupported?: boolean
}

export interface LLMProvider {
  readonly name: LLMProviderName
  run(messages: LLMMessage[], opts?: LLMRunOpts): Promise<LLMRunResult>
  stream(messages: LLMMessage[], opts?: LLMStreamOpts): AsyncGenerator<StreamChunk>
  embed(texts: string[], opts?: EmbeddingOpts): Promise<EmbeddingResult>
  ping(model?: string): Promise<LLMHealthResult>
  isAvailable(): boolean
}

export type ModelCapability =
  | 'chat'
  | 'streaming'
  | 'tool_calling'
  | 'structured_outputs'
  | 'reasoning'
  | 'vision'
  | 'web_search'
  | 'file_search'
  | 'embeddings'
  | 'transcription'
  | 'speech'

export interface ModelInfo {
  id: string
  provider: 'openai-responses' | 'openai-embeddings' | 'openai-audio'
  capabilities: ModelCapability[]
  inputUsdPerM?: number
  cachedInputUsdPerM?: number
  outputUsdPerM?: number
  longContextPricing?: {
    thresholdInputTokens: number
    inputUsdPerM: number
    cachedInputUsdPerM: number
    outputUsdPerM: number
  }
  contextWindow?: number
  maxOutputTokens?: number
  description: string
}
