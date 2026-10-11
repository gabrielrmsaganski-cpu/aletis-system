import { createHash } from 'node:crypto'
import type { DocumentSource } from '../alix/intake/types.js'
import type { GoogleWorkspaceActor } from './schemas.js'

export interface DriveRevision {
  id: string
  mimeType: string
  modifiedAt: string | null
  version?: string | null
  md5Checksum?: string | null
  sizeBytes?: string | null
}

/** A identidade do arquivo é separada da revisão e do conteúdo exportado. */
export function driveRevisionKey(file: DriveRevision): string | null {
  const revision = file.version || file.md5Checksum || file.modifiedAt
  if (!revision) return null
  return createHash('sha256').update(JSON.stringify([
    file.id, file.mimeType, file.version || null, file.md5Checksum || null, file.modifiedAt, file.sizeBytes || null,
  ])).digest('hex')
}

export function driveImportSessionId(actor: GoogleWorkspaceActor, clientId: string): string {
  return `alix_drive_${createHash('sha256').update(JSON.stringify([actor.tenantId, actor.userId, clientId])).digest('hex').slice(0, 48)}`
}

/** Mesmo arquivo/revisão/conteúdo no mesmo escopo reutiliza o documento, sem apagar versões anteriores. */
export function driveImportDocumentId(input: { actor: GoogleWorkspaceActor; clientId: string; sessionId: string; source: DocumentSource; buffer: Buffer }): string {
  const sha256 = createHash('sha256').update(input.buffer).digest('hex')
  return `drive_doc_${createHash('sha256').update(JSON.stringify([
    input.actor.tenantId, input.actor.userId, input.clientId, input.sessionId,
    input.source.fileId, input.source.revisionKey || input.source.modifiedAt, sha256,
  ])).digest('hex').slice(0, 48)}`
}
