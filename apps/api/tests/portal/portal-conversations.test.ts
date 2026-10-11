import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import Fastify from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../src/routes/clientes.js', () => ({ clientes: new Map() }))
vi.mock('../../src/services/portal/PortalDocumentRoutes.js', () => ({ assertPortalStaff: vi.fn() }))
import { PortalCommunicationService } from '../../src/services/portal/PortalCommunicationService.js'
import { registerPortalConversationRoutes } from '../../src/services/portal/PortalConversationRoutes.js'
import { conversationSendIntent, mergeConversation, conversationDownloadPath } from '../../../web/src/pages/portal/PortalConversationModel.js'

describe('contrato da conversa e envio na interface', () => {
  const message = { id: 'one', de: 'cliente' as const, autorNome: 'Cliente', texto: 'Teste', criadoEm: '2026-09-11T12:00:00.000Z' }
  it('polling e confirmação de envio não duplicam IDs nem apagam recibo lido', () => {
    expect(mergeConversation([{ ...message, lidaEm: '2026-09-11T12:01:00.000Z' }], [message, message])).toEqual([{ ...message, lidaEm: '2026-09-11T12:01:00.000Z' }])
  })
  it('retry conserva a chave mesmo com ordem diferente de anexos', () => {
    const create = vi.fn(() => 'stable-key')
    const first = conversationSendIntent(null, { texto: ' Texto ', uploadIds: ['b', 'a'] }, create)
    expect(conversationSendIntent(first, { texto: 'Texto', uploadIds: ['a', 'b'] }, create)).toBe(first)
    expect(create).toHaveBeenCalledOnce()
    expect(() => conversationSendIntent(first, { texto: 'Alterado', uploadIds: ['a'] }, create)).toThrow('envio anterior')
  })
  it('valida limites e gera download somente no escopo interno', () => {
    expect(() => conversationSendIntent(null, { texto: '', uploadIds: [] }, () => '')).toThrow()
    expect(() => conversationSendIntent(null, { texto: 'x'.repeat(2001), uploadIds: [] }, () => '')).toThrow()
    expect(conversationDownloadPath('cliente', 'a', '../other')).toBe('/api/portal/uploads/..%2Fother')
    expect(conversationDownloadPath('equipe', 'a/b', 'file')).toBe('/api/clientes/a%2Fb/portal/uploads/file/download')
  })
  it('GET e retry de texto funcionam no contrato compatível sem marcar leitura', async () => {
    const service = new PortalCommunicationService({ enabled: () => false, pool: () => { throw new Error('no PG') }, mirror: () => undefined, legacy: () => [] })
    const actor = { actorId: 'owner', de: 'consultor' as const, autorNome: 'Equipe' }
    const saved = await service.add('a', { texto: 'Teste' }, actor, 'stable-key')
    expect((await service.list('a'))[0].lidaEm).toBeUndefined()
    expect((await service.add('a', { texto: 'Teste' }, actor, 'stable-key')).id).toBe(saved.id)
    await expect(service.markRead('a', 'consultor', [], 'portal:a')).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe.skipIf(!process.env.ALETIS_CONVERSATION_FIXTURE_FILE)('conversas PostgreSQL isolado', () => {
  const schema = `portal_conversation_fixture_${randomUUID().replaceAll('-', '')}`
  let admin: pg.Pool, pool: pg.Pool, service: PortalCommunicationService
  const mirror = vi.fn()
  const actor = { actorId: 'owner', de: 'consultor' as const, autorNome: 'Equipe' }
  beforeAll(async () => {
    const connectionString = (await readFile(process.env.ALETIS_CONVERSATION_FIXTURE_FILE!, 'utf8')).trim()
    const target = new URL(connectionString)
    if (target.hostname !== '127.0.0.1' || target.port !== '55436' || target.pathname !== '/aletis_implementation_fixture') throw new Error('Fixture local obrigatório.')
    admin = new pg.Pool({ connectionString, max: 1 }); await admin.query(`create schema ${schema}`)
    pool = new pg.Pool({ connectionString, max: 4, options: `-c search_path=${schema}` })
    await pool.query(await readFile(new URL('../../src/db/migrations/0006_portal_cliente.sql', import.meta.url), 'utf8'))
    await pool.query(`alter table portal_mensagem add column metadata jsonb not null default '{}';
      create unique index portal_mensagem_idempotency_idx on portal_mensagem (cliente_id,de,(metadata->>'actorId'),(metadata->>'idempotencyKey')) where metadata->>'idempotencyKey' is not null;
      create table audit_log(id bigserial primary key,ator text,acao text,recurso text,dados_depois jsonb)`)
  })
  beforeEach(async () => {
    await pool.query('truncate portal_mensagem,portal_upload,portal_documento_pendente,audit_log')
    await pool.query(`insert into portal_upload(id,cliente_id,nome_original,nome_storage,mime,tamanho,enviado_por,metadata)
      values ('own','a','Meu documento.txt','private-path','text/plain',10,'cliente','{}'),
      ('internal','a','Reservado.txt','private-path','text/plain',10,'consultor','{}'),
      ('shared','a','Compartilhado.txt','private-path','text/plain',10,'consultor','{"portalCompartilhado":true}'),
      ('foreign','b','Outro cliente.txt','private-path','text/plain',10,'cliente','{}');
      insert into portal_documento_pendente(id,cliente_id,titulo) values ('request-a','a','CCIR'),('request-b','b','Outro cliente')`)
    mirror.mockClear()
    service = new PortalCommunicationService({ enabled: () => true, pool: () => pool, mirror, legacy: () => [] })
  })
  afterAll(async () => { if (pool) await pool.end(); if (admin) { await admin.query(`drop schema if exists ${schema} cascade`); await admin.end() } })
  it('concorrência confirma uma mensagem e um audit com a mesma chave', async () => {
    const other = new PortalCommunicationService({ enabled: () => true, pool: () => pool, mirror, legacy: () => [] })
    const [one, two] = await Promise.all([service.add('a', { texto: 'Oi', uploadIds: ['own'], pendenciaId: 'request-a' }, actor, 'same-key'), other.add('a', { texto: 'Oi', uploadIds: ['own'], pendenciaId: 'request-a' }, actor, 'same-key')])
    expect(one.id).toBe(two.id)
    expect(one.anexos?.[0]).toMatchObject({ uploadId: 'own', disponivel: true })
    expect((await pool.query('select count(*)::int total from portal_mensagem')).rows[0].total).toBe(1)
    expect((await pool.query('select count(*)::int total from audit_log')).rows[0].total).toBe(1)
    await expect(service.add('a', { texto: 'diferente' }, actor, 'same-key')).rejects.toMatchObject({ statusCode: 409 })
  })
  it('chave é isolada por cliente e autor', async () => {
    const first = await service.add('a', { texto: 'Texto' }, actor, 'same-key')
    expect((await service.add('a', { texto: 'Texto' }, { ...actor, actorId: 'other-owner' }, 'same-key')).id).not.toBe(first.id)
    expect((await service.add('b', { texto: 'Texto' }, actor, 'same-key')).id).not.toBe(first.id)
  })
  it('GET nunca marca lidas; ACK só muda IDs vistos, do cliente e do remetente oposto', async () => {
    const first = await service.add('a', { texto: 'visível' }, actor)
    const second = await service.add('a', { texto: 'não visível' }, actor)
    const own = await service.add('a', { texto: 'minha' }, { ...actor, actorId: 'portal:a', de: 'cliente' })
    const foreign = await service.add('b', { texto: 'outro' }, actor)
    expect((await service.list('a')).every(row => !row.lidaEm)).toBe(true)
    const result = await service.markRead('a', 'consultor', [first.id, own.id, foreign.id], 'portal:a')
    expect(result.ids).toEqual([first.id])
    expect((await service.list('a')).find(row => row.id === second.id)?.lidaEm).toBeUndefined()
    expect((await service.markRead('a', 'consultor', [first.id], 'portal:a')).marcadas).toBe(0)
  })
  it.each(['internal', 'foreign'])('arquivo %s é recusado sem gravação parcial', async uploadId => {
    await expect(service.add('a', { texto: 'Arquivo', uploadIds: [uploadId] }, actor, 'test-key')).rejects.toMatchObject({ statusCode: 404 })
    expect((await service.list('a')).length).toBe(0)
  })
  it('pedido de outro cliente e URL/path externo são recusados', async () => {
    await expect(service.add('a', { texto: 'oi', pendenciaId: 'request-b' }, actor)).rejects.toMatchObject({ statusCode: 404 })
    await expect(service.add('a', { texto: 'oi', anexos: ['https://external.test/file'] }, actor)).rejects.toMatchObject({ statusCode: 400 })
    await expect(service.add('a', { texto: 'oi', uploadIds: ['/root/segredo'] }, actor)).rejects.toMatchObject({ statusCode: 404 })
    expect((await service.list('a')).length).toBe(0)
  })
  it('revogação de compartilhamento remove acesso do anexo em leitura e replay', async () => {
    await service.add('a', { uploadIds: ['shared'] }, actor, 'same-key')
    await pool.query(`update portal_upload set metadata='{}' where id='shared'`)
    expect((await service.list('a'))[0].anexos?.[0]).toMatchObject({ disponivel: false, nome: 'Arquivo indisponível' })
    expect((await service.add('a', { uploadIds: ['shared'] }, actor, 'same-key')).anexos?.[0].disponivel).toBe(false)
    expect(JSON.stringify(await service.list('a'))).not.toContain('private-path')
  })
  it('falha de auditoria desfaz mensagem e recibo; não publica cache', async () => {
    const msg = await service.add('a', { texto: 'preservar' }, actor)
    mirror.mockClear()
    await pool.query(`create function fail_audit() returns trigger language plpgsql as $$begin raise exception 'synthetic audit failure'; end$$;
      create trigger fail_audit before insert on audit_log for each row execute function fail_audit()`)
    try {
      await expect(service.add('a', { texto: 'não gravar' }, actor, 'fail-key')).rejects.toThrow('synthetic audit')
      await expect(service.markRead('a', 'consultor', [msg.id], 'portal:a')).rejects.toThrow('synthetic audit')
      expect(mirror).not.toHaveBeenCalled()
      expect((await pool.query('select texto,lida_em from portal_mensagem')).rows).toEqual([{ texto: 'preservar', lida_em: null }])
    } finally { await pool.query('drop trigger fail_audit on audit_log'); await pool.query('drop function fail_audit()') }
  })
  it('rotas preservam contrato legado, separam autorização e exigem IDs no ACK', async () => {
    const app = Fastify(); const notify = vi.fn(async () => undefined)
    await registerPortalConversationRoutes(app, async (request, reply) => {
      if (request.headers.authorization !== 'Bearer fixture') { await reply.code(401).send({ error: 'unauthorized' }); return }
      ;(request as any).clienteId = 'a'
    }, { service, clientName: () => 'Cliente sintético', afterStaffMessage: notify,
      staffGuard: (async (_app, request, id) => {
        if (request.headers['x-staff'] !== 'yes' || id !== 'a') throw Object.assign(new Error('unauthorized'), { statusCode: 401 })
        return { client: { id: 'a' }, user: { id: 'owner', nome: 'Equipe' } }
      }) as any })
    try {
      expect((await app.inject('/api/portal/mensagens')).statusCode).toBe(401)
      const opts = { method: 'POST' as const, url: '/api/clientes/a/portal-mensagens', headers: { 'x-staff': 'yes', 'idempotency-key': 'same-key' }, payload: { texto: 'Mensagem teste' } }
      const sent = await app.inject(opts); const id = sent.json().data.id
      expect(sent.statusCode).toBe(201)
      expect((await app.inject(opts)).statusCode).toBe(200); expect(notify).toHaveBeenCalledOnce()
      const headers = { authorization: 'Bearer fixture' }
      const read = await app.inject({ url: '/api/portal/mensagens', headers }); expect(Array.isArray(read.json().data)).toBe(true); expect(read.json().data[0].lidaEm).toBeUndefined()
      expect((await app.inject({ method: 'POST', url: '/api/portal/mensagens/marcar-lidas', headers, payload: {} })).statusCode).toBe(400)
      const ack = await app.inject({ method: 'POST', url: '/api/portal/mensagens/marcar-lidas', headers, payload: { ids: [id] } })
      expect(ack.json().data.ids).toEqual([id])
      expect((await app.inject({ method: 'PATCH', url: '/api/clientes/a/portal-mensagens/marcar-lidas', headers: { 'x-staff': 'yes' }, payload: {} })).statusCode).toBe(400)
    } finally { await app.close() }
  })
})
