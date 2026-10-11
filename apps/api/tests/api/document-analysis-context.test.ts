// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import React, { act } from '../../../web/node_modules/react/index.js'
import { createRoot } from '../../../web/node_modules/react-dom/client.js'
import { useDocumentAnalysis } from '../../../web/src/hooks/useDocumentAnalysis'

let state: ReturnType<typeof useDocumentAnalysis>
let root: ReturnType<typeof createRoot>
let element: HTMLDivElement
const pending: Array<{ signal: AbortSignal; resolve: (response: Response) => void }> = []
function View() { state = useDocumentAnalysis(); return React.createElement('output', null, JSON.stringify({ analysis: state.analysis, loading: state.loading, error: state.error })) }
beforeEach(async () => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  pending.length = 0
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>(resolve => pending.push({ signal: init.signal as AbortSignal, resolve }))))
  element = document.createElement('div'); document.body.append(element); root = createRoot(element)
  await act(async () => root.render(React.createElement(View)))
})
afterEach(async () => { await act(async () => root.unmount()); element.remove(); vi.unstubAllGlobals() })
const result = (id: string) => new Response(JSON.stringify({ success: true, data: { analysis: { documentoId: id, resumoExecutivo: `Análise de ${id}` } } }))

it('limpar a conversa cancela a consulta e uma resposta tardia não reaparece como análise', async () => {
  let request!: Promise<unknown>
  await act(async () => { request = state.fetchAnalysis('arquivo-a', 'sessao-a').catch(error => error) })
  await act(async () => state.clear())
  expect(pending[0].signal.aborted).toBe(true)
  await act(async () => { pending[0].resolve(result('arquivo-a')); await request })
  expect(state.analysis).toBeNull()
  expect(state.error).toBeNull()
  expect(state.loading).toBe(false)
})

it('a análise de B permanece mesmo quando A termina depois e o transporte ignora abort', async () => {
  let first!: Promise<unknown>; let second!: Promise<unknown>
  await act(async () => { first = state.fetchAnalysis('arquivo-a', 'sessao-a').catch(error => error) })
  await act(async () => { second = state.fetchAnalysis('arquivo-b', 'sessao-b').catch(error => error) })
  expect(pending[0].signal.aborted).toBe(true)
  await act(async () => { pending[1].resolve(result('arquivo-b')); await second })
  await act(async () => { pending[0].resolve(result('arquivo-a')); await first })
  expect(state.analysis?.analysis.documentoId).toBe('arquivo-b')
  expect(state.error).toBeNull()
})

it('o polling da análise em fila recebe o mesmo cancelamento da conversa', async () => {
  let request!: Promise<unknown>
  await act(async () => { request = state.fetchAnalysis('arquivo-a', 'sessao-a').catch(error => error) })
  await act(async () => pending[0].resolve(new Response(JSON.stringify({ success: true, data: { queued: true, statusUrl: '/api/test-analysis-job' } }))))
  expect(pending).toHaveLength(2)
  await act(async () => state.clear())
  expect(pending[1].signal.aborted).toBe(true)
  await act(async () => { pending[1].resolve(new Response(JSON.stringify({ success: true, data: { completed: true, output: { analysis: { documentoId: 'arquivo-a' } } } }))); await request })
  expect(state.analysis).toBeNull()
  expect(state.loading).toBe(false)
})
