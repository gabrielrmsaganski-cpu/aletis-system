/** Homologação isolada: nunca conecta ao PostgreSQL de produção. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const fixture = 'postgresql://postgres:aletis-fixture-only@127.0.0.1:55436/aletis_implementation_fixture'
const supplied = new URL(process.env.DATABASE_URL || 'postgresql://invalid/')
if (supplied.hostname !== '127.0.0.1' || supplied.port !== '55436' || supplied.pathname !== '/aletis_implementation_fixture' || supplied.username !== 'postgres' || supplied.password !== 'aletis-fixture-only' || process.env.ALETIS_ALIX_HANDOFF_FIXTURE !== '1') throw new Error('Exige fixture local explícita, porta 55436 e opt-in ALETIS_ALIX_HANDOFF_FIXTURE=1.')
const workerMode = process.argv[2] === '--worker'
const schema = workerMode ? process.env.ALETIS_ALIX_FIXTURE_SCHEMA! : `alix_inteligencia_fixture_${randomUUID().replaceAll('-', '')}`
if (!/^alix_inteligencia_fixture_[a-f0-9]{32}$/.test(schema)) throw new Error('Schema de fixture inválido.')
const scoped = new URL(fixture); scoped.searchParams.set('options', `-c search_path=${schema}`)
process.env.DATABASE_URL = scoped.toString(); process.env.ALETIS_PG_ENABLED = '1'; process.env.ALETIS_ALIX_FIXTURE_SCHEMA = schema
process.env.ALIX_USE_LLM = 'false'; process.env.ALIX_PROACTIVE_ENABLED = 'false'; process.env.N8N_AUTOMATION_ENABLED = 'false'
let externalRequests = 0
globalThis.fetch = async () => { externalRequests++; throw new Error('Rede externa proibida na fixture.') }

const [{ getPool, closeDb }, { AlixMissionService }, { AlixOperationalPlanService }, { AlixOperationalHandoffService }, sessions] = await Promise.all([
  import('../src/db/client.js'), import('../src/services/alix/workspace/AlixMissionService.js'), import('../src/services/alix/workspace/AlixOperationalPlanService.js'), import('../src/services/alix/workspace/AlixOperationalHandoffService.js'), import('../src/db/AlixSessionRepository.js'),
])
const directory = workerMode ? process.argv[4] : await mkdtemp(join(tmpdir(), 'aletis-handoff-pg-'))
const missions = new AlixMissionService(directory)
const operations = new AlixOperationalPlanService({ now: () => new Date('2026-09-07T14:00:00Z'), missions })
const handoffs = new AlixOperationalHandoffService({ missions, overview: input => operations.overview(input), ensureSession: async (id, title, consultorId, clienteId) => {
  const result = await sessions.ensureSession({ id, title, consultorId, clienteId })
  assert.ok(result)
  return { id: result.id, clienteId: result.clienteId, consultorId: result.consultorId, archivedAt: result.archivedAt }
} })
async function input() {
  const current = await operations.overview({ clienteId: 'handoff-client' })
  const item = current.items.find(item => item.kind === 'client_action')!
  assert.ok(item?.fingerprint)
  return { clienteId: item.clienteId, itemId: item.id, fingerprint: item.fingerprint }
}

if (workerMode) {
  try {
    const action = process.argv[3]
    if (action === 'prepare') {
      const result = await handoffs.prepare(await input(), 'owner-concurrent')
      process.stdout.write(JSON.stringify({ missionId: result.mission.id, sessionId: result.session.id, reused: result.reused, canStart: result.canStart, externalRequests }))
    } else {
      try { await missions.start(process.argv[5], { exclusive: true }); process.stdout.write(JSON.stringify({ claimed: true, externalRequests })) }
      catch (error) { const known = error as Error & { code?: string; statusCode?: number }; process.stdout.write(JSON.stringify({ claimed: false, code: known.code, statusCode: known.statusCode, externalRequests })) }
    }
  } finally { await closeDb() }
} else {
  const admin = new pg.Pool({ connectionString: fixture, max: 1 })
  const results: Array<{ name: string; passed: boolean; error?: string }> = []
  async function check(name: string, task: () => Promise<void>) { try { await task(); results.push({ name, passed: true }) } catch (error) { results.push({ name, passed: false, error: error instanceof Error ? error.message : String(error) }) } }
  async function tables(migration: string, names: string[]) {
    const content = await readFile(new URL(`../src/db/migrations/${migration}`, import.meta.url), 'utf8')
    for (const name of names) {
      const ddl = content.match(new RegExp(`CREATE TABLE(?: IF NOT EXISTS)? "?${name}"? \\([\\s\\S]*?\\n\\);`))?.[0]
      assert.ok(ddl, `DDL ${name}`); await getPool().query(ddl)
    }
  }
  async function worker(action: string, name: string, missionId = ''): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--worker', action, join(directory, name), missionId], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
      let output = ''; let error = ''
      child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { error += chunk })
      child.on('error', reject); child.on('close', code => {
        if (code !== 0) return reject(new Error(`Worker falhou: ${error.slice(-1000)}`))
        try { const result = JSON.parse(output); assert.equal(result.externalRequests, 0); resolve(result) } catch { reject(new Error('Worker não retornou confirmação válida.')) }
      })
    })
  }
  try {
    assert.equal((await admin.query('select current_database() as name')).rows[0].name, 'aletis_implementation_fixture')
    await admin.query(`create schema "${schema}"`)
    await tables('0000_mysterious_phalanx.sql', ['cliente', 'proposta', 'alix_session', 'alix_message'])
    await getPool().query(await readFile(new URL('../src/db/migrations/0025_cliente_demandas.sql', import.meta.url), 'utf8'))
    await getPool().query(await readFile(new URL('../src/db/migrations/0026_cliente_demanda_operacional.sql', import.meta.url), 'utf8'))
    await getPool().query(await readFile(new URL('../src/db/migrations/0028_alix_chat_workspace.sql', import.meta.url), 'utf8'))
    await getPool().query(await readFile(new URL('../src/db/migrations/0039_alix_message_payload.sql', import.meta.url), 'utf8'))
    await tables('0030_alix_document_workspace.sql', ['alix_mission', 'alix_mission_step', 'alix_mission_source', 'alix_mission_event'])
    await getPool().query("insert into cliente(id,nome,cpf_cnpj,estagio,consultor,payload) values('handoff-client','Cliente sintético','00000000000','negociacao','Consultor sintético',$1)", [{ id: 'handoff-client', proximaAcao: { descricao: 'Conferir proposta e anexos', data: '2026-09-07' } }])
    const originalInput = await input()
    let missionId = ''; let sessionId = ''
    await check('Dois processos criam a mesma sessão e missão, com fontes únicas e proprietário verificado', async () => {
      const [a, b] = await Promise.all([worker('prepare', 'prepare-a'), worker('prepare', 'prepare-b')])
      assert.equal(a.missionId, b.missionId); assert.equal(a.sessionId, b.sessionId); assert.deepEqual([a.reused, b.reused].sort(), [false, true])
      missionId = String(a.missionId); sessionId = String(a.sessionId)
      assert.equal((await getPool().query('select count(*)::int n from alix_session')).rows[0].n, 1)
      assert.equal((await getPool().query('select count(*)::int n from alix_mission')).rows[0].n, 1)
      const mission = await missions.get(missionId)
      assert.equal(mission?.consultorId, 'owner-concurrent'); assert.equal(mission?.clienteId, 'handoff-client')
      assert.equal(mission?.sources.filter(source => source.kind === 'operational_handoff').length, 1)
      assert.equal((await sessions.getSessionAccess(sessionId))?.consultorId, 'owner-concurrent')
      const repeat = await worker('prepare', 'prepare-restart')
      assert.equal(repeat.reused, true); assert.equal(repeat.canStart, true)
    })
    await check('Claim exclusivo em dois processos: um vencedor e um 409; estado permanece running', async () => {
      assert.ok(missionId)
      const outcomes = await Promise.all([worker('claim', 'claim-a', missionId), worker('claim', 'claim-b', missionId)])
      assert.equal(outcomes.filter(result => result.claimed).length, 1)
      assert.equal(outcomes.find(result => !result.claimed)?.code, 'ALIX_MISSION_ALREADY_STARTED')
      assert.equal(outcomes.find(result => !result.claimed)?.statusCode, 409)
      assert.equal((await missions.get(missionId))?.status, 'running')
      assert.equal((await handoffs.prepare(originalInput, 'owner-concurrent')).canStart, false)
      await missions.complete(missionId, { response: 'Conclusão: fonte sintética conferida.\nPróxima ação: revisão do dono.' })
      const repeated = await handoffs.prepare(originalInput, 'owner-concurrent')
      assert.equal(repeated.canStart, false); assert.equal(repeated.mission.status, 'completed')
    })
    await check('Dono diferente ganha contexto próprio; sessão reaproveitada não muda de cliente', async () => {
      const another = await handoffs.prepare(originalInput, 'owner-other')
      assert.notEqual(another.session.id, sessionId); assert.equal(another.mission.consultorId, 'owner-other')
      await getPool().query("update alix_session set cliente_id='outro-cliente-sintetico' where id=$1", [another.session.id])
      await assert.rejects(handoffs.prepare(originalInput, 'owner-other'), (error: unknown) => (error as { code?: string }).code === 'ALIX_SESSION_SCOPE_CONFLICT')
    })
    await check('Fonte atualizada invalida fingerprint antigo sem criar missão adicional', async () => {
      const before = (await getPool().query('select count(*)::int n from alix_mission')).rows[0].n
      await getPool().query("update cliente set payload=jsonb_set(payload,'{proximaAcao,descricao}','\"Nova decisão sintética\"'), atualizado_em=now() where id='handoff-client'")
      await assert.rejects(handoffs.prepare(originalInput, 'owner-stale'), (error: unknown) => (error as { code?: string }).code === 'ALIX_PRIORITY_STALE')
      assert.equal((await getPool().query('select count(*)::int n from alix_mission')).rows[0].n, before)
    })
    await check('Falha no evento created desfaz missão e passos; retry recupera a sessão estável sem órfãos', async () => {
      const current = await input()
      await getPool().query("alter table alix_mission_event add constraint handoff_fail_created check(event_type <> 'created') not valid")
      try { await assert.rejects(handoffs.prepare(current, 'owner-create-failure')) }
      finally { await getPool().query('alter table alix_mission_event drop constraint handoff_fail_created') }
      const saved = (await getPool().query("select id from alix_session where consultor_id='owner-create-failure'")).rows
      assert.equal(saved.length, 1)
      assert.equal((await getPool().query("select count(*)::int n from alix_mission where consultor_id='owner-create-failure'")).rows[0].n, 0)
      const recovered = await handoffs.prepare(current, 'owner-create-failure')
      assert.equal(recovered.session.id, saved[0].id); assert.equal(recovered.canStart, true)
      assert.equal((await getPool().query('select count(*)::int n from alix_mission m left join alix_session s on s.id=m.session_id where s.id is null')).rows[0].n, 0)
    })
    await check('Falha de fontes não inicia execução; retry recupera mesma missão e não duplica evidências', async () => {
      const current = await input()
      await getPool().query("alter table alix_mission_source add constraint handoff_fail_source check(kind <> 'operational_handoff') not valid")
      try { await assert.rejects(handoffs.prepare(current, 'owner-source-failure')) }
      finally { await getPool().query('alter table alix_mission_source drop constraint handoff_fail_source') }
      const saved = (await getPool().query("select id,status from alix_mission where consultor_id='owner-source-failure'")).rows[0]
      assert.equal(saved.status, 'queued')
      const recovered = await handoffs.prepare(current, 'owner-source-failure')
      assert.equal(recovered.mission.id, saved.id); assert.equal(recovered.reused, true); assert.equal(recovered.canStart, true)
      assert.equal(recovered.mission.sources.filter(source => source.kind === 'operational_handoff').length, 1)
    })
    await check('Falha no evento started reverte claim e snapshot; retry pode iniciar uma única vez', async () => {
      const current = await input(); const prepared = await handoffs.prepare(current, 'owner-claim-failure')
      await getPool().query("alter table alix_mission_event add constraint handoff_fail_started check(event_type <> 'started') not valid")
      try { await assert.rejects(missions.start(prepared.mission.id, { exclusive: true })) }
      finally { await getPool().query('alter table alix_mission_event drop constraint handoff_fail_started') }
      assert.equal((await missions.get(prepared.mission.id))?.status, 'queued')
      assert.equal(JSON.parse(await readFile(join(directory, `${prepared.mission.id}.json`), 'utf8')).status, 'queued')
      assert.equal((await missions.start(prepared.mission.id, { exclusive: true })).status, 'running')
      await assert.rejects(missions.start(prepared.mission.id, { exclusive: true }), (error: unknown) => (error as { code?: string }).code === 'ALIX_MISSION_ALREADY_STARTED')
    })
    await check('Fonte indisponível bloqueia preparação sem fallback para memória', async () => {
      const current = await input()
      await getPool().query('alter table cliente rename to cliente_indisponivel')
      try { await assert.rejects(handoffs.prepare(current, 'owner-unavailable'), (error: unknown) => (error as { code?: string }).code === 'ALIX_PRIORITY_SOURCE_UNAVAILABLE') }
      finally { await getPool().query('alter table cliente_indisponivel rename to cliente') }
    })
  } finally {
    await closeDb(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); await rm(directory, { recursive: true, force: true })
  }
  assert.equal(externalRequests, 0)
  const report = { generatedAt: new Date().toISOString(), fixture: { database: 'aletis_implementation_fixture', port: 55436, schema, removed: true }, externalMessagesSent: 0, externalRequests, businessActionsExecuted: 0, results }
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2))
  process.stdout.write(JSON.stringify(report, null, 2))
  if (results.some(result => !result.passed)) process.exitCode = 1
}
