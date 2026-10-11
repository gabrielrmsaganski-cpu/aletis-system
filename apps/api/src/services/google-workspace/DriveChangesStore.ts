import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
import { spawn } from 'node:child_process'
import { driveCorpusEntry } from './DriveCorpusTypes.js'
import { DriveChangesError, driveChangesCheckpointSchema, driveMetadataEventSchema, driveChangesHierarchyFingerprint, driveChangesFileSchema, type DriveChangesCheckpoint, type DriveChangesProgress, type DriveChangesRecord, type DriveMetadataEvent } from './DriveChangesTypes.js'

function structuralEntry(value: unknown) {
  const entry = driveCorpusEntry.parse(value)
  return { ...driveChangesFileSchema.parse(entry), ancestorPaths: entry.ancestorPaths, corporateScope: entry.corporateScope, linkedClientIds: entry.linkedClientIds,
    ...(typeof entry.hierarchyFingerprint === 'string' ? { hierarchyFingerprint: entry.hierarchyFingerprint } : {}),
  }
}

async function atomicJson(file: string, value: unknown) {
  const temporary = file + '.' + randomUUID() + '.tmp'
  const handle = await fs.open(temporary, 'wx', 0o600)
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync() } finally { await handle.close() }
  try {
    await fs.rename(temporary, file)
    const directory = await fs.open(path.dirname(file), 'r')
    try { await directory.sync() } finally { await directory.close() }
  } finally { await fs.unlink(temporary).catch(() => {}) }
}

export class DriveChangesStore {
  readonly records = new Map<string, DriveChangesRecord>()
  private loaded = false
  private offset = 0
  private eventCount = 0
  private lastObservedAt = new Date(0).toISOString()
  private baselineInfo?: { size: number; mtimeMs: number }
  private checkpoint: DriveChangesCheckpoint | null = null

  constructor(readonly privateRoot: string, private readonly afterJournalSync?: () => Promise<void>) {}

  private file(name: string) { return path.join(this.privateRoot, name) }

  async lock(): Promise<() => Promise<void>> {
    await fs.mkdir(this.privateRoot, { recursive: true, mode: 0o700 })
    const lockFile = this.file('metadata-producer.lock')
    await (await fs.open(lockFile, 'a', 0o600)).close()
    // Lock do kernel: a morte do produtor fecha stdin e libera flock, sem remover lock alheio.
    const child = spawn('flock', ['-n', '-E', '73', lockFile, process.execPath, '-e', 'process.stdout.write("locked\\n");process.stdin.resume();process.stdin.on("end",()=>process.exit(0))'], { stdio: ['pipe', 'pipe', 'ignore'] })
    const ended = new Promise<void>(resolve => child.once('exit', () => resolve()))
    await new Promise<void>((resolve, reject) => {
      child.once('error', () => reject(new DriveChangesError('SERVER_CONFIGURATION')))
      child.once('exit', code => reject(new DriveChangesError(code === 73 ? 'BUSY' : 'IO_ERROR')))
      child.stdout.once('data', value => String(value).startsWith('locked') ? resolve() : reject(new DriveChangesError('IO_ERROR')))
    })
    return async () => { child.stdin.end(); await ended }
  }

  private async *lines(file: string, start = 0): AsyncGenerator<{ text: string; end: number }> {
    const decoder = new StringDecoder('utf8')
    let pending = '', offset = start
    for await (const buffer of createReadStream(file, { start, highWaterMark: 64 * 1024 })) {
      pending += decoder.write(buffer as Buffer)
      let end: number
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, end)
        pending = pending.slice(end + 1)
        offset += Buffer.byteLength(line + '\n')
        yield { text: line, end: offset }
      }
      if (Buffer.byteLength(pending) > 2 * 1024 * 1024) throw new DriveChangesError('STATE_INVALID')
    }
    pending += decoder.end()
    // O journal só confirma linhas encerradas. Um último fragmento será retirado sob o lock.
  }

  private apply(event: DriveMetadataEvent) {
    if (event.kind === 'upsert') {
      const entry = structuralEntry(event.entry!)
      entry.hierarchyFingerprint ||= driveChangesHierarchyFingerprint(entry, id => this.records.get(id)?.entry.name)
      this.records.set(event.fileId, { entry, available: true, lastEventId: event.eventId })
    }
    else {
      const previous = this.records.get(event.fileId)
      if (previous) this.records.set(event.fileId, { ...previous, available: false, reason: event.reason, lastEventId: event.eventId })
    }
    this.lastObservedAt = new Date(Math.max(Date.parse(this.lastObservedAt), Date.parse(event.observedAt))).toISOString()
  }

  async load(tenantId: string) {
    const markerFile = this.file('metadata-tenant.json')
    let marker: { tenantId: string }
    try { marker = JSON.parse(await fs.readFile(markerFile, 'utf8')) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new DriveChangesError('STATE_INVALID')
      marker = { tenantId }
      await atomicJson(markerFile, marker)
    }
    if (marker.tenantId !== tenantId) throw new DriveChangesError('STATE_INVALID')
    const baseline = await fs.stat(this.file('inventory-entries.jsonl'))
    if (this.baselineInfo && (baseline.size !== this.baselineInfo.size || baseline.mtimeMs !== this.baselineInfo.mtimeMs)) throw new DriveChangesError('STATE_INVALID')
    let checkpoint: DriveChangesCheckpoint | null
    try { checkpoint = driveChangesCheckpointSchema.parse(JSON.parse(await fs.readFile(this.file('metadata-checkpoint.json'), 'utf8'))) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new DriveChangesError('STATE_INVALID')
      checkpoint = null
    }
    if (checkpoint && (checkpoint.tenantId !== tenantId || checkpoint.scope.tenantId !== tenantId || checkpoint.baseline.size !== baseline.size || checkpoint.baseline.mtimeMs !== baseline.mtimeMs)) throw new DriveChangesError('STATE_INVALID')
    if (!this.loaded) {
      this.records.clear()
      let baselineBytes = 0
      for await (const line of this.lines(this.file('inventory-entries.jsonl'))) {
        baselineBytes = line.end
        if (!line.text.trim()) continue
        const entry = structuralEntry(JSON.parse(line.text))
        this.records.set(entry.id, { entry, available: true })
      }
      if (baselineBytes !== baseline.size) throw new DriveChangesError('STATE_INVALID')
      for (const record of this.records.values()) record.entry.hierarchyFingerprint = driveChangesHierarchyFingerprint(record.entry, id => this.records.get(id)?.entry.name)
      const completed = await fs.readFile(this.file('inventory-aggregate.json'), 'utf8').then(value => JSON.parse(value)?.completedAt).catch(() => null)
      if (completed && Number.isFinite(Date.parse(completed))) this.lastObservedAt = new Date(Date.parse(completed)).toISOString()
      this.baselineInfo = { size: baseline.size, mtimeMs: baseline.mtimeMs }
      this.loaded = true
    }
    const handle = await fs.open(this.file('metadata-events.jsonl'), 'a+', 0o600)
    try {
      const journalStat = await handle.stat()
      if (journalStat.size < this.offset) throw new DriveChangesError('STATE_INVALID')
      for await (const line of this.lines(this.file('metadata-events.jsonl'), this.offset)) {
        const event = driveMetadataEventSchema.parse(JSON.parse(line.text))
        this.apply(event)
        this.offset = line.end
        this.eventCount += 1
      }
      if (checkpoint && checkpoint.journalBytes > this.offset) throw new DriveChangesError('STATE_INVALID')
      if (journalStat.size > this.offset) { await handle.truncate(this.offset); await handle.sync() }
    } finally { await handle.close() }
    this.checkpoint = checkpoint
    return { checkpoint, records: this.records, baseline: this.baselineInfo!, journalBytes: this.offset, journalEvents: this.eventCount, lastObservedAt: this.lastObservedAt }
  }

  async commit(events: DriveMetadataEvent[], checkpoint: DriveChangesCheckpoint) {
    if (!this.loaded || !this.baselineInfo || checkpoint.tenantId !== checkpoint.scope.tenantId) throw new DriveChangesError('STATE_INVALID')
    const handle = await fs.open(this.file('metadata-events.jsonl'), 'a', 0o600)
    let appendedBytes = 0
    try {
      for (let index = 0; index < events.length; index += 250) {
        const batch = events.slice(index, index + 250).map(event => driveMetadataEventSchema.parse(event))
        const text = batch.map(event => JSON.stringify(event)).join('\n') + '\n'
        await handle.writeFile(text)
        appendedBytes += Buffer.byteLength(text)
      }
      await handle.sync()
    } finally { await handle.close() }
    this.offset += appendedBytes
    for (const event of events) this.apply(event)
    this.eventCount += events.length
    // Ponto de falha injetável para provar journal durável antes do avanço dos cursores.
    if (events.length) await this.afterJournalSync?.()
    const next = driveChangesCheckpointSchema.parse({ ...checkpoint, journalBytes: this.offset, journalEvents: this.eventCount, lastObservedAt: this.lastObservedAt, baseline: this.baselineInfo })
    await atomicJson(this.file('metadata-checkpoint.json'), next)
    this.checkpoint = next
    return next
  }

  async progress(progress: DriveChangesProgress) { await atomicJson(this.file('incremental-progress.json'), progress) }
}
