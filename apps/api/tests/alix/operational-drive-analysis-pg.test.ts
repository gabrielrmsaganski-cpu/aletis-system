import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { DriveCorpusAnalysisService } from '../../src/services/alix/intake/DriveCorpusAnalysisService.js'
import { analysisHash, groundDriveAnalysis } from '../../src/services/alix/intake/DriveCorpusAnalysisTypes.js'
import { readOperationalDriveAnalysisSource } from '../../src/services/alix/workspace/OperationalDriveAnalysisSource.js'

let admin: Pool
let pool: Pool
const schema = `test_operational_drive_${randomBytes(8).toString('hex')}`
const revision = analysisHash('revision-initial')
const text = 'Titular: Pessoa de teste. Valor do orçamento: R$ 1.234,56.'
const contentHash = analysisHash(text)
const id = (tenant: string, file: string) => analysisHash(`${tenant}:${file}`)

beforeAll(async () => {
  const url = (await readFile('/tmp/aletis-drive-corpus-fixture-url', 'utf8')).trim()
  const parsed = new URL(url)
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55436' || parsed.pathname !== '/aletis_implementation_fixture') throw new Error('A suíte exige o PostgreSQL isolado autorizado.')
  admin = new Pool({ connectionString: url, max: 1 })
  await admin.query(`create schema ${schema}`)
  pool = new Pool({ connectionString: url, max: 2, options: `-c search_path=${schema}` })
  await pool.query(`create table cliente (id text primary key, payload jsonb default '{}');
    create table alix_drive_corpus (tenant_id text, file_id text, cliente_id text, name text, revision_key text, content_hash text, read_status text, metadata jsonb default '{}', coverage jsonb default '{"status":"partial"}', primary key (tenant_id,file_id));
    create table alix_drive_corpus_chunk (id text primary key, tenant_id text, file_id text, revision_key text, ordinal int, text text, page int, sheet text);
    insert into cliente (id) values ('c1'), ('c2');`)
  const migration = await readFile(new URL('../../src/db/migrations/0044_alix_drive_analysis.sql', import.meta.url), 'utf8')
  await pool.query(migration.replaceAll('--> statement-breakpoint', ''))
  for (const [tenant, file, client, status] of [
    ['tenant-a','file-current','c1','waiting_budget'], ['tenant-b','file-current','c1','review_ready'], ['tenant-a','file-other-client','c2','review_ready'],
    ['tenant-a','file-superseded','c1','superseded'], ['tenant-a','file-revision','c1','review_ready'], ['tenant-a','file-content','c1','review_ready'],
    ['tenant-a','file-removed','c1','review_ready'], ['tenant-a','file-wrong-quote','c1','review_ready'], ['tenant-a','file-wrong-excerpt','c1','review_ready'],
  ]) {
    const chunkId = `${tenant}:${file}:chunk`
    const grounded = groundDriveAnalysis({ documentType: 'orçamento', candidates: [
      { label: 'Titular', category: 'identity', value: 'Pessoa de teste', subject: 'Pessoa de teste', context: '', evidenceText: 'Titular: Pessoa de teste.' },
      { label: 'Orçamento', category: 'finance', value: 'R$ 1.234,56', subject: '', context: '', evidenceText: 'Valor do orçamento: R$ 1.234,56.' },
    ] }, { id: chunkId, ordinal: 0, text, page: 3, sheet: 'Dados' })
    if (file === 'file-wrong-quote') grounded.candidates.forEach(candidate => { candidate.evidence.quoteHash = analysisHash('wrong-chunk') })
    if (file === 'file-wrong-excerpt') grounded.candidates.forEach(candidate => { candidate.evidence.excerpt += ' Conteúdo inexistente.'; candidate.evidence.excerptHash = analysisHash(candidate.evidence.excerpt) })
    const sourceRevision = file === 'file-revision' ? analysisHash('new-revision') : revision
    const sourceHash = file === 'file-content' ? analysisHash('changed-content') : contentHash
    await pool.query(`insert into alix_drive_corpus (tenant_id,file_id,cliente_id,name,revision_key,content_hash,read_status,metadata) values ($1,$2,$3,'Documento de teste',$4,$5,'partial',$6::jsonb)`, [tenant,file,client,sourceRevision,sourceHash,JSON.stringify(file === 'file-removed' ? { availability: { status: 'unavailable' } } : {})])
    await pool.query('insert into alix_drive_corpus_chunk values ($1,$2,$3,$4,0,$5,3,\'Dados\')', [chunkId,tenant,file,sourceRevision,text])
    await pool.query(`insert into alix_drive_analysis (id,tenant_id,file_id,cliente_id,revision_key,content_hash,analyzer_version,status,total_chunks,processed_chunks,payload)
      values ($1,$2,$3,$4,$5,$6,'test-v1',$7,4,1,$8::jsonb)`, [id(tenant,file),tenant,file,client,revision,contentHash,status,JSON.stringify({ candidates: grounded.candidates, documentTypes: ['orçamento'], rejectedCandidates: 0 })])
  }
})
afterAll(async () => {
  await pool?.end()
  if (admin) { await admin.query(`drop schema if exists ${schema} cascade`); await admin.end() }
})

const read = (tenantId = 'tenant-a', clienteIds = ['c1']) => {
  const service = new DriveCorpusAnalysisService({ pool })
  return readOperationalDriveAnalysisSource(tenantId, clienteIds, { pool, listCurrent: (tenant, clients, options) => service.listCurrent(tenant, clients, options) })
}

describe('Drive → prioridade com prova atual no PostgreSQL', () => {
  it('preserva tenant e cliente, recusa revisões e hashes antigos e confere as citações', async () => {
    const records = await read()
    expect(records).toHaveLength(1)
    expect(records[0].source).toMatchObject({ id: id('tenant-a','file-current'), documentId: 'file-current', revision, contentHash, quoteHash: analysisHash(text), page: 3, sheet: 'Dados' })
    expect(records[0].description).toContain('2 candidato(s)')
    expect(records[0].description).toContain('1 de 4 trechos')
    expect(records[0].description).toContain('Cobertura parcial')
    const otherTenant = await read('tenant-b')
    expect(otherTenant).toHaveLength(1)
    expect(otherTenant[0].id).not.toBe(records[0].id)
    expect(otherTenant[0].source.id).toBe(id('tenant-b','file-current'))
    expect(await read('tenant-a', [])).toEqual([])
  })

  it('reconfere a fonte se ela for removida entre listCurrent e a entrega da prioridade', async () => {
    const service = new DriveCorpusAnalysisService({ pool })
    const rows = await service.listCurrent('tenant-a', ['c1'])
    await pool.query("update alix_drive_corpus set metadata='{\"availability\":{\"status\":\"unavailable\"}}' where tenant_id='tenant-a' and file_id='file-current'")
    const records = await readOperationalDriveAnalysisSource('tenant-a', ['c1'], { pool, listCurrent: async () => rows })
    expect(records).toEqual([])
  })

  it('preserva todos os achados em vários lotes mesmo com mais de 100 trabalhos novos sem candidatos', async () => {
    const tenant = 'tenant-pagination'
    const inputs = Array.from({ length: 355 }, (_, index) => {
      const file = `file-${index < 205 ? 'review' : 'empty'}-${index}`
      const chunkId = `${tenant}:${file}:chunk`
      const candidates = index < 205 ? groundDriveAnalysis({ documentType: 'orçamento', candidates: [
        { label: 'Titular', category: 'identity', value: 'Pessoa de teste', subject: 'Pessoa de teste', context: '', evidenceText: 'Titular: Pessoa de teste.' },
      ] }, { id: chunkId, ordinal: 0, text, page: 3 }).candidates : []
      return { id: id(tenant, file), file, chunk: chunkId, payload: { candidates }, status: candidates.length ? 'review_ready' : 'queued', updated: candidates.length ? '2026-09-08T00:00:00Z' : '2026-09-09T00:00:00Z' }
    })
    await pool.query(`insert into alix_drive_corpus (tenant_id,file_id,cliente_id,name,revision_key,content_hash,read_status)
      select $1,item.file,'c1',item.file,$3,$4,'partial' from jsonb_to_recordset($2::jsonb) as item(file text)`, [tenant, JSON.stringify(inputs), revision, contentHash])
    await pool.query(`insert into alix_drive_corpus_chunk (id,tenant_id,file_id,revision_key,ordinal,text,page)
      select item.chunk,$1,item.file,$3,0,$4,3 from jsonb_to_recordset($2::jsonb) as item(file text,chunk text)`, [tenant, JSON.stringify(inputs), revision, text])
    await pool.query(`insert into alix_drive_analysis (id,tenant_id,file_id,cliente_id,revision_key,content_hash,analyzer_version,status,total_chunks,processed_chunks,payload,updated_at)
      select item.id,$1,item.file,'c1',$3,$4,'test-v1',item.status,1,case when item.status='queued' then 0 else 1 end,item.payload,item.updated
      from jsonb_to_recordset($2::jsonb) as item(id text,file text,status text,payload jsonb,updated timestamptz)`, [tenant, JSON.stringify(inputs), revision, contentHash])
    const service = new DriveCorpusAnalysisService({ pool })
    // A paginação pública mantém a ordem e o limite anteriores.
    const publicFirstPage = await service.listCurrent(tenant, ['c1'])
    expect(publicFirstPage).toHaveLength(100)
    expect(publicFirstPage.every(row => row.candidateCount === 0)).toBe(true)
    let listed = 0
    const listCurrent = vi.fn(async (currentTenant: string, clients: string[], options: Parameters<typeof service.listCurrent>[2]) => {
      const page = await service.listCurrent(currentTenant, clients, options)
      // Atualizações concorrentes mudariam a posição dos registros numa
      // paginação por updated_at. O cursor por ID conserva a travessia.
      if (listed++ === 0) await pool.query("update alix_drive_analysis set updated_at='2025-01-01T00:00:00Z' where id=any($1::text[])", [page.map(row => row.id)])
      return page
    })
    const query = vi.fn((sql: string, values: any[]) => pool.query(sql, values))
    const records = await readOperationalDriveAnalysisSource(tenant, ['c1'], { pool: { query } as any, listCurrent })
    expect(records).toHaveLength(205)
    expect(new Set(records.map(record => record.id)).size).toBe(205)
    expect(new Set(records.map(record => record.source.id))).toEqual(new Set(inputs.filter(row => row.status === 'review_ready').map(row => row.id)))
    expect(listCurrent).toHaveBeenCalledTimes(3)
    expect(listCurrent.mock.calls.every(([, , options]) => options?.limit === 100 && options.reviewQueue)).toBe(true)
    expect(listCurrent.mock.calls[1][2]?.reviewQueue?.afterId).toMatch(/^[a-f0-9]{64}$/)
    expect(query.mock.calls).toHaveLength(3)
    expect(query.mock.calls.every(([, values]) => JSON.parse(values[2]).length <= 100)).toBe(true)
  })
})
