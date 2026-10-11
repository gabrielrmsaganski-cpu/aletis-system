import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ clients: new Map<string, any>() }))
vi.mock('../../src/routes/clientes.js', () => ({ clientes: state.clients }))
import { PortalClientRequestService } from '../../src/services/portal/PortalClientRequestService.js'

describe.skipIf(!process.env.ALETIS_PORTAL_FIXTURE_FILE)('atendimento e correção cadastral em PostgreSQL isolado', () => {
  const schema = `portal_support_${randomUUID().replaceAll('-','')}`
  let admin: pg.Pool; let pool: pg.Pool; let service: PortalClientRequestService
  const baseline = { nome:'Cliente fictício',email:'antes@example.test',telefone:'65990000000',cidade:'Cidade antiga',uf:'MT',notasInternas:'Preservar',dividas:[{valor:'123.45'}] }
  const input = { tipo:'atualizacao_cadastral',assunto:'Corrigir meu contato',mensagem:'Meu contato mudou. Favor atualizar.',alteracoes:{email:'NOVO@example.test',cidade:'Cidade nova'} }
  beforeAll(async () => {
    const connectionString = (await readFile(process.env.ALETIS_PORTAL_FIXTURE_FILE!, 'utf8')).trim(); const url = new URL(connectionString)
    if (!['127.0.0.1','localhost'].includes(url.hostname) || url.port !== '55436' || url.pathname !== '/aletis_implementation_fixture') throw new Error('Fixture isolado obrigatório')
    admin = new pg.Pool({connectionString}); await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:5})
    await pool.query(`CREATE TABLE cliente(id text PRIMARY KEY,payload jsonb,email text,telefone text,cidade text,uf text,atualizado_em timestamptz);
      CREATE TABLE audit_log(id bigserial PRIMARY KEY,ator text,acao text,recurso text,dados_antes jsonb,dados_depois jsonb);
      CREATE TABLE portal_evento(id bigserial PRIMARY KEY,cliente_id text,tipo text,canal text,detalhes jsonb);
      CREATE TABLE portal_client_request(id text PRIMARY KEY,cliente_id text,tipo text,assunto text,mensagem text,alteracoes jsonb,status text,resposta text,idempotency_key text,metadata jsonb,created_at timestamptz,updated_at timestamptz,UNIQUE(cliente_id,idempotency_key));`)
    service = new PortalClientRequestService({pool,pgEnabled:()=>true})
  })
  beforeEach(async () => {
    await pool.query('TRUNCATE portal_client_request,portal_evento,audit_log,cliente')
    await pool.query('INSERT INTO cliente(id,payload) VALUES($1,$3),($2,$3)',['a','b',JSON.stringify(baseline)])
    await pool.query("UPDATE cliente SET email=payload->>'email',telefone=payload->>'telefone',cidade=payload->>'cidade',uf=payload->>'uf'")
    state.clients.clear();state.clients.set('a',structuredClone(baseline));state.clients.set('b',structuredClone(baseline))
  })
  afterAll(async () => { await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end()} })
  const payload = async () => (await pool.query('SELECT payload FROM cliente WHERE id=$1',['a'])).rows[0].payload
  it('pedido não altera cadastro; retry concorrente cria um único pedido auditado', async () => {
    const results = await Promise.all([service.create('a',input,'pedido-1234'),service.create('a',input,'pedido-1234')])
    expect(results.filter(r=>r.replayed)).toHaveLength(1);expect(new Set(results.map(r=>r.request.id)).size).toBe(1)
    expect(await payload()).toEqual(baseline);expect(state.clients.get('a')).toEqual(baseline)
    expect((await service.list('a'))[0]).toMatchObject({status:'aberta',alteracoes:{email:'novo@example.test'},cadastroAtualizado:false})
    expect(JSON.stringify(await service.list('a'))).not.toMatch(/baseProfile|actorId|notasInternas/)
    expect((await pool.query('SELECT count(*)::int n FROM audit_log')).rows[0].n).toBe(1)
    await expect(service.create('a',{...input,mensagem:'Outro conteúdo'},'pedido-1234')).rejects.toMatchObject({statusCode:409})
  })
  it('aprovação aplica somente os campos pedidos, com resposta, auditoria e cache após commit', async () => {
    const {request}=await service.create('a',input,'pedido-1234')
    const result=await service.review('a',request.id,{expectedUpdatedAt:request.updatedAt,status:'concluida',resposta:'Conferimos e atualizamos seu contato.',aplicarAlteracoes:true},'consultor-fixture')
    expect(result).toMatchObject({status:'concluida',cadastroAtualizado:true,alteracoes:{email:'novo@example.test'}})
    expect(await payload()).toEqual({...baseline,email:'novo@example.test',cidade:'Cidade nova'})
    expect(state.clients.get('a')).toEqual({...baseline,email:'novo@example.test',cidade:'Cidade nova'})
    expect((await pool.query("SELECT email,telefone,cidade,uf FROM cliente WHERE id='a'")).rows[0]).toEqual({email:'novo@example.test',telefone:baseline.telefone,cidade:'Cidade nova',uf:baseline.uf})
    expect((await pool.query("SELECT count(*)::int n FROM audit_log WHERE acao='portal_cadastro_atualizado'")).rows[0].n).toBe(1)
  })
  it('modificação do CRM após o pedido bloqueia sobrescrita concorrente', async () => {
    const {request}=await service.create('a',input,'pedido-1234')
    await pool.query("UPDATE cliente SET payload=jsonb_set(payload,'{email}','\"equipe@example.test\"') WHERE id='a'")
    await expect(service.review('a',request.id,{expectedUpdatedAt:request.updatedAt,status:'concluida',resposta:'Atualizar',aplicarAlteracoes:true},'staff')).rejects.toMatchObject({statusCode:409,code:'PORTAL_PROFILE_CONFLICT'})
    expect((await payload()).email).toBe('equipe@example.test');expect((await service.list('a'))[0].status).toBe('aberta')
    expect(state.clients.get('a')).toEqual(baseline)
  })
  it('versão desatualizada, cliente diferente e encerramento sem orientação são recusados', async () => {
    const {request}=await service.create('a',input,'pedido-1234')
    await expect(service.review('b',request.id,{expectedUpdatedAt:request.updatedAt,status:'em_atendimento'},'staff')).rejects.toMatchObject({statusCode:404})
    expect(await service.list('b')).toEqual([])
    const changed=await service.review('a',request.id,{expectedUpdatedAt:request.updatedAt,status:'em_atendimento'},'staff')
    await expect(service.review('a',request.id,{expectedUpdatedAt:request.updatedAt,status:'concluida',resposta:'Certo'},'staff')).rejects.toMatchObject({statusCode:409})
    await expect(service.review('a',request.id,{expectedUpdatedAt:changed.updatedAt,status:'concluida'},'staff')).rejects.toMatchObject({statusCode:400})
    await expect(service.review('a',request.id,{},'staff')).rejects.toMatchObject({statusCode:428})
  })
  it('dados fora da lista, CPF, campos de controle e UF inválida não chegam ao banco', async () => {
    for (const body of [{...input,alteracoes:{cpfCnpj:'000'}},{...input,alteracoes:{uf:'ZZ'}},{...input,status:'concluida'},{...input,tipo:'duvida'},{...input,alteracoes:{}}]) {
      await expect(service.create('a',body,'pedido-1234')).rejects.toMatchObject({statusCode:400})
    }
    expect(await service.list('a')).toEqual([])
  })
  it('cliente cancela somente pedido aberto próprio; equipe responde dúvida sem alterar cadastro', async () => {
    const {request}=await service.create('a',input,'pedido-1234')
    await expect(service.cancel('b',request.id,request.updatedAt)).rejects.toMatchObject({statusCode:404})
    expect((await service.cancel('a',request.id,request.updatedAt)).status).toBe('cancelada')
    const question=(await service.create('a',{tipo:'duvida',assunto:'Qual o próximo passo?',mensagem:'Preciso de uma orientação.'},'duvida-1234')).request
    const answer=await service.review('a',question.id,{expectedUpdatedAt:question.updatedAt,status:'concluida',resposta:'Confira o pedido de documento publicado no portal.'},'staff')
    expect(answer.cadastroAtualizado).toBe(false);expect(await payload()).toEqual(baseline)
  })
  it('falha na auditoria reverte cadastro, status e cache juntos', async () => {
    const {request}=await service.create('a',input,'pedido-1234')
    await pool.query(`CREATE FUNCTION reject_support_event() RETURNS trigger AS $$ BEGIN IF NEW.tipo='portal_atendimento_respondido' THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_support_event BEFORE INSERT ON portal_evento FOR EACH ROW EXECUTE FUNCTION reject_support_event();`)
    try {
      await expect(service.review('a',request.id,{expectedUpdatedAt:request.updatedAt,status:'concluida',resposta:'Atualizar',aplicarAlteracoes:true},'staff')).rejects.toThrow('fixture rollback')
      expect(await payload()).toEqual(baseline);expect(state.clients.get('a')).toEqual(baseline)
      expect((await service.list('a'))[0]).toMatchObject({status:'aberta',cadastroAtualizado:false})
    } finally { await pool.query('DROP TRIGGER reject_support_event ON portal_evento; DROP FUNCTION reject_support_event()') }
  })
})
