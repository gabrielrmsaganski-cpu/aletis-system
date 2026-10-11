import { createHash } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FastifyBaseLogger } from 'fastify'
import type { Pool } from 'pg'
import { getPool, isPgEnabled } from '../../db/client.js'
import { portalDocumentService, type PortalDocumentService } from '../portal/PortalDocumentService.js'
import { fiscalConnectionService } from './FiscalConnectionService.js'
import { validatePortalFile } from '../portal/PortalUploadValidation.js'

/** Outbox persistente: só publica XML já recebido do órgão, sem qualquer material do cofre. */
export async function bridgeFiscalDocuments(options: { pool?: Pool; documents?: PortalDocumentService; directory?: string } = {}) {
  const pool=options.pool??getPool(),tx=await pool.connect()
  let locked=false
  try {
    locked=(await tx.query("SELECT pg_try_advisory_lock(hashtextextended('fiscal-document-bridge',0)) locked")).rows[0].locked
    if(!locked)return
    const rows=(await tx.query("SELECT * FROM fiscal_document WHERE portal_upload_id IS NULL AND schema_name<>'sefaz-ms-portal-summary-v1' AND bridge_attempts<5 AND bridge_next_at<=now() ORDER BY received_at LIMIT 20")).rows
    const directory=options.directory??process.env.ALETIS_PORTAL_UPLOAD_DIR??join(process.cwd(),'storage','portal-uploads')
    const service=options.documents??portalDocumentService
    await mkdir(directory,{recursive:true,mode:0o700})
    for (const row of rows) {
      try {
        const bytes=Buffer.from(row.xml,'utf8'),sha=createHash('sha256').update(bytes).digest('hex')
        if(sha!==row.sha256)throw new Error('Fiscal document integrity')
        const filename=`SEFAZ-${row.payload.kind}-${row.nsu??row.id}.xml`
        await validatePortalFile(bytes,filename)
        const uploadId='up-'+row.id,storageName=uploadId+'.bin',path=join(directory,storageName)
        try{await writeFile(path,bytes,{flag:'wx',mode:0o600})}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;if(createHash('sha256').update(await readFile(path)).digest('hex')!==sha)throw new Error('Fiscal stored document integrity')}
        const received=await service.receberUpload({id:uploadId,clienteId:row.cliente_id,nomeOriginal:filename,nomeStorage:storageName,mime:'application/xml',tamanho:bytes.length,sha256:sha,categoria:'fiscal',enviadoPor:'consultor',idempotencyKey:'sefaz-'+row.id},{ator:'sistema:sefaz',canal:'consultor'})
        await tx.query('BEGIN')
        // Só dados do titular recebido pela conexão; recibo e origem ficam visíveis no acervo.
        await tx.query("UPDATE portal_upload SET metadata=metadata||$3::jsonb WHERE id=$1 AND cliente_id=$2",[received.upload.id,row.cliente_id,JSON.stringify({portalCompartilhado:true,origemFiscal:{fonte:'SEFAZ_Ambiente_Nacional_NFe',documentoId:row.id,consultaId:row.query_id,nsu:row.nsu,tipo:row.payload.kind,recebidoEm:new Date(row.received_at).toISOString()}})])
        await tx.query('UPDATE fiscal_document SET portal_upload_id=$2 WHERE id=$1',[row.id,received.upload.id])
        await tx.query("INSERT INTO audit_log(ator,acao,recurso,dados_depois) VALUES('sistema:sefaz','fiscal_documento_encaminhado',$1,$2)",['cliente:'+row.cliente_id,JSON.stringify({documentoId:row.id,uploadId:received.upload.id})])
        await tx.query('COMMIT')
      }catch {
        await tx.query('ROLLBACK').catch(()=>{})
        await tx.query("UPDATE fiscal_document SET bridge_attempts=bridge_attempts+1,bridge_next_at=now()+interval '5 minutes' WHERE id=$1",[row.id])
      }
    }
  }finally{if(locked)await tx.query("SELECT pg_advisory_unlock(hashtextextended('fiscal-document-bridge',0))").catch(()=>{});tx.release()}
}
let timer:NodeJS.Timeout|undefined,running:Promise<void>|undefined,stopped=false
export function startFiscalConnectionWorker(logger:FastifyBaseLogger) {
  if(timer||!isPgEnabled()||process.env.ALETIS_FISCAL_WORKER_ENABLED==='false')return
  stopped=false
  const tick=()=>{if(running||stopped)return;running=(async()=>{try{await fiscalConnectionService.tick();await bridgeFiscalDocuments()}catch{logger.warn('[fiscal] ciclo adiado; dados e fila preservados')}})().finally(()=>{running=undefined})}
  timer=setInterval(tick,30000);timer.unref();tick()
}
export async function stopFiscalConnectionWorker(){stopped=true;if(timer)clearInterval(timer);timer=undefined;await running}
