// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import React, { act } from '../../../web/node_modules/react/index.js'
import { createRoot } from '../../../web/node_modules/react-dom/client.js'
import { MemoryRouter } from '../../../web/node_modules/react-router-dom/dist/index.js'
import ALIX from '../../../web/src/pages/ALIX'
import type { StreamHandlers } from '../../../web/src/hooks/alix/useAlixStreaming'

const mocked = vi.hoisted(() => ({ api: vi.fn(), stream: vi.fn(), cancel: vi.fn(), clearAnalysis: vi.fn(), fetchAnalysis: vi.fn(), taskProps: { current: null as any } }))
vi.mock('../../../web/src/hooks/useApi', () => ({ apiFetch: mocked.api }))
vi.mock('../../../web/src/hooks/alix/useAlixStreaming', () => ({ useAlixStreaming: () => ({ stream: mocked.stream, cancel: mocked.cancel }) }))
vi.mock('../../../web/src/hooks/useDocumentAnalysis', () => ({ useDocumentAnalysis: () => ({ analysis: null, loading: false, error: null, clear: mocked.clearAnalysis, fetchAnalysis: mocked.fetchAnalysis }) }))
vi.mock('../../../web/src/components/alix/AlixWorkspacePanel', () => ({ default: ({ children }: { children: React.ReactNode }) => React.createElement('aside', null, children) }))
vi.mock('../../../web/src/components/alix/AlixOperationsPanel', () => ({ default: () => null }))
vi.mock('../../../web/src/components/alix/AlixTaskCenter', () => ({ default: (props: unknown) => { mocked.taskProps.current = props; return null } }))
vi.mock('../../../web/src/components/alix/DocumentPipelinePanel', () => ({ default: () => null }))
vi.mock('../../../web/src/components/ui/AppDialog', () => ({ default: ({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) => React.createElement('section', { 'data-dialog': title }, React.createElement('button', { onClick: onClose }, `Fechar ${title}`), children) }))

let root: ReturnType<typeof createRoot>
let element: HTMLDivElement
let handlers: StreamHandlers
let complete: () => void
const animationFrames = new Map<number, FrameRequestCallback>()
let frameId = 0
const sessions = [
  { id: 'a', title: 'Conversa A', clienteId: 'cliente-a', createdAt: 1, updatedAt: 1, messageCount: 0 },
  { id: 'b', title: 'Conversa B', createdAt: 1, updatedAt: 1, messageCount: 1 },
]
const memories: Array<{ clienteId: string; signal: AbortSignal; resolve: (value: { markdown: string }) => void }> = []
const briefing = (id: string) => ({ clienteId: id, clienteNome: id === 'cliente-a' ? 'Cliente A' : 'Cliente B', resumoExecutivo: `Resumo de ${id}`, destaques: [], proximasAcoes: [], dividasAtivas: [] })
const review = (id: string) => ({ id, status: 'needs_review', filename: `${id}.pdf`, candidate: { nome: `Revisão ${id}` }, missingFields: [], confidence: 1 })
const mission = { id: 'missao-a', sessionId: 'a', clienteId: 'cliente-a', prompt: 'Retomar análise de A', workMode: 'client_analysis' }
const labelled = (label: string) => {
  const found = element.querySelector<HTMLElement>(`[aria-label="${label}"]`)
  expect(found, label).not.toBeNull()
  return found!
}
const button = (text: string) => {
  const found = Array.from(element.querySelectorAll('button')).find(item => item.textContent?.trim() === text)
  expect(found, text).toBeDefined()
  return found!
}
const flushFrames = () => {
  const callbacks = Array.from(animationFrames.values())
  animationFrames.clear()
  callbacks.forEach(callback => callback(1))
}
const openMemory = async () => {
  const trigger = Array.from(element.querySelectorAll<HTMLElement>('[role="button"]')).find(item => item.textContent?.trim() === 'Ver memória')
  expect(trigger).toBeDefined()
  await act(async () => trigger!.click())
}
const chooseCliente = async (id: 'a' | 'b') => {
  const selector = element.querySelector<HTMLButtonElement>('[aria-label^="Cliente ativo:"], [aria-label="Selecionar cliente ativo"]')!
  await act(async () => selector.click())
  const choice = Array.from(element.querySelectorAll('button')).find(item => item.textContent?.trim() === `Cliente ${id.toUpperCase()}cliente-${id}`)
  expect(choice).toBeDefined()
  await act(async () => choice!.click())
}

beforeEach(async () => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  animationFrames.clear()
  memories.length = 0
  mocked.taskProps.current = null
  complete = () => {}
  localStorage.clear()
  localStorage.setItem('aletis:alix:activeSession', 'a')
  localStorage.setItem('aletis:alix:activeCliente', 'cliente-a')
  mocked.api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/alix/models') return { configured: true, checkedAt: '2026-09-06T00:00:00Z', models: [{ id: 'modelo-manual', label: 'Modelo disponível', availability: 'available', capabilities: ['chat', 'tool_calling'], protocols: ['responses'] }, { id: 'nao-confirmado', label: 'Modelo não confirmado', availability: 'unknown', capabilities: ['chat', 'tool_calling'], protocols: ['responses'] }] }
    if (path === '/alix/sessions') return sessions
    if (path === '/clientes') return [{ id: 'cliente-a', nome: 'Cliente A' }, { id: 'cliente-b', nome: 'Cliente B' }]
    if (path === '/alix/session/a') return { ...sessions[0], messages: [] }
    if (path === '/alix/session/b') return { ...sessions[1], messages: [{ id: 'remote-b', role: 'assistant', content: 'Somente conversa B', timestamp: 1 }] }
    if (path.startsWith('/alix/document-reviews')) return { reviews: [] }
    if (path.startsWith('/alix/briefing/')) return briefing(path.split('/').pop()!)
    if (path.startsWith('/alix/memory/')) return new Promise(resolve => memories.push({ clienteId: path.split('/').pop()!, signal: init?.signal as AbortSignal, resolve }))
    return null
  })
  mocked.stream.mockImplementation((_body: unknown, callbacks: StreamHandlers) => {
    handlers = callbacks
    return new Promise<void>(resolve => { complete = resolve })
  })
  mocked.cancel.mockImplementation(() => complete())
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false }))))
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { const id = ++frameId; animationFrames.set(id, callback); return id })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { animationFrames.delete(id) })
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: ['/ia'], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(ALIX))))
})
afterEach(async () => {
  await act(async () => root.unmount())
  element.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

it('habilidade prepara o pedido sem enviar; execução automática mantém ferramentas e entrega real até trocar de sessão', async () => {
  const starter = Array.from(element.querySelectorAll('button')).find(item => item.textContent?.includes('Pesquisar com fontes'))!
  await act(async () => starter.click())
  expect(mocked.stream).not.toHaveBeenCalled()
  const input = labelled('Mensagem para ALIX') as HTMLTextAreaElement
  expect(input.value).toContain('fontes')
  await act(async () => { labelled('Enviar').click(); labelled('Enviar').click() })
  expect(mocked.stream).toHaveBeenCalledTimes(1)
  expect(mocked.stream.mock.calls[0][0]).toMatchObject({ modelPreference: 'auto', workMode: 'research', sessionId: 'a', clienteId: 'cliente-a' })
  const routing = { mode: 'auto' as const, model: 'modelo-efetivo', modelLabel: 'IA usada de fato', provider: 'foundry', reason: 'Pesquisa precisa de fontes verificáveis.', taskType: 'research', fallback: false }
  await act(async () => {
    handlers.onRouting?.(routing)
    handlers.onProgress?.({ id: 'web-1', tool: 'pesquisar_web', phase: 'started' })
    handlers.onToken?.('Pesquisa em execução')
    flushFrames()
  })
  expect(element.querySelector('[aria-label="Execução da ALIX"]')?.textContent).toContain('Trabalho em andamento')
  expect((labelled('Cliente ativo: Cliente A. Trocar cliente') as HTMLButtonElement).disabled).toBe(true)
  await act(async () => {
    handlers.onProgress?.({ id: 'web-1', tool: 'pesquisar_web', phase: 'completed', outcome: 'read' })
    handlers.onDone?.({ sessionId: 'a', reply: { role: 'assistant', content: 'Pesquisa entregue', timestamp: 2, metadata: { routing, documents: [{ id: 'parecer', filename: 'parecer-verificado.pdf', downloadUrl: '/api/documents/parecer/download' }] } } })
    complete()
  })
  expect(element.textContent).toContain('IA usada de fato')
  expect(element.textContent).toContain('Pesquisa precisa de fontes verificáveis.')
  expect(element.querySelector('[aria-label="Execução da ALIX"]')?.textContent).toContain('Resposta concluída')
  await act(async () => labelled('Abrir entregas da conversa').click())
  const deliveryPanel = element.querySelector('#alix-panel-deliveries')!
  expect(deliveryPanel.hasAttribute('hidden')).toBe(false)
  expect(deliveryPanel.textContent).toContain('parecer-verificado.pdf')
  expect(deliveryPanel.querySelector('a')?.getAttribute('href')).toBe('/api/documents/parecer/download')
  await act(async () => labelled('Abrir histórico de conversas').click())
  await act(async () => labelled('Abrir conversa Conversa B').click())
  expect(element.querySelector('[aria-label="Execução da ALIX"]')).toBeNull()
  await act(async () => labelled('Abrir entregas da conversa').click())
  expect(element.querySelector('#alix-panel-deliveries')?.textContent).not.toContain('parecer-verificado.pdf')
})

it('seleção manual só oferece modelos disponíveis, viaja no pedido e resposta mostra o modelo efetivo após fallback', async () => {
  await act(async () => labelled('Escolher modelo da ALIX').click())
  const selector = labelled('Modelo de inteligência artificial') as HTMLSelectElement
  expect(Array.from(selector.options).map(option => option.value)).toEqual(['auto', 'modelo-manual'])
  await act(async () => { selector.value = 'modelo-manual'; selector.dispatchEvent(new Event('change', { bubbles: true })) })
  await act(async () => button('Dossiê 360°').click())
  expect(mocked.stream.mock.calls[0][0].modelPreference).toBe('modelo-manual')
  await act(async () => {
    handlers.onDone?.({ sessionId: 'a', reply: { role: 'assistant', content: 'Resultado com alternativa disponível', timestamp: 2, metadata: { routing: { mode: 'manual', model: 'modelo-alternativo', modelLabel: 'IA alternativa usada', requestedModel: 'modelo-manual', provider: 'foundry', reason: 'Modelo escolhido indisponível na execução.', taskType: 'analysis', fallback: true } } } })
    complete()
  })
  const details = Array.from(element.querySelectorAll('details')).find(item => item.textContent?.includes('IA alternativa usada'))!
  expect(details).toBeDefined()
  expect(details.textContent).toContain('Modelo escolhido indisponível na execução.')
  expect(details.textContent).toContain('alternativa usada')
})

it('Meu dia preserva pedido e preferência de IA preparados sem disparar tarefa', async () => {
  await act(async () => labelled('Escolher modelo da ALIX').click())
  const selector = labelled('Modelo de inteligência artificial') as HTMLSelectElement
  await act(async () => { selector.value = 'modelo-manual'; selector.dispatchEvent(new Event('change', { bubbles: true })) })
  const starter = Array.from(element.querySelectorAll('button')).find(item => item.textContent?.includes('Produzir uma entrega'))!
  await act(async () => starter.click())
  const draft = (labelled('Mensagem para ALIX') as HTMLTextAreaElement).value
  await act(async () => button('Meu dia').click())
  await act(async () => button('Conversar').click())
  expect((labelled('Mensagem para ALIX') as HTMLTextAreaElement).value).toBe(draft)
  expect(labelled('Escolher modelo da ALIX').textContent).toContain('Modelo disponível')
  expect(mocked.stream).not.toHaveBeenCalled()
})
