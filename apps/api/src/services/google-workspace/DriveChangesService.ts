import { createHash } from 'node:crypto'
import { DRIVE_FOLDER_MIME, type DriveCorpusEntry } from './DriveCorpusTypes.js'
import { DriveChangesStore } from './DriveChangesStore.js'
import { DriveChangesError, driveChangesFileSchema, driveChangesScopeSchema, driveChangesHierarchyFingerprint, type DriveChangesCheckpoint, type DriveChangesFile, type DriveChangesProgress, type DriveChangesScope, type DriveChangesSource, type DriveMetadataEvent } from './DriveChangesTypes.js'

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const unique = (values: string[]) => [...new Set(values)].sort()
const corpusKey = (corpus: { driveId?: string }) => corpus.driveId || ''
const sortedPaths = (paths: string[][]) => [...new Map(paths.map(value => [JSON.stringify(value), value])).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))

function fingerprint(entry: DriveCorpusEntry, files: Map<string, DriveChangesFile>) {
  const paths = sortedPaths(entry.ancestorPaths)
  return hash([entry.id, entry.name, entry.mimeType, unique(entry.parents), entry.driveId || null, entry.size || null, entry.version || null, entry.md5Checksum || null, entry.modifiedTime || null,
    paths, entry.hierarchyFingerprint || driveChangesHierarchyFingerprint(entry, id => files.get(id)?.name), entry.corporateScope, unique(entry.linkedClientIds), entry.directAccessOnly === true])
}

function projection(files: Map<string, DriveChangesFile>, scope: DriveChangesScope, unavailable: Set<string>, directlyAccessible = new Set<string>()) {
  const cache = new Map<string, { paths: string[][]; blocked: boolean }>()
  const roots = new Set(scope.corporateRootIds)
  const folders = new Map<string, string[]>()
  for (const folder of scope.clientFolders) folders.set(folder.folderId, [...(folders.get(folder.folderId) || []), folder.clientId])
  const ancestry = (id: string, seen = new Set<string>()): { paths: string[][]; blocked: boolean } => {
    const cached = cache.get(id)
    if (cached) return cached
    if (seen.has(id) || seen.size > 256) throw new DriveChangesError('INVALID_SOURCE')
    const file = files.get(id)
    const next = new Set(seen).add(id)
    const parents = file?.parents || []
    let blocked = unavailable.has(id)
    const paths = parents.length ? parents.flatMap(parent => {
      const result = ancestry(parent, next)
      blocked ||= result.blocked
      return result.paths.map(chain => [...chain, id])
    }) : [[id]]
    // A API Drive atual só permite um pai; dados antigos podem ter múltiplos, todos preservados.
    // O acesso individual confirmado não herda vínculos CRM de ancestrais indisponíveis.
    const result = blocked && directlyAccessible.has(id) && !unavailable.has(id) && !file?.trashed
      ? { paths: [[id]], blocked: false }
      : { paths: sortedPaths(paths), blocked }
    cache.set(id, result)
    return result
  }
  return (id: string) => {
    const file = files.get(id)
    if (!file) return null
    const ancestryResult = ancestry(id)
    const ids = new Set(ancestryResult.paths.flat())
    const entry: DriveCorpusEntry = { ...file, ancestorPaths: ancestryResult.paths,
      corporateScope: [...roots].some(root => ids.has(root)),
      linkedClientIds: unique([...ids].flatMap(ancestor => folders.get(ancestor) || [])),
    }
    entry.hierarchyFingerprint = driveChangesHierarchyFingerprint(entry, ancestor => files.get(ancestor)?.name)
    return { entry, blocked: ancestryResult.blocked || file.trashed === true }
  }
}

export interface DriveChangesServiceOptions {
  privateRoot: string
  tenantId: string
  source: DriveChangesSource
  getScope: () => Promise<DriveChangesScope>
  now?: () => number
  store?: DriveChangesStore
  reconcileIntervalMs?: number
  maxChangePagesPerRun?: number
}

export class DriveChangesService {
  private readonly store: DriveChangesStore
  private readonly now: () => number
  private state!: Awaited<ReturnType<DriveChangesStore['load']>>
  private pagesRead = 0
  private failures = 0
  private lastProgressAt = 0

  constructor(private readonly options: DriveChangesServiceOptions) {
    this.store = options.store || new DriveChangesStore(options.privateRoot)
    this.now = options.now || Date.now
  }

  private stamp() { return new Date(Math.max(this.now(), Date.parse(this.state?.lastObservedAt || '1970-01-01T00:00:00Z'))).toISOString() }
  private files() { return new Map([...this.store.records].map(([id, record]) => [id, record.entry as DriveChangesFile])) }

  private async report(status: DriveChangesProgress['status'], errorCode?: DriveChangesProgress['errorCode']) {
    let availableEntries = 0
    for (const record of this.store.records.values()) if (record.available) availableEntries += 1
    const progress: DriveChangesProgress = {
      version: 1, status, updatedAt: this.stamp(), lastSuccessfulSyncAt: this.state?.checkpoint?.lastSuccessfulSyncAt || null,
      counts: { knownEntries: this.store.records.size, availableEntries, journalEvents: this.state?.journalEvents || 0, pagesRead: this.pagesRead, sharedDrives: this.state?.checkpoint?.cursors.filter(corpus => corpus.driveId).length || 0 },
      ...(errorCode ? { errorCode } : {}),
    }
    await this.store.progress(progress)
    this.lastProgressAt = this.now()
    return progress
  }

  private async checkpoint(events: DriveMetadataEvent[], next: DriveChangesCheckpoint) {
    this.state.checkpoint = await this.store.commit(events, next)
    this.state.journalBytes = this.state.checkpoint.journalBytes
    this.state.journalEvents = this.state.checkpoint.journalEvents
    this.state.lastObservedAt = this.state.checkpoint.lastObservedAt
  }

  private async drives() {
    const ids = new Set<string>(), seen = new Set<string>()
    let pageToken: string | undefined
    do {
      const page = await this.options.source.listDrives(pageToken)
      this.pagesRead += 1
      for (const drive of page.drives) {
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(drive.id)) throw new DriveChangesError('INVALID_SOURCE')
        ids.add(drive.id)
      }
      pageToken = page.nextPageToken
      if (pageToken && seen.has(pageToken)) throw new DriveChangesError('REPEATED_PAGE')
      if (pageToken) seen.add(pageToken)
    } while (pageToken)
    return [...ids].sort()
  }

  private unavailableIds() {
    return new Set([...this.store.records].filter(([, record]) => !record.available).map(([id]) => id))
  }

  private async revalidateDriveFiles(files: Map<string, DriveChangesFile>, unavailable: Set<string>, driveId: string, directlyAccessible: Set<string>) {
    const previousFiles = new Map(files)
    const ids = new Set([...files.values()].filter(file => file.driveId === driveId || file.id === driveId).map(file => file.id))
    // Perder a raiz ou o feed do drive não revoga necessariamente compartilhamentos individuais.
    for (const id of ids) {
      try {
        const file = driveChangesFileSchema.parse(await this.options.source.getFile(id))
        if (file.id !== id) throw new DriveChangesError('INVALID_SOURCE')
        files.set(id, { ...file, directAccessOnly: true })
        if (file.trashed) unavailable.add(id)
        else { unavailable.delete(id); directlyAccessible.add(id) }
      } catch (error) {
        if (!(error instanceof DriveChangesError) || !['NOT_FOUND', 'PERMISSION_DENIED'].includes(error.code)) throw error
        unavailable.add(id)
      }
    }
    await this.ancestors(files, unavailable, ids)
    return new Set([...this.descendants(previousFiles, ids), ...this.descendants(files, ids)])
  }

  private async revalidateDrives(scope: DriveChangesScope, driveIds: string[], restartReconciliation = false) {
    if (!driveIds.length) return
    const files = this.files()
    const unavailable = this.unavailableIds(), affected = new Set<string>(), directlyAccessible = new Set<string>()
    for (const driveId of driveIds) for (const id of await this.revalidateDriveFiles(files, unavailable, driveId, directlyAccessible)) affected.add(id)
    const batch = this.events(files, unavailable, scope, affected, false, 'drive_unavailable', directlyAccessible)
    if (!batch.length && !restartReconciliation) return
    const checkpoint: DriveChangesCheckpoint = this.state.checkpoint || {
      version: 1, tenantId: scope.tenantId, mode: 'reconciling', cursors: [], scope,
      journalBytes: this.state.journalBytes, journalEvents: this.state.journalEvents, lastObservedAt: this.state.lastObservedAt,
      lastSuccessfulSyncAt: null, lastReconciledAt: null, baseline: this.state.baseline,
    }
    // Uma confirmação individual não invalida os cursores dos corpora que seguem acessíveis.
    await this.checkpoint(batch, restartReconciliation ? { ...checkpoint, mode: 'reconciling', cursors: [] } : checkpoint)
  }

  private async revalidateMissingDrives(scope: DriveChangesScope, current: string[]) {
    const previous = new Set([...this.store.records.values()].map(record => record.entry.driveId).filter((id): id is string => Boolean(id)))
    const checkpoint = this.state.checkpoint
    const reconciliationDue = !checkpoint || checkpoint.mode === 'reconciling'
      || this.now() - Date.parse(checkpoint.lastReconciledAt || '1970-01-01') >= (this.options.reconcileIntervalMs || 6 * 60 * 60 * 1000)
    const previousCorpora = new Set(checkpoint?.cursors.map(corpus => corpus.driveId).filter(Boolean))
    // Um drive grande não pode gerar milhares de GETs a cada ciclo após perder a associação.
    await this.revalidateDrives(scope, [...previous].filter(id => !current.includes(id) && (reconciliationDue || previousCorpora.has(id))))
  }

  private async ancestors(files: Map<string, DriveChangesFile>, unavailable: Set<string>, ids?: Set<string>) {
    const pending = [...(ids || files.keys())].flatMap(id => files.get(id)?.parents || [])
    const seen = new Set<string>()
    for (let index = 0; index < pending.length; index += 1) {
      const id = pending[index]
      if (seen.has(id) || files.has(id) || unavailable.has(id)) continue
      seen.add(id)
      try {
        const file = driveChangesFileSchema.parse(await this.options.source.getFile(id))
        if (file.id !== id) throw new DriveChangesError('INVALID_SOURCE')
        files.set(id, file)
        if (file.trashed) unavailable.add(id)
        pending.push(...file.parents)
      } catch (error) {
        if (error instanceof DriveChangesError && ['NOT_FOUND', 'PERMISSION_DENIED'].includes(error.code)) unavailable.add(id)
        else throw error
      }
    }
  }

  private events(files: Map<string, DriveChangesFile>, unavailable: Set<string>, scope: DriveChangesScope, affected?: Set<string>, completeInventory = false, defaultReason = 'removed_or_inaccessible', directlyAccessible?: Set<string>) {
    const previousFiles = this.files()
    const project = projection(files, scope, unavailable, directlyAccessible)
    const ids = affected || new Set([...this.store.records.keys(), ...files.keys()])
    const events: DriveMetadataEvent[] = []
    const observedAt = this.stamp()
    for (const id of ids) {
      const previous = this.store.records.get(id)
      const target = project(id)
      const blocked = !target || target.blocked || unavailable.has(id)
      if (blocked) {
        if (!previous?.available) continue
        const reason = unavailable.has(id) ? defaultReason : !target && completeInventory ? 'absent_after_complete_reconciliation' : 'ancestor_unavailable'
        events.push({ version: 1, eventId: hash([previous.lastEventId || fingerprint(previous.entry, previousFiles), id, 'unavailable', reason]), observedAt, kind: 'unavailable', fileId: id, reason })
      } else {
        const targetFingerprint = fingerprint(target.entry, files)
        if (previous?.available && fingerprint(previous.entry, previousFiles) === targetFingerprint) continue
        events.push({ version: 1, eventId: hash([previous?.lastEventId || (previous ? fingerprint(previous.entry, previousFiles) : 'new'), id, targetFingerprint]), observedAt, kind: 'upsert', fileId: id, entry: target.entry })
      }
    }
    // Ancestrais removidos bloqueiam primeiro; ancestrais atuais precedem a revalidação dos filhos.
    const order = (event: DriveMetadataEvent) => {
      const entry = event.entry || this.store.records.get(event.fileId)?.entry
      const folder = entry?.mimeType === DRIVE_FOLDER_MIME
      const group = folder ? event.kind === 'unavailable' ? 0 : 1 : 2
      const depth = Math.min(...(entry?.ancestorPaths.map(chain => chain.length) || [1]))
      return { group, depth: Number.isFinite(depth) ? depth : 1 }
    }
    return events.sort((a, b) => { const left = order(a), right = order(b); return left.group - right.group || left.depth - right.depth || a.fileId.localeCompare(b.fileId) })
  }

  private descendants(files: Map<string, DriveChangesFile>, roots: Set<string>) {
    const children = new Map<string, string[]>()
    for (const file of files.values()) for (const parent of file.parents) {
      let siblings = children.get(parent)
      if (!siblings) { siblings = []; children.set(parent, siblings) }
      siblings.push(file.id)
    }
    const result = new Set(roots), queue = [...roots]
    for (let index = 0; index < queue.length; index += 1) for (const child of children.get(queue[index]) || []) if (!result.has(child)) { result.add(child); queue.push(child) }
    return result
  }

  private async reconcile(scope: DriveChangesScope, drives: string[]) {
    const streams = [{}, ...drives.map(driveId => ({ driveId }))]
    let checkpoint = this.state.checkpoint
    const reusable = checkpoint?.mode === 'reconciling' && hash(checkpoint.cursors.map(corpusKey).sort()) === hash(streams.map(corpusKey).sort())
    if (!reusable) {
      const cursors: DriveChangesCheckpoint['cursors'] = []
      // Todos os tokens são capturados antes da primeira página de metadados.
      for (const stream of streams) cursors.push({ ...stream, pageToken: await this.options.source.getStartPageToken(stream) })
      checkpoint = { version: 1, tenantId: scope.tenantId, mode: 'reconciling', cursors, scope, journalBytes: this.state.journalBytes, journalEvents: this.state.journalEvents,
        lastObservedAt: this.state.lastObservedAt, lastSuccessfulSyncAt: checkpoint?.lastSuccessfulSyncAt || null, lastReconciledAt: checkpoint?.lastReconciledAt || null, baseline: this.state.baseline }
      await this.checkpoint([], checkpoint)
    }
    await this.report('reconciling')
    const files = new Map<string, DriveChangesFile>()
    for (const stream of streams) {
      let pageToken: string | undefined
      const seen = new Set<string>()
      do {
        let page
        try { page = await this.options.source.listFiles(stream, pageToken) }
        catch (error) {
          if ('driveId' in stream && typeof stream.driveId === 'string' && stream.driveId && error instanceof DriveChangesError && ['NOT_FOUND', 'PERMISSION_DENIED'].includes(error.code)) {
            await this.revalidateDrives(scope, [stream.driveId], true)
          }
          throw error
        }
        this.pagesRead += 1
        if (page.incompleteSearch) throw new DriveChangesError('INCOMPLETE_SEARCH')
        for (const item of page.files) {
          const file = driveChangesFileSchema.parse(item)
          if (file.trashed) continue
          if (this.store.records.get(file.id)?.entry.directAccessOnly === true) file.directAccessOnly = true
          const old = files.get(file.id)
          // A mesma fonte pode aparecer no corpus do usuário e no drive compartilhado.
          if (old?.version && file.version && /^\d+$/.test(old.version) && /^\d+$/.test(file.version) && BigInt(old.version) > BigInt(file.version)) continue
          files.set(file.id, file)
        }
        pageToken = page.nextPageToken
        if (pageToken && seen.has(pageToken)) throw new DriveChangesError('REPEATED_PAGE')
        if (pageToken) seen.add(pageToken)
        if (this.now() - this.lastProgressAt > 10000) await this.report('reconciling')
      } while (pageToken)
    }
    const unavailable = new Set<string>(), directlyAccessible = new Set<string>()
    // includeCorpusRemovals pode encerrar o feed sem revogar acesso direto ao arquivo.
    for (const record of this.store.records.values()) {
      if (record.entry.directAccessOnly !== true && (!record.entry.driveId || drives.includes(record.entry.driveId))) continue
      try {
        const file = driveChangesFileSchema.parse(await this.options.source.getFile(record.entry.id))
        if (file.id !== record.entry.id) throw new DriveChangesError('INVALID_SOURCE')
        if (file.trashed) { files.delete(file.id); unavailable.add(file.id) }
        else { files.set(file.id, { ...file, directAccessOnly: true }); directlyAccessible.add(file.id) }
      } catch (error) {
        if (error instanceof DriveChangesError && ['NOT_FOUND', 'PERMISSION_DENIED'].includes(error.code)) { files.delete(record.entry.id); unavailable.add(record.entry.id) }
        else throw error
      }
    }
    await this.ancestors(files, unavailable)
    if (hash(await this.drives()) !== hash(drives)) throw new DriveChangesError('CORPORA_CHANGED')
    const events = this.events(files, unavailable, scope, undefined, true, 'removed_or_inaccessible', directlyAccessible)
    await this.checkpoint(events, { ...checkpoint!, scope, mode: 'watching', lastReconciledAt: this.stamp() })
  }

  private async changes(scope: DriveChangesScope) {
    let pages = 0
    const maximum = this.options.maxChangePagesPerRun || 200
    for (const original of [...this.state.checkpoint!.cursors]) {
      const seen = new Set<string>()
      let cursor = this.state.checkpoint!.cursors.find(item => corpusKey(item) === corpusKey(original))
      while (cursor) {
        if (pages >= maximum) return true
        if (seen.has(cursor.pageToken)) throw new DriveChangesError('REPEATED_PAGE')
        seen.add(cursor.pageToken)
        let page
        try { page = await this.options.source.listChanges(cursor, cursor.pageToken) }
        catch (error) {
          if (cursor.driveId && error instanceof DriveChangesError && ['NOT_FOUND', 'PERMISSION_DENIED'].includes(error.code)) {
            await this.revalidateDrives(scope, [cursor.driveId], true)
          }
          throw error
        }
        this.pagesRead += 1; pages += 1
        if ((!page.nextPageToken && !page.newStartPageToken) || (page.nextPageToken && page.newStartPageToken)) throw new DriveChangesError('INVALID_SOURCE')
        if (page.nextPageToken === cursor.pageToken || (page.nextPageToken && seen.has(page.nextPageToken))) throw new DriveChangesError('REPEATED_PAGE')
        if (!page.changes.length) {
          const nextToken = page.nextPageToken || page.newStartPageToken!
          const cursors = this.state.checkpoint!.cursors.map(item => corpusKey(item) === corpusKey(cursor!) ? { ...item, pageToken: nextToken } : item)
          await this.checkpoint([], { ...this.state.checkpoint!, cursors })
          if (!page.nextPageToken) break
          cursor = this.state.checkpoint!.cursors.find(item => corpusKey(item) === corpusKey(original))
          continue
        }
        const files = this.files(), previousFiles = new Map(files)
        const unavailable = this.unavailableIds()
        const changed = new Set<string>(), changedFolders = new Set<string>(), directlyAccessible = new Set<string>()
        let reconcileNeeded = false
        for (const change of page.changes) {
          if (change.changeType === 'drive') {
            if (!change.driveId) throw new DriveChangesError('INVALID_SOURCE')
            if (change.removed) {
              for (const id of await this.revalidateDriveFiles(files, unavailable, change.driveId, directlyAccessible)) {
                changed.add(id)
                if (files.get(id)?.mimeType === DRIVE_FOLDER_MIME || previousFiles.get(id)?.mimeType === DRIVE_FOLDER_MIME) changedFolders.add(id)
              }
            }
            reconcileNeeded = true
            continue
          }
          const id = change.fileId || change.file?.id
          if (!id || !/^[A-Za-z0-9_-]{1,200}$/.test(id) || (change.file && change.file.id !== id)) throw new DriveChangesError('INVALID_SOURCE')
          const previous = this.store.records.get(id)
          if (change.file?.trashed) { unavailable.add(id); changed.add(id); if (previous?.entry.mimeType === DRIVE_FOLDER_MIME) changedFolders.add(id); continue }
          let file: DriveChangesFile
          // includeCorpusRemovals pode notificar saída de um corpus ainda com acesso pelo outro.
          try { file = driveChangesFileSchema.parse(change.removed ? await this.options.source.getFile(id) : change.file || await this.options.source.getFile(id)) }
          catch (error) {
            if (error instanceof DriveChangesError && ['NOT_FOUND', 'PERMISSION_DENIED'].includes(error.code)) { unavailable.add(id); changed.add(id); if (previous?.entry.mimeType === DRIVE_FOLDER_MIME) changedFolders.add(id); continue }
            throw error
          }
          if (file.id !== id) throw new DriveChangesError('INVALID_SOURCE')
          if (change.removed && !file.trashed) { reconcileNeeded = true; file.directAccessOnly = true }
          if (previous?.entry.directAccessOnly === true || files.get(id)?.directAccessOnly === true) file.directAccessOnly = true
          if (file.directAccessOnly && !file.trashed) directlyAccessible.add(id)
          files.set(id, file); changed.add(id)
          if (file.trashed) unavailable.add(id)
          else unavailable.delete(id)
          if (file.mimeType === DRIVE_FOLDER_MIME || previous?.entry.mimeType === DRIVE_FOLDER_MIME) {
            changedFolders.add(id)
            if (!previous?.available) reconcileNeeded = true
          }
        }
        await this.ancestors(files, unavailable, changed)
        const affected = new Set([...changed, ...this.descendants(previousFiles, changedFolders), ...this.descendants(files, changedFolders)])
        for (const id of files.keys()) if (!previousFiles.has(id)) affected.add(id)
        const events = this.events(files, unavailable, scope, affected, false, 'removed_or_inaccessible', directlyAccessible)
        const nextToken = page.nextPageToken || page.newStartPageToken!
        const cursors = this.state.checkpoint!.cursors.map(item => corpusKey(item) === corpusKey(cursor!) ? { ...item, pageToken: nextToken } : item)
        await this.checkpoint(events, { ...this.state.checkpoint!, cursors, mode: reconcileNeeded ? 'reconciling' : 'watching' })
        if (reconcileNeeded) return true
        if (!page.nextPageToken) break
        cursor = this.state.checkpoint!.cursors.find(item => corpusKey(item) === corpusKey(original))
      }
    }
    return false
  }

  async syncOnce() {
    let unlock: (() => Promise<void>) | undefined
    this.pagesRead = 0
    try { unlock = await this.store.lock() }
    catch (error) { if (error instanceof DriveChangesError && error.code === 'BUSY') return { busy: true, retryAfterMs: 30000 }; throw new DriveChangesError('IO_ERROR') }
    try {
      const scope = driveChangesScopeSchema.parse(await this.options.getScope())
      if (scope.tenantId !== this.options.tenantId) throw new DriveChangesError('STATE_INVALID')
      scope.corporateRootIds = unique(scope.corporateRootIds)
      scope.clientFolders.sort((a, b) => a.folderId.localeCompare(b.folderId) || a.clientId.localeCompare(b.clientId))
      this.state = await this.store.load(scope.tenantId)
      const drives = await this.drives()
      await this.revalidateMissingDrives(scope, drives)
      const checkpoint = this.state.checkpoint
      if (!checkpoint || checkpoint.mode === 'reconciling' || hash(checkpoint.scope) !== hash(scope) || hash(checkpoint.cursors.filter(item => item.driveId).map(item => item.driveId).sort()) !== hash(drives) || this.now() - Date.parse(checkpoint.lastReconciledAt || '1970-01-01') >= (this.options.reconcileIntervalMs || 6 * 60 * 60 * 1000)) {
        await this.reconcile(scope, drives)
      }
      const remaining = await this.changes(scope)
      const complete = !remaining && this.state.checkpoint!.mode === 'watching'
      if (complete) await this.checkpoint([], { ...this.state.checkpoint!, lastSuccessfulSyncAt: this.stamp() })
      this.failures = 0
      const progress = await this.report(complete ? 'watching' : 'reconciling')
      return { busy: false, ...progress, remaining, retryAfterMs: remaining ? 1000 : 30000 }
    } catch (error) {
      const code = error instanceof DriveChangesError ? error.code : (error as { name?: string }).name === 'ZodError' ? 'INVALID_SOURCE' : 'IO_ERROR'
      if (code === 'CURSOR_EXPIRED' && this.state?.checkpoint) await this.checkpoint([], { ...this.state.checkpoint, mode: 'reconciling', cursors: [] })
      const status = code === 'AUTH_REQUIRED' || code === 'PERMISSION_DENIED' || code === 'ACCOUNT_MISMATCH' ? 'awaiting_authorization' : 'retry'
      const progress = await this.report(status, code)
      this.failures += 1
      const retryAfterMs = status === 'awaiting_authorization' ? 60000 : code === 'CURSOR_EXPIRED' ? 1000 : Math.min(15 * 60_000, 10_000 * 2 ** Math.min(this.failures - 1, 6))
      return { busy: false, ...progress, remaining: true, retryAfterMs }
    } finally { await unlock() }
  }
}
