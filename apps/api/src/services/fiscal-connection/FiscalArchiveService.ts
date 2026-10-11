import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import JSZip from 'jszip'
import type { FiscalDocumentDTO, FiscalDocumentSearch, FiscalDocumentDetail, FiscalQueryPage } from '@aletis/shared-types'
import { getPool } from '../../db/client.js'
import { FiscalConnectionError } from './FiscalConnectionService.js'
import { fiscalDetailsSchema } from './FiscalDocumentDetails.js'
import { runFiscalWorkbook } from './FiscalWorkbookJob.js'

let workbookBusy = false

const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v)
const money=z.string().regex(/^\d{1,13}(?:\.\d{1,2})?$/)
const years=z.string().regex(/^\d{4}(?:,\d{4})*$/).max(200).refine(value=>{
  const selected=value.split(',').map(Number)
  return selected.length===new Set(selected).size&&selected.every(year=>year>=2006&&year<=2100)
})
const filtersSchema=z.object({
  busca:z.string().trim().max(160).default(''),tipo:z.enum(['todos','nfe','resumo','evento']).default('todos'),
  direcao:z.enum(['todas','emitida','recebida','interesse','indefinida']).default('todas'),
  situacao:z.enum(['todas','autorizada','cancelada','denegada','nao_informada']).default('todas'),
  anos:years.optional(),inicio:day.optional(),fim:day.optional(),minimo:money.optional(),maximo:money.optional(),
  processamento:z.enum(['todos','pendente','erro','encaminhado']).default('todos'),
  pagina:z.coerce.number().int().min(1).max(100000).default(1),limite:z.coerce.number().int().min(1).max(100).default(25),
}).strict().refine(v=>!v.inicio||!v.fim||v.inicio<=v.fim,{message:'Período inválido.'})
type Filters=z.infer<typeof filtersSchema>
const validate=(input:unknown):Filters=>{const r=filtersSchema.safeParse(input);if(!r.success)throw new FiscalConnectionError('Confira os filtros, valores e período da busca.',400);return r.data}
const iso=(v:string|Date)=>new Date(v).toISOString()
type Row=Record<string,any>

const sourceName=(row:Row)=>row.schema_name==='sefaz-ms-portal-summary-v1'?'e-Fazenda MS / Informações Fiscais':'Ambiente Nacional da NF-e'

/** Todas as consultas partem do cliente autorizado. Credencial e envelope não integram o acervo. */
const projection=`WITH acervo AS (
 SELECT d.*,u.metadata->'processing'->'analysis'->>'status' analysis_status,u.metadata->'processing'->'drive'->>'status' drive_status,u.metadata->'processing'->'drive'->>'url' drive_url,
 CASE d.payload->>'kind' WHEN 'nfe' THEN 'nfe' WHEN 'nfe_summary' THEN 'resumo' ELSE 'evento' END tipo,
 CASE WHEN d.payload->>'kind' NOT IN ('nfe','nfe_summary') THEN 'indefinida'
 WHEN d.payload->'issuer'->>'documento'=d.documento THEN 'emitida'
 WHEN d.payload->'recipient'->>'documento'=d.documento THEN 'recebida' ELSE 'interesse' END direcao,
 CASE WHEN EXISTS(SELECT 1 FROM fiscal_document e WHERE e.cliente_id=d.cliente_id AND e.payload->>'key'=d.payload->>'key'
   AND e.payload->>'kind' IN ('event','event_summary') AND e.payload->'details'->>'situacao'='cancelada') THEN 'cancelada'
 ELSE coalesce(d.payload->'details'->>'situacao','nao_informada') END situacao,
 CASE WHEN d.portal_upload_id IS NOT NULL OR d.schema_name='sefaz-ms-portal-summary-v1' THEN 'encaminhado' WHEN d.bridge_attempts>=5 THEN 'erro' ELSE 'pendente' END processamento,
 (SELECT f.id FROM fiscal_document f WHERE f.cliente_id=d.cliente_id AND f.payload->>'key'=d.payload->>'key' AND f.payload->>'kind'='nfe' ORDER BY f.received_at DESC,f.id DESC LIMIT 1) completo_id
 FROM fiscal_document d LEFT JOIN portal_upload u ON u.id=d.portal_upload_id AND u.cliente_id=d.cliente_id WHERE d.cliente_id=$1
), filtrados AS (SELECT * FROM acervo WHERE `

function where(filters:Filters,clienteId:string) {
  const values:unknown[]=[clienteId],clauses=['true']
  const add=(clause:string,value:unknown)=>{values.push(value);clauses.push(clause.replaceAll('?',`$${values.length}`))}
  if(filters.busca)add(`(concat_ws(' ',payload->>'key',nsu,payload->'issuer'->>'nome',payload->'issuer'->>'documento',payload->'recipient'->>'nome',payload->'recipient'->>'documento',payload->'details'->>'numero',payload->'details'->>'natureza',payload->'details'->'itens') ILIKE ? ESCAPE '\\')`,'%'+filters.busca.replace(/[\\%_]/g,'\\$&')+'%')
  if(filters.tipo!=='todos')add('tipo=?',filters.tipo)
  if(filters.direcao!=='todas')add('direcao=?',filters.direcao)
  if(filters.situacao!=='todas')add('situacao=?',filters.situacao)
  if(filters.processamento!=='todos')add('processamento=?',filters.processamento)
  if(filters.anos)add("left(payload->>'issuedAt',4)=ANY(?::text[])",filters.anos.split(','))
  if(filters.inicio)add("left(payload->>'issuedAt',10)>=?",filters.inicio)
  if(filters.fim)add("left(payload->>'issuedAt',10)<=?",filters.fim)
  if(filters.minimo)add("(payload->>'value')::numeric>=?::numeric",filters.minimo)
  if(filters.maximo)add("(payload->>'value')::numeric<=?::numeric",filters.maximo)
  return {sql:projection+clauses.join(' AND ')+')',values}
}

export function fiscalDocumentDTO(row:Row,detail=false):FiscalDocumentDTO {
  const p=row.payload,details=p.details?fiscalDetailsSchema.parse(p.details):undefined
  let driveUrl:string|undefined
  try{const u=new URL(row.drive_url);if(u.protocol==='https:'&&u.hostname==='drive.google.com')driveUrl=u.href}catch{/* Sem link oficial disponível. */}
  return {id:row.id,chave:p.key,nsu:row.nsu??'',tipo:p.kind==='nfe'?'nfe':p.kind==='nfe_summary'?'resumo':'evento',
    emitente:p.issuer?.nome??p.issuer?.documento,destinatario:p.recipient?.nome??p.recipient?.documento,
    emitenteDocumento:p.issuer?.documento,destinatarioDocumento:p.recipient?.documento,
    emissao:p.issuedAt,valor:p.value,recebidoEm:iso(row.received_at),arquivoNome:`SEFAZ-${p.kind}-${row.nsu??row.id}.xml`,
    portalUploadId:row.portal_upload_id??undefined,processamento:row.processamento??(row.portal_upload_id?'encaminhado':row.bridge_attempts>=5?'erro':'pendente'),
    direcao:row.direcao,situacao:row.situacao??details?.situacao,numero:details?.numero,serie:details?.serie,resumo:p.summary,
    analiseStatus:row.analysis_status??undefined,driveStatus:row.drive_status??undefined,driveUrl,relacionadoCompletoId:row.completo_id??undefined,...(detail?{detalhes:details}:{})}
}

export class FiscalArchiveService {
  constructor(private readonly suppliedPool?:Pool){}
  private pool(){return this.suppliedPool??getPool()}
  private async snapshot<T>(work:(tx:PoolClient)=>Promise<T>){const tx=await this.pool().connect();try{await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const r=await work(tx);await tx.query('COMMIT');return r}catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}}
  async search(clienteId:string,input:unknown):Promise<FiscalDocumentSearch> {
    const f=validate(input),{sql,values}=where(f,clienteId)
    return this.snapshot(async tx=>{
      const counts=(await tx.query(sql+` SELECT count(*)::int registros,count(*) FILTER(WHERE tipo='nfe')::int completas,
        count(*) FILTER(WHERE tipo='resumo')::int resumos,count(*) FILTER(WHERE tipo='evento')::int eventos,
        count(*) FILTER(WHERE processamento='pendente')::int pendentes,count(*) FILTER(WHERE processamento='erro')::int falhas FROM filtrados`,values)).rows[0]
      // Uma nota por chave: o XML integral tem precedência sobre o resumo. Eventos nunca são somados como notas.
      const unique=sql+`, notas AS(SELECT DISTINCT ON (coalesce(payload->>'key',id)) * FROM filtrados WHERE tipo IN ('nfe','resumo') ORDER BY coalesce(payload->>'key',id),(tipo='nfe') DESC,received_at DESC,id DESC)`
      const totalCondition="tipo='nfe' AND situacao='autorizada'"
      const sums=(await tx.query(unique+` SELECT count(*)::int notas,count(*) FILTER(WHERE completo_id IS NULL)::int sem_xml,
        count(*) FILTER(WHERE situacao='cancelada')::int canceladas,count(*) FILTER(WHERE direcao='emitida')::int emitidas,count(*) FILTER(WHERE direcao='recebida')::int recebidas,
        coalesce(sum((payload->>'value')::numeric) FILTER(WHERE direcao='emitida' AND ${totalCondition}),0)::text valor_emitidas,
        coalesce(sum((payload->>'value')::numeric) FILTER(WHERE direcao='recebida' AND ${totalCondition}),0)::text valor_recebidas,
        min(left(payload->>'issuedAt',10)) primeira,max(left(payload->>'issuedAt',10)) ultima FROM notas`,values)).rows[0]
      const months=(await tx.query(unique+` SELECT left(payload->>'issuedAt',7) mes,count(*)::int quantidade,
        coalesce(sum((payload->>'value')::numeric) FILTER(WHERE direcao='emitida' AND ${totalCondition}),0)::text emitidas,
        coalesce(sum((payload->>'value')::numeric) FILTER(WHERE direcao='recebida' AND ${totalCondition}),0)::text recebidas FROM notas
        WHERE payload->>'issuedAt' IS NOT NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 36`,values)).rows
      const parties=(await tx.query(unique+` SELECT coalesce(CASE WHEN direcao='emitida' THEN payload->'recipient'->>'nome' ELSE payload->'issuer'->>'nome' END,'Não informado') nome,
        coalesce(CASE WHEN direcao='emitida' THEN payload->'recipient'->>'documento' ELSE payload->'issuer'->>'documento' END,'') documento,
        direcao,count(*)::int quantidade,sum((payload->>'value')::numeric)::text valor FROM notas WHERE ${totalCondition} AND direcao IN ('emitida','recebida') GROUP BY 1,2,3 ORDER BY sum((payload->>'value')::numeric) DESC NULLS LAST LIMIT 15`,values)).rows
      const documents=(await tx.query(sql+` SELECT * FROM filtrados ORDER BY coalesce(payload->>'issuedAt',received_at::text) DESC,id DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,f.limite,(f.pagina-1)*f.limite])).rows
      return {documentos:documents.map(r=>fiscalDocumentDTO(r)),pagina:f.pagina,limite:f.limite,total:counts.registros,paginas:Math.ceil(counts.registros/f.limite),resumo:{
        registros:counts.registros,completas:counts.completas,resumos:counts.resumos,eventos:counts.eventos,notasUnicas:sums.notas,semXml:sums.sem_xml,canceladas:sums.canceladas,
        pendentesCrm:counts.pendentes,falhasCrm:counts.falhas,emitidas:sums.emitidas,recebidas:sums.recebidas,valorEmitidas:sums.valor_emitidas,valorRecebidas:sums.valor_recebidas,
        primeiraEmissao:sums.primeira??undefined,ultimaEmissao:sums.ultima??undefined,meses:months,contrapartes:parties}}
    })
  }
  async detail(clienteId:string,id:string):Promise<FiscalDocumentDetail> {
    const {sql,values}=where(validate({}),clienteId)
    return this.snapshot(async tx=>{
      const row=(await tx.query(sql+' SELECT * FROM filtrados WHERE id=$2',[...values,id])).rows[0]
      if(!row)throw new FiscalConnectionError('Documento fiscal não encontrado.',404)
      const related=row.payload.key?(await tx.query(sql+" SELECT * FROM filtrados WHERE payload->>'key'=$2 AND id<>$3 ORDER BY received_at DESC,id DESC LIMIT 100",[...values,row.payload.key,id])).rows:[]
      return {documento:fiscalDocumentDTO(row,true),relacionados:related.map(r=>fiscalDocumentDTO(r,true)),origem:{fonte:sourceName(row),consultaId:row.query_id,recebidoEm:iso(row.received_at),sha256:row.sha256,schema:row.schema_name}}
    })
  }
  async history(clienteId:string,input:unknown):Promise<FiscalQueryPage> {
    const parsed=z.object({pagina:z.coerce.number().int().min(1).max(100000).default(1)}).strict().safeParse(input)
    if(!parsed.success)throw new FiscalConnectionError('Página inválida.')
    const pagina=parsed.data.pagina
    return this.snapshot(async tx=>{
      const total=(await tx.query('SELECT count(*)::int n FROM fiscal_query WHERE cliente_id=$1',[clienteId])).rows[0].n
      const rows=(await tx.query('SELECT * FROM fiscal_query WHERE cliente_id=$1 ORDER BY started_at DESC,id DESC LIMIT 25 OFFSET $2',[clienteId,(pagina-1)*25])).rows
      return {total,pagina,paginas:Math.ceil(total/25),consultas:rows.map(r=>({id:r.id,credencialId:r.credential_id,status:r.status,mensagem:r.message,codigo:r.code??undefined,modalidade:r.modalidade,alvo:r.alvo??undefined,iniciadaEm:iso(r.started_at),concluidaEm:r.completed_at?iso(r.completed_at):undefined,documentosRecebidos:r.document_count}))}
    })
  }
  async retryBridge(clienteId:string,id:string,actor:string) {
    const tx=await this.pool().connect()
    try {await tx.query('BEGIN');const row=(await tx.query('SELECT id,portal_upload_id FROM fiscal_document WHERE cliente_id=$1 AND id=$2 FOR UPDATE',[clienteId,id])).rows[0]
      if(!row)throw new FiscalConnectionError('Documento fiscal não encontrado.',404)
      if(!row.portal_upload_id){await tx.query('UPDATE fiscal_document SET bridge_attempts=0,bridge_next_at=now() WHERE cliente_id=$1 AND id=$2',[clienteId,id]);await tx.query('INSERT INTO audit_log(ator,acao,recurso,dados_depois) VALUES($1,$2,$3,$4)',[actor,'fiscal_encaminhamento_retomado','cliente:'+clienteId,JSON.stringify({documentoId:id})])}
      await tx.query('COMMIT');return {agendado:!row.portal_upload_id}
    }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
  }
  async export(clienteId:string,input:unknown,format:'csv'|'zip'|'xlsx',actor:string) {
    if(format==='xlsx' && workbookBusy)throw new FiscalConnectionError('Um Excel está sendo preparado. Aguarde alguns instantes e tente novamente.',429)
    if(format==='xlsx')workbookBusy=true
    try{return await this.exportFile(clienteId,input,format,actor)}finally{if(format==='xlsx')workbookBusy=false}
  }
  private async exportFile(clienteId:string,input:unknown,format:'csv'|'zip'|'xlsx',actor:string) {
    const filters=validate(input),{sql,values}=where(filters,clienteId),generatedAt=new Date().toISOString()
    // Exportação atômica do filtro, com limite explícito em vez de truncamento silencioso.
    const snapshot=await this.snapshot(async tx=>{
      const size=(await tx.query(sql+' SELECT count(*)::int n,coalesce(sum(octet_length(xml)),0)::bigint::text bytes FROM filtrados',values)).rows[0]
      if(size.n>5000 || (format==='zip' && BigInt(size.bytes)>50n*1024n*1024n))throw new FiscalConnectionError('A exportação excede 5.000 registros ou 50 MB de XML. Restrinja o período ou os filtros.',413)
      if(format==='xlsx' && BigInt(size.bytes)>25n*1024n*1024n)throw new FiscalConnectionError('O Excel excede 25 MB de XML. Restrinja o período ou os filtros.',413)
      const nome=format==='xlsx'?(await tx.query("SELECT coalesce(to_jsonb(c)->>'nome',c.id) nome FROM cliente c WHERE c.id=$1",[clienteId])).rows[0]?.nome:undefined
      return {nome,rows:(await tx.query(sql+" SELECT * FROM filtrados ORDER BY coalesce(payload->>'issuedAt',received_at::text) DESC,id DESC",values)).rows}
    })
    const {rows}=snapshot
    if(format==='xlsx') {
      let body:Buffer
      try {body=await runFiscalWorkbook({cliente:{id:clienteId,nome:snapshot.nome??clienteId},generatedAt,filters,records:rows.map(r=>({document:fiscalDocumentDTO(r,true),xml:r.xml,sha256:r.sha256,schema:r.schema_name,queryId:r.query_id}))})}
      catch(error){throw new FiscalConnectionError(error instanceof Error?error.message:'Não foi possível gerar o Excel.',error instanceof Error&&error.name==='FiscalWorkbookLimitError'?413:503)}
      await this.pool().query('INSERT INTO audit_log(ator,acao,recurso,dados_depois) VALUES($1,$2,$3,$4)',[actor,'fiscal_acervo_exportado','cliente:'+clienteId,JSON.stringify({formato:format,quantidade:rows.length,versaoExcel:1})])
      const name=String(snapshot.nome??clienteId).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'cliente'
      const selectedYears=filters.anos?.split(',').map(Number).sort((a,b)=>a-b)
      const yearSuffix=selectedYears?.length
        ? selectedYears.length===1
          ? `-${selectedYears[0]}`
          : selectedYears.every((year,index)=>index===0||year===selectedYears[index-1]+1)
          ? `-${selectedYears[0]}-a-${selectedYears.at(-1)}`
          : `-${selectedYears.join('-')}`
        : ''
      return {body,filename:`ALETIS-Fiscal-${name}${yearSuffix}-${generatedAt.slice(0,10)}.xlsx`,contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
    }
    const cell=(v:unknown)=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,"'$&").replaceAll('"','""')+'"'
    const lines=[['Tipo','Chave NF-e','NSU','Número','Série','Emissão','Direção','Situação','Emitente','CPF/CNPJ emitente','Destinatário','CPF/CNPJ destinatário','Valor documental (BRL)','Encaminhamento CRM','Recebido em','Origem'],...rows.map(r=>{const d=fiscalDocumentDTO(r);return [d.tipo,d.chave,d.nsu,d.numero,d.serie,d.emissao,d.direcao,d.situacao,d.emitente,d.emitenteDocumento,d.destinatario,d.destinatarioDocumento,d.valor,d.processamento,d.recebidoEm,sourceName(r)]})]
    const csv='\ufeff'+lines.map(l=>l.map(cell).join(';')).join('\r\n')
    let body:Buffer=Buffer.from(csv,'utf8')
    if(format==='zip') {const zip=new JSZip();zip.file('indice.csv',csv);zip.file('LEIA-ME.txt','Documentos recebidos de fontes fiscais oficiais identificadas no índice. Resumos históricos não equivalem à nota integral. Valores não comprovam pagamento, recebimento ou dívida. Verifique a situação e os eventos relacionados antes de utilizar. A assinatura dos XML integrais não foi verificada criptograficamente pelo ALETIS.');for(const row of rows)zip.file(fiscalDocumentDTO(row).arquivoNome,row.xml);body=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}})}
    await this.pool().query('INSERT INTO audit_log(ator,acao,recurso,dados_depois) VALUES($1,$2,$3,$4)',[actor,'fiscal_acervo_exportado','cliente:'+clienteId,JSON.stringify({formato:format,quantidade:rows.length})])
    return {body,filename:`SEFAZ-acervo-${new Date().toISOString().slice(0,10)}.${format}`,contentType:format==='zip'?'application/zip':'text/csv; charset=utf-8'}
  }
}
export const fiscalArchiveService=new FiscalArchiveService()
