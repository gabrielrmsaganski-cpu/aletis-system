import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
vi.mock('../../src/services/google-workspace/gcloudDriveCredentials.js',()=>({getGcloudDriveCredentials:()=>({account:()=> 'christian@aletis.com.br'})}))
import { getPool, closeDb } from '../../src/db/client.js'
import { DriveCorpusService } from '../../src/services/google-workspace/DriveCorpusService.js'
import routes from '../../src/routes/alix-drive-corpus.js'
const fixtureFile=process.env.ALETIS_DRIVE_CORPUS_FIXTURE_FILE
const describeFixture=fixtureFile?describe:describe.skip
describeFixture('catálogo Drive com PostgreSQL e autenticação real isolados',()=> {
  const schema=`drive_access_${randomUUID().replaceAll('-','')}`,service=new DriveCorpusService(), app=Fastify()
  let admin:pg.Pool; let ownerCookie:string;let regisCookie:string
  const old={...process.env};const owner={userId:'consultor-christian',userName:'Christian Kohler',role:'consultor',tenantId:'fixture'}
  beforeAll(async()=> {
    const url=new URL((await readFile(fixtureFile!,'utf8')).trim())
    if(url.hostname!=='127.0.0.1'||url.port!=='55436'||url.pathname!=='/aletis_implementation_fixture')throw new Error('Fixture local obrigatório')
    admin=new pg.Pool({connectionString:url.toString(),max:1});await admin.query(`CREATE SCHEMA ${schema}`)
    url.searchParams.set('options',`-c search_path=${schema}`)
    process.env.DATABASE_URL=url.toString();process.env.ALETIS_PG_ENABLED='1';process.env.ALETIS_TENANT_ID='fixture';process.env.ALETIS_RBAC_STRICT='false';process.env.ALETIS_INTERNAL_AUTH_ENABLED='1';process.env.GOOGLE_DRIVE_ADMIN_USER_IDS='';process.env.ALIX_ADMIN_USER_IDS=''
    await getPool().query(`CREATE TABLE cliente(id text PRIMARY KEY,nome text,payload jsonb);CREATE TABLE client_permission(id text PRIMARY KEY,cliente_id text,user_id text,role text,permissions text[],granted_by text,granted_at timestamptz,revoked_at timestamptz,metadata jsonb)`)
    await getPool().query(await readFile(new URL('../../src/db/migrations/0043_alix_drive_corpus.sql',import.meta.url),'utf8'))
    await getPool().query(`INSERT INTO cliente VALUES('a','Cliente A','{"consultor":"Regis"}'),('b','Cliente B','{"consultor":"Outro"}')`)
    for(const [tenant,file,client,status,corporate,text] of [['fixture','file-a','a','complete',true,'Hipoteca rural documental '.repeat(400)],['fixture','file-b','b','partial',true,'Garantia rural de outro cliente'],['fixture','file-g',null,'pending',false,''],['other','file-a','a','complete',true,'Texto confidencial de outro tenant']]) {
      await getPool().query(`INSERT INTO alix_drive_corpus(tenant_id,file_id,revision_key,name,mime_type,path,cliente_id,corporate_scope,category,read_status,coverage,extracted_text,scanned_at) VALUES($1,$2,'rev',$2,'application/pdf','pasta',$3,$4,'Contratos',$5,$6,$7,now())`,[tenant,file,client,corporate,status,JSON.stringify({status:status==='complete'?'complete':'partial',limitations:[]}),text])
      if(text)await getPool().query(`INSERT INTO alix_drive_corpus_chunk(id,tenant_id,file_id,revision_key,ordinal,text,source,page) VALUES($1,$2,$3,'rev',0,$4,'pdf:page:7',7)`,[`${tenant}-${file}`,tenant,file,String(text).slice(0,1000)])
    }
    await app.register(jwt,{secret:'synthetic-fixture-only-not-a-real-secret'});await app.register(cookie);await app.register(routes);await app.ready()
    ownerCookie='aletis_session='+app.jwt.sign({sub:'consultor-christian',kind:'internal',username:'christian'})
    regisCookie='aletis_session='+app.jwt.sign({sub:'consultor-regis',kind:'internal',username:'regis'})
  })
  afterAll(async()=> {await app.close();await closeDb();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end()}for(const key of ['DATABASE_URL','ALETIS_PG_ENABLED','ALETIS_TENANT_ID','ALETIS_RBAC_STRICT','ALETIS_INTERNAL_AUTH_ENABLED','GOOGLE_DRIVE_ADMIN_USER_IDS','ALIX_ADMIN_USER_IDS']){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key]}})
  it('proíbe anônimo e cabeçalhos que tentam conceder acesso',async()=> {
    expect((await app.inject({url:'/api/alix/drive-corpus/overview',headers:{'x-user-id':'consultor-christian','x-aletis-role':'admin_master'}})).statusCode).toBe(401)
  })
  it('o titular vê somente seu tenant e o filtro corporativo não exclui clientes',async()=> {
    const all=await service.overview(owner)
    expect(all.totals.files).toBe(3);expect(all.totals.withoutClient).toBe(1);expect((await service.overview(owner,{corporateOnly:true})).totals.files).toBe(2)
    expect((await service.list(owner)).files.map(file=>file.fileId)).toEqual(['file-a','file-b','file-g'])
  })
  it('consultor precisa de cliente vinculado mesmo com modo compatibilidade ligado',async()=> {
    expect((await app.inject({url:'/api/alix/drive-corpus/overview',headers:{cookie:regisCookie}})).statusCode).toBe(403)
    expect((await app.inject({url:'/api/alix/drive-corpus/files?clienteId=b',headers:{cookie:regisCookie,'x-aletis-role':'admin_master'}})).statusCode).toBe(403)
    const response=await app.inject({url:'/api/alix/drive-corpus/files?clienteId=a',headers:{cookie:regisCookie}})
    expect(response.statusCode).toBe(200);expect(response.json().data.files.map((f:any)=>f.fileId)).toEqual(['file-a'])
  })
  it('a consulta direta não contorna isolamento entre clientes',async()=> {
    expect((await app.inject({url:'/api/alix/drive-corpus/files/file-b?clienteId=a',headers:{cookie:regisCookie}})).statusCode).toBe(404)
  })
  it('busca texto português com página/versão sem misturar tenant ou cliente',async()=> {
    const result=await service.search(owner,{clienteId:'a',query:'hipoteca rural'})
    expect(result.results).toHaveLength(1);expect(result.results[0]).toMatchObject({fileId:'file-a',page:7,revision:'rev'})
    const selected=result.results[0]
    expect(await service.getChunk(owner,{clienteId:'a',fileId:selected.fileId,chunkId:selected.chunkId,revision:selected.revision,quoteHash:selected.quoteHash})).toMatchObject({text:selected.text,page:7})
    await expect(service.getChunk(owner,{clienteId:'a',fileId:selected.fileId,chunkId:selected.chunkId,revision:selected.revision,quoteHash:'invalid'})).rejects.toMatchObject({statusCode:409})
    await expect(service.getChunk(owner,{clienteId:'b',fileId:selected.fileId,chunkId:selected.chunkId,revision:selected.revision,quoteHash:selected.quoteHash})).rejects.toMatchObject({statusCode:409})
    expect((await service.search(owner,{query:'confidencial'})).results).toHaveLength(0)
  })
  it('valida paginação e impede que % transforme filtro nominal em coringa',async()=> {
    expect((await service.list(owner,{limit:1})).nextOffset).toBe(1)
    expect((await service.list(owner,{query:'%'})).files).toHaveLength(0)
    expect((await app.inject({url:'/api/alix/drive-corpus/files?limit=-1',headers:{cookie:ownerCookie}})).statusCode).toBe(400)
  })
  it('expõe pausa de autorização e oculta detalhes privados da extração',async()=> {
    await getPool().query(`INSERT INTO alix_drive_corpus_run VALUES('fixture',$1,now())`,[JSON.stringify({readingStatus:'paused_auth',organization:{hubId:'hub-test',hubUrl:'https://untrusted.invalid'}})])
    const overview=await service.overview(owner)
    expect(overview.reading.note).toContain('renovação');expect(overview.organization?.hubUrl).toBe('https://drive.google.com/drive/folders/hub-test')
    await getPool().query(`UPDATE alix_drive_corpus SET coverage=$1 WHERE tenant_id='fixture' AND file_id='file-b'`,[JSON.stringify({status:'partial',limitations:['google_http_401','ENOENT /root/private/original'],debugPath:'/root/private/secret'})])
    const result=await service.read(owner,'file-b')
    expect(JSON.stringify(result.file.coverage)).not.toMatch(/\/root|401|debugPath/)
    expect(JSON.stringify(result.file.coverage)).toContain('renovação')
  })
  it('conteúdo pendente continua indisponível e texto completo tem cursor',async()=> {
    const pending=await service.read(owner,'file-g');expect(pending.available).toBe(false)
    const first=await service.read(owner,'file-a',{maxChars:1000});expect(first.available).toBe(true);expect(first.nextCursor).toBeTruthy()
    await getPool().query(`UPDATE alix_drive_corpus SET revision_key='new' WHERE tenant_id='fixture' AND file_id='file-a'`)
    await expect(service.read(owner,'file-a',{cursor:first.nextCursor!})).rejects.toMatchObject({statusCode:409})
    expect((await service.search(owner,{query:'hipoteca'})).results).toHaveLength(0)
  })
  it('monitoramento expõe somente estado e datas sem cursores ou caminhos privados',async()=> {
    await getPool().query(`UPDATE alix_drive_corpus_run SET payload=payload || $1::jsonb WHERE tenant_id='fixture'`, [JSON.stringify({incrementalProgress:{status:'watching',updatedAt:'2026-09-08T12:00:00Z',lastSuccessfulSyncAt:'2026-09-08T11:59:00Z',pageToken:'private-token',path:'/root/private',counts:{knownEntries:3}}})])
    const overview=await service.overview(owner)
    expect(overview.monitoring).toMatchObject({status:'watching',lastSuccessfulSyncAt:'2026-09-08T11:59:00Z'})
    expect(JSON.stringify(overview)).not.toMatch(/private-token|\/root\/private|pageToken/)
  })
  it('novidades respeitam data, tenant e cliente, sem tratar inventário antigo como mudança recente',async()=> {
    await getPool().query(`UPDATE alix_drive_corpus SET metadata=metadata || '{"availability":{"status":"available","checkedAt":"2026-09-08T13:00:00Z"}}',scanned_at='2026-09-08T13:00:00Z' WHERE tenant_id='fixture' AND file_id='file-b'`)
    expect((await service.list(owner,{changedSince:'2026-09-08T12:00:00Z'})).files.map(file=>file.fileId)).toEqual(['file-b'])
    expect((await service.list(owner,{changedSince:'2026-09-08T12:00:00Z',clienteId:'a'})).files).toHaveLength(0)
    expect((await service.list(owner,{changedSince:'2026-09-08T14:00:00Z'})).files).toHaveLength(0)
  })
  it('fonte indisponível some de listagem, busca, leitura direta e citações mesmo com conteúdo retido',async()=> {
    const previous = await service.search(owner,{query:'garantia rural'})
    expect(previous.results).toHaveLength(1)
    const selected=previous.results[0]
    await getPool().query(`UPDATE alix_drive_corpus SET metadata=metadata || '{"availability":{"status":"unavailable","reason":"hierarchy_changed"}}' WHERE tenant_id='fixture' AND file_id='file-b'`)
    try {
      expect((await service.list(owner)).files.some(file=>file.fileId==='file-b')).toBe(false)
      expect((await service.overview(owner)).totals.files).toBe(2)
      expect((await service.search(owner,{query:'garantia rural'})).results).toHaveLength(0)
      await expect(service.read(owner,'file-b')).rejects.toMatchObject({statusCode:404})
      await expect(service.getChunk(owner,{fileId:selected.fileId,chunkId:selected.chunkId,revision:selected.revision,quoteHash:selected.quoteHash})).rejects.toMatchObject({statusCode:409})
    } finally {await getPool().query(`UPDATE alix_drive_corpus SET metadata=metadata-'availability' WHERE tenant_id='fixture' AND file_id='file-b'`)}
  })
  it('falha de PG fica explícita sem devolver catálogo antigo em cache',async()=> {
    process.env.ALETIS_PG_ENABLED='0'
    try {const response=await app.inject({url:'/api/alix/drive-corpus/overview',headers:{cookie:ownerCookie}});expect(response.statusCode).toBe(503);expect(response.headers['cache-control']).toBe('private, no-store')}finally{process.env.ALETIS_PG_ENABLED='1'}
  })
})
