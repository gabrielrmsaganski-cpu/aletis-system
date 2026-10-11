import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as db from '../../src/db/client.js'
import { readOperationalDocumentaryRecords } from '../../src/services/alix/workspace/OperationalDocumentarySource.js'

let admin: Pool
let pool: Pool
const schema = `test_operational_docs_${randomBytes(8).toString('hex')}`
const sha = 'b'.repeat(64)

beforeAll(async () => {
  const url = (await readFile('/tmp/aletis-drive-corpus-fixture-url', 'utf8')).trim()
  const parsed = new URL(url)
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55436' || parsed.pathname !== '/aletis_implementation_fixture') throw new Error('A suíte exige o banco PostgreSQL isolado autorizado.')
  admin = new Pool({ connectionString: url, max: 1 })
  await admin.query(`create schema ${schema}`)
  pool = new Pool({ connectionString: url, max: 2, options: `-c search_path=${schema}` })
  await pool.query(`
    create table alix_document (id text primary key, cliente_id text, session_id text, sha256 text);
    create table alix_document_pipeline_run (id text primary key, document_id text, cliente_id text, session_id text, source_sha256 text, specialized_type text, pipeline_version int, status text, created_at timestamptz default now());
    create table alix_document_finding (id text primary key, run_id text, document_id text, cliente_id text, kind text, severity text, title text, description text, field_key text, evidence jsonb default '[]', status text, updated_at timestamptz default now());
    create table alix_document_field (id text primary key, run_id text, document_id text, cliente_id text, field_key text, expires_at timestamptz, status text, evidence_text text, page int, sheet text, updated_at timestamptz default now());
    create table alix_memory_fact (id bigint primary key, cliente_id text, fact_key text, canonical_key text, status text, evidence jsonb, atualizado_em timestamptz default now(), version int default 1);
  `)
  await pool.query(`insert into alix_document values ('doc1','c1','s1',$1), ('doc2','c2','s2',$1), ('changed','c1','s1',$1), ('cancelled','c1','s1',$1)`, [sha])
  await pool.query(`insert into alix_document_pipeline_run (id,document_id,cliente_id,session_id,source_sha256,specialized_type,pipeline_version,status) values
    ('r-old','doc1','c1','s1',$1,'contrato',1,'needs_review'), ('r-new','doc1','c1','s1',$1,'contrato',2,'needs_review'),
    ('r-other','doc2','c2','s2',$1,'contrato',1,'needs_review'), ('r-removed','removed','c1','s1',$1,'contrato',1,'needs_review'),
    ('r-changed','changed','c1','s1','old-sha','contrato',1,'needs_review'), ('r-cancel-old','cancelled','c1','s1',$1,'contrato',1,'needs_review'),
    ('r-cancel-new','cancelled','c1','s1',$1,'contrato',2,'cancelled')`, [sha])
  for (const [id, run, document, client] of [['f-old','r-old','doc1','c1'], ['f-current','r-new','doc1','c1'], ['f-other','r-other','doc2','c2'], ['f-removed','r-removed','removed','c1'], ['f-changed','r-changed','changed','c1'], ['f-cancelled','r-cancel-old','cancelled','c1']]) {
    await pool.query(`insert into alix_document_finding (id,run_id,document_id,cliente_id,kind,severity,title,description,field_key,status) values ($1,$2,$3,$4,'missing_field','warning','Titular ausente','Conferir titular.','titular','open')`, [id,run,document,client])
  }
  await pool.query(`insert into alix_document_field (id,run_id,document_id,cliente_id,field_key,expires_at,status,evidence_text) values ('field-new','r-new','doc1','c1','data_vencimento',now(),'extracted','Vencimento contratual a conferir.')`)
  await pool.query(`insert into alix_memory_fact (id,cliente_id,fact_key,canonical_key,status,evidence) values
    (1,'c1','titular','titular','pending_review',$1::jsonb), (2,'c1','other','other','pending_review',$2::jsonb),
    (3,'c1','empty','empty','pending_review','[]'), (4,'c1','saldo','saldo','contested','[]'),
    (5,'c2','other-client','other-client','contested','[]')`, [JSON.stringify([{ source: 'documento', documentId: 'doc1', excerpt: 'Titular: pessoa a conferir.' }]), JSON.stringify([{ source: 'documento', documentId: 'doc2', excerpt: 'Titular de outro cliente.' }])])
})
afterEach(() => vi.restoreAllMocks())
afterAll(async () => {
  await pool?.end()
  if (admin) { await admin.query(`drop schema if exists ${schema} cascade`); await admin.end() }
})

describe('Fontes documentais atuais no PostgreSQL isolado', () => {
  it('consulta apenas a última análise com SHA, sessão e cliente atuais', async () => {
    vi.spyOn(db, 'getPool').mockReturnValue(pool)
    const records = await readOperationalDocumentaryRecords(['c1'])
    expect(records.filter(row => row.source.kind === 'document_finding').map(row => row.source.id)).toEqual(['f-current'])
    expect(records.find(row => row.source.id === 'f-current')?.source.revision).toBe(sha)
    expect(records.filter(row => row.source.kind === 'fact_ledger').map(row => row.source.id)).toEqual(['1', '4'])
    expect(records.every(row => row.clienteId === 'c1')).toBe(true)
    expect(records.find(row => row.source.id === '1')?.title).toContain('Conferir candidato')
  })

  it('resolver achado ou remover a fonte elimina a pendência na consulta seguinte', async () => {
    vi.spyOn(db, 'getPool').mockReturnValue(pool)
    await pool.query("update alix_document_finding set status='resolved' where id='f-current'")
    expect((await readOperationalDocumentaryRecords(['c1'])).some(row => row.source.id === 'f-current')).toBe(false)
    await pool.query("delete from alix_document where id='doc1'")
    const afterRemoval = await readOperationalDocumentaryRecords(['c1'])
    expect(afterRemoval.map(row => row.source.id)).toEqual(['4'])
  })
})
