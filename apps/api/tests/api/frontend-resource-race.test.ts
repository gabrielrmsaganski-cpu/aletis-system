// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import React, { act } from '../../../web/node_modules/react/index.js'
import { createRoot } from '../../../web/node_modules/react-dom/client.js'
import { useApi } from '../../../web/src/hooks/useApi.ts'

const pending: Array<{ url: string; signal?: AbortSignal | null; resolve: (value: Response) => void }> = []
let root: ReturnType<typeof createRoot> | undefined
let element: HTMLDivElement
function View({ path }: { path: string | null }) {
  const state = useApi<{ nome: string } | null>(path, null)
  return React.createElement('output', null, JSON.stringify(state))
}
async function mount() {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  pending.length = 0
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => new Promise<Response>(resolve => pending.push({ url, signal: init.signal, resolve }))))
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
}
const response = (nome: string) => new Response(JSON.stringify({ success: true, data: { nome } }))
afterEach(async () => {
  await act(async () => root?.unmount())
  element?.remove()
  vi.unstubAllGlobals()
})

it('trocar de cliente descarta a resposta anterior mesmo se o transporte ignorar o cancelamento', async () => {
  await mount()
  await act(async () => root!.render(React.createElement(View, { path: '/clientes/a' })))
  await act(async () => root!.render(React.createElement(View, { path: '/clientes/b' })))
  expect(pending[0].signal?.aborted).toBe(true)
  expect(element.textContent).toContain('"data":null')
  await act(async () => pending[1].resolve(response('Cliente B')))
  expect(element.textContent).toContain('Cliente B')
  await act(async () => pending[0].resolve(response('Cliente A')))
  expect(element.textContent).toContain('Cliente B')
  expect(element.textContent).not.toContain('Cliente A')
})

it('retirar a entidade limpa o conteúdo e cancela a consulta pendente', async () => {
  await mount()
  await act(async () => root!.render(React.createElement(View, { path: '/clientes/a' })))
  await act(async () => root!.render(React.createElement(View, { path: null })))
  expect(pending[0].signal?.aborted).toBe(true)
  await act(async () => pending[0].resolve(response('Cliente A')))
  expect(element.textContent).toContain('"data":null')
  expect(element.textContent).toContain('"loading":false')
})
