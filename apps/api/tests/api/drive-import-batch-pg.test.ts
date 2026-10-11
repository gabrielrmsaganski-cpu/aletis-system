import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IngestedDocument, IntakeInput } from '../../src/services/alix/intake/types.js'
import type { DocumentScopeRequest } from '../../src/services/alix/intake/DocumentIntakeService.js'
import { DriveImportBatchService } from '../../src/services/google-workspace/DriveImportBatchService.js'
import { driveImportSessionId } from '../../src/services/google-workspace/DriveSourceIdentity.js'

// Nunca consulta DATABASE_URL. Só conecta à fixture local explicitamente habilitada.
describe.skipIf(process.env.ALETIS_DRIVE_IMPORT_FIXTURE !== '1')('recibos Drive no PostgreSQL descartável', () => {
  const pool = new pg.Pool({ connectionString: 'postgresql://postgres:aletis-fixture-only@127.0.0.1:55436/aletis_implementation_fixture', max: 6 })
  let tenantId = ''
  const documents = new Map<string, IngestedDocument>()
  const sessions = new Set<string>()
  const read = vi.fn()
  const ensureSession = vi.fn(async (id: string) => { sessions.add(id); return { id } })
  const enqueue = vi.fn(async (input: IntakeInput, scope?: DocumentScopeRequest) => {
    expect(input.documentId).toBeTruthy(); expect(input.clienteId).toBeUndefined(); expect(scope?.requestedBy).toBe('fixture-user')
    const document: IngestedDocument = { id: input.documentId!, sessionId: input.sessionId, filename: input.filename, mimetype: input.mimetype, sizeBytes: input.buffer.length, uploadedAt: new Date().toISOString(), kind: 'text', extractedText: input.buffer.toString(), metadata: { sha256: createHash('sha256').update(input.buffer).digest('hex'), source: input.source, processingState: 'queued', clientScopeReview: { ...scope, status: 'pending' } } }
    documents.set(document.id, document)
    return document
  })
  const intake = { enqueue, get: async (_session: string, id: string) => documents.get(id) || null }
  const fixtureFile = (fileId: string) => ({ file: { id: fileId, name: `${fileId}.txt`, path: 'Fixture', mimeType: 'text/plain', url: 'https://example.invalid/fixture', sizeBytes: '4', modifiedAt: null }, buffer: Buffer.from('dado'), filename: `${fileId}.txt`, mimetype: 'text/plain', source: { type: 'google_drive' as const, fileId, url: 'https://example.invalid/fixture', path: 'Fixture', modifiedAt: null, importedAt: new Date().toISOString() } })
  const dependencies = (deadlineMs = 5_000) => ({ pool, intake, read, ensureSession, deadlineMs })
  const input = (fileIds = ['file-a', 'file-b']) => ({ actor: { userId: 'fixture-user', userName: 'Usuário sintético', tenantId, role: 'consultor' }, clientId: 'fixture-client', clientName: 'Cliente sintético', requestId: randomUUID(), fileIds })
  beforeAll(async () => { await pool.query(await readFile(new URL('../../src/db/migrations/0040_google_drive_import_batch.sql', import.meta.url), 'utf8')) })
  beforeEach(() => {
    tenantId = `test-drive-import-${randomUUID()}`; documents.clear(); sessions.clear(); vi.clearAllMocks()
    ensureSession.mockImplementation(async (id: string) => { sessions.add(id); return { id } })
    read.mockImplementation(async ({ fileId }: { fileId: string }) => fixtureFile(fileId))
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Rede externa proibida nesta suíte') }))
  })
  afterEach(async () => { await pool.query('delete from google_drive_import_batch where tenant_id=$1', [tenantId]); vi.unstubAllGlobals() })
  afterAll(async () => { await pool.end() })

  it('resposta perdida e restart reaproveitam recibo, sessão e arquivos', async () => {
    const request = input()
    const first = await new DriveImportBatchService(dependencies()).run(request)
    const repeated = await new DriveImportBatchService(dependencies()).run({ ...request, fileIds: [...request.fileIds].reverse() })
    expect(first.status).toBe('completed'); expect(repeated.id).toBe(first.id); expect(repeated.sessionId).toBe(first.sessionId)
    expect(enqueue).toHaveBeenCalledTimes(2); expect(read).toHaveBeenCalledTimes(2); expect(ensureSession).toHaveBeenCalledOnce()
    expect(ensureSession).toHaveBeenCalledWith(driveImportSessionId(request.actor, request.clientId), 'Drive · Cliente sintético', 'fixture-user', 'fixture-client')
    expect((await pool.query('select count(*)::int as count from google_drive_import_batch where tenant_id=$1', [tenantId])).rows[0].count).toBe(1)
  })
  it('falha parcial retoma somente o arquivo que faltou', async () => {
    const request = input()
    read.mockImplementation(async ({ fileId }: { fileId: string }) => { if (fileId === 'file-b') throw new Error('Falha sintética transitória'); return fixtureFile(fileId) })
    const first = await new DriveImportBatchService(dependencies()).run(request)
    expect(first.meta).toMatchObject({ imported: 1, failed: 1, remaining: 1 })
    read.mockImplementation(async ({ fileId }: { fileId: string }) => fixtureFile(fileId))
    const resumed = await new DriveImportBatchService(dependencies()).run(request)
    expect(resumed.status).toBe('completed'); expect(resumed.sessionId).toBe(first.sessionId)
    expect(enqueue.mock.calls.map(([file]) => file.source?.fileId)).toEqual(['file-a', 'file-b']); expect(sessions.size).toBe(1)
  })
  it('lock PostgreSQL impede execução concorrente por outra instância', async () => {
    const request = input(['file-a'])
    let enter!: () => void; let release!: () => void
    const entered = new Promise<void>(resolve => { enter = resolve }); const gate = new Promise<void>(resolve => { release = resolve })
    read.mockImplementation(async ({ fileId }: { fileId: string }) => { enter(); await gate; return fixtureFile(fileId) })
    const first = new DriveImportBatchService(dependencies()).run(request)
    await entered
    const concurrent = await new DriveImportBatchService(dependencies()).run(request)
    expect(concurrent.status).toBe('running'); expect(read).toHaveBeenCalledOnce()
    release(); await first
    expect(enqueue).toHaveBeenCalledOnce(); expect(ensureSession).toHaveBeenCalledOnce()
  })
  it('deadline cancela leitura e lote pausado retoma depois', async () => {
    const request = input(['file-a'])
    read.mockImplementation(({ signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })))
    const paused = await new DriveImportBatchService(dependencies(80)).run(request)
    expect(paused.status).toBe('paused'); expect(paused.results[0].state).toBe('pending'); expect(enqueue).not.toHaveBeenCalled()
    read.mockImplementation(async ({ fileId }: { fileId: string }) => fixtureFile(fileId))
    const resumed = await new DriveImportBatchService(dependencies()).run(request)
    expect(resumed.status).toBe('completed'); expect(resumed.sessionId).toBe(paused.sessionId)
  })
  it('recupera crash entre intake e checkpoint sem reler nem enfileirar', async () => {
    const request = input(['file-a']); const connection = await pool.connect(); const query = connection.query.bind(connection)
    let injected = false
    const wrapped = new Proxy(connection, { get(target, name) {
      if (name === 'query') return async (sql: string, values?: unknown[]) => {
        if (!injected && sql.startsWith('update google_drive_import_batch') && String(values?.[1]).includes('"imported":true')) { injected = true; throw new Error('Crash sintético após intake') }
        return query(sql, values)
      }
      const value = Reflect.get(target, name); return typeof value === 'function' ? value.bind(target) : value
    } })
    await expect(new DriveImportBatchService({ ...dependencies(), pool: { connect: async () => wrapped } as unknown as pg.Pool }).run(request)).rejects.toThrow('Crash sintético')
    expect(enqueue).toHaveBeenCalledOnce()
    const resumed = await new DriveImportBatchService(dependencies()).run(request)
    expect(resumed.status).toBe('completed'); expect(read).toHaveBeenCalledOnce(); expect(enqueue).toHaveBeenCalledOnce()
  })
  it('crash após criar sessão preserva o ID durável e não cria conversa extra', async () => {
    const request = input(['file-a'])
    ensureSession.mockImplementationOnce(async (id: string) => { sessions.add(id); throw new Error('Crash sintético após criar sessão') })
    await expect(new DriveImportBatchService(dependencies()).run(request)).rejects.toThrow('Crash sintético')
    const service = new DriveImportBatchService(dependencies())
    const checkpoint = await service.get(request.actor, request.clientId, request.requestId)
    expect(checkpoint?.sessionId).toBeTruthy(); expect(read).not.toHaveBeenCalled()
    const resumed = await service.run(request)
    expect(resumed.status).toBe('completed'); expect(resumed.sessionId).toBe(checkpoint?.sessionId)
    expect(sessions.size).toBe(1); expect(enqueue).toHaveBeenCalledOnce()
  })
  it('retomada recusa documento durável com outro responsável', async () => {
    const request = input(['file-a'])
    read.mockRejectedValueOnce(new Error('Falha sintética'))
    const service = new DriveImportBatchService(dependencies())
    const checkpoint = await service.run(request)
    documents.set(checkpoint.results[0].documentId, {
      id: checkpoint.results[0].documentId, sessionId: checkpoint.sessionId!, filename: 'Outro.txt', mimetype: 'text/plain',
      sizeBytes: 4, uploadedAt: new Date().toISOString(), kind: 'text', extractedText: 'dado',
      metadata: { source: fixtureFile('file-a').source, clientScopeReview: { requestedBy: 'other-user', requestedClienteId: 'fixture-client', status: 'pending' } },
    })
    const resumed = await service.run(request)
    expect(resumed.results[0]).toMatchObject({ imported: false, state: 'failed' })
    expect(resumed.results[0].reason).toContain('responsável')
    expect(read).toHaveBeenCalledOnce(); expect(enqueue).not.toHaveBeenCalled()
  })
  it('cancelamento pelo navegador pausa os arquivos restantes e preserva a seleção', async () => {
    const request = input(['file-a', 'file-b', 'file-c'])
    const controller = new AbortController()
    read.mockImplementation(async ({ fileId, signal }: { fileId: string; signal: AbortSignal }) => {
      if (fileId === 'file-a') return fixtureFile(fileId)
      await new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        setTimeout(() => controller.abort(), 30)
      })
      return fixtureFile(fileId)
    })
    const paused = await new DriveImportBatchService(dependencies()).run({ ...request, signal: controller.signal })
    expect(paused.status).toBe('paused'); expect(paused.meta.imported).toBe(1)
    expect(paused.results).toHaveLength(3)
    read.mockImplementation(async ({ fileId }: { fileId: string }) => fixtureFile(fileId))
    const resumed = await new DriveImportBatchService(dependencies()).run(request)
    expect(resumed.status).toBe('completed'); expect(enqueue).toHaveBeenCalledTimes(3)
  })
  it('perda da conexão que possui o lock cancela a leitura antes de aceitar o arquivo', async () => {
    const request = input(['file-a'])
    const connection = await pool.connect()
    const pid = (await connection.query('select pg_backend_pid() as pid')).rows[0].pid
    let entered!: () => void
    const reading = new Promise<void>(resolve => { entered = resolve })
    read.mockImplementation(({ signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      entered()
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    const interrupted = expect(new DriveImportBatchService({ ...dependencies(), pool: { connect: async () => connection } as unknown as pg.Pool }).run(request)).rejects.toThrow()
    await reading
    // Encerra somente a conexão emprestada por este teste; demais tabelas/consultas não são tocadas.
    await pool.query('select pg_terminate_backend($1)', [pid])
    await interrupted
    expect(enqueue).not.toHaveBeenCalled()
    read.mockImplementation(async ({ fileId }: { fileId: string }) => fixtureFile(fileId))
    expect((await new DriveImportBatchService(dependencies()).run(request)).status).toBe('completed')
    expect(enqueue).toHaveBeenCalledOnce()
  })
  it('consulta não informa execução ativa após expirar o prazo persistido', async () => {
    const request = input(['file-a'])
    read.mockRejectedValueOnce(new Error('Falha sintética'))
    const service = new DriveImportBatchService(dependencies())
    const receipt = await service.run(request)
    await pool.query('update google_drive_import_batch set payload=payload || $2::jsonb where id=$1', [receipt.id, JSON.stringify({ status: 'running', executionDeadlineAt: new Date(Date.now() - 1000).toISOString() })])
    expect((await service.get(request.actor, request.clientId, request.requestId))?.status).toBe('paused')
    expect((await service.list(request.actor, request.clientId))[0].status).toBe('paused')
    expect((await pool.query('select payload from google_drive_import_batch where id=$1', [receipt.id])).rows[0].payload.status).toBe('running')
    expect((await service.run(request)).status).toBe('completed')
  })
  it('recusa mesma chave com outra seleção e isola usuário e cliente', async () => {
    const request = input(); const service = new DriveImportBatchService(dependencies())
    await service.run(request)
    await expect(service.run({ ...request, fileIds: ['file-c'] })).rejects.toThrow('outro conjunto')
    expect(await service.get({ ...request.actor, userId: 'other-user' }, request.clientId, request.requestId)).toBeNull()
    expect(await service.get({ ...request.actor, tenantId: 'other-tenant' }, request.clientId, request.requestId)).toBeNull()
    expect(await service.get(request.actor, 'other-client', request.requestId)).toBeNull()
    expect(await service.list(request.actor, request.clientId)).toHaveLength(1)
  })
  it('limita downloads simultâneos a dois', async () => {
    let active = 0; let maximum = 0
    read.mockImplementation(async ({ fileId }: { fileId: string }) => { maximum = Math.max(maximum, ++active); await new Promise(resolve => setTimeout(resolve, 10)); active--; return fixtureFile(fileId) })
    const receipt = await new DriveImportBatchService(dependencies()).run(input(['file-a', 'file-b', 'file-c', 'file-d', 'file-e']))
    expect(receipt.meta.imported).toBe(5); expect(maximum).toBe(2)
  })
  it('lista e consulta refletem revisão concluída sem alterar o recibo em execução', async () => {
    const request = input(['file-a']); const service = new DriveImportBatchService(dependencies())
    const receipt = await service.run(request)
    const document = documents.get(receipt.results[0].documentId)!
    document.metadata.processingState = 'completed_basic'
    document.metadata.clientScopeReview = { status: 'verified' }
    expect((await service.list(request.actor, request.clientId))[0].meta.pendingReview).toBe(0)
    expect((await service.get(request.actor, request.clientId, request.requestId))?.results[0]).toMatchObject({ processingState: 'completed_basic', needsReview: false })
    const stored = await pool.query('select payload from google_drive_import_batch where id=$1', [receipt.id])
    expect(stored.rows[0].payload.results[0].needsReview).toBe(true)
  })
  it('novas seleções reaproveitam sessão e documento idêntico sem duplicar intake', async () => {
    const request = input(['file-a'])
    const service = new DriveImportBatchService(dependencies())
    const first = await service.run(request)
    const repeated = await service.run({ ...request, requestId: randomUUID() })
    expect(repeated.id).not.toBe(first.id)
    expect(repeated.sessionId).toBe(first.sessionId)
    expect(repeated.results[0]).toMatchObject({ documentId: first.results[0].documentId, reused: true, imported: true })
    expect(enqueue).toHaveBeenCalledOnce()
    expect(sessions.size).toBe(1)
  })
  it('alteração de conteúdo preserva a versão anterior na mesma sessão', async () => {
    const request = input(['file-a'])
    const service = new DriveImportBatchService(dependencies())
    const first = await service.run(request)
    read.mockImplementation(async ({ fileId }: { fileId: string }) => ({ ...fixtureFile(fileId), buffer: Buffer.from('nova versão') }))
    const updated = await service.run({ ...request, requestId: randomUUID() })
    expect(updated.sessionId).toBe(first.sessionId)
    expect(updated.results[0].documentId).not.toBe(first.results[0].documentId)
    expect(documents.size).toBe(2)
    expect(documents.get(first.results[0].documentId)?.extractedText).toBe('dado')
  })
  it('duas seleções simultâneas do mesmo cliente não criam intake concorrente', async () => {
    const request = input(['file-a'])
    let enter!: () => void; let release!: () => void
    const entered = new Promise<void>(resolve => { enter = resolve }); const gate = new Promise<void>(resolve => { release = resolve })
    read.mockImplementation(async ({ fileId }: { fileId: string }) => { enter(); await gate; return fixtureFile(fileId) })
    const first = new DriveImportBatchService(dependencies()).run(request)
    await entered
    const next = { ...request, requestId: randomUUID() }
    const waiting = await new DriveImportBatchService(dependencies()).run(next)
    expect(waiting.status).toBe('pending')
    expect(read).toHaveBeenCalledOnce()
    release(); await first
    const resumed = await new DriveImportBatchService(dependencies()).run(next)
    expect(resumed.results[0].reused).toBe(true)
    expect(enqueue).toHaveBeenCalledOnce()
  })
})
