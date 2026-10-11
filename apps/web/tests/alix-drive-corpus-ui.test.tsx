import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AlixDriveCorpusPanel from '../src/components/alix/AlixDriveCorpusPanel'
import { apiFetch, useApi } from '../src/hooks/useApi'

vi.mock('../src/hooks/useApi', async original => ({ ...await original<typeof import('../src/hooks/useApi')>(), apiFetch: vi.fn(), useApi: vi.fn() }))
const file = { fileId: 'synthetic-drive-file', name: 'Contrato sintético.pdf', path: 'Grupo sintético/Contratos', clienteId: 'client-a', category: 'contratos', readStatus: 'partial', coverage: { status: 'partial', pendingPages: [3] }, characters: 25000, url: 'https://drive.google.com/file/d/synthetic-drive-file/view', revision: 'v1' }
const overview = { canViewAll: true, totals: { files: 3, folders: 2, extracted: 1, partial: 1, pending: 1, failed: 0, unsupported: 0, withoutClient: 1, characters: 28000 }, states: {}, clients: [{ id: 'client-a', nome: 'Cliente A', files: 2, extracted: 1, partial: 1 }], categories: [{ category: 'contratos', files: 2 }], inventory: { complete: true, completedAt: '2026-09-07T12:00:00Z' }, reading: { status: 'partial', lastUpdate: '2026-09-07T12:30:00Z', note: 'Um arquivo aguarda leitura.' } }
const firstPage = { file, available: true, text: 'Trecho inicial sintético', range: { start: 0, end: 12000 }, totalCharacters: 25000, nextCursor: 'cursor:safe', instruction: 'Página 3 pendente. A leitura é parcial.' }
let host: HTMLDivElement
let root: Root
let resources: Record<string, { data: unknown; loading: boolean; error: string | null; refetch: ReturnType<typeof vi.fn> }>
const resource = (data: unknown) => ({ data, loading: false, error: null, refetch: vi.fn() })
beforeEach(() => {
  vi.clearAllMocks(); (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  resources = { overview: resource(overview), files: resource({ files: [file], total: 3, nextOffset: 20 }), search: resource({ results: [{ ...file, chunkId: 'c1', text: 'O banco consta no trecho sintético.', page: 2 }], nextOffset: null }) }
  vi.mocked(useApi).mockImplementation(path => path ? resources[path.includes('/overview') ? 'overview' : path.includes('/search') ? 'search' : 'files'] as never : resource(null) as never)
  vi.mocked(apiFetch).mockResolvedValue(firstPage)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks() })
const button = (text: string, within: ParentNode = document.body) => [...within.querySelectorAll('button')].find(item => item.textContent?.includes(text))!
async function render(props: Partial<ComponentProps<typeof AlixDriveCorpusPanel>> = {}) {
  await act(async () => root.render(<MemoryRouter><AlixDriveCorpusPanel clienteId="client-a" clientes={[{ id: 'client-a', nome: 'Cliente A' }, { id: 'client-b', nome: 'Cliente B' }]} onScopeChange={vi.fn()} {...props} /></MemoryRouter>))
}
describe('Drive e dados na ALIX', () => {
  it('exibe cobertura e usa apenas consultas sem iniciar processamento ou LLM', async () => {
    await render()
    expect(host.textContent).toContain('Texto extraído')
    expect(host.textContent).toContain('Leitura parcial')
    expect(host.textContent).toContain('Um arquivo aguarda leitura.')
    expect(vi.mocked(useApi).mock.calls.some(([path]) => path?.includes('clienteId=client-a'))).toBe(true)
    expect(apiFetch).not.toHaveBeenCalled()
  })
  it('leitura paginada mantém cliente, origem e cursor sem concatenar arquivos', async () => {
    await render()
    await act(async () => button('Ler arquivo').click())
    expect(apiFetch).toHaveBeenLastCalledWith(expect.stringContaining('/files/synthetic-drive-file?clienteId=client-a'), expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(document.body.textContent).toContain('Trecho inicial sintético')
    expect(document.body.textContent).toContain('Página 3 pendente')
    vi.mocked(apiFetch).mockResolvedValueOnce({ ...firstPage, text: 'Segundo trecho sintético', range: { start: 12000, end: 25000 }, nextCursor: null })
    await act(async () => button('Próximo trecho').click())
    expect(vi.mocked(apiFetch).mock.calls[1][0]).toContain('cursor=cursor%3Asafe')
    expect(document.body.textContent).toContain('Segundo trecho sintético')
    expect(document.body.textContent).not.toContain('Trecho inicial sintético')
    expect(button('Próximo trecho').disabled).toBe(true)
    expect(button('Trecho anterior').disabled).toBe(false)
    expect(vi.mocked(apiFetch).mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true)
  })
  it('resposta atrasada de outro cliente é cancelada e não reaparece no painel', async () => {
    let resolve!: (page: typeof firstPage) => void
    vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    await render()
    await act(async () => button('Ler arquivo').click())
    const signal = vi.mocked(apiFetch).mock.calls[0][1]!.signal!
    await render({ clienteId: 'client-b' })
    expect(signal.aborted).toBe(true)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await act(async () => resolve(firstPage))
    expect(document.body.textContent).not.toContain('Trecho inicial sintético')
  })
  it('leitura no Drive corporativo usa o contrato de arquivo e mantém o cursor', async () => {
    await render({ corporateOnly: true })
    expect(vi.mocked(useApi).mock.calls.some(([path]) => path?.includes('corporateOnly=1'))).toBe(true)
    await act(async () => button('Ler arquivo').click())
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe('/alix/drive-corpus/files/synthetic-drive-file')
    expect(document.body.textContent).toContain('Trecho inicial sintético')
    await act(async () => button('Próximo trecho').click())
    expect(vi.mocked(apiFetch).mock.calls[1][0]).toBe('/alix/drive-corpus/files/synthetic-drive-file?cursor=cursor%3Asafe')
    expect(vi.mocked(apiFetch).mock.calls.every(([path]) => !path.includes('corporateOnly') && !path.includes('clienteId'))).toBe(true)
  })
  it('erro de autorização pede selecionar cliente e não afirma acervo vazio', async () => {
    resources.overview = { ...resource(null), error: 'Selecione um cliente para esta consulta.' }
    resources.files = { ...resource(null), error: 'Acesso não disponível.' }
    await render({ clienteId: undefined })
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Selecione um cliente')
    expect(host.textContent).not.toContain('Nenhum arquivo disponível')
  })
  it('estado adiado continua pendente e link inválido nunca é aberto como fonte', async () => {
    resources.files = resource({ files: [{ ...file, readStatus: 'deferred', url: 'javascript:alert(1)' }], total: 1, nextOffset: null })
    await render()
    expect(host.textContent).toContain('Leitura adiada')
    expect(host.querySelector('a[href^="javascript:"]')).toBeNull()
    expect(host.querySelector('a[href="/clientes/client-a"]')).not.toBeNull()
  })
  it('consulta conteúdo mostra trecho e página de origem, mantendo escopo', async () => {
    await render()
    await act(async () => button('Dentro dos arquivos').click())
    const input = host.querySelector('input[aria-label="Buscar no conteúdo dos documentos"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'banco')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(vi.mocked(useApi).mock.calls.some(([path]) => path?.includes('/search?clienteId=client-a&query=banco'))).toBe(true)
    expect(host.textContent).toContain('O banco consta no trecho sintético.')
    expect(host.textContent).toContain('Página 2')
  })
  it('próxima página preserva todos os filtros e não dispara efeito de escrita', async () => {
    await render()
    await act(async () => button('Próxima').click())
    expect(vi.mocked(useApi).mock.calls.some(([path]) => path?.includes('offset=20'))).toBe(true)
    expect(button('Anterior').disabled).toBe(false)
    expect(apiFetch).not.toHaveBeenCalled()
  })
  it('filtro de texto extraído usa o estado canônico e não confunde corporativo com cliente indefinido', async () => {
    const onScopeChange = vi.fn()
    await render({ onScopeChange })
    const select = host.querySelector('select[aria-label="Estado de leitura"]') as HTMLSelectElement
    await act(async () => { select.value = 'complete'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(vi.mocked(useApi).mock.calls.some(([path]) => path?.includes('status=complete'))).toBe(true)
    const scope = host.querySelector('select[aria-label="Área do acervo"]') as HTMLSelectElement
    expect(scope.textContent).toContain('Drive corporativo')
    await act(async () => { scope.value = 'corporate'; scope.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(onScopeChange).toHaveBeenCalledWith('', true)
  })
  it('atualiza só a cada 30 segundos visíveis e preserva o trecho aberto e seu cursor', async () => {
    vi.useFakeTimers()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    resources.overview = resource({ ...overview, reading: { ...overview.reading, status: 'reading' } })
    await render()
    await act(async () => button('Ler arquivo').click())
    vi.mocked(apiFetch).mockResolvedValueOnce({ ...firstPage, text: 'Trecho que deve permanecer aberto', range: { start: 12000, end: 25000 }, nextCursor: null })
    await act(async () => button('Próximo trecho').click())
    const activeRequestCount = vi.mocked(apiFetch).mock.calls.length
    await act(async () => vi.advanceTimersByTime(29_999))
    expect(resources.overview.refetch).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(1))
    expect(resources.overview.refetch).toHaveBeenCalledTimes(1)
    expect(resources.files.refetch).toHaveBeenCalledTimes(1)
    expect(apiFetch).toHaveBeenCalledTimes(activeRequestCount)
    expect(document.body.textContent).toContain('Trecho que deve permanecer aberto')
    expect(button('Trecho anterior').disabled).toBe(false)
    visibility.mockReturnValue('hidden')
    await act(async () => vi.advanceTimersByTime(60_000))
    expect(resources.overview.refetch).toHaveBeenCalledTimes(1)
    expect(resources.files.refetch).toHaveBeenCalledTimes(1)
    visibility.mockReturnValue('visible')
    await act(async () => vi.advanceTimersByTime(30_000))
    expect(resources.overview.refetch).toHaveBeenCalledTimes(2)
    expect(apiFetch).toHaveBeenCalledTimes(activeRequestCount)
  })
  it('não cancela consultas em andamento e encerra atualização ao concluir ou desmontar', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    resources.overview = { ...resource({ ...overview, reading: { ...overview.reading, status: 'paused_auth' } }), loading: true }
    resources.files.loading = true
    await render()
    await act(async () => vi.advanceTimersByTime(30_000))
    expect(resources.overview.refetch).not.toHaveBeenCalled()
    expect(resources.files.refetch).not.toHaveBeenCalled()
    resources.overview.loading = false; resources.files.loading = false
    await render({ clienteId: 'client-b' })
    await act(async () => vi.advanceTimersByTime(30_000))
    expect(resources.overview.refetch).toHaveBeenCalledTimes(1)
    expect(resources.files.refetch).toHaveBeenCalledTimes(1)
    resources.overview.data = { ...overview, reading: { ...overview.reading, status: 'complete' } }
    await render({ clienteId: 'client-b' })
    await act(async () => vi.advanceTimersByTime(60_000))
    expect(resources.overview.refetch).toHaveBeenCalledTimes(1)
    resources.overview.data = { ...overview, reading: { ...overview.reading, status: 'not_started' } }
    await render({ clienteId: 'client-b' })
    await act(async () => root.render(<MemoryRouter><div>Outra tela</div></MemoryRouter>))
    await act(async () => vi.advanceTimersByTime(60_000))
    expect(resources.overview.refetch).toHaveBeenCalledTimes(1)
  })
})
