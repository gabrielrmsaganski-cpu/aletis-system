import { createHash } from 'node:crypto'
import { getPool,closeDb } from '../src/db/client.js'
import { documentMetadata } from '../src/services/fiscal-connection/NfeDistributionConnector.js'
import { fiscalDetailsSchema } from '../src/services/fiscal-connection/FiscalDocumentDetails.js'

// Metadados derivados de XML já existente; não abre credenciais nem consulta a SEFAZ.
const apply=process.argv.includes('--apply')
async function main(){
  const pool=getPool();let cursor='',checked=0,updated=0;const failures:string[]=[]
  while(true){
    const rows=(await pool.query("SELECT id,xml,schema_name,nsu,sha256 FROM fiscal_document WHERE id>$1 AND (payload->'details'->>'versao') IS DISTINCT FROM '1' ORDER BY id LIMIT 50",[cursor])).rows
    if(!rows.length)break
    for(const row of rows){cursor=row.id;try{
      if(createHash('sha256').update(row.xml).digest('hex')!==row.sha256)throw Error('hash')
      const details=fiscalDetailsSchema.parse(documentMetadata(row.xml,row.schema_name,row.nsu??'').details);checked++
      if(apply){await pool.query("UPDATE fiscal_document SET payload=jsonb_set(payload,'{details}',$2::jsonb) WHERE id=$1 AND sha256=$3",[row.id,JSON.stringify(details),row.sha256]);updated++}
    }catch{failures.push(row.id)}}
    await new Promise<void>(resolve=>setImmediate(resolve))
  }
  if(apply&&updated)await pool.query("INSERT INTO audit_log(ator,acao,recurso,dados_depois) VALUES('sistema:fiscal','fiscal_metadados_indexados','fiscal_acervo',$1)",[JSON.stringify({checked,updated,failures:failures.length})])
  process.stdout.write(JSON.stringify({apply,checked,updated,failures})+'\n');if(failures.length)process.exitCode=1
}
main().catch(()=>{process.stderr.write('Falha na indexação fiscal. Nenhum XML original foi alterado.\n');process.exitCode=1}).finally(closeDb)
