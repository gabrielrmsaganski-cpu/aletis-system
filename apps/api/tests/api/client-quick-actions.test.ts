// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import React, { act } from '../../../web/node_modules/react/index.js'
import { createRoot } from '../../../web/node_modules/react-dom/client.js'
import { MemoryRouter } from '../../../web/node_modules/react-router-dom/dist/index.js'
import QuickActionsBar from '../../../web/src/components/cliente/workspace/QuickActionsBar'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../../web/src/hooks/useApi', () => ({ apiFetch: request }))

let root: ReturnType<typeof createRoot>
let element: HTMLDivElement
const pending: Array<{ signal?: AbortSignal; resolve: (value: unknown) => void; reject: (error: Error) => void }> = []
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
  pending.length = 0
  request.mockReset().mockImplementation((_path: string, init?: RequestInit) => new Promise((resolve, reject) => pending.push({ signal: init?.signal as AbortSignal, resolve, reject })))
})
afterEach(async () => { await act(async () => root.unmount()); element.remove(); vi.unstubAllGlobals() })

const reload = vi.fn(async () => {})
async function renderClient(id: string) {
  await act(async () => root.render(React.createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(QuickActionsBar, {
    urlId: id, apiId: id, cliente: { id, nome: id, telefone: '65999999999' } as any, onReload: reload,
  }))))
}
function button(label: string) {
  const result = [...element.querySelectorAll('button')].find((item) => item.textContent?.trim().startsWith(label))
  expect(result, `botão ${label}`).toBeDefined()
  return result!
}

it('descarta o grupo financeiro do cliente anterior, mesmo se a resposta chegar atrasada', async () => {
  await renderClient('cliente-a')
  await renderClient('cliente-b')
  expect(pending[0].signal?.aborted).toBe(true)
  await act(async () => pending[1].resolve({ grupos: [] }))
  await act(async () => pending[0].resolve({ grupos: [{ id: 'grupo-a' }] }))
  expect(element.textContent).toContain('Preparar financeiro')
  expect(element.textContent).not.toContain('Simular')
})

it('não oferece importação enquanto a consulta falha e permite consultar novamente', async () => {
  await renderClient('cliente-a')
  await act(async () => pending[0].reject(new Error('Fonte temporariamente indisponível')))
  expect(element.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível consultar o financeiro')
  expect(element.textContent).not.toContain('Preparar financeiro')
  await act(async () => button('Reconsultar financeiro').click())
  expect(pending).toHaveLength(2)
  await act(async () => pending[1].resolve({ grupos: [] }))
  expect(element.textContent).toContain('Preparar financeiro')
})

it('mostra a falha da exportação e não inicia um download de resposta de erro', async () => {
  await renderClient('cliente-a')
  await act(async () => pending[0].resolve({ grupos: [{ id: 'grupo-a' }] }))
  const transport = vi.fn(async () => new Response(JSON.stringify({ error: 'Dados financeiros insuficientes' }), { status: 422, headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', transport)
  await act(async () => button('Exportar').click())
  await act(async () => button('Kit Banco PDF').click())
  expect(transport).toHaveBeenCalledOnce()
  expect(element.querySelector('[role="alert"]')?.textContent).toContain('Dados financeiros insuficientes')
  expect(element.textContent).not.toContain('download iniciado')
})
