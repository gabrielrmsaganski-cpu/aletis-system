import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ALIX from '../src/pages/ALIX'
import type { StreamHandlers } from '../src/hooks/alix/useAlixStreaming'
import type { AlixMission } from '../src/components/alix/AlixTaskCenter'

const mocked = vi.hoisted(() => ({ api: vi.fn(), stream: vi.fn(), cancel: vi.fn(), clearAnalysis: vi.fn(), fetchAnalysis: vi.fn(async () => undefined) }))
vi.mock('../src/hooks/useApi', () => ({ apiFetch: mocked.api }))
vi.mock('../src/hooks/alix/useAlixStreaming', () => ({ useAlixStreaming: () => ({ stream: mocked.stream, cancel: mocked.cancel }) }))
vi.mock('../src/hooks/alix/useAlixModelCatalogue', () => ({ useAlixModelCatalogue: () => ({ options: [], loading: false, error: null, refresh: vi.fn() }) }))
vi.mock('../src/hooks/alix/useAlixViewport', () => ({ useAlixViewport: () => ({ current: null }) }))
vi.mock('../src/hooks/useDocumentAnalysis', () => ({ useDocumentAnalysis: () => ({ analysis: null, loading: false, error: null, clear: mocked.clearAnalysis, fetchAnalysis: mocked.fetchAnalysis }) }))
vi.mock('../src/components/alix/AlixConfirmationBatch', () => ({ AlixConfirmationsPanel: () => null }))
vi.mock('../src/components/alix/AlixOperationsPanel', () => ({ default: () => null }))
vi.mock('../src/components/alix/AlixTaskCenter', () => ({ default: () => null }))
vi.mock('../src/components/alix/DocumentPipelinePanel', () => ({ default: () => null }))

let host: HTMLDivElement
let root: Root
let navigate: NavigateFunction
let handlers: StreamHandlers
let complete: () => void
let failLoad: boolean
let failPatch: boolean
let documents: Array<{ id: string; filename: string; mimetype: string; sizeBytes: number; metadata: { clientScopeReview: { status: string; requestedClienteId: string } } }>
let holdDocumentReads: boolean
let documentReaders: Array<(value: unknown) => void>
let sessions: Record<string, { id: string; title: string; clienteId?: string; messages: Array<{ id: string; role: string; content: string; timestamp: number }> }>

function RouteState() { const location = useLocation(); navigate = useNavigate(); return <output data-testid="route">{location.pathname}{location.search}</output> }
const labelled = (label: string) => host.querySelector<HTMLElement>(`[aria-label="${label}"]`)!
const button = (label: string) => [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === label)!
const route = () => host.querySelector('[data-testid="route"]')!.textContent
async function mount(path = '/ia?sessionId=a') { await act(async () => root.render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><RouteState /><ALIX /></MemoryRouter>)) }
async function type(value: string) {
  await act(async () => {
    const input = labelled('Mensagem para ALIX') as HTMLTextAreaElement
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function clickLabel(label: string) { await act(async () => labelled(label).click()) }
async function finish(metadata?: Record<string, unknown>) {
  await act(async () => { handlers.onDone?.({ sessionId: 'a', reply: { role: 'assistant', content: 'Resultado sintético.', timestamp: 2, metadata } }); complete() })
}

beforeEach(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks(); localStorage.clear(); failLoad = false; failPatch = false
  documents = []; holdDocumentReads = false; documentReaders = []
  sessions = {
    a: { id: 'a', title: 'Conversa A', clienteId: 'cliente-a', messages: [] },
    b: { id: 'b', title: 'Conversa B', clienteId: 'cliente-b', messages: [{ id: 'remote-b', role: 'assistant', content: 'Histórico de B.', timestamp: 1 }] },
  }
  mocked.api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/alix/sessions') return Object.values(sessions).map(session => ({ ...session, createdAt: 1, updatedAt: 1, messageCount: session.messages.length }))
    if (path === '/clientes') return [{ id: 'cliente-a', nome: 'Cliente A' }, { id: 'cliente-b', nome: 'Cliente B' }]
    if (path === '/alix/session' && init?.method === 'POST') {
      sessions['session-created'] = { id: 'session-created', title: 'Nova conversa', messages: [] }
      return sessions['session-created']
    }
    if (path.startsWith('/alix/notebooks?')) return { notebooks: [], total: 0 }
    if (path === '/alix/notebooks' || path === '/alix/notebooks/notebook-created') return { id: 'notebook-created', title: 'Notebook sintético', sessionId: 'session-created', sourceScope: { includeCrm: false, includeDocuments: true, includeProposals: false, includeNegotiations: false, includeWeb: false, proposalIds: [], negotiationIds: [] }, sources: [], notes: [], artifacts: [], comments: [], actions: [], createdAt: '', updatedAt: '' }
    if (path.startsWith('/alix/session/')) {
      const session = sessions[path.split('/').pop()!] ?? { id: path.split('/').pop()!, title: 'Nova conversa', messages: [] }
      if (init?.method === 'PATCH') {
        if (failPatch) throw new Error('Gravação temporariamente indisponível.')
        return Object.assign(session, JSON.parse(init.body as string))
      }
      if (failLoad) throw new Error('Leitura temporariamente indisponível.')
      return { ...session, messages: [...session.messages] }
    }
    if (path.startsWith('/alix/document-reviews')) return { reviews: documents.map(doc => ({ id: `review-${doc.id}`, documentoId: doc.id, sessionId: 'a', status: 'needs_review', filename: doc.filename, candidate: { nome: `Candidato ${doc.id}` }, missingFields: [], confidence: 1 })) }
    if (path.startsWith('/alix/documents/')) return holdDocumentReads ? new Promise(resolve => documentReaders.push(resolve)) : { documents }
    return null
  })
  mocked.stream.mockImplementation((_body: unknown, callbacks: StreamHandlers) => { handlers = callbacks; return new Promise<void>(resolve => { complete = resolve }) })
  mocked.cancel.mockImplementation(() => complete?.())
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false }))))
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() })))
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); vi.unstubAllGlobals() })

describe('Continuidade e escopo da conversa ALIX', () => {
  it('falha no histórico mantém sessão e rascunho, bloqueia envio e permite tentar carregar novamente', async () => {
    failLoad = true; await mount()
    expect(route()).toContain('sessionId=a')
    expect(localStorage.getItem('aletis:alix:activeSession')).toBe('a')
    await type('Rascunho que deve sobreviver à falha.')
    expect((labelled('Enviar') as HTMLButtonElement).disabled).toBe(true)
    expect(host.textContent).toContain('Leitura temporariamente indisponível.')
    failLoad = false
    await act(async () => button('Tentar carregar novamente').click())
    expect(host.textContent).not.toContain('Leitura temporariamente indisponível.')
    expect((labelled('Mensagem para ALIX') as HTMLTextAreaElement).value).toBe('Rascunho que deve sobreviver à falha.')
    expect((labelled('Enviar') as HTMLButtonElement).disabled).toBe(false)
  })

  it('sessão recebida na missão é mantida mesmo quando o stream termina antes de done', async () => {
    await mount('/ia'); await type('Prepare a primeira análise.'); await clickLabel('Enviar')
    expect(mocked.stream.mock.calls[0][0].sessionId).toBeUndefined()
    await act(async () => handlers.onMission?.({ id: 'mission-new', sessionId: 'session-new', status: 'running' } as AlixMission))
    expect(route()).toContain('sessionId=session-new')
    expect(localStorage.getItem('aletis:alix:activeSession')).toBe('session-new')
    await act(async () => { handlers.onError?.('Conexão interrompida.'); complete() })
    await type('Continue a análise.'); await clickLabel('Enviar')
    expect(mocked.stream.mock.calls[1][0].sessionId).toBe('session-new')
    await act(async () => { handlers.onError?.('Teste encerrado.'); complete() })
  })

  it('resposta parcial não é apresentada como trabalho concluído', async () => {
    await mount(); await type('Faça a pesquisa.'); await clickLabel('Enviar')
    await finish({ executionStatus: 'incomplete', stopReason: 'max_iterations' })
    expect(labelled('Execução da ALIX').textContent).toContain('Conversa interrompida')
    expect(labelled('Execução da ALIX').textContent).not.toContain('Resposta concluída')
  })

  it('seleção, nova conversa e navegação por URL mantêm a mesma sessão visível', async () => {
    await mount(); await type('Rascunho reservado de A.')
    await clickLabel('Abrir histórico de conversas')
    await clickLabel('Abrir conversa Conversa B')
    expect(route()).toContain('sessionId=b')
    expect((labelled('Mensagem para ALIX') as HTMLTextAreaElement).value).toBe('')
    await act(async () => navigate('/ia?sessionId=a'))
    expect((labelled('Mensagem para ALIX') as HTMLTextAreaElement).value).toBe('Rascunho reservado de A.')
    await clickLabel('Nova conversa')
    expect(route()).not.toContain('sessionId=')
  })

  it('limpar o cliente confirma null no servidor antes do próximo envio', async () => {
    await mount(); await clickLabel('Cliente ativo: Cliente A. Trocar cliente')
    await act(async () => button('Limpar cliente ativo').click())
    const patch = mocked.api.mock.calls.find(([path, init]) => path === '/alix/session/a' && init?.method === 'PATCH')!
    expect(JSON.parse(patch[1].body)).toEqual({ clienteId: null })
    expect(sessions.a.clienteId).toBeNull()
    await type('Analise sem cliente ativo.'); await clickLabel('Enviar')
    expect(mocked.stream.mock.calls[0][0].clienteId).toBeUndefined()
    await finish()
  })

  it('falha ao gravar cliente mantém o cliente e o rascunho anteriores', async () => {
    await mount(); await type('Rascunho de Cliente A.')
    failPatch = true
    await clickLabel('Cliente ativo: Cliente A. Trocar cliente')
    await act(async () => button('Limpar cliente ativo').click())
    expect(labelled('Cliente ativo: Cliente A. Trocar cliente')).not.toBeNull()
    expect((labelled('Mensagem para ALIX') as HTMLTextAreaElement).value).toBe('Rascunho de Cliente A.')
    expect(host.textContent).toContain('Gravação temporariamente indisponível.')
    expect((labelled('Enviar') as HTMLButtonElement).disabled).toBe(true)
    failPatch = false
    await act(async () => button('Recarregar contexto').click())
    expect((labelled('Enviar') as HTMLButtonElement).disabled).toBe(false)
  })

  it('finalizar a resposta preserva o foco na ação que o usuário está lendo', async () => {
    await mount(); await type('Prepare a análise.'); await clickLabel('Enviar')
    const action = labelled('Abrir entregas da conversa')
    action.focus()
    await finish({ executionStatus: 'completed' })
    await act(async () => new Promise(resolve => setTimeout(resolve, 70)))
    expect(document.activeElement).toBe(action)
  })

  it('o rodapé da resposta também abre a leitura ampla', async () => {
    await mount('/ia?sessionId=b')
    await clickLabel('Ler resposta em tela ampla')
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('Histórico de B.')
  })

  it('pendências e revisões seguem o cliente solicitado e descartam leituras antigas', async () => {
    documents = ['a', 'b'].map(id => ({ id: `doc-${id}`, filename: `reservado-${id}.pdf`, mimetype: 'application/pdf', sizeBytes: 20, metadata: { clientScopeReview: { status: 'unverified', requestedClienteId: `cliente-${id}` } } }))
    holdDocumentReads = true
    await mount()
    expect(documentReaders.length).toBeGreaterThan(0)
    holdDocumentReads = false
    await clickLabel('Cliente ativo: Cliente A. Trocar cliente')
    await act(async () => [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Cliente Bcliente-b')!.click())
    expect(host.textContent).toContain('reservado-b.pdf')
    expect(host.textContent).toContain('Candidato doc-b')
    expect(host.textContent).not.toContain('reservado-a.pdf')
    expect(host.textContent).not.toContain('Candidato doc-a')
    await act(async () => documentReaders.forEach(resolve => resolve({ documents })))
    expect(host.textContent).not.toContain('reservado-a.pdf')
    expect(host.textContent).not.toContain('Candidato doc-a')
  })

  it('abrir notebooks sem conversa cria a sessão antes de permitir criar um notebook', async () => {
    await mount('/ia'); await type('Rascunho antes de organizar as fontes.')
    await clickLabel('Opções e ferramentas da ALIX')
    await act(async () => document.querySelector<HTMLElement>('[aria-label="Abrir notebooks documentais da ALIX"]')!.click())
    expect(route()).toContain('sessionId=session-created')
    let create: HTMLButtonElement | undefined
    await vi.waitFor(async () => {
      await act(async () => undefined)
      create = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Criar notebook')
      expect(create).toBeDefined()
    })
    await act(async () => create!.click())
    const call = mocked.api.mock.calls.find(([path, init]) => path === '/alix/notebooks' && init?.method === 'POST')!
    expect(JSON.parse(call[1].body).sessionId).toBe('session-created')
    const sessionCallIndex = mocked.api.mock.calls.findIndex(([path, init]) => path === '/alix/session' && init?.method === 'POST')
    expect(sessionCallIndex).toBeLessThan(mocked.api.mock.calls.indexOf(call))
  })
})
