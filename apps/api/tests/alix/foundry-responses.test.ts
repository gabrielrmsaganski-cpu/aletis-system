import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LLMRunOpts } from '../../src/services/llm/types.js'

const mocks = vi.hoisted(() => ({ create: vi.fn(), context: vi.fn() }))
vi.mock('../../src/services/llm/ProviderClient.js', () => ({ getPrimaryResponsesContext: mocks.context }))
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => false }))
import { generateStructured, normalizePromptCacheKey, runOpenAI, streamOpenAI } from '../../src/services/llm/OpenAIClient.js'

const messages = [{ role: 'user' as const, content: 'Teste sintético' }]
const response = (overrides: Record<string, unknown> = {}) => ({
  id: 'resp-test', model: 'gpt-5.6-terra-2026-07-09', status: 'completed', output_text: 'Concluído', output: [],
  usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }, ...overrides,
})
const call = (id = 'call-test', name = 'local_test', args = '{"a":1}') => ({ type: 'function_call', call_id: id, name, arguments: args })
function options(handler = vi.fn().mockResolvedValue({ ok: true })): LLMRunOpts {
  const spec = { name: 'local_test', description: 'Somente teste local', input_schema: { type: 'object' as const, properties: { a: { type: 'number' } }, required: ['a'] } }
  return { model: 'gpt-5.6-terra', tools: [spec], toolRegistry: { local_test: { spec, handler } } }
}
async function* events(items: unknown[]) { yield* items }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.create.mockReset()
  mocks.context.mockResolvedValue({ client: { responses: { create: mocks.create } }, model: { id: 'gpt-5.6-terra', deployment: 'terra-production', provider: 'foundry' } })
})

describe('Responses Foundry', () => {
  it('limita chaves de cache longas sem colidir escopos de subagentes', async () => {
    const prefix = 'aletis:terraproduction:' + 'scope:'.repeat(20)
    expect(normalizePromptCacheKey(prefix + 'a')).toHaveLength(64)
    expect(normalizePromptCacheKey(prefix + 'a')).toBe(normalizePromptCacheKey(prefix + 'a'))
    expect(normalizePromptCacheKey(prefix + 'a')).not.toBe(normalizePromptCacheKey(prefix + 'b'))
    expect(normalizePromptCacheKey('short')).toBe('short')
    mocks.create.mockResolvedValue(response())
    await runOpenAI(messages, { promptCacheKey: prefix })
    expect(mocks.create.mock.calls[0][0].prompt_cache_key).toHaveLength(64)
  })

  it('envia deployment, devolve modelo efetivo e não transmite extensões OpenAI não verificadas', async () => {
    mocks.create.mockResolvedValue(response())
    const result = await runOpenAI(messages, { model: 'gpt-5.6-terra', reasoning: { effort: 'high', context: 'all_turns', mode: 'pro' } })
    expect(result).toMatchObject({ model: 'gpt-5.6-terra-2026-07-09', deployment: 'terra-production', provider: 'foundry' })
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ model: 'terra-production', reasoning: { effort: 'high' } })
    expect(mocks.create.mock.calls[0][0].reasoning).not.toHaveProperty('mode')
    expect(mocks.create.mock.calls[0][0].reasoning).not.toHaveProperty('context')
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('prompt_cache_options')
  })

  it('executa ferramentas uma vez por call_id e encadeia store:false sem previous_response_id', async () => {
    const handler = vi.fn().mockResolvedValue({ total: 3 })
    const onToolStart = vi.fn()
    mocks.create.mockResolvedValueOnce(response({ output: [call()] }))
      .mockResolvedValueOnce(response({ output: [call()] })).mockResolvedValueOnce(response())
    const result = await runOpenAI(messages, { ...options(handler), onToolStart, store: false })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(onToolStart).toHaveBeenCalledTimes(1)
    expect(result.toolsUsed).toEqual(['local_test'])
    const next = mocks.create.mock.calls[1][0]
    expect(next).not.toHaveProperty('previous_response_id')
    expect(next.input).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'function_call' }), expect.objectContaining({ type: 'function_call_output' })]))
  })

  it('não inicia ferramentas desconhecidas nem argumentos não objeto', async () => {
    const handler = vi.fn()
    const onToolStart = vi.fn()
    mocks.create.mockResolvedValueOnce(response({ output: [call('1', 'unknown'), call('2', 'local_test', '[]')] })).mockResolvedValueOnce(response())
    expect((await runOpenAI(messages, { ...options(handler), onToolStart })).toolsUsed).toEqual([])
    expect(handler).not.toHaveBeenCalled()
    expect(onToolStart).not.toHaveBeenCalled()
  })

  it('cancelamento impede a consulta inicial e qualquer efeito após onToolStart', async () => {
    const before = new AbortController()
    before.abort()
    await expect(runOpenAI(messages, { signal: before.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.context).not.toHaveBeenCalled()
    const during = new AbortController()
    const handler = vi.fn()
    mocks.create.mockResolvedValueOnce(response({ output: [call()] }))
    await expect(runOpenAI(messages, { ...options(handler), signal: during.signal, onToolStart: () => during.abort() })).rejects.toMatchObject({ name: 'AbortError' })
    expect(handler).not.toHaveBeenCalled()
    expect(mocks.create.mock.calls[0][1].signal).toBe(during.signal)
  })

  it('não repete ferramenta nem troca provedor após erro na continuação', async () => {
    const handler = vi.fn().mockResolvedValue({ saved: true })
    mocks.create.mockResolvedValueOnce(response({ output: [call()] })).mockRejectedValueOnce(new Error('upstream unavailable'))
    await expect(runOpenAI(messages, options(handler))).rejects.toThrow('upstream unavailable')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(mocks.context).toHaveBeenCalledTimes(1)
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })

  it('recusa chamada de ferramenta em resposta incompleta', async () => {
    const handler = vi.fn()
    mocks.create.mockResolvedValueOnce(response({ status: 'incomplete', output: [call()] }))
    await expect(runOpenAI(messages, options(handler))).rejects.toThrow('nenhuma ferramenta')
    expect(handler).not.toHaveBeenCalled()
  })

  it('saída estruturada retorna provider e valida dados antes do retorno', async () => {
    mocks.create.mockResolvedValue(response({ output_text: '{"status":"ok"}' }))
    const validate = vi.fn((value) => value as { status: string })
    const result = await generateStructured(messages, { model: 'gpt-5.6-terra', name: 'test', schema: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] }, validate })
    expect(result).toMatchObject({ data: { status: 'ok' }, provider: 'foundry' })
    expect(validate).toHaveBeenCalledWith({ status: 'ok' })
    expect(mocks.create.mock.calls[0][0].text.format.strict).toBe(true)
  })
})

describe('streaming verificável', () => {
  it('não emite finish de sucesso sem response.completed', async () => {
    mocks.create.mockResolvedValue(events([{ type: 'response.output_text.delta', delta: 'parcial' }]))
    const chunks = []
    for await (const chunk of streamOpenAI(messages)) chunks.push(chunk)
    expect(chunks.map((chunk) => chunk.type)).toEqual(['text', 'error'])
    expect(chunks[1].error).toContain('sem confirmação')
  })

  it('preserva modelo e provider no caminho com callback de texto', async () => {
    mocks.create.mockResolvedValue(events([{ type: 'response.output_text.delta', delta: 'ok' }, { type: 'response.completed', response: response() }]))
    const onTextDelta = vi.fn()
    const result = await runOpenAI(messages, { onTextDelta })
    expect(result).toMatchObject({ text: 'ok', provider: 'foundry', model: 'gpt-5.6-terra-2026-07-09' })
    expect(onTextDelta).toHaveBeenCalledWith('ok')
  })
})
