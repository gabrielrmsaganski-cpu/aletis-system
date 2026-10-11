import type { PortalDocumentRecord, PortalUploadRecord } from './PortalDocumentService.js'

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function canClientSeeUpload(upload: PortalUploadRecord): boolean {
  return upload.enviadoPor === 'cliente' || upload.metadata.portalCompartilhado === true
}

export function publicPortalRequest(request: PortalDocumentRecord) {
  return {
    id: request.id, clienteId: request.clienteId, titulo: request.titulo, descricao: request.descricao,
    categoria: request.categoria, obrigatorio: request.obrigatorio, status: request.status,
    uploadId: request.uploadId, solicitadoPor: request.solicitadoPor, solicitadoEm: request.solicitadoEm,
    enviadoEm: request.enviadoEm, revisadoEm: request.revisadoEm, observacao: request.observacao,
    prioridade: request.prioridade, prazo: request.prazo, tipoDocumento: request.tipoDocumento, updatedAt: request.updatedAt,
  }
}

/** O portal não recebe caminhos físicos, hashes, prompts, inferências ou links internos do Drive. */
export function publicPortalUpload(upload: PortalUploadRecord) {
  const processing = object(upload.metadata.processing)
  const analysis = object(processing.analysis)
  const drive = object(processing.drive)
  const legacyDrive = object(upload.metadata.googleDrive)
  const review = object(upload.metadata.review)
  const analysisState = String(analysis.status || 'pending')
  const driveState = String(drive.status || legacyDrive.status || 'pending')
  const analiseStatus = ['completed', 'concluida'].includes(analysisState) ? 'concluida'
    : ['needs_review', 'review', 'revisao', 'partial'].includes(analysisState) ? 'revisao'
      : ['running', 'processing', 'processando'].includes(analysisState) ? 'processando'
        : ['failed', 'error', 'erro'].includes(analysisState) ? 'erro' : 'aguardando'
  const driveStatus = ['uploaded', 'completed', 'archived', 'arquivado'].includes(driveState) ? 'arquivado'
    : ['running', 'processing', 'processando'].includes(driveState) ? 'processando'
      : ['blocked', 'unavailable', 'disabled', 'indisponivel'].includes(driveState) ? 'indisponivel'
        : ['failed', 'error', 'erro', 'retry'].includes(driveState) ? 'erro' : 'aguardando'
  return {
    id: upload.id, clienteId: upload.clienteId, pendenciaId: upload.pendenciaId,
    nomeOriginal: upload.nomeOriginal, mime: upload.mime, tamanho: upload.tamanho, categoria: upload.categoria,
    enviadoPor: upload.enviadoPor, enviadoEm: upload.enviadoEm, versao: upload.versao,
    url: `/api/portal/uploads/${encodeURIComponent(upload.id)}`, analiseStatus, driveStatus,
    review: ['aprovado', 'rejeitado'].includes(String(review.status)) ? {
      status: String(review.status), observacao: typeof review.observacao === 'string' ? review.observacao : undefined,
      revisadoEm: typeof review.revisadoEm === 'string' ? review.revisadoEm : undefined,
    } : undefined,
  }
}

export function staffPortalUpload(upload: PortalUploadRecord) {
  const view = publicPortalUpload(upload)
  return {
    ...view, url: `/api/clientes/${encodeURIComponent(upload.clienteId)}/documentos/${encodeURIComponent(upload.id)}/download`,
    metadata: upload.metadata, portalCompartilhado: upload.metadata.portalCompartilhado === true,
  }
}
