import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
const holder = vi.hoisted(() => ({ pool: null as any, clients: new Map<string, any>() }))
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => true, getPool: () => holder.pool }))
vi.mock('../../src/routes/clientes.js', () => ({ clientes: holder.clients }))
import { loadPortalAccess, refreshPortalAccesses, savePortalAccess, deletePortalAccess, recordPortalLogin } from '../../src/services/portal/PortalAccountService.js'
import { addPortalMessage, listPortalMessages, markPortalMessagesRead, publishPortalUpdate, listPortalUpdates, sharePortalUpload } from '../../src/services/portal/PortalCommunicationService.js'
import { criarAcessoPortal } from '../../src/services/PortalAuthService.js'

describe.skipIf(!process.env.ALETIS_PORTAL_FIXTURE_FILE)('Portal: acesso e comunicação persistentes em PG isolado', () => {
  const schema = `portal_account_fixture_${randomUUID().replaceAll('-', '')}`
  let admin: pg.Pool
  beforeAll(async () => {
    const connectionString = (await readFile(process.env.ALETIS_PORTAL_FIXTURE_FILE!, 'utf8')).trim()
    const url = new URL(connectionString)
    if (!['127.0.0.1','localhost'].includes(url.hostname) || url.port !== '55436' || url.pathname !== '/aletis_implementation_fixture') throw new Error('Exige banco descartável autorizado.')
    admin = new pg.Pool({ connectionString }); await admin.query(`CREATE SCHEMA ${schema}`)
    holder.pool = new pg.Pool({ connectionString, options:`-c search_path=${schema}`, max:5 })
    await holder.pool.query(`CREATE TABLE cliente(id text PRIMARY KEY,payload jsonb DEFAULT '{}');
      CREATE TABLE portal_acesso(cliente_id text PRIMARY KEY,usuario text,senha_hash text,salt text,ativo boolean,forca_troca_senha boolean,criado_em timestamptz,atualizado_em timestamptz,ultimo_login_em timestamptz);
      CREATE UNIQUE INDEX account_user_unique ON portal_acesso(lower(usuario));
      CREATE TABLE portal_token(id text,cliente_id text,consumido_em timestamptz);
      CREATE TABLE portal_mensagem(id text PRIMARY KEY,cliente_id text,de text,autor_nome text,texto text,criado_em timestamptz,lida_em timestamptz,anexos jsonb,metadata jsonb NOT NULL DEFAULT '{}');
      CREATE TABLE portal_evento(id serial PRIMARY KEY,cliente_id text,tipo text,canal text,detalhes jsonb,criado_em timestamptz);
      CREATE TABLE audit_log(id serial PRIMARY KEY,ator text,acao text,recurso text,dados_depois jsonb);
      CREATE TABLE portal_upload(id text PRIMARY KEY,cliente_id text,metadata jsonb);
      INSERT INTO cliente(id) VALUES('a'),('b'),('c');
      INSERT INTO portal_upload VALUES ('file-a','a','{"processing":{"analysis":{"status":"processing"}}}');`)
    for (const id of ['a','b','c']) holder.clients.set(id, {id,portalMensagens:[]})
  })
  afterAll(async () => {
    if (holder.pool) await holder.pool.end()
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end() }
  })
  const make = (usuario: string) => criarAcessoPortal({usuario,senhaInicial:'Synthetic-pass-9021'}).acesso

  it('cria acesso durável e recupera após perda total do cache', async () => {
    const access = await savePortalAccess('a', make('cliente-a'))
    holder.clients.get('a').portalAcesso = undefined
    expect(await loadPortalAccess('a')).toMatchObject({usuario:'cliente-a',senhaHash:access.senhaHash})
    expect((await holder.pool.query("SELECT payload->'portalAcesso' AS access FROM cliente WHERE id='a'")).rows[0].access.usuario).toBe('cliente-a')
  })
  it('não permite mesmo usuário em outro cliente e mantém registro anterior', async () => {
    await expect(savePortalAccess('b',make('CLIENTE-A'))).rejects.toMatchObject({statusCode:409})
    expect(await loadPortalAccess('b')).toBeNull()
  })
  it('trocas concorrentes exigem hash vigente e invalidam versão anterior', async () => {
    const old = (await loadPortalAccess('a'))!
    const results = await Promise.allSettled([1,2].map(() => savePortalAccess('a',make('cliente-a'),old.senhaHash)))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect((await loadPortalAccess('a'))!.atualizadoEm).not.toBe(old.atualizadoEm)
  })
  it('falha na segunda gravação reverte credencial e cache', async () => {
    await holder.pool.query("ALTER TABLE cliente ADD CONSTRAINT reject_access CHECK(id<>'c' OR NOT(payload ? 'portalAcesso'))")
    await expect(savePortalAccess('c',make('cliente-c'))).rejects.toBeDefined()
    expect(await loadPortalAccess('c')).toBeNull()
    expect(holder.clients.get('c').portalAcesso).toBeUndefined()
  })
  it('login não muda versão; desativação e revogação sobrevivem ao refresh', async () => {
    const before = (await loadPortalAccess('a'))!
    await recordPortalLogin('a')
    expect((await loadPortalAccess('a'))!.atualizadoEm).toBe(before.atualizadoEm)
    await savePortalAccess('a',{...before,ativo:false})
    await refreshPortalAccesses();expect(holder.clients.get('a').portalAcesso.ativo).toBe(false)
    await deletePortalAccess('a');await refreshPortalAccesses()
    expect(await loadPortalAccess('a')).toBeNull()
    expect((await holder.pool.query("SELECT payload ? 'portalAcesso' AS has FROM cliente WHERE id='a'")).rows[0].has).toBe(false)
  })
  it('mensagens persistem, isolam clientes e marcam apenas o remetente correto', async () => {
    const a = await addPortalMessage('a',{de:'cliente',autorNome:'Cliente A',texto:'Arquivo enviado'})
    await addPortalMessage('b',{de:'consultor',autorNome:'Equipe',texto:'Solicitação B'})
    holder.clients.get('a').portalMensagens=[]
    expect((await listPortalMessages('a')).map(m=>m.id)).toEqual([a.id])
    expect(await markPortalMessagesRead('a','consultor',[a.id])).toBe(0)
    expect(await markPortalMessagesRead('a','cliente',[a.id])).toBe(1)
    expect((await listPortalMessages('b'))[0].lidaEm).toBeUndefined()
  })
  it('andamento publicado tem retry idempotente e não se mistura com evento interno', async () => {
    const input={titulo:'Documentação recebida',descricao:'A equipe iniciou a conferência.'}
    const results=await Promise.all([1,2].map(()=>publishPortalUpdate('a',input,'test','update-same-key')))
    expect(results[0].id).toBe(results[1].id)
    await holder.pool.query("INSERT INTO portal_evento(cliente_id,tipo,detalhes,criado_em) VALUES('a','internal','{\"titulo\":\"SEGREDO\"}',now())")
    expect(JSON.stringify(await listPortalUpdates('a'))).not.toContain('SEGREDO')
    expect(await listPortalUpdates('b')).toEqual([])
    await expect(publishPortalUpdate('a',{...input,titulo:'Outro título'},'test','update-same-key')).rejects.toMatchObject({statusCode:409})
  })
  it('compartilhamento preserva estado de processamento e valida cliente', async () => {
    await expect(sharePortalUpload('b','file-a',true,'test')).rejects.toMatchObject({statusCode:404})
    await sharePortalUpload('a','file-a',true,'test')
    const metadata=(await holder.pool.query("SELECT metadata FROM portal_upload WHERE id='file-a'")).rows[0].metadata
    expect(metadata).toMatchObject({portalCompartilhado:true,processing:{analysis:{status:'processing'}}})
  })
})
