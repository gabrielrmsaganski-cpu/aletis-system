import type { GoogleWorkspaceActor } from './schemas.js'
import { getGoogleDriveService } from './drive.js'
import { isMimeAllowed } from '../../lib/upload-validation.js'
import { createHash } from 'node:crypto'
import { driveRevisionKey } from './DriveSourceIdentity.js'

export const MAX_DRIVE_IMPORT_BYTES = 20 * 1024 * 1024
const exportsByMime = {
  'application/vnd.google-apps.document': { mime: 'text/plain', ext: '.txt' },
  'application/vnd.google-apps.spreadsheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' },
  'application/vnd.google-apps.presentation': { mime: 'application/pdf', ext: '.pdf' },
} as const

/** CRM e ALIX aplicam os mesmos limites, exportação e prova de pertencimento à pasta. */
export async function readDriveFileForImport(input: { actor: GoogleWorkspaceActor; clientId: string; fileId: string; signal?: AbortSignal }) {
  input.signal?.throwIfAborted()
  const drive = getGoogleDriveService()
  const file = await drive.getClientFile(input)
  if (!file) throw new Error('Arquivo não pertence à pasta vinculada do cliente.')
  const exportType = exportsByMime[file.mimeType as keyof typeof exportsByMime]
  const mimetype = exportType?.mime || file.mimeType
  if (!isMimeAllowed(mimetype)) throw new Error('Tipo de arquivo não suportado para leitura pela ALIX.')
  if (file.sizeBytes && (!/^\d+$/.test(file.sizeBytes) || BigInt(file.sizeBytes) > BigInt(MAX_DRIVE_IMPORT_BYTES))) {
    throw new Error('Arquivo excede o limite de 20 MB ou tem tamanho inválido.')
  }
  const buffer = await drive.downloadClientFile({ actor: input.actor, fileId: file.id, maxBytes: MAX_DRIVE_IMPORT_BYTES, signal: input.signal, exportMimeType: exportType?.mime })
  input.signal?.throwIfAborted()
  if (buffer.length > MAX_DRIVE_IMPORT_BYTES) throw new Error('Arquivo excede o limite de 20 MB para importação.')
  if (!buffer.length) throw new Error('O Google Drive retornou um arquivo vazio; a leitura não foi concluída.')
  // Revalida a ascendência e a revisão após o download para não atribuir bytes antigos a uma versão nova.
  const current = await drive.getClientFile(input)
  input.signal?.throwIfAborted()
  if (!current || driveRevisionKey(current) !== driveRevisionKey(file) || current.mimeType !== file.mimeType) {
    throw new Error('O arquivo foi alterado ou saiu da pasta do cliente durante a leitura. Tente novamente para ler a versão atual.')
  }
  if (!exportType && file.md5Checksum && createHash('md5').update(buffer).digest('hex') !== file.md5Checksum.toLowerCase()) {
    throw new Error('O conteúdo recebido não corresponde à integridade informada pelo Drive. Tente novamente.')
  }
  const verifiedAt = new Date().toISOString()
  return {
    file, buffer, mimetype,
    filename: exportType && !file.name.toLowerCase().endsWith(exportType.ext) ? `${file.name}${exportType.ext}` : file.name,
    source: {
      type: 'google_drive' as const, fileId: file.id, url: file.url, path: file.path,
      originalName: file.name, originalMimeType: file.mimeType, sizeBytes: file.sizeBytes,
      ...(exportType ? { exportMimeType: exportType.mime } : {}),
      modifiedAt: file.modifiedAt, importedAt: verifiedAt, verifiedAt,
      version: file.version || null, md5Checksum: file.md5Checksum || null,
      revisionKey: driveRevisionKey(file), contentSha256: createHash('sha256').update(buffer).digest('hex'),
      tenantId: input.actor.tenantId, requestedClienteId: input.clientId,
    },
  }
}
