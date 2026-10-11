import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ db: null as any, pool: null as any }))
vi.mock('../../src/db/client.js', () => ({ getDb: () => state.db, getPool: () => state.pool, isPgEnabled: () => true }))
import * as dbSchema from '../../src/db/schema.js'
import { ClienteDemandaService } from '../../src/services/cliente/ClienteDemandaService.js'
import { PortalMatterService } from '../../src/services/portal/PortalMatterService.js'

describe.skipIf(!process.env.ALETIS_PORTAL_FIXTURE_FILE)('remoção de demanda preserva assuntos do portal no PG', () => {
  const schema = `portal_demand_delete_${randomUUID().replaceAll('-', '')}`
  let admin: pg.Pool; let pool: pg.Pool; let matters: PortalMatterService
  const matterPlan = { demandaId: 'demand-a', titulo: 'Acompanhamento sintético', resumo: 'Plano público acompanhado pela equipe.', status: 'em_andamento', dependeDe: 'equipe', visibilidade: 'publicado', proximoPasso: 'Conferir a resposta do protocolo.', marcos: [] }
  beforeAll(async () => {
    const connectionString = (await readFile(process.env.ALETIS_PORTAL_FIXTURE_FILE!, 'utf8')).trim()
    const url = new URL(connectionString)
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55436' || url.pathname !== '/aletis_implementation_fixture') throw new Error('Fixture isolado obrigatório')
    admin = new pg.Pool({ connectionString }); await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new pg.Pool({ connectionString, options: `-c search_path=${schema}`, max: 5 })
    await pool.query(`CREATE TABLE cliente(id text PRIMARY KEY,payload jsonb NOT NULL);
      CREATE TABLE proposta(id text PRIMARY KEY,demanda_id text);
      CREATE TABLE client_contract(id text PRIMARY KEY,demanda_id text);
      CREATE TABLE audit_log(id bigserial PRIMARY KEY,ator text,acao text,recurso text,dados_depois jsonb);
      CREATE TABLE portal_evento(id bigserial PRIMARY KEY,cliente_id text,tipo text,canal text,detalhes jsonb);`)
    for (const name of ['0025_cliente_demandas.sql', '0026_cliente_demanda_operacional.sql', '0047_portal_matters_fiscal.sql']) {
      await pool.query(await readFile(new URL(`../../src/db/migrations/${name}`, import.meta.url), 'utf8'))
    }
    state.db = drizzle(pool, { schema: dbSchema }); state.pool = pool
    matters = new PortalMatterService({ pool, pgEnabled: () => true })
  })
  beforeEach(async () => {
    await pool.query('TRUNCATE portal_matter_event,portal_matter_revision,portal_matter,cliente_demanda,cliente,proposta,client_contract,audit_log,portal_evento CASCADE')
    await pool.query(`INSERT INTO cliente(id,payload) VALUES('client-a','{}'),('client-b','{}');
      INSERT INTO cliente_demanda(id,cliente_id,titulo) VALUES('demand-a','client-a','Demanda original'),('demand-free','client-a','Demanda sem vínculo'),('demand-b','client-b','Demanda do outro cliente');`)
  })
  afterAll(async () => { state.db = null; state.pool = null; await pool?.end(); if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end() } })

  it('um assunto publicado bloqueia exclusão sem lançar violação de chave estrangeira', async () => {
    const { assunto } = await matters.create('client-a', matterPlan, 'matter-request-1234', 'staff')
    expect(await new ClienteDemandaService().remove('client-a', 'demand-a')).toBe(false)
    expect((await pool.query('SELECT id FROM cliente_demanda WHERE id=$1', ['demand-a'])).rowCount).toBe(1)
    expect((await matters.listPublic('client-a')).assuntos[0].id).toBe(assunto.id)
    expect((await matters.versions('client-a', assunto.id)).versoes).toHaveLength(1)
  })

  it('rascunho também conserva o vínculo e demanda sem vínculos continua removível', async () => {
    await matters.create('client-a', { ...matterPlan, visibilidade: 'rascunho' }, 'matter-request-1234', 'staff')
    const service = new ClienteDemandaService()
    expect(await service.remove('client-a', 'demand-a')).toBe(false)
    expect(await service.remove('client-a', 'demand-free')).toBe(true)
    expect(await service.remove('client-a', 'demand-b')).toBe(false)
    expect((await pool.query('SELECT id FROM cliente_demanda ORDER BY id')).rows.map(row => row.id)).toEqual(['demand-a', 'demand-b'])
  })

  it('publicação e exclusão simultâneas mantêm um único resultado coerente', async () => {
    const [publication, deletion] = await Promise.allSettled([
      matters.create('client-a', matterPlan, 'matter-request-1234', 'staff'),
      new ClienteDemandaService().remove('client-a', 'demand-a'),
    ])
    expect(deletion.status).toBe('fulfilled')
    if (publication.status === 'fulfilled') {
      expect(deletion).toMatchObject({ value: false })
      expect((await matters.listPublic('client-a')).assuntos).toHaveLength(1)
    } else {
      expect(publication.reason).toMatchObject({ statusCode: 404 })
      expect(deletion).toMatchObject({ value: true })
      expect((await matters.listPublic('client-a')).assuntos).toEqual([])
    }
  })
})
