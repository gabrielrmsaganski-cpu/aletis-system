// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import React, { act } from '../../../web/node_modules/react/index.js'
import { createRoot } from '../../../web/node_modules/react-dom/client.js'
import AlixTaskCenter from '../../../web/src/components/alix/AlixTaskCenter.tsx'

const pending: Array<{ url: string; signal?: AbortSignal | null; resolve: (value: Response) => void }> = []
let root: ReturnType<typeof createRoot> | undefined
let element: HTMLDivElement
const mission = (id: string, status: string = 'completed') => ({ id, sessionId: 'session', clienteId: id, title: `Missão ${id}`, prompt: 'Preparar análise', workMode: 'client_analysis', status, progress: 100, costUsd: '0.000000', cancellable: false, createdAt: '', updatedAt: '', steps: [], sources: [] })
const response = (id: string, status?: string) => new Response(JSON.stringify({ success: true, data: { missions: [mission(id, status)] } }))

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  pending.length = 0
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => new Promise<Response>(resolve => pending.push({ url, signal: init.signal, resolve }))))
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
})
afterEach(async () => {
  await act(async () => root?.unmount())
  element.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('troca de cliente cancela a consulta e ignora uma resposta tardia do transporte', async () => {
  await act(async () => root!.render(React.createElement(AlixTaskCenter, { clienteId: 'a' })))
  await act(async () => root!.render(React.createElement(AlixTaskCenter, { clienteId: 'b' })))
  expect(pending[0].signal?.aborted).toBe(true)
  await act(async () => pending[1].resolve(response('b')))
  await act(async () => pending[0].resolve(response('a')))
  expect(element.textContent).toContain('Missão b')
  expect(element.textContent).not.toContain('Missão a')
})

it('somente missões em execução recebem polling frequente e consultas não se sobrepõem', async () => {
  await act(async () => root!.render(React.createElement(AlixTaskCenter, { sessionId: 's', clienteId: 'a' })))
  expect(pending[0].url).toContain('sessionId=s')
  expect(pending[0].url).toContain('clienteId=a')
  await act(async () => vi.advanceTimersByTimeAsync(5000))
  expect(pending).toHaveLength(1)
  await act(async () => pending[0].resolve(response('a', 'running')))
  await act(async () => vi.advanceTimersByTimeAsync(5000))
  expect(pending).toHaveLength(2)
  await act(async () => pending[1].resolve(response('a', 'completed')))
  await act(async () => vi.advanceTimersByTimeAsync(5000))
  expect(pending).toHaveLength(2)
  await act(async () => vi.advanceTimersByTimeAsync(25000))
  expect(pending).toHaveLength(3)
})

it('retirar o contexto interrompe polling e limpa missões anteriores', async () => {
  await act(async () => root!.render(React.createElement(AlixTaskCenter, { clienteId: 'a' })))
  await act(async () => pending[0].resolve(response('a')))
  await act(async () => root!.render(React.createElement(AlixTaskCenter, {})))
  await act(async () => vi.advanceTimersByTimeAsync(60000))
  expect(element.textContent).not.toContain('Missão a')
  expect(pending).toHaveLength(1)
})

it('retomada pendente de outra entidade não altera o compositor atual', async () => {
  const onResume = vi.fn()
  await act(async () => root!.render(React.createElement(AlixTaskCenter, { clienteId: 'a', onResume })))
  await act(async () => pending[0].resolve(response('a', 'failed')))
  const expand = [...element.querySelectorAll('button')].find(button => button.textContent?.includes('Missão a'))!
  await act(async () => expand.click())
  const resume = [...element.querySelectorAll('button')].find(button => button.textContent?.includes('Retomar'))!
  await act(async () => resume.click())
  expect(pending[1].url).toContain('/a/resume')
  await act(async () => root!.render(React.createElement(AlixTaskCenter, { clienteId: 'b', onResume })))
  expect(pending[1].signal?.aborted).toBe(true)
  await act(async () => pending[1].resolve(new Response(JSON.stringify({ success: true, data: mission('a', 'queued') }))))
  expect(onResume).not.toHaveBeenCalled()
  expect(element.textContent).not.toContain('Missão a')
})

it('aba oculta deixa de consultar e atualiza ao voltar para a tela', async () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  try {
    await act(async () => root!.render(React.createElement(AlixTaskCenter, { clienteId: 'a' })))
    await act(async () => vi.advanceTimersByTimeAsync(60000))
    expect(pending).toHaveLength(0)
    visibility.mockReturnValue('visible')
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(pending).toHaveLength(1)
    await act(async () => pending[0].resolve(response('a', 'failed')))
    const expand = [...element.querySelectorAll('button')].find(button => button.textContent?.includes('Missão a'))!
    await act(async () => expand.click())
    expect([...element.querySelectorAll('button')].some(button => button.textContent?.includes('Retomar'))).toBe(false)
  } finally { visibility.mockRestore() }
})
