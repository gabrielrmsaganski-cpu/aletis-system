import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AlixNotebooksPanel, { type NotebookAttachmentRef } from '../src/components/alix/AlixNotebooksPanel'
import { apiFetch } from '../src/hooks/useApi'

vi.mock('../src/hooks/useApi', () => ({ apiFetch: vi.fn() }))

let root: Root
let host: HTMLDivElement
let documents: object[]
let listed: ReturnType<typeof notebook>[]
const notebook = (clienteId: string | undefined = 'a') => ({
  id: 'notebook', title: 'Notebook de teste', clienteId, sessionId: 'session', objective: '',
  sourceScope: { includeCrm: true, includeDocuments: true, includeProposals: true, includeNegotiations: true, includeWeb: false, proposalIds: [], negotiationIds: [] },
  sources: [], notes: [], artifacts: [], comments: [], actions: [], createdAt: '', updatedAt: '',
})
const doc = (id: string, clienteId?: string) => ({ id, filename: `${id}.pdf`, kind: 'pdf', clienteId })
const fixtureResponse = async (url: string) => {
  if (url.startsWith('/alix/notebooks?')) return { notebooks: listed, total: listed.length }
  if (url === '/alix/documents/session') return { documents }
  if (url.startsWith('/clientes/')) return { id: decodeURIComponent(url.slice('/clientes/'.length)) }
  if (url.endsWith('/source-map')) return { completeness: 0, sources: [], gaps: [] }
  return listed[0] || notebook()
}
async function render(clienteId: string | null = 'a', attachments: NotebookAttachmentRef[] = []) {
  await act(async () => root.render(<AlixNotebooksPanel activeSessionId="session" activeClienteId={clienteId} attachments={attachments} />))
}
function button(text: string) { return [...host.querySelectorAll('button')].find(item => item.textContent?.includes(text))! }
async function createSources() {
  await act(async () => button('Criar notebook').click())
  const call = vi.mocked(apiFetch).mock.calls.find(([url, options]) => url === '/alix/notebooks' && options?.method === 'POST')!
  return JSON.parse(call[1]!.body as string).sources.map((source: { documentId: string }) => source.documentId)
}
beforeEach(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  documents = []; listed = []
  vi.mocked(apiFetch).mockImplementation(fixtureResponse as typeof apiFetch)
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })

describe('Fontes dos notebooks no cliente efetivo', () => {
  it('exclui outro cliente e preserva fontes sem atribuição, usando metadata do servidor sobre chips', async () => {
    documents = [
      doc('de-a', 'a'), doc('de-b', 'b'), doc('livre'),
      { ...doc('pedido-a'), metadata: { clientScopeReview: { status: 'conflict', requestedClienteId: 'a', detectedClienteId: 'b' } } },
      { ...doc('pedido-b'), metadata: { clientScopeReview: { status: 'unverified', requestedClienteId: 'b' } } },
      { ...doc('confirmado-b'), metadata: { clientScopeReview: { status: 'verified', verifiedClienteId: 'b', requestedClienteId: 'a' } } },
      { ...doc('so-detectado'), metadata: { clientScopeReview: { status: 'unverified', detectedClienteId: 'b' } } },
    ]
    await render('a', [doc('de-b'), doc('chip-legitimo')])
    expect(await createSources()).toEqual(expect.arrayContaining(['de-a', 'livre', 'pedido-a', 'so-detectado', 'chip-legitimo']))
    const submitted = JSON.parse(vi.mocked(apiFetch).mock.calls.find(([url, options]) => url === '/alix/notebooks' && options?.method === 'POST')![1]!.body as string)
    expect(submitted.sources).toHaveLength(5)
  })

  it('resolve aliases pelo DTO existente e não admite atribuição incompatível quando a consulta falha', async () => {
    documents = [doc('canonico', 'canonical-a'), doc('outro-alias', 'alias-do-mesmo'), doc('desconhecido', 'cliente-indisponivel'), doc('livre')]
    vi.mocked(apiFetch).mockImplementation((async (url: string) => {
      if (url === '/clientes/alias-a' || url === '/clientes/alias-do-mesmo') return { id: 'canonical-a' }
      if (url === '/clientes/cliente-indisponivel') throw new Error('Cadastro indisponível')
      return fixtureResponse(url)
    }) as typeof apiFetch)
    await render('alias-a')
    expect(await createSources()).toEqual(['canonico', 'outro-alias', 'livre'])
    expect(apiFetch).toHaveBeenCalledWith('/clientes/alias-a', expect.any(Object))
  })

  it('trocar cliente na mesma sessão descarta a resposta documental anterior que chega atrasada', async () => {
    let resolveOld!: (value: unknown) => void
    let documentReads = 0
    vi.mocked(apiFetch).mockImplementation((async (url: string) => {
      if (url === '/alix/documents/session') {
        documentReads += 1
        if (documentReads === 1) return new Promise(resolve => { resolveOld = resolve })
        return { documents: [doc('novo-b', 'b'), doc('livre-novo')] }
      }
      return fixtureResponse(url)
    }) as typeof apiFetch)
    await render('a')
    await render('b')
    await act(async () => resolveOld({ documents: [doc('antigo-a', 'a'), doc('livre-antigo')] }))
    expect(await createSources()).toEqual(['novo-b', 'livre-novo'])
  })

  it('adicionar usa o cliente do notebook selecionado e criar sem cliente conserva somente fontes livres', async () => {
    listed = [notebook('b')]
    documents = [doc('de-a', 'a'), doc('de-b', 'b'), doc('livre')]
    await render(null)
    await act(async () => button('Adicionar documentos da conversa').click())
    const added = vi.mocked(apiFetch).mock.calls.find(([url, options]) => url.endsWith('/sources') && options?.method === 'POST')!
    expect(JSON.parse(added[1]!.body as string).sources.map((source: { documentId: string }) => source.documentId)).toEqual(['de-b', 'livre'])
    expect(await createSources()).toEqual(['livre'])
  })

  it('selecionar B mantém seus detalhes, lacunas e destino da ação quando detalhes e mapa de A chegam por último', async () => {
    const notebookA = { ...notebook('a'), id: 'A', title: 'Notebook A' }
    const notebookB = { ...notebook('a'), id: 'B', title: 'Notebook B' }
    listed = [notebookA, notebookB]
    documents = [doc('fonte-a', 'a')]
    let resolveSelectedA!: (value: unknown) => void
    let resolveMapA!: (value: unknown) => void
    const map = (id: string) => ({ completeness: 50, sources: [], gaps: [{ key: id, label: `Lacuna de ${id}`, severity: 'important', recommendation: `Recomendação exclusiva de ${id}` }] })
    vi.mocked(apiFetch).mockImplementation((async (url: string) => {
      if (url === '/alix/notebooks/A') return new Promise(resolve => { resolveSelectedA = resolve })
      if (url === '/alix/notebooks/A/source-map') return new Promise(resolve => { resolveMapA = resolve })
      if (url === '/alix/notebooks/B/source-map') return map('B')
      if (url === '/alix/notebooks/B' || url === '/alix/notebooks/B/sources') return notebookB
      return fixtureResponse(url)
    }) as typeof apiFetch)
    await render('a')
    expect(resolveSelectedA).toBeTypeOf('function')
    expect(resolveMapA).toBeTypeOf('function')
    await act(async () => button('Notebook B').click())
    expect(host.querySelector('main h3')?.textContent).toBe('Notebook B')
    expect(host.textContent).toContain('Recomendação exclusiva de B')
    await act(async () => {
      resolveSelectedA(notebookA)
      resolveMapA(map('A'))
    })
    expect(host.querySelector('main h3')?.textContent).toBe('Notebook B')
    expect(host.textContent).toContain('Recomendação exclusiva de B')
    expect(host.textContent).not.toContain('Recomendação exclusiva de A')
    await act(async () => button('Adicionar documentos da conversa').click())
    const writes = vi.mocked(apiFetch).mock.calls.filter(([, options]) => options?.method === 'POST')
    expect(writes.map(([url]) => url)).toEqual(['/alix/notebooks/B/sources'])
  })

  it('a lista antiga de cliente A não substitui lista, seleção nem ação do cliente B', async () => {
    const notebookA = { ...notebook('cliente-a'), id: 'A', title: 'Notebook A antigo' }
    const notebookB = { ...notebook('cliente-b'), id: 'B', title: 'Notebook B atual' }
    documents = [doc('fonte-b', 'cliente-b')]
    let resolveListA!: (value: unknown) => void
    vi.mocked(apiFetch).mockImplementation((async (url: string) => {
      if (url.startsWith('/alix/notebooks?')) {
        if (new URLSearchParams(url.split('?')[1]).get('clienteId') === 'cliente-a') {
          return new Promise(resolve => { resolveListA = resolve })
        }
        return { notebooks: [notebookB], total: 1 }
      }
      if (url === '/alix/notebooks/B' || url === '/alix/notebooks/B/sources') return notebookB
      if (url === '/alix/notebooks/A') return notebookA
      if (url === '/alix/notebooks/B/source-map') return { completeness: 70, sources: [], gaps: [{ key: 'B', label: 'Lacuna atual de B', severity: 'important', recommendation: 'Confirmar a fonte de B' }] }
      return fixtureResponse(url)
    }) as typeof apiFetch)
    await render('cliente-a')
    expect(resolveListA).toBeTypeOf('function')
    await render('cliente-b')
    expect(host.querySelector('main h3')?.textContent).toBe('Notebook B atual')
    await act(async () => resolveListA({ notebooks: [notebookA], total: 1 }))
    expect(host.querySelector('main h3')?.textContent).toBe('Notebook B atual')
    expect(host.textContent).toContain('Confirmar a fonte de B')
    expect(host.textContent).not.toContain('Notebook A antigo')
    expect(button('Notebook B atual')).toBeDefined()
    await act(async () => button('Adicionar documentos da conversa').click())
    const writes = vi.mocked(apiFetch).mock.calls.filter(([, options]) => options?.method === 'POST')
    expect(writes.map(([url]) => url)).toEqual(['/alix/notebooks/B/sources'])
  })
})
