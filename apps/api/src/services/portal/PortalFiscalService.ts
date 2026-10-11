import { createHash, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import { getPool, isPgEnabled } from '../../db/client.js'
import { FISCAL_UFS, type FiscalAuthorization, type FiscalAuthorizationEvent, type FiscalPortalData } from '@aletis/shared-types'
import { FISCAL_CATALOG } from './PortalFiscalCatalog.js'

const services = z.enum(['debitos','notas','cadastro','certidoes','processos','parcelamentos','declaracoes','pagamentos'])
const methods = z.enum(['procuracao_eletronica','procuracao_documental','certificado_a1','certificado_a3','acesso_assistido'])
const statuses = z.enum(['solicitada','em_conferencia','pendencia','conferida','recusada','revogada'])
const safeText = (max: number) => z.string().trim().max(max).refine(value => !/-----\s*BEGIN\s+(?:[A-Z ]*PRIVATE KEY|OPENSSH PRIVATE KEY)\s*-----/i.test(value), 'Não informe chaves privadas neste formulário.')
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value }, 'Informe uma data válida.')
const id = z.string().min(1).max(100).regex(/^[\w:-]+$/)
const serviceList = z.array(services).min(1).max(8).transform(values => [...new Set(values)].sort())
export const fiscalCreateSchema = z.object({
  uf: z.enum(FISCAL_UFS), servicos: serviceList, modalidade: methods,
  referencia: safeText(160).optional(), comprovanteId: id.optional(), validadeAte: dateOnly.optional(),
  consentimento: z.literal(true),
}).strict().superRefine((value, context) => {
  if (value.comprovanteId && !['procuracao_eletronica','procuracao_documental'].includes(value.modalidade)) context.addIssue({ code:'custom',path:['comprovanteId'],message:'O comprovante deve ser de uma procuração. Certificados privados não podem ser anexados aqui.' })
})
const reviewSchema = z.object({
  expectedUpdatedAt: z.string().datetime({offset:true}), status: z.enum(['em_conferencia','pendencia','conferida','recusada','revogada']),
  orientacao: safeText(2000).refine(value => value.length >= 3, 'Explique o resultado da conferência.'),
  servicosConferidos: z.array(services).max(8).transform(values => [...new Set(values)].sort()).default([]),
  representante: safeText(160).optional(), validadeAte: dateOnly.optional(), referencia: safeText(160).optional(), conferenciaConfirmada: z.boolean().default(false),
}).strict()
const payloadSchema = z.object({ representante:safeText(160).optional(), uf:z.enum(FISCAL_UFS),servicos:serviceList,modalidade:methods,referencia:safeText(160).optional(),comprovanteId:id.optional(),validadeAte:dateOnly.optional(),servicosConferidos:z.array(services).max(8),orientacao:safeText(2000).optional(),consentimentoVersao:z.literal('2026-09-13') }).strict()
export class PortalFiscalError extends Error {
  constructor(message:string,readonly statusCode=400,readonly code='PORTAL_FISCAL_INVALID'){super(message)}
}
function parse<T>(schema:z.ZodType<T,z.ZodTypeDef,any>,input:unknown):T {const parsed=schema.safeParse(input);if(!parsed.success)throw new PortalFiscalError(parsed.error.issues.map(value=>value.message).join(' '));return parsed.data}
const iso=(value:string|Date)=>new Date(value).toISOString()
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())

/** Cadastro de autorizações e evidências. Nenhuma credencial privada é recebida ou utilizada. */
export class PortalFiscalService {
  constructor(private options:{pool?:Pool;pgEnabled?:()=>boolean}={}){}
  private pool(){if(!(this.options.pgEnabled||isPgEnabled)())throw new PortalFiscalError('A área fiscal está temporariamente indisponível. Tente novamente.',503);return this.options.pool||getPool()}
  private async proof(tx:Pool|PoolClient,clienteId:string,uploadId?:string,required=false){
    if(!uploadId)return undefined
    const row=(await tx.query("SELECT id,nome_original,mime FROM portal_upload WHERE id=$1 AND cliente_id=$2 AND (enviado_por='cliente' OR metadata->'portalCompartilhado'='true'::jsonb)",[uploadId,clienteId])).rows[0]
    if((!row||row.mime!=='application/pdf')&&required)throw new PortalFiscalError('Selecione um comprovante PDF disponível nos seus documentos.',404)
    return row?.mime==='application/pdf'?row:undefined
  }
  private async dto(row:Record<string,any>,tx:Pool|PoolClient=this.pool()):Promise<FiscalAuthorization>{
    const body=payloadSchema.parse(row.payload);const proof=await this.proof(tx,row.cliente_id,body.comprovanteId)
    const recorded=statuses.parse(row.status)
    return {id:row.id,clienteId:row.cliente_id,uf:body.uf,servicos:body.servicos,modalidade:body.modalidade,referencia:body.referencia,representante:body.representante,
      ...(proof?{comprovanteId:proof.id,comprovanteNome:proof.nome_original}:{}),comprovanteDisponivel:Boolean(proof),validadeAte:body.validadeAte,
      status:recorded==='conferida'&&body.validadeAte&&body.validadeAte<today()?'expirada':recorded,statusRegistrado:recorded,
      servicosConferidos:body.servicosConferidos,orientacao:body.orientacao,criadoEm:iso(row.created_at),atualizadoEm:iso(row.updated_at),consultaAutomatica:false}
  }
  private async audit(tx:PoolClient,row:Record<string,any>,actor:string,description:string){
    const body=payloadSchema.parse(row.payload)
    await tx.query('INSERT INTO portal_fiscal_authorization_event(id,cliente_id,authorization_id,status,descricao,created_at) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),row.cliente_id,row.id,row.status,description,row.updated_at])
    await tx.query('INSERT INTO audit_log(ator,acao,recurso,dados_depois) VALUES($1,$2,$3,$4)',[actor,'portal_autorizacao_fiscal_'+row.status,'cliente:'+row.cliente_id,JSON.stringify({authorizationId:row.id,uf:body.uf,servicos:body.servicos,status:row.status,validadeAte:body.validadeAte,consentimentoVersao:body.consentimentoVersao,representante:body.representante,servicosConferidos:body.servicosConferidos})])
  }
  async list(clienteId:string):Promise<FiscalPortalData>{
    const pool=this.pool();const rows=(await pool.query('SELECT * FROM portal_fiscal_authorization WHERE cliente_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 200',[clienteId])).rows
    const autorizacoes: FiscalAuthorization[]=[];for(const row of rows)autorizacoes.push(await this.dto(row,pool))
    const events=(await pool.query('SELECT * FROM portal_fiscal_authorization_event WHERE cliente_id=$1 ORDER BY created_at DESC,id DESC LIMIT 500',[clienteId])).rows
    return{catalogo:FISCAL_CATALOG,autorizacoes,eventos:events.map((row):FiscalAuthorizationEvent=>({id:row.id,autorizacaoId:row.authorization_id,data:iso(row.created_at),status:statuses.parse(row.status),descricao:row.descricao})),consultaAutomatica:false,atualizadoEm:new Date().toISOString()}
  }
  async create(clienteId:string,input:unknown,key:unknown){
    const body=parse(fiscalCreateSchema,input);const requestKey=parse(z.string().min(8).max(200).regex(/^[\w.:-]+$/),key)
    if(body.validadeAte&&body.validadeAte<today())throw new PortalFiscalError('O documento informado já venceu. Informe uma autorização vigente.')
    const hash=createHash('sha256').update(JSON.stringify(body)).digest('hex');const tx=await this.pool().connect()
    try{await tx.query('BEGIN');await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['portal-fiscal:'+clienteId])
      const prior=(await tx.query('SELECT * FROM portal_fiscal_authorization WHERE cliente_id=$1 AND idempotency_key=$2',[clienteId,requestKey])).rows[0]
      if(prior){if(prior.request_hash!==hash)throw new PortalFiscalError('Este envio já foi usado. Inicie outro pedido.',409);const result=await this.dto(prior,tx);await tx.query('COMMIT');return{autorizacao:result,replayed:true}}
      if(!(await tx.query("SELECT id FROM cliente WHERE id=$1 AND (payload->'identityMerge'->>'status') IS DISTINCT FROM 'merged' FOR SHARE",[clienteId])).rowCount)throw new PortalFiscalError('Cliente não encontrado.',404)
      const count=(await tx.query('SELECT count(*)::int n FROM portal_fiscal_authorization WHERE cliente_id=$1',[clienteId])).rows[0].n
      if(count>=200)throw new PortalFiscalError('O histórico contém 200 solicitações. Fale com a equipe para revisar as autorizações.',429)
      if((await tx.query("SELECT id FROM portal_fiscal_authorization WHERE cliente_id=$1 AND uf=$2 AND status IN ('solicitada','em_conferencia','pendencia') LIMIT 1",[clienteId,body.uf])).rowCount)throw new PortalFiscalError('Já existe uma autorização em conferência neste estado. Acompanhe o pedido ou suspenda-o antes de substituir.',409)
      await this.proof(tx,clienteId,body.comprovanteId,true)
      const {consentimento:_,...fields}=body;const payload=payloadSchema.parse({...fields,servicosConferidos:[],consentimentoVersao:'2026-09-13'})
      const now=new Date().toISOString();const row=(await tx.query("INSERT INTO portal_fiscal_authorization(id,cliente_id,uf,status,payload,idempotency_key,request_hash,created_at,updated_at) VALUES($1,$2,$3,'solicitada',$4,$5,$6,$7,$7) RETURNING *",['pfa-'+randomUUID(),clienteId,body.uf,JSON.stringify(payload),requestKey,hash,now])).rows[0]
      await this.audit(tx,row,'portal:'+clienteId,'Autorização encaminhada para conferência da equipe.');const result=await this.dto(row,tx);await tx.query('COMMIT');return{autorizacao:result,replayed:false}
    }catch(error){await tx.query('ROLLBACK');throw error}finally{tx.release()}
  }
  async review(clienteId:string,authorizationId:string,input:unknown,actor:string){
    if(!input||typeof input!=='object'||!('expectedUpdatedAt'in input))throw new PortalFiscalError('Atualize a solicitação antes de conferir.',428)
    const body=parse(reviewSchema,input);const tx=await this.pool().connect()
    try{await tx.query('BEGIN');const row=(await tx.query('SELECT * FROM portal_fiscal_authorization WHERE id=$1 AND cliente_id=$2 FOR UPDATE',[authorizationId,clienteId])).rows[0]
      if(!row)throw new PortalFiscalError('Autorização não encontrada.',404)
      if(iso(row.updated_at)!==iso(body.expectedUpdatedAt))throw new PortalFiscalError('A autorização mudou. Atualize antes de continuar.',409)
      if(['recusada','revogada'].includes(row.status))throw new PortalFiscalError('Este registro foi encerrado. Uma nova autorização deve ter outro registro.',409)
      const payload=payloadSchema.parse(row.payload)
      if(body.servicosConferidos.some(service=>!payload.servicos.includes(service)))throw new PortalFiscalError('A conferência não pode ampliar os serviços solicitados pelo cliente.')
      const validity=body.validadeAte||payload.validadeAte;const reference=body.referencia||payload.referencia
      if(payload.validadeAte&&validity&&validity>payload.validadeAte)throw new PortalFiscalError('A conferência não pode estender a validade informada pelo cliente.')
      if(body.status==='conferida'){
        if(!['procuracao_eletronica','procuracao_documental'].includes(payload.modalidade))throw new PortalFiscalError('Esta modalidade exige acesso assistido ou integração de certificados antes de poder ser validada.')
        if(!body.representante||body.representante.length<3)throw new PortalFiscalError('Identifique o representante autorizado conforme a procuração.')
        if(!body.conferenciaConfirmada||!body.servicosConferidos.length||!validity||validity<today()||!reference?.trim())throw new PortalFiscalError('Confirme titular, representante e poderes no órgão, informe referência, serviços e validade vigente.')
        if(payload.modalidade==='procuracao_documental'&&!payload.comprovanteId)throw new PortalFiscalError('A procuração documental exige um comprovante PDF disponível.')
        await this.proof(tx,clienteId,payload.comprovanteId,Boolean(payload.comprovanteId))
      }
      const next=payloadSchema.parse({...payload,representante:body.representante||payload.representante,referencia:reference,validadeAte:validity,servicosConferidos:body.status==='conferida'?body.servicosConferidos:[],orientacao:body.orientacao})
      const now=new Date(Math.max(Date.now(),Date.parse(iso(row.updated_at))+1)).toISOString()
      const updated=(await tx.query('UPDATE portal_fiscal_authorization SET status=$3,payload=$4,updated_at=$5 WHERE id=$1 AND cliente_id=$2 RETURNING *',[authorizationId,clienteId,body.status,JSON.stringify(next),now])).rows[0]
      await this.audit(tx,updated,actor,body.orientacao);const result=await this.dto(updated,tx);await tx.query('COMMIT');return result
    }catch(error){await tx.query('ROLLBACK');throw error}finally{tx.release()}
  }
  async revoke(clienteId:string,authorizationId:string,input:unknown){
    const body=parse(z.object({expectedUpdatedAt:z.string().datetime({offset:true})}).strict(),input)
    return this.review(clienteId,authorizationId,{...body,status:'revogada',orientacao:'Uso suspenso a pedido do cliente no ALETIS. A revogação no órgão emissor deve ser feita também no portal oficial.'},'portal:'+clienteId)
  }
}
export const portalFiscalService=new PortalFiscalService()
