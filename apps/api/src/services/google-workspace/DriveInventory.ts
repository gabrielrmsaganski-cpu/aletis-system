import { randomUUID } from 'node:crypto'
import { z } from 'zod'

export const driveFileSchema = z.object({
  id: z.string().min(1), name: z.string(), mimeType: z.string(),
  sizeBytes: z.string().nullable(), modifiedAt: z.string().nullable(),
  url: z.string(), path: z.string(),
  version: z.string().nullable().optional(), md5Checksum: z.string().nullable().optional(),
  shortcutTargetId: z.string().nullable().optional(),
})
export const driveInventorySchema = z.object({
  version: z.literal(1), scanId: z.string(), rootFolderId: z.string(),
  startedAt: z.string(), updatedAt: z.string(), completedAt: z.string().nullable(),
  pending: z.array(z.object({ id: z.string(), path: z.string(), pageToken: z.string().optional() })),
  visited: z.array(z.string()), files: z.array(driveFileSchema), pagesRead: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
})
export type DriveInventoryState = z.infer<typeof driveInventorySchema>
export type DriveInventoryFile = z.infer<typeof driveFileSchema>
export interface DrivePage {
  nextPageToken?: string
  files: Array<{ id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string; version?: string; md5Checksum?: string; shortcutDetails?: { targetId?: string } }>
}

export function startDriveInventory(rootFolderId: string): DriveInventoryState {
  const now = new Date().toISOString()
  return {
    version: 1, scanId: randomUUID(), rootFolderId, startedAt: now, updatedAt: now,
    completedAt: null, pending: [{ id: rootFolderId, path: '' }], visited: [],
    files: [], pagesRead: 0, lastError: null,
  }
}

/** Cada página é confirmada por inteiro antes de avançar o cursor persistido. */
export async function advanceDriveInventory(input: {
  state: DriveInventoryState
  fetchPage: (folderId: string, pageToken: string | undefined, pageSize: number, signal: AbortSignal) => Promise<DrivePage>
  save: (state: DriveInventoryState) => Promise<void>
  maxFiles?: number
  maxPages?: number
  durationMs?: number
}): Promise<DriveInventoryState> {
  const state = driveInventorySchema.parse(input.state)
  const deadline = Date.now() + (input.durationMs ?? 12_000)
  const initialFiles = state.files.length
  const maxFiles = Math.max(1, input.maxFiles ?? 500)
  const files = new Map(state.files.map(file => [file.id, file]))
  const visited = new Set(state.visited)
  let pages = 0
  state.lastError = null
  while (state.pending.length && files.size - initialFiles < maxFiles && pages < (input.maxPages ?? 20)) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    const current = state.pending[0]
    if (visited.has(current.id)) { state.pending.shift(); continue }
    let page: DrivePage
    try {
      page = await input.fetchPage(current.id, current.pageToken,
        Math.min(200, Math.max(1, maxFiles - (files.size - initialFiles))), AbortSignal.timeout(remaining))
      if (page.nextPageToken && page.nextPageToken === current.pageToken) {
        throw new Error('O Google repetiu a página. A leitura foi pausada e pode ser retomada.')
      }
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : 'Não foi possível continuar a leitura do Drive.'
      break
    }
    const queued = new Set(state.pending.map(folder => folder.id))
    for (const item of page.files) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        if (!visited.has(item.id) && !queued.has(item.id)) {
          state.pending.push({ id: item.id, path: current.path ? `${current.path}/${item.name}` : item.name })
          queued.add(item.id)
        }
      } else {
        files.set(item.id, {
          id: item.id, name: item.name, mimeType: item.mimeType, sizeBytes: item.size || null,
          modifiedAt: item.modifiedTime || null,
          url: item.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(item.id)}/view`,
          path: current.path,
          version: item.version || null, md5Checksum: item.md5Checksum || null,
          ...(item.shortcutDetails?.targetId ? { shortcutTargetId: item.shortcutDetails.targetId } : {}),
        })
      }
    }
    if (page.nextPageToken) current.pageToken = page.nextPageToken
    else { state.pending.shift(); visited.add(current.id) }
    pages += 1
    state.pagesRead += 1
    state.files = [...files.values()]
    state.visited = [...visited]
    state.updatedAt = new Date().toISOString()
    if (!state.pending.length) state.completedAt = state.updatedAt
    await input.save(state)
  }
  state.updatedAt = new Date().toISOString()
  if (!state.pending.length) state.completedAt ||= state.updatedAt
  await input.save(state)
  return state
}
