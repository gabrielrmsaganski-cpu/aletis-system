import { createReadStream } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import { getPool, isPgEnabled } from '../../db/client.js'
import { completeDocumentChunks } from '../alix/intake/DocumentCorpus.js'
import type { DocumentChunk } from '../alix/intake/types.js'
import { corpusCategory, corpusHash, corpusRevision, DRIVE_FOLDER_MIME, driveCorpusCoverage, driveCorpusEntry, driveCorpusReceipt, driveCorpusTimestamp, type DriveCorpusEntry, type DriveCorpusReceipt } from './DriveCorpusTypes.js'
import { driveCorpusMetadataEvent, driveIncrementalProgress, type DriveCorpusMetadataEvent } from './DriveCorpusMetadataEvents.js'
import { enqueueDriveAnalysisForCurrentFile } from '../alix/intake/DriveCorpusAnalysisStore.js'

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)
const eventSchema = z.object({ fileId: identifier, finishedAt: driveCorpusTimestamp, fileVersion: z.string().nullish() })
const checkpointSchema = z.object({ key: z.string(), offset: z.number().int().nonnegative(), processed: z.number().int().nonnegative(), complete: z.boolean().optional() })
type Checkpoint = z.infer<typeof checkpointSchema>
type Row = { file_id: string; revision_key: string; mime_type: string; read_status: string; read_at: Date | string | null; metadata: Record<string, any> }
type Outcome = 'applied' | 'unchanged' | 'stale' | 'missing' | 'rejected'
type Run = Record<string, any>
type Prepared = { row: Row; receipt: DriveCorpusReceipt; text: string; chunks: DocumentChunk[]; coverage: z.infer<typeof driveCorpusCoverage>; status: string; fingerprint: string; hash: string | null; characterMetric: string }
type PathEntry = { file_id: string; name: string; metadata: { ancestorPaths?: unknown; parents?: unknown } }
const pathCheckpointSchema = z.object({ key: z.string(), after: z.string(), processed: z.number().int().nonnegative(), updated: z.number().int().nonnegative(), complete: z.boolean() })
const PATH_RESOLUTION_VERSION = 1

function resolveCorpusPath(entry: PathEntry, folders: Map<string, string>) {
  const source = entry.metadata.ancestorPaths
  const ancestors = Array.isArray(source) && Array.isArray(source[0]) ? source[0].filter((id): id is string => typeof id === 'string') : []
  let unresolvedAncestors = 0
  const parts = ancestors.map(id => {
    if (id === entry.file_id) return entry.name
    const name = folders.get(id)
    if (name) return name
    unresolvedAncestors++
    return '[Pasta não identificada]'
  })
  if (!ancestors.length && Array.isArray(entry.metadata.parents) && entry.metadata.parents.length) {
    parts.push('[Caminho da pasta não identificado]'); unresolvedAncestors++
  }
  if (ancestors.at(-1) !== entry.file_id) parts.push(entry.name)
  const path = parts.join('/')
  return { path, category: corpusCategory(entry.name, path), resolution: { version: PATH_RESOLUTION_VERSION, status: unresolvedAncestors ? 'partial' : 'complete', unresolvedAncestors } }
}

export class DriveCorpusIngestionError extends Error {
  constructor(public readonly code: string, message: string) { super(message) }
}

/** Cursors são bytes; uma linha parcial do log de eventos fica pendente até terminar. */
export async function* streamDriveJsonLines(path: string, offset = 0, endExclusive?: number, allowFinalLine = false) {
  if (endExclusive != null && endExclusive <= offset) return
  const input = createReadStream(path, { start: offset, ...(endExclusive != null ? { end: endExclusive - 1 } : {}), highWaterMark: 64 * 1024 })
  let pending = Buffer.alloc(0)
  let consumed = offset
  try {
    for await (const part of input) {
      pending = Buffer.concat([pending, part as Buffer])
      let end: number
      while ((end = pending.indexOf(10)) >= 0) {
        const line = pending.subarray(0, end).toString('utf8').replace(/\r$/, '')
        consumed += end + 1
        pending = pending.subarray(end + 1)
        yield { line, offset: consumed }
      }
      if (pending.byteLength > 2 * 1024 * 1024) throw new DriveCorpusIngestionError('LINE_TOO_LARGE', 'Uma linha do inventário/log excede o limite de leitura; nenhuma parte foi descartada.')
    }
    if (allowFinalLine && pending.length) yield { line: pending.toString('utf8').replace(/\r$/, ''), offset: consumed + pending.length }
  } finally { input.destroy() }
}

const safeDate = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
function sameDate(left?: string | null, right?: string | null) { return safeDate(left) === safeDate(right) }
const unknownCoverage = () => ({ status: 'unknown', limitations: ['O conteúdo ainda não foi extraído ou sua revisão mudou.'] })
function codePoints(text: string) { let count = 0; for (const _character of text) count++; return count }

export class DriveCorpusIngestionService {
  constructor(private readonly options: { privateRoot: string; tenantId: string; pool?: Pool; maxEventsPerRun?: number; maxArtifactBytes?: number }) {}
  private pool() { if (this.options.pool) return this.options.pool; if (!isPgEnabled()) throw new DriveCorpusIngestionError('PG_REQUIRED', 'O catálogo requer PostgreSQL disponível.'); return getPool() }
  private rootPromise?: Promise<string>
  private root() { return this.rootPromise ??= realpath(this.options.privateRoot) }
  private async inside(path: string) {
    const root = await this.root()
    const actual = await realpath(isAbsolute(path) ? path : join(root, path))
    const difference = relative(root, actual)
    if (difference.startsWith('..') || isAbsolute(difference)) throw new DriveCorpusIngestionError('PATH_OUTSIDE_ROOT', 'O artefato não está dentro do diretório privado autorizado.')
    return actual
  }
  private async json(path: string, maximum = 2 * 1024 * 1024): Promise<any> {
    const actual = await this.inside(path)
    if ((await stat(actual)).size > maximum) throw new DriveCorpusIngestionError('ARTIFACT_TOO_LARGE', 'O artefato excede o orçamento desta leitura e precisa de processamento específico; não houve truncamento.')
    return JSON.parse(await readFile(actual, 'utf8'))
  }
  private async run(client: PoolClient): Promise<Run> {
    return (await client.query('SELECT payload FROM alix_drive_corpus_run WHERE tenant_id=$1', [this.options.tenantId])).rows[0]?.payload || {}
  }
  private async saveRun(client: PoolClient, run: Run) {
    await client.query(`INSERT INTO alix_drive_corpus_run(tenant_id,payload) VALUES($1,$2::jsonb)
      ON CONFLICT(tenant_id) DO UPDATE SET payload=alix_drive_corpus_run.payload || EXCLUDED.payload,updated_at=now()`, [this.options.tenantId, JSON.stringify(run)])
  }
  private async transaction<T>(client: PoolClient, work: () => Promise<T>) {
    await client.query('BEGIN')
    try { const result = await work(); await client.query('COMMIT'); return result } catch (error) { await client.query('ROLLBACK'); throw error }
  }
  private async clientAliases(client: PoolClient) {
    const rows = (await client.query(`SELECT id,payload->'identityMerge'->>'canonicalId' AS canonical,
      payload->'identityMerge'->>'status' AS status,payload->'identityConsolidation'->'aliases' AS aliases FROM cliente ORDER BY id`)).rows
    const known = new Set<string>(rows.map(row => row.id))
    const aliases = new Map<string, string>()
    for (const row of rows) {
      if (row.status === 'merged' && typeof row.canonical === 'string') aliases.set(row.id, row.canonical)
      for (const alias of Array.isArray(row.aliases) ? row.aliases : []) if (typeof alias === 'string' && alias !== row.id && !known.has(alias)) aliases.set(alias, row.id)
    }
    return { hash: corpusHash(JSON.stringify(rows)), resolve: (id: string): string | null => {
      const visited = new Set<string>(); let current = id
      while (aliases.has(current)) { if (visited.has(current) || visited.size >= 32) return null; visited.add(current); current = aliases.get(current)! }
      return known.has(current) ? current : null
    } }
  }

  private async folderNames(client: PoolClient) {
    const rows = (await client.query('SELECT file_id,name FROM alix_drive_corpus WHERE tenant_id=$1 AND mime_type=$2 ORDER BY file_id', [this.options.tenantId, DRIVE_FOLDER_MIME])).rows
    return new Map<string, string>(rows.map(row => [row.file_id, row.name]))
  }

  private async upsertInventory(client: PoolClient, entries: DriveCorpusEntry[], scannedAt: string, aliases: Awaited<ReturnType<DriveCorpusIngestionService['clientAliases']>>, folders: Map<string, string>, event?: DriveCorpusMetadataEvent) {
    if (!entries.length) return
    for (const entry of entries) if (entry.mimeType === DRIVE_FOLDER_MIME) folders.set(entry.id, entry.name)
    const values = entries.map(entry => {
      const matches = [...new Set(entry.linkedClientIds.map(aliases.resolve).filter((id): id is string => Boolean(id)))]
      const unresolved = entry.linkedClientIds.some(id => !aliases.resolve(id))
      const resolvedPath = resolveCorpusPath({ file_id: entry.id, name: entry.name, metadata: { ancestorPaths: entry.ancestorPaths, parents: entry.parents } }, folders)
      return { file_id: entry.id, revision_key: corpusRevision(entry), name: entry.name, mime_type: entry.mimeType,
        path: resolvedPath.path, drive_id: entry.driveId || null, cliente_id: matches.length === 1 && !unresolved ? matches[0] : null,
        corporate_scope: entry.corporateScope, category: resolvedPath.category,
        read_status: entry.mimeType === DRIVE_FOLDER_MIME ? 'folder' : entry.mimeType === 'application/vnd.google-apps.shortcut' ? 'unsupported' : 'pending',
        coverage: entry.mimeType === 'application/vnd.google-apps.shortcut' ? { status: 'unknown', limitations: ['Este item é um atalho de navegação. Abra o original para acessar seu destino; ele não representa um documento adicional lido.'] } : unknownCoverage(), modified_at: safeDate(entry.modifiedTime), scanned_at: scannedAt,
        metadata: { ...(event ? { availability: { status: 'available', checkedAt: scannedAt, eventId: event.eventId } } : {}),
          driveVersion: entry.version || null, driveModifiedTime: entry.modifiedTime || null, driveMd5: entry.md5Checksum || null,
          parents: entry.parents, ancestorPaths: entry.ancestorPaths, pathResolution: resolvedPath.resolution, matching: { method: 'linked_folder', sourceIds: entry.linkedClientIds, canonicalIds: matches, ambiguous: matches.length > 1 || unresolved, verified: matches.length === 1 && !unresolved } } }
    })
    await client.query(`INSERT INTO alix_drive_corpus AS previous(tenant_id,file_id,revision_key,name,mime_type,path,drive_id,cliente_id,corporate_scope,category,read_status,coverage,modified_at,scanned_at,metadata)
      SELECT $1,x.* FROM jsonb_to_recordset($2::jsonb) AS x(file_id text,revision_key text,name text,mime_type text,path text,drive_id text,cliente_id text,corporate_scope boolean,category text,read_status text,coverage jsonb,modified_at timestamptz,scanned_at timestamptz,metadata jsonb)
      ON CONFLICT(tenant_id,file_id) DO UPDATE SET revision_key=EXCLUDED.revision_key,name=EXCLUDED.name,mime_type=EXCLUDED.mime_type,path=EXCLUDED.path,
        drive_id=EXCLUDED.drive_id,cliente_id=EXCLUDED.cliente_id,corporate_scope=EXCLUDED.corporate_scope,category=EXCLUDED.category,
        read_status=CASE WHEN EXCLUDED.read_status='folder' THEN 'folder' WHEN EXCLUDED.mime_type='application/vnd.google-apps.shortcut' THEN 'unsupported' WHEN previous.revision_key<>EXCLUDED.revision_key
          OR (previous.metadata->'availability'->>'status'='unavailable' AND previous.metadata->'availability'->>'reason'<>'hierarchy_changed') THEN 'changed' ELSE previous.read_status END,
        coverage=CASE WHEN previous.revision_key<>EXCLUDED.revision_key OR EXCLUDED.mime_type='application/vnd.google-apps.shortcut' THEN EXCLUDED.coverage ELSE previous.coverage END,
        extracted_text=CASE WHEN previous.revision_key<>EXCLUDED.revision_key THEN '' ELSE previous.extracted_text END,
        source_sha256=CASE WHEN previous.revision_key<>EXCLUDED.revision_key THEN NULL ELSE previous.source_sha256 END,
        content_hash=CASE WHEN previous.revision_key<>EXCLUDED.revision_key THEN NULL ELSE previous.content_hash END,
        read_at=CASE WHEN previous.revision_key<>EXCLUDED.revision_key THEN NULL ELSE previous.read_at END,
        modified_at=EXCLUDED.modified_at,scanned_at=EXCLUDED.scanned_at,metadata=previous.metadata || EXCLUDED.metadata,updated_at=now()
      WHERE previous.scanned_at<=EXCLUDED.scanned_at`, [this.options.tenantId, JSON.stringify(values)])
    await client.query(`DELETE FROM alix_drive_corpus_chunk c USING alix_drive_corpus f WHERE c.tenant_id=$1 AND f.tenant_id=c.tenant_id AND f.file_id=c.file_id AND f.file_id=ANY($2::text[]) AND c.revision_key<>f.revision_key`, [this.options.tenantId, entries.map(entry => entry.id)])
  }

  private async inventory(client: PoolClient, run: Run) {
    const path = await this.inside('inventory-entries.jsonl')
    const info = await stat(path)
    const aggregate = await this.json('inventory-aggregate.json')
    const aliases = await this.clientAliases(client)
    const scannedAt = safeDate(aggregate.completedAt) || safeDate(aggregate.startedAt) || info.mtime.toISOString()
    const key = corpusHash(JSON.stringify([path, info.dev, info.ino, info.size, info.mtimeMs, scannedAt, aliases.hash]))
    const stored = checkpointSchema.safeParse(run.inventorySync)
    let checkpoint: Checkpoint = stored.success && stored.data.key === key && stored.data.offset <= info.size ? stored.data : { key, offset: 0, processed: 0, complete: false }
    if (checkpoint.complete) return
    const folders = await this.folderNames(client)
    let entries: DriveCorpusEntry[] = []
    let offset = checkpoint.offset
    const flush = async () => {
      if (!entries.length && offset === checkpoint.offset) return
      const next = { ...checkpoint, offset, processed: checkpoint.processed + entries.length }
      await this.transaction(client, async () => { await this.upsertInventory(client, entries, scannedAt, aliases, folders); await this.saveRun(client, { inventorySync: next, inventoryComplete: false }) })
      checkpoint = next; entries = []
    }
    for await (const line of streamDriveJsonLines(path, checkpoint.offset, info.size, true)) {
      if (line.line.trim()) entries.push(driveCorpusEntry.parse(JSON.parse(line.line)))
      offset = line.offset
      if (entries.length >= 250) await flush()
    }
    await flush()
    const latest = await stat(path)
    if (latest.ino !== info.ino || latest.size !== info.size || latest.mtimeMs !== info.mtimeMs) throw new DriveCorpusIngestionError('INVENTORY_CHANGED', 'O inventário mudou durante a leitura. A retomada usará a nova versão.')
    checkpoint.complete = offset === info.size
    Object.assign(run, { inventorySync: checkpoint, inventoryComplete: checkpoint.complete && aggregate.complete === true, inventoryCompletedAt: scannedAt })
    await this.saveRun(client, run)
  }

  /** Resolve após o inventário completo: uma pasta pode aparecer depois de seus arquivos no JSONL. */
  private async rebuildPaths(client: PoolClient, run: Run, batchSize = 1000, maxBatches = Number.POSITIVE_INFINITY) {
    const folders = await this.folderNames(client)
    const key = corpusHash(JSON.stringify([PATH_RESOLUTION_VERSION, run.inventorySync?.key || null, [...folders]]))
    const stored = pathCheckpointSchema.safeParse(run.pathSync)
    let checkpoint = stored.success && stored.data.key === key ? stored.data : { key, after: '', processed: 0, updated: 0, complete: false }
    let processed = 0; let updated = 0; let batches = 0
    while (!checkpoint.complete && batches < maxBatches) {
      const rows = (await client.query(`SELECT file_id,name,jsonb_build_object('ancestorPaths',metadata->'ancestorPaths','parents',metadata->'parents') AS metadata
        FROM alix_drive_corpus WHERE tenant_id=$1 AND file_id>$2 ORDER BY file_id LIMIT $3`, [this.options.tenantId, checkpoint.after, batchSize])).rows as PathEntry[]
      const values = rows.map(row => {
        const resolved = resolveCorpusPath(row, folders)
        return { file_id: row.file_id, name: row.name, ancestors: row.metadata.ancestorPaths ?? null, path: resolved.path, category: resolved.category, resolution: resolved.resolution }
      })
      const next = { ...checkpoint, after: rows.at(-1)?.file_id || checkpoint.after, processed: checkpoint.processed + rows.length, complete: rows.length < batchSize }
      let changed = 0
      await this.transaction(client, async () => {
        if (values.length) {
          const result = await client.query(`UPDATE alix_drive_corpus AS f SET path=x.path,category=x.category,
            metadata=f.metadata || jsonb_build_object('pathResolution',x.resolution),updated_at=now()
            FROM jsonb_to_recordset($2::jsonb) AS x(file_id text,name text,ancestors jsonb,path text,category text,resolution jsonb)
            WHERE f.tenant_id=$1 AND f.file_id=x.file_id AND f.name=x.name AND f.metadata->'ancestorPaths' IS NOT DISTINCT FROM x.ancestors
              AND (f.path,f.category,f.metadata->'pathResolution') IS DISTINCT FROM (x.path,x.category,x.resolution)`, [this.options.tenantId, JSON.stringify(values)])
          changed = result.rowCount || 0
        }
        next.updated += changed
        await this.saveRun(client, { pathSync: next })
      })
      checkpoint = next; processed += rows.length; updated += changed; batches++
    }
    run.pathSync = checkpoint
    return { processed, updated, complete: checkpoint.complete, totalProcessed: checkpoint.processed, totalUpdated: checkpoint.updated }
  }

  /** Manutenção apenas do catálogo: não abre inventário, recibos, artefatos ou conexões Google. */
  async reindexPaths(options: { batchSize?: number; maxBatches?: number } = {}) {
    if (!this.options.tenantId.trim()) throw new DriveCorpusIngestionError('TENANT_REQUIRED', 'Informe o tenant do catálogo.')
    const batchSize = options.batchSize ?? 1000; const maxBatches = options.maxBatches ?? Number.POSITIVE_INFINITY
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000 || (maxBatches !== Number.POSITIVE_INFINITY && (!Number.isInteger(maxBatches) || maxBatches < 1))) throw new DriveCorpusIngestionError('INVALID_BATCH', 'Informe lotes de 1 a 1000 itens e um número positivo de lotes.')
    const client = await this.pool().connect(); let locked = false
    try {
      locked = Boolean((await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked', [`aletis:drive-corpus:${this.options.tenantId}`])).rows[0]?.locked)
      if (!locked) return { busy: true, processed: 0, updated: 0, complete: false }
      const run = await this.run(client)
      return { busy: false, ...await this.rebuildPaths(client, run, batchSize, maxBatches) }
    } finally {
      if (locked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [`aletis:drive-corpus:${this.options.tenantId}`]).catch(() => undefined)
      client.release()
    }
  }

  /** Suspende o arquivo e seus descendentes antes de aceitar novos recibos ou citações. */
  private async unavailable(client: PoolClient, event: DriveCorpusMetadataEvent, reason: string, hierarchyOnly = false) {
    const availability = { status: 'unavailable', reason, checkedAt: event.observedAt, eventId: event.eventId, ancestorId: event.fileId }
    await client.query(`UPDATE alix_drive_corpus f SET
      read_status=CASE WHEN $4::boolean THEN read_status ELSE 'deferred' END,
      coverage=CASE WHEN $4::boolean THEN coverage ELSE $5::jsonb END,
      extracted_text=CASE WHEN $4::boolean THEN extracted_text ELSE '' END,
      source_sha256=CASE WHEN $4::boolean THEN source_sha256 ELSE NULL END,
      content_hash=CASE WHEN $4::boolean THEN content_hash ELSE NULL END,
      read_at=CASE WHEN $4::boolean THEN read_at ELSE NULL END,
      metadata=(CASE WHEN $4::boolean THEN metadata ELSE metadata-'ingestion'-'ingestionError' END) || jsonb_build_object('availability',$3::jsonb),
      scanned_at=$6,updated_at=now()
      WHERE f.tenant_id=$1 AND f.scanned_at<=$6
        AND (f.file_id=$2 OR f.metadata->'ancestorPaths' @> jsonb_build_array(jsonb_build_array($2::text)))
        AND (NOT $4::boolean OR f.file_id<>$2)
        AND (NOT $4::boolean OR COALESCE(f.metadata->'availability'->>'status','available')='available'
          OR f.metadata->'availability'->>'reason'='hierarchy_changed')`,
    [this.options.tenantId,event.fileId,JSON.stringify(availability),hierarchyOnly,
      JSON.stringify({ status: 'unknown', limitations: ['A fonte está indisponível no Drive; o conteúdo não pode ser usado até nova confirmação.'] }),event.observedAt])
    if (!hierarchyOnly) await client.query(`DELETE FROM alix_drive_corpus_chunk c USING alix_drive_corpus f
      WHERE c.tenant_id=$1 AND f.tenant_id=c.tenant_id AND f.file_id=c.file_id
        AND f.metadata->'availability'->>'status'='unavailable' AND f.metadata->'availability'->>'eventId'=$2`, [this.options.tenantId,event.eventId])
    if (!hierarchyOnly) await client.query(`UPDATE alix_drive_analysis a SET status='superseded',updated_at=now()
      FROM alix_drive_corpus f WHERE a.tenant_id=$1 AND f.tenant_id=a.tenant_id AND f.file_id=a.file_id
      AND f.metadata->'availability'->>'status'='unavailable' AND a.status<>'superseded'`,[this.options.tenantId])
  }

  private async applyMetadata(client: PoolClient, event: DriveCorpusMetadataEvent, aliases: Awaited<ReturnType<DriveCorpusIngestionService['clientAliases']>>, folders: Map<string, string>): Promise<Outcome> {
    const old = (await client.query('SELECT file_id,name,mime_type,scanned_at,metadata FROM alix_drive_corpus WHERE tenant_id=$1 AND file_id=$2 FOR UPDATE', [this.options.tenantId,event.fileId])).rows[0]
    if (old?.metadata?.availability?.eventId === event.eventId) return 'unchanged'
    if (old && new Date(old.scanned_at).getTime() > Date.parse(event.observedAt)) return 'stale'
    if (event.kind === 'unavailable') {
      if (!old) await client.query(`INSERT INTO alix_drive_corpus(tenant_id,file_id,revision_key,name,mime_type,category,coverage,scanned_at)
        VALUES($1,$2,$3,'Arquivo indisponível','application/octet-stream','A classificar',$4::jsonb,$5)`,
      [this.options.tenantId,event.fileId,corpusHash(`unavailable:${event.fileId}`),JSON.stringify(unknownCoverage()),event.observedAt])
      await this.unavailable(client, event, event.reason || 'removed_or_access_lost')
      return 'applied'
    }
    const entry = event.entry!
    // Alteração da pasta suspende os vínculos antigos até cada descendente receber seus metadados atuais.
    if (old?.mime_type === DRIVE_FOLDER_MIME && (old.name !== entry.name || JSON.stringify(old.metadata?.parents || []) !== JSON.stringify(entry.parents))) {
      await this.unavailable(client, event, 'hierarchy_changed', true)
    }
    await this.upsertInventory(client, [entry], event.observedAt, aliases, folders, event)
    const ancestorIds = [...new Set(entry.ancestorPaths.flat())].filter(id => id !== entry.id)
    if (ancestorIds.length) {
      const blocked = (await client.query(`SELECT file_id FROM alix_drive_corpus WHERE tenant_id=$1 AND file_id=ANY($2::text[])
        AND metadata->'availability'->>'status'='unavailable' LIMIT 1`, [this.options.tenantId,ancestorIds])).rows[0]
      if (blocked) {
        await this.unavailable(client, event, 'ancestor_unavailable')
        return 'applied'
      }
    }
    // O leitor pode ter terminado antes da inclusão no catálogo; recupere esse recibo sem depender de outro evento.
    try {
      const prepared = await this.prepareReceipt(client, entry.id)
      if (typeof prepared !== 'string') await this.applyReceipt(client, prepared)
    } catch (error) {
      if (!(error instanceof DriveCorpusIngestionError) && !(error instanceof z.ZodError) && !(error instanceof SyntaxError) && !['ENOENT','EACCES'].includes((error as NodeJS.ErrnoException).code || '')) throw error
    }
    await enqueueDriveAnalysisForCurrentFile(client,this.options.tenantId,entry.id)
    return 'applied'
  }

  private async metadataEvents(client: PoolClient, run: Run) {
    let path: string
    try { path = await this.inside('metadata-events.jsonl') } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { processed: 0, remaining: false }; throw error }
    const info = await stat(path)
    const key = corpusHash(JSON.stringify([path,info.dev,info.ino]))
    const stored = checkpointSchema.safeParse(run.metadataSync)
    if (stored.success && (stored.data.key !== key || stored.data.offset > info.size)) throw new DriveCorpusIngestionError('METADATA_LOG_REPLACED', 'O diário de alterações mudou de identidade ou perdeu bytes; restaure o diário antes de retomar.')
    let checkpoint: Checkpoint = stored.success ? stored.data : { key, offset: 0, processed: 0 }
    const aliases = await this.clientAliases(client)
    const folders = await this.folderNames(client)
    let processed = 0
    for await (const line of streamDriveJsonLines(path, checkpoint.offset, info.size)) {
      const event = driveCorpusMetadataEvent.parse(JSON.parse(line.line))
      const next = { ...checkpoint, offset: line.offset, processed: checkpoint.processed + 1 }
      await this.transaction(client, async () => {
        const outcome = await this.applyMetadata(client, event, aliases, folders)
        const counts = { ...(run.metadataCounts || {}) }
        counts[outcome] = Number(counts[outcome] || 0) + 1
        await this.saveRun(client, { metadataSync: next, metadataCounts: counts, metadataUpdatedAt: event.observedAt })
        run.metadataSync = next; run.metadataCounts = counts; run.metadataUpdatedAt = event.observedAt
      })
      checkpoint = next; processed++
      if (processed >= (this.options.maxEventsPerRun ?? 1000)) break
    }
    return { processed, remaining: checkpoint.offset < info.size }
  }

  private async prepareReceipt(client: PoolClient, fileId: string): Promise<Prepared | Outcome> {
    identifier.parse(fileId)
    const row = (await client.query('SELECT file_id,revision_key,mime_type,read_status,read_at,metadata FROM alix_drive_corpus WHERE tenant_id=$1 AND file_id=$2', [this.options.tenantId, fileId])).rows[0] as Row | undefined
    if (!row || row.read_status === 'folder' || row.mime_type === 'application/vnd.google-apps.shortcut' || row.metadata?.availability?.status === 'unavailable') return 'missing'
    const receipt = driveCorpusReceipt.parse(await this.json(join('receipts', `${fileId}.json`)))
    if (receipt.fileId !== fileId) throw new DriveCorpusIngestionError('RECEIPT_ID_MISMATCH', 'O recibo pertence a outro arquivo.')
    if (receipt.metadataRevision && receipt.metadataRevision !== row.revision_key) return 'stale'
    if ((receipt.fileVersion || null) !== (row.metadata.driveVersion || null) || !sameDate(receipt.modifiedTime, row.metadata.driveModifiedTime)) return 'stale'
    if (row.read_at && Date.parse(receipt.finishedAt) < new Date(row.read_at).getTime()) return 'stale'
    let text = ''; let chunks: DocumentChunk[] = []; let characterMetric = 'none'
    let coverage = driveCorpusCoverage.parse(receipt.coverage)
    let status: string = receipt.status
    if (['complete', 'partial'].includes(status)) {
      if (!receipt.fileVersion && !receipt.modifiedTime) throw new DriveCorpusIngestionError('REVISION_UNVERIFIED', 'O recibo não comprova a revisão do arquivo.')
      if (!receipt.contentKey || !/^[a-f0-9]{64}$/.test(receipt.contentKey) || !receipt.sourceSha256) throw new DriveCorpusIngestionError('SOURCE_PROOF_MISSING', 'Faltam as provas de origem do conteúdo extraído.')
      const artifact = join('artifacts', receipt.contentKey)
      const raw = receipt as Record<string, any>
      if (typeof raw.textPath !== 'string' || typeof raw.extractionPath !== 'string') throw new DriveCorpusIngestionError('ARTIFACT_PATH_MISSING', 'O recibo não informa os artefatos de texto e extração.')
      const [textPath, extractionPath, expectedText, expectedExtraction] = await Promise.all([this.inside(raw.textPath), this.inside(raw.extractionPath), this.inside(join(artifact, 'text.txt')), this.inside(join(artifact, 'extraction.json'))])
      if (textPath !== expectedText || extractionPath !== expectedExtraction) throw new DriveCorpusIngestionError('ARTIFACT_KEY_MISMATCH', 'Os artefatos não correspondem à origem declarada no recibo.')
      const maximum = this.options.maxArtifactBytes ?? 64 * 1024 * 1024
      if ((await stat(textPath)).size > maximum) throw new DriveCorpusIngestionError('ARTIFACT_TOO_LARGE', 'O texto requer um orçamento maior de processamento; nenhum trecho foi descartado.')
      const extracted = await this.json(extractionPath, maximum)
      const source = await this.json(join(artifact, 'source.json'))
      if (source.sourceSha256 !== receipt.sourceSha256 || (row.metadata.driveMd5 && source.md5Checksum !== row.metadata.driveMd5)) throw new DriveCorpusIngestionError('SOURCE_HASH_MISMATCH', 'A prova de integridade não corresponde ao recibo e inventário.')
      const binaryReuse = Boolean(row.metadata.driveMd5 && source.md5Checksum === row.metadata.driveMd5 && source.originalMimeType === row.mime_type)
      if ((source.sourceFileId !== fileId && !binaryReuse) || (source.originalMimeType && source.originalMimeType !== row.mime_type)
        || (row.mime_type.startsWith('application/vnd.google-apps.') && (source.sourceFileId !== fileId || source.sourceFileVersion !== receipt.fileVersion))) {
        throw new DriveCorpusIngestionError('SOURCE_IDENTITY_MISMATCH', 'O artefato foi produzido de outro arquivo ou tipo sem prova de conteúdo idêntico.')
      }
      text = await readFile(textPath, 'utf8')
      if (typeof extracted.extractedText !== 'string' || extracted.extractedText !== text) throw new DriveCorpusIngestionError('TEXT_MISMATCH', 'O texto e a extração divergem; o conteúdo não foi importado.')
      if (text.includes('\u0000')) throw new DriveCorpusIngestionError('TEXT_ENCODING_UNSUPPORTED', 'O texto contém um caractere incompatível com o catálogo e requer revisão da extração.')
      const characters = codePoints(text)
      if (receipt.characters !== characters && receipt.characters !== text.length) throw new DriveCorpusIngestionError('CHARACTER_COUNT_MISMATCH', 'A contagem do recibo não corresponde ao texto completo.')
      characterMetric = receipt.characters === characters ? 'unicode_codepoints' : 'utf16_code_units'
      const parsedCoverage = driveCorpusCoverage.safeParse(extracted.metadata?.extractionCoverage)
      if (parsedCoverage.success && parsedCoverage.data.status !== 'complete') coverage = { ...parsedCoverage.data, limitations: [...new Set([...coverage.limitations, ...parsedCoverage.data.limitations])] }
      if (!text.trim()) coverage = { ...coverage, status: 'partial', limitations: [...coverage.limitations, 'Nenhum texto verificável está disponível no arquivo.'] }
      if (status === 'complete' && coverage.status !== 'complete') status = 'partial'
      chunks = completeDocumentChunks({ extractedText: text, chunks: Array.isArray(extracted.chunks) ? extracted.chunks : [] }, 3200)
    }
    const hash = text ? corpusHash(text) : null
    const fingerprint = corpusHash(JSON.stringify([row.revision_key, hash, receipt.sourceSha256 || null, status, coverage]))
    return { row, receipt, text, chunks, coverage, status, fingerprint, hash, characterMetric }
  }

  private async applyReceipt(client: PoolClient, prepared: Prepared): Promise<Outcome> {
    const { row, receipt } = prepared
    const current = (await client.query('SELECT revision_key,read_status,read_at,metadata FROM alix_drive_corpus WHERE tenant_id=$1 AND file_id=$2 FOR UPDATE', [this.options.tenantId, row.file_id])).rows[0]
    if (!current || current.metadata?.availability?.status === 'unavailable' || current.revision_key !== row.revision_key || (current.read_at && Date.parse(receipt.finishedAt) < new Date(current.read_at).getTime())) return 'stale'
    if (current.metadata?.ingestion?.fingerprint === prepared.fingerprint) {
      // A origem foi novamente validada; uma falha transitória anterior não pode permanecer como erro atual.
      if (current.metadata?.ingestionError) await client.query(`UPDATE alix_drive_corpus SET metadata=metadata-'ingestionError',updated_at=now()
        WHERE tenant_id=$1 AND file_id=$2 AND revision_key=$3`, [this.options.tenantId,row.file_id,row.revision_key])
      return 'unchanged'
    }
    // Uma tentativa que falhou não apaga uma leitura válida da mesma revisão.
    if (['complete', 'partial'].includes(current.read_status) && !['complete', 'partial'].includes(prepared.status)) return 'unchanged'
    await client.query(`UPDATE alix_drive_corpus SET read_status=$3,coverage=$4::jsonb,extracted_text=$5,source_sha256=$6,content_hash=$7,read_at=$8,
      metadata=(metadata-'ingestionError') || $9::jsonb,updated_at=now() WHERE tenant_id=$1 AND file_id=$2 AND revision_key=$10`,
    [this.options.tenantId,row.file_id,prepared.status,JSON.stringify(prepared.coverage),prepared.text,receipt.sourceSha256 || null,prepared.hash,receipt.finishedAt,
      JSON.stringify({ ingestion: { version: 1, fingerprint: prepared.fingerprint, characterMetric: prepared.characterMetric, characters: receipt.characters, importedAt: new Date().toISOString() } }),row.revision_key])
    await client.query('DELETE FROM alix_drive_corpus_chunk WHERE tenant_id=$1 AND file_id=$2', [this.options.tenantId,row.file_id])
    for (let offset = 0; offset < prepared.chunks.length; offset += 250) {
      const chunks = prepared.chunks.slice(offset, offset + 250).map((chunk, index) => ({
        id: `dc_${corpusHash(JSON.stringify([this.options.tenantId,row.file_id,row.revision_key,offset+index,chunk.text]))}`,
        tenant_id: this.options.tenantId,file_id: row.file_id,revision_key: row.revision_key,ordinal: offset+index,text: chunk.text,
        source: chunk.source || 'document:extracted-text',page: Number.isInteger(chunk.pageStart) ? chunk.pageStart : null,sheet: chunk.sheet || null,
        metadata: { ...(chunk.metadata || {}), parserChunkId: chunk.id, pageEnd: chunk.pageEnd || null, table: chunk.table || null },
      }))
      await client.query(`INSERT INTO alix_drive_corpus_chunk(id,tenant_id,file_id,revision_key,ordinal,text,source,page,sheet,metadata)
        SELECT x.* FROM jsonb_to_recordset($1::jsonb) AS x(id text,tenant_id text,file_id text,revision_key text,ordinal integer,text text,source text,page integer,sheet text,metadata jsonb)`, [JSON.stringify(chunks)])
    }
    await enqueueDriveAnalysisForCurrentFile(client,this.options.tenantId,row.file_id)
    return 'applied'
  }

  async ingestReceipt(fileId: string): Promise<Outcome> {
    const client = await this.pool().connect()
    try { const prepared = await this.prepareReceipt(client, fileId); return typeof prepared === 'string' ? prepared : await this.transaction(client, () => this.applyReceipt(client, prepared)) }
    finally { client.release() }
  }

  private async events(client: PoolClient, run: Run) {
    let path: string
    try { path = await this.inside('read-events.jsonl') } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { processed: 0, remaining: false }; throw error }
    const info = await stat(path)
    const key = corpusHash(JSON.stringify([path, info.dev, info.ino]))
    const stored = checkpointSchema.safeParse(run.eventSync)
    let checkpoint: Checkpoint = stored.success && stored.data.key === key && stored.data.offset <= info.size ? stored.data : { key, offset: 0, processed: 0 }
    let processed = 0
    for await (const line of streamDriveJsonLines(path, checkpoint.offset, info.size)) {
      let fileId: string | undefined; let prepared: Prepared | Outcome = 'rejected'; let reason: string | undefined
      try {
        if (!line.line.trim()) prepared = 'unchanged'
        else { const event = eventSchema.parse(JSON.parse(line.line)); fileId = event.fileId; prepared = await this.prepareReceipt(client, fileId) }
      } catch (error) {
        // Falha de banco/transporte precisa repetir o evento. Artefatos inválidos ficam sinalizados e não bloqueiam os demais.
        if (!(error instanceof DriveCorpusIngestionError) && !(error instanceof z.ZodError) && !(error instanceof SyntaxError) && !['ENOENT','EACCES'].includes((error as NodeJS.ErrnoException).code || '')) throw error
        reason = error instanceof DriveCorpusIngestionError ? error.code : 'INVALID_OR_MISSING_ARTIFACT'
      }
      const next = { ...checkpoint, offset: line.offset, processed: checkpoint.processed + 1 }
      await this.transaction(client, async () => {
        const outcome = typeof prepared === 'string' ? prepared : await this.applyReceipt(client, prepared)
        if (reason && fileId) await client.query(`UPDATE alix_drive_corpus SET read_status=CASE WHEN read_status IN ('complete','partial','folder') THEN read_status ELSE 'failed' END,
          metadata=metadata || $3::jsonb,updated_at=now() WHERE tenant_id=$1 AND file_id=$2`, [this.options.tenantId,fileId,JSON.stringify({ ingestionError: { code: reason, at: new Date().toISOString() } })])
        run.eventSync = next
        run.ingestionCounts ||= {}
        run.ingestionCounts[outcome] = Number(run.ingestionCounts[outcome] || 0) + 1
        if (reason) run.lastIngestionErrors = [...(Array.isArray(run.lastIngestionErrors) ? run.lastIngestionErrors : []), { fileId: fileId || null, code: reason, at: new Date().toISOString() }].slice(-25)
        await this.saveRun(client, run)
      })
      checkpoint = next; processed++
      if (processed >= (this.options.maxEventsPerRun ?? 1000)) break
    }
    return { processed, remaining: checkpoint.offset < info.size, offset: checkpoint.offset }
  }

  async syncOnce() {
    if (!this.options.tenantId.trim()) throw new DriveCorpusIngestionError('TENANT_REQUIRED', 'Informe o tenant do catálogo.')
    const client = await this.pool().connect(); let locked = false
    try {
      locked = Boolean((await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked', [`aletis:drive-corpus:${this.options.tenantId}`])).rows[0]?.locked)
      if (!locked) return { busy: true, processed: 0, remaining: true }
      const run = await this.run(client)
      await this.inventory(client, run)
      const metadata = await this.metadataEvents(client, run)
      await this.rebuildPaths(client, run)
      const result = await this.events(client, run)
      try {
        run.incrementalProgress = driveIncrementalProgress.parse(await this.json('incremental-progress.json'))
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      try {
        const progress = await this.json('progress.json')
        const counts: Record<string, number> = {}
        for (const key of ['totalFiles','queuedFiles','completedFiles','complete','partial','failed','unsupported','deferred','characters']) if (Number.isSafeInteger(progress[key]) && progress[key] >= 0) counts[key] = progress[key]
        const status = String(progress.status || '')
        const paused = status.startsWith('paused_') || ['paused', 'stopped', 'interrupted'].includes(status)
        const completed = ['completed', 'complete', 'finished'].includes(status)
        const readingStatus = status === 'paused_auth' ? 'paused_auth' : paused ? 'paused' : counts.queuedFiles && !completed ? 'reading' : counts.queuedFiles || counts.partial || counts.failed || counts.deferred ? 'partial' : 'complete'
        Object.assign(run, { readerProgress: counts, readingUpdatedAt: safeDate(progress.updatedAt), readingStatus })
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      try {
        const organization = await this.json('organization-result.json')
        const selected = z.object({ hubId: identifier, hubUrl: z.string().url() }).safeParse(organization)
        if (selected.success && selected.data.hubUrl === `https://drive.google.com/drive/folders/${selected.data.hubId}`) run.organization = selected.data
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      run.ingestionUpdatedAt = new Date().toISOString()
      await this.saveRun(client, run)
      return { busy: false, ...result, metadataProcessed: metadata.processed, remaining: metadata.remaining || result.remaining,
        inventoryComplete: Boolean(run.inventoryComplete), inventoryRecords: run.inventorySync?.processed || 0 }
    } finally {
      if (locked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [`aletis:drive-corpus:${this.options.tenantId}`]).catch(() => undefined)
      client.release()
    }
  }
}
