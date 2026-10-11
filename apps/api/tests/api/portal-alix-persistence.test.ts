vi.mock('../../src/services/fiscal-connection/FiscalConnectionService.js',()=>({fiscalConnectionService:{list:async()=>({credenciais:[],consultas:[],documentos:[]})}}))
import { randomUUID, createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest'
const holder=vi.hoisted(()=>({pool:null as any,llm:vi.fn()}))
vi.mock('../../src/db/client.js',()=>({isPgEnabled:()=>true,getPool:()=>holder.pool}))
vi.mock('../../src/routes/clientes.js',()=>({clientes:new Map()}))
vi.mock('../../src/services/llm/OpenAIClient.js',()=>({OPENAI_MODEL_PRIMARY:'fixture',runOpenAI:holder.llm}))
vi.mock('../../src/services/portal/PortalDocumentService.js',()=>({portalDocumentService:{listarPendencias:async()=>[],listarUploads:async()=>[]}}))
vi.mock('../../src/services/portal/PortalCommunicationService.js',()=>({listPortalMessages:async()=>[],listPortalUpdates:async()=>[]}))
vi.mock('../../src/services/portal/PortalMatterService.js',()=>({portalMatterService:{listPublic:async()=>({assuntos:[]})}}))
vi.mock('../../src/services/portal/PortalFiscalService.js',()=>({portalFiscalService:{list:async()=>({autorizacoes:[]})}}))
import { PortalAlixRepository } from '../../src/services/portal/PortalAlixRepository.js'
import { chatPortalAlix,criarSessaoPortal,obterSessaoPortal,deletarSessaoPortal } from '../../src/services/PortalAlixService.js'

describe.skipIf(!process.env.ALETIS_PORTAL_FIXTURE_FILE)('ALIX: conversa durável em PostgreSQL isolado',()=>{
 const schema=`portal_alix_fixture_${randomUUID().replaceAll('-','')}`;let admin:pg.Pool
 const repository=(options:Record<string,unknown>={})=>new PortalAlixRepository({pool:holder.pool,pgEnabled:()=>true,...options})
 const question=(sessionId:string,requestId=randomUUID())=>({clienteId:'a',sessionId,requestId,question:'Quais documentos devo enviar?'})
 const answer={answer:'Confira os dados publicados. [C1]',sources:[{id:'C1',type:'cadastro' as const,label:'Cadastro publicado'}],actions:[{id:'docs',label:'Meus documentos',view:'documentos' as const}],contextHash:createHash('sha256').update('fixture').digest('hex')}
 beforeAll(async()=>{const url=(await readFile(process.env.ALETIS_PORTAL_FIXTURE_FILE!,'utf8')).trim();const parsed=new URL(url);if(!['localhost','127.0.0.1'].includes(parsed.hostname)||parsed.port!=='55436'||parsed.pathname!=='/aletis_implementation_fixture')throw new Error('Fixture obrigatório');admin=new pg.Pool({connectionString:url});await admin.query(`CREATE SCHEMA ${schema}`);holder.pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`,max:6});await holder.pool.query("CREATE TABLE cliente(id text PRIMARY KEY,payload jsonb DEFAULT '{}');INSERT INTO cliente VALUES('a','{\"nome\":\"Cliente A\"}'),('b','{\"nome\":\"Cliente B\"}');CREATE TABLE audit_log(id serial PRIMARY KEY,ator text,acao text,recurso text,dados_depois jsonb);");await holder.pool.query(await readFile(new URL('../fixtures/portal-alix-schema.sql',import.meta.url),'utf8'))})
 afterAll(async()=>{if(holder.pool)await holder.pool.end();if(admin){await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end()}})
 beforeEach(()=>{holder.llm.mockReset();holder.llm.mockResolvedValue({text:'Confira seu cadastro publicado e confirme com a equipe o que ainda não foi informado. [C1]'})})
 it('criação idempotente e histórico completo sobrevivem a uma nova instância',async()=>{const key=randomUUID();const [a,b]=await Promise.all([repository().create('a','Histórico',key),repository().create('a','Histórico',key)]);expect(a.id).toBe(b.id);const turn=await repository().begin(question(a.id));await repository().finish(turn.turn,answer);const restored=await repository().get(a.id,'a');expect(restored?.turns[0]).toMatchObject({status:'completed',answer:answer.answer,question:turn.turn.question});expect(await repository().get(a.id,'b')).toBeNull()})
 it('cliente B não lê, apaga nem usa sessão de A',async()=>{const s=await repository().create('a');expect(await repository().remove(s.id,'b')).toBe(false);await expect(repository().begin({...question(s.id),clienteId:'b'})).rejects.toMatchObject({statusCode:404});expect(await repository().get(s.id,'a')).not.toBeNull()})
 it('concorrência entre instâncias permite somente uma geração na sessão',async()=>{const s=await repository().create('a');const results=await Promise.allSettled([repository().begin(question(s.id)),repository().begin(question(s.id))]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((results.find(r=>r.status==='rejected')as PromiseRejectedResult).reason.code).toBe('PORTAL_ALIX_BUSY');const saved=(results.find(r=>r.status==='fulfilled')as PromiseFulfilledResult<any>).value;await repository().finish(saved.turn,answer)})
 it('retry concluído reutiliza turno e conteúdo; chave com outra pergunta conflita',async()=>{const s=await repository().create('a');const q=question(s.id);const first=await repository().begin(q);await repository().finish(first.turn,answer);expect(await repository().begin(q)).toMatchObject({replayed:true,turn:{id:first.turn.id,status:'completed'}});await expect(repository().begin({...q,question:'Outra pergunta'})).rejects.toMatchObject({code:'PORTAL_ALIX_IDEMPOTENCY_CONFLICT'});expect((await repository().get(s.id,'a'))?.turns).toHaveLength(1)})
 it('falha guarda somente o estado seguro e retry não duplica a pergunta',async()=>{const s=await repository().create('a');const q=question(s.id);const first=await repository().begin(q);await repository().fail(first.turn,'PRIVATE_API_TOKEN');const failed=await repository().get(s.id,'a');expect(failed?.turns[0]).toMatchObject({status:'failed',errorCode:'PORTAL_ALIX_GENERATION_FAILED'});expect(failed?.turns[0].answer).toBeUndefined();const retry=await repository().begin(q);expect(retry.turn).toMatchObject({id:first.turn.id,ordinal:1,attempts:2});await repository().finish(retry.turn,answer);expect((await repository().get(s.id,'a'))?.turns).toHaveLength(1)})
 it('restart recupera lease vencido e impede conclusão por executor antigo',async()=>{let now=Date.now();const repo=repository({now:()=>now,leaseMs:1000});const s=await repo.create('a');const q=question(s.id);const old=await repo.begin(q);now+=1001;const retry=await repository({now:()=>now,leaseMs:1000}).begin(q);await expect(repo.finish(old.turn,answer)).rejects.toMatchObject({code:'PORTAL_ALIX_LEASE_LOST'});await repository().finish(retry.turn,answer);expect((await repository().get(s.id,'a'))?.turns[0].attempts).toBe(2)})
 it('paginação por ordinal recupera perguntas anteriores sem sobreposição',async()=>{const r=repository();const s=await r.create('a');for(let i=0;i<5;i++){const t=await r.begin(question(s.id));await r.finish(t.turn,answer)}const first=await r.get(s.id,'a',{limit:2});expect(first?.turns.map(t=>t.ordinal)).toEqual([4,5]);const second=await r.get(s.id,'a',{limit:2,beforeOrdinal:first!.pagination.beforeOrdinal!});expect(second?.turns.map(t=>t.ordinal)).toEqual([2,3]);const last=await r.get(s.id,'a',{limit:2,beforeOrdinal:second!.pagination.beforeOrdinal!});expect(last?.turns.map(t=>t.ordinal)).toEqual([1]);expect(last?.pagination.hasMore).toBe(false)})
 it('exclusão bloqueia geração ativa e falha de auditoria desfaz exclusão',async()=>{const r=repository();const s=await r.create('a');const t=await r.begin(question(s.id));await expect(r.remove(s.id,'a')).rejects.toMatchObject({code:'PORTAL_ALIX_BUSY'});await r.finish(t.turn,answer);await holder.pool.query("ALTER TABLE audit_log ADD CONSTRAINT deny_delete CHECK(acao<>'portal_alix_conversa_excluida') NOT VALID");try{await expect(r.remove(s.id,'a')).rejects.toBeDefined()}finally{await holder.pool.query('ALTER TABLE audit_log DROP CONSTRAINT deny_delete')}expect((await r.get(s.id,'a'))?.turns).toHaveLength(1);expect(await r.remove(s.id,'a')).toBe(true);expect(await r.get(s.id,'a')).toBeNull()})
 it('auditoria faz parte da transação da pergunta e da resposta, sem espelhar gravação desfeita',async()=>{
  let enabled=true;const r=new PortalAlixRepository({pool:holder.pool,pgEnabled:()=>enabled});const s=await r.create('a');const q=question(s.id)
  await holder.pool.query("ALTER TABLE audit_log ADD CONSTRAINT deny_question CHECK(acao<>'portal_alix_pergunta_recebida') NOT VALID")
  try{await expect(r.begin(q)).rejects.toBeDefined()}finally{await holder.pool.query('ALTER TABLE audit_log DROP CONSTRAINT deny_question')}
  expect((await r.get(s.id,'a'))?.turns).toHaveLength(0)
  enabled=false;expect((await r.get(s.id,'a'))?.turns).toHaveLength(0);enabled=true
  const t=await r.begin(q)
  await holder.pool.query("ALTER TABLE audit_log ADD CONSTRAINT deny_answer CHECK(acao<>'portal_alix_resposta_concluida') NOT VALID")
  try{await expect(r.finish(t.turn,answer)).rejects.toBeDefined()}finally{await holder.pool.query('ALTER TABLE audit_log DROP CONSTRAINT deny_answer')}
  expect((await r.get(s.id,'a'))?.turns[0]).toMatchObject({status:'processing'})
  enabled=false;expect((await r.get(s.id,'a'))?.turns[0].answer).toBeUndefined();enabled=true
  await r.finish(t.turn,answer)
  const audits=await holder.pool.query('SELECT dados_depois FROM audit_log WHERE dados_depois->>\'turnId\'=$1',[t.turn.id])
  expect(audits.rows).toHaveLength(2)
  expect(JSON.stringify(audits.rows)).not.toContain(q.question)
 })
 it('espelho acompanha sessão, heartbeat e tentativas vencidas somente após commit',async()=>{
  let enabled=true;let now=Date.now();const r=new PortalAlixRepository({pool:holder.pool,pgEnabled:()=>enabled,now:()=>now,leaseMs:1000})
  const s=await r.create('a');now+=100;const first=await r.begin(question(s.id));now+=500;await r.heartbeat(first.turn)
  enabled=false;let cached=await r.get(s.id,'a');expect(cached?.atualizadoEm).toBe(now-500);expect(cached?.turns[0].leaseExpiresAt).toBe(now+1000);enabled=true
  now+=1001;const second=await r.begin(question(s.id));enabled=false;cached=await r.get(s.id,'a');expect(cached?.turns[0]).toMatchObject({status:'failed',errorCode:'PORTAL_ALIX_INTERRUPTED'});expect(cached?.turns[0].leaseToken).toBeUndefined();enabled=true
  now+=100;await r.finish(second.turn,answer);enabled=false;cached=await r.get(s.id,'a');expect(cached?.atualizadoEm).toBe(now);expect(cached?.turns[1].status).toBe('completed')
 })
 it('evicção limita apenas o espelho global com PG e mantém histórico durável recuperável',async()=>{
  await holder.pool.query("INSERT INTO cliente(id) SELECT 'cache-owner-'||n FROM generate_series(1,501) n; INSERT INTO portal_alix_session(id,cliente_id,titulo) SELECT 'pas-cache-'||n,'cache-owner-'||n,'Cache fixture' FROM generate_series(1,501) n; INSERT INTO portal_alix_turn(id,session_id,cliente_id,request_id,ordinal,question,status,answer) SELECT 'pat-cache-'||n,'pas-cache-'||((n-1)/50+1),'cache-owner-'||((n-1)/50+1),'request-cache-'||n,((n-1)%50)+1,'Pergunta persistida','completed','Resposta persistida' FROM generate_series(1,2001) n")
  const r=repository()
  for(let n=1;n<=501;n++)await r.get(`pas-cache-${n}`,`cache-owner-${n}`,{limit:50})
  const mirror=r as unknown as {sessions:Map<string,unknown>;turns:Map<string,unknown>}
  expect(mirror.sessions.size).toBe(500);expect(mirror.turns.size).toBe(2000)
  expect(mirror.sessions.has('pas-cache-1')).toBe(false)
  const restored=await r.get('pas-cache-1','cache-owner-1',{limit:50})
  expect(restored?.turns).toHaveLength(50);expect(restored?.turns[0].question).toBe('Pergunta persistida')
  expect((await holder.pool.query("SELECT count(*)::int n FROM portal_alix_turn WHERE id LIKE 'pat-cache-%'")).rows[0].n).toBe(2001)
  const fallback=new PortalAlixRepository({pgEnabled:()=>false});let first=''
  for(let n=1;n<=501;n++){const session=await fallback.create(`owner-${n}`);if(n===1)first=session.id}
  expect(await fallback.get(first,'owner-1')).not.toBeNull()
 })
 it('chat salva resposta e fontes antes de streaming, inclusive com conexão encerrada',async()=>{const s=await criarSessaoPortal('a');const requestId=randomUUID();const result=await chatPortalAlix({clienteId:'a',sessionId:s.id,requestId,message:'Qual é meu cadastro?',onToken:()=>{throw new Error('cliente desconectado')}});expect(result.reply.sources?.[0].id).toBe('C1');expect(result.reply.actions?.every(a=>!('url'in a))).toBe(true);const replay=await chatPortalAlix({clienteId:'a',sessionId:s.id,requestId,message:'Qual é meu cadastro?'});expect(replay.replayed).toBe(true);expect(holder.llm).toHaveBeenCalledTimes(1);expect((await obterSessaoPortal(s.id,'a'))?.messages).toHaveLength(2)})
 it('falha de LLM preserva pergunta sem resposta inventada e pode ser retomada',async()=>{const s=await criarSessaoPortal('a');const requestId=randomUUID();holder.llm.mockRejectedValueOnce(new Error('PRIVATE_PROVIDER_ERROR'));await expect(chatPortalAlix({clienteId:'a',sessionId:s.id,requestId,message:'Quais dados estão disponíveis?'})).rejects.toThrow('PRIVATE_PROVIDER_ERROR');const failed=await obterSessaoPortal(s.id,'a');expect(failed?.messages).toHaveLength(1);expect(JSON.stringify(failed)).not.toMatch(/PRIVATE_PROVIDER|leaseToken|leaseExpiresAt/);await chatPortalAlix({clienteId:'a',sessionId:s.id,requestId,message:'Quais dados estão disponíveis?'});expect((await obterSessaoPortal(s.id,'a'))?.messages).toHaveLength(2);await deletarSessaoPortal(s.id,'a')})
 it('resposta sem fonte ou com fonte inventada não vira resposta publicada',async()=>{for(const text of ['Tudo está aprovado.','Seu arquivo está aprovado. [D999]']){const s=await criarSessaoPortal('a');holder.llm.mockResolvedValueOnce({text});await expect(chatPortalAlix({clienteId:'a',sessionId:s.id,requestId:randomUUID(),message:'Meu arquivo foi aprovado?'})).rejects.toMatchObject({code:'PORTAL_ALIX_SOURCE_INVALID'});expect((await obterSessaoPortal(s.id,'a'))?.messages.map(m=>m.role)).toEqual(['user'])}})
})
