import { z } from 'zod'
import { getCorporateDriveCredentials } from './CorporateDriveCredentials.js'
import { DriveChangesError, driveChangesFileSchema, type DriveChangesCorpus, type DriveChangesSource } from './DriveChangesTypes.js'

const FILE_FIELDS = 'id,name,mimeType,parents,driveId,size,version,md5Checksum,modifiedTime,trashed'
const token = z.string().min(1)
const drivesPage = z.object({ drives: z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/) })).default([]), nextPageToken: token.optional() })
const filesPage = z.object({ files: z.array(driveChangesFileSchema).default([]), nextPageToken: token.optional(), incompleteSearch: z.boolean().optional() })
const changesPage = z.object({
  changes: z.array(z.object({ fileId: z.string().optional(), driveId: z.string().optional(), changeType: z.enum(['file', 'drive']).optional(), removed: z.boolean().optional(), file: driveChangesFileSchema.optional() })).default([]),
  nextPageToken: token.optional(), newStartPageToken: token.optional(),
})

export interface DriveChangesHttpDependencies {
  credentials: Pick<ReturnType<typeof getCorporateDriveCredentials>, 'getAccessToken' | 'refreshAccessToken'>
  fetch: typeof fetch
  abortSignal?: AbortSignal
}

/** Transporte exclusivo de leitura; mensagens e parâmetros OAuth nunca entram nos erros públicos. */
export class DriveChangesGoogleSource implements DriveChangesSource {
  private readonly dependencies: DriveChangesHttpDependencies
  constructor(dependencies: Partial<DriveChangesHttpDependencies> = {}) {
    this.dependencies = { ...dependencies, credentials: dependencies.credentials || getCorporateDriveCredentials(), fetch: dependencies.fetch || globalThis.fetch }
  }

  private async get<T extends z.ZodTypeAny>(resource: string, parameters: Record<string, string>, schema: T): Promise<z.output<T>> {
    const url = new URL('https://www.googleapis.com/drive/v3/' + resource)
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value)
    try {
      let accessToken = await this.dependencies.credentials.getAccessToken()
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const timeout = AbortSignal.timeout(30000)
        const response = await this.dependencies.fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` }, redirect: 'error', signal: this.dependencies.abortSignal ? AbortSignal.any([timeout, this.dependencies.abortSignal]) : timeout })
        if (response.status === 401 && attempt === 0) {
          accessToken = await this.dependencies.credentials.refreshAccessToken(accessToken)
          continue
        }
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { error?: { errors?: Array<{ reason?: string }> } } | null
          const reasons = body?.error?.errors?.map(error => error.reason) || []
          if (response.status === 401) throw new DriveChangesError('AUTH_REQUIRED')
          if (response.status === 429 || reasons.some(reason => ['rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded', 'quotaExceeded'].includes(reason || ''))) throw new DriveChangesError('QUOTA')
          if (response.status === 410) throw new DriveChangesError('CURSOR_EXPIRED')
          if (response.status === 403) throw new DriveChangesError('PERMISSION_DENIED')
          if (response.status === 404) throw new DriveChangesError('NOT_FOUND')
          throw new DriveChangesError('TEMPORARILY_UNAVAILABLE')
        }
        const result = schema.safeParse(await response.json())
        if (!result.success) throw new DriveChangesError('INVALID_SOURCE')
        return result.data
      }
      throw new DriveChangesError('AUTH_REQUIRED')
    } catch (error) {
      if (error instanceof DriveChangesError) throw error
      const code = (error as { code?: string }).code
      if (code === 'AUTH_REQUIRED' || code === 'SERVER_CONFIGURATION' || code === 'PERMISSION_DENIED' || code === 'ACCOUNT_MISMATCH') throw new DriveChangesError(code)
      throw new DriveChangesError('TEMPORARILY_UNAVAILABLE')
    }
  }

  listDrives(pageToken?: string) {
    return this.get('drives', { pageSize: '100', fields: 'nextPageToken,drives(id)', ...(pageToken ? { pageToken } : {}) }, drivesPage)
  }
  async getStartPageToken(corpus: DriveChangesCorpus) {
    return (await this.get('changes/startPageToken', { supportsAllDrives: 'true', ...(corpus.driveId ? { driveId: corpus.driveId } : {}) }, z.object({ startPageToken: token }))).startPageToken
  }
  listFiles(corpus: DriveChangesCorpus, pageToken?: string) {
    return this.get('files', { corpora: corpus.driveId ? 'drive' : 'user', ...(corpus.driveId ? { driveId: corpus.driveId } : {}), q: 'trashed = false', pageSize: '1000', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', fields: `nextPageToken,incompleteSearch,files(${FILE_FIELDS})`, ...(pageToken ? { pageToken } : {}) }, filesPage)
  }
  listChanges(corpus: DriveChangesCorpus, pageToken: string) {
    return this.get('changes', { pageToken, pageSize: '1000', spaces: 'drive', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', includeRemoved: 'true', includeCorpusRemovals: 'true', ...(corpus.driveId ? { driveId: corpus.driveId } : {}), fields: `nextPageToken,newStartPageToken,changes(fileId,driveId,changeType,removed,file(${FILE_FIELDS}))` }, changesPage)
  }
  getFile(fileId: string) {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(fileId)) return Promise.reject(new DriveChangesError('INVALID_SOURCE'))
    return this.get('files/' + encodeURIComponent(fileId), { supportsAllDrives: 'true', fields: FILE_FIELDS }, driveChangesFileSchema)
  }
}
