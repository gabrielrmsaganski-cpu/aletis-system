import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OpenAI from 'openai'
import type { LLMRunOpts } from '../../src/services/llm/types.js'

// Mesmo isolamento do SDK usado em foundry-responses.test.ts: nenhuma chamada de rede ou telemetria PG.
const mocks = vi.hoisted(() => ({ create: vi.fn(), context: vi.fn() }))
vi.mock('../../src/services/llm/ProviderClient.js', () => ({ getPrimaryResponsesContext: mocks.context }))
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => false }))
import { generateStructured, runOpenAI, streamOpenAI } from '../../src/services/llm/OpenAIClient.js'

const messages = [{ role: 'user' as const, content: 'Verificação sintética de opções da requisição.' }]
const completed = {
  id: 'resp-options-test', model: 'gpt-5.6-terra', status: 'completed',
  output_text: 'Concluído', output: [],
  usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
}

async function* responseEvents() {
  yield { type: 'response.output_text.delta', delta: 'Concluído' }
  yield { type: 'response.completed', response: completed }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.create.mockReset()
  mocks.context.mockResolvedValue({
    client: { responses: { create: mocks.create } },
    model: { id: 'gpt-5.6-terra', deployment: 'terra-test', provider: 'foundry' },
  })
})

type TimedPath = 'run' | 'stream' | 'structured'

async function invokeTimedPath(path: TimedPath, options: LLMRunOpts): Promise<unknown> {
  if (path === 'run') return runOpenAI(messages, options)
  if (path === 'structured') return generateStructured(messages, { ...structuredOptions, ...options })
  const chunks = []
  for await (const chunk of streamOpenAI(messages, options)) chunks.push(chunk)
  return chunks
}

function successfulTimedResponse(path: TimedPath): Response {
  if (path === 'stream') return new Response([
    `event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'Concluído' })}\n\n`,
    `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: completed })}\n\n`,
    'data: [DONE]\n\n',
  ].join(''), { headers: { 'content-type': 'text/event-stream' } })
  return new Response(JSON.stringify({ ...completed, output_text: path === 'structured' ? '{"status":"ok"}' : completed.output_text }), { headers: { 'content-type': 'application/json' } })
}

// O SDK é real. Somente fetch e relógio são sintéticos, para comprovar o prazo
// efetivo sem esperar minutos e sem acessar modelo, rede ou banco de produção.
async function startTimedRequest(path: TimedPath, options: LLMRunOpts = {}) {
  vi.useFakeTimers()
  let signal!: AbortSignal
  let respond!: (response: Response) => void
  const fetchMock = vi.fn(async (_url: unknown, request?: RequestInit) => new Promise<Response>((resolve, reject) => {
    signal = request!.signal!
    const abort = () => reject(new DOMException('Abort sintético do transporte', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    respond = response => { signal.removeEventListener('abort', abort); resolve(response) }
  }))
  const client = new OpenAI({ apiKey: 'synthetic-test-key', baseURL: 'https://openai.test/v1', timeout: 120_000, maxRetries: 3, fetch: fetchMock })
  mocks.context.mockResolvedValue({ client, model: { id: 'gpt-5.6-terra', deployment: 'terra-test', provider: 'foundry' } })
  const settled = vi.fn()
  const result = invokeTimedPath(path, { requestMaxRetries: 0, ...options }).then(
    value => ({ kind: 'success' as const, value }),
    error => ({ kind: 'error' as const, error }),
  ).then(outcome => { settled(outcome); return outcome })
  await vi.advanceTimersByTimeAsync(0)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  return { client, fetchMock, signal, respond, settled, result }
}

describe.each(['run', 'stream', 'structured'] as const)('prazo por requisição com SDK real — %s', path => {
  it('mantém os 120 segundos configurados no cliente quando a opção está ausente', async () => {
    const request = await startTimedRequest(path)
    await vi.advanceTimersByTimeAsync(119_999)
    expect(request.signal.aborted).toBe(false)
    expect(request.settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    const outcome = await request.result
    expect(request.signal.aborted).toBe(true)
    if (path === 'stream') {
      expect(outcome).toMatchObject({ kind: 'success', value: [expect.objectContaining({ type: 'error', error: expect.stringMatching(/timed out/i) })] })
    } else {
      expect(outcome).toMatchObject({ kind: 'error', error: expect.objectContaining({ message: expect.stringMatching(/timed out/i) }) })
    }
    expect(request.fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('o prazo de 240 segundos permite concluir aos 180 sem alterar o padrão do cliente', async () => {
    const request = await startTimedRequest(path, { requestTimeoutMs: 240_000 })
    await vi.advanceTimersByTimeAsync(180_000)
    expect(request.signal.aborted).toBe(false)
    expect(request.settled).not.toHaveBeenCalled()
    request.respond(successfulTimedResponse(path))
    await vi.advanceTimersByTimeAsync(0)
    const outcome = await request.result
    if (path === 'structured') expect(outcome).toMatchObject({ kind: 'success', value: { data: { status: 'ok' } } })
    else if (path === 'run') expect(outcome).toMatchObject({ kind: 'success', value: { text: 'Concluído' } })
    else {
      expect(outcome.kind).toBe('success')
      expect((outcome as { value: unknown[] }).value).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'finish' })]))
      expect((outcome as { value: unknown[] }).value).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'error' })]))
    }
    expect(request.client.timeout).toBe(120_000)
    expect(request.client.maxRetries).toBe(3)
    expect(request.fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('encerra exatamente aos 240 segundos sem repetir uma requisição expirada', async () => {
    const request = await startTimedRequest(path, { requestTimeoutMs: 240_000 })
    await vi.advanceTimersByTimeAsync(239_999)
    expect(request.signal.aborted).toBe(false)
    expect(request.settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    const outcome = await request.result
    expect(request.signal.aborted).toBe(true)
    if (path === 'stream') {
      expect(outcome).toMatchObject({ kind: 'success', value: [expect.objectContaining({ type: 'error', error: expect.stringMatching(/timed out/i) })] })
    } else {
      expect(outcome).toMatchObject({ kind: 'error', error: expect.objectContaining({ message: expect.stringMatching(/timed out/i) }) })
    }
    expect(request.fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('o AbortSignal interrompe imediatamente mesmo com prazo ampliado', async () => {
    const controller = new AbortController()
    const request = await startTimedRequest(path, { requestTimeoutMs: 240_000, signal: controller.signal })
    await vi.advanceTimersByTimeAsync(30_000)
    controller.abort(new Error('Cancelamento sintético do usuário'))
    await vi.advanceTimersByTimeAsync(0)
    const outcome = await request.result
    expect(request.signal.aborted).toBe(true)
    expect(outcome).toMatchObject({ kind: 'error' })
    if (outcome.kind === 'error') expect(outcome.error.message).not.toMatch(/timed out/i)
    expect(request.fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
afterEach(() => { vi.useRealTimers() })

const cases: Array<{ label: string; options: LLMRunOpts; retries: number | undefined }> = [
  { label: 'zero explícito', options: { requestMaxRetries: 0 }, retries: 0 },
  { label: 'uma repetição explícita', options: { requestMaxRetries: 1 }, retries: 1 },
  { label: 'opção ausente', options: {}, retries: undefined },
  { label: 'prazo mínimo sem mudar repetições', options: { requestTimeoutMs: 1 }, retries: undefined },
  { label: 'prazo de quatro minutos sem repetição', options: { requestTimeoutMs: 240_000, requestMaxRetries: 0 }, retries: 0 },
  { label: 'prazo máximo sem mudar repetições', options: { requestTimeoutMs: 600_000 }, retries: undefined },
]
const structuredOptions = { name: 'isolated_candidates', schema: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'], additionalProperties: false } }

function expectSdkOptions(retries: number | undefined, signal: AbortSignal, timeout?: number) {
  expect(mocks.create).toHaveBeenCalledTimes(1)
  const [body, sdkOptions] = mocks.create.mock.calls[0]
  expect(sdkOptions.signal).toBe(signal)
  if (retries === undefined) {
    expect(sdkOptions).not.toHaveProperty('maxRetries')
  } else {
    expect(sdkOptions).toHaveProperty('maxRetries', retries)
  }
  expect(body).not.toHaveProperty('maxRetries')
  expect(body).not.toHaveProperty('requestMaxRetries')
  if (timeout === undefined) expect(sdkOptions).not.toHaveProperty('timeout')
  else expect(sdkOptions).toHaveProperty('timeout', timeout)
  expect(body).not.toHaveProperty('timeout')
  expect(body).not.toHaveProperty('requestTimeoutMs')
}

describe('opções de repetição por requisição Responses', () => {
  it.each(cases)('generateStructured respeita $label e conserva AbortSignal fora do corpo', async ({ options, retries }) => {
    const controller = new AbortController()
    mocks.create.mockResolvedValue({ ...completed, output_text: '{"status":"ok"}' })
    expect((await generateStructured(messages, { ...structuredOptions, ...options, signal: controller.signal })).data).toEqual({ status: 'ok' })
    expectSdkOptions(retries, controller.signal, options.requestTimeoutMs)
  })

  it.each([-1, 0.5, Number.NaN])('generateStructured rejeita limite inválido %s antes de chamar o SDK', async requestMaxRetries => {
    await expect(generateStructured(messages, { ...structuredOptions, requestMaxRetries })).rejects.toThrow('inteiro não negativo')
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it.each([0, -1, 1.5, 600_001, Number.NaN, Number.POSITIVE_INFINITY])('generateStructured rejeita prazo inválido %s antes de chamar o SDK', async requestTimeoutMs => {
    await expect(generateStructured(messages, { ...structuredOptions, requestTimeoutMs })).rejects.toThrow('requestTimeoutMs deve ser um inteiro entre 1 e 600000')
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('runOpenAI rejeita prazo inválido sem enviar requisição', async () => {
    await expect(runOpenAI(messages, { requestTimeoutMs: 0 })).rejects.toThrow('requestTimeoutMs deve ser um inteiro entre 1 e 600000')
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('streamOpenAI informa prazo inválido pelo evento de erro sem enviar requisição', async () => {
    const chunks = []
    for await (const chunk of streamOpenAI(messages, { requestTimeoutMs: 600_001 })) chunks.push(chunk)
    expect(chunks).toEqual([{ type: 'error', error: 'requestTimeoutMs deve ser um inteiro entre 1 e 600000', responseId: undefined }])
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('generateStructured limita a uma requisição após HTTP 503 mesmo com retry padrão igual a três', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Erro sintético', type: 'server_error' } }), { status: 503, headers: { 'content-type': 'application/json' } }))
    const client = new OpenAI({ apiKey: 'synthetic-test-key', baseURL: 'https://openai.test/v1', maxRetries: 3, fetch: fetchMock })
    mocks.context.mockResolvedValue({ client, model: { id: 'gpt-5.6-luna', deployment: 'luna-test', provider: 'foundry' } })
    await expect(generateStructured(messages, { ...structuredOptions, requestMaxRetries: 0 })).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('generateStructured limita a uma requisição em timeout do SDK', async () => {
    const fetchMock = vi.fn(async (_url: unknown, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Timeout sintético', 'AbortError')), { once: true })
    }))
    const client = new OpenAI({ apiKey: 'synthetic-test-key', baseURL: 'https://openai.test/v1', maxRetries: 3, timeout: 15, fetch: fetchMock })
    mocks.context.mockResolvedValue({ client, model: { id: 'gpt-5.6-luna', deployment: 'luna-test', provider: 'foundry' } })
    await expect(generateStructured(messages, { ...structuredOptions, requestMaxRetries: 0 })).rejects.toThrow(/timed out/i)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(cases)('runOpenAI respeita $label sem alterar o padrão quando ausente', async ({ options, retries }) => {
    const controller = new AbortController()
    mocks.create.mockResolvedValue(completed)

    const result = await runOpenAI(messages, { ...options, signal: controller.signal })

    expect(result.text).toBe('Concluído')
    expectSdkOptions(retries, controller.signal, options.requestTimeoutMs)
  })

  it.each(cases)('streamOpenAI respeita $label no segundo argumento do SDK', async ({ options, retries }) => {
    const controller = new AbortController()
    mocks.create.mockResolvedValue(responseEvents())
    const chunks = []

    for await (const chunk of streamOpenAI(messages, { ...options, signal: controller.signal })) chunks.push(chunk)

    expect(chunks.some(chunk => chunk.type === 'error')).toBe(false)
    expect(chunks.at(-1)?.type).toBe('finish')
    expect(mocks.create.mock.calls[0][0]).toHaveProperty('stream', true)
    expectSdkOptions(retries, controller.signal, options.requestTimeoutMs)
  })

  it('preserva zero quando runOpenAI delega ao streaming por callback de texto', async () => {
    const controller = new AbortController()
    const onTextDelta = vi.fn()
    mocks.create.mockResolvedValue(responseEvents())

    const result = await runOpenAI(messages, {
      requestMaxRetries: 0,
      requestTimeoutMs: 240_000,
      signal: controller.signal,
      onTextDelta,
    })

    expect(result.text).toBe('Concluído')
    expect(onTextDelta).toHaveBeenCalledWith('Concluído')
    expect(mocks.create.mock.calls[0][0]).toHaveProperty('stream', true)
    expectSdkOptions(0, controller.signal, 240_000)
  })

  it('desativa de fato as três repetições padrão do SDK real após um HTTP 503', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'Indisponibilidade sintética', type: 'server_error', code: 'service_unavailable' },
    }), { status: 503, headers: { 'content-type': 'application/json' } }))
    const client = new OpenAI({
      apiKey: 'synthetic-test-key',
      baseURL: 'https://openai.test/v1',
      maxRetries: 3,
      fetch: fetchMock,
    })
    mocks.context.mockResolvedValue({
      client,
      model: { id: 'gpt-5.6-terra', deployment: 'gpt-5.6-terra', provider: 'openai' },
    })

    await expect(runOpenAI(messages, { requestMaxRetries: 0 })).rejects.toMatchObject({ status: 503 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mocks.context).toHaveBeenCalledTimes(1)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('preserva zero na continuação real sem repetir ferramenta após HTTP 503', async () => {
    const spec = {
      name: 'local_read',
      description: 'Leitura sintética sem efeitos externos.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    }
    const handler = vi.fn().mockResolvedValue({ found: true })
    let requests = 0
    const fetchMock = vi.fn(async () => {
      requests++
      const body = requests === 1 ? {
        ...completed,
        output_text: '',
        output: [{
          id: 'fc-options-read', type: 'function_call', call_id: 'call-options-read',
          name: 'local_read', arguments: '{}', status: 'completed',
        }],
      } : {
        error: { message: 'Continuação sintética indisponível', type: 'server_error', code: 'service_unavailable' },
      }
      return new Response(JSON.stringify(body), {
        status: requests === 1 ? 200 : 503,
        headers: { 'content-type': 'application/json' },
      })
    })
    const client = new OpenAI({
      apiKey: 'synthetic-test-key',
      baseURL: 'https://openai.test/v1',
      maxRetries: 3,
      fetch: fetchMock,
    })
    mocks.context.mockResolvedValue({
      client,
      model: { id: 'gpt-5.6-terra', deployment: 'gpt-5.6-terra', provider: 'openai' },
    })

    await expect(runOpenAI(messages, {
      requestMaxRetries: 0,
      tools: [spec],
      toolRegistry: { local_read: { spec, handler } },
    })).rejects.toMatchObject({ status: 503 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({})
    expect(mocks.context).toHaveBeenCalledTimes(1)
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
