import { describe, expect, it, vi } from 'vitest'
import { canUploadToRequest, needsClientAction, portalDateOnly, portalDownloadPath, PORTAL_UPLOAD_MAX_BYTES, requestIsOverdue, safeDriveUrl, sortPortalRequests, validatePortalFile } from '../src/pages/portal/DocumentWorkflow'
import { PortalUploadQueue, type PortalUploadItem, type PortalUploadTransport } from '../src/pages/portal/PortalUploadQueue'
import type { PendenciaDTO, UploadDTO } from '../src/pages/portal/types'

const request = (id: string, patch: Partial<PendenciaDTO> = {}): PendenciaDTO => ({ id, clienteId: 'cliente-sintetico', titulo: id, categoria: 'outros', obrigatorio: true, status: 'pendente', solicitadoEm: '2026-09-10T12:00:00Z', ...patch })
const file = (name = 'documento.pdf', size = 1024, type = 'application/pdf') => ({ name, size, type } as File)
const receipt = (id: string): UploadDTO => ({ id, clienteId: 'cliente-sintetico', nomeOriginal: 'documento.pdf', mime: 'application/pdf', tamanho: 1024, enviadoPor: 'cliente', enviadoEm: '2026-09-11T12:00:00Z' })
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

function setup(transport: PortalUploadTransport) {
  let state: PortalUploadItem[] = []
  let index = 0
  const received = vi.fn()
  const queue = new PortalUploadQueue(transport, items => { state = items }, received, () => `item-${++index}`)
  return { queue, received, state: () => state }
}

describe('Documentos do portal: orientação e limites reais', () => {
  it('prioriza pendências vencidas e urgentes antes das solicitações em conferência', () => {
    const items = [request('conferir', { status: 'enviado', prioridade: 'urgente', prazo: '2020-01-01' }), request('normal'), request('alta', { prioridade: 'alta' }), request('corrigir', { status: 'rejeitado', prazo: '2026-09-01' }), request('urgente', { prioridade: 'urgente' }), request('encerrada', { status: 'cancelado' })]
    expect(sortPortalRequests(items, '2026-09-11').map(item => item.id)).toEqual(['corrigir', 'urgente', 'alta', 'normal', 'conferir', 'encerrada'])
    expect(items[0].id).toBe('conferir')
    expect(needsClientAction(items[3])).toBe(true)
    expect(requestIsOverdue(items[0], '2026-09-11')).toBe(false)
  })
  it('mantém a data civil do prazo sem antecipar o dia', () => {
    expect(portalDateOnly('2026-09-11')).toBe('11/09/2026')
    expect(portalDateOnly(null)).toBe('Sem prazo definido')
    expect(requestIsOverdue(request('hoje', { prazo: '2026-09-11' }), '2026-09-11')).toBe(false)
  })
  it('permite complemento e correção, mas bloqueia pedidos aprovados ou cancelados', () => {
    for (const status of ['pendente', 'rejeitado', 'enviado'] as const) expect(canUploadToRequest(request('id', { status }))).toBe(true)
    for (const status of ['aprovado', 'cancelado'] as const) expect(canUploadToRequest(request('id', { status }))).toBe(false)
  })
  it('valida vazio,20MiB,extensão e arquivos sem MIME do navegador', () => {
    expect(validatePortalFile(file('PDF.PDF', PORTAL_UPLOAD_MAX_BYTES, ''))).toBeNull()
    expect(validatePortalFile(file('dados.xlsx', 1024, ''))).toBeNull()
    expect(validatePortalFile(file('foto.heic', 1024, ''))).toMatch(/JPEG|PDF/)
    expect(validatePortalFile(file('planilha.xlsm', 1024, ''))).toBeNull()
    expect(validatePortalFile(file('dados.xml', 1024, ''))).toBeNull()
    expect(validatePortalFile(file('vazio.pdf', 0))).toMatch(/vazio/)
    expect(validatePortalFile(file('grande.pdf', PORTAL_UPLOAD_MAX_BYTES + 1))).toMatch(/20 MB/)
    expect(validatePortalFile(file('programa.exe'))).toMatch(/Formato não aceito/)
  })
  it('nunca envia o token a um download externo ou a outra rota', () => {
    expect(portalDownloadPath({ id: 'up-1', url: '/api/portal/uploads/up-1' })).toBe('/api/portal/uploads/up-1')
    for (const url of ['https://drive.google.com/a', '//evil.example/file', '/api/portal/uploads/up-2', '/api/portal/uploads/up-1?redirect=external']) expect(portalDownloadPath({ id: 'up-1', url })).toBeNull()
    expect(safeDriveUrl('https://drive.google.com/file/d/abc/view')).toContain('drive.google.com')
    expect(safeDriveUrl('https://drive.google.com.evil.example/a')).toBeNull()
    expect(safeDriveUrl('javascript:alert(1)')).toBeNull()
  })
})

describe('Fila de envio: isolamento, confirmação e retomada', () => {
  it('envia um arquivo por vez e preserva todos os anexos do mesmo pedido', async () => {
    const resolvers: Array<(upload: UploadDTO) => void> = []
    const transport = vi.fn<PortalUploadTransport>(() => new Promise(resolve => resolvers.push(resolve)))
    const { queue, state, received } = setup(transport)
    queue.enqueue([file('pagina-1.pdf'), file('pagina-2.pdf')], request('pedido'))
    expect(transport).toHaveBeenCalledTimes(1)
    expect(state().map(item => item.status)).toEqual(['enviando', 'aguardando'])
    resolvers[0](receipt('upload-1')); await flush()
    expect(transport).toHaveBeenCalledTimes(2)
    expect(transport.mock.calls[1][0].pendenciaId).toBe('pedido')
    resolvers[1](receipt('upload-2')); await flush()
    expect(state().every(item => item.status === 'recebido')).toBe(true)
    expect(received).toHaveBeenCalledTimes(2)
    queue.dispose()
  })
  it('uma falha não perde os demais arquivos e repetir usa a mesma chave idempotente', async () => {
    const transport = vi.fn<PortalUploadTransport>().mockRejectedValueOnce(new Error('Conexão caiu')).mockResolvedValueOnce(receipt('upload-2')).mockResolvedValueOnce(receipt('upload-1'))
    const { queue, state } = setup(transport)
    queue.enqueue([file('primeiro.pdf'), file('segundo.pdf')])
    await flush()
    expect(state().map(item => item.status)).toEqual(['erro', 'recebido'])
    const key = transport.mock.calls[0][0].idempotencyKey
    queue.retry(state()[0].id); await flush()
    expect(transport.mock.calls[2][0].idempotencyKey).toBe(key)
    expect(state()[0].recibo?.id).toBe('upload-1')
    queue.dispose()
  })
  it('valida arquivos individualmente, sem upload ou retry para formatos recusados', async () => {
    const transport = vi.fn<PortalUploadTransport>().mockResolvedValue(receipt('ok'))
    const { queue, state } = setup(transport)
    queue.enqueue([file('programa.exe'), file('documento.pdf')])
    await flush()
    expect(transport).toHaveBeenCalledTimes(1)
    expect(state()[0]).toMatchObject({ status: 'erro', retryable: false })
    queue.retry(state()[0].id); await flush()
    expect(transport).toHaveBeenCalledTimes(1)
    queue.dispose()
  })
  it('fecha a fila ao sair e ignora um recebimento atrasado de outra sessão', async () => {
    let resolve!: (upload: UploadDTO) => void
    let signal!: AbortSignal
    const transport: PortalUploadTransport = (_input, _progress, currentSignal) => { signal = currentSignal; return new Promise(done => { resolve = done }) }
    const { queue, received, state } = setup(transport)
    queue.enqueue([file()]); const previous = state()
    queue.dispose(); expect(signal.aborted).toBe(true)
    resolve(receipt('late')); await flush()
    expect(received).not.toHaveBeenCalled()
    expect(state()).toEqual(previous)
    expect(queue.enqueue([file()])).toMatch(/sessão foi encerrada/)
  })
  it('recusa seleção maior que20 e pedidos encerrados antes de enviar qualquer arquivo', () => {
    const transport = vi.fn<PortalUploadTransport>()
    const { queue, state } = setup(transport)
    expect(queue.enqueue(Array.from({ length: 21 }, () => file()))).toMatch(/20 arquivos/)
    expect(queue.enqueue([file()], request('id', { status: 'aprovado' }))).toMatch(/encerrado/)
    expect(state()).toEqual([])
    expect(transport).not.toHaveBeenCalled()
    queue.dispose()
  })
  it('mantém progresso abaixo100 até receber confirmação com id', async () => {
    let resolve!: (upload: UploadDTO) => void
    let progress!: (value: number) => void
    const { queue, state } = setup((_input, update) => { progress = update; return new Promise(done => { resolve = done }) })
    queue.enqueue([file()]); progress(99)
    expect(state()[0]).toMatchObject({ status: 'enviando', progresso: 99 })
    resolve(receipt('comprovante')); await flush()
    expect(state()[0]).toMatchObject({ status: 'recebido', progresso: 100, recibo: { id: 'comprovante' } })
    queue.dispose()
  })
})
