// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import React, { act } from '../../../web/node_modules/react/index.js'
import { createRoot } from '../../../web/node_modules/react-dom/client.js'
import { useAlixExecution } from '../../../web/src/hooks/alix/useAlixExecution'
import { useAlixStreaming } from '../../../web/src/hooks/alix/useAlixStreaming'
import { availableAlixModelOptions, useAlixModelCatalogue } from '../../../web/src/hooks/alix/useAlixModelCatalogue'
import { collectAlixDeliveries, type AlixRoutingDecision } from '../../../web/src/components/alix/alixWorkspacePresentation'
import { actionMatchesScope, actionReceiptLabel } from '../../../web/src/components/alix/alixActionPresentation'
import { AlixConfirmationSingleCard, useConfirmationStream } from '../../../web/src/components/alix/AlixConfirmationBatch'

const mocked = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('../../../web/src/hooks/useApi', () => ({ apiFetch: mocked.api }))
let root: ReturnType<typeof createRoot>
let element: HTMLDivElement
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
})
afterEach(async () => { await act(async () => root.unmount()); element.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const routing: AlixRoutingDecision = { mode: 'auto', model: 'modelo-a', modelLabel: 'Modelo verificado', provider: 'foundry', reason: 'Pedido operacional', taskType: 'operation', fallback: false }

it('mantém o progresso após primeiro resultado e recusa eventos de execução anterior ao trocar contexto', async () => {
  let state!: ReturnType<typeof useAlixExecution>
  function Harness() { state = useAlixExecution(); return null }
  await act(async () => root.render(React.createElement(Harness)))
  await act(async () => { state.begin('a'); state.route('a', routing); state.progress('a', { id: 'tool-a', tool: 'buscar_cliente', phase: 'started' }) })
  await act(async () => { state.progress('a', { id: 'tool-a', tool: 'buscar_cliente', phase: 'completed', outcome: 'read' }); state.progress('a', { id: 'tool-a', tool: 'buscar_cliente', phase: 'started' }) })
  expect(state.execution?.status).toBe('running')
  expect(state.execution?.tools[0].phase).toBe('completed')
  await act(async () => { state.finish('a', 'completed'); state.finish('a', 'interrupted') })
  expect(state.execution?.status).toBe('completed')
  await act(async () => { state.reset(); state.begin('b'); state.route('a', routing); state.progress('a', { id: 'late-a', tool: 'alterar_cliente', phase: 'completed', outcome: 'executed' }); state.finish('a', 'failed') })
  expect(state.execution).toMatchObject({ id: 'b', status: 'running', tools: [] })
  expect(state.execution?.routing).toBeUndefined()
})

it('decodifica routing e progresso entre fragmentos SSE preservando conclusão real e ignorando eventos malformados', async () => {
  let hook!: ReturnType<typeof useAlixStreaming>
  function Harness() { hook = useAlixStreaming(); return null }
  const frames = `event: routing\ndata: ${JSON.stringify(routing)}\n\nevent: progress\ndata: {"id":"p","tool":"pesquisar_web","phase":"started"}\n\nevent: progress\ndata: {"id":"p","tool":"pesquisar_web","phase":"inventado"}\n\nevent: progress\ndata: {"id":"p","tool":"pesquisar_web","phase":"completed","outcome":"read","durationMs":42}\n\nevent: done\ndata: {"sessionId":"a","reply":{"role":"assistant","content":"Fontes verificadas","timestamp":1}}\n\n`
  const encoder = new TextEncoder()
  const fetchMock = vi.fn(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(frames.slice(0, 91))); controller.enqueue(encoder.encode(frames.slice(91))); controller.close() } })))
  vi.stubGlobal('fetch', fetchMock)
  await act(async () => root.render(React.createElement(Harness)))
  const handlers = { onRouting: vi.fn(), onProgress: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
  await act(async () => hook.stream({ message: 'Pesquisar', modelPreference: 'auto' }, handlers))
  expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toMatchObject({ modelPreference: 'auto' })
  expect(handlers.onRouting).toHaveBeenCalledWith(expect.objectContaining({ model: 'modelo-a', reason: 'Pedido operacional' }))
  expect(handlers.onProgress.mock.calls.map(([progress]) => progress.phase)).toEqual(['started', 'completed'])
  expect(handlers.onProgress.mock.calls[1][0].outcome).toBe('read')
  expect(handlers.onDone).toHaveBeenCalledTimes(1)
  expect(handlers.onError).not.toHaveBeenCalled()
})

it('stream que só entrega progresso e fecha não é tratado como resposta concluída', async () => {
  let hook!: ReturnType<typeof useAlixStreaming>
  function Harness() { hook = useAlixStreaming(); return null }
  vi.stubGlobal('fetch', vi.fn(async () => new Response('event: progress\ndata: {"id":"p","tool":"buscar_cliente","phase":"started"}\n\n')))
  await act(async () => root.render(React.createElement(Harness)))
  const onError = vi.fn(); const onDone = vi.fn()
  await act(async () => hook.stream({ message: 'Consultar' }, { onError, onDone }))
  expect(onError).toHaveBeenCalledWith(expect.stringContaining('antes da conclusão'))
  expect(onDone).not.toHaveBeenCalled()
})

it('catálogo só permite modelos confirmados com conversa, ferramentas e Responses; falha de atualização remove seleção antiga', async () => {
  const base = { id: 'confirmado', deployment: 'dep', provider: 'foundry', label: 'Modelo confirmado', availability: 'available' as const, capabilities: ['chat', 'tool_calling'], protocols: ['responses' as const] }
  const options = availableAlixModelOptions([base, { ...base, id: 'unknown', availability: 'unknown' }, { ...base, id: 'chat-only', protocols: ['chat_completions'] }, { ...base, id: 'no-tools', capabilities: ['chat'] }])
  expect(options.filter(option => option.available).map(option => option.id)).toEqual(['confirmado'])
  let catalogue!: ReturnType<typeof useAlixModelCatalogue>
  function Harness() { catalogue = useAlixModelCatalogue(); return null }
  mocked.api.mockResolvedValueOnce({ configured: true, checkedAt: '2026-09-06T00:00:00Z', models: [base] })
  await act(async () => root.render(React.createElement(Harness)))
  expect(catalogue.options.filter(option => option.available)).toHaveLength(1)
  mocked.api.mockResolvedValueOnce({ configured: true, stale: true, models: [base] })
  await act(async () => catalogue.refresh())
  expect(catalogue.options).toEqual([])
  expect(catalogue.error).toContain('confirmar')
})

it('entregas surgem somente de arquivos retornados, sem transformar promessas textuais em links', () => {
  expect(collectAlixDeliveries([{ id: 'fake', role: 'assistant', metadata: {} }])).toEqual([])
  const deliveries = collectAlixDeliveries([
    { id: 'user', role: 'user', metadata: { documents: [{ id: 'u', downloadUrl: '/untrusted-user' }] } },
    { id: 'a', role: 'assistant', metadata: { documents: [{ id: 'no-url', filename: 'prometido.pdf' }, { id: 'doc', filename: 'parecer.pdf', downloadUrl: '/api/documents/doc/download' }] } },
  ])
  expect(deliveries).toEqual([expect.objectContaining({ id: 'doc', filename: 'parecer.pdf', downloadUrl: '/api/documents/doc/download' })])
})

it('recibo preparado nunca afirma execução e filtra pelo contexto de origem incluindo origem sem cliente', () => {
  expect(actionReceiptLabel({ id: 'x', executionStatus: 'completed', outcome: 'prepared', prepared: true, executed: false })).toBe('Preparado · execução final pendente')
  expect(actionReceiptLabel({ id: 'x', executionStatus: 'running', outcome: 'executed', executed: true })).toBe('Execução em andamento')
  expect(actionReceiptLabel({ id: 'x', executionStatus: 'completed', outcome: 'executed', executed: true })).toBe('Ação concluída')
  expect(actionReceiptLabel({ id: 'x', executionStatus: 'unknown', executed: true })).toBe('Resultado ainda não confirmado')
  const pending = { sessionId: 'a', contextClienteId: null, clienteId: 'novo-cliente-criado' }
  expect(actionMatchesScope(pending, { sessionId: 'a', clienteId: null })).toBe(true)
  expect(actionMatchesScope(pending, { sessionId: 'a', clienteId: 'novo-cliente-criado' })).toBe(false)
  expect(actionMatchesScope(pending, { sessionId: 'b', clienteId: null })).toBe(false)
})

it('aprovação preserva desafio e contexto, impede clique síncrono duplicado e exibe recibo preparado', async () => {
  let complete!: (value: unknown) => void
  mocked.api.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  const onReceipt = vi.fn()
  await act(async () => root.render(React.createElement(AlixConfirmationSingleCard, { pending: { id: 'p', toolName: 'enviar_mensagem_whatsapp_intent', description: 'Preparar mensagem', createdAt: '', expiresAt: '', approvalsRequired: 2 }, scope: { sessionId: 'a', clienteId: 'cliente-a' }, onReceipt })))
  const approve = () => Array.from(element.querySelectorAll('button')).find(button => /Aprovar|Confirmar novamente/.test(button.textContent || ''))!
  await act(async () => { approve().click(); approve().click() })
  expect(mocked.api).toHaveBeenCalledTimes(1)
  expect(JSON.parse(mocked.api.mock.calls[0][1].body)).toEqual({ sessionId: 'a', clienteId: 'cliente-a' })
  await act(async () => complete({ status: 'awaiting_second_approval', challenge: 'challenge-verificado' }))
  expect(onReceipt).not.toHaveBeenCalled()
  mocked.api.mockResolvedValueOnce({ id: 'p', executionStatus: 'completed', outcome: 'prepared', prepared: true, executed: false })
  await act(async () => approve().click())
  expect(JSON.parse(mocked.api.mock.calls[1][1].body)).toEqual({ sessionId: 'a', clienteId: 'cliente-a', challenge: 'challenge-verificado' })
  expect(element.textContent).toContain('Preparado · execução final pendente')
  expect(element.textContent).not.toContain('Ação concluída')
})

it('consulta de confirmações cancelada em A não publica ações antigas após mudar para B', async () => {
  const calls: Array<{ path: string; signal: AbortSignal; resolve: (value: unknown) => void }> = []
  mocked.api.mockImplementation((path: string, init: RequestInit) => new Promise(resolve => calls.push({ path, signal: init.signal!, resolve })))
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
  let state!: ReturnType<typeof useConfirmationStream>
  function Harness({ id }: { id: string }) { state = useConfirmationStream({ sessionId: id, clienteId: `cliente-${id}` }); return null }
  await act(async () => root.render(React.createElement(Harness, { id: 'a' })))
  await act(async () => root.render(React.createElement(Harness, { id: 'b' })))
  expect(calls[0].signal.aborted).toBe(true)
  await act(async () => { calls[2].resolve([]); calls[3].resolve([{ id: 'b', sessionId: 'b', contextClienteId: 'cliente-b' }, { id: 'a-mixed', sessionId: 'a', contextClienteId: 'cliente-a' }]) })
  await act(async () => { calls[0].resolve([]); calls[1].resolve([{ id: 'a-late', sessionId: 'a', contextClienteId: 'cliente-a' }]) })
  expect(state.singles.map(pending => pending.id)).toEqual(['b'])
})

it('HTTP202 consulta recibo até concluir sem repetir POST e cancela consulta ao sair do contexto', async () => {
  vi.useFakeTimers()
  const onReceipt = vi.fn()
  const pending = { id: 'p', sessionId: 'a', contextClienteId: 'cliente-a', toolName: 'atualizar_cliente', description: 'Atualizar cadastro', createdAt: '', expiresAt: '' }
  const props = { pending, scope: { sessionId: 'a', clienteId: 'cliente-a' }, onReceipt }
  mocked.api.mockResolvedValueOnce({ ...pending, executionStatus: 'running' })
  await act(async () => root.render(React.createElement(AlixConfirmationSingleCard, props)))
  const approve = () => Array.from(element.querySelectorAll('button')).find(button => button.textContent === 'Aprovar')!
  await act(async () => approve().click())
  expect(element.textContent).toContain('Execução em andamento')
  expect(approve().disabled).toBe(true)
  mocked.api.mockResolvedValueOnce({ ...pending, executionStatus: 'completed', outcome: 'executed', executed: true })
  await act(async () => vi.advanceTimersByTimeAsync(1500))
  expect(mocked.api.mock.calls[1][0]).toBe('/alix/confirmations/p')
  expect(mocked.api.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  expect(element.textContent).toContain('Ação concluída')
  await act(async () => vi.advanceTimersByTimeAsync(6000))
  expect(mocked.api).toHaveBeenCalledTimes(2)

  await act(async () => root.render(null))
  let resolveLate!: (value: unknown) => void
  mocked.api.mockResolvedValueOnce({ ...pending, executionStatus: 'running' })
  mocked.api.mockImplementationOnce(() => new Promise(resolve => { resolveLate = resolve }))
  await act(async () => root.render(React.createElement(AlixConfirmationSingleCard, props)))
  await act(async () => approve().click())
  await act(async () => vi.advanceTimersByTimeAsync(1500))
  const signal = mocked.api.mock.calls[3][1].signal as AbortSignal
  await act(async () => root.render(null))
  expect(signal.aborted).toBe(true)
  const count = onReceipt.mock.calls.length
  await act(async () => resolveLate({ ...pending, executionStatus: 'completed', outcome: 'executed', executed: true }))
  expect(onReceipt).toHaveBeenCalledTimes(count)
})
