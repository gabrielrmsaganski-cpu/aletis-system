// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React, { act } from '../../../web/node_modules/react/index.js'
import { createRoot } from '../../../web/node_modules/react-dom/client.js'
import { useAlixStreaming, type StreamHandlers, type StreamingMessage } from '../../../web/src/hooks/alix/useAlixStreaming.ts'

const MINUTE = 60_000
const encoder = new TextEncoder()
const donePayload = { reply: { role: 'assistant', content: 'Conferência preparada.', timestamp: 1 }, sessionId: 'session-fixture' }
type Hook = ReturnType<typeof useAlixStreaming>
type Connection = ReturnType<typeof makeConnection>
let root: ReturnType<typeof createRoot> | undefined
let element: HTMLDivElement
let hook: Hook
let connections: Connection[]
let pending: Promise<void>[]
let fetchMock: ReturnType<typeof vi.fn>

// O transporte local reproduz o cancelamento do fetch: abortar o sinal rejeita
// a leitura pendente. Não há chamadas à rede ou serviços do sistema.
function makeConnection(signal: AbortSignal) {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const cancelSource = vi.fn()
  const body = new ReadableStream<Uint8Array>({
    start(value) { controller = value },
    cancel(reason) { cancelSource(reason); signal.removeEventListener('abort', abort) },
  })
  const abort = () => { try { controller.error(signal.reason) } catch { /* já fechado */ } }
  signal.addEventListener('abort', abort, { once: true })
  const reader = body.getReader()
  const cancelReader = vi.spyOn(reader, 'cancel')
  const releaseReader = vi.spyOn(reader, 'releaseLock')
  const getReader = vi.spyOn(body, 'getReader').mockReturnValue(reader)
  return {
    body, signal, cancelSource, cancelReader, releaseReader, getReader,
    bytes(value: Uint8Array) { controller.enqueue(value) },
    send(event: string, value: unknown) { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`)) },
    raw(value: string) { controller.enqueue(encoder.encode(value)) },
    close() { controller.close(); signal.removeEventListener('abort', abort) },
    fail(error: Error) { controller.error(error); signal.removeEventListener('abort', abort) },
  }
}

function Harness() { hook = useAlixStreaming(); return null }
function handlers() {
  return { onRouting: vi.fn(), onProgress: vi.fn(), onToken: vi.fn(), onReasoning: vi.fn(), onTool: vi.fn(), onMission: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
}
async function start(callbacks: StreamHandlers, message: Partial<StreamingMessage> = {}, signal?: AbortSignal) {
  let promise!: Promise<void>
  await act(async () => { promise = hook.stream({ message: 'Conferir os documentos.', ...message }, callbacks, signal); pending.push(promise) })
  return { promise, connection: connections.at(-1)! }
}
async function emit(connection: Connection, event: string, value: unknown) { await act(async () => connection.send(event, value)) }
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

beforeEach(async () => {
  vi.useFakeTimers()
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  connections = []
  pending = []
  fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const connection = makeConnection(init.signal as AbortSignal)
    connections.push(connection)
    return { ok: true, body: connection.body } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
  await act(async () => root!.render(React.createElement(Harness)))
})

afterEach(async () => {
  await act(async () => { hook?.cancel(); await Promise.allSettled(pending); root?.unmount() })
  root = undefined
  element.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('progresso e limites do streaming da ALIX', () => {
  it('envia o pedido completo e informa roteamento, ferramentas, raciocínio e texto', async () => {
    const callbacks = handlers()
    const message: StreamingMessage = { message: 'Conferir fontes.', sessionId: 'session-fixture', clienteId: 'client-fixture', missionId: 'mission-fixture', analysisMode: 'deep', attachments: ['doc-fixture'], showReasoning: true }
    const { promise, connection } = await start(callbacks, message)
    expect(fetchMock).toHaveBeenCalledWith('/api/alix/chat/stream-v2', expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message), signal: connection.signal }))
    await emit(connection, 'routing', { mode: 'auto', model: 'model-fixture', provider: 'provider-fixture', taskType: 'document', fallback: false })
    await emit(connection, 'progress', { id: 'call-1', tool: 'consultar_analises_drive', phase: 'started', agent: 'orchestrator' })
    await emit(connection, 'progress', { id: 'call-1', tool: 'consultar_analises_drive', phase: 'completed', durationMs: 127, outcome: 'read' })
    await emit(connection, 'reasoning', { text: 'Conferindo evidências.' })
    await emit(connection, 'tool', { name: 'consultar_cliente' })
    await emit(connection, 'token', { text: 'Documento conferido.' })
    await emit(connection, 'done', donePayload)
    await promise
    expect(callbacks.onRouting).toHaveBeenCalledWith(expect.objectContaining({ mode: 'auto', model: 'model-fixture' }))
    expect(callbacks.onProgress).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'call-1', phase: 'started', agent: 'orchestrator' }))
    expect(callbacks.onProgress).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'call-1', phase: 'completed', durationMs: 127, outcome: 'read' }))
    expect(callbacks.onReasoning).toHaveBeenCalledWith('Conferindo evidências.')
    expect(callbacks.onTool).toHaveBeenCalledWith('consultar_cliente')
    expect(callbacks.onToken).toHaveBeenCalledWith('Documento conferido.')
    expect(callbacks.onDone).toHaveBeenCalledExactlyOnceWith(donePayload)
    expect(callbacks.onError).not.toHaveBeenCalled()
  })

  it('mantém a análise além dos cinco minutos quando há progresso útil', async () => {
    const callbacks = handlers()
    const { promise, connection } = await start(callbacks)
    await advance(4 * MINUTE)
    await emit(connection, 'progress', { id: 'read-1', tool: 'consultar_analises_drive', phase: 'completed', outcome: 'read' })
    await advance(2 * MINUTE)
    expect(connection.signal.aborted).toBe(false)
    expect(hook.isStreaming()).toBe(true)
    await emit(connection, 'done', donePayload)
    await promise
    expect(callbacks.onDone).toHaveBeenCalledOnce()
    expect(callbacks.onError).not.toHaveBeenCalled()
  })

  it('pings não adiam o limite de cinco minutos sem avanço', async () => {
    const callbacks = handlers()
    const { promise, connection } = await start(callbacks)
    await advance(4 * MINUTE)
    await emit(connection, 'ping', { timestamp: Date.now() })
    await advance(MINUTE)
    await promise
    expect(connection.signal.aborted).toBe(true)
    expect(connection.signal.reason.message).toBe('stream-idle-timeout')
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('cinco minutos sem novo progresso'))
    expect(hook.isStreaming()).toBe(false)
  })

  it('eventos inválidos, vazios ou desconhecidos não comprovam progresso', async () => {
    const callbacks = handlers()
    const { promise, connection } = await start(callbacks)
    await advance(4 * MINUTE)
    await emit(connection, 'progress', { id: '', tool: 'drive', phase: 'completed' })
    await emit(connection, 'progress', { id: 'call', tool: 'drive', phase: 'invented' })
    await emit(connection, 'routing', { mode: 'invented', model: 'fixture' })
    await emit(connection, 'token', { text: '  ' })
    await emit(connection, 'reasoning', { text: '\n' })
    await emit(connection, 'tool', { name: '' })
    await emit(connection, 'unknown', { text: 'keep alive' })
    await act(async () => connection.raw('event: progress\ndata: invalid-json\n\n'))
    await advance(MINUTE)
    await promise
    expect(callbacks.onProgress).not.toHaveBeenCalled()
    expect(callbacks.onRouting).not.toHaveBeenCalled()
    expect(callbacks.onTool).not.toHaveBeenCalled()
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('cinco minutos sem novo progresso'))
  })

  it('repetir a mesma missão, mesmo com nova data, não adia a detecção de inatividade', async () => {
    const callbacks = handlers()
    const { promise, connection } = await start(callbacks)
    const mission = { id: 'mission-fixture', status: 'running', currentStep: 'analyze', progress: 55 }
    await emit(connection, 'mission', { ...mission, updatedAt: '2026-09-10T10:00:00Z' })
    await advance(4 * MINUTE)
    await emit(connection, 'mission', { ...mission, updatedAt: '2026-09-10T10:04:00Z' })
    await advance(MINUTE)
    await promise
    expect(callbacks.onMission).toHaveBeenCalledTimes(2)
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('cinco minutos sem novo progresso'))
  })

  it('a mudança efetiva de etapa da missão renova o período de atividade', async () => {
    const callbacks = handlers()
    const { promise, connection } = await start(callbacks)
    await emit(connection, 'mission', { id: 'mission-fixture', status: 'running', currentStep: 'read', progress: 20 })
    await advance(4 * MINUTE)
    await emit(connection, 'mission', { id: 'mission-fixture', status: 'running', currentStep: 'analyze', progress: 55 })
    await advance(2 * MINUTE)
    expect(connection.signal.aborted).toBe(false)
    await emit(connection, 'done', donePayload)
    await promise
    expect(callbacks.onError).not.toHaveBeenCalled()
  })

  it.each([['standard', 10], ['deep', 20]] as const)('mantém no modo %s o teto de %i minutos mesmo com progresso', async (analysisMode, minutes) => {
    const callbacks = handlers()
    const { promise, connection } = await start(callbacks, { analysisMode })
    for (let minute = 2; minute < minutes; minute += 2) {
      await advance(2 * MINUTE)
      await emit(connection, 'progress', { id: `call-${minute}`, tool: 'conferir_documento', phase: 'completed' })
      expect(connection.signal.aborted).toBe(false)
    }
    await advance(2 * MINUTE)
    await promise
    expect(connection.signal.reason.message).toBe('stream-total-timeout')
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('limite desta execução'))
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('término, cancelamento e transporte', () => {
  it('done é terminal, ignora eventos posteriores e libera recursos imediatamente', async () => {
    const callbacks = handlers()
    const external = new AbortController()
    const added = vi.spyOn(external.signal, 'addEventListener')
    const removed = vi.spyOn(external.signal, 'removeEventListener')
    const { promise, connection } = await start(callbacks, {}, external.signal)
    await act(async () => connection.raw(`event: done\ndata: ${JSON.stringify(donePayload)}\n\nevent: token\ndata: {"text":"resposta tardia"}\n\nevent: error\ndata: {"error":"erro tardio"}\n\n`))
    await promise
    expect(callbacks.onDone).toHaveBeenCalledExactlyOnceWith(donePayload)
    expect(callbacks.onToken).not.toHaveBeenCalled()
    expect(callbacks.onError).not.toHaveBeenCalled()
    expect(connection.cancelReader).toHaveBeenCalledOnce()
    expect(connection.releaseReader).toHaveBeenCalledOnce()
    expect(connection.body.locked).toBe(false)
    expect(removed).toHaveBeenCalledExactlyOnceWith('abort', added.mock.calls[0][1])
    expect(hook.isStreaming()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    await advance(21 * MINUTE)
    expect(callbacks.onError).not.toHaveBeenCalled()
  })

  it('error é terminal e não exige fechamento posterior pelo servidor', async () => {
    const callbacks = handlers()
    const { promise, connection } = await start(callbacks)
    await emit(connection, 'error', { error: 'A fonte não está disponível.' })
    await promise
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith('A fonte não está disponível.')
    expect(callbacks.onDone).not.toHaveBeenCalled()
    expect(connection.cancelReader).toHaveBeenCalledOnce()
    expect(connection.releaseReader).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('o cancelamento manual é silencioso e libera a leitura pendente', async () => {
    const callbacks = handlers()
    const { promise, connection } = await start(callbacks)
    await act(async () => hook.cancel())
    await promise
    expect(connection.signal.aborted).toBe(true)
    expect(callbacks.onError).not.toHaveBeenCalled()
    expect(connection.cancelReader).toHaveBeenCalledOnce()
    expect(connection.releaseReader).toHaveBeenCalledOnce()
    expect(hook.isStreaming()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('o cancelamento externo preserva o motivo e remove seu listener', async () => {
    const callbacks = handlers()
    const external = new AbortController()
    const removed = vi.spyOn(external.signal, 'removeEventListener')
    const { promise, connection } = await start(callbacks, {}, external.signal)
    const reason = new Error('client-switched')
    await act(async () => external.abort(reason))
    await promise
    expect(connection.signal.reason).toBe(reason)
    expect(callbacks.onError).not.toHaveBeenCalled()
    expect(removed).toHaveBeenCalledOnce()
    expect(connection.body.locked).toBe(false)
  })

  it('um sinal já cancelado não inicia requisição nem deixa temporizadores', async () => {
    const callbacks = handlers()
    const external = new AbortController()
    external.abort(new Error('already-cancelled'))
    const { promise } = await start(callbacks, {}, external.signal)
    await promise
    expect(fetchMock).not.toHaveBeenCalled()
    expect(callbacks.onError).not.toHaveBeenCalled()
    expect(hook.isStreaming()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('iniciar outro stream cancela o anterior sem invalidar o controlador novo', async () => {
    const firstCallbacks = handlers()
    const secondCallbacks = handlers()
    const first = await start(firstCallbacks)
    const second = await start(secondCallbacks, { message: 'Nova conferência.' })
    await first.promise
    expect(first.connection.signal.aborted).toBe(true)
    expect(firstCallbacks.onError).not.toHaveBeenCalled()
    expect(second.connection.signal.aborted).toBe(false)
    expect(hook.isStreaming()).toBe(true)
    await emit(second.connection, 'done', donePayload)
    await second.promise
    expect(secondCallbacks.onDone).toHaveBeenCalledOnce()
    expect(hook.isStreaming()).toBe(false)
  })

  it('reconstitui UTF-8 e frames divididos e segue após JSON inválido', async () => {
    const callbacks = handlers()
    const { promise, connection } = await start(callbacks)
    const bytes = encoder.encode('event: token\ndata: {"text":"Ação útil"}\n\n')
    const boundary = bytes.indexOf(0xc3) + 1
    await act(async () => connection.bytes(bytes.slice(0, boundary)))
    expect(callbacks.onToken).not.toHaveBeenCalled()
    await act(async () => connection.bytes(bytes.slice(boundary)))
    await act(async () => connection.raw('event: progress\ndata: {bad json}\n\n'))
    await emit(connection, 'done', donePayload)
    await promise
    expect(callbacks.onToken).toHaveBeenCalledExactlyOnceWith('Ação útil')
    expect(callbacks.onDone).toHaveBeenCalledOnce()
    expect(callbacks.onError).not.toHaveBeenCalled()
  })

  it.each([false, true])('informa a interrupção do transporte sem fingir conclusão (com eventos: %s)', async (withEvents) => {
    const callbacks = handlers()
    const { promise, connection } = await start(callbacks)
    if (withEvents) await emit(connection, 'token', { text: 'Conferindo...' })
    await act(async () => connection.close())
    await promise
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith(withEvents ? expect.stringContaining('interrompida antes da conclusão') : 'Conexão fechou sem resposta')
    expect(callbacks.onDone).not.toHaveBeenCalled()
    expect(connection.body.locked).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('informa erro de leitura e libera um reader cujo cancelamento já rejeita', async () => {
    const callbacks = handlers()
    const { promise, connection } = await start(callbacks)
    await act(async () => connection.fail(new Error('stream-fixture-error')))
    await promise
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith('stream-fixture-error')
    expect(connection.cancelReader).toHaveBeenCalledOnce()
    expect(connection.releaseReader).toHaveBeenCalledOnce()
    expect(connection.body.locked).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    [{ ok: false, status: 503 }, 'HTTP 503 ao iniciar stream'],
    [{ ok: true, body: null }, 'Resposta sem body'],
  ])('limpa temporizadores e listener quando o servidor não entrega um stream (%j)', async (response, error) => {
    const callbacks = handlers()
    const external = new AbortController()
    const removed = vi.spyOn(external.signal, 'removeEventListener')
    fetchMock.mockResolvedValueOnce(response)
    const { promise } = await start(callbacks, {}, external.signal)
    await promise
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith(error)
    expect(removed).toHaveBeenCalledOnce()
    expect(hook.isStreaming()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
