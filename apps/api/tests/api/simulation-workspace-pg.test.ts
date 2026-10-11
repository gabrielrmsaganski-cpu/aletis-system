import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
const holder = vi.hoisted(() => ({ pool: null as any }))
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => true, getPool: () => holder.pool }))
vi.mock('../../src/db/AuditLog.js', () => ({ auditAsync: vi.fn() }))
import { SimulationWorkspaceService } from '../../src/services/simulations/SimulationWorkspaceService.js'
import { syntheticDraft } from '../fixtures/simulation-draft.js'

describe.skipIf(!process.env.ALETIS_SIMULATION_FIXTURE_FILE)('persistência PostgreSQL isolada', () => {
  const schema = `simulation_${randomUUID().replaceAll('-', '')}`
  let admin: pg.Pool
  beforeAll(async () => {
    const url = (await readFile(process.env.ALETIS_SIMULATION_FIXTURE_FILE!, 'utf8')).trim()
    const parsed = new URL(url)
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.port !== '55436' || parsed.pathname !== '/aletis_implementation_fixture') throw new Error('Exige PostgreSQL descartável autorizado.')
    admin = new pg.Pool({ connectionString: url })
    await admin.query(`CREATE SCHEMA ${schema}`)
    holder.pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 5 })
    await holder.pool.query(`CREATE TABLE simulation_workspace (
      id text PRIMARY KEY, organization_id text NOT NULL, office_id text, user_id text, client_id text,
      case_id text, creditor_id text, debt_id text, kind text, title text, status text, draft jsonb,
      registered_version integer, idempotency_key text, created_at timestamptz, updated_at timestamptz,
      UNIQUE (organization_id,idempotency_key));
      CREATE TABLE calculation_snapshot (id text PRIMARY KEY, workspace_id text REFERENCES simulation_workspace(id),
      version integer, calculation_type text, input jsonb, output jsonb, source_snapshot jsonb, created_by text,
      created_at timestamptz, UNIQUE (workspace_id,version));`)
    await holder.pool.query(`CREATE TABLE cliente_demanda (id text, cliente_id text);
      CREATE TABLE client_debt (id text, client_id text, case_id text, creditor_id text);
      CREATE TABLE office (id text, organization_id text);
      INSERT INTO cliente_demanda VALUES ('case-b','b');`)
  })
  afterAll(async () => {
    if (holder.pool) await holder.pool.end()
    if (admin) { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end() }
  })
  const create = async () => new SimulationWorkspaceService().create({ organizationId: 'test', title: 'Sintético', clientId: 'a', draft: syntheticDraft() })

  it('concorrência entre processos mantém exatamente um salvamento da versão esperada', async () => {
    const { record } = await create()
    const outcomes = await Promise.allSettled([new SimulationWorkspaceService(), new SimulationWorkspaceService()].map((service, index) =>
      service.updateDraft(record.id, 'test', { draft: record.draft, title: `Edição ${index}`, expectedUpdatedAt: record.updatedAt })))
    expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1)
    expect((outcomes.find(item => item.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('SIMULATION_CONFLICT')
  })

  it('registro usa rascunho PostgreSQL atual, inclusive depois de leitura cacheada por outra instância', async () => {
    const { record } = await create(); const a = new SimulationWorkspaceService(); const b = new SimulationWorkspaceService()
    await a.get(record.id, 'test')
    const draft = syntheticDraft(); draft.input.valorOperacao = 19000
    const changed = await b.updateDraft(record.id, 'test', { draft, expectedUpdatedAt: record.updatedAt })
    const result = await a.register(record.id, 'test', 'test', changed.updatedAt)
    expect(result.snapshot.input.input.valorOperacao).toBe(19000)
    expect(result.snapshot.output.simulacao.resumo[0].valorOperacao).toBe('19000')
    const reloaded = await new SimulationWorkspaceService().listSnapshots(record.id, 'test')
    expect(reloaded[0]).toEqual(result.snapshot)
    await expect(b.register(record.id, 'test', 'test', changed.updatedAt)).rejects.toMatchObject({ code: 'SIMULATION_CONFLICT' })
  })

  it('falha ao gravar snapshot reverte transação sem mudar versão/status', async () => {
    const { record } = await create()
    await holder.pool.query('ALTER TABLE calculation_snapshot ADD CONSTRAINT reject_test CHECK (workspace_id <> ' + "'" + record.id + "'" + ')')
    try {
      await expect(new SimulationWorkspaceService().register(record.id, 'test', 'test', record.updatedAt)).rejects.toBeDefined()
      const saved = await new SimulationWorkspaceService().get(record.id, 'test')
      expect(saved?.updatedAt).toBe(record.updatedAt); expect(saved?.registeredVersion).toBe(0); expect(saved?.status).toBe('draft')
      expect(await new SimulationWorkspaceService().listSnapshots(record.id, 'test')).toEqual([])
    } finally { await holder.pool.query('ALTER TABLE calculation_snapshot DROP CONSTRAINT reject_test') }
  })

  it('não vincula a demanda de outro cliente ao cenário', async () => {
    const { record } = await create()
    await expect(new SimulationWorkspaceService().updateDraft(record.id, 'test', {
      draft: record.draft, caseId: 'case-b', expectedUpdatedAt: record.updatedAt,
    })).rejects.toMatchObject({ code: 'SIMULATION_LINK_MISMATCH' })
    expect((await new SimulationWorkspaceService().get(record.id, 'test'))?.caseId).toBeUndefined()
  })
})
