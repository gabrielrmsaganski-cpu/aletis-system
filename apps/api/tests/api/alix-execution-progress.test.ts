// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import React, { act } from '../../../web/node_modules/react/index.js'
import { createRoot } from '../../../web/node_modules/react-dom/client.js'
import AlixExecutionPanel from '../../../web/src/components/alix/AlixExecutionPanel'
import { useAlixExecution } from '../../../web/src/hooks/alix/useAlixExecution'
import { useAlixStreaming } from '../../../web/src/hooks/alix/useAlixStreaming'
import { observeToolRegistry } from '../../src/services/alix/tools/ToolOutcome.js'

let element: HTMLDivElement
let root: ReturnType<typeof createRoot>
let stream: ReturnType<typeof useAlixStreaming>
let execution: ReturnType<typeof useAlixExecution>
beforeEach(async () => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
  function Harness() {
    execution = useAlixExecution()
    stream = useAlixStreaming()
    return React.createElement(AlixExecutionPanel, { execution: execution.execution, compact: true })
  }
  await act(async () => root.render(React.createElement(Harness)))
})
afterEach(async () => { stream.cancel(); await act(async () => root.unmount()); element.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it.each([false, true])('progresso rápido do observer chega pelo SSE e continua visível antes da resposta; falha=%s', async failed => {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start(value) { controller = value } })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body)))
  const encoder = new TextEncoder()
  const send = (event: string, payload: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`))
  await act(async () => execution.begin('mission-fixture'))
  let pending!: Promise<void>
  const onError = vi.fn()
  await act(async () => {
    pending = stream.stream({ message: 'Conferir documento' }, {
      onProgress: event => execution.progress('mission-fixture', event),
      onDone: () => execution.finish('mission-fixture', 'completed'),
      onError,
    })
  })
  const observed = observeToolRegistry({ consultar_analises_drive: {
    spec: { name: 'consultar_analises_drive', description: 'Consulta da fixture', input_schema: { type: 'object', properties: {} } },
    handler: async () => failed ? { success: false, error: 'Fonte indisponível' } : { success: true, data: { analyses: [] } },
  } }, { onProgress: event => send('progress', event) })
  await act(async () => { await observed.consultar_analises_drive.handler({}); await Promise.resolve() })
  expect(execution.execution?.status).toBe('running')
  expect(execution.execution?.tools).toHaveLength(1)
  expect(execution.execution?.tools[0].phase).toBe(failed ? 'failed' : 'completed')
  expect(element.textContent).toContain('Trabalho em andamento')
  expect(element.textContent).toContain(failed ? '0 consultas concluídas · 1 consulta sem conclusão' : '1 consulta concluída · Última:')
  expect(element.textContent).not.toContain('Resposta concluída')
  await act(async () => {
    send('done', { sessionId: 'session-fixture', reply: { role: 'assistant', content: 'Conferência terminada', timestamp: 1 } })
    controller.close()
    await pending
  })
  expect(element.textContent).toContain('Resposta concluída')
  expect(onError).not.toHaveBeenCalled()
})
