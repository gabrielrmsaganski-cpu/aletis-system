import type { PoolClient } from 'pg'
import { analysisHash, DRIVE_ANALYZER_VERSION } from './DriveCorpusAnalysisTypes.js'

/** Chamado na transação que confirma o texto: não há janela entre a ingestão e o trabalho pendente. */
export async function enqueueDriveAnalysisForCurrentFile(client:Pick<PoolClient,'query'>,tenantId:string,fileId:string,priority=0) {
  const row=(await client.query(`SELECT f.revision_key,f.content_hash,f.cliente_id,
    (SELECT count(*)::int FROM alix_drive_corpus_chunk c WHERE c.tenant_id=f.tenant_id AND c.file_id=f.file_id AND c.revision_key=f.revision_key) AS chunks
    FROM alix_drive_corpus f JOIN cliente c ON c.id=f.cliente_id
    WHERE f.tenant_id=$1 AND f.file_id=$2 AND f.read_status IN ('complete','partial')
      AND f.content_hash IS NOT NULL AND f.extracted_characters>0
      AND COALESCE(f.metadata->'availability'->>'status','available')='available'
      AND COALESCE(c.payload->'identityMerge'->>'status','')<>'merged'`,[tenantId,fileId])).rows[0]
  if(!row || !row.chunks) return null
  const id=analysisHash(JSON.stringify([tenantId,fileId,row.cliente_id,row.revision_key,row.content_hash,DRIVE_ANALYZER_VERSION]))
  await client.query(`UPDATE alix_drive_analysis SET status='superseded',updated_at=now()
    WHERE tenant_id=$1 AND file_id=$2 AND id<>$3 AND status<>'superseded'`,[tenantId,fileId,id])
  await client.query(`INSERT INTO alix_drive_analysis(id,tenant_id,file_id,cliente_id,revision_key,content_hash,analyzer_version,total_chunks,priority)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE
      SET status=CASE WHEN alix_drive_analysis.processed_chunks>=EXCLUDED.total_chunks THEN 'review_ready' ELSE 'queued' END,
          total_chunks=EXCLUDED.total_chunks,available_at=now(),dispatched_at=NULL,error_code=NULL,updated_at=now()
      WHERE alix_drive_analysis.status='superseded'`,
  [id,tenantId,fileId,row.cliente_id,row.revision_key,row.content_hash,DRIVE_ANALYZER_VERSION,row.chunks,priority])
  return id
}
