import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Pool, PoolClient } from 'pg'
import { getPool, isPgEnabled } from '../../db/client.js'

export const portalAlixActionSchema = z.object({ id:z.string().max(100), label:z.string().max(200), view:z.enum(['documentos','mensagens','historico','assuntos','fiscal']), requestId:z.string().max(100).optional(), draft:z.string().max(2000).optional() }).strict()
export const portalAlixSourceSchema = z.object({ id:z.string().max(30), type:z.enum(['cadastro','financeiro','pedido','documento','mensagem','andamento','assunto','autorizacao']), label:z.string().max(240), recordId:z.string().max(100).optional(), updatedAt:z.string().max(40).optional() }).strict()
export type PortalAlixAction = z.infer<typeof portalAlixActionSchema>
export type PortalAlixSource = z.infer<typeof portalAlixSourceSchema>
export interface PortalAlixTurn { id:string;sessionId:string;clienteId:string;requestId:string;ordinal:number;question:string;status:'processing'|'completed'|'failed';answer?:string; sources:PortalAlixSource[];actions:PortalAlixAction[];contextHash?:string;errorCode?:string;attempts:number;leaseToken?:string;leaseExpiresAt?:number;createdAt:number;updatedAt:number;completedAt?:number }
export interface PortalAlixSessionRecord { id:string;clienteId:string;titulo:string;requestId?:string;criadoEm:number;atualizadoEm:number }
export class PortalAlixError extends Error { constructor(message:string,readonly statusCode=400,readonly code='PORTAL_ALIX_INVALID'){super(message)} }
const missing=():never=>{throw new PortalAlixError('Conversa não encontrada.',404,'PORTAL_ALIX_NOT_FOUND')}
const idSchema=z.string().trim().min(8).max(100).regex(/^[A-Za-z0-9_.:-]+$/)
const clone=<T>(v:T):T=>structuredClone(v)
const ts=(v:any):number=>new Date(v).getTime()
const fromSession=(r:any):PortalAlixSessionRecord=>({id:r.id,clienteId:r.cliente_id,titulo:r.titulo,requestId:r.request_id??undefined,criadoEm:ts(r.created_at),atualizadoEm:ts(r.updated_at)})
const fromTurn=(r:any):PortalAlixTurn=>({id:r.id,sessionId:r.session_id,clienteId:r.cliente_id,requestId:r.request_id,ordinal:r.ordinal,question:r.question,status:r.status,answer:r.answer??undefined,sources:r.public_sources??[],actions:r.actions??[],contextHash:r.context_hash??undefined,errorCode:r.error_code??undefined,attempts:r.attempts,leaseToken:r.lease_token??undefined,leaseExpiresAt:r.lease_expires_at?ts(r.lease_expires_at):undefined,createdAt:ts(r.created_at),updatedAt:ts(r.updated_at),completedAt:r.completed_at?ts(r.completed_at):undefined})

/** PG autoritativo; os Maps são espelho pós-commit e fallback apenas sem PG. */
export class PortalAlixRepository {
 private sessions=new Map<string,PortalAlixSessionRecord>();private turns=new Map<string,PortalAlixTurn>()
 constructor(private options:{pool?:Pool;pgEnabled?:()=>boolean;now?:()=>number;leaseMs?:number}={}){}
 private enabled(){return(this.options.pgEnabled??isPgEnabled)()}
 private pool(){return this.options.pool??getPool()}
 private now(){return(this.options.now??Date.now)()}
 private mirrorSession(v:PortalAlixSessionRecord){
  this.sessions.delete(v.id);this.sessions.set(v.id,clone(v))
  // Com PG ativo, o espelho é limitado: a evicção nunca remove o registro durável.
  if(this.enabled())while(this.sessions.size>500){const oldest=this.sessions.keys().next().value;if(oldest===undefined)break;this.sessions.delete(oldest)}
  return clone(v)
 }
 private mirrorTurn(v:PortalAlixTurn){
  this.turns.delete(v.id);this.turns.set(v.id,clone(v))
  if(this.enabled())while(this.turns.size>2000){const oldest=this.turns.keys().next().value;if(oldest===undefined)break;this.turns.delete(oldest)}
  return clone(v)
 }
 private async audit(tx:PoolClient,clienteId:string,action:string,sessionId:string,turnId?:string){const payload=z.object({sessionId:idSchema,turnId:idSchema.optional()}).parse({sessionId,turnId});await tx.query('INSERT INTO audit_log(ator,acao,recurso,dados_depois) VALUES($1,$2,$3,$4)',[`portal:${clienteId}`,action,`cliente:${clienteId}`,JSON.stringify(payload)])}
 private async transaction<T>(work:(tx:PoolClient)=>Promise<T>):Promise<T>{const tx=await this.pool().connect();try{await tx.query('BEGIN');const r=await work(tx);await tx.query('COMMIT');return r}catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}}
 async create(clienteId:string,titulo='Conversa com ALIX',requestId?:string):Promise<PortalAlixSessionRecord>{
  const title=z.string().trim().min(1).max(160).parse(titulo);if(requestId)idSchema.parse(requestId)
  const now=this.now();const value:PortalAlixSessionRecord={id:`pas-${randomUUID()}`,clienteId,titulo:title,requestId,criadoEm:now,atualizadoEm:now}
  const check=(old:PortalAlixSessionRecord)=>{if(old.titulo!==title)throw new PortalAlixError('Esta chave já foi usada para outra conversa.',409,'PORTAL_ALIX_IDEMPOTENCY_CONFLICT');return old}
  if(!this.enabled()){const old=[...this.sessions.values()].find(s=>s.clienteId===clienteId&&requestId&&s.requestId===requestId);if(old)return clone(check(old));if([...this.sessions.values()].filter(s=>s.clienteId===clienteId).length>=100)throw new PortalAlixError('Apague uma conversa antiga antes de criar outra.',429,'PORTAL_ALIX_SESSION_LIMIT');return this.mirrorSession(value)}
  const saved=await this.transaction(async tx=>{await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`portal-alix:${clienteId}`]);if(!(await tx.query('SELECT id FROM cliente WHERE id=$1',[clienteId])).rowCount)missing();if(requestId){const old=(await tx.query('SELECT * FROM portal_alix_session WHERE cliente_id=$1 AND request_id=$2',[clienteId,requestId])).rows[0];if(old)return check(fromSession(old))}if(Number((await tx.query('SELECT count(*)::int AS n FROM portal_alix_session WHERE cliente_id=$1',[clienteId])).rows[0].n)>=100)throw new PortalAlixError('Apague uma conversa antiga antes de criar outra.',429,'PORTAL_ALIX_SESSION_LIMIT');await tx.query('INSERT INTO portal_alix_session(id,cliente_id,titulo,request_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5)',[value.id,clienteId,title,requestId??null,new Date(now)]);await this.audit(tx,clienteId,'portal_alix_conversa_criada',value.id);return value});return this.mirrorSession(saved)
 }
 async list(clienteId:string,options:{limit?:number;cursor?:string}={}){
  const limit=z.number().int().min(1).max(50).parse(options.limit??20);let cursor:{at:number;id:string}|undefined
  if(options.cursor){try{cursor=z.object({at:z.number().int().positive(),id:idSchema}).parse(JSON.parse(Buffer.from(options.cursor,'base64url').toString()))}catch{throw new PortalAlixError('Página de conversas inválida.')}}
  const raw=this.enabled()?(await this.pool().query(`SELECT s.*, (SELECT coalesce(sum(CASE WHEN status='completed' THEN 2 ELSE 1 END),0)::int FROM portal_alix_turn t WHERE t.session_id=s.id) AS message_count,(SELECT status FROM portal_alix_turn t WHERE t.session_id=s.id ORDER BY ordinal DESC LIMIT 1) AS last_status FROM portal_alix_session s WHERE cliente_id=$1 ${cursor?'AND (updated_at,id)<($3,$4)':''} ORDER BY updated_at DESC,id DESC LIMIT $2`,cursor?[clienteId,limit+1,new Date(cursor.at),cursor.id]:[clienteId,limit+1])).rows.map(r=>({record:fromSession(r),count:r.message_count,status:r.last_status??'empty'})):[...this.sessions.values()].filter(s=>s.clienteId===clienteId&&(!cursor||s.atualizadoEm<cursor.at||s.atualizadoEm===cursor.at&&s.id<cursor.id)).sort((a,b)=>b.atualizadoEm-a.atualizadoEm||b.id.localeCompare(a.id)).slice(0,limit+1).map(record=>{const t=[...this.turns.values()].filter(t=>t.sessionId===record.id).sort((a,b)=>b.ordinal-a.ordinal);return{record,count:t.reduce((total,item)=>total+(item.status==='completed'?2:1),0),status:t[0]?.status??'empty'}})
  const items=raw.slice(0,limit).map(v=>({...this.mirrorSession(v.record),totalMensagens:v.count,status:v.status}));const last=items.at(-1)
  return{items,nextCursor:raw.length>limit&&last?Buffer.from(JSON.stringify({at:last.atualizadoEm,id:last.id})).toString('base64url'):null}
 }
 async get(id:string,clienteId:string,options:{limit?:number;beforeOrdinal?:number}={}){
  const limit=z.number().int().min(1).max(50).parse(options.limit??20);const before=options.beforeOrdinal==null?2147483647:z.number().int().positive().parse(options.beforeOrdinal)
  let session:PortalAlixSessionRecord|undefined;let turns:PortalAlixTurn[]
  if(this.enabled()){const r=(await this.pool().query('SELECT * FROM portal_alix_session WHERE id=$1 AND cliente_id=$2',[id,clienteId])).rows[0];if(!r)return null;session=fromSession(r);turns=(await this.pool().query('SELECT * FROM portal_alix_turn WHERE session_id=$1 AND cliente_id=$2 AND ordinal<$3 ORDER BY ordinal DESC LIMIT $4',[id,clienteId,before,limit+1])).rows.map(fromTurn)}else{session=this.sessions.get(id);if(session?.clienteId!==clienteId)return null;turns=[...this.turns.values()].filter(t=>t.sessionId===id&&t.clienteId===clienteId&&t.ordinal<before).sort((a,b)=>b.ordinal-a.ordinal).slice(0,limit+1)}
  const page=turns.slice(0,limit).reverse().map(t=>this.mirrorTurn(t));return{...this.mirrorSession(session),turns:page,pagination:{hasMore:turns.length>limit,beforeOrdinal:turns.length>limit?page[0]?.ordinal:null}}
 }
 async remove(id:string,clienteId:string):Promise<boolean>{
  if(!this.enabled()){const s=this.sessions.get(id);if(s?.clienteId!==clienteId)return false;if([...this.turns.values()].some(t=>t.sessionId===id&&t.status==='processing'&&(t.leaseExpiresAt??0)>this.now()))throw new PortalAlixError('Aguarde a resposta antes de apagar esta conversa.',409,'PORTAL_ALIX_BUSY');this.sessions.delete(id);for(const[k,t]of this.turns)if(t.sessionId===id)this.turns.delete(k);return true}
  const removed=await this.transaction(async tx=>{const s=(await tx.query('SELECT id FROM portal_alix_session WHERE id=$1 AND cliente_id=$2 FOR UPDATE',[id,clienteId])).rows[0];if(!s)return false;if((await tx.query("SELECT id FROM portal_alix_turn WHERE session_id=$1 AND status='processing' AND lease_expires_at>$2",[id,new Date(this.now())])).rowCount)throw new PortalAlixError('Aguarde a resposta antes de apagar esta conversa.',409,'PORTAL_ALIX_BUSY');await tx.query('DELETE FROM portal_alix_session WHERE id=$1 AND cliente_id=$2',[id,clienteId]);await tx.query("INSERT INTO audit_log(ator,acao,recurso,dados_depois) VALUES($1,'portal_alix_conversa_excluida',$2,$3)",[`portal:${clienteId}`,`cliente:${clienteId}`,JSON.stringify({sessionId:id})]);return true});if(removed){this.sessions.delete(id);for(const[k,t]of this.turns)if(t.sessionId===id)this.turns.delete(k)}return removed
 }
 async begin(input:{clienteId:string;sessionId:string;requestId:string;question:string}):Promise<{turn:PortalAlixTurn;replayed:boolean}>{
  idSchema.parse(input.requestId);const question=z.string().trim().min(1).max(4000).parse(input.question);const now=this.now();const leaseToken=randomUUID();const expires=now+(this.options.leaseMs??120000)
  const decide=(session:PortalAlixSessionRecord,all:PortalAlixTurn[])=>{
   const prior=all.find(t=>t.requestId===input.requestId);if(prior&&prior.question!==question)throw new PortalAlixError('Esta tentativa já contém outra pergunta.',409,'PORTAL_ALIX_IDEMPOTENCY_CONFLICT');if(prior?.status==='completed')return{turn:prior,replayed:true}
   const active=all.find(t=>t.status==='processing'&&(t.leaseExpiresAt??0)>now);if(active)throw new PortalAlixError('A resposta ainda está sendo preparada. Aguarde e retome esta conversa.',409,'PORTAL_ALIX_BUSY')
   if(prior&&all.some(t=>t.ordinal>prior.ordinal))throw new PortalAlixError('Esta pergunta é anterior a mensagens mais recentes. Abra uma nova conversa para retomá-la.',409,'PORTAL_ALIX_RETRY_ORDER')
   if(!prior&&all.length>=200)throw new PortalAlixError('Esta conversa atingiu 200 perguntas. Abra uma nova conversa para continuar.',422,'PORTAL_ALIX_TURN_LIMIT')
   const value:PortalAlixTurn=prior?{...prior,status:'processing',errorCode:undefined,attempts:prior.attempts+1,leaseToken,leaseExpiresAt:expires,updatedAt:now}:{id:`pat-${randomUUID()}`,sessionId:session.id,clienteId:input.clienteId,requestId:input.requestId,ordinal:Math.max(0,...all.map(t=>t.ordinal))+1,question,status:'processing',sources:[],actions:[],attempts:1,leaseToken,leaseExpiresAt:expires,createdAt:now,updatedAt:now};return{turn:value,replayed:false}
  }
  if(!this.enabled()){
   const session=this.sessions.get(input.sessionId)
   if(!session||session.clienteId!==input.clienteId)return missing()
   const all=[...this.turns.values()].filter(t=>t.sessionId===session.id)
   const result=decide(session,all)
   if(!result.replayed){
    for(const turn of all)if(turn.status==='processing')this.mirrorTurn({...turn,status:'failed',errorCode:'PORTAL_ALIX_INTERRUPTED',leaseToken:undefined,leaseExpiresAt:undefined,updatedAt:now})
    this.mirrorTurn(result.turn);this.mirrorSession({...session,atualizadoEm:now})
   }
   return clone(result)
  }
  const saved=await this.transaction(async tx=>{
   const row=(await tx.query('SELECT * FROM portal_alix_session WHERE id=$1 AND cliente_id=$2 FOR UPDATE',[input.sessionId,input.clienteId])).rows[0]
   if(!row)return missing()
   const session=fromSession(row)
   const all=(await tx.query('SELECT * FROM portal_alix_turn WHERE session_id=$1 AND cliente_id=$2 ORDER BY ordinal',[input.sessionId,input.clienteId])).rows.map(fromTurn)
   const decision=decide(session,all)
   if(decision.replayed)return{decision,session,expired:[] as PortalAlixTurn[]}
   const expired=(await tx.query("UPDATE portal_alix_turn SET status='failed',error_code='PORTAL_ALIX_INTERRUPTED',lease_token=NULL,lease_expires_at=NULL,updated_at=$2 WHERE session_id=$1 AND status='processing' RETURNING *",[input.sessionId,new Date(now)])).rows.map(fromTurn)
   const t=decision.turn
   await tx.query(`INSERT INTO portal_alix_turn(id,session_id,cliente_id,request_id,ordinal,question,status,attempts,lease_token,lease_expires_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'processing',$7,$8,$9,$10,$11) ON CONFLICT(session_id,request_id) DO UPDATE SET status='processing',error_code=NULL,attempts=EXCLUDED.attempts,lease_token=EXCLUDED.lease_token,lease_expires_at=EXCLUDED.lease_expires_at,updated_at=EXCLUDED.updated_at`,[t.id,t.sessionId,t.clienteId,t.requestId,t.ordinal,t.question,t.attempts,t.leaseToken,new Date(expires),new Date(t.createdAt),new Date(now)])
   await tx.query('UPDATE portal_alix_session SET updated_at=$2 WHERE id=$1',[t.sessionId,new Date(now)])
   await this.audit(tx,t.clienteId,'portal_alix_pergunta_recebida',t.sessionId,t.id)
   return{decision,session:{...session,atualizadoEm:now},expired}
  })
  this.mirrorSession(saved.session)
  saved.expired.forEach(turn=>this.mirrorTurn(turn))
  this.mirrorTurn(saved.decision.turn)
  return clone(saved.decision)
 }
 async heartbeat(turn:PortalAlixTurn):Promise<boolean>{
  const until=this.now()+(this.options.leaseMs??120000)
  if(!this.enabled()){const current=this.turns.get(turn.id);if(!current||current.status!=='processing'||current.leaseToken!==turn.leaseToken)return false;this.mirrorTurn({...current,leaseExpiresAt:until});return true}
  const row=(await this.pool().query("UPDATE portal_alix_turn SET lease_expires_at=$4 WHERE id=$1 AND cliente_id=$2 AND lease_token=$3 AND status='processing' RETURNING *",[turn.id,turn.clienteId,turn.leaseToken,new Date(until)])).rows[0]
  if(!row)return false
  this.mirrorTurn(fromTurn(row));return true
 }
 async finish(turn:PortalAlixTurn,value:{answer:string;sources:PortalAlixSource[];actions:PortalAlixAction[];contextHash:string}):Promise<PortalAlixTurn>{
  const answer=z.string().trim().min(1).max(30000).parse(value.answer);const sources=z.array(portalAlixSourceSchema).max(100).parse(value.sources);const actions=z.array(portalAlixActionSchema).max(5).parse(value.actions);const contextHash=z.string().regex(/^[a-f0-9]{64}$/).parse(value.contextHash);const now=this.now()
  if(!this.enabled()){
   const current=this.turns.get(turn.id);const session=this.sessions.get(turn.sessionId)
   if(!current||!session||current.status!=='processing'||current.leaseToken!==turn.leaseToken)throw new PortalAlixError('A tentativa foi substituída. Atualize a conversa.',409,'PORTAL_ALIX_LEASE_LOST')
   this.mirrorSession({...session,atualizadoEm:now})
   return this.mirrorTurn({...current,status:'completed',answer,sources,actions,contextHash,errorCode:undefined,leaseToken:undefined,leaseExpiresAt:undefined,updatedAt:now,completedAt:now})
  }
  const saved=await this.transaction(async tx=>{
   const sessionRow=(await tx.query('SELECT * FROM portal_alix_session WHERE id=$1 AND cliente_id=$2 FOR UPDATE',[turn.sessionId,turn.clienteId])).rows[0]
   if(!sessionRow)throw new PortalAlixError('A tentativa foi substituída. Atualize a conversa.',409,'PORTAL_ALIX_LEASE_LOST')
   const row=(await tx.query("UPDATE portal_alix_turn SET status='completed',answer=$4,public_sources=$5,actions=$6,context_hash=$7,error_code=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=$8,completed_at=$8 WHERE id=$1 AND cliente_id=$2 AND lease_token=$3 AND status='processing' RETURNING *",[turn.id,turn.clienteId,turn.leaseToken,answer,JSON.stringify(sources),JSON.stringify(actions),contextHash,new Date(now)])).rows[0]
   if(!row)throw new PortalAlixError('A tentativa foi substituída. Atualize a conversa.',409,'PORTAL_ALIX_LEASE_LOST')
   await tx.query('UPDATE portal_alix_session SET updated_at=$2 WHERE id=$1',[turn.sessionId,new Date(now)])
   await this.audit(tx,turn.clienteId,'portal_alix_resposta_concluida',turn.sessionId,turn.id)
   return{turn:fromTurn(row),session:{...fromSession(sessionRow),atualizadoEm:now}}
  })
  this.mirrorSession(saved.session);return this.mirrorTurn(saved.turn)
 }
 async fail(turn:PortalAlixTurn,code='PORTAL_ALIX_GENERATION_FAILED'):Promise<void>{const allowed=['PORTAL_ALIX_GENERATION_FAILED','PORTAL_ALIX_SOURCE_INVALID','PORTAL_ALIX_INTERRUPTED','PORTAL_ALIX_RATE_LIMIT'];if(!allowed.includes(code))code='PORTAL_ALIX_GENERATION_FAILED';if(!this.enabled()){const current=this.turns.get(turn.id);if(current&&current.status==='processing'&&current.leaseToken===turn.leaseToken)this.mirrorTurn({...current,status:'failed',errorCode:code,leaseToken:undefined,leaseExpiresAt:undefined,updatedAt:this.now()});return}const r=(await this.pool().query("UPDATE portal_alix_turn SET status='failed',error_code=$4,lease_token=NULL,lease_expires_at=NULL,updated_at=$5 WHERE id=$1 AND cliente_id=$2 AND lease_token=$3 AND status='processing' RETURNING *",[turn.id,turn.clienteId,turn.leaseToken,code,new Date(this.now())])).rows[0];if(r)this.mirrorTurn(fromTurn(r))}
}
export const portalAlixRepository=new PortalAlixRepository()
