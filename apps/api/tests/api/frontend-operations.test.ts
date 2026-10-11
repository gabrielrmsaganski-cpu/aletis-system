// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import React, { act } from '../../../web/node_modules/react/index.js'
import { createRoot } from '../../../web/node_modules/react-dom/client.js'
import { MemoryRouter } from '../../../web/node_modules/react-router-dom/dist/index.js'
import AlixOperationsPanel, { type OperationalPlan } from '../../../web/src/components/alix/AlixOperationsPanel.tsx'

let root: ReturnType<typeof createRoot> | undefined
let element: HTMLDivElement
const basePlan = (clienteId = 'a'): OperationalPlan => ({
  generatedAt: '2026-09-06T12:00:00Z', referenceDate: '2026-09-06', timeZone: 'America/Cuiaba', fingerprint: `plan-${clienteId}`, scope: { clienteId },
  coverage: { status: 'partial', sources: [{ key: 'clients', label: 'Clientes', status: 'available', origin: 'postgres', records: 1 }, { key: 'proposals', label: 'Propostas', status: 'unavailable', origin: 'postgres', records: null }] },
  counts: { clients: 1, activeClients: 1, activeDemands: 1, openProposals: null, priorities: 2, overdue: 1, dueToday: 0, missingNextAction: 0, missingOwner: 1 },
  items: [
    { id: 'due', kind: 'demand_action', priority: 'critical', title: `Prazo de ${clienteId}`, reason: 'Prazo registrado anterior a hoje.', nextAction: 'Conferir os documentos.', clienteId, clienteName: `Cliente ${clienteId}`, dueDate: '2026-09-05', to: `/clientes/${clienteId}?demanda=1`, sources: [{ kind: 'demand', id: '1', label: 'Demanda real' }] },
    { id: 'owner', kind: 'demand_missing_owner', priority: 'attention', title: 'Definir responsável', reason: 'Responsável ausente no registro.', nextAction: 'Atribuir responsável.', clienteId, to: `/clientes/${clienteId}?demanda=2`, sources: [{ kind: 'demand', id: '2', label: 'Outra demanda' }] },
  ],
})
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }))
const button = (text: string) => [...element.querySelectorAll('button')].find(node => node.textContent?.trim() === text) as HTMLButtonElement
async function render(clienteId: string) {
  if (!root) {
    vi.stubGlobal('React', React)
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    element = document.createElement('div')
    document.body.append(element)
    root = createRoot(element)
  }
  await act(async () => root!.render(React.createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(AlixOperationsPanel, { clienteId, clientes: [{ id: 'a', nome: 'Cliente a' }, { id: 'b', nome: 'Cliente b' }], onScopeChange: () => undefined }))))
}
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  element?.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('mostra fontes parciais, filtra prioridades reais e mantém acesso ao registro', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response(basePlan())))
  await render('a')
  expect(element.textContent).toContain('Leitura parcial da carteira')
  expect(element.querySelectorAll('article')).toHaveLength(2)
  await act(async () => button('Atrasadas').click())
  expect(element.querySelectorAll('article')).toHaveLength(1)
  expect(element.querySelector('article a')?.getAttribute('href')).toBe('/clientes/a?demanda=1')
  expect(element.querySelector('article')?.textContent).toContain('Demanda real')
})

it('a preparação evita cliques duplicados e descreve somente o plano que foi salvo', async () => {
  let complete!: (value: Response) => void
  let posts = 0
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
    if (init.method === 'POST') { posts += 1; return new Promise<Response>(resolve => { complete = resolve }) }
    return response(basePlan())
  }))
  await render('a')
  const prepare = button('Preparar meu dia')
  await act(async () => { prepare.click(); prepare.click() })
  expect(posts).toBe(1)
  await act(async () => complete(response({ mission: { id: 'mission-a', title: 'Plano salvo', status: 'completed' }, plan: basePlan(), reused: true })))
  expect(element.textContent).toContain('Este plano já estava preparado e foi reutilizado.')
  expect(element.textContent).toContain('Abra os registros abaixo para executar os próximos passos.')
  expect(element.querySelectorAll('article')).toHaveLength(2)
})

it('trocar cliente cancela a preparação e descarta a resposta atrasada do cliente anterior', async () => {
  let complete!: (value: Response) => void
  let preparationSignal: AbortSignal | null | undefined
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (init.method === 'POST') { preparationSignal = init.signal; return new Promise<Response>(resolve => { complete = resolve }) }
    return response(basePlan(url.includes('clienteId=b') ? 'b' : 'a'))
  }))
  await render('a')
  await act(async () => button('Preparar meu dia').click())
  await render('b')
  expect(preparationSignal?.aborted).toBe(true)
  await act(async () => complete(response({ mission: { id: 'old-mission', title: 'Antigo', status: 'completed' }, plan: basePlan('a'), reused: false })))
  expect(element.textContent).toContain('Prazo de b')
  expect(element.textContent).not.toContain('Prazo de a')
  expect(element.textContent).not.toContain('Plano preparado e salvo')
})

it('atualiza a fila somente enquanto visível e preserva uma leitura em andamento', async () => {
  vi.useFakeTimers()
  let visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility as DocumentVisibilityState)
  let complete!: (value: Response) => void
  let signal: AbortSignal | undefined | null
  let reads = 0
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    reads += 1
    if (reads === 2) { signal = init.signal; return new Promise<Response>(resolve => { complete = resolve }) }
    return response(basePlan())
  }))
  await render('a')
  expect(reads).toBe(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
  expect(reads).toBe(2)
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
  expect(reads).toBe(2)
  expect(signal?.aborted).toBe(false)
  await act(async () => complete(response(basePlan())))
  visibility = 'hidden'
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(60_000) })
  expect(reads).toBe(2)
  visibility = 'visible'
  await act(async () => document.dispatchEvent(new Event('visibilitychange')))
  expect(reads).toBe(3)
  await act(async () => root!.unmount())
  root = undefined
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
  expect(reads).toBe(3)
})

it('a origem do Drive abre o documento original e mostra página e trecho sem IDs técnicos', async () => {
  const plan = basePlan()
  plan.items = [{ ...plan.items[0], id: 'drive-priority', kind: 'documentary_fact_review', title: 'Conferir dados do documento', sources: [{
    kind: 'drive_analysis', id: 'analysis-internal-id', documentId: 'documento_drive-123', revision: 'revision-internal-hash',
    label: 'Orçamento de custeio', excerpt: 'Valor indicado no orçamento.', page: 7, sheet: 'Custeio', updatedAt: '2026-09-08T15:00:00Z',
  }] }]
  vi.stubGlobal('fetch', vi.fn(async () => response(plan)))
  await render('a')
  const link = [...element.querySelectorAll('a')].find(item => item.textContent?.includes('Abrir documento no Drive'))!
  expect(link.getAttribute('href')).toBe('https://drive.google.com/file/d/documento_drive-123/view')
  expect(link.getAttribute('target')).toBe('_blank')
  expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  expect(element.textContent).toContain('Orçamento de custeio')
  expect(element.textContent).toContain('Página 7 · Aba Custeio')
  expect(element.textContent).toContain('Valor indicado no orçamento.')
  expect(element.textContent).not.toContain('analysis-internal-id')
  expect(element.textContent).not.toContain('revision-internal-hash')
})
