// ============================================================
// ALETIS — ponte ALIX intake -> cofre digital do cliente
//
// Copia o arquivo original ingerido pela ALIX para portal_upload,
// mantendo idempotência por cliente + sha256.
// ============================================================

import { existsSync, mkdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID, createHash } from 'crypto'
import { and, eq } from 'drizzle-orm'

import { getDb, isPgEnabled } from '../../../db/client.js'
import { portalUpload } from '../../../db/schema.js'
import { registrarEvento } from '../../PortalStore.js'
import { getDocumentIntakeService } from './DocumentIntakeService.js'
import { getGoogleDriveService } from '../../google-workspace/drive.js'
import type { GoogleWorkspaceActor } from '../../google-workspace/schemas.js'

const ALLOWED_CATEGORIAS = new Set(['fiscal', 'contrato', 'identidade', 'patrimonio', 'agro', 'outros'])

export interface AttachAlixDocumentToClienteInput {
  sessionId?: string
  documentoId?: string
  clienteId: string
  clientName?: string
  categoria?: string
  enviadoPor?: 'cliente' | 'consultor'
  googleWorkspaceActor?: GoogleWorkspaceActor
  skipGoogleDriveSync?: boolean
}

export interface GoogleDriveSyncInfo {
  status: 'uploaded' | 'failed'
  fileId?: string
  url?: string
  subfolder: string
  syncedAt: string
  error?: string
}

export interface AttachedVaultDocument {
  ok: true
  id: string
  clienteId: string
  nomeOriginal: string
  nomeStorage: string
  mime: string
  tamanho: number
  sha256?: string
  categoria: string
  existing: boolean
  persisted: boolean
  googleDrive?: GoogleDriveSyncInfo
}

export interface AttachVaultSkipped {
  ok: false
  reason: string
}

function uploadDir(): string {
  const dir = process.env.ALETIS_PORTAL_UPLOAD_DIR || './storage/portal-uploads'
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function extFromName(filename: string): string {
  const ext = filename.includes('.') ? filename.split('.').pop() : ''
  return ext?.replace(/[^A-Za-z0-9]/g, '').toLowerCase() || 'bin'
}

function normalizeCategoria(value: unknown): string {
  const raw = String(value || 'outros').trim().toLowerCase()
  return ALLOWED_CATEGORIAS.has(raw) ? raw : 'outros'
}

function shouldSyncToGoogleDrive(): boolean {
  return process.env.GOOGLE_DRIVE_SYNC_ENABLED === 'true'
}

function googleDriveSubfolder(categoria: string): string {
  if (categoria === 'contrato') return 'Contratos'
  return categoria === 'outros' ? 'Anexos' : 'Documentos'
}

function systemGoogleWorkspaceActor(): GoogleWorkspaceActor {
  return { userId: 'aletis-alix', userName: 'ALIX', role: 'system', tenantId: 'default' }
}

async function findExistingUpload(clienteId: string, sha256: string): Promise<AttachedVaultDocument | null> {
  if (!isPgEnabled()) return null
  const rows = await getDb()
    .select()
    .from(portalUpload)
    .where(and(eq(portalUpload.clienteId, clienteId), eq(portalUpload.sha256, sha256)))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return {
    ok: true,
    id: row.id,
    clienteId: row.clienteId,
    nomeOriginal: row.nomeOriginal,
    nomeStorage: row.nomeStorage,
    mime: row.mime,
    tamanho: row.tamanho,
    sha256: row.sha256 ?? undefined,
    categoria: row.categoria ?? 'outros',
    existing: true,
    persisted: true,
  }
}

export async function attachAlixDocumentToCliente(
  input: AttachAlixDocumentToClienteInput,
): Promise<AttachedVaultDocument | AttachVaultSkipped> {
  const clienteId = input.clienteId?.trim()
  const sessionId = input.sessionId?.trim()
  const documentoId = input.documentoId?.trim()
  if (!clienteId) return { ok: false, reason: 'clienteId ausente' }
  if (!sessionId || !documentoId) return { ok: false, reason: 'documentoId/sessionId ausentes' }

  const intake = getDocumentIntakeService()
  const document = await intake.linkToCliente(sessionId, documentoId, clienteId)
  if (!document) return { ok: false, reason: 'documento não encontrado no intake ALIX' }
  const original = await intake.getOriginalFile(sessionId, documentoId)
  if (!original) return { ok: false, reason: 'arquivo original não encontrado no intake ALIX' }

  const sha256 = original.sha256 || createHash('sha256').update(original.buffer).digest('hex')
  const existing = await findExistingUpload(clienteId, sha256)
  if (existing) return existing

  const id = `up_${randomUUID()}`
  const nomeStorage = `${id}.${extFromName(original.filename)}`
  const categoria = normalizeCategoria(input.categoria)
  await writeFile(join(uploadDir(), nomeStorage), original.buffer)

  const enviadoEm = new Date()
  let metadata: Record<string, unknown> = {
    origem: 'alix-document-intake',
    alixDocumentId: documentoId,
    alixSessionId: sessionId,
    textoExtraidoChars: document.extractedText?.length ?? 0,
    resumoIa: String(document.metadata?.entitySummary || document.summary || '').trim() || undefined,
    resumoOrigem: document.metadata?.smartExtraction ? 'openai' : 'fallback',
    entitySummary: document.metadata?.entitySummary,
    suggestedActions: document.metadata?.suggestedActions,
    smartExtraction: document.metadata?.smartExtraction,
    smartExtractionClass: document.metadata?.smartExtractionClass,
    documentIndex: document.metadata?.documentIndex,
    source: document.metadata?.source,
    clientScopeReview: document.metadata?.clientScopeReview,
  }
  let googleDrive: GoogleDriveSyncInfo | undefined
  const clientName = input.clientName?.trim()
  if (shouldSyncToGoogleDrive() && !input.skipGoogleDriveSync && clientName) {
    const subfolder = googleDriveSubfolder(categoria)
    try {
      const uploaded = await getGoogleDriveService().uploadBufferToClientFolder({
        actor: input.googleWorkspaceActor || systemGoogleWorkspaceActor(),
        clientId: clienteId,
        clientName,
        filename: original.filename,
        mime: original.mimetype,
        buffer: original.buffer,
        subfolder,
      })
      googleDrive = {
        status: 'uploaded',
        fileId: uploaded.googleFileId,
        url: uploaded.url,
        subfolder,
        syncedAt: new Date().toISOString(),
      }
    } catch (error) {
      googleDrive = {
        status: 'failed',
        subfolder,
        syncedAt: new Date().toISOString(),
        error: String((error as Error).message || 'Falha desconhecida').slice(0, 280),
      }
    }
    metadata = { ...metadata, googleDrive }
  }

  const row = {
    id,
    clienteId,
    pendenciaId: null,
    nomeOriginal: original.filename,
    nomeStorage,
    mime: original.mimetype,
    tamanho: original.sizeBytes,
    sha256,
    categoria,
    enviadoPor: input.enviadoPor ?? 'consultor',
    enviadoEm,
    metadata,
  }

  let persisted = false
  if (isPgEnabled()) {
    await getDb().insert(portalUpload).values(row).onConflictDoNothing()
    persisted = true
  }

  registrarEvento({
    clienteId,
    tipo: 'documento_enviado',
    canal: 'consultor',
    detalhes: {
      origem: 'alix-document-intake',
      documentoId,
      uploadId: id,
      nomeOriginal: original.filename,
      categoria,
      sha256,
    },
  })

  return {
    ok: true,
    id,
    clienteId,
    nomeOriginal: original.filename,
    nomeStorage,
    mime: original.mimetype,
    tamanho: original.sizeBytes,
    sha256,
    categoria,
    existing: false,
    persisted,
    googleDrive,
  }
}
