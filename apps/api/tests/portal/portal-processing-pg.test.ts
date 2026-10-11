import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PgPortalDocumentJobStore } from '../../src/services/portal/PortalDocumentJobStore.js'
import { reservePortalDriveFolder } from '../../src/services/portal/PortalDriveArchiver.js'
import { PortalDocumentProcessor, portalDocumentIdentity } from '../../src/services/portal/PortalDocumentProcessor.js'

describe.skipIf(!process.env.ALETIS_PORTAL_PROCESSING_FIXTURE_FILE)('fila do portal em PostgreSQL sintético', () => {
  const schema = `portal_processing_fixture_${randomUUID().replaceAll('-', '')}`
  let admin: pg.Pool; let pool: pg.Pool
  let store: PgPortalDocumentJobStore
  const mirror = vi.fn(async () => undefined)
  const input = { uploadId: 'upload-a', clienteId: 'client-a' }
  beforeAll(async () => {
    const url = (await readFile(process.env.ALETIS_PORTAL_PROCESSING_FIXTURE_FILE!, 'utf8')).trim()
    const parsed = new URL(url)
    if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55436' || parsed.pathname !== '/aletis_implementation_fixture') throw new Error('Somente o PostgreSQL sintético local é permitido.')
    admin = new pg.Pool({ connectionString: url, max: 1 })
    await admin.query(`create schema ${schema}`)
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 4 })
    await pool.query(await readFile(new URL('../../src/db/migrations/0006_portal_cliente.sql', import.meta.url), 'utf8'))
    await pool.query(await readFile(new URL('../../src/db/migrations/0045_portal_document_processing.sql', import.meta.url), 'utf8'))
    await pool.query('create table client_google_drive_folder (tenant_id text,client_id text,google_folder_id text,metadata jsonb,updated_at timestamptz,primary key(tenant_id,client_id))')
    store = new PgPortalDocumentJobStore({ pool: () => pool, enabled: () => true, mirror })
  })
  beforeEach(async () => {
    await pool.query('truncate portal_upload cascade')
    await pool.query(`insert into portal_upload (id,cliente_id,nome_original,nome_storage,mime,tamanho,enviado_por,sha256,metadata)
      values ('upload-a','client-a','Documento sintético.txt','upload-a.txt','text/plain',10,'cliente',$1,$2::jsonb),
      ('upload-b','client-b','Outro teste.txt','upload-b.txt','text/plain',10,'cliente',$1,'{}'::jsonb)`,
    ['a'.repeat(64), JSON.stringify({ source: 'portal', requestVersion: 2, userComment: 'preservar', processing: { analysis: { status: 'failed', errorCode: 'ALIX_RETRY', documentId: 'doc-a' }, drive: { status: 'blocked', errorCode: 'AUTH_REQUIRED', fileId: 'reserved-a' } } })])
    mirror.mockClear()
  })
  afterAll(async () => {
    if (pool) await pool.end()
    if (admin) { await admin.query(`drop schema if exists ${schema} cascade`); await admin.end() }
  })

  it('enqueue concorrente gera um job, claim concorrente entrega um lease', async () => {
    await Promise.all([store.enqueue(input), store.enqueue(input)])
    const other = new PgPortalDocumentJobStore({ pool: () => pool, enabled: () => true, mirror })
    const claims = await Promise.all([store.claim(), other.claim()])
    expect(claims.filter(Boolean)).toHaveLength(1)
    expect((await pool.query('select count(*)::int total from portal_document_processing_job')).rows[0].total).toBe(1)
    expect(await other.claim()).toBeNull()
  })
  it('retoma lease expirado após restart e rejeita todas as confirmações antigas', async () => {
    await store.enqueue(input); const old = (await store.claim())!
    await pool.query("update portal_document_processing_job set locked_at=now()-interval '6 minutes'")
    const restarted = new PgPortalDocumentJobStore({ pool: () => pool, enabled: () => true, mirror })
    const current = (await restarted.claim())!
    expect(current.token).not.toBe(old.token); expect(current.attempts).toBe(2)
    expect(await store.heartbeat(old)).toBe(false)
    await expect(store.checkpoint(old, { resumoIa: 'escrita antiga' })).rejects.toMatchObject({ code: 'LEASE_LOST' })
    await expect(store.finish(old, { status: 'completed' })).rejects.toMatchObject({ code: 'LEASE_LOST' })
    await restarted.checkpoint(current, { resumoIa: 'checkpoint retomado' })
    await restarted.finish(current, { status: 'completed' })
    expect((await restarted.load(input))?.metadata.resumoIa).toBe('checkpoint retomado')
  })
  it('checkpoint preserva observação/revisão concorrente e espelha somente após commit', async () => {
    await store.enqueue(input); const lease = (await store.claim())!; mirror.mockClear()
    await pool.query(`update portal_upload set metadata=metadata||'{"observacaoEquipe":"conferir página 2"}'::jsonb where id='upload-a'`)
    const saved = await store.checkpoint(lease, { processing: { analysis: { status: 'completed' }, drive: { status: 'archived', fileId: 'drive-a' } }, alixDocumentId: 'doc-a' })
    expect(saved.metadata).toMatchObject({ userComment: 'preservar', observacaoEquipe: 'conferir página 2', requestVersion: 2, alixDocumentId: 'doc-a' })
    expect(mirror).toHaveBeenCalledWith('client-a', 'upload-a')
    expect((await store.load({ clienteId: 'client-b', uploadId: 'upload-b' }))?.metadata).toEqual({})
  })
  it('retry de Drive conserva análise e IDs reservados', async () => {
    await store.enqueue(input, true, 'drive')
    expect((await store.load(input))?.metadata).toMatchObject({ processing: {
      analysis: { status: 'failed', errorCode: 'ALIX_RETRY', documentId: 'doc-a' }, drive: { status: 'pending', fileId: 'reserved-a' },
    } })
    await store.enqueue(input, true, 'analise')
    expect((await store.load(input))?.metadata).toMatchObject({ processing: {
      analysis: { status: 'pending', documentId: 'doc-a', attempts: 0 }, drive: { status: 'pending', fileId: 'reserved-a' },
    } })
  })
  it('retry/backoff permanece no banco e não oferece job antes do prazo', async () => {
    await store.enqueue(input); const lease = (await store.claim())!
    await store.finish(lease, { status: 'retry', delayMs: 30_000, errorCode: 'AUTH_REQUIRED' })
    expect(await store.claim()).toBeNull()
    const row = (await pool.query('select status,last_error,lease_token,available_at>now() deferred from portal_document_processing_job')).rows[0]
    expect(row).toMatchObject({ status: 'retry', last_error: 'AUTH_REQUIRED', lease_token: null, deferred: true })
    await pool.query("update portal_document_processing_job set available_at=now()-interval '1 second'")
    expect(await store.claim()).toMatchObject(input)
  })
  it('IDs de outro cliente falham fechados e job forjado não é reivindicado', async () => {
    await expect(store.enqueue({ uploadId: 'upload-a', clienteId: 'client-b' })).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND' })
    expect(await store.load({ uploadId: 'upload-a', clienteId: 'client-b' })).toBeNull()
    await pool.query("insert into portal_document_processing_job (id,upload_id,cliente_id) values ('forged','upload-a','client-b')")
    expect(await store.claim()).toBeNull()
  })
  it('pedido de outro cliente não alimenta a análise mesmo com pendencia_id forjado', async () => {
    await pool.query(`insert into portal_documento_pendente (id,cliente_id,titulo,tipo_documento,categoria)
      values ('request-a','client-a','CCIR próprio','CCIR','agro'),('request-b','client-b','Informação de outro cliente','RG','identidade')`)
    await pool.query("update portal_upload set pendencia_id='request-a' where id='upload-a'")
    expect((await store.load(input))?.request).toMatchObject({ id: 'request-a', clienteId: 'client-a', titulo: 'CCIR próprio', tipoDocumento: 'CCIR' })
    await pool.query("update portal_upload set pendencia_id='request-b' where id='upload-a'")
    await expect(store.load(input)).rejects.toMatchObject({ code: 'UPLOAD_REQUEST_SCOPE_MISMATCH', statusCode: 409 })
  })
  it('falha de metadata desfaz reenqueue e não publica no cache', async () => {
    await pool.query(`create function reject_portal_update() returns trigger language plpgsql as $$begin raise exception 'fixture failure'; end$$`)
    await pool.query('create trigger reject_portal_update before update on portal_upload for each row execute function reject_portal_update()')
    try {
      await expect(store.enqueue(input, true, 'todas')).rejects.toThrow('fixture failure')
      expect((await pool.query('select count(*)::int total from portal_document_processing_job')).rows[0].total).toBe(0)
      expect(mirror).not.toHaveBeenCalled()
    } finally { await pool.query('drop trigger reject_portal_update on portal_upload'); await pool.query('drop function reject_portal_update()') }
  })
  it('reserva compartilhada de subpasta é única entre workers e preserva vínculo/metadata', async () => {
    await pool.query(`insert into client_google_drive_folder values ('tenant-a','client-a','root-a','{"inventory":{"kept":true}}'::jsonb,now())`)
    const options = { pool, tenantId: 'tenant-a' }
    const [first, second] = await Promise.all([
      reservePortalDriveFolder('client-a', 'root-a', { id: 'reserved-a', parentId: 'root-a', name: 'Documentos' }, options),
      reservePortalDriveFolder('client-a', 'root-a', { id: 'reserved-b', parentId: 'root-a', name: 'Documentos' }, options),
    ])
    expect(first.id).toBe(second.id)
    expect((await pool.query('select metadata from client_google_drive_folder')).rows[0].metadata.inventory).toEqual({ kept: true })
    await expect(reservePortalDriveFolder('client-a', 'other-root', { id: 'reserved-c', parentId: 'other-root', name: 'Documentos' }, options)).rejects.toMatchObject({ code: 'DRIVE_BINDING_CHANGED' })
    await expect(reservePortalDriveFolder('client-a', 'root-a', { id: 'reserved-d', parentId: 'root-a', name: 'Documentos' }, { pool, tenantId: 'tenant-b' })).rejects.toMatchObject({ code: 'DRIVE_BINDING_CHANGED' })
  })
  it('worker completo confirma análise e Drive usando o lease e o registro PostgreSQL reais', async () => {
    await pool.query("update portal_upload set metadata='{\"source\":\"portal\"}'::jsonb where id='upload-a'")
    await store.enqueue(input)
    const identity = portalDocumentIdentity(input)
    const doc: any = { id: identity.documentId, sessionId: identity.sessionId, clienteId: 'client-a', filename: 'Documento.txt',
      kind: 'text', mimetype: 'text/plain', sizeBytes: 10, extractedText: 'Fonte sintética para leitura de teste.', metadata: { sha256: 'a'.repeat(64), processingState: 'completed' } }
    let ingested = false
    const worker = new PortalDocumentProcessor({ store, readFile: async () => Buffer.from('sintetico!'),
      intake: { get: async () => ingested ? doc : null, ingest: async () => { ingested = true; return doc } },
      pipeline: { getLatestForDocument: async () => ({ id: 'run-a', documentId: doc.id, clienteId: 'client-a', sessionId: doc.sessionId,
        status: 'awaiting_registration', progress: 100, fields: [], findings: [] } as any) },
      queue: { ready: async () => true, enqueueDeepAnalysis: async () => ({ queue: 'alix-document-deep-analysis-v1', jobId: randomUUID(), statusUrl: '/fixture' }),
        enqueueDocumentPipeline: async () => ({ queue: 'alix-document-pipeline-v1', jobId: randomUUID(), statusUrl: '/fixture' }),
        getJob: async () => ({ completed: true, finished: true, progress: 100, output: { analysis: { documentoId: doc.id, status: 'llm', resumoExecutivo: 'Leitura teste concluída.', readingCoverage: { complete: true } } } }), },
      drive: { archive: async (_upload, _buffer, state, checkpoint) => {
        const archived = { ...state, status: 'archived' as const, fileId: 'drive-fixture' }; await checkpoint(archived); return archived
      } },
    })
    expect(await worker.runOnce()).toBe(true)
    expect(ingested).toBe(true)
    expect((await pool.query("select status from portal_document_processing_job where id='upload-a'")).rows[0].status).toBe('completed')
    expect((await store.load(input))?.metadata).toMatchObject({ alixDocumentId: doc.id, processing: { analysis: { status: 'completed' }, drive: { status: 'archived', fileId: 'drive-fixture' } } })
  })
})
