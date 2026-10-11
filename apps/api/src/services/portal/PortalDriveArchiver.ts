import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Pool } from 'pg'
import { getPool } from '../../db/client.js'
import { getCorporateDriveCredentials } from '../google-workspace/CorporateDriveCredentials.js'
import { getGoogleDriveService, selectClientFolder } from '../google-workspace/drive.js'
import type { GoogleWorkspaceActor } from '../google-workspace/schemas.js'
import { PortalProcessingError, type PortalDriveState, type PortalProcessingUpload } from './PortalDocumentProcessingTypes.js'

const FILES = 'https://www.googleapis.com/drive/v3/files'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const sha = (text: string | Buffer) => createHash('sha256').update(text).digest('hex')
const escapeQuery = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const fileSchema = z.object({
  id: z.string().min(1), name: z.string(), mimeType: z.string(), trashed: z.boolean().optional(),
  parents: z.array(z.string()).default([]), appProperties: z.record(z.string()).default({}),
  size: z.string().optional(), md5Checksum: z.string().optional(), webViewLink: z.string().optional(),
})
type DriveFile = z.infer<typeof fileSchema>
const folderSchema = z.object({ rootId: z.string(), name: z.string() })
export type PortalCanonicalFolder = z.infer<typeof folderSchema>
export interface PortalFolderReservation { id: string; parentId: string; name: string }
export interface PortalDriveDependencies {
  request: (url: string, init?: RequestInit, missingAllowed?: boolean) => Promise<unknown>
  resolveFolder: (clienteId: string) => Promise<PortalCanonicalFolder>
  reserveFolder: (clienteId: string, rootId: string, proposed: PortalFolderReservation) => Promise<PortalFolderReservation>
}
const fields = 'id,name,mimeType,parents,trashed,appProperties,size,md5Checksum,webViewLink'

function driveUrl(url: string, list = false): URL {
  const target = new URL(url)
  target.searchParams.set('supportsAllDrives', 'true')
  if (list) {
    target.searchParams.set('includeItemsFromAllDrives', 'true')
    const shared = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID?.trim()
    if (shared) { target.searchParams.set('corpora', 'drive'); target.searchParams.set('driveId', shared) }
  }
  return target
}

/** Sempre usa a identidade corporativa persistida, inclusive após um restart.
 * Respostas remotas nunca são copiadas para o erro público ou para os logs. */
export async function corporateDriveRequest(url: string, init: RequestInit = {}, missingAllowed = false): Promise<unknown> {
  const credentials = getCorporateDriveCredentials()
  let token = await credentials.getAccessToken()
  for (let attempt = 0; attempt < 2; attempt++) {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    let response: Response
    try { response = await fetch(url, { ...init, headers, redirect: 'error', signal: AbortSignal.timeout(60_000) }) }
    catch { throw new PortalProcessingError('DRIVE_TEMPORARILY_UNAVAILABLE') }
    if (response.status === 401 && attempt === 0) {
      await response.body?.cancel().catch(() => undefined)
      token = await credentials.refreshAccessToken(token)
      continue
    }
    if (response.status === 404 && missingAllowed) { await response.body?.cancel().catch(() => undefined); return null }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      if (response.status === 401) credentials.invalidate(token)
      throw new PortalProcessingError(response.status === 401 ? 'AUTH_REQUIRED'
        : response.status === 403 ? 'PERMISSION_DENIED' : response.status === 409 ? 'DRIVE_ID_EXISTS'
          : response.status === 429 ? 'DRIVE_RATE_LIMIT' : 'DRIVE_TEMPORARILY_UNAVAILABLE')
    }
    return response.json()
  }
  throw new PortalProcessingError('AUTH_REQUIRED')
}

async function listFolders(request: PortalDriveDependencies['request'], parentId: string): Promise<DriveFile[]> {
  const rows: DriveFile[] = []
  const seen = new Set<string>()
  let pageToken: string | undefined
  for (let page = 0; page < 20; page++) {
    const url = driveUrl(FILES, true)
    url.searchParams.set('q', `'${escapeQuery(parentId)}' in parents and trashed=false and mimeType='${FOLDER_MIME}'`)
    url.searchParams.set('pageSize', '1000')
    url.searchParams.set('fields', `nextPageToken,files(${fields})`)
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const result = z.object({ files: z.array(fileSchema).default([]), nextPageToken: z.string().optional() }).parse(await request(url.toString()))
    rows.push(...result.files)
    if (!result.nextPageToken) return rows
    if (seen.has(result.nextPageToken)) throw new PortalProcessingError('DRIVE_FOLDER_SCAN_INCOMPLETE')
    seen.add(result.nextPageToken); pageToken = result.nextPageToken
  }
  throw new PortalProcessingError('DRIVE_FOLDER_SCAN_INCOMPLETE')
}

/** Os nomes vêm do padrão Documentos/Contratos/Anexos já usado no sistema.
 * Pastas anteriores numeradas ou com nomes equivalentes são aproveitadas. */
export function portalDriveCategory(category?: string | null): { direct: string[]; base: string; leaf?: string } {
  if (category === 'contrato') return { direct: ['contratos', 'endividamentos'], base: 'Contratos' }
  if (category === 'identidade') return { direct: ['pessoais', 'cadastrais', 'identidade'], base: 'Documentos', leaf: 'Documentos pessoais' }
  if (category === 'fiscal') return { direct: ['fiscal', 'fiscais'], base: 'Documentos', leaf: 'Documentos fiscais' }
  if (category === 'patrimonio') return { direct: ['patrimonio', 'patrimoniais', 'imoveis'], base: 'Documentos', leaf: 'Patrimônio' }
  if (category === 'agro') return { direct: ['agro', 'rurais', 'atividade rural'], base: 'Documentos', leaf: 'Atividade rural' }
  return { direct: ['anexos'], base: 'Anexos' }
}

function chooseFolder(files: DriveFile[], names: string[], exactOnly = false): DriveFile | null {
  const exact = files.filter(file => names.some(name => normalized(file.name).replace(/^\d+\s*/, '') === normalized(name)))
  const matching = exact.length || exactOnly ? exact : files.filter(file => names.some(name => (` ${normalized(file.name)} `).includes(` ${normalized(name)} `)))
  if (matching.length > 1) throw new PortalProcessingError('DRIVE_FOLDER_AMBIGUOUS')
  return matching[0] || null
}

/** A reserva compartilhada no vínculo do cliente fecha a janela em que dois
 * uploads poderiam criar a mesma subpasta após um timeout do Google. */
export async function reservePortalDriveFolder(clienteId: string, rootId: string, proposed: PortalFolderReservation,
  options?: { pool: Pick<Pool, 'connect'>; tenantId: string }): Promise<PortalFolderReservation> {
  const tenant = options?.tenantId || process.env.ALETIS_TENANT_ID || 'default'
  const key = sha(`${proposed.parentId}:${normalized(proposed.name)}`)
  const client = await (options?.pool || getPool()).connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(`select metadata from client_google_drive_folder where tenant_id=$1 and client_id=$2 and google_folder_id=$3 for update`, [tenant, clienteId, rootId])
    if (!result.rowCount) throw new PortalProcessingError('DRIVE_BINDING_CHANGED')
    const metadata = z.record(z.unknown()).parse(result.rows[0].metadata || {})
    const reservations = z.record(z.object({ id: z.string(), parentId: z.string(), name: z.string() })).parse(metadata.portalArchiveFolders || {})
    const saved = reservations[key] || proposed
    if (saved.parentId !== proposed.parentId || normalized(saved.name) !== normalized(proposed.name)) throw new PortalProcessingError('DRIVE_RESERVATION_INVALID', false)
    if (!reservations[key]) await client.query(`update client_google_drive_folder set metadata=$4::jsonb,updated_at=now()
      where tenant_id=$1 and client_id=$2 and google_folder_id=$3`, [tenant, clienteId, rootId, JSON.stringify({ ...metadata, portalArchiveFolders: { ...reservations, [key]: saved } })])
    await client.query('COMMIT')
    return saved
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error }
  finally { client.release() }
}

const resolvedFolders = new Map<string, PortalCanonicalFolder>()
async function resolvePgFolder(clienteId: string): Promise<PortalCanonicalFolder> {
  const tenant = process.env.ALETIS_TENANT_ID || 'default'
  const actor: GoogleWorkspaceActor = { userId: 'aletis-portal-worker', userName: 'ALIX · Portal', role: 'system', tenantId: tenant }
  const service = getGoogleDriveService()
  const existing = await service.getClientFolder(actor, clienteId)
  if (existing) return { rootId: existing.googleFolderId, name: existing.folderName }
  const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim() || process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID?.trim()
  if (!root) throw new PortalProcessingError('DRIVE_FOLDER_UNLINKED')
  const client = await getPool().query('select nome from cliente where id=$1', [clienteId])
  if (!client.rowCount) throw new PortalProcessingError('UPLOAD_CLIENT_NOT_FOUND', false)
  const folders = await listFolders(corporateDriveRequest, root)
  let match: DriveFile | null
  try { match = selectClientFolder(folders, String(client.rows[0].nome)) }
  catch { throw new PortalProcessingError('DRIVE_FOLDER_AMBIGUOUS') }
  if (!match) throw new PortalProcessingError('DRIVE_FOLDER_UNLINKED')
  // Vincula somente uma raiz existente comprovada. Não cria um segundo GRUPO.
  const result = await getPool().query(`insert into client_google_drive_folder
    (id,tenant_id,client_id,google_folder_id,folder_url,folder_name,subfolders,created_by,metadata)
    values ($1,$2,$3,$4,$5,$6,'{}'::jsonb,$7,$8::jsonb)
    on conflict(tenant_id,client_id) do nothing returning google_folder_id,folder_name`,
  [`gdf_${randomUUID()}`, tenant, clienteId, match.id, `https://drive.google.com/drive/folders/${encodeURIComponent(match.id)}`, match.name,
    actor.userId, JSON.stringify({ source: 'portal_existing_folder', rootFolderId: root })])
  const linked = result.rows[0] || (await getPool().query('select google_folder_id,folder_name from client_google_drive_folder where tenant_id=$1 and client_id=$2', [tenant, clienteId])).rows[0]
  if (!linked) throw new PortalProcessingError('DRIVE_FOLDER_UNLINKED')
  const value = { rootId: String(linked.google_folder_id), name: String(linked.folder_name) }
  resolvedFolders.set(`${tenant}:${clienteId}`, value)
  return value
}

export class PortalDriveArchiver {
  private readonly deps: PortalDriveDependencies
  constructor(overrides: Partial<PortalDriveDependencies> = {}) {
    this.deps = { request: corporateDriveRequest, resolveFolder: resolvePgFolder, reserveFolder: reservePortalDriveFolder, ...overrides }
  }

  private async get(id: string): Promise<DriveFile | null> {
    const url = driveUrl(`${FILES}/${encodeURIComponent(id)}`); url.searchParams.set('fields', fields)
    const data = await this.deps.request(url.toString(), {}, true)
    return data === null ? null : fileSchema.parse(data)
  }
  private async generateId(): Promise<string> {
    const url = new URL(`${FILES}/generateIds`); url.searchParams.set('count', '1'); url.searchParams.set('space', 'drive')
    const result = z.object({ ids: z.array(z.string().min(1)).length(1) }).parse(await this.deps.request(url.toString()))
    return result.ids[0]
  }
  private validateFolder(file: DriveFile, parentId?: string): void {
    if (file.trashed || file.mimeType !== FOLDER_MIME || (parentId && !file.parents.includes(parentId))) throw new PortalProcessingError('DRIVE_FOLDER_INVALID')
  }

  private async ensureFolder(upload: PortalProcessingUpload, rootId: string, parentId: string, name: string, aliases: string[] = [name], exactOnly = false): Promise<DriveFile> {
    const existing = chooseFolder(await listFolders(this.deps.request, parentId), aliases, exactOnly)
    if (existing) { this.validateFolder(existing, parentId); return existing }
    const reservation = await this.deps.reserveFolder(upload.clienteId, rootId, { id: await this.generateId(), parentId, name })
    let file = await this.get(reservation.id)
    if (!file) {
      const url = driveUrl(FILES); url.searchParams.set('fields', fields)
      try {
        file = fileSchema.parse(await this.deps.request(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          id: reservation.id, name: reservation.name, parents: [parentId], mimeType: FOLDER_MIME,
          appProperties: { aletisPortalFolder: sha(`${upload.clienteId}:${parentId}:${normalized(name)}`) },
        }) }))
      } catch (error) { file = await this.get(reservation.id).catch(() => null); if (!file) throw error }
    }
    this.validateFolder(file, parentId)
    if (normalized(file.name) !== normalized(name)) throw new PortalProcessingError('DRIVE_RESERVATION_INVALID', false)
    return file
  }

  async archive(upload: PortalProcessingUpload, buffer: Buffer, previous: PortalDriveState, checkpoint: (state: PortalDriveState) => Promise<void>): Promise<PortalDriveState> {
    if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(upload.mime)) throw new PortalProcessingError('UPLOAD_MIME_INVALID', false)
    const canonical = folderSchema.parse(await this.deps.resolveFolder(upload.clienteId))
    const root = await this.get(canonical.rootId)
    if (!root) throw new PortalProcessingError('DRIVE_FOLDER_UNAVAILABLE')
    this.validateFolder(root)
    if (previous.rootId && previous.rootId !== canonical.rootId) throw new PortalProcessingError('DRIVE_BINDING_CHANGED')
    const hash = sha(buffer)
    if (hash !== upload.sha256 || (previous.sha256 && previous.sha256 !== hash)) throw new PortalProcessingError('UPLOAD_HASH_MISMATCH', false)
    const category = portalDriveCategory(upload.categoria)
    const children = await listFolders(this.deps.request, canonical.rootId)
    let folder = chooseFolder(children, category.direct)
    if (folder) this.validateFolder(folder, canonical.rootId)
    if (!folder) {
      const base = await this.ensureFolder(upload, canonical.rootId, canonical.rootId, category.base, [category.base], true)
      folder = category.leaf ? await this.ensureFolder(upload, canonical.rootId, base.id, category.leaf, category.direct) : base
    }
    if (previous.folderId && previous.folderId !== folder.id) throw new PortalProcessingError('DRIVE_DESTINATION_CHANGED')
    const id = previous.fileId || await this.generateId()
    const state: PortalDriveState = { ...previous, status: 'processing', fileId: id, rootId: canonical.rootId,
      folderId: folder.id, folderName: `${canonical.name} / ${folder.name}`, sha256: hash, errorCode: undefined, nextAttemptAt: undefined, updatedAt: new Date().toISOString() }
    // A reserva é confirmada antes do POST. Uma queda depois do envio recupera o mesmo ID.
    await checkpoint(state)
    const properties = { aletisPortalUpload: sha(upload.id), aletisClient: sha(upload.clienteId), aletisSha256: hash }
    let stored = await this.get(id)
    if (!stored) {
      const boundary = `aletis_portal_${randomUUID()}`
      const name = upload.nomeOriginal.replace(/[\u0000-\u001f\\/]/g, ' ').trim().slice(0, 220) || 'Documento do portal'
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ id, name, parents: [folder.id], appProperties: properties })}\r\n--${boundary}\r\nContent-Type: ${upload.mime}\r\n\r\n`),
        buffer, Buffer.from(`\r\n--${boundary}--\r\n`),
      ])
      const url = driveUrl('https://www.googleapis.com/upload/drive/v3/files'); url.searchParams.set('uploadType', 'multipart'); url.searchParams.set('fields', fields)
      try { stored = fileSchema.parse(await this.deps.request(url.toString(), { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })) }
      catch (error) { stored = await this.get(id).catch(() => null); if (!stored) throw error }
    }
    const md5 = createHash('md5').update(buffer).digest('hex')
    if (stored.id !== id || stored.trashed || !stored.parents.includes(folder.id)
      || Object.entries(properties).some(([key, value]) => stored!.appProperties[key] !== value)
      || stored.size !== String(buffer.byteLength) || stored.md5Checksum !== md5) throw new PortalProcessingError('DRIVE_ARCHIVE_INTEGRITY_MISMATCH', false)
    const archived: PortalDriveState = { ...state, status: 'archived', url: `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`, archivedAt: new Date().toISOString() }
    await checkpoint(archived)
    return archived
  }
}
