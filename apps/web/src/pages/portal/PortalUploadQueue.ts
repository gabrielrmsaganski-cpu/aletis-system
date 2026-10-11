import type { PendenciaDTO, UploadDTO } from './types'
import { PORTAL_UPLOAD_MAX_BATCH, PORTAL_MIME_BY_EXTENSION, validatePortalFile } from './DocumentWorkflow'

export interface PortalUploadItem {
  id: string
  nome: string
  tamanho: number
  pendenciaId?: string
  pedido?: string
  status: 'aguardando' | 'enviando' | 'recebido' | 'erro'
  progresso: number
  erro?: string
  retryable: boolean
  recibo?: UploadDTO
}

export interface PortalUploadInput {
  file: File
  idempotencyKey: string
  pendenciaId?: string
  categoria?: PendenciaDTO['categoria']
}

export type PortalUploadTransport = (input: PortalUploadInput, onProgress: (percentage: number) => void, signal: AbortSignal) => Promise<UploadDTO>

/** Uma requisição por arquivo. A mesma chave é mantida na retomada de uma falha. */
export function createPortalUploadTransport(token: string): PortalUploadTransport {
  return (input, onProgress, signal) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const finishError = (message: string) => reject(new Error(message))
    const abort = () => xhr.abort()
    xhr.open('POST', '/api/portal/upload')
    xhr.withCredentials = true
    xhr.timeout = 180_000
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('Idempotency-Key', input.idempotencyKey)
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round(event.loaded * 100 / event.total)))
    }
    xhr.onload = () => {
      let body: { success?: boolean; data?: UploadDTO; error?: string; message?: string }
      try { body = JSON.parse(xhr.responseText) } catch { finishError('O servidor não confirmou o recebimento. Tente novamente com este mesmo arquivo.'); return }
      if (xhr.status >= 200 && xhr.status < 300 && body.success !== false && body.data?.id) resolve(body.data)
      else if (xhr.status === 401) finishError('Sua sessão terminou. Entre novamente antes de enviar o arquivo.')
      else if (xhr.status >= 500) finishError('Não foi possível confirmar o recebimento. Tente novamente; um arquivo já recebido não será duplicado.')
      else finishError(body.message || body.error || 'Não foi possível enviar este arquivo.')
    }
    xhr.onerror = () => finishError('A conexão falhou. Confira sua internet e tente novamente.')
    xhr.ontimeout = () => finishError('O envio demorou mais que o esperado. Tente novamente; a confirmação será verificada.')
    xhr.onabort = () => finishError('Envio interrompido.')
    xhr.onloadend = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) { signal.removeEventListener('abort', abort); finishError('Envio interrompido.'); return }
    const form = new FormData()
    if (input.pendenciaId) form.append('pendenciaId', input.pendenciaId)
    if (input.categoria) form.append('categoria', input.categoria)
    const mime = PORTAL_MIME_BY_EXTENSION[input.file.name.split('.').pop()?.toLowerCase() || ''] || input.file.type
    form.append('file', input.file.type === mime ? input.file : new Blob([input.file], { type: mime }), input.file.name)
    xhr.send(form)
  })
}

/** Fila vinculada à sessão. Continua ao mudar de aba e cancela ao sair da conta. */
export class PortalUploadQueue {
  private items: PortalUploadItem[] = []
  private inputs = new Map<string, PortalUploadInput>()
  private running = false
  private disposed = false
  private controller: AbortController | null = null

  constructor(
    private readonly transport: PortalUploadTransport,
    private readonly changed: (items: PortalUploadItem[]) => void,
    private readonly received: (upload: UploadDTO) => void,
    private readonly idFactory: () => string = () => crypto.randomUUID(),
  ) {}

  enqueue(files: File[], request?: PendenciaDTO, categoria?: PendenciaDTO['categoria']): string | null {
    if (this.disposed) return 'A sessão foi encerrada. Entre novamente para enviar.'
    if (files.length > PORTAL_UPLOAD_MAX_BATCH) return 'Escolha até 20 arquivos por vez. Nenhum arquivo dessa seleção foi enviado.'
    if (this.inputs.size + files.length > 40) return 'Aguarde o fim dos envios ou remova os arquivos com falha antes de adicionar outros.'
    if (request && ['aprovado', 'cancelado'].includes(request.status)) return 'Este pedido está encerrado. Envie como outro documento ou fale com a equipe.'
    for (const file of files) {
      const id = this.idFactory()
      const erro = validatePortalFile(file)
      this.items.push({ id, nome: file.name, tamanho: file.size, pendenciaId: request?.id, pedido: request?.titulo, status: erro ? 'erro' : 'aguardando', progresso: 0, erro: erro || undefined, retryable: !erro })
      if (!erro) this.inputs.set(id, { file, idempotencyKey: id, pendenciaId: request?.id, categoria: request?.categoria || categoria })
    }
    this.emit()
    void this.run()
    return null
  }

  retry(id: string): void {
    const item = this.items.find(item => item.id === id)
    if (!item || item.status !== 'erro' || !item.retryable || !this.inputs.has(id)) return
    this.update(id, { status: 'aguardando', progresso: 0, erro: undefined })
    void this.run()
  }

  remove(id: string): void {
    if (this.items.find(item => item.id === id)?.status === 'enviando') return
    this.inputs.delete(id)
    this.items = this.items.filter(item => item.id !== id)
    this.emit()
  }

  clearReceived(): void {
    this.items = this.items.filter(item => item.status !== 'recebido')
    this.emit()
  }

  dispose(): void {
    this.disposed = true
    this.controller?.abort()
    this.inputs.clear()
    this.items = []
  }

  private emit(): void {
    if (!this.disposed) this.changed(this.items.map(item => ({ ...item })))
  }

  private update(id: string, patch: Partial<PortalUploadItem>): void {
    this.items = this.items.map(item => item.id === id ? { ...item, ...patch } : item)
    this.emit()
  }

  private async run(): Promise<void> {
    if (this.running || this.disposed) return
    this.running = true
    try {
      while (!this.disposed) {
        const item = this.items.find(item => item.status === 'aguardando')
        if (!item) break
        const input = this.inputs.get(item.id)
        if (!input) { this.remove(item.id); continue }
        this.controller = new AbortController()
        this.update(item.id, { status: 'enviando', progresso: 0 })
        try {
          const recibo = await this.transport(input, progresso => this.update(item.id, { progresso }), this.controller.signal)
          if (this.disposed) break
          this.inputs.delete(item.id)
          this.update(item.id, { status: 'recebido', progresso: 100, recibo, retryable: false })
          // A confirmação do envio não depende de uma leitura posterior do painel.
          this.received(recibo)
        } catch (error) {
          if (this.disposed) break
          this.update(item.id, { status: 'erro', erro: error instanceof Error ? error.message : 'Falha no envio. Tente novamente.', retryable: true })
        } finally { this.controller = null }
      }
    } finally { this.running = false }
  }
}
