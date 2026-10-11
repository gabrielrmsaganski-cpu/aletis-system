import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { appendFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DriveCorpusIngestionService, streamDriveJsonLines } from '../../src/services/google-workspace/DriveCorpusIngestionService.js'
import { corpusHash, driveCorpusReceipt, DRIVE_FOLDER_MIME } from '../../src/services/google-workspace/DriveCorpusTypes.js'

it('recibos exigem timestamp ISO válido e aceitam offset explícito com microssegundos', () => {
  const receipt = { version: 1, fileId: 'synthetic', status: 'deferred', coverage: { status: 'unknown' }, finishedAt: '2026-09-07T20:48:28.598521+00:00' }
  expect(driveCorpusReceipt.safeParse(receipt).success).toBe(true)
  expect(driveCorpusReceipt.safeParse({ ...receipt, finishedAt: '2026-09-07T17:48:28.598521-03:00', modifiedTime: '2026-09-01T00:00:00+00:00' }).success).toBe(true)
  for (const finishedAt of ['2026-09-07T20:48:28', '2026-02-30T20:48:28Z', '2026-09-07T20:48:28+99:00', 'inválido']) {
    expect(driveCorpusReceipt.safeParse({ ...receipt, finishedAt }).success).toBe(false)
  }
  expect(driveCorpusReceipt.safeParse({ ...receipt, modifiedTime: 'sem data' }).success).toBe(false)
})

it('cursor JSONL usa bytes Unicode e mantém linha final incompleta para retomada', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aletis-jsonl-'))
  try {
    const path = join(directory, 'events.jsonl')
    const first = JSON.stringify({ nome: 'ação 📄' }) + '\n'
    await writeFile(path, first + '{"incompleto":')
    const lines = []; for await (const line of streamDriveJsonLines(path)) lines.push(line)
    expect(lines).toEqual([{ line: first.trim(), offset: Buffer.byteLength(first) }])
    await appendFile(path, 'true}\n')
    const resumed = []; for await (const line of streamDriveJsonLines(path, lines[0].offset)) resumed.push(line)
    expect(resumed.map(line => JSON.parse(line.line))).toEqual([{ incompleto: true }])
  } finally { await rm(directory, { recursive: true, force: true }) }
})

describe.skipIf(!process.env.ALETIS_DRIVE_CORPUS_FIXTURE_FILE)('ingestão de corpus em PostgreSQL descartável', () => {
  const schema = `drive_ingestion_${randomUUID().replaceAll('-', '')}`
  let pool: pg.Pool
  let directory = ''
  const tenantId = `fixture-${randomUUID()}`
  const sourceHash = createHash('sha256').update('conteúdo binário sintético').digest('hex')
  const md5 = createHash('md5').update('conteúdo binário sintético').digest('hex')
  const baseEntry = (id = 'file-a') => ({ id, name: `${id}.txt`, mimeType: 'text/plain', parents: [] as string[], size: '99', version: '1', md5Checksum: md5, modifiedTime: '2026-09-01T00:00:00Z', ancestorPaths: [[id]], corporateScope: true, linkedClientIds: ['client-a'] })
  const folderEntry = (id: string, name: string, ancestors = [id]) => ({ ...baseEntry(id), name, mimeType: DRIVE_FOLDER_MIME, ancestorPaths: [ancestors] })
  const service = (maxEventsPerRun = 1000, customPool?: pg.Pool) => new DriveCorpusIngestionService({ privateRoot: directory, tenantId, pool: customPool || pool, maxEventsPerRun })
  const row = async (fileId = 'file-a') => (await pool.query('SELECT * FROM alix_drive_corpus WHERE tenant_id=$1 AND file_id=$2', [tenantId,fileId])).rows[0]
  async function inventory(entries = [baseEntry()], scannedAt = '2026-09-07T12:00:00Z') {
    await writeFile(join(directory, 'inventory-entries.jsonl'), entries.map(entry => JSON.stringify(entry)).join('\n') + '\n')
    await writeFile(join(directory, 'inventory-aggregate.json'), JSON.stringify({ version: 1, complete: true, startedAt: scannedAt, completedAt: scannedAt }))
  }
  async function receipt(fileId = 'file-a', text = 'Texto sintético. Referência final verificável.', options: Record<string, any> = {}) {
    const contentKey = corpusHash(JSON.stringify([fileId,text,options.version || '1']))
    const artifact = join(directory, 'artifacts', contentKey)
    await mkdir(artifact, { recursive: true })
    const coverage = options.coverage || { status: 'complete', limitations: [] }
    await writeFile(join(artifact, 'text.txt'), text)
    await writeFile(join(artifact, 'extraction.json'), JSON.stringify({ kind: 'text', extractedText: text, chunks: options.chunks || [{ id: 'page-first', kind: 'text', ordinal: 0, text: text.slice(0, 80), source: 'pdf:page:3', pageStart: 3, pageEnd: 3, evidenceIds: [] }], metadata: { extractionCoverage: options.parserCoverage || coverage } }))
    await writeFile(join(artifact, 'source.json'), JSON.stringify({ sourceFileId: options.sourceId || fileId, sourceFileVersion: options.version || '1', originalMimeType: options.mimeType || 'text/plain', sourceSha256: options.sourceHash || sourceHash, md5Checksum: options.md5 || md5 }))
    const payload = { version: 1, fileId, fileVersion: options.version || '1', modifiedTime: '2026-09-01T00:00:00Z', contentKey, sourceSha256: sourceHash, status: options.status || 'complete', extractionPath: join(artifact, 'extraction.json'), textPath: join(artifact, 'text.txt'), characters: options.characters ?? [...text].length, coverage, finishedAt: options.finishedAt || '2026-09-07T13:00:00.000Z' }
    await writeFile(join(directory, 'receipts', `${fileId}.json`), JSON.stringify(payload))
    return payload
  }
  async function event(fileId = 'file-a') { await appendFile(join(directory, 'read-events.jsonl'), JSON.stringify({ fileId, fileVersion: '1', finishedAt: '2026-09-07T13:00:00.000Z', nota: 'ação 📄' }) + '\n') }
  async function metadata(entry: ReturnType<typeof baseEntry> | string, options: Record<string, unknown> = {}) {
    const item = { version: 1, eventId: randomUUID(), observedAt: '2026-09-08T13:00:00Z',
      ...(typeof entry === 'string' ? { kind: 'unavailable', fileId: entry, reason: 'removed_or_access_lost' } : { kind: 'upsert', fileId: entry.id, entry }), ...options }
    await appendFile(join(directory, 'metadata-events.jsonl'), JSON.stringify(item) + '\n')
    return item
  }
  beforeAll(async () => {
    const url = (await readFile(process.env.ALETIS_DRIVE_CORPUS_FIXTURE_FILE!, 'utf8')).trim()
    const parsed = new URL(url)
    if (!['127.0.0.1','localhost'].includes(parsed.hostname) || parsed.port !== '55436' || parsed.pathname !== '/aletis_implementation_fixture') throw new Error('Fixture local obrigatória.')
    pool = new pg.Pool({ connectionString: url, max: 4, options: `-c search_path=${schema},public` })
    await pool.query(`CREATE SCHEMA ${schema}`)
    await pool.query('CREATE TABLE cliente(id text primary key,payload jsonb not null)')
    await pool.query(await readFile(new URL('../../src/db/migrations/0043_alix_drive_corpus.sql', import.meta.url), 'utf8'))
    await pool.query(await readFile(new URL('../../src/db/migrations/0044_alix_drive_analysis.sql', import.meta.url), 'utf8'))
  })
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'aletis-drive-ingestion-'))
    await mkdir(join(directory, 'receipts'))
    await writeFile(join(directory, 'read-events.jsonl'), '')
    await pool.query('TRUNCATE alix_drive_corpus_chunk,alix_drive_corpus,alix_drive_corpus_run,cliente CASCADE')
    await pool.query("INSERT INTO cliente VALUES('client-a','{}'),('client-b','{}'),('legacy-a','{\"identityMerge\":{\"status\":\"merged\",\"canonicalId\":\"client-a\"}}')")
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('A ingestão não pode acessar Drive/LLM ou rede externa') }))
  })
  afterEach(async () => { vi.unstubAllGlobals(); await rm(directory, { recursive: true, force: true }) })
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end() } })

  it('importa todo inventário em lotes e resolve aliases sem atribuir cliente ambíguo', async () => {
    const entries = Array.from({ length: 620 }, (_, index) => baseEntry(`file-${index}`))
    entries[0].linkedClientIds = ['legacy-a','client-a']
    entries[1].linkedClientIds = ['client-a','client-b']
    entries[2].linkedClientIds = ['client-a','missing']
    entries[3].mimeType = DRIVE_FOLDER_MIME
    await inventory(entries)
    const result = await service().syncOnce()
    expect(result).toMatchObject({ inventoryComplete: true, inventoryRecords: 620 })
    expect((await pool.query('SELECT count(*)::int n FROM alix_drive_corpus')).rows[0].n).toBe(620)
    expect((await row('file-0')).cliente_id).toBe('client-a')
    expect((await row('file-1')).cliente_id).toBeNull()
    expect((await row('file-2')).cliente_id).toBeNull()
    expect((await row('file-3')).read_status).toBe('folder')
    const before = (await row('file-0')).updated_at
    await service().syncOnce()
    expect((await row('file-0')).updated_at).toEqual(before)
  })
  it('resolve caminho por nomes mesmo quando arquivo precede pastas em outros lotes', async () => {
    const entries = Array.from({ length: 251 }, (_, index) => baseEntry(`file-${index}`))
    entries[0].ancestorPaths = [['root-id', 'contracts-id', entries[0].id]]
    entries.push(folderEntry('contracts-id', 'Contratos', ['root-id', 'contracts-id']), folderEntry('root-id', 'Drive da equipe'))
    await inventory(entries); await service().syncOnce()
    const stored = await row('file-0')
    expect(stored.path).toBe('Drive da equipe/Contratos/file-0.txt')
    expect(stored.category).toBe('Contratos e garantias')
    expect(stored.metadata.pathResolution).toEqual({ version: 1, status: 'complete', unresolvedAncestors: 0 })
    expect(stored.metadata.ancestorPaths).toEqual(entries[0].ancestorPaths)
  })
  it('caminho desconhecido fica explícito e nunca usa nomes de outro tenant', async () => {
    await inventory([{ ...baseEntry(), ancestorPaths: [['foreign-only', 'shared-id', 'file-a']] }, folderEntry('shared-id', 'Pasta autorizada')])
    await pool.query(`INSERT INTO alix_drive_corpus(tenant_id,file_id,revision_key,name,mime_type,path,category,coverage,scanned_at,metadata)
      VALUES($1,'foreign-only','v1','Nome privado externo',$2,'INALTERADO','A classificar','{"status":"unknown"}',now(),'{}'),($1,'shared-id','v1','Outro nome privado',$2,'INALTERADO','A classificar','{"status":"unknown"}',now(),'{}')`, [`other-${tenantId}`, DRIVE_FOLDER_MIME])
    await service().syncOnce()
    expect(await row()).toMatchObject({ path: '[Pasta não identificada]/Pasta autorizada/file-a.txt', metadata: { pathResolution: { status: 'partial', unresolvedAncestors: 1 } } })
    expect((await pool.query('SELECT path FROM alix_drive_corpus WHERE tenant_id=$1', [`other-${tenantId}`])).rows).toEqual([{ path: 'INALTERADO' }, { path: 'INALTERADO' }])
  })
  it('reindexa legado em lotes de 1000 retomáveis sem reler arquivos nem alterar conteúdo e cursor de eventos', async () => {
    const entries = Array.from({ length: 2104 }, (_, index) => ({ ...baseEntry(index === 0 ? 'file-a' : `file-${index}`), ancestorPaths: [['folder-id', index === 0 ? 'file-a' : `file-${index}`]] }))
    entries.push(folderEntry('folder-id', 'Documentos'))
    await inventory(entries); await receipt(); await event(); await service().syncOnce()
    const original = await row()
    const originalChunks = (await pool.query('SELECT * FROM alix_drive_corpus_chunk ORDER BY id')).rows
    const eventSync = (await pool.query('SELECT payload FROM alix_drive_corpus_run WHERE tenant_id=$1', [tenantId])).rows[0].payload.eventSync
    await pool.query("UPDATE alix_drive_corpus SET path='folder-id/file-id',metadata=metadata-'pathResolution' WHERE tenant_id=$1", [tenantId])
    await pool.query("UPDATE alix_drive_corpus_run SET payload=payload-'pathSync' WHERE tenant_id=$1", [tenantId])
    const isolated = new DriveCorpusIngestionService({ privateRoot: join(directory, 'not-present'), tenantId, pool })
    expect(await isolated.reindexPaths({ batchSize: 1000, maxBatches: 1 })).toMatchObject({ processed: 1000, updated: 1000, complete: false, totalProcessed: 1000 })
    expect(await isolated.reindexPaths({ batchSize: 1000, maxBatches: 1 })).toMatchObject({ processed: 1000, updated: 1000, complete: false, totalProcessed: 2000 })
    expect(await isolated.reindexPaths({ batchSize: 1000, maxBatches: 1 })).toMatchObject({ processed: 105, updated: 105, complete: true, totalProcessed: 2105 })
    const finished = await row()
    for (const key of ['revision_key', 'cliente_id', 'read_status', 'coverage', 'extracted_text', 'source_sha256', 'content_hash', 'read_at']) expect(finished[key]).toEqual(original[key])
    expect(finished.metadata.ingestion).toEqual(original.metadata.ingestion)
    expect((await pool.query('SELECT * FROM alix_drive_corpus_chunk ORDER BY id')).rows).toEqual(originalChunks)
    expect((await pool.query('SELECT payload FROM alix_drive_corpus_run WHERE tenant_id=$1', [tenantId])).rows[0].payload.eventSync).toEqual(eventSync)
    expect(await isolated.reindexPaths()).toMatchObject({ processed: 0, updated: 0, complete: true })
    expect((await row()).updated_at).toEqual(finished.updated_at)
  })
  it('renomear pasta refaz caminhos de descendentes sem regredir a IDs nem perder a leitura', async () => {
    const file = { ...baseEntry(), ancestorPaths: [['folder-id', 'file-a']] }
    await inventory([file, folderEntry('folder-id', 'Contratos')]); await receipt(); await event(); await service().syncOnce()
    const original = await row()
    // A chave também detecta mudança de nomes no catálogo sem precisar reler o JSONL.
    await pool.query('UPDATE alix_drive_corpus SET name=$3 WHERE tenant_id=$1 AND file_id=$2', [tenantId, 'folder-id', 'Financeiro'])
    expect(await service().reindexPaths()).toMatchObject({ updated: 2, complete: true })
    expect(await row()).toMatchObject({ path: 'Financeiro/file-a.txt', category: 'Financeiro', extracted_text: original.extracted_text, revision_key: original.revision_key })
    await inventory([file, folderEntry('folder-id', 'Modelos')], '2026-09-07T14:00:00Z')
    await service().syncOnce()
    expect(await row()).toMatchObject({ path: 'Modelos/file-a.txt', category: 'Modelos e procedimentos', extracted_text: original.extracted_text, read_at: original.read_at })
  })
  it('falha no checkpoint de caminhos reverte o lote e a retomada refaz somente trabalho não confirmado', async () => {
    await inventory(); await service().syncOnce()
    await pool.query("UPDATE alix_drive_corpus SET path='legado',metadata=metadata-'pathResolution' WHERE tenant_id=$1", [tenantId])
    await pool.query("UPDATE alix_drive_corpus_run SET payload=payload-'pathSync' WHERE tenant_id=$1", [tenantId])
    const connection = await pool.connect(); const query = connection.query.bind(connection)
    let injected = false
    const wrapped = new Proxy(connection, { get(target, name) {
      if (name === 'query') return async (sql: string, values?: unknown[]) => {
        if (!injected && sql.startsWith('INSERT INTO alix_drive_corpus_run') && String(values?.[1]).includes('pathSync')) { injected = true; throw new Error('Checkpoint de caminhos interrompido') }
        return query(sql, values)
      }
      const value = Reflect.get(target, name); return typeof value === 'function' ? value.bind(target) : value
    } })
    await expect(service(1000, { connect: async () => wrapped } as unknown as pg.Pool).reindexPaths()).rejects.toThrow('Checkpoint de caminhos interrompido')
    expect((await row()).path).toBe('legado')
    expect((await pool.query('SELECT payload FROM alix_drive_corpus_run WHERE tenant_id=$1', [tenantId])).rows[0].payload.pathSync).toBeUndefined()
    expect(await service().reindexPaths()).toMatchObject({ processed: 1, updated: 1, complete: true })
    expect((await row()).path).toBe('file-a.txt')
  })
  it('preserva texto inteiro Unicode, final do arquivo e origem de página/células nos chunks', async () => {
    await inventory(); await service().syncOnce()
    const text = '📄 Início. ' + 'Dados sintéticos completos. '.repeat(1600) + 'ReferenciaFinalIngestaoXYZ'
    await receipt('file-a', text, { chunks: [{ id: 'cell', kind: 'table', ordinal: 0, text: '📄 Início.', source: 'xlsx:Operações!A1:B5000', sheet: 'Operações', metadata: { rowStart: 1, rowEnd: 5000 }, evidenceIds: [] }] })
    expect(await service().ingestReceipt('file-a')).toBe('applied')
    const stored = await row()
    expect(stored.extracted_text).toBe(text)
    expect(stored.metadata.ingestion.characterMetric).toBe('unicode_codepoints')
    const chunks = (await pool.query('SELECT * FROM alix_drive_corpus_chunk ORDER BY ordinal')).rows
    expect(chunks.every(chunk => chunk.text.length <= 3200)).toBe(true)
    expect(chunks[0]).toMatchObject({ sheet: 'Operações', source: 'xlsx:Operações!A1:B5000', metadata: { rowEnd: 5000 } })
    expect(chunks.map(chunk => chunk.text).join(' ')).toContain('ReferenciaFinalIngestaoXYZ')
    expect((await pool.query("SELECT count(*)::int n FROM alix_drive_corpus_chunk WHERE search_vector @@ plainto_tsquery('portuguese','ReferenciaFinalIngestaoXYZ')")).rows[0].n).toBeGreaterThan(0)
  })
  it('nova revisão invalida texto e chunks; recibo antigo não restaura a fonte obsoleta', async () => {
    await inventory(); await service().syncOnce(); await receipt(); await service().ingestReceipt('file-a')
    await inventory([{ ...baseEntry(), version: '2' }], '2026-09-07T14:00:00Z')
    await service().syncOnce()
    expect(await row()).toMatchObject({ read_status: 'changed', extracted_text: '', source_sha256: null, content_hash: null })
    expect((await pool.query('SELECT count(*)::int n FROM alix_drive_corpus_chunk')).rows[0].n).toBe(0)
    expect(await service().ingestReceipt('file-a')).toBe('stale')
    await receipt('file-a', 'Versão atual', { version: '2', finishedAt: '2026-09-07T15:00:00.000Z' })
    expect(await service().ingestReceipt('file-a')).toBe('applied')
    expect((await row()).extracted_text).toBe('Versão atual')
  })
  it('inventário mais antigo não reverte metadata, revisão ou cliente atual', async () => {
    await inventory([{ ...baseEntry(), version: '2' }], '2026-09-07T14:00:00Z'); await service().syncOnce()
    await inventory([{ ...baseEntry(), linkedClientIds: ['client-b'] }], '2026-09-07T12:00:00Z'); await service().syncOnce()
    expect(await row()).toMatchObject({ cliente_id: 'client-a', metadata: { driveVersion: '2' } })
  })
  it('inclui arquivo novo e recupera recibo concluído antes do evento de metadados', async () => {
    await inventory(); await service().syncOnce()
    await receipt('file-new', 'Última página do novo documento.'); await event('file-new'); await service().syncOnce()
    await metadata(baseEntry('file-new'))
    expect(await service().syncOnce()).toMatchObject({ metadataProcessed: 1, remaining: false })
    expect(await row('file-new')).toMatchObject({ read_status: 'complete', extracted_text: 'Última página do novo documento.', metadata: { availability: { status: 'available' } } })
  })
  it('atalho de navegação não entra como documento pendente de leitura', async () => {
    await inventory(); await service().syncOnce()
    await metadata({ ...baseEntry('shortcut-a'), mimeType: 'application/vnd.google-apps.shortcut' }); await service().syncOnce()
    const shortcut=await row('shortcut-a')
    expect(shortcut).toMatchObject({read_status:'unsupported',extracted_text:'',coverage:{status:'unknown'}})
    expect(shortcut.coverage.limitations.join(' ')).toContain('atalho')
    expect(await service().ingestReceipt('shortcut-a')).toBe('missing')
  })
  it('mudança contínua de revisão invalida texto e recusa recibo antigo até a nova extração', async () => {
    await inventory(); await receipt(); await event(); await service().syncOnce()
    await metadata({ ...baseEntry(), version: '2' }); await service().syncOnce()
    expect(await row()).toMatchObject({ read_status: 'changed', extracted_text: '', metadata: { driveVersion: '2' } })
    expect(await service().ingestReceipt('file-a')).toBe('stale')
    await receipt('file-a', 'Texto da revisão 2.', { version: '2', finishedAt: '2026-09-08T14:00:00Z' }); await event()
    await service().syncOnce()
    expect((await row()).extracted_text).toBe('Texto da revisão 2.')
  })
  it('recibo novo deve corresponder ao hash integral dos metadados, não apenas ao número de versão', async () => {
    await inventory(); await service().syncOnce()
    const value = await receipt()
    await writeFile(join(directory,'receipts','file-a.json'),JSON.stringify({...value,metadataRevision:corpusHash('outra revisão com mesmo número')}))
    expect(await service().ingestReceipt('file-a')).toBe('stale')
    expect((await row()).extracted_text).toBe('')
    await writeFile(join(directory,'receipts','file-a.json'),JSON.stringify({...value,metadataRevision:(await row()).revision_key}))
    expect(await service().ingestReceipt('file-a')).toBe('applied')
  })
  it('remoção suspende fonte, apaga texto pesquisável e não é revertida por recibo ou inventário antigo', async () => {
    await inventory(); await receipt(); await event(); await service().syncOnce()
    await metadata('file-a'); await service().syncOnce()
    const removed = await row()
    expect(removed).toMatchObject({ read_status: 'deferred', extracted_text: '', source_sha256: null, metadata: { availability: { status: 'unavailable' } } })
    expect((await pool.query('SELECT count(*)::int n FROM alix_drive_corpus_chunk')).rows[0].n).toBe(0)
    expect(await service().ingestReceipt('file-a')).toBe('missing')
    await inventory([{ ...baseEntry(), linkedClientIds: ['client-b'] }]); await event(); await service().syncOnce()
    expect(await row()).toMatchObject({ cliente_id: 'client-a', extracted_text: '', metadata: { availability: { status: 'unavailable' } } })
  })
  it('restauração confirmada reabre a mesma revisão e recupera texto sem duplicar os trechos', async () => {
    await inventory(); await receipt(); await event(); await service().syncOnce()
    const original = await row()
    await metadata('file-a'); await service().syncOnce()
    await metadata(baseEntry(), { observedAt: '2026-09-08T14:00:00Z' }); await service().syncOnce()
    expect(await row()).toMatchObject({ read_status: 'complete', extracted_text: original.extracted_text, metadata: { availability: { status: 'available' } } })
    expect((await pool.query('SELECT count(*)::int n FROM alix_drive_corpus_chunk')).rows[0].n).toBe(1)
  })
  it('perda de pasta suspende descendentes no mesmo evento, sem atingir outro tenant', async () => {
    await inventory([folderEntry('folder-a', 'Contratos'), { ...baseEntry(), parents: ['folder-a'], ancestorPaths: [['folder-a','file-a']] }])
    await receipt(); await event(); await service().syncOnce()
    await pool.query(`INSERT INTO alix_drive_corpus(tenant_id,file_id,revision_key,name,mime_type,category,read_status,coverage,extracted_text,scanned_at,metadata)
      VALUES('other','file-a','v1','Outro acervo','text/plain','A classificar','complete','{"status":"complete"}','Texto de outro tenant',now(),'{"ancestorPaths":[["folder-a","file-a"]]}')`)
    await metadata('folder-a'); await service().syncOnce()
    expect((await row()).metadata.availability.status).toBe('unavailable')
    expect((await row()).extracted_text).toBe('')
    expect((await pool.query("SELECT extracted_text,metadata->'availability' availability FROM alix_drive_corpus WHERE tenant_id='other'")).rows[0]).toEqual({ extracted_text: 'Texto de outro tenant', availability: null })
    await metadata(baseEntry(), { entry: { ...baseEntry(), parents: ['folder-a'], ancestorPaths: [['folder-a','file-a']] }, observedAt: '2026-09-08T14:00:00Z' }); await service().syncOnce()
    expect((await row()).metadata.availability.reason).toBe('ancestor_unavailable')
  })
  it('movimento de pasta suspende vínculo antigo entre lotes e reatribui descendente preservando texto da mesma versão', async () => {
    const file = { ...baseEntry(), parents: ['folder-a'], ancestorPaths: [['folder-a','file-a']] }
    await inventory([folderEntry('folder-a', 'Documentos'), folderEntry('folder-b', 'Cliente B'), file]); await receipt(); await event(); await service().syncOnce()
    const original = await row()
    await metadata({ ...folderEntry('folder-a', 'Documentos'), parents: ['folder-b'], ancestorPaths: [['folder-b','folder-a']], linkedClientIds: ['client-b'] })
    await metadata({ ...file, ancestorPaths: [['folder-b','folder-a','file-a']], linkedClientIds: ['client-b'] })
    await service(1).syncOnce()
    expect(await row()).toMatchObject({ cliente_id: 'client-a', extracted_text: original.extracted_text, metadata: { availability: { status: 'unavailable', reason: 'hierarchy_changed' } } })
    await service(1).syncOnce()
    expect(await row()).toMatchObject({ cliente_id: 'client-b', path: 'Cliente B/Documentos/file-a.txt', extracted_text: original.extracted_text, metadata: { availability: { status: 'available' } } })
  })
  it('replay idêntico e evento mais antigo não regressam revisão ou disponibilidade', async () => {
    await inventory(); await service().syncOnce()
    const current = await metadata({ ...baseEntry(), version: '2' }); await service().syncOnce()
    const original = await row()
    await appendFile(join(directory, 'metadata-events.jsonl'), JSON.stringify(current) + '\n')
    await metadata('file-a', { observedAt: '2026-09-08T12:00:00Z' }); await service().syncOnce()
    expect((await row()).updated_at).toEqual(original.updated_at)
    expect(await row()).toMatchObject({ metadata: { driveVersion: '2', availability: { status: 'available' } } })
  })
  it('checkpoint incremental falho reverte alteração e permite retomada sem perder evento', async () => {
    await inventory(); await service().syncOnce(); await metadata({ ...baseEntry(), version: '2' })
    const connection = await pool.connect(); const query = connection.query.bind(connection)
    const wrapped = new Proxy(connection, { get(target, name) {
      if (name === 'query') return async (sql: string, values?: unknown[]) => {
        if (sql.startsWith('INSERT INTO alix_drive_corpus_run') && String(values?.[1]).includes('metadataSync')) throw new Error('Checkpoint incremental interrompido')
        return query(sql, values)
      }
      const value = Reflect.get(target,name); return typeof value === 'function' ? value.bind(target) : value
    } })
    await expect(service(1000, { connect: async () => wrapped } as unknown as pg.Pool).syncOnce()).rejects.toThrow('Checkpoint incremental interrompido')
    expect((await row()).metadata.driveVersion).toBe('1')
    expect(await service().syncOnce()).toMatchObject({ metadataProcessed: 1 })
    expect((await row()).metadata.driveVersion).toBe('2')
  })
  it('evento malformado não é pulado e substituição do diário requer recuperação explícita', async () => {
    await inventory(); await service().syncOnce(); await metadata(baseEntry())
    await service().syncOnce()
    await appendFile(join(directory, 'metadata-events.jsonl'), '{"kind":"upsert"}\n')
    await expect(service().syncOnce()).rejects.toThrow()
    await rm(join(directory, 'metadata-events.jsonl'))
    await writeFile(join(directory, 'metadata-events.jsonl'), '')
    await expect(service().syncOnce()).rejects.toMatchObject({ code: 'METADATA_LOG_REPLACED' })
  })
  it('recibo repetido é idempotente e recibo mais antigo não substitui texto', async () => {
    await inventory(); await service().syncOnce(); await receipt('file-a', 'Conteúdo atual')
    expect(await service().ingestReceipt('file-a')).toBe('applied')
    const first = await row()
    expect(await service().ingestReceipt('file-a')).toBe('unchanged')
    expect((await row()).updated_at).toEqual(first.updated_at)
    await receipt('file-a', 'Conteúdo antigo', { finishedAt: '2026-09-07T12:00:00.000Z' })
    expect(await service().ingestReceipt('file-a')).toBe('stale')
    expect((await row()).extracted_text).toBe('Conteúdo atual')
  })
  it('confirma texto e trabalho de IA na mesma transação, sem duplicar o replay', async () => {
    await inventory([{...baseEntry(),linkedClientIds:['legacy-a']}]); await service().syncOnce(); await receipt(); await event()
    await service().syncOnce()
    const first=(await pool.query('SELECT id,cliente_id,status,total_chunks FROM alix_drive_analysis')).rows
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({cliente_id:'client-a',status:'queued'})
    expect(first[0].total_chunks).toBeGreaterThan(0)
    await service().syncOnce(); await service().ingestReceipt('file-a')
    expect((await pool.query('SELECT id,cliente_id,status,total_chunks FROM alix_drive_analysis')).rows).toEqual(first)
  })
  it('falha ao persistir trabalho de IA reverte texto, chunks e cursor do recibo', async () => {
    await inventory(); await service().syncOnce(); await receipt(); await event()
    const connection=await pool.connect(),query=connection.query.bind(connection)
    const wrapped=new Proxy(connection,{get(target,name){
      if(name==='query')return async(sql:string,values?:unknown[])=>{
        if(sql.startsWith('INSERT INTO alix_drive_analysis('))throw new Error('Trabalho documental não confirmado')
        return query(sql,values)
      }
      const value=Reflect.get(target,name);return typeof value==='function'?value.bind(target):value
    }})
    await expect(service(1000,{connect:async()=>wrapped} as unknown as pg.Pool).syncOnce()).rejects.toThrow('Trabalho documental não confirmado')
    expect((await row()).extracted_text).toBe('')
    expect((await pool.query('SELECT count(*)::int n FROM alix_drive_corpus_chunk')).rows[0].n).toBe(0)
    expect((await pool.query('SELECT count(*)::int n FROM alix_drive_analysis')).rows[0].n).toBe(0)
    expect(await service().syncOnce()).toMatchObject({processed:1})
    expect((await pool.query('SELECT status FROM alix_drive_analysis')).rows).toEqual([{status:'queued'}])
  })
  it('normalização Python com offset restaura recibo parcial e retoma eventos sem falso artefato inválido', async () => {
    await inventory(); await service().syncOnce()
    await pool.query("UPDATE alix_drive_corpus SET read_status='failed',metadata=metadata || '{\"ingestionError\":{\"code\":\"INVALID_OR_MISSING_ARTIFACT\"}}'::jsonb")
    const finishedAt = '2026-09-07T20:48:28.598521+00:00'
    await receipt('file-a', 'Texto nativo preservado na revalidação.', { status: 'partial', finishedAt, coverage: { status: 'partial', pendingPages: [1], limitations: ['Revalidação de imagens pendente.'], revalidationRequired: 'pdf_images_v3' } })
    expect(await service().ingestReceipt('file-a')).toBe('applied')
    const restored = await row()
    expect(restored).toMatchObject({ read_status: 'partial', extracted_text: 'Texto nativo preservado na revalidação.', coverage: { status: 'partial', pendingPages: [1] } })
    expect(restored.metadata.ingestionError).toBeUndefined()
    await appendFile(join(directory, 'read-events.jsonl'), JSON.stringify({ fileId: 'file-a', fileVersion: '1', finishedAt }) + '\n')
    expect(await service().syncOnce()).toMatchObject({ processed: 1, remaining: false })
    const run = (await pool.query('SELECT payload FROM alix_drive_corpus_run')).rows[0].payload
    expect(run.ingestionCounts).toMatchObject({ unchanged: 1 })
    expect(run.lastIngestionErrors).toBeUndefined()
    expect((await row()).updated_at).toEqual(restored.updated_at)
  })
  it('revalidação idempotente limpa erro transitório sem duplicar texto ou chunks', async () => {
    await inventory(); await service().syncOnce(); await receipt(); await service().ingestReceipt('file-a')
    const original = await row()
    const chunks = (await pool.query('SELECT id,text FROM alix_drive_corpus_chunk ORDER BY ordinal')).rows
    await pool.query("UPDATE alix_drive_corpus SET metadata=metadata || '{\"ingestionError\":{\"code\":\"INVALID_OR_MISSING_ARTIFACT\"}}'::jsonb")
    expect(await service().ingestReceipt('file-a')).toBe('unchanged')
    const validated = await row()
    expect(validated.metadata.ingestionError).toBeUndefined()
    expect(validated).toMatchObject({ read_status: 'complete', extracted_text: original.extracted_text, content_hash: original.content_hash, read_at: original.read_at })
    expect((await pool.query('SELECT id,text FROM alix_drive_corpus_chunk ORDER BY ordinal')).rows).toEqual(chunks)
  })
  it('cursor durável retoma o próximo evento sem reprocessar o inventário ou perder Unicode', async () => {
    await inventory([baseEntry(),baseEntry('file-b')]); await receipt(); await receipt('file-b'); await event(); await event('file-b')
    const first = await service(1).syncOnce()
    expect(first).toMatchObject({ processed: 1, remaining: true })
    const checkpoint = (await pool.query('SELECT payload FROM alix_drive_corpus_run')).rows[0].payload.eventSync
    expect(checkpoint.offset).toBe(Buffer.byteLength(JSON.stringify({ fileId: 'file-a', fileVersion: '1', finishedAt: '2026-09-07T13:00:00.000Z', nota: 'ação 📄' }) + '\n'))
    expect(await service(1).syncOnce()).toMatchObject({ processed: 1, remaining: false })
    expect((await row('file-b')).read_status).toBe('complete')
    expect(await service(1).syncOnce()).toMatchObject({ processed: 0, remaining: false })
  })
  it('falha no checkpoint reverte conteúdo e chunks antes da retomada', async () => {
    await inventory(); await service().syncOnce(); await receipt(); await event()
    const connection = await pool.connect(); const query = connection.query.bind(connection)
    let injected = false
    const wrapped = new Proxy(connection, { get(target, name) {
      if (name === 'query') return async (sql: string, values?: unknown[]) => {
        if (!injected && sql.startsWith('INSERT INTO alix_drive_corpus_run') && String(values?.[1]).includes('eventSync')) { injected = true; throw new Error('Interrupção sintética antes do checkpoint') }
        return query(sql, values)
      }
      const value = Reflect.get(target, name); return typeof value === 'function' ? value.bind(target) : value
    } })
    await expect(service(1000, { connect: async () => wrapped } as unknown as pg.Pool).syncOnce()).rejects.toThrow('Interrupção sintética')
    expect(await row()).toMatchObject({ read_status: 'pending', extracted_text: '' })
    expect((await pool.query('SELECT count(*)::int n FROM alix_drive_corpus_chunk')).rows[0].n).toBe(0)
    expect(await service().syncOnce()).toMatchObject({ processed: 1 })
    expect((await row()).read_status).toBe('complete')
  })
  it('recusa artefato fora da raiz inclusive quando ocultado por symlink', async () => {
    await inventory(); await service().syncOnce(); const payload = await receipt()
    const outside = await mkdtemp(join(tmpdir(), 'aletis-outside-'))
    try {
      await writeFile(join(outside, 'text.txt'), 'conteúdo externo')
      await symlink(join(outside, 'text.txt'), join(directory, 'escape.txt'))
      await writeFile(join(directory, 'receipts/file-a.json'), JSON.stringify({ ...payload, textPath: join(directory, 'escape.txt') }))
      await expect(service().ingestReceipt('file-a')).rejects.toMatchObject({ code: 'PATH_OUTSIDE_ROOT' })
      expect((await row()).extracted_text).toBe('')
    } finally { await rm(outside, { recursive: true, force: true }) }
  })
  it('conteúdo divergente, hash inválido e contagem truncada são recusados', async () => {
    await inventory(); await service().syncOnce()
    await receipt('file-a', 'Texto íntegro', { characters: 3 })
    await expect(service().ingestReceipt('file-a')).rejects.toMatchObject({ code: 'CHARACTER_COUNT_MISMATCH' })
    await receipt('file-a', 'Texto íntegro', { sourceHash: 'f'.repeat(64) })
    await expect(service().ingestReceipt('file-a')).rejects.toMatchObject({ code: 'SOURCE_HASH_MISMATCH' })
    const payload = await receipt()
    await writeFile(payload.textPath, 'trecho diferente')
    await expect(service().ingestReceipt('file-a')).rejects.toMatchObject({ code: 'TEXT_MISMATCH' })
  })
  it('cobertura parcial do parser prevalece sobre rótulo completo do recibo', async () => {
    await inventory(); await service().syncOnce()
    await receipt('file-a', 'Texto parcial', { parserCoverage: { status: 'partial', pendingPages: [7, 8], limitations: ['OCR pendente.'] } })
    await service().ingestReceipt('file-a')
    expect(await row()).toMatchObject({ read_status: 'partial', coverage: { status: 'partial', pendingPages: [7,8] } })
  })
  it('evento inválido sinaliza arquivo e permite que o próximo arquivo seja lido', async () => {
    await inventory([baseEntry(),baseEntry('file-b')]); await receipt('file-a', 'Texto ruim', { characters: 1 }); await receipt('file-b'); await event(); await event('file-b')
    expect(await service().syncOnce()).toMatchObject({ processed: 2 })
    expect(await row()).toMatchObject({ read_status: 'failed', metadata: { ingestionError: { code: 'CHARACTER_COUNT_MISMATCH' } } })
    expect((await row('file-b')).read_status).toBe('complete')
    expect(JSON.stringify((await row()).metadata)).not.toContain(directory)
  })
  it('salva progresso e Central sem expor diretórios privados', async () => {
    await inventory()
    await writeFile(join(directory, 'progress.json'), JSON.stringify({ updatedAt: '2026-09-07T15:00:00Z', totalFiles: 100, queuedFiles: 2, partial: 1, characters: 9999, privatePath: directory }))
    await writeFile(join(directory, 'organization-result.json'), JSON.stringify({ hubId: 'synthetic-hub', hubUrl: 'https://drive.google.com/drive/folders/synthetic-hub', privatePath: directory }))
    await service().syncOnce()
    const run = (await pool.query('SELECT payload FROM alix_drive_corpus_run')).rows[0].payload
    expect(run).toMatchObject({ readingStatus: 'reading', readerProgress: { totalFiles: 100, queuedFiles: 2 }, organization: { hubId: 'synthetic-hub' } })
    expect(JSON.stringify(run)).not.toContain(directory)
    await writeFile(join(directory, 'progress.json'), JSON.stringify({ status: 'paused', updatedAt: '2026-09-07T16:00:00Z', queuedFiles: 2 }))
    await service().syncOnce()
    expect((await pool.query('SELECT payload FROM alix_drive_corpus_run')).rows[0].payload.readingStatus).toBe('paused')
    await writeFile(join(directory, 'progress.json'), JSON.stringify({ status: 'paused_auth', updatedAt: '2026-09-07T16:30:00Z', queuedFiles: 2 }))
    await service().syncOnce()
    expect((await pool.query('SELECT payload FROM alix_drive_corpus_run')).rows[0].payload.readingStatus).toBe('paused_auth')
    await writeFile(join(directory, 'progress.json'), JSON.stringify({ status: 'paused_metadata', updatedAt: '2026-09-07T16:40:00Z', queuedFiles: 2 }))
    await service().syncOnce()
    expect((await pool.query('SELECT payload FROM alix_drive_corpus_run')).rows[0].payload.readingStatus).toBe('paused')
    await writeFile(join(directory, 'progress.json'), JSON.stringify({ status: 'completed', updatedAt: '2026-09-07T17:00:00Z', queuedFiles: 2 }))
    await service().syncOnce()
    expect((await pool.query('SELECT payload FROM alix_drive_corpus_run')).rows[0].payload.readingStatus).toBe('partial')
  })
  it('CLI --once ingere e encerra; a segunda execução retoma sem duplicar e usa ALETIS_TENANT_ID', async () => {
    await inventory(); await receipt(); await event()
    const fixture = new URL((await readFile(process.env.ALETIS_DRIVE_CORPUS_FIXTURE_FILE!, 'utf8')).trim())
    fixture.searchParams.set('options', `-c search_path=${schema},public`)
    const fixtureFile = join(directory, '.fixture-connection')
    await writeFile(fixtureFile, fixture.toString(), { mode: 0o600 })
    const execute = async () => {
      const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/sync-drive-corpus.ts', '--private-root', directory, '--once'], {
        cwd: fileURLToPath(new URL('../../', import.meta.url)), timeout: 20000, maxBuffer: 1024 * 1024,
        env: { ...process.env, ALETIS_DRIVE_CORPUS_FIXTURE_FILE: fixtureFile, ALETIS_TENANT_ID: tenantId, DEFAULT_TENANT_ID: 'must-not-be-used' },
      })
      expect(result.stderr).toBe('')
      expect(result.stdout).not.toContain(fixture.toString())
      return JSON.parse(result.stdout.trim().split('\n').at(-1)!)
    }
    expect(await execute()).toMatchObject({ processed: 1, inventoryComplete: true, inventoryRecords: 1, remaining: false })
    expect(await row()).toMatchObject({ tenant_id: tenantId, read_status: 'complete' })
    const updatedAt = (await row()).updated_at
    expect(await execute()).toMatchObject({ processed: 0, remaining: false })
    expect((await row()).updated_at).toEqual(updatedAt)
    expect((await pool.query('SELECT count(*)::int AS count FROM alix_drive_corpus')).rows[0].count).toBe(1)
  }, 30000)
})
