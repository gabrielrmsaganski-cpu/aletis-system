import { createHash, randomUUID } from 'crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, isPgEnabled } from '../../db/client.js'
import { clientGoogleDriveFolder, type ClientGoogleDriveFolder } from '../../db/schema.js'
import { getClientCoreService } from '../core/ClientCoreService.js'
import type { GoogleWorkspaceActor } from './schemas.js'
import { DRIVE_SUBFOLDERS, GOOGLE_SCOPES, googleFileUrl, googleFolderUrl } from './schemas.js'
import { getGoogleWorkspaceAuditService } from './audit.js'
import { getGoogleWorkspaceClient } from './client.js'
import { advanceDriveInventory, driveInventorySchema, startDriveInventory, type DriveInventoryState } from './DriveInventory.js'

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink'
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
const DRIVE_LIST_MAX_FOLDERS = Math.max(10, Math.min(1_000, Number(process.env.GOOGLE_DRIVE_LIST_MAX_FOLDERS || 200)))
const DRIVE_LIST_MAX_DURATION_MS = Math.max(1_000, Number(process.env.GOOGLE_DRIVE_LIST_MAX_DURATION_MS || 15_000))

const memoryFolders = new Map<string, ClientGoogleDriveFolder>()
const folderRequestsInFlight = new Map<string, Promise<ReturnType<typeof toPublic> & { createdNow: boolean }>>()
const inventoryRequestsInFlight = new Map<string, Promise<GoogleDriveClientFileList>>()
const DRIVE_INVENTORY_TTL_MS = 5 * 60_000
const drivePageSchema = z.object({
  nextPageToken: z.string().optional(),
  files: z.array(z.object({
    id: z.string().min(1), name: z.string(), mimeType: z.string(), size: z.string().optional(),
    modifiedTime: z.string().optional(), webViewLink: z.string().optional(),
    version: z.string().optional(), md5Checksum: z.string().optional(),
    shortcutDetails: z.object({ targetId: z.string().optional() }).optional(),
  })).default([]),
})

function key(tenantId: string, clientId: string): string {
  return `${tenantId}:${clientId}`
}

function safeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) || 'Cliente ALETIS'
}

function normalizedName(value: string): string {
  return safeName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function clientFolderName(clientName: string): string {
  const normalized = normalizedName(clientName)
  return normalized.startsWith('GRUPO ') ? normalized : `GRUPO ${normalized}`
}

function meaningfulTokens(value: string): string[] {
  return normalizedName(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !['GRUPO', 'TEX', 'BPO', 'ALETIS', 'CLIENTE', 'CLIENTES'].includes(token))
}

function exactClientFolderMatch(folderName: string, clientName: string): boolean {
  const candidate = normalizedName(folderName)
  const expected = clientFolderName(clientName)
  return candidate === expected || candidate.startsWith(`${expected} `)
}

export function selectClientFolder<T extends { name: string }>(folders: T[], clientName: string): T | null {
  const exact = folders.filter((folder) => exactClientFolderMatch(folder.name, clientName))
  if (exact.length > 1) throw new Error('Há mais de uma pasta compatível com este cliente. Revise o vínculo antes de criar ou enviar documentos.')
  if (exact.length === 1) return exact[0]
  const clientTokens = meaningfulTokens(clientName)
  // Um sobrenome isolado não comprova identidade de cliente ou grupo econômico.
  if (clientTokens.length < 2) return null
  const candidates = folders.filter(folder => {
    const tokens = new Set(meaningfulTokens(folder.name))
    return clientTokens.every(token => tokens.has(token))
  })
  if (candidates.length > 1) throw new Error('Há mais de uma pasta compatível com este cliente. Revise o vínculo antes de criar ou enviar documentos.')
  return candidates[0] || null
}

function sharedDriveId(): string | null {
  return process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID?.trim() || null
}

function rootFolderId(): string | null {
  return process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim() || sharedDriveId()
}

function withDriveContext(url: string, includeItems = false): string {
  const driveId = sharedDriveId()
  if (!driveId) return url
  const target = new URL(url)
  target.searchParams.set('supportsAllDrives', 'true')
  if (includeItems) {
    target.searchParams.set('includeItemsFromAllDrives', 'true')
    target.searchParams.set('corpora', 'drive')
    target.searchParams.set('driveId', driveId)
  }
  return target.toString()
}

function escapeDriveQuery(value: string): string {
  return value.replace(/'/g, "\\'")
}

function subfolderMap(files: Array<{ id: string; name: string; webViewLink?: string }>): Record<string, { id: string; url: string; name: string }> {
  return Object.fromEntries(files.map((file) => [
    file.name,
    { id: file.id, url: file.webViewLink || googleFolderUrl(file.id), name: file.name },
  ]))
}

function resolveSubfolderId(
  subfolders: Record<string, { id: string }>,
  requested?: string,
): string | null {
  if (!requested) return null
  if (subfolders[requested]?.id) return subfolders[requested].id
  const requestedName = normalizedName(requested)
  const aliases: Record<string, string[]> = {
    DOCUMENTOS: ['DOCUMENTOS', 'PESSOAIS', 'CADASTRAIS'],
    CONTRATOS: ['CONTRATOS', 'ENDIVIDAMENTOS'],
    PROPOSTAS: ['PROPOSTAS', 'NEGOCIACAO'],
    RELATORIOS: ['RELATORIOS', 'ALETIS'],
    ANEXOS: ['ANEXOS', 'COMPROVANTES'],
  }
  const terms = aliases[requestedName] || [requestedName]
  const candidate = Object.entries(subfolders).find(([name]) => {
    const normalized = normalizedName(name)
    return terms.some((term) => normalized.includes(term))
  })
  return candidate?.[1].id || null
}

function toPublic(row: ClientGoogleDriveFolder) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    clientId: row.clientId,
    googleFolderId: row.googleFolderId,
    folderUrl: row.folderUrl,
    folderName: row.folderName,
    subfolders: row.subfolders || {},
    createdBy: row.createdBy,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  }
}

export interface GoogleDriveClientFile {
  id: string
  name: string
  mimeType: string
  sizeBytes: string | null
  modifiedAt: string | null
  url: string
  path: string
  version?: string | null
  md5Checksum?: string | null
  shortcutTargetId?: string | null
}

export interface GoogleDriveClientFileList {
  files: GoogleDriveClientFile[]
  truncated: boolean
  status: 'complete' | 'scanning' | 'paused' | 'unlinked'
  scanId?: string
  updatedAt?: string
  completedAt?: string | null
  pendingFolders?: number
  pagesRead?: number
  cached?: boolean
  error?: string | null
}

async function saveFolder(row: ClientGoogleDriveFolder): Promise<ClientGoogleDriveFolder> {
  if (isPgEnabled()) {
      const [saved] = await getDb()
        .insert(clientGoogleDriveFolder)
        .values(row as any)
        .onConflictDoUpdate({
          target: [clientGoogleDriveFolder.tenantId, clientGoogleDriveFolder.clientId],
          set: {
            googleFolderId: row.googleFolderId,
            folderUrl: row.folderUrl,
            folderName: row.folderName,
            subfolders: row.subfolders,
            updatedAt: new Date(),
            metadata: row.metadata,
          } as any,
        })
        .returning()
      if (!saved) throw new Error('O vínculo com o Drive não foi persistido. Tente novamente.')
      memoryFolders.set(key(saved.tenantId, saved.clientId), saved)
      return saved
  }
  memoryFolders.set(key(row.tenantId, row.clientId), row)
  return row
}

export class GoogleDriveService {
  private inventoryPath(actor: GoogleWorkspaceActor, clientId: string): string {
    const name = createHash('sha256').update(key(actor.tenantId, clientId)).digest('hex')
    return join(process.env.GOOGLE_DRIVE_INVENTORY_DIR || join(process.cwd(), 'storage', 'google-drive-inventory'), `${name}.json`)
  }

  private async loadInventory(actor: GoogleWorkspaceActor, clientId: string): Promise<DriveInventoryState | null> {
    if (isPgEnabled()) {
      const [row] = await getDb().select({ metadata: clientGoogleDriveFolder.metadata }).from(clientGoogleDriveFolder)
        .where(and(eq(clientGoogleDriveFolder.tenantId, actor.tenantId), eq(clientGoogleDriveFolder.clientId, clientId))).limit(1)
      const metadata = row?.metadata as Record<string, unknown> | undefined
      const parsed = driveInventorySchema.safeParse(metadata?.inventory)
      // PostgreSQL é a fonte de verdade; cache de disco não ressuscita um vínculo/inventário removido.
      return parsed.success ? parsed.data : null
    }
    try {
      return driveInventorySchema.parse(JSON.parse(await readFile(this.inventoryPath(actor, clientId), 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError || error instanceof z.ZodError) return null
      throw error
    }
  }

  private async saveInventory(actor: GoogleWorkspaceActor, clientId: string, value: DriveInventoryState): Promise<void> {
    const state = driveInventorySchema.parse(value)
    if (isPgEnabled()) {
      const saved = await getDb().update(clientGoogleDriveFolder).set({
        metadata: sql`jsonb_set(coalesce(${clientGoogleDriveFolder.metadata}, '{}'::jsonb), '{inventory}', ${JSON.stringify(state)}::jsonb)`,
      }).where(and(eq(clientGoogleDriveFolder.tenantId, actor.tenantId), eq(clientGoogleDriveFolder.clientId, clientId), eq(clientGoogleDriveFolder.googleFolderId, state.rootFolderId))).returning({ id: clientGoogleDriveFolder.id })
      if (!saved.length) throw new Error('O vínculo do cliente com o Drive mudou durante o inventário. Atualize a ficha antes de continuar.')
    }
    const folder = memoryFolders.get(key(actor.tenantId, clientId))
    if (folder) memoryFolders.set(key(actor.tenantId, clientId), { ...folder, metadata: { ...(folder.metadata as Record<string, unknown> || {}), inventory: state } })
    const path = this.inventoryPath(actor, clientId)
    const temp = `${path}.${randomUUID()}.tmp`
    await mkdir(join(path, '..'), { recursive: true })
    try {
      await writeFile(temp, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 })
      await rename(temp, path)
    } finally {
      await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error })
    }
  }

  async getClientFolder(actor: GoogleWorkspaceActor, clientId: string): Promise<ReturnType<typeof toPublic> | null> {
    if (isPgEnabled()) {
        const rows = await getDb()
          .select()
          .from(clientGoogleDriveFolder)
          .where(and(eq(clientGoogleDriveFolder.tenantId, actor.tenantId), eq(clientGoogleDriveFolder.clientId, clientId)))
          .limit(1)
        return rows[0] ? toPublic(rows[0]) : null
    }
    const row = memoryFolders.get(key(actor.tenantId, clientId))
    return row ? toPublic(row) : null
  }

  async createClientFolder(input: {
    actor: GoogleWorkspaceActor
    clientId: string
    clientName: string
  }): Promise<ReturnType<typeof toPublic> & { createdNow: boolean }> {
    const requestKey = key(input.actor.tenantId, input.clientId)
    const pending = folderRequestsInFlight.get(requestKey)
    if (pending) return pending
    const request = this.createClientFolderUnlocked(input).finally(() => {
      folderRequestsInFlight.delete(requestKey)
    })
    folderRequestsInFlight.set(requestKey, request)
    return request
  }

  private async createClientFolderUnlocked(input: {
    actor: GoogleWorkspaceActor
    clientId: string
    clientName: string
  }): Promise<ReturnType<typeof toPublic> & { createdNow: boolean }> {
    const existing = await this.getClientFolder(input.actor, input.clientId)
    if (existing) return { ...existing, createdNow: false }

    const existingDriveFolder = await this.findExistingDriveFolder(input.actor, input.clientName)
    if (existingDriveFolder) {
      const row = await saveFolder({
        id: `gdf_${randomUUID()}`,
        tenantId: input.actor.tenantId,
        clientId: input.clientId,
        googleFolderId: existingDriveFolder.id,
        folderUrl: existingDriveFolder.webViewLink || googleFolderUrl(existingDriveFolder.id),
        folderName: existingDriveFolder.name,
        subfolders: subfolderMap(existingDriveFolder.subfolders),
        createdBy: input.actor.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          rootFolderId: rootFolderId(),
          sharedDriveId: sharedDriveId(),
          source: 'existing_google_drive',
        },
      } as ClientGoogleDriveFolder)
      await getGoogleWorkspaceAuditService().record({
        actor: input.actor,
        action: 'drive_client_folder_linked',
        resourceType: 'cliente',
        resourceId: input.clientId,
        googleResourceId: existingDriveFolder.id,
        metadata: { folderName: existingDriveFolder.name, source: 'existing_google_drive' },
      })
      return { ...toPublic(row), createdNow: false }
    }

    const parentFolderId = rootFolderId()
    const folderName = clientFolderName(input.clientName)
    const client = getGoogleWorkspaceClient()
    const parentFolder = await client.googleFetch<{ id: string; webViewLink?: string }>(
      input.actor,
      withDriveContext(`${DRIVE_FILES_URL}?fields=id,webViewLink`),
      {
        method: 'POST',
        body: JSON.stringify({
          name: folderName,
          mimeType: FOLDER_MIME_TYPE,
          ...(parentFolderId ? { parents: [parentFolderId] } : {}),
        }),
      },
      GOOGLE_SCOPES.driveFile,
    )

    const subfolders: Record<string, { id: string; url: string; name: string }> = {}
    for (const name of DRIVE_SUBFOLDERS) {
      const folder = await client.googleFetch<{ id: string; webViewLink?: string }>(
        input.actor,
        withDriveContext(`${DRIVE_FILES_URL}?fields=id,webViewLink`),
        {
          method: 'POST',
          body: JSON.stringify({
            name,
            mimeType: FOLDER_MIME_TYPE,
            parents: [parentFolder.id],
          }),
        },
        GOOGLE_SCOPES.driveFile,
      )
      subfolders[name] = { id: folder.id, url: folder.webViewLink || googleFolderUrl(folder.id), name }
    }

    const row = await saveFolder({
      id: `gdf_${randomUUID()}`,
      tenantId: input.actor.tenantId,
      clientId: input.clientId,
      googleFolderId: parentFolder.id,
      folderUrl: parentFolder.webViewLink || googleFolderUrl(parentFolder.id),
      folderName,
      subfolders,
      createdBy: input.actor.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: { rootFolderId: parentFolderId, sharedDriveId: sharedDriveId(), source: 'aletis_created' },
    } as ClientGoogleDriveFolder)

    await getGoogleWorkspaceAuditService().record({
      actor: input.actor,
      action: 'drive_client_folder_created',
      resourceType: 'cliente',
      resourceId: input.clientId,
      googleResourceId: parentFolder.id,
      metadata: { folderName, subfolders: Object.keys(subfolders) },
    })
    await getClientCoreService().addTimelineEvent(input.clientId, {
      eventType: 'google_drive_folder_created',
      title: 'Pasta do Google Drive criada',
      description: `Pasta "${folderName}" criada e vinculada ao cliente.`,
      source: 'google_workspace',
      sourceId: parentFolder.id,
      metadata: { folderUrl: row.folderUrl, subfolders },
    }, input.actor.userId)

    return { ...toPublic(row), createdNow: true }
  }

  private async findExistingDriveFolder(actor: GoogleWorkspaceActor, clientName: string): Promise<{
    id: string
    name: string
    webViewLink?: string
    subfolders: Array<{ id: string; name: string; webViewLink?: string }>
  } | null> {
    const parentFolderId = rootFolderId()
    if (!parentFolderId) return null
    const listed = await this.listFolderChildren(actor, parentFolderId)
    const folder = selectClientFolder(listed, clientName)
    if (!folder) return null
    return { ...folder, subfolders: await this.listFolderChildren(actor, folder.id) }
  }

  private async listFolderChildren(actor: GoogleWorkspaceActor, parentId: string): Promise<Array<{ id: string; name: string; webViewLink?: string }>> {
    const schema = z.object({ nextPageToken: z.string().optional(), files: z.array(z.object({ id: z.string(), name: z.string(), webViewLink: z.string().optional() })).default([]) })
    const files = new Map<string, { id: string; name: string; webViewLink?: string }>()
    const tokens = new Set<string>()
    const signal = AbortSignal.timeout(DRIVE_LIST_MAX_DURATION_MS)
    let pageToken: string | undefined
    for (let page = 0; page < 50; page++) {
      const url = new URL(DRIVE_FILES_URL)
      url.searchParams.set('q', `'${escapeDriveQuery(parentId)}' in parents and trashed = false and mimeType = '${FOLDER_MIME_TYPE}'`)
      url.searchParams.set('pageSize', '1000')
      url.searchParams.set('fields', 'nextPageToken,files(id,name,webViewLink)')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const result = schema.parse(await getGoogleWorkspaceClient().googleFetch(actor, withDriveContext(url.toString(), true), { signal }, GOOGLE_SCOPES.driveFile))
      for (const file of result.files) files.set(file.id, file)
      if (!result.nextPageToken) return [...files.values()]
      if (tokens.has(result.nextPageToken)) throw new Error('O Drive repetiu uma página. A busca de pastas não foi concluída.')
      tokens.add(result.nextPageToken)
      pageToken = result.nextPageToken
    }
    throw new Error('A busca de pastas não foi concluída no limite desta operação. Nenhuma nova pasta foi criada.')
  }

  async uploadBufferToClientFolder(input: {
    actor: GoogleWorkspaceActor
    clientId: string
    clientName: string
    filename: string
    mime: string
    buffer: Buffer
    subfolder?: string
  }): Promise<{ googleFileId: string; name: string; url: string; mimeType?: string }> {
    const folder = await this.createClientFolder({
      actor: input.actor,
      clientId: input.clientId,
      clientName: input.clientName,
    })
    const subfolders = folder.subfolders as Record<string, { id: string }>
    const parentId = resolveSubfolderId(subfolders, input.subfolder) || folder.googleFolderId

    const boundary = `aletis_${randomUUID()}`
    const metadata = JSON.stringify({
      name: input.filename,
      parents: [parentId],
      mimeType: input.mime,
    })
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: ${input.mime}\r\n\r\n`),
      input.buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    const uploaded = await getGoogleWorkspaceClient().googleFetch<{ id: string; name: string; webViewLink?: string; mimeType?: string }>(
      input.actor,
      withDriveContext(DRIVE_UPLOAD_URL),
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      },
      GOOGLE_SCOPES.driveFile,
    )
    const url = uploaded.webViewLink || googleFileUrl(uploaded.id)
    await getGoogleWorkspaceAuditService().record({
      actor: input.actor,
      action: 'drive_file_uploaded',
      resourceType: 'cliente',
      resourceId: input.clientId,
      googleResourceId: uploaded.id,
      metadata: { filename: input.filename, subfolder: input.subfolder || null },
    })
    await getClientCoreService().addTimelineEvent(input.clientId, {
      eventType: 'google_drive_file_uploaded',
      title: 'Arquivo enviado ao Google Drive',
      description: input.filename,
      source: 'google_workspace',
      sourceId: uploaded.id,
      metadata: { url },
    }, input.actor.userId)
    return { googleFileId: uploaded.id, name: uploaded.name, url, mimeType: uploaded.mimeType }
  }

  async listClientFiles(input: {
    actor: GoogleWorkspaceActor
    clientId: string
    limit?: number
    refresh?: boolean
  }): Promise<GoogleDriveClientFileList> {
    const requestKey = key(input.actor.tenantId, input.clientId)
    const pending = inventoryRequestsInFlight.get(requestKey)
    if (pending) return pending
    const request = this.advanceClientInventory(input).finally(() => inventoryRequestsInFlight.delete(requestKey))
    inventoryRequestsInFlight.set(requestKey, request)
    return request
  }

  private async advanceClientInventory(input: {
    actor: GoogleWorkspaceActor; clientId: string; limit?: number; refresh?: boolean
  }): Promise<GoogleDriveClientFileList> {
    const folder = await this.getClientFolder(input.actor, input.clientId)
    if (!folder) return { files: [], truncated: false, status: 'unlinked' }
    let state = await this.loadInventory(input.actor, input.clientId)
    const fresh = state?.completedAt && Date.now() - Date.parse(state.completedAt) < DRIVE_INVENTORY_TTL_MS
    const cached = Boolean(state && fresh && !input.refresh && state.rootFolderId === folder.googleFolderId)
    if (!state || state.rootFolderId !== folder.googleFolderId || input.refresh || (state.completedAt && !fresh)) {
      state = startDriveInventory(folder.googleFolderId)
    }
    if (!cached) {
      state = await advanceDriveInventory({
        state, maxFiles: Math.min(Math.max(input.limit || 500, 1), 2_000),
        maxPages: Math.min(DRIVE_LIST_MAX_FOLDERS, 20), durationMs: DRIVE_LIST_MAX_DURATION_MS,
        save: value => this.saveInventory(input.actor, input.clientId, value),
        fetchPage: async (folderId, pageToken, pageSize, signal) => {
          const url = new URL(DRIVE_FILES_URL)
          url.searchParams.set('q', `'${escapeDriveQuery(folderId)}' in parents and trashed = false`)
          url.searchParams.set('pageSize', String(pageSize))
          url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,version,md5Checksum,shortcutDetails(targetId))')
          if (pageToken) url.searchParams.set('pageToken', pageToken)
          return drivePageSchema.parse(await getGoogleWorkspaceClient().googleFetch(
            input.actor, withDriveContext(url.toString(), true), { signal }, GOOGLE_SCOPES.driveFile,
          ))
        },
      })
    }
    return {
      files: [...state.files].sort((left, right) => right.modifiedAt?.localeCompare(left.modifiedAt || '') || left.name.localeCompare(right.name, 'pt-BR')),
      truncated: !state.completedAt, status: state.completedAt ? 'complete' : state.lastError ? 'paused' : 'scanning',
      scanId: state.scanId, updatedAt: state.updatedAt, completedAt: state.completedAt,
      pendingFolders: state.pending.length, pagesRead: state.pagesRead, cached, error: state.lastError,
    }
  }

  /** Consulta o arquivo escolhido e sua ascendência; não depende de uma varredura parcial. */
  async getClientFile(input: { actor: GoogleWorkspaceActor; clientId: string; fileId: string; signal?: AbortSignal }): Promise<GoogleDriveClientFile | null> {
    input.signal?.throwIfAborted()
    const root = await this.getClientFolder(input.actor, input.clientId)
    if (!root) return null
    const metadataSchema = z.object({
      id: z.string(), name: z.string(), mimeType: z.string(), parents: z.array(z.string()).default([]),
      size: z.string().optional(), modifiedTime: z.string().optional(), webViewLink: z.string().optional(),
      trashed: z.boolean().optional(),
      version: z.string().optional(), md5Checksum: z.string().optional(),
    })
    const getMetadata = async (id: string) => metadataSchema.parse(await getGoogleWorkspaceClient().googleFetch(
      input.actor, withDriveContext(`${DRIVE_FILES_URL}/${encodeURIComponent(id)}?fields=id,name,mimeType,parents,size,modifiedTime,webViewLink,trashed,version,md5Checksum`),
      { signal: input.signal }, GOOGLE_SCOPES.driveFile,
    ))
    const file = await getMetadata(input.fileId)
    if (file.trashed || file.mimeType === FOLDER_MIME_TYPE) return null
    const pending = file.parents.map(id => ({ id, names: [] as string[] }))
    const visited = new Set<string>()
    while (pending.length) {
      input.signal?.throwIfAborted()
      const current = pending.shift()!
      if (current.id === root.googleFolderId) return {
        id: file.id, name: file.name, mimeType: file.mimeType, sizeBytes: file.size || null,
        modifiedAt: file.modifiedTime || null, url: file.webViewLink || googleFileUrl(file.id),
        path: [...current.names].reverse().join('/'),
        version: file.version || null, md5Checksum: file.md5Checksum || null,
      }
      if (visited.has(current.id)) continue
      if (visited.size >= 100) throw new Error('A estrutura de pastas excedeu o limite de leitura. Tente importar uma pasta mais próxima do cliente.')
      visited.add(current.id)
      const parent = await getMetadata(current.id)
      if (!parent.trashed) pending.push(...parent.parents.map(id => ({ id, names: [...current.names, parent.name] })))
    }
    return null
  }

  async downloadClientFile(input: {
    actor: GoogleWorkspaceActor
    fileId: string
    maxBytes?: number
    signal?: AbortSignal
    exportMimeType?: 'text/plain' | 'application/pdf' | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }): Promise<Buffer> {
    input.signal?.throwIfAborted()
    const accessToken = await getGoogleWorkspaceClient().getAccessToken(input.actor, GOOGLE_SCOPES.driveFile)
    input.signal?.throwIfAborted()
    const maxBytes = input.maxBytes ?? 20 * 1024 * 1024
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Limite de leitura do Drive inválido.')
    const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.fileId)}`
    const url = input.exportMimeType
      ? `${base}/export?mimeType=${encodeURIComponent(input.exportMimeType)}`
      : withDriveContext(`${base}?alt=media`)
    const timeout = AbortSignal.timeout(30_000)
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: input.signal ? AbortSignal.any([input.signal, timeout]) : timeout,
    })
    if (!response.ok) {
      throw new Error(`Não foi possível baixar o arquivo do Google Drive (HTTP ${response.status}).`)
    }
    const declaredSize = response.headers.get('content-length')
    if (declaredSize && /^\d+$/.test(declaredSize) && BigInt(declaredSize) > BigInt(maxBytes)) {
      await response.body?.cancel()
      throw new Error('Arquivo do Drive excede o limite de leitura desta operação.')
    }
    if (!response.body) throw new Error('O Google Drive não retornou o conteúdo do arquivo.')
    const reader = response.body.getReader()
    const parts: Buffer[] = []
    let bytes = 0
    try {
      while (true) {
        input.signal?.throwIfAborted()
        const chunk = await reader.read()
        input.signal?.throwIfAborted()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > maxBytes) throw new Error('Arquivo do Drive excede o limite de leitura desta operação.')
        parts.push(Buffer.from(chunk.value))
      }
      return Buffer.concat(parts, bytes)
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }
}

let singleton: GoogleDriveService | null = null

export function getGoogleDriveService(): GoogleDriveService {
  if (!singleton) singleton = new GoogleDriveService()
  return singleton
}
