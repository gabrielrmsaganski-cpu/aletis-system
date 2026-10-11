import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PortalMatterService } from '../../src/services/portal/PortalMatterService.js'
import type { PortalMatter, PortalMatterPlan } from '../../src/services/portal/PortalMatterTypes.js'

const base: PortalMatterPlan = {
  demandaId: 'demanda-a', titulo: 'Regularização do cadastro', resumo: 'Organizamos os documentos apresentados e aguardamos a próxima etapa.',
  status: 'em_andamento', dependeDe: 'equipe', visibilidade: 'publicado', proximoPasso: 'Conferir o protocolo recebido.', prazo: '2026-09-12',
  marcos: [{ id: 'documentos', titulo: 'Documentos conferidos', status: 'concluido', concluidoEm: '2026-09-10T15:30:00.000Z' }, { id: 'protocolo', titulo: 'Conferência do protocolo', status: 'pendente' }],
}
const plan = (value: PortalMatter): PortalMatterPlan => {
  const { id, clienteId, criadoEm, atualizadoEm, publicadoEm, progresso, atrasado, ...fields } = value
  return fields
}

describe('assuntos falham fechados sem persistência oficial', () => {
  it('não substitui o banco por resultados vazios ou sucesso em memória', async () => {
    const service = new PortalMatterService({ pgEnabled: () => false })
    await expect(service.listPublic('a')).rejects.toMatchObject({ statusCode: 503 })
    await expect(service.create('a', base, 'request-1234', 'staff')).rejects.toMatchObject({ statusCode: 503 })
  })
})

describe.skipIf(!process.env.ALETIS_PORTAL_FIXTURE_FILE)('assuntos do portal em PostgreSQL isolado', () => {
  const schema = `portal_matters_${randomUUID().replaceAll('-', '')}`
  let admin: pg.Pool; let pool: pg.Pool; let service: PortalMatterService
  beforeAll(async () => {
    const connectionString = (await readFile(process.env.ALETIS_PORTAL_FIXTURE_FILE!, 'utf8')).trim()
    const url = new URL(connectionString)
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55436' || url.pathname !== '/aletis_implementation_fixture') throw new Error('Fixture isolado obrigatório')
    admin = new pg.Pool({ connectionString }); await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new pg.Pool({ connectionString, options: `-c search_path=${schema}`, max: 5 })
    await pool.query(`CREATE TABLE cliente(id text PRIMARY KEY,payload jsonb NOT NULL);
      CREATE TABLE cliente_demanda(id text PRIMARY KEY,cliente_id text NOT NULL,descricao text);
      CREATE TABLE audit_log(id bigserial PRIMARY KEY,ator text,acao text,recurso text,dados_depois jsonb);
      CREATE TABLE portal_evento(id bigserial PRIMARY KEY,cliente_id text,tipo text,canal text,detalhes jsonb);`)
    const migration = process.env.ALETIS_PORTAL_MATTER_MIGRATION_FILE || fileURLToPath(new URL('../../src/db/migrations/0047_portal_matters_fiscal.sql', import.meta.url))
    await pool.query(await readFile(migration, 'utf8'))
    service = new PortalMatterService({ pool, pgEnabled: () => true, now: () => new Date('2026-09-13T16:00:00.000Z') })
  })
  beforeEach(async () => {
    await pool.query('TRUNCATE portal_matter_event,portal_matter_revision,portal_matter,portal_evento,audit_log,cliente_demanda,cliente CASCADE')
    await pool.query(`INSERT INTO cliente(id,payload) VALUES ('a','{"nome":"Cliente sintético A","notasInternas":"Não publicar estratégia interna"}'),('b','{"nome":"Cliente sintético B"}'),('merged','{"identityMerge":{"status":"merged"}}');
      INSERT INTO cliente_demanda(id,cliente_id,descricao) VALUES ('demanda-a','a','Negociação confidencial que não deve ir para o portal'),('demanda-b','b','Demanda do outro cliente');`)
  })
  afterAll(async () => { await pool?.end(); if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end() } })
  const create = async (body = base, key = 'request-1234') => (await service.create('a', body, key, 'staff-synthetic')).assunto
  const count = async (table: 'portal_matter' | 'portal_matter_revision' | 'portal_matter_event' | 'audit_log') => (await pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n

  it('exibe exclusivamente assuntos publicados e não copia notas da demanda ou do CRM', async () => {
    await create({ ...base, visibilidade: 'rascunho', resumo: 'Rascunho reservado para preparação' })
    expect(await service.listPublic('a')).toMatchObject({ assuntos: [], eventos: [], resumo: { total: 0, progressoPercentual: null } })
    expect((await service.listStaff('a')).assuntos).toHaveLength(1)
    expect((await service.listStaff('a')).resumo.total).toBe(0)
    const published = await create(base, 'request-publicado')
    const result = await service.listPublic('a')
    expect(result.assuntos).toHaveLength(1); expect(result.assuntos[0].id).toBe(published.id)
    expect(result.assuntos[0]).toMatchObject({ progresso: { concluidos: 1, total: 2, percentual: 50 }, atrasado: true })
    expect(result.resumo).toMatchObject({ total: 1, emAndamento: 1, atrasados: 1, marcosConcluidos: 1, marcosAtivos: 2, progressoPercentual: 50 })
    expect(JSON.stringify(result)).not.toMatch(/confidencial|estratégia|notasInternas|actor_id|staff-synthetic|idempotency|fingerprint|Rascunho reservado/)
    expect((await service.listPublic('b')).assuntos).toEqual([])
  })

  it('retry simultâneo confirma um único assunto, versão, auditoria e conjunto de fatos', async () => {
    const results = await Promise.all([service.create('a', base, 'request-1234', 'staff'), service.create('a', base, 'request-1234', 'staff')])
    expect(results.filter(result => result.replayed)).toHaveLength(1)
    expect(new Set(results.map(result => result.assunto.id)).size).toBe(1)
    expect(await count('portal_matter')).toBe(1); expect(await count('portal_matter_revision')).toBe(1)
    expect(await count('portal_matter_event')).toBe(2); expect(await count('audit_log')).toBe(1)
    await expect(create({ ...base, resumo: 'Conteúdo diferente usando recibo anterior' })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('vínculo de demanda é apenas uma associação do mesmo cliente', async () => {
    await expect(create({ ...base, demandaId: 'demanda-b' })).rejects.toMatchObject({ statusCode: 404 })
    const value = await create()
    await expect(service.update('a', value.id, { ...base, demandaId: 'demanda-b', expectedUpdatedAt: value.atualizadoEm }, 'staff')).rejects.toMatchObject({ statusCode: 404 })
    expect((await service.listPublic('a')).assuntos[0].demandaId).toBe('demanda-a')
    await expect(service.create('merged', { ...base, demandaId: undefined }, 'request-merged', 'staff')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('publicação de rascunho registra fatos e preserva as versões privadas sem vazá-las', async () => {
    const draft = await create({ ...base, visibilidade: 'rascunho', resumo: 'Texto em preparação reservado' })
    const published = await service.update('a', draft.id, { ...base, expectedUpdatedAt: draft.atualizadoEm }, 'staff')
    expect(published.publicadoEm).toBe(published.atualizadoEm)
    const publicList = await service.listPublic('a')
    expect(publicList.eventos.map(value => value.tipo).sort()).toEqual(['marco_concluido', 'publicacao'])
    expect(JSON.stringify(publicList)).not.toContain('Texto em preparação reservado')
    const versions = await service.versions('a', draft.id)
    expect(versions.versoes.map(value => value.versao)).toEqual([2, 1])
    expect(versions.versoes[1].assunto.resumo).toBe('Texto em preparação reservado')
    expect((await service.versions('b', draft.id)).versoes).toEqual([])
    expect(JSON.stringify(versions)).not.toMatch(/actor_id|staff-synthetic/)
  })

  it('histórico exige snapshot publicado e o banco vincula o dono de cada versão', async () => {
    const draft = await create({ ...base, visibilidade: 'rascunho', resumo: 'Minuta que ainda não foi publicada' })
    await pool.query(`INSERT INTO portal_matter_event(id,assunto_id,cliente_id,versao,tipo,titulo,descricao,created_at)
      VALUES('invalid-draft-event',$1,'a',1,'publicacao','Evento vinculado indevidamente à minuta','Não pode aparecer no portal',$2)`, [draft.id, draft.atualizadoEm])
    expect((await service.listPublic('a')).eventos).toEqual([])
    expect((await service.history('a', undefined, draft.id)).eventos).toEqual([])
    await expect(pool.query('INSERT INTO portal_matter_revision(assunto_id,cliente_id,versao,snapshot,actor_id) VALUES($1,$2,2,$3,$4)',
      [draft.id, 'a', JSON.stringify({ ...draft, clienteId: 'b' }), 'staff'])).rejects.toMatchObject({ code: '23514', constraint: 'portal_matter_revision_snapshot_owner_check' })
  })

  it('preserva etapas já publicadas, conclusões reais e o primeiro dia de publicação', async () => {
    const value = await create()
    const update = (body: object) => service.update('a', value.id, { ...base, expectedUpdatedAt: value.atualizadoEm, ...body }, 'staff')
    await expect(update({ visibilidade: 'rascunho' })).rejects.toMatchObject({ statusCode: 409 })
    await expect(update({ marcos: [base.marcos[0]] })).rejects.toMatchObject({ statusCode: 409 })
    await expect(update({ marcos: [{ ...base.marcos[0], status: 'pendente', concluidoEm: undefined }, base.marcos[1]] })).rejects.toMatchObject({ statusCode: 409 })
    await expect(update({ marcos: [{ ...base.marcos[0], concluidoEm: '2026-09-09T12:00:00.000Z' }, base.marcos[1]] })).rejects.toMatchObject({ statusCode: 409 })
    const cancelledMilestone = await update({ marcos: [base.marcos[0], { ...base.marcos[1], status: 'cancelado' }] })
    expect(cancelledMilestone.progresso).toEqual({ concluidos: 1, total: 1, percentual: 100 })
    expect(cancelledMilestone.publicadoEm).toBe(value.publicadoEm)
    expect((await service.versions('a', value.id)).versoes[1].assunto.marcos[1].status).toBe('pendente')
  })

  it('versão concorrente antiga não substitui uma revisão confirmada', async () => {
    const value = await create()
    const body = { ...base, expectedUpdatedAt: value.atualizadoEm }
    const outcomes = await Promise.allSettled([
      service.update('a', value.id, { ...body, proximoPasso: 'Acompanhar a resposta do órgão.' }, 'staff-1'),
      service.update('a', value.id, { ...body, proximoPasso: 'Revisar o documento complementar.' }, 'staff-2'),
    ])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.find(result => result.status === 'rejected')).toMatchObject({ reason: { statusCode: 409, code: 'PORTAL_MATTER_CONFLICT' } })
    expect(await count('portal_matter_revision')).toBe(2)
    await expect(service.update('a', value.id, base, 'staff')).rejects.toMatchObject({ statusCode: 428 })
    await expect(service.update('b', value.id, body, 'staff')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('repetir um plano sem mudanças não produz atividade artificial no histórico', async () => {
    const value = await create()
    const unchanged = await service.update('a', value.id, { ...plan(value), expectedUpdatedAt: value.atualizadoEm }, 'staff')
    expect(unchanged.atualizadoEm).toBe(value.atualizadoEm)
    expect(await count('portal_matter_revision')).toBe(1); expect(await count('portal_matter_event')).toBe(2)
  })

  it('não inventa conclusão ou porcentagem; valida coerência e datas de calendário', async () => {
    for (const invalid of [
      { ...base, prazo: '2026-02-30' }, { ...base, proximoPasso: '' },
      { ...base, status: 'aguardando_cliente', dependeDe: 'equipe' },
      { ...base, status: 'concluido', dependeDe: 'nenhum' },
      { ...base, marcos: [{ ...base.marcos[0], concluidoEm: undefined }] },
      { ...base, marcos: [{ ...base.marcos[0], concluidoEm: '2026-09-14T12:00:00.000Z' }] },
      { ...base, marcos: [base.marcos[0], base.marcos[0]] },
      { ...base, clienteId: 'b' }, { ...base, createdAt: '2025-01-01' },
    ]) await expect(service.create('a', invalid, 'request-invalid', 'staff')).rejects.toMatchObject({ statusCode: 400 })
    const value = await create({ ...base, marcos: [] })
    expect(value.progresso).toEqual({ concluidos: 0, total: 0, percentual: null })
    expect((await service.listPublic('a')).resumo.progressoPercentual).toBeNull()
  })

  it('conclusão por etapas publica a data real, e cancelados não contaminam os percentuais do portfólio', async () => {
    const value = await create()
    const complete = await service.update('a', value.id, { ...base, status: 'concluido', dependeDe: 'nenhum', expectedUpdatedAt: value.atualizadoEm,
      marcos: [base.marcos[0], { ...base.marcos[1], status: 'concluido', concluidoEm: '2026-09-11T12:00:00.000Z' }] }, 'staff')
    expect(complete.atrasado).toBe(false); expect(complete.progresso.percentual).toBe(100)
    const result = await service.listPublic('a')
    expect(result.eventos.filter(event => event.tipo === 'conclusao')).toHaveLength(1)
    const milestone = result.eventos.find(event => event.marcoId === 'protocolo')!
    expect(milestone.descricao).toContain('11/09/2026'); expect(result.assuntos[0].marcos.find(item=>item.id==='protocolo')?.concluidoEm).toBe('2026-09-11T12:00:00.000Z'); expect(milestone.data).toBe(complete.atualizadoEm)
    await create({ ...base, status: 'cancelado', dependeDe: 'nenhum', marcos: [{ id: 'cancelled-plan', titulo: 'Planejamento descontinuado', status: 'pendente' }] }, 'request-cancelled')
    expect((await service.listPublic('a')).resumo).toMatchObject({ total: 2, concluidos: 1, cancelados: 1, marcosConcluidos: 2, marcosAtivos: 2, progressoPercentual: 100 })
  })

  it('falha na auditoria desfaz plano, versão e fatos na mesma transação', async () => {
    const value = await create()
    await pool.query(`CREATE FUNCTION reject_matter_audit() RETURNS trigger AS $$ BEGIN IF NEW.acao='portal_assunto_atualizado' THEN RAISE EXCEPTION 'rollback fixture'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_matter_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_matter_audit();`)
    try {
      await expect(service.update('a', value.id, { ...base, resumo: 'Este texto não pode ficar confirmado.', expectedUpdatedAt: value.atualizadoEm }, 'staff')).rejects.toThrow('rollback fixture')
      expect((await service.listPublic('a')).assuntos[0].resumo).toBe(base.resumo)
      expect(await count('portal_matter_revision')).toBe(1); expect(await count('portal_matter_event')).toBe(2)
    } finally { await pool.query('DROP TRIGGER reject_matter_audit ON audit_log; DROP FUNCTION reject_matter_audit()') }
  })

  it('histórico completo é paginado por cursor estável e respeita o cliente e o assunto', async () => {
    let value = await create({ ...base, marcos: [] })
    for (let index = 0; index < 202; index++) value = await service.update('a', value.id, { ...plan(value), resumo: `Acompanhamento registrado, revisão ${index}.`, expectedUpdatedAt: value.atualizadoEm }, 'staff')
    const first = await service.history('a', undefined, value.id)
    expect(first.eventos).toHaveLength(200); expect(first.proximoCursor).toEqual(expect.any(String))
    const second = await service.history('a', first.proximoCursor!, value.id)
    expect(second.eventos).toHaveLength(3); expect(second.proximoCursor).toBeNull()
    expect(new Set([...first.eventos, ...second.eventos].map(event => event.id)).size).toBe(203)
    expect((await service.history('b', first.proximoCursor!, value.id)).eventos).toEqual([])
    expect((await service.history('a', undefined, 'missing-matter')).eventos).toEqual([])
    const versions = await service.versions('a', value.id)
    expect(versions.versoes).toHaveLength(50)
    const laterVersions = await service.versions('a', value.id, versions.proximoCursor!)
    expect(laterVersions.versoes[0].versao).toBe(153)
    await expect(service.history('a', 'invalid-cursor')).rejects.toMatchObject({ statusCode: 400 })
  })

  it('banco também impede alterar ou apagar fatos e versões anteriores', async () => {
    const value = await create()
    await expect(pool.query('DELETE FROM portal_matter_revision WHERE assunto_id=$1', [value.id])).rejects.toMatchObject({ code: '55000' })
    await expect(pool.query("UPDATE portal_matter_event SET descricao='Substituição indevida' WHERE assunto_id=$1", [value.id])).rejects.toMatchObject({ code: '55000' })
    expect(await count('portal_matter_revision')).toBe(1); expect(await count('portal_matter_event')).toBe(2)
  })

  it('limite por cliente não impede recibos idempotentes ou revisões existentes', async () => {
    const value = await create()
    await pool.query(`INSERT INTO portal_matter(id,cliente_id,status,visibilidade,payload,versao,idempotency_key,create_fingerprint)
      SELECT 'seed-'||n,'a','em_andamento','rascunho',$1,1,'seed-key-'||n,'seed-fingerprint' FROM generate_series(1,199) n`, [JSON.stringify({ ...base, demandaId: undefined, visibilidade: 'rascunho' })])
    await expect(create(base, 'request-over-limit')).rejects.toMatchObject({ statusCode: 429 })
    expect((await service.create('a', base, 'request-1234', 'staff')).replayed).toBe(true)
    expect((await service.update('a', value.id, { ...base, resumo: 'Continuar assunto já existente.', expectedUpdatedAt: value.atualizadoEm }, 'staff')).resumo).toContain('Continuar')
  })
})
