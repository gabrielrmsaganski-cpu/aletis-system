import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { FISCAL_UFS } from '@aletis/shared-types'
import { PortalFiscalService } from '../../src/services/portal/PortalFiscalService.js'

describe.skipIf(!process.env.ALETIS_PORTAL_FIXTURE_FILE)('autorizações SEFAZ em PostgreSQL isolado',()=>{
  const schema='portal_fiscal_'+randomUUID().replaceAll('-','');let admin:pg.Pool;let pool:pg.Pool;let service:PortalFiscalService
  const input={uf:'MT',servicos:['debitos','cadastro'],modalidade:'procuracao_eletronica',referencia:'RECIBO-SINTETICO-001',validadeAte:'2099-01-01',consentimento:true}
  beforeAll(async()=>{
    const connectionString=(await readFile(process.env.ALETIS_PORTAL_FIXTURE_FILE!,'utf8')).trim();const url=new URL(connectionString)
    if(!['127.0.0.1','localhost'].includes(url.hostname)||url.port!=='55436'||url.pathname!=='/aletis_implementation_fixture')throw Error('Fixture local obrigatório')
    admin=new pg.Pool({connectionString});await admin.query('CREATE SCHEMA '+schema);pool=new pg.Pool({connectionString,options:'-c search_path='+schema,max:5})
    await pool.query("CREATE TABLE cliente(id text PRIMARY KEY,payload jsonb NOT NULL DEFAULT '{}');CREATE TABLE cliente_demanda(id text PRIMARY KEY,cliente_id text);CREATE TABLE audit_log(id bigserial PRIMARY KEY,ator text,acao text,recurso text,dados_antes jsonb,dados_depois jsonb);CREATE TABLE portal_upload(id text PRIMARY KEY,cliente_id text,nome_original text,mime text,enviado_por text,metadata jsonb)")
    await pool.query(await readFile(new URL('../../src/db/migrations/0047_portal_matters_fiscal.sql',import.meta.url),'utf8'));service=new PortalFiscalService({pool,pgEnabled:()=>true})
  })
  beforeEach(async()=>{await pool.query('TRUNCATE portal_fiscal_authorization_event,portal_fiscal_authorization,portal_upload,audit_log,cliente CASCADE');await pool.query("INSERT INTO cliente(id) VALUES('a'),('b');INSERT INTO portal_upload VALUES('pdf-a','a','procuracao.pdf','application/pdf','cliente','{}'),('pdf-b','b','privado.pdf','application/pdf','cliente','{}'),('staff-hidden','a','interno.pdf','application/pdf','consultor','{}'),('txt-a','a','documento.txt','text/plain','cliente','{}')")})
  afterAll(async()=>{await pool?.end();if(admin){await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end()}})
  it('duplo envio concorrente cria uma única solicitação com consentimento e auditoria',async()=>{
    const results=await Promise.all([service.create('a',input,'fiscal-key-001'),service.create('a',input,'fiscal-key-001')]);expect(results.filter(value=>value.replayed)).toHaveLength(1)
    const data=await service.list('a');expect(data.autorizacoes).toHaveLength(1);expect(data.eventos).toHaveLength(1);expect(data.consultaAutomatica).toBe(false);expect(data.autorizacoes[0].status).toBe('solicitada')
    expect(new Set(data.catalogo.map(item=>item.uf))).toEqual(new Set(FISCAL_UFS));expect((await pool.query('SELECT count(*)::int n FROM audit_log')).rows[0].n).toBe(1)
    await expect(service.create('a',{...input,uf:'SP'},'fiscal-key-001')).rejects.toMatchObject({statusCode:409});expect((await service.list('b')).autorizacoes).toHaveLength(0)
  })
  it('não aceita poderes sem consentimento, senhas, UF inválida, data inválida ou certificado anexado',async()=>{
    for(const body of [{...input,consentimento:false},{...input,senha:'secret'},{...input,uf:'ZZ'},{...input,validadeAte:'2026-02-30'},{...input,referencia:'-----BEGIN PRIVATE KEY-----'},{...input,modalidade:'certificado_a1',comprovanteId:'pdf-a'}])await expect(service.create('a',body,'invalid-key-001')).rejects.toMatchObject({statusCode:400})
    expect((await service.list('a')).autorizacoes).toHaveLength(0)
  })
  it('comprovante pertence ao cliente, é público para ele e deve ser PDF',async()=>{
    for(const comprovanteId of ['pdf-b','staff-hidden','txt-a','ausente'])await expect(service.create('a',{...input,comprovanteId},'proof-key-001')).rejects.toMatchObject({statusCode:404})
    await pool.query("UPDATE portal_upload SET metadata=$1 WHERE id='staff-hidden'",[JSON.stringify({portalCompartilhado:'true'})]);await expect(service.create('a',{...input,comprovanteId:'staff-hidden'},'proof-key-001')).rejects.toMatchObject({statusCode:404})
    const created=(await service.create('a',{...input,comprovanteId:'pdf-a'},'proof-key-001')).autorizacao
    expect(created).toMatchObject({comprovanteId:'pdf-a',comprovanteDisponivel:true});expect(JSON.stringify(created)).not.toMatch(/metadata|storage|senha|request_hash/)
  })
  it('conferência exige prova dos poderes e não pode ampliar escopo ou vigência',async()=>{
    const {autorizacao:item}=await service.create('a',input,'review-key-001')
    const review={representante:'Representante sintético',expectedUpdatedAt:item.atualizadoEm,status:'conferida',orientacao:'Titular e representante conferidos no órgão.',servicosConferidos:['debitos'],conferenciaConfirmada:true}
    await expect(service.review('b',item.id,review,'staff')).rejects.toMatchObject({statusCode:404})
    await expect(service.review('a',item.id,{...review,representante:undefined},'staff')).rejects.toMatchObject({statusCode:400})
    await expect(service.review('a',item.id,{...review,conferenciaConfirmada:false},'staff')).rejects.toMatchObject({statusCode:400})
    await expect(service.review('a',item.id,{...review,servicosConferidos:['notas']},'staff')).rejects.toMatchObject({statusCode:400})
    await expect(service.review('a',item.id,{...review,validadeAte:'2099-12-31'},'staff')).rejects.toMatchObject({statusCode:400})
    await expect(service.review('a',item.id,{...review,status:'pendencia',validadeAte:'2099-12-31'},'staff')).rejects.toMatchObject({statusCode:400})
    const done=await service.review('a',item.id,review,'staff');expect(done.status).toBe('conferida');expect(done.servicosConferidos).toEqual(['debitos']);expect(done.consultaAutomatica).toBe(false)
    await expect(service.review('a',item.id,review,'staff')).rejects.toMatchObject({statusCode:409});expect((await service.list('a')).eventos).toHaveLength(2)
  })
  it('A1 e A3 ficam em preparação e jamais são habilitados como procuração',async()=>{
    for(const [index,modalidade]of ['certificado_a1','certificado_a3'].entries()){
      const item=(await service.create(index?'b':'a',{...input,modalidade},'certificate-key-001')).autorizacao
      await expect(service.review(item.clienteId,item.id,{expectedUpdatedAt:item.atualizadoEm,status:'conferida',orientacao:'Conferir acesso',servicosConferidos:['debitos'],conferenciaConfirmada:true},'staff')).rejects.toMatchObject({statusCode:400})
    }
  })
  it('suspensão é local, auditada, isolada e definitiva para o registro',async()=>{
    const item=(await service.create('a',input,'revoke-key-001')).autorizacao
    await expect(service.revoke('b',item.id,{expectedUpdatedAt:item.atualizadoEm})).rejects.toMatchObject({statusCode:404})
    const revoked=await service.revoke('a',item.id,{expectedUpdatedAt:item.atualizadoEm});expect(revoked.status).toBe('revogada');expect(revoked.orientacao).toContain('órgão emissor')
    await expect(service.review('a',item.id,{expectedUpdatedAt:revoked.atualizadoEm,status:'em_conferencia',orientacao:'Reabrir'},'staff')).rejects.toMatchObject({statusCode:409})
    await expect(pool.query('DELETE FROM portal_fiscal_authorization_event WHERE authorization_id=$1',[item.id])).rejects.toThrow('append-only')
  })
  it('falha na auditoria reverte autorização e histórico',async()=>{
    await pool.query("CREATE FUNCTION reject_fiscal_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit fixture'; END; $$;CREATE TRIGGER reject_fiscal BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_fiscal_audit()")
    try{await expect(service.create('a',input,'audit-key-001')).rejects.toThrow('audit fixture');expect((await service.list('a')).autorizacoes).toHaveLength(0);expect((await service.list('a')).eventos).toHaveLength(0)}finally{await pool.query('DROP TRIGGER reject_fiscal ON audit_log;DROP FUNCTION reject_fiscal_audit()')}
  })
  it('validade vencida é recalculada na leitura e nenhum acesso automático é presumido',async()=>{
    const item=(await service.create('a',input,'expiry-key-001')).autorizacao
    await pool.query("UPDATE portal_fiscal_authorization SET status='conferida',payload=jsonb_set(payload,'{validadeAte}','\"2000-01-01\"') WHERE id=$1",[item.id]);expect((await service.list('a')).autorizacoes[0]).toMatchObject({status:'expirada',statusRegistrado:'conferida',consultaAutomatica:false})
  })
})
