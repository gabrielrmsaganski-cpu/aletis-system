// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ClientePortalDocumentosPanel from '../src/components/cliente/ClientePortalDocumentosPanel'
import { PendenciasInbox, PortalUploadQueuePanel } from '../src/pages/portal/Pendencias'
import { CofreDigital } from '../src/pages/portal/Cofre'
import { ApiError, apiFetch } from '../src/hooks/useApi'
import type { PendenciaDTO, UploadDTO } from '../src/pages/portal/types'
import type { PortalUploadQueueControls } from '../src/pages/portal/usePortalUploadQueue'

vi.mock('../src/hooks/useApi', async original => ({ ...await original<typeof import('../src/hooks/useApi')>(), apiFetch: vi.fn() }))
const request: PendenciaDTO = { id: 'pedido-sintetico', clienteId: 'cliente-a', titulo: 'Documento sintético solicitado', descricao: 'Enviar todas as páginas do período solicitado.', categoria: 'contrato', obrigatorio: true, status: 'enviado', prioridade: 'alta', prazo: '2026-09-20', solicitadoEm: '2026-09-11T12:00:00Z', updatedAt: '2026-09-11T13:00:00.001Z' }
const upload: UploadDTO = { id: 'arquivo-sintetico', clienteId: 'cliente-a', pendenciaId: request.id, nomeOriginal: 'documento-sintetico.pdf', mime: 'application/pdf', tamanho: 1024, enviadoPor: 'cliente', enviadoEm: '2026-09-11T13:00:00Z', url: '/api/portal/uploads/arquivo-sintetico', analiseStatus: 'concluida', driveStatus: 'arquivado' }
let host: HTMLDivElement
let root: Root
const mutationCalls = () => vi.mocked(apiFetch).mock.calls.filter(([, options]) => options?.method && options.method !== 'GET')
const buttons = () => [...document.querySelectorAll('button')]
const button = (text: string) => buttons().find(item => item.textContent?.includes(text))!
const textInput = async (element: HTMLInputElement | HTMLTextAreaElement, text: string) => {
  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!
    descriptor.set!.call(element, text)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const defaults = (path: string) => path.endsWith('/andamentos') ? [] : path.endsWith('/pendencias') ? [request] : path.endsWith('/uploads') ? [upload] : {}
beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  vi.mocked(apiFetch).mockImplementation(async path => defaults(path) as never)
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })
const renderPanel = async (clienteId = 'cliente-a') => { await act(async () => root.render(<ClientePortalDocumentosPanel clienteId={clienteId} clienteNome={clienteId} onOpenDocumento={vi.fn()} />)) }
const emptyQueue = (): PortalUploadQueueControls => ({ items: [], notice: null, busy: false, enqueue: vi.fn(), retry: vi.fn(), remove: vi.fn(), clearReceived: vi.fn() })

describe('Equipe: pedidos versionados e acesso restrito ao cliente atual', () => {
  it('pede confirmação da conferência e inclui a versão vista no PATCH, com proteção contra duplo clique', async () => {
    let resolve!: (data: unknown) => void
    vi.mocked(apiFetch).mockImplementation(async (path, options) => options?.method === 'PATCH' ? new Promise(done => { resolve = done }) : defaults(path) as never)
    await renderPanel()
    await act(async () => button('Conferir e aprovar pedido').click())
    expect(button('Registrar aprovação').disabled).toBe(true)
    const check = document.querySelector('[role=dialog] input[type=checkbox]') as HTMLInputElement
    await act(async () => check.click())
    await act(async () => { button('Registrar aprovação').click(); button('Registrar aprovação').click() })
    expect(mutationCalls()).toHaveLength(1)
    expect(JSON.parse(mutationCalls()[0][1]!.body as string)).toEqual({ status: 'aprovado', observacao: '', expectedUpdatedAt: request.updatedAt })
    await act(async () => resolve({ ...request, status: 'aprovado' }))
  })
  it('exige orientação para devolver e mantém histórico no pedido', async () => {
    await renderPanel()
    await act(async () => button('Pedir correção').click())
    expect(button('Solicitar novo envio').disabled).toBe(true)
    const field = document.querySelector('[role=dialog] textarea') as HTMLTextAreaElement
    await textInput(field, 'A segunda página está cortada. Envie a página completa.')
    await act(async () => button('Solicitar novo envio').click())
    const call = mutationCalls()[0]
    expect(call[0]).toBe(`/clientes/cliente-a/portal/pendencias/${request.id}`)
    expect(JSON.parse(call[1]!.body as string)).toMatchObject({ status: 'rejeitado', observacao: 'A segunda página está cortada. Envie a página completa.', expectedUpdatedAt: request.updatedAt })
  })
  it('bloqueia salvar uma versão obsoleta e não reutiliza a aprovação depois de conflito', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path, options) => { if (options?.method === 'PATCH') throw new ApiError('Versão alterada.', 409, 'PORTAL_CONFLICT'); return defaults(path) as never })
    await renderPanel()
    await act(async () => button('Editar').click())
    await textInput(document.querySelector('[role=dialog] input') as HTMLInputElement, 'Documento com nome atualizado')
    await act(async () => button('Salvar alterações').click())
    expect(document.body.textContent).toContain('Este pedido mudou enquanto você editava')
    expect(button('Salvar alterações').disabled).toBe(true)
    await act(async () => button('Salvar alterações').click())
    expect(mutationCalls()).toHaveLength(1)
    expect(document.querySelector('[role=dialog] input')?.getAttribute('value')).toBe('Documento com nome atualizado')
  })
  it('trocar de cliente fecha o formulário e remove documentos e dados anteriores imediatamente', async () => {
    await renderPanel()
    await act(async () => button('Editar').click())
    vi.mocked(apiFetch).mockImplementation(() => new Promise(() => undefined))
    await renderPanel('cliente-b')
    expect(document.querySelector('[role=dialog]')).toBeNull()
    expect(host.textContent).not.toContain(request.titulo)
    expect(host.textContent).not.toContain(upload.nomeOriginal)
    expect(host.textContent).toContain('Carregando solicitações')
  })
  it('disponibiliza arquivo consultor somente após ação explícita da equipe', async () => {
    vi.mocked(apiFetch).mockImplementation(async path => path.endsWith('/uploads') ? [{ ...upload, enviadoPor: 'consultor', portalCompartilhado: false }] as never : defaults(path) as never)
    await renderPanel()
    expect(mutationCalls()).toHaveLength(0)
    await act(async () => button('Recebidos · ALIX e Drive').click())
    await act(async () => button('Disponibilizar ao cliente').click())
    expect(mutationCalls()).toHaveLength(1)
    expect(mutationCalls()[0][0]).toContain('/compartilhar')
    expect(JSON.parse(mutationCalls()[0][1]!.body as string)).toEqual({ disponivel: true })
  })
})

describe('Cliente: correções, vários anexos e comprovantes', () => {
  it('mostra motivo de reenvio, data civil e permite selecionar vários arquivos para o mesmo pedido', async () => {
    const queue = emptyQueue()
    const rejected = { ...request, status: 'rejeitado' as const, observacao: 'Faltam as páginas finais.' }
    await act(async () => root.render(<PendenciasInbox pendencias={[rejected]} uploads={[upload]} queue={queue} />))
    expect(host.textContent).toContain('Faltam as páginas finais.')
    expect(host.textContent).toContain('20/09/2026')
    const input = host.querySelector('input[type=file]') as HTMLInputElement
    expect(input.multiple).toBe(true)
    const files = [new File(['one'], 'pagina-1.pdf', { type: 'application/pdf' }), new File(['two'], 'pagina-2.pdf', { type: 'application/pdf' })]
    Object.defineProperty(input, 'files', { configurable: true, value: files })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    expect(queue.enqueue).toHaveBeenCalledWith(files, rejected)
  })
  it('recebimento e análise são estados separados e não publica o resumo interno', async () => {
    const withInternal = { ...upload, analiseStatus: 'processando' as const, driveStatus: 'aguardando' as const, metadata: { resumoIa: 'ACHADO INTERNO SIGILOSO' } }
    await act(async () => root.render(<CofreDigital uploads={[withInternal]} token="token-sintetico" pendencias={[request]} />))
    expect(host.textContent).toContain('Comprovante: arquivo-sintetico')
    expect(host.textContent).toContain('ALIX está lendo')
    expect(host.textContent).toContain('Organização aguardando')
    expect(host.textContent).not.toContain('ACHADO INTERNO SIGILOSO')
    expect(host.textContent).not.toContain('drive.google.com')
  })
  it('permite retomar só o arquivo com falha e mostra recibo do recebido', async () => {
    const queue = emptyQueue()
    queue.items = [{ id: 'falha', nome: 'falha.pdf', tamanho: 1, status: 'erro', progresso: 0, erro: 'Conexão caiu', retryable: true }, { id: 'ok', nome: 'ok.pdf', tamanho: 1, status: 'recebido', progresso: 100, retryable: false, recibo: upload }]
    await act(async () => root.render(<PortalUploadQueuePanel queue={queue} />))
    await act(async () => button('Tentar novamente').click())
    expect(queue.retry).toHaveBeenCalledWith('falha')
    expect(host.textContent).toContain('Comprovante: arquivo-sintetico')
  })
})
