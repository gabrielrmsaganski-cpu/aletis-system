import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PortalDocumentService } from '../../src/services/portal/PortalDocumentService.js'
import { _resetStore, listarPendencias, listarUploads } from '../../src/services/PortalStore.js'

describe.skipIf(!process.env.ALETIS_PORTAL_FIXTURE_FILE)('pedidos e documentos em PostgreSQL descartável', () => {
  const schema = `portal_docs_fixture_${randomUUID().replaceAll('-', '')}`
  let admin: pg.Pool
  let pool: pg.Pool
  const service = () => new PortalDocumentService({ pool, pgEnabled: () => true })
  const request = (title = 'Documento necessário') => service().criarPendencia('client-a', { titulo: title, categoria: 'identidade' }, { ator: 'equipe' })
  const input = (pendenciaId?: string, key = randomUUID()) => ({
    id: `up-${randomUUID()}`, clienteId: 'client-a', pendenciaId,
    nomeOriginal: 'documento.pdf', nomeStorage: `arquivo-${randomUUID()}.pdf`, mime: 'application/pdf',
    tamanho: 20, sha256: 'a'.repeat(64), enviadoPor: 'cliente' as const, idempotencyKey: key,
  })
  beforeAll(async () => {
    const url = (await readFile(process.env.ALETIS_PORTAL_FIXTURE_FILE!, 'utf8')).trim()
    const parsed = new URL(url)
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.port !== '55436' || parsed.pathname !== '/aletis_implementation_fixture') throw new Error('Exige PostgreSQL descartável autorizado.')
    admin = new pg.Pool({ connectionString: url })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 5 })
    await pool.query(`CREATE TABLE cliente(id text PRIMARY KEY);
      CREATE TABLE portal_acesso(id text PRIMARY KEY, usuario text);
      INSERT INTO cliente VALUES ('client-a'),('client-b');
      CREATE TABLE portal_documento_pendente (
        id text PRIMARY KEY, cliente_id text NOT NULL, titulo text NOT NULL, descricao text, categoria text,
        obrigatorio boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'pendente', upload_id text,
        solicitado_por text, solicitado_em timestamptz NOT NULL DEFAULT now(), enviado_em timestamptz,
        revisado_em timestamptz, observacao text,
        CONSTRAINT portal_doc_pend_status_check CHECK(status IN ('pendente','enviado','aprovado','rejeitado')));
      CREATE TABLE portal_upload(id text PRIMARY KEY, cliente_id text NOT NULL, pendencia_id text,
        nome_original text NOT NULL, nome_storage text NOT NULL, mime text NOT NULL, tamanho integer NOT NULL,
        sha256 text, categoria text, enviado_por text NOT NULL, enviado_em timestamptz NOT NULL DEFAULT now(), metadata jsonb);
      CREATE TABLE portal_evento(id bigserial PRIMARY KEY, cliente_id text NOT NULL, tipo text NOT NULL,
        canal text, ip text, user_agent text, detalhes jsonb, criado_em timestamptz NOT NULL DEFAULT now());
      CREATE TABLE audit_log(id bigserial PRIMARY KEY, ator text, acao text NOT NULL, recurso text NOT NULL,
        dados_antes jsonb, dados_depois jsonb, criado_em timestamptz NOT NULL DEFAULT now());
      INSERT INTO portal_documento_pendente(id,cliente_id,titulo,status,solicitado_em,revisado_em)
        VALUES('legacy-request','client-b','Legado preservado','rejeitado','2026-09-01T12:00:00.123Z','2026-09-02T12:00:00.456Z');
      INSERT INTO portal_upload(id,cliente_id,nome_original,nome_storage,mime,tamanho,enviado_por,metadata)
        VALUES('legacy-file','client-b','Legado.pdf','legado.pdf','application/pdf',12,'cliente','{"googleDrive":{"fileId":"original"}}');`)
    await pool.query(await readFile(new URL('../../src/db/migrations/0045_portal_document_processing.sql', import.meta.url), 'utf8'))
    _resetStore()
  })
  afterAll(async () => {
    _resetStore()
    if (pool) await pool.end()
    if (admin) { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end() }
  })

  it('migração preserva o legado e não agenda reprocessamento retroativo', async () => {
    const record = await service().buscarPendencia('client-b', 'legacy-request')
    expect(record).toMatchObject({ status: 'rejeitado', prioridade: 'normal', prazo: null, updatedAt: '2026-09-02T12:00:00.456Z' })
    expect((await service().buscarUpload('client-b', 'legacy-file'))?.metadata).toEqual({ googleDrive: { fileId: 'original' } })
    expect((await pool.query('SELECT count(*)::int AS total FROM portal_document_processing_job')).rows[0].total).toBe(0)
  })
  it('envio vincula exatamente o ID recebido e confirma arquivo, pedido, fila e auditoria juntos', async () => {
    const pending = await request()
    const draft = input(pending.id)
    const result = await service().receberUpload(draft)
    expect(result.pendencia).toMatchObject({ uploadId: draft.id, status: 'enviado' })
    expect(result.upload).toMatchObject({ id: draft.id, versao: 1, categoria: 'identidade' })
    const job = (await pool.query('SELECT upload_id,cliente_id,status FROM portal_document_processing_job WHERE upload_id=$1', [draft.id])).rows[0]
    expect(job).toEqual({ upload_id: draft.id, cliente_id: 'client-a', status: 'queued' })
    expect((await pool.query("SELECT count(*)::int AS total FROM audit_log WHERE dados_depois->>'uploadId'=$1", [draft.id])).rows[0].total).toBe(1)
    expect(listarUploads('client-a').some(item => item.id === draft.id)).toBe(true)
    expect(listarPendencias('client-a').find(item => item.id === pending.id)?.uploadId).toBe(draft.id)
  })
  it('retry concorrente entre instâncias gera apenas um upload, uma versão e um job', async () => {
    const pending = await request()
    const draft = input(pending.id)
    const responses = await Promise.all([service().receberUpload(draft), service().receberUpload({ ...draft, id: `up-${randomUUID()}`, nomeStorage: 'retry.pdf' })])
    expect(responses.filter(item => item.replayed)).toHaveLength(1)
    expect(responses[0].upload.id).toBe(responses[1].upload.id)
    expect((await pool.query('SELECT count(*)::int AS total FROM portal_upload WHERE pendencia_id=$1', [pending.id])).rows[0].total).toBe(1)
    expect((await pool.query('SELECT count(*)::int AS total FROM portal_document_processing_job WHERE upload_id=$1', [responses[0].upload.id])).rows[0].total).toBe(1)
    await expect(service().receberUpload({ ...draft, id: `up-${randomUUID()}`, sha256: 'b'.repeat(64) })).rejects.toMatchObject({ code: 'PORTAL_IDEMPOTENCY_CONFLICT' })
  })
  it('retry sem chave explícita também reconhece conteúdo igual sem reabrir pedido concluído', async () => {
    const pending = await request()
    const draft = { ...input(pending.id), idempotencyKey: undefined }
    const first = await service().receberUpload(draft)
    const approved = await service().atualizarPendencia('client-a', pending.id, { expectedUpdatedAt: first.pendencia!.updatedAt, status: 'aprovado' })
    const retry = await service().receberUpload({ ...draft, id: `up-${randomUUID()}`, nomeStorage: 'retry.pdf' })
    expect(retry).toMatchObject({ replayed: true, upload: { id: first.upload.id }, pendencia: { status: 'aprovado', updatedAt: approved.updatedAt } })
  })
  it('falha na auditoria desfaz arquivo, atualização, fila e espelho de memória', async () => {
    const pending = await request()
    const draft = input(pending.id)
    await pool.query(`ALTER TABLE audit_log ADD CONSTRAINT reject_upload_audit CHECK(acao <> 'documento_enviado') NOT VALID`)
    try { await expect(service().receberUpload(draft)).rejects.toBeDefined() }
    finally { await pool.query('ALTER TABLE audit_log DROP CONSTRAINT reject_upload_audit') }
    expect(await service().buscarUpload('client-a', draft.id)).toBeNull()
    expect(await service().buscarPendencia('client-a', pending.id)).toMatchObject({ status: 'pendente', updatedAt: pending.updatedAt })
    expect((await pool.query('SELECT count(*)::int AS total FROM portal_document_processing_job WHERE upload_id=$1', [draft.id])).rows[0].total).toBe(0)
    expect(listarUploads('client-a').some(item => item.id === draft.id)).toBe(false)
  })
  it('falha ao agendar trabalho impede confirmação do recebimento', async () => {
    const pending = await request()
    const draft = input(pending.id)
    await pool.query(`ALTER TABLE portal_document_processing_job ADD CONSTRAINT reject_queue CHECK(cliente_id <> 'client-a') NOT VALID`)
    try { await expect(service().receberUpload(draft)).rejects.toBeDefined() }
    finally { await pool.query('ALTER TABLE portal_document_processing_job DROP CONSTRAINT reject_queue') }
    expect(await service().buscarUpload('client-a', draft.id)).toBeNull()
    expect(await service().buscarPendencia('client-a', pending.id)).toMatchObject({ status: 'pendente', updatedAt: pending.updatedAt })
  })
  it('não aceita cliente inexistente, pedido de outro cliente ou colisão de ID de outro cliente', async () => {
    const pending = await request()
    await expect(service().receberUpload({ ...input(pending.id), clienteId: 'client-b' })).rejects.toMatchObject({ statusCode: 404 })
    await expect(service().criarPendencia('missing', { titulo: 'Sem cliente' })).rejects.toMatchObject({ statusCode: 404 })
    await expect(service().atualizarPendencia('client-b', pending.id, { expectedUpdatedAt: pending.updatedAt, titulo: 'Outro' })).rejects.toMatchObject({ statusCode: 404 })
    await expect(service().receberUpload({ ...input(), id: 'legacy-file' })).rejects.toMatchObject({ statusCode: 409 })
    expect(await service().buscarUpload('client-a', 'legacy-file')).toBeNull()
    expect((await service().buscarPendencia('client-a', pending.id))?.titulo).toBe(pending.titulo)
  })
  it('CAS resolve concorrência entre processos e leituras usam dados atuais do PostgreSQL', async () => {
    const pending = await request()
    const a = service(), b = service()
    await a.buscarPendencia('client-a', pending.id)
    const outcomes = await Promise.allSettled([a, b].map((instance, index) => instance.atualizarPendencia('client-a', pending.id, { expectedUpdatedAt: pending.updatedAt, titulo: `Título ${index}`, prioridade: 'urgente', prazo: '2026-10-20', tipoDocumento: 'CPF' })))
    expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1)
    expect((outcomes.find(item => item.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('PORTAL_DOCUMENT_CONFLICT')
    const saved = (outcomes.find(item => item.status === 'fulfilled') as PromiseFulfilledResult<any>).value
    expect(await a.buscarPendencia('client-a', pending.id)).toMatchObject(saved)
    await expect(b.atualizarPendencia('client-a', pending.id, { titulo: 'Sem versão' })).rejects.toMatchObject({ statusCode: 428 })
  })
  it('devolução exige explicação, novo envio mantém histórico e revisão exige a última versão', async () => {
    const pending = await request()
    const first = await service().receberUpload(input(pending.id))
    await expect(service().atualizarPendencia('client-a', pending.id, { expectedUpdatedAt: first.pendencia!.updatedAt, status: 'rejeitado', observacao: '   ' })).rejects.toMatchObject({ statusCode: 400 })
    const rejected = await service().atualizarPendencia('client-a', pending.id, { expectedUpdatedAt: first.pendencia!.updatedAt, status: 'rejeitado', observacao: 'Envie o verso legível.' })
    const second = await service().receberUpload({ ...input(pending.id), sha256: 'b'.repeat(64) })
    expect(second.upload.versao).toBe(2)
    expect(second.pendencia).toMatchObject({ status: 'enviado', uploadId: second.upload.id })
    expect(second.pendencia?.observacao).toBeUndefined()
    expect(await service().buscarUpload('client-a', first.upload.id)).toMatchObject({ id: first.upload.id, versao: 1, metadata: { review: { status: 'rejeitado', observacao: 'Envie o verso legível.' } } })
    await expect(service().atualizarPendencia('client-a', pending.id, { expectedUpdatedAt: rejected.updatedAt, status: 'aprovado' })).rejects.toMatchObject({ statusCode: 409 })
    const approved = await service().atualizarPendencia('client-a', pending.id, { expectedUpdatedAt: second.pendencia!.updatedAt, status: 'aprovado' })
    await expect(service().receberUpload(input(pending.id))).rejects.toMatchObject({ code: 'PORTAL_DOCUMENT_CLOSED' })
    expect(approved.uploadId).toBe(second.upload.id)
  })
  it('cancelamento mantém histórico e não pode receber arquivos novos', async () => {
    const pending = await request()
    const received = await service().receberUpload(input(pending.id))
    const canceled = await service().cancelarPendencia('client-a', pending.id, { expectedUpdatedAt: received.pendencia!.updatedAt, observacao: 'Não é mais necessário.' })
    expect(canceled).toMatchObject({ status: 'cancelado', uploadId: received.upload.id })
    await expect(service().receberUpload(input(pending.id))).rejects.toMatchObject({ code: 'PORTAL_DOCUMENT_CLOSED' })
    expect(await service().buscarUpload('client-a', received.upload.id)).not.toBeNull()
  })
  it('criar pedido é idempotente, inclusive após edição, e divergência é explícita', async () => {
    const data = { titulo: 'Pedido idempotente', idempotencyKey: randomUUID(), prazo: '2026-10-20' }
    const outcomes = await Promise.all([service().criarPendencia('client-a', data), service().criarPendencia('client-a', data)])
    expect(outcomes[0].id).toBe(outcomes[1].id)
    const updated = await service().atualizarPendencia('client-a', outcomes[0].id, { expectedUpdatedAt: outcomes[0].updatedAt, titulo: 'Título atualizado', prazo: null, tipoDocumento: null })
    expect(await service().criarPendencia('client-a', data)).toMatchObject({ id: updated.id, titulo: 'Título atualizado', prazo: null })
    await expect(service().criarPendencia('client-a', { ...data, titulo: 'Conteúdo divergente' })).rejects.toMatchObject({ code: 'PORTAL_IDEMPOTENCY_CONFLICT' })
  })
  it('valida datas, arquivo e revisão sem inventar recebimento', async () => {
    await expect(service().criarPendencia('client-a', { titulo: 'Data impossível', prazo: '2026-02-30' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(service().receberUpload({ ...input(), nomeStorage: '../cliente-b.pdf' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(service().receberUpload({ ...input(), tamanho: 20 * 1024 * 1024 + 1 })).rejects.toMatchObject({ statusCode: 400 })
    const pending = await request()
    await expect(service().atualizarPendencia('client-a', pending.id, { expectedUpdatedAt: pending.updatedAt, status: 'aprovado' })).rejects.toMatchObject({ code: 'PORTAL_UPLOAD_REQUIRED' })
  })
  it('revisão preserva metadados da ALIX e falha de auditoria reverte decisão por versão', async () => {
    const pending = await request()
    const received = await service().receberUpload(input(pending.id))
    await pool.query(`UPDATE portal_upload SET metadata=metadata || '{"googleDrive":{"fileId":"preservado"},"alixDocumentId":"doc-preservado"}'::jsonb WHERE id=$1`, [received.upload.id])
    await pool.query(`ALTER TABLE audit_log ADD CONSTRAINT reject_review_audit CHECK(acao <> 'pendencia_resolvida') NOT VALID`)
    try { await expect(service().atualizarPendencia('client-a', pending.id, { expectedUpdatedAt: received.pendencia!.updatedAt, status: 'aprovado' })).rejects.toBeDefined() }
    finally { await pool.query('ALTER TABLE audit_log DROP CONSTRAINT reject_review_audit') }
    expect((await service().buscarUpload('client-a', received.upload.id))?.metadata.review).toBeUndefined()
    expect(await service().buscarPendencia('client-a', pending.id)).toMatchObject({ status: 'enviado', updatedAt: received.pendencia!.updatedAt })
    await service().atualizarPendencia('client-a', pending.id, { expectedUpdatedAt: received.pendencia!.updatedAt, status: 'aprovado' })
    expect((await service().buscarUpload('client-a', received.upload.id))?.metadata).toMatchObject({
      googleDrive: { fileId: 'preservado' }, alixDocumentId: 'doc-preservado', review: { status: 'aprovado' },
    })
  })
})
