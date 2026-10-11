// ============================================================
// ALETIS - Responses em Foundry/OpenAI e serviços auxiliares OpenAI.
// Responses API, tools estritas, Structured Outputs e streaming.
// ============================================================

import OpenAI from 'openai'
import { createHash, randomUUID } from 'node:crypto'
import { SpanStatusCode, trace } from '@opentelemetry/api'
import {
  OPENAI_BASE_URL,
  RETRY_CONFIG,
  estimateCost,
  getModelForRole,
  validateModel,
} from './LLMConfig.js'
import { getPrimaryResponsesContext, type ResponsesContext } from './ProviderClient.js'
import { getLLMProviderConfig, isPrimaryLLMEnabled } from './ProviderConfig.js'
import type {
  EmbeddingOpts,
  EmbeddingResult,
  LLMHealthResult,
  LLMMessage,
  LLMProviderName,
  LLMRunOpts,
  LLMRunResult,
  LLMStreamOpts,
  LLMStructuredOpts,
  LLMStructuredResult,
  LLMTool,
  LLMUsage,
  StreamChunk,
} from './types.js'

export { OPENAI_MODEL_DEEP, OPENAI_MODEL_FAST, OPENAI_MODEL_PRIMARY } from './LLMConfig.js'
export type {
  LLMMessage,
  LLMRunOpts,
  LLMRunResult,
  LLMStreamOpts,
  LLMStructuredOpts,
  LLMStructuredResult,
  LLMTool,
  LLMToolHandler,
  LLMToolRegistry,
} from './types.js'

let singleton: { apiKey: string; client: OpenAI } | null = null

function recordAiRun(params: {
  opts: LLMRunOpts
  model: string
  response: any
  usage: LLMUsage
  toolsUsed?: string[]
  toolsRequested?: string[]
  latencyMs: number
  workflow?: string
  provider: LLMProviderName
}): void {
  void (async () => {
    try {
      const { isPgEnabled, getDb } = await import('../../db/client.js')
      if (!isPgEnabled()) return
      const { aiWorkflowRun } = await import('../../db/schema.js')
      const metadata = params.opts.metadata || {}
      await getDb().insert(aiWorkflowRun).values({
        id: randomUUID(),
        workflowId: params.workflow || metadata.workflow || `${params.provider}.responses`,
        missionId: metadata.missionId,
        clienteId: metadata.clienteId,
        documentId: metadata.documentId,
        status: params.response?.status === 'completed' ? 'succeeded' : 'failed',
        input: {
          provider: params.provider,
          model: params.model,
          promptCacheKey: params.opts.promptCacheKey,
          hasTools: Boolean(params.opts.tools?.length),
        },
        output: {
          responseId: params.response?.id,
          requestId: params.response?._request_id,
          usage: params.usage,
          costUsd: params.provider === 'openai' ? estimateCost(params.model, params.usage) : null,
          costBasis: params.provider === 'openai' ? 'openai_public_reference' : 'foundry_price_not_verified',
          toolsUsed: params.toolsUsed || [],
          toolsRequested: params.toolsRequested || [],
          latencyMs: params.latencyMs,
        },
        error: params.response?.error?.message,
        startedAt: new Date(Date.now() - params.latencyMs),
        completedAt: new Date(),
      })
    } catch {
      // Telemetria nunca pode interromper uma resposta ao consultor.
    }
  })()
}

export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || ''
  if (!apiKey) throw new Error('OPENAI_API_KEY nao configurada para os serviços auxiliares OpenAI')
  if (singleton?.apiKey !== apiKey) {
    singleton = { apiKey, client: new OpenAI({
      apiKey,
      baseURL: OPENAI_BASE_URL,
      timeout: RETRY_CONFIG.timeoutMs,
      maxRetries: RETRY_CONFIG.maxRetries,
    }) }
  }
  return singleton.client
}

export function isOpenAIEnabled(): boolean {
  return isPrimaryLLMEnabled()
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Execução cancelada', 'AbortError')
}

function responsesRequestOptions(opts: LLMRunOpts): { signal?: AbortSignal; maxRetries?: number; timeout?: number } {
  const options: { signal?: AbortSignal; maxRetries?: number; timeout?: number } = { signal: opts.signal }
  if (opts.requestMaxRetries !== undefined) {
    if (!Number.isInteger(opts.requestMaxRetries) || opts.requestMaxRetries < 0) {
      throw new Error('requestMaxRetries deve ser um inteiro não negativo')
    }
    options.maxRetries = opts.requestMaxRetries
  }
  if (opts.requestTimeoutMs !== undefined) {
    if (!Number.isInteger(opts.requestTimeoutMs) || opts.requestTimeoutMs < 1 || opts.requestTimeoutMs > 600_000) {
      throw new Error('requestTimeoutMs deve ser um inteiro entre 1 e 600000')
    }
    options.timeout = opts.requestTimeoutMs
  }
  return options
}

function requiredCapabilities(messages: LLMMessage[], opts: LLMRunOpts) {
  const required: import('./types.js').ModelCapability[] = ['chat']
  if (opts.tools?.length) required.push('tool_calling')
  if (messages.some((message) => Array.isArray(message.content)
    && message.content.some((block) => ['image', 'file', 'input_file', 'input_image'].includes(String(block.type))))) required.push('vision')
  return required
}

function systemText(system: LLMRunOpts['system']): string | undefined {
  if (!system) return undefined
  if (typeof system === 'string') return system
  return system.map((item) => item.text).filter(Boolean).join('\n\n')
}

function safeJson(value: unknown, maxLength = 60_000): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (!text) return ''
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}\n...[resultado truncado]`
}

function nullableSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema
  const current = schema as Record<string, unknown>
  if (Array.isArray(current.type)) {
    return { ...current, type: current.type.includes('null') ? current.type : [...current.type, 'null'] }
  }
  if (typeof current.type === 'string') return { ...current, type: [current.type, 'null'] }
  if (Array.isArray(current.enum)) return { ...current, enum: current.enum.includes(null) ? current.enum : [...current.enum, null] }
  return { anyOf: [current, { type: 'null' }] }
}

/** Converte schemas legados em schemas compativeis com strict function calling. */
export function strictifyJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk)
    if (!node || typeof node !== 'object') return node

    const source = node as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(source)) {
      if (key === 'properties' || key === 'required' || key === 'additionalProperties') continue
      out[key] = walk(value)
    }

    if (source.properties && typeof source.properties === 'object' && !Array.isArray(source.properties)) {
      const properties = source.properties as Record<string, unknown>
      const originallyRequired = new Set(Array.isArray(source.required) ? source.required.map(String) : [])
      out.type = out.type || 'object'
      out.additionalProperties = false
      out.required = Object.keys(properties)
      out.properties = Object.fromEntries(
        Object.entries(properties).map(([key, value]) => {
          const normalized = walk(value)
          return [key, originallyRequired.has(key) ? normalized : nullableSchema(normalized)]
        }),
      )
    } else if (source.type === 'object') {
      out.type = 'object'
      out.additionalProperties = false
      out.required = []
      out.properties = {}
    }
    return out
  }

  return walk({ type: 'object', ...schema }) as Record<string, unknown>
}

function cleanToolInput(value: unknown, schema?: Record<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((item) => cleanToolInput(item))
  if (!value || typeof value !== 'object') return value

  const required = new Set(Array.isArray(schema?.required) ? schema.required.map(String) : [])
  const properties = (schema?.properties && typeof schema.properties === 'object'
    ? schema.properties
    : {}) as Record<string, Record<string, unknown>>
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === null && !required.has(key)) continue
    out[key] = cleanToolInput(item, properties[key])
  }
  return out
}

function toOpenAITools(tools?: LLMTool[]): Array<Record<string, unknown>> | undefined {
  if (!tools?.length) return undefined
  return tools.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: strictifyJsonSchema(tool.input_schema),
    strict: true,
  }))
}

function imageInput(block: Record<string, unknown>): Record<string, unknown> | null {
  const source = block.source as Record<string, unknown> | undefined
  if (source?.type === 'base64' && source.media_type && source.data) {
    return {
      type: 'input_image',
      image_url: `data:${String(source.media_type)};base64,${String(source.data)}`,
      detail: 'auto',
    }
  }
  if (source?.type === 'url' && source.url) {
    return { type: 'input_image', image_url: String(source.url), detail: 'auto' }
  }
  return null
}

function fileInput(block: Record<string, unknown>): Record<string, unknown> | null {
  const source = block.source as Record<string, unknown> | undefined
  const detail = ['auto', 'low', 'high'].includes(String(block.detail)) ? String(block.detail) : 'high'
  if (source?.type === 'base64' && source.media_type && source.data) {
    return {
      type: 'input_file',
      filename: String(block.filename || 'documento.pdf'),
      file_data: `data:${String(source.media_type)};base64,${String(source.data)}`,
      detail,
    }
  }
  if (source?.type === 'url' && source.url) {
    return { type: 'input_file', file_url: String(source.url), detail }
  }
  if (source?.type === 'file_id' && source.file_id) {
    return { type: 'input_file', file_id: String(source.file_id), detail }
  }
  return null
}

export function messagesToInput(messages: LLMMessage[]): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = []
  for (const message of messages) {
    if (message.role === 'system') continue
    if (typeof message.content === 'string') {
      input.push({ role: message.role === 'tool' ? 'user' : message.role, content: message.content })
      continue
    }

    const text: string[] = []
    const richContent: Array<Record<string, unknown>> = []
    for (const rawBlock of message.content) {
      const block = rawBlock as Record<string, unknown>
      if (block.type === 'text' || block.type === 'input_text' || block.type === 'output_text') {
        text.push(String(block.text || ''))
      } else if (block.type === 'image') {
        const converted = imageInput(block)
        if (converted) richContent.push(converted)
      } else if (block.type === 'file' || block.type === 'input_file') {
        const converted = block.type === 'input_file' ? block : fileInput(block)
        if (converted) richContent.push(converted)
      } else if (block.type === 'tool_result') {
        input.push({
          type: 'function_call_output',
          call_id: String(block.tool_use_id || block.call_id || ''),
          output: safeJson(block.content),
        })
      } else if (block.type === 'tool_use' || block.type === 'function_call') {
        input.push({
          type: 'function_call',
          call_id: String(block.id || block.call_id || ''),
          name: String(block.name || ''),
          arguments: JSON.stringify(block.input || block.arguments || {}),
        })
      }
    }

    if (message.role === 'user' && richContent.length) {
      const content = [
        ...(text.length ? [{ type: 'input_text', text: text.join('\n') }] : []),
        ...richContent,
      ]
      input.push({ role: 'user', content })
    } else if (text.length) {
      input.push({ role: message.role === 'tool' ? 'user' : message.role, content: text.join('\n') })
    }
  }
  return input
}

function messageSystemText(messages: LLMMessage[], explicit?: LLMRunOpts['system']): string | undefined {
  const parts = [systemText(explicit)]
  for (const message of messages) {
    if (message.role === 'system') {
      parts.push(typeof message.content === 'string' ? message.content : safeJson(message.content))
    }
  }
  const joined = parts.filter(Boolean).join('\n\n')
  return joined || undefined
}

function effectiveReasoning(opts: LLMRunOpts, model: string, provider: LLMProviderName): Record<string, unknown> {
  const effort = opts.reasoning?.effort
    || (opts.thinking?.type === 'enabled' ? (opts.thinking.budget_tokens >= 6_000 ? 'high' : 'medium') : undefined)
    || (/sol|astra/.test(model) ? 'high' : 'low')
  return {
    effort,
    summary: opts.reasoning?.summary || 'auto',
    ...(provider === 'openai' ? {
      context: opts.reasoning?.context || 'auto',
      ...(opts.reasoning?.mode === 'pro' ? { mode: 'pro' } : {}),
    } : {}),
  }
}

/** Responses limita a chave a 64 caracteres; o hash conserva a distinção entre escopos. */
export function normalizePromptCacheKey(value: string): string {
  if (Array.from(value).length <= 64) return value
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 24)
  return `${Array.from(value).slice(0, 39).join('')}:${digest}`
}

function requestBase(messages: LLMMessage[], opts: LLMRunOpts, input: Array<Record<string, unknown>>, context: ResponsesContext) {
  const model = context.model.id
  const validation = validateModel(model)
  if (!validation.valid) throw new Error(validation.error)
  const tools = toOpenAITools(opts.tools)
  const cacheScope = String(
    (opts as LLMRunOpts & { name?: string }).name
      || opts.metadata?.workflow
      || opts.tools?.map((tool) => tool.name).slice(0, 4).join(':')
      || 'default',
  ).replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 80)

  return {
    model: context.model.deployment,
    instructions: messageSystemText(messages, opts.system),
    input,
    max_output_tokens: opts.maxTokens || 2_048,
    reasoning: effectiveReasoning(opts, model, context.model.provider),
    text: { verbosity: opts.verbosity || 'medium' },
    ...(tools ? { tools, tool_choice: 'auto', parallel_tool_calls: opts.parallelToolCalls ?? false } : {}),
    ...(opts.previousResponseId ? { previous_response_id: opts.previousResponseId } : {}),
    prompt_cache_key: normalizePromptCacheKey(opts.promptCacheKey || `aletis:${model}:${cacheScope}`),
    ...(context.model.provider === 'openai' ? { prompt_cache_options: { mode: 'implicit', ttl: '30m' } } : {}),
    store: opts.store ?? true,
    truncation: 'auto',
    metadata: opts.metadata,
  } as Record<string, unknown>
}

function usageFrom(response: any): LLMUsage {
  const usage = response?.usage
  return {
    input_tokens: usage?.input_tokens || 0,
    output_tokens: usage?.output_tokens || 0,
    reasoning_tokens: usage?.output_tokens_details?.reasoning_tokens || 0,
    cached_tokens: usage?.input_tokens_details?.cached_tokens || 0,
    cache_creation_input_tokens: usage?.input_tokens_details?.cache_write_tokens || 0,
    cache_read_input_tokens: usage?.input_tokens_details?.cached_tokens || 0,
    total_tokens: usage?.total_tokens || 0,
  }
}

function addUsage(total: LLMUsage, current: LLMUsage): void {
  total.input_tokens += current.input_tokens
  total.output_tokens += current.output_tokens
  total.reasoning_tokens = (total.reasoning_tokens || 0) + (current.reasoning_tokens || 0)
  total.cached_tokens = (total.cached_tokens || 0) + (current.cached_tokens || 0)
  total.cache_read_input_tokens = (total.cache_read_input_tokens || 0) + (current.cache_read_input_tokens || 0)
  total.cache_creation_input_tokens = (total.cache_creation_input_tokens || 0) + (current.cache_creation_input_tokens || 0)
  total.total_tokens = (total.total_tokens || 0) + (current.total_tokens || 0)
}

function functionCalls(response: any): Array<{ call_id: string; name: string; arguments: string }> {
  return (response?.output || []).filter((item: any) => item?.type === 'function_call')
}

async function executeToolCalls(
  calls: Array<{ call_id: string; name: string; arguments: string }>,
  opts: LLMRunOpts,
  toolsUsed: string[],
  completedCalls: Map<string, Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const executeOne = async (call: { call_id: string; name: string; arguments: string }): Promise<Record<string, unknown>> => {
    assertNotAborted(opts.signal)
    const completed = completedCalls.get(call.call_id)
    if (completed) return completed
    const entry = opts.toolRegistry?.[call.name]
    let parsed: Record<string, unknown> = {}
    try {
      parsed = JSON.parse(call.arguments || '{}') as Record<string, unknown>
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid')
    } catch {
      return {
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify({ ok: false, error: 'Argumentos JSON invalidos' }),
      }
    }

    if (!entry) {
      return {
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify({ ok: false, error: `Ferramenta desconhecida: ${call.name}` }),
      }
    }

    const input = cleanToolInput(parsed, entry.spec.input_schema) as Record<string, unknown>
    await opts.onToolStart?.(call.name, input)
    assertNotAborted(opts.signal)
    toolsUsed.push(call.name)
    const startedAt = Date.now()
    try {
      const result = await Promise.resolve(entry.handler(input))
      opts.onToolCall?.(call.name, input, result, Date.now() - startedAt)
      const output = { type: 'function_call_output', call_id: call.call_id, output: safeJson(result) }
      completedCalls.set(call.call_id, output)
      return output
    } catch (error) {
      assertNotAborted(opts.signal)
      const result = { ok: false, error: (error as Error).message }
      opts.onToolCall?.(call.name, input, result, Date.now() - startedAt)
      const output = { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) }
      completedCalls.set(call.call_id, output)
      return output
    }
  }

  if (opts.parallelToolCalls && calls.length > 1) {
    return Promise.all(calls.map(executeOne))
  }
  const outputs: Array<Record<string, unknown>> = []
  for (const call of calls) outputs.push(await executeOne(call))
  return outputs
}

export async function runOpenAI(messages: LLMMessage[], opts: LLMRunOpts = {}): Promise<LLMRunResult> {
  assertNotAborted(opts.signal)
  if (opts.onTextDelta || opts.onReasoningDelta) {
    let text = ''
    let usage: LLMUsage = { input_tokens: 0, output_tokens: 0 }
    let stopReason = 'completed'
    let iterations = 1
    let toolsUsed: string[] = []
    let responseId: string | undefined
    let model: string | undefined
    let provider: LLMProviderName | undefined
    let deployment: string | undefined
    for await (const chunk of streamOpenAI(messages, opts)) {
      if (chunk.type === 'text' && chunk.text) {
        text += chunk.text
        opts.onTextDelta?.(chunk.text)
      } else if (chunk.type === 'reasoning' && chunk.text) {
        opts.onReasoningDelta?.(chunk.text)
      } else if (chunk.type === 'usage' && chunk.usage) {
        usage = chunk.usage
      } else if (chunk.type === 'finish') {
        stopReason = chunk.stopReason || stopReason
        iterations = chunk.iterations || iterations
        toolsUsed = chunk.toolsUsed || toolsUsed
        responseId = chunk.responseId
        model = chunk.model
        provider = chunk.provider
        deployment = chunk.deployment
      } else if (chunk.type === 'error') {
        throw new Error(chunk.error || 'Falha no streaming OpenAI')
      }
    }
    return { text, toolsUsed, usage, stopReason, iterations, model, provider, deployment, responseId }
  }

  const model = opts.model || getModelForRole('default')
  const context = await getPrimaryResponsesContext(model, requiredCapabilities(messages, opts))
  assertNotAborted(opts.signal)
  const provider = context.model.provider
  const span = trace.getTracer('aletis.openai').startSpan('openai.responses.run')
  const usage: LLMUsage = { input_tokens: 0, output_tokens: 0 }
  const toolsUsed: string[] = []
  const completedCalls = new Map<string, Record<string, unknown>>()
  const maxIterations = opts.maxIterations || 10
  let input = messagesToInput(messages)
  let previousResponseId = opts.previousResponseId
  let responseId: string | undefined
  let requestId: string | undefined
  let effectiveModel = model

  try {
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      assertNotAborted(opts.signal)
      const params = requestBase(messages, { ...opts, previousResponseId }, input, context)
      const callStartedAt = Date.now()
      const response = await context.client.responses.create(params as any, responsesRequestOptions(opts)) as any
      assertNotAborted(opts.signal)
      responseId = response.id
      requestId = response._request_id
      effectiveModel = response.model || model
      addUsage(usage, usageFrom(response))
      const calls = functionCalls(response)
      recordAiRun({ opts, provider, model: effectiveModel, response, usage: usageFrom(response), toolsRequested: calls.map((call) => call.name), latencyMs: Date.now() - callStartedAt })
      if (response.status === 'failed' || response.status === 'cancelled') throw new Error(response.error?.message || `Resposta ${response.status}`)
      if (calls.length && response.status !== 'completed') throw new Error('Resposta de ferramentas incompleta; nenhuma ferramenta foi executada')

      if (!calls.length || !opts.toolRegistry) {
        const result: LLMRunResult = {
          text: response.output_text || '',
          toolsUsed,
          usage,
          stopReason: response.status || 'completed',
          iterations: iteration,
          model: effectiveModel,
          provider,
          deployment: context.model.deployment,
          responseId,
          requestId,
        }
        span.setAttributes({
          'gen_ai.system': provider,
          'gen_ai.request.model': result.model || model,
          'gen_ai.response.id': responseId || '',
          'gen_ai.usage.input_tokens': usage.input_tokens,
          'gen_ai.usage.output_tokens': usage.output_tokens,
          'aletis.alix.tools_used': toolsUsed.join(','),
        })
        span.setStatus({ code: SpanStatusCode.OK })
        span.end()
        return result
      }

      const outputs = await executeToolCalls(calls, opts, toolsUsed, completedCalls)
      assertNotAborted(opts.signal)
      // store:false é stateless: reenviar os itens completos, sem referenciar resposta não armazenada.
      input = opts.store === false ? [...input, ...(response.output || []), ...outputs] : outputs
      previousResponseId = opts.store === false ? undefined : response.id
    }

    span.setStatus({ code: SpanStatusCode.OK })
    span.end()
    return {
      text: '[ALIX atingiu o limite de iteracoes de ferramentas]',
      toolsUsed,
      usage,
      stopReason: 'max_iterations',
      iterations: maxIterations,
      model: effectiveModel,
      provider,
      deployment: context.model.deployment,
      responseId,
      requestId,
    }
  } catch (error) {
    span.recordException(error as Error)
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message })
    span.end()
    throw error
  }
}

export async function* streamOpenAI(messages: LLMMessage[], opts: LLMStreamOpts = {}): AsyncGenerator<StreamChunk> {
  const model = opts.model || getModelForRole('default')
  const usage: LLMUsage = { input_tokens: 0, output_tokens: 0 }
  const toolsUsed: string[] = []
  const completedCalls = new Map<string, Record<string, unknown>>()
  const maxIterations = opts.maxIterations || 10
  let input = messagesToInput(messages)
  let previousResponseId = opts.previousResponseId
  let responseId: string | undefined
  let effectiveModel = model
  let context: ResponsesContext | undefined

  try {
    assertNotAborted(opts.signal)
    context = await getPrimaryResponsesContext(model, [...requiredCapabilities(messages, opts), 'streaming'])
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      assertNotAborted(opts.signal)
      const params = { ...requestBase(messages, { ...opts, previousResponseId }, input, context), stream: true }
      const callStartedAt = Date.now()
      const stream = await context.client.responses.create(params as any, responsesRequestOptions(opts)) as any
      const calls: Array<{ call_id: string; name: string; arguments: string }> = []
      let completed: any

      for await (const event of stream) {
        assertNotAborted(opts.signal)
        if (event.type === 'response.created') responseId = event.response?.id
        if (event.type === 'response.output_text.delta' && event.delta) {
          const chunk: StreamChunk = { type: 'text', text: event.delta, responseId }
          opts.onChunk?.(chunk)
          yield chunk
        } else if (event.type === 'response.reasoning_summary_text.delta' && event.delta) {
          const chunk: StreamChunk = { type: 'reasoning', text: event.delta, responseId }
          opts.onChunk?.(chunk)
          yield chunk
        } else if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
          calls.push(event.item)
        } else if (event.type === 'response.completed') {
          completed = event.response
          responseId = event.response?.id || responseId
          effectiveModel = event.response?.model || model
        } else if (event.type === 'response.incomplete') {
          throw new Error(`Resposta incompleta: ${event.response?.incomplete_details?.reason || 'transmissão interrompida'}`)
        } else if (event.type === 'response.failed' || event.type === 'error') {
          throw new Error(event.response?.error?.message || event.error?.message || 'Falha no streaming OpenAI')
        }
      }

      assertNotAborted(opts.signal)
      if (!completed || completed.status !== 'completed') throw new Error('Transmissão encerrada sem confirmação de resposta concluída')
      addUsage(usage, usageFrom(completed))
      recordAiRun({ opts, provider: context.model.provider, model: effectiveModel, response: completed, usage: usageFrom(completed), toolsRequested: calls.map((call) => call.name), latencyMs: Date.now() - callStartedAt })
      if (!calls.length || !opts.toolRegistry) {
        const usageChunk: StreamChunk = { type: 'usage', usage, responseId }
        opts.onChunk?.(usageChunk)
        yield usageChunk
        const finish: StreamChunk = {
          type: 'finish',
          stopReason: completed?.status || 'completed',
          toolsUsed,
          iterations: iteration,
          responseId,
          model: effectiveModel,
          provider: context.model.provider,
          deployment: context.model.deployment,
        }
        opts.onChunk?.(finish)
        yield finish
        return
      }

      for (const call of calls) {
        const parsed = (() => {
          try { return JSON.parse(call.arguments || '{}') as Record<string, unknown> } catch { return {} }
        })()
        const chunk: StreamChunk = { type: 'tool_call', toolName: call.name, toolInput: parsed, responseId }
        opts.onChunk?.(chunk)
        yield chunk
      }
      const outputs = await executeToolCalls(calls, opts, toolsUsed, completedCalls)
      assertNotAborted(opts.signal)
      input = opts.store === false ? [...input, ...(completed.output || []), ...outputs] : outputs
      previousResponseId = opts.store === false ? undefined : responseId
    }

    yield { type: 'usage', usage, responseId }
    yield { type: 'finish', stopReason: 'max_iterations', toolsUsed, iterations: maxIterations, responseId,
      model: effectiveModel, provider: context.model.provider, deployment: context.model.deployment }
  } catch (error) {
    assertNotAborted(opts.signal)
    const chunk: StreamChunk = { type: 'error', error: (error as Error).message, responseId }
    opts.onChunk?.(chunk)
    yield chunk
  }
}

export async function* streamOpenAIPure(messages: LLMMessage[], opts: LLMStreamOpts = {}): AsyncGenerator<StreamChunk> {
  yield* streamOpenAI(messages, { ...opts, tools: undefined, toolRegistry: undefined })
}

export async function generateStructured<T>(
  messages: LLMMessage[],
  opts: LLMStructuredOpts<T>,
): Promise<LLMStructuredResult<T>> {
  const model = opts.model || getModelForRole('doc_extractor')
  assertNotAborted(opts.signal)
  const context = await getPrimaryResponsesContext(model, [...requiredCapabilities(messages, opts), 'structured_outputs'])
  assertNotAborted(opts.signal)
  const params = requestBase(messages, { ...opts, model }, messagesToInput(messages), context)
  params.text = {
    verbosity: opts.verbosity || 'low',
    format: {
      type: 'json_schema',
      name: opts.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64),
      description: opts.description,
      schema: strictifyJsonSchema(opts.schema),
      strict: true,
    },
  }
  const startedAt = Date.now()
  const response = await context.client.responses.create(params as any, responsesRequestOptions(opts)) as any
  assertNotAborted(opts.signal)
  if (response.status === 'incomplete') {
    throw new Error(`Structured Output incompleto (${opts.name}): ${response.incomplete_details?.reason || 'motivo nao informado'}`)
  }
  if (!response.output_text) throw new Error(`Structured Output vazio (${opts.name})`)
  const parsed = JSON.parse(response.output_text) as unknown
  const data = opts.validate ? opts.validate(parsed) : parsed as T
  if (response.status !== 'completed') throw new Error(`Structured Output não concluído (${opts.name})`)
  recordAiRun({ opts, provider: context.model.provider, model: response.model || model, response, usage: usageFrom(response), latencyMs: Date.now() - startedAt, workflow: `structured:${opts.name}` })
  return {
    data,
    text: response.output_text,
    toolsUsed: [],
    usage: usageFrom(response),
    stopReason: response.status || 'completed',
    iterations: 1,
    model: response.model || model,
    provider: context.model.provider,
    deployment: context.model.deployment,
    responseId: response.id,
    requestId: response._request_id,
  }
}

export async function embedOpenAI(texts: string[], opts: EmbeddingOpts = {}): Promise<EmbeddingResult> {
  const model = opts.model || process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
  const validation = validateModel(model)
  if (!validation.valid) throw new Error(validation.error)
  const response = await getOpenAIClient().embeddings.create({
    model,
    input: texts,
    ...(opts.dimensions ? { dimensions: opts.dimensions } : {}),
  }) as any
  return {
    embeddings: response.data.map((item: any) => item.embedding),
    model: response.model || model,
    provider: 'openai',
    usage: response.usage || { prompt_tokens: 0, total_tokens: 0 },
    requestId: response._request_id,
  }
}

export interface OpenAIWebSearchResult {
  query: string
  text: string
  results: Array<{ title: string; url: string; snippet: string }>
  responseId?: string
  requestId?: string
  provider?: LLMProviderName
  model?: string
}

/** Prioriza citações da resposta; a lista action.sources pode conter resultados periféricos. */
export function collectWebSearchSources(response: any, maxResults = 5): OpenAIWebSearchResult['results'] {
  const sources = new Map<string, { title: string; url: string; snippet: string }>()
  const citations = new Map<string, { title: string; url: string; snippet: string }>()
  for (const item of response.output || []) {
    if (item.type !== 'web_search_call') continue
    for (const source of item.action?.sources || []) {
      if (typeof source.url === 'string') sources.set(source.url, {
        title: source.title || source.url, url: source.url, snippet: source.snippet || '',
      })
    }
  }
  for (const item of response.output || []) {
    if (item.type !== 'message') continue
    for (const content of item.content || []) for (const annotation of content.annotations || []) {
      const citation = annotation.type === 'url_citation' ? annotation : annotation.url_citation
      if (typeof citation?.url !== 'string') continue
      citations.set(citation.url, {
        title: citation.title || sources.get(citation.url)?.title || citation.url,
        url: citation.url,
        // Texto gerado pela IA não é um trecho extraído da página.
        snippet: sources.get(citation.url)?.snippet || '',
      })
    }
  }
  return [...citations.values(), ...[...sources.values()].filter((source) => !citations.has(source.url))]
    .slice(0, Math.max(1, Math.min(maxResults, 10)))
}

export async function searchOpenAIWeb(
  query: string,
  model = getModelForRole('web_researcher'),
  options: { allowedDomains?: string[]; excludedDomains?: string[]; brOnly?: boolean; maxResults?: number; timeoutMs?: number } = {},
): Promise<OpenAIWebSearchResult> {
  const validation = validateModel(model)
  if (!validation.valid) throw new Error(validation.error)
  const startedAt = Date.now()
  const allowedDomains = (options.allowedDomains || []).map((domain) => domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]).filter(Boolean)
  const excluded = (options.excludedDomains || []).filter(Boolean)
  const input = [
    query,
    options.brOnly ? 'Priorize fontes brasileiras e conteudo em portugues do Brasil.' : '',
    excluded.length ? `Nao utilize estes dominios: ${excluded.join(', ')}.` : '',
  ].filter(Boolean).join('\n')
  const response = await getOpenAIClient().responses.create({
    model,
    input,
    tools: [{
      type: 'web_search',
      user_location: { type: 'approximate', country: 'BR' },
      ...(allowedDomains.length ? { filters: { allowed_domains: allowedDomains } } : {}),
    }],
    include: ['web_search_call.action.sources'],
    reasoning: { effort: 'low', summary: 'auto' },
    text: { verbosity: 'low' },
    store: true,
  } as any, {
    // Pesquisa web é complementar: não pode reter a geração baseada no sistema.
    timeout: Math.max(5_000, options.timeoutMs ?? 25_000),
    maxRetries: 0,
  }) as any
  recordAiRun({
    provider: 'openai',
    opts: { model, metadata: { workflow: 'web_search' }, promptCacheKey: `aletis:${model}:web-search` },
    model: response.model || model,
    response,
    usage: usageFrom(response),
    latencyMs: Date.now() - startedAt,
    workflow: 'openai.web_search',
  })

  return {
    query,
    provider: 'openai',
    model: response.model || model,
    text: response.output_text || '',
    results: collectWebSearchSources(response, options.maxResults || 5),
    responseId: response.id,
    requestId: response._request_id,
  }
}

export async function pingOpenAI(model = getModelForRole('classifier')): Promise<LLMHealthResult> {
  const startedAt = Date.now()
  const provider = getLLMProviderConfig().provider
  try {
    const context = await getPrimaryResponsesContext(model)
    const response = await context.client.responses.create({
      model: context.model.deployment,
      input: 'Responda somente: ok',
      max_output_tokens: 64,
      reasoning: { effort: 'low' },
      store: false,
    } as any) as any
    return {
      ok: response.status === 'completed',
      provider,
      model: response.model || model,
      latencyMs: Date.now() - startedAt,
      responseId: response.id,
      streamingSupported: true,
      toolCallingSupported: true,
      reasoningSupported: true,
    }
  } catch (error) {
    return { ok: false, provider, latencyMs: Date.now() - startedAt, error: (error as Error).message }
  }
}

export async function pingOpenAIWebSearch(): Promise<{ supported: boolean; error?: string }> {
  try {
    const result = await searchOpenAIWeb(
      'site:openai.com OpenAI',
      getModelForRole('web_researcher'),
      { allowedDomains: ['openai.com'], maxResults: 1 },
    )
    return result.responseId ? { supported: true } : { supported: false, error: 'Resposta sem identificador' }
  } catch (error) {
    return { supported: false, error: (error as Error).message }
  }
}

export async function pingOpenAIReasoning(): Promise<{ supported: boolean; error?: string }> {
  try {
    const context = await getPrimaryResponsesContext(getModelForRole('orchestrator'), ['reasoning'])
    const response = await context.client.responses.create({
      model: context.model.deployment,
      input: 'Responda somente: ok',
      max_output_tokens: 32,
      reasoning: { effort: 'low', summary: 'auto' },
      store: false,
    } as any) as any
    return response.id && response.status === 'completed' ? { supported: true } : { supported: false, error: 'Resposta não concluída' }
  } catch (error) {
    return { supported: false, error: (error as Error).message }
  }
}
