import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DriveKnowledgeService } from '../../src/services/google-workspace/DriveKnowledgeService.js'

describe.skipIf(process.env.ALETIS_DRIVE_IMPORT_FIXTURE !== '1')('panorama Drive em PostgreSQL descartável', () => {
  const schema = `drive_knowledge_${randomUUID().replaceAll('-', '')}`
  const pool = new pg.Pool({ connectionString: 'postgresql://postgres:aletis-fixture-only@127.0.0.1:55436/aletis_implementation_fixture', max: 1 })
  const actor = { userId: 'owner', tenantId: 'tenant-a', userName: 'Sintético', role: 'consultor' }
  const file = { id: 'drive-file', name: 'Documento sintético', mimeType: 'text/plain', modifiedAt: null, version: '2', sizeBytes: '5', path: '', url: 'https://example.invalid' }
  const service = new DriveKnowledgeService({ query: (sql, values) => pool.query(sql, values) })
  beforeAll(async () => {
    await pool.query(`create schema ${schema}`)
    await pool.query(`set search_path to ${schema}`)
    await pool.query('create table alix_session(id text primary key, consultor_id text, cliente_id text)')
    await pool.query('create table alix_document(id text primary key, session_id text, cliente_id text, filename text, payload jsonb, updated_at timestamptz)')
    await pool.query("insert into alix_session values('session','owner','client-a'),('other-owner','other','client-a'),('other-client','owner','client-b')")
    for (const [id, session, client, tenant, version] of [
      ['current', 'session', 'client-a', 'tenant-a', '2'],
      ['old', 'session', 'client-a', 'tenant-a', '1'],
      ['private', 'other-owner', 'client-a', 'tenant-a', '3'],
      ['other-client', 'other-client', 'client-b', 'tenant-a', '4'],
      ['other-tenant', 'session', 'client-a', 'tenant-b', '5'],
    ]) {
      const payload = { extractedText: 'conteúdo de teste sintético', metadata: { source: { type: 'google_drive', fileId: file.id, version, tenantId: tenant }, extractionCoverage: { status: 'complete' }, clientScopeReview: { status: 'verified' }, processingState: 'completed_basic' } }
      await pool.query('insert into alix_document values($1,$2,$3,$4,$5::jsonb,now())', [id, session, client, file.name, JSON.stringify(payload)])
    }
  })
  afterAll(async () => { await pool.query('set search_path to public'); await pool.query(`drop schema ${schema} cascade`); await pool.end() })
  it('seleciona revisão atual dentre versões acessíveis sem texto bruto na resposta', async () => {
    const result = await service.inspect({ actor, clientId: 'client-a', files: [file] })
    expect(result.files[0]).toMatchObject({ documentId: 'current', freshness: 'current', extractionStatus: 'complete', extractedCharacters: 27 })
    expect(JSON.stringify(result)).not.toContain('conteúdo de teste sintético')
  })
  it('consultor não recebe documento de outra sessão/autor como versão atual', async () => {
    const result = await service.inspect({ actor, clientId: 'client-a', files: [{ ...file, version: '3' }] })
    expect(result.files[0].documentId).not.toBe('private')
    expect(result.files[0].freshness).toBe('outdated')
  })
  it('admin mantém o escopo de tenant e cliente', async () => {
    const admin = { ...actor, role: 'admin' }
    const privateVersion = await service.inspect({ actor: admin, clientId: 'client-a', files: [{ ...file, version: '3' }] })
    expect(privateVersion.files[0].documentId).toBe('private')
    for (const version of ['4', '5']) {
      const result = await service.inspect({ actor: admin, clientId: 'client-a', files: [{ ...file, version }] })
      expect(result.files[0].freshness).toBe('outdated')
    }
  })
})
