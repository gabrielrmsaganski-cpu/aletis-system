import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest'
import { FiscalConnectionService } from '../../src/services/fiscal-connection/FiscalConnectionService.js'
import { bridgeFiscalDocuments } from '../../src/services/fiscal-connection/FiscalConnectionWorker.js'
import { PortalDocumentService } from '../../src/services/portal/PortalDocumentService.js'

describe.skipIf(!process.env.ALETIS_PORTAL_FIXTURE_FILE)('conexão fiscal persistente e isolada',()=>{
  const schema='fiscal_connection_'+randomUUID().replaceAll('-','')
  let admin:pg.Pool,pool:pg.Pool,service:FiscalConnectionService,directory:string,now:number
  const inspect=vi.fn(),seal=vi.fn(),open=vi.fn(),query=vi.fn(),dispose=vi.fn()
  const cpf='12345678909',cnpj='11222333000181'
  const meta={documentType:'CPF',document:cpf,maskedDocument:'***.***.***-09',subject:'Titular sintético',issuer:'AC teste',serialNumber:'01',fingerprint256:'AABB',validFrom:'2020-01-01T00:00:00.000Z',validTo:'2099-01-01T00:00:00.000Z',keyType:'rsa',keyBits:2048,chainVerified:true,revocationChecked:false}
  const input=()=>({file:Buffer.alloc(100,7),filename:'certificado.pfx',fields:{senha:'synthetic-only',uf:'MT',documento:cpf,consentimento:'true'}})
  const empty=()=>({statusCode:'137',message:'Nenhum documento localizado',ultNSU:'000000000000000',maxNSU:'000000000000000',receivedAt:new Date(now).toISOString(),cursorReceived:true,documents:[]})
  const doc=(nsu='000000000000001')=>({nsu,schema:'resNFe_v1.01.xsd',xml:'<resNFe xmlns="http://www.portalfiscal.inf.br/nfe"><xNome>Fornecedor sintético</xNome></resNFe>',kind:'nfe_summary',issuer:{documento:cnpj,nome:'Fornecedor sintético'},issuedAt:'2026-09-13T10:00:00-03:00',value:'1234.56'})
  const batch=()=>({...empty(),statusCode:'138',ultNSU:'000000000000001',maxNSU:'000000000000001',documents:[doc()]})
  beforeAll(async()=>{
    const connectionString=(await readFile(process.env.ALETIS_PORTAL_FIXTURE_FILE!,'utf8')).trim(),url=new URL(connectionString)
    if(!['127.0.0.1','localhost'].includes(url.hostname)||url.port!=='55436'||url.pathname!=='/aletis_implementation_fixture')throw Error('Isolated fixture required')
    admin=new pg.Pool({connectionString});await admin.query('CREATE SCHEMA '+schema);pool=new pg.Pool({connectionString,options:'-c search_path='+schema,max:8})
    await pool.query("CREATE TABLE cliente(id text PRIMARY KEY,payload jsonb NOT NULL DEFAULT '{}');CREATE TABLE audit_log(id bigserial PRIMARY KEY,ator text,acao text,recurso text,dados_antes jsonb,dados_depois jsonb,criado_em timestamptz DEFAULT now())")
    for(const file of ['0006_portal_cliente.sql','0045_portal_document_processing.sql','0048_fiscal_connections.sql','0049_fiscal_archive.sql'])await pool.query(await readFile(new URL('../../src/db/migrations/'+file,import.meta.url),'utf8'))
    directory=await mkdtemp(join(tmpdir(),'fiscal-documents-test-'))
  })
  beforeEach(async()=>{
    now=Date.now();vi.resetAllMocks();inspect.mockResolvedValue({...meta});seal.mockResolvedValue({version:1,algorithm:'aes-256-gcm',keyId:'test',iv:'iv',ciphertext:'opaque',tag:'tag'});open.mockImplementation(async()=>({pfx:Buffer.alloc(100,3),passphrase:'normalized-secret',dispose}));query.mockImplementation(async()=>empty())
    await pool.query('TRUNCATE fiscal_document,fiscal_query,fiscal_credential,fiscal_nfe_cursor,portal_upload,portal_document_processing_job,audit_log,cliente CASCADE')
    await pool.query('INSERT INTO cliente(id,payload) VALUES($1,$2),($3,$4)',['a',JSON.stringify({cpfCnpj:cpf}),'b',JSON.stringify({cpfCnpj:cnpj})])
    service=new FiscalConnectionService({pool,pgEnabled:()=>true,now:()=>now,configured:async()=>true,inspect,seal,open,query})
  })
  afterAll(async()=>{await pool?.end();if(admin){await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end()}if(directory)await rm(directory,{recursive:true,force:true})})
  const receive=()=>service.receive('a',input(),'certificate-key-001')
  const consult=(id:string,key='query-key-001')=>service.consult('a',{credencialId:id},key,'portal:a')
  it('consulta pontual respeita20 por hora e não muda cursor nem pausa da distribuição',async()=>{
    const {credencial:c}=await receive();now+=1000
    await pool.query("UPDATE fiscal_nfe_cursor SET ult_nsu='000000000000100',max_nsu='000000000000100',next_allowed_at=$1",[new Date(now+3600000)])
    for(let i=1;i<=20;i++)await service.consult('a',{credencialId:c.id,modalidade:'nsu',alvo:String(i)},'target-'+String(i).padStart(3,'0'),'staff')
    expect(query).toHaveBeenCalledTimes(20)
    await expect(service.consult('a',{credencialId:c.id,modalidade:'nsu',alvo:'21'},'target-021','staff')).rejects.toMatchObject({statusCode:429})
    expect((await pool.query('SELECT ult_nsu FROM fiscal_nfe_cursor')).rows[0].ult_nsu).toBe('000000000000100')
    await expect(consult(c.id)).rejects.toMatchObject({statusCode:429})
  })
  it('consulta pontual gravaNSU anterior sem regredir sequência e idempotência considera alvo',async()=>{
    const {credencial:c}=await receive();now+=1000
    await pool.query("UPDATE fiscal_nfe_cursor SET ult_nsu='000000000000100',max_nsu='000000000000100'")
    query.mockResolvedValue({...batch(),documents:[doc()]})
    const result=await service.consult('a',{credencialId:c.id,modalidade:'nsu',alvo:'1'},'target-001','staff');expect(result.status).toBe('sucesso')
    expect((await pool.query('SELECT ult_nsu FROM fiscal_nfe_cursor')).rows[0].ult_nsu).toBe('000000000000100')
    expect((await service.list('a')).documentos).toHaveLength(1)
    await expect(service.consult('a',{credencialId:c.id,modalidade:'nsu',alvo:'2'},'target-001','staff')).rejects.toMatchObject({statusCode:409})
  })
  it('656 de consulta pontual bloqueia também distribuição e mantém cursor',async()=>{
    const {credencial:c}=await receive();now+=1000;query.mockResolvedValue({...empty(),statusCode:'656'})
    const result=await service.consult('a',{credencialId:c.id,modalidade:'nsu',alvo:'1'},'target-001','staff');expect(result.status).toBe('bloqueada')
    await expect(consult(c.id)).rejects.toMatchObject({statusCode:429})
    await expect(service.consult('a',{credencialId:c.id,modalidade:'nsu',alvo:'2'},'target-002','staff')).rejects.toMatchObject({statusCode:429})
    expect(query).toHaveBeenCalledOnce()
  })
  it('busca completa prossegue em segundo plano sem ativar acompanhamento permanente',async()=>{
    const {credencial:c}=await receive();now+=1000;query.mockResolvedValue({...batch(),maxNSU:'000000000000002'})
    await service.consult('a',{credencialId:c.id,completa:true},'complete-001','staff')
    expect((await pool.query('SELECT sync_requested FROM fiscal_nfe_cursor')).rows[0].sync_requested).toBe(true)
    expect((await service.list('a')).credenciais[0].automacaoAtiva).toBe(false)
    now+=60001;query.mockResolvedValue({...batch(),ultNSU:'000000000000002',maxNSU:'000000000000002',documents:[doc('000000000000002')]})
    await service.consult('a',{credencialId:c.id},'complete-002','sistema:fiscal')
    expect((await pool.query('SELECT sync_requested FROM fiscal_nfe_cursor')).rows[0].sync_requested).toBe(false)
  })
  it('recebe uma vez; consentimento e auditoria persistem, sem senha no banco ou resposta',async()=>{
    const [a,b]=await Promise.all([receive(),receive()]);expect(a.replayed!==b.replayed).toBe(true)
    const data=await service.list('a');expect(data.credenciais).toHaveLength(1);expect(data.credenciais[0]).toMatchObject({automacaoAtiva:false,verificadaNoOrgao:false,status:'ativa'})
    expect(data.cobertura).toHaveLength(27);expect(JSON.stringify(data)).not.toMatch(/opaque|normalized-secret|synthetic-only|envelope|fingerprint/)
    const row=(await pool.query('SELECT * FROM fiscal_credential')).rows[0];expect(row.consent_version).toBe('consulta-nfe-2026-09-13');expect(row.envelope.ciphertext).toBe('opaque');expect(JSON.stringify(row)).not.toContain('synthetic-only')
    expect((await pool.query('SELECT count(*)::int n FROM audit_log')).rows[0].n).toBe(1)
  })
  it('recusa campo extra, consentimento ausente, arquivo incorreto ou maior que limite',async()=>{
    for(const v of [{...input(),fields:{...input().fields,consentimento:false}},{...input(),fields:{...input().fields,clienteId:'b'}},{...input(),filename:'chave.pem'},{...input(),file:Buffer.alloc(262145)}])await expect(service.receive('a',v,'invalid-key-001')).rejects.toMatchObject({statusCode:400})
    expect(seal).not.toHaveBeenCalled()
  })
  it('não aceita titular divergente do CRM, certificado de terceiro ou duplicidade de titular',async()=>{
    await expect(service.receive('b',input(),'identity-key-001')).rejects.toMatchObject({statusCode:422})
    inspect.mockResolvedValueOnce({...meta,document:cnpj});await expect(receive()).rejects.toMatchObject({statusCode:422})
    await receive();await pool.query('UPDATE cliente SET payload=$1 WHERE id=$2',[JSON.stringify({cpfCnpj:cpf}),'b'])
    await expect(service.receive('b',input(),'identity-key-002')).rejects.toMatchObject({statusCode:409})
  })
  it('senha errada e falha de auditoria não armazenam certificado',async()=>{
    inspect.mockRejectedValueOnce(new Error('safe invalid password'));await expect(receive()).rejects.toThrow('safe invalid password')
    await pool.query("CREATE FUNCTION fail_fiscal_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit fixture'; END; $$;CREATE TRIGGER fail_fiscal_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION fail_fiscal_audit()")
    try{await expect(receive()).rejects.toThrow('audit fixture');expect((await service.list('a')).credenciais).toHaveLength(0)}finally{await pool.query('DROP TRIGGER fail_fiscal_audit ON audit_log;DROP FUNCTION fail_fiscal_audit()')}
  })
  it('consulta137 registra conexão e espera1h; nova tentativa não repete a rede',async()=>{
    const {credencial:c}=await receive();now+=1000
    const done=await consult(c.id);expect(done.status).toBe('sem_documentos');expect(done.mensagem).toContain('não comprova')
    expect(query).toHaveBeenCalledOnce();expect(dispose).toHaveBeenCalledOnce();expect(await consult(c.id)).toEqual(done)
    await expect(consult(c.id,'query-key-002')).rejects.toMatchObject({statusCode:429})
    expect(query).toHaveBeenCalledOnce();expect((await service.list('a')).credenciais[0].verificadaNoOrgao).toBe(true)
    now+=3600001;await consult(c.id,'query-key-003');expect(query).toHaveBeenCalledTimes(2)
  })
  it('não consulta nem baixa documento de outro cliente',async()=>{
    const {credencial:c}=await receive();await expect(service.consult('b',{credencialId:c.id},'query-other-001','portal:b')).rejects.toMatchObject({statusCode:404})
    query.mockResolvedValue(batch());now+=1000;await consult(c.id);const d=(await service.list('a')).documentos[0]
    await expect(service.download('b',d.id,'portal:b')).rejects.toMatchObject({statusCode:404});expect((await service.list('b')).documentos).toHaveLength(0)
    expect((await service.download('a',d.id,'portal:a')).xml).toContain('Fornecedor sintético')
  })
  it('preserva valores decimais, fonte e XML; lote e cursor são atômicos',async()=>{
    const {credencial:c}=await receive();now+=1000;query.mockResolvedValue(batch());await consult(c.id)
    const state=(await pool.query('SELECT * FROM fiscal_nfe_cursor')).rows[0];expect(state.ult_nsu).toBe('000000000000001')
    expect((await service.list('a')).documentos[0]).toMatchObject({tipo:'resumo',valor:'1234.56',nsu:'000000000000001'})
    now+=3600001;query.mockResolvedValue({...batch(),ultNSU:'000000000000003',maxNSU:'000000000000003',documents:[doc('000000000000002'),{...doc('000000000000003'),value:'bad'}]})
    expect((await consult(c.id,'query-key-002')).status).toBe('erro');expect((await pool.query('SELECT ult_nsu FROM fiscal_nfe_cursor')).rows[0].ult_nsu).toBe(state.ult_nsu);expect((await service.list('a')).documentos).toHaveLength(1)
  })
  it('falha de transporte mantém pausa e cursor sem expor resposta técnica ou senha',async()=>{
    const {credencial:c}=await receive();now+=1000;query.mockRejectedValue(new Error('synthetic-only secret-body'))
    const result=await consult(c.id);expect(result.status).toBe('erro');expect(JSON.stringify(result)).not.toContain('secret');expect(dispose).toHaveBeenCalledOnce();await expect(consult(c.id,'query-key-002')).rejects.toMatchObject({statusCode:429})
  })
  it('consumo656 não salta cursor para posição que não foi recebida',async()=>{
    const {credencial:c}=await receive();now+=1000;query.mockResolvedValue({...empty(),statusCode:'656',ultNSU:'000000000000099',maxNSU:'000000000000099'})
    expect((await consult(c.id)).status).toBe('bloqueada');expect((await pool.query('SELECT ult_nsu FROM fiscal_nfe_cursor')).rows[0].ult_nsu).toBe('000000000000000')
    await expect(consult(c.id,'query-key-002')).rejects.toMatchObject({statusCode:429})
  })
  it('pausa por1h após a resposta lenta656 ou falha de rede, não após o início',async()=>{
    const {credencial:c}=await receive();now+=1000
    query.mockImplementationOnce(async()=>{now+=30000;return {...empty(),statusCode:'656'}})
    await consult(c.id);expect(new Date((await pool.query('SELECT next_allowed_at FROM fiscal_nfe_cursor')).rows[0].next_allowed_at).getTime()).toBe(now+3600000)
    now+=3600001;query.mockImplementationOnce(async()=>{now+=30000;throw Error('network error')})
    await consult(c.id,'query-key-002');expect(new Date((await pool.query('SELECT next_allowed_at FROM fiscal_nfe_cursor')).rows[0].next_allowed_at).getTime()).toBe(now+3600000)
  })
  it('trava consultas concorrentes inclusive de duas instâncias',async()=>{
    const {credencial:c}=await receive();now+=1000;let release!:()=>void;let entered!:()=>void;const entering=new Promise<void>(r=>{entered=r});query.mockImplementation(async()=>{entered();await new Promise<void>(r=>{release=r});return empty()})
    const first=consult(c.id);await entering;await expect(consult(c.id,'query-key-002')).rejects.toMatchObject({statusCode:409});release();await first;expect(query).toHaveBeenCalledOnce()
  })
  it('rejeição do certificado pelo órgão retira conexão confirmada e pausa a automação',async()=>{
    const {credencial:c}=await receive();now+=1000;await consult(c.id)
    await service.change('a',c.id,{expectedUpdatedAt:c.atualizadoEm,ativa:true},'portal:a',false)
    now+=3600001;query.mockResolvedValue({...empty(),statusCode:'284'});await consult(c.id,'query-revoked-002')
    expect((await service.list('a')).credenciais[0]).toMatchObject({verificadaNoOrgao:false,automacaoAtiva:false})
    expect((await service.list('a')).cobertura[0].servicos[0].status).toBe('disponivel')
  })
  it('renovação remove envelope antigo e mantém sequência e intervalo',async()=>{
    const {credencial:c}=await receive();now+=1000;query.mockResolvedValue(batch());await consult(c.id)
    const newer=await service.receive('a',input(),'certificate-key-002');expect(newer.credencial.id).not.toBe(c.id)
    const prior=(await pool.query('SELECT * FROM fiscal_credential WHERE id=$1',[c.id])).rows[0];expect(prior.envelope).toBeNull();expect(prior.status).toBe('suspensa')
    await expect(consult(newer.credencial.id,'query-key-new')).rejects.toMatchObject({statusCode:429})
    expect((await pool.query('SELECT ult_nsu FROM fiscal_nfe_cursor')).rows[0].ult_nsu).toBe('000000000000001');expect((await service.list('a')).credenciais[0].verificadaNoOrgao).toBe(false)
  })
  it('suspensão é definitiva, zera cofre e automação, respeita versão e titular',async()=>{
    const {credencial:c}=await receive()
    await expect(service.change('b',c.id,{expectedUpdatedAt:c.atualizadoEm},'portal:b',true)).rejects.toMatchObject({statusCode:404})
    const active=await service.change('a',c.id,{expectedUpdatedAt:c.atualizadoEm,ativa:true},'portal:a',false);expect(active.automacaoAtiva).toBe(true)
    await expect(service.change('a',c.id,{expectedUpdatedAt:c.atualizadoEm},'portal:a',true)).rejects.toMatchObject({statusCode:409})
    const suspended=await service.change('a',c.id,{expectedUpdatedAt:active.atualizadoEm},'portal:a',true);expect(suspended.status).toBe('suspensa');expect(suspended.automacaoAtiva).toBe(false)
    expect((await pool.query('SELECT envelope FROM fiscal_credential')).rows[0].envelope).toBeNull();await expect(consult(c.id)).rejects.toMatchObject({statusCode:422});expect(open).not.toHaveBeenCalled()
  })
  it('expiração ou mudança cadastral impede uso antes da rede',async()=>{
    const {credencial:c}=await receive();now=Date.parse(meta.validTo)+1;await expect(consult(c.id)).rejects.toMatchObject({statusCode:422});expect((await service.list('a')).credenciais[0].status).toBe('expirada')
    now=Date.now()+1000;await pool.query('UPDATE cliente SET payload=$1 WHERE id=$2',[JSON.stringify({cpfCnpj:cnpj}),'a']);await expect(consult(c.id)).rejects.toMatchObject({statusCode:422});expect(query).not.toHaveBeenCalled()
  })
  it('reinício pausa execução ambígua e mantém o cursor antes de qualquer retomada',async()=>{
    const {credencial:c}=await receive()
    await pool.query("UPDATE fiscal_credential SET automacao=true WHERE id=$1",[c.id]);await pool.query("INSERT INTO fiscal_query(id,cliente_id,credential_id,status,message,idempotency_key,started_at) VALUES('crash','a',$1,'executando','Consulta iniciada','crash-key',now()-interval '10 minutes')",[c.id])
    await service.tick();expect(query).not.toHaveBeenCalled();expect((await service.list('a')).credenciais[0].automacaoAtiva).toBe(false)
    expect((await pool.query("SELECT code FROM fiscal_query WHERE id='crash'")).rows[0].code).toBe('FISCAL_INTERRUPTED');expect((await pool.query('SELECT ult_nsu FROM fiscal_nfe_cursor')).rows[0].ult_nsu).toBe('000000000000000')
  })
  it('outbox entrega XML uma vez para fila ALIX/Drive e o compartilha com o titular',async()=>{
    const {credencial:c}=await receive();now+=1000;query.mockResolvedValue(batch());await consult(c.id)
    const documents=new PortalDocumentService({pool,pgEnabled:()=>true,mirror:false})
    await bridgeFiscalDocuments({pool,documents,directory});await bridgeFiscalDocuments({pool,documents,directory})
    const rows=(await pool.query('SELECT * FROM portal_upload')).rows;expect(rows).toHaveLength(1);expect(rows[0].enviado_por).toBe('consultor');expect(rows[0].metadata.portalCompartilhado).toBe(true);expect(rows[0].metadata.origemFiscal.fonte).toBe('SEFAZ_Ambiente_Nacional_NFe')
    expect((await pool.query('SELECT status,attempts FROM portal_document_processing_job')).rows).toEqual([{status:'queued',attempts:0}]);expect((await service.list('a')).documentos[0].portalUploadId).toBe(rows[0].id)
  })
})
