import type { PendenciaDTO, UploadDTO } from './types'

export const PORTAL_UPLOAD_MAX_BYTES = 20 * 1024 * 1024
export const PORTAL_UPLOAD_MAX_BATCH = 20
export const PORTAL_UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.xlsm,.docx,.doc,.csv,.txt,.xml'
export const PORTAL_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword', csv: 'text/csv', txt: 'text/plain', xml: 'application/xml',
}

export const REQUEST_STATUS_LABEL: Record<PendenciaDTO['status'], string> = {
  pendente: 'Aguardando seu envio', enviado: 'Recebido · em conferência',
  aprovado: 'Conferido pela equipe', rejeitado: 'Precisa de novo envio', cancelado: 'Solicitação encerrada',
}
export const REQUEST_PRIORITY_LABEL = { normal: 'Normal', alta: 'Alta prioridade', urgente: 'Urgente' } as const

/** Datas de prazo são civis, sem conversão UTC que antecipe um dia no Brasil. */
export function portalDateOnly(value?: string | null): string {
  if (!value) return 'Sem prazo definido'
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : 'Prazo a confirmar'
}

export function localDateOnly(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function needsClientAction(request: Pick<PendenciaDTO, 'status'>): boolean {
  return request.status === 'pendente' || request.status === 'rejeitado'
}

export function canUploadToRequest(request: Pick<PendenciaDTO, 'status'>): boolean {
  return needsClientAction(request) || request.status === 'enviado'
}

export function requestIsOverdue(request: PendenciaDTO, today = localDateOnly()): boolean {
  return needsClientAction(request) && Boolean(request.prazo && request.prazo < today)
}

export function sortPortalRequests(requests: PendenciaDTO[], today = localDateOnly()): PendenciaDTO[] {
  const order: Record<PendenciaDTO['status'], number> = { rejeitado: 0, pendente: 0, enviado: 1, aprovado: 2, cancelado: 3 }
  const priority = { urgente: 0, alta: 1, normal: 2 }
  return [...requests].sort((a, b) =>
    order[a.status] - order[b.status]
    || Number(requestIsOverdue(b, today)) - Number(requestIsOverdue(a, today))
    || priority[a.prioridade || 'normal'] - priority[b.prioridade || 'normal']
    || (a.prazo || '9999').localeCompare(b.prazo || '9999')
    || a.solicitadoEm.localeCompare(b.solicitadoEm)
    || a.id.localeCompare(b.id),
  )
}

export function validatePortalFile(file: Pick<File, 'name' | 'size' | 'type'>): string | null {
  if (file.size === 0) return 'O arquivo está vazio. Escolha uma cópia que abra no seu aparelho.'
  if (file.size > PORTAL_UPLOAD_MAX_BYTES) return 'O arquivo excede 20 MB. Divida o documento ou reduza o tamanho antes de enviar.'
  if (!PORTAL_MIME_BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() || '']) {
    return 'Formato não aceito. Envie PDF, JPEG, PNG, WEBP, Word, Excel, CSV, TXT ou XML. Exporte fotos HEIC/HEIF como JPEG ou PDF.'
  }
  return null
}

export function publicAnalysisLabel(status: UploadDTO['analiseStatus']): string {
  if (!status) return 'Leitura não informada'
  return ({ aguardando: 'Leitura aguardando', processando: 'ALIX está lendo', concluida: 'Leitura concluída', revisao: 'Conferência da equipe', erro: 'Equipe verificando a leitura' })[status || 'aguardando']
}

export function publicDriveLabel(status: UploadDTO['driveStatus']): string {
  if (!status) return 'Organização não informada'
  return ({ aguardando: 'Organização aguardando', processando: 'Organizando o arquivo', arquivado: 'Arquivo organizado', erro: 'Equipe verificando a organização', indisponivel: 'Organização pendente' })[status || 'aguardando']
}

export function uploadIsProcessing(upload: UploadDTO): boolean {
  return upload.analiseStatus === 'aguardando' || upload.analiseStatus === 'processando'
    || upload.driveStatus === 'aguardando' || upload.driveStatus === 'processando'
}

/** O token do portal só pode acompanhar URLs do download autenticado local. */
export function portalDownloadPath(upload: Pick<UploadDTO, 'id' | 'url'>): string | null {
  if (!upload.url) return null
  const expected = `/api/portal/uploads/${encodeURIComponent(upload.id)}`
  return upload.url === expected ? expected : null
}

export function safeDriveUrl(value?: string): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && ['drive.google.com', 'docs.google.com'].includes(url.hostname) ? url.href : null
  } catch { return null }
}
