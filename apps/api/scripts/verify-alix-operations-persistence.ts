/** Homologação operacional em banco temporário, com dados inteiramente sintéticos. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPool, closeDb } from '../src/db/client.js'
import { AlixMissionService } from '../src/services/alix/workspace/AlixMissionService.js'
import { AlixOperationalPlanService, readOperationalSource } from '../src/services/alix/workspace/AlixOperationalPlanService.js'

const database = new URL(process.env.DATABASE_URL || 'postgres://invalid/').pathname.slice(1)
if (!/^aletis_evolution_validation_[a-z0-9_]+$/.test(database) || process.env.ALETIS_PG_ENABLED !== '1') {
  throw new Error('Esta verificação exige PG habilitado e banco temporário aletis_evolution_validation_.')
}
const now = new Date('2026-09-06T15:00:00Z')
const workerMode = process.argv[2] === '--worker'
const directory = workerMode ? process.argv[3] : await mkdtemp(join(tmpdir(), 'aletis-operations-pg-'))
const missions = new AlixMissionService(directory)
const operations = new AlixOperationalPlanService({ missions, now: () => now })

if (workerMode) {
  try {
    const result = await operations.prepare({ clienteId: 'operations-c1', actorId: 'validation-actor' })
    process.stdout.write(JSON.stringify({ id: result.mission.id, reused: result.reused, status: result.mission.status }))
  } finally { await closeDb() }
} else {
  const results: Array<{ name: string; passed: boolean; error?: string }> = []
  async function check(name: string, run: () => Promise<void>) {
    try { await run(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: error instanceof Error ? error.message : String(error) }) }
  }
  async function worker(name: string): Promise<{ id: string; reused: boolean; status: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--worker', join(directory, name)], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
      let output = ''
      let error = ''
      child.stdout.on('data', value => { output += value })
      child.stderr.on('data', value => { error += value })
      child.on('error', reject)
      child.on('close', code => {
        if (code !== 0) return reject(new Error(`Worker ${name} falhou: ${error.slice(-1000)}`))
        try { resolve(JSON.parse(output)) } catch { reject(new Error(`Worker ${name} não retornou confirmação válida.`)) }
      })
    })
  }
  try {
    await getPool().query("insert into organization (id,name) values ('org-aletis','Homologação sintética') on conflict do nothing")
    await getPool().query(`insert into cliente (id,nome,cpf_cnpj,estagio,consultor,payload,atualizado_em)
      values ('operations-c1','Cliente sintético','00000000000','negociacao','Ana',$1::jsonb,'2026-09-06T14:00:00Z')`, [JSON.stringify({ id: 'operations-c1', nome: 'Nome antigo', estagio: 'encerrado', ultimaAtualizacao: '2020-01-01', proximaAcao: { descricao: 'Conferir documentos', data: '2026-09-06' } })])
    await getPool().query(`insert into cliente_demanda (id,cliente_id,titulo,status,proxima_acao,proxima_acao_em,checklist)
      values ('operations-d1','operations-c1','Demanda sintética','em_analise','Conferir anexos','2026-09-05',$1::jsonb)`, [JSON.stringify([{ id: 'check1', titulo: 'Validar documento', prazo: '2026-09-06', concluido: false }])])
    await getPool().query(`insert into proposta (id,cliente_id,status,titulo,payload) values ('operations-pi1',null,null,null,$1::jsonb)`, [JSON.stringify({ id: 'operations-pi1', clienteId: '', cliente: { id: 'operations-c1' }, secoes: { capa: { titulo: 'Proposta inteligente sintética' } }, dataGeracao: '2026-09-01', dataValidade: '2026-09-07' })])
    await check('Consulta PG preserva fonte atual e inclui proposta inteligente legada no escopo', async () => {
      const source = await readOperationalSource('proposals', 'operations-c1')
      assert.equal(source.records.length, 1)
      assert.equal(source.records[0].status, 'gerada')
      const plan = await operations.overview({ clienteId: 'operations-c1' })
      assert.equal(plan.coverage.status, 'complete')
      assert.equal(plan.counts.activeClients, 1)
      assert.equal(plan.counts.openProposals, 1)
      assert.equal(plan.counts.overdue, 1)
      assert.equal(plan.counts.missingOwner, 1)
      assert.equal(plan.items.find(item => item.entity.id === 'operations-c1')?.sources[0].updatedAt, '2026-09-06T14:00:00.000Z')
      assert.equal((await getPool().query('select count(*)::int total from alix_mission')).rows[0].total, 0)
    })
    let preparedId = ''
    await check('Dois processos preparam uma única missão e reinício reutiliza PG sem snapshot', async () => {
      const [first, concurrent] = await Promise.all([worker('first'), worker('second')])
      preparedId = first.id
      assert.equal(first.id, concurrent.id)
      assert.deepEqual([first.reused, concurrent.reused].sort(), [false, true])
      assert.equal(first.status, 'completed')
      const restarted = await worker('restart-without-snapshot')
      assert.equal(restarted.id, first.id)
      assert.equal(restarted.reused, true)
      assert.equal((await getPool().query('select count(*)::int total from alix_mission')).rows[0].total, 1)
      const snapshot = await missions.get(first.id)
      assert.ok(snapshot?.result?.rawResponse.includes('/clientes/operations-c1'))
      assert.equal(snapshot?.costUsd, '0.000000')
    })
    await check('Missão interrompida retoma preparação com mesmas fontes sem duplicação', async () => {
      assert.ok(preparedId)
      const before = (await getPool().query('select count(*)::int total from alix_mission_source where mission_id=$1', [preparedId])).rows[0].total
      await getPool().query("update alix_mission set status='running', progress=55, current_step='analyze', result=null, completed_at=null, cancellable=true where id=$1", [preparedId])
      await getPool().query("update alix_mission_step set status=case when position<2 then 'completed' else 'pending' end where mission_id=$1", [preparedId])
      const restarted = await worker('interrupted-restart')
      assert.equal(restarted.id, preparedId)
      assert.equal(restarted.reused, false)
      assert.equal(restarted.status, 'completed')
      assert.equal((await getPool().query('select count(*)::int total from alix_mission_source where mission_id=$1', [preparedId])).rows[0].total, before)
    })
    await check('Transições concorrentes preservam resultado terminal e todas as fontes', async () => {
      const first = new AlixMissionService(join(directory, 'transitions'))
      const second = new AlixMissionService(join(directory, 'transitions'))
      const mission = await first.create({ sessionId: 'transitions', prompt: 'Teste sintético de concorrência' })
      await first.start(mission.id)
      await Promise.all([
        first.addSources(mission.id, [{ kind: 'test', sourceId: 'a', label: 'Fonte A' }]),
        second.addSources(mission.id, [{ kind: 'test', sourceId: 'b', label: 'Fonte B' }]),
      ])
      await Promise.all([
        first.complete(mission.id, { response: 'Resultado definitivo.' }),
        second.advance(mission.id, 'gather'),
        second.fail(mission.id, new Error('Callback atrasado')),
        first.complete(mission.id, { response: 'Resultado atrasado.' }),
      ])
      const final = await second.get(mission.id)
      assert.equal(final?.status, 'completed')
      assert.equal(final?.progress, 100)
      assert.equal(final?.result?.rawResponse, 'Resultado definitivo.')
      assert.equal(final?.sources.length, 2)
      assert.ok(final?.steps.every(step => step.status === 'completed'))
    })
    await check('Falha de persistência desfaz transição completa e mantém snapshot anterior', async () => {
      const mission = await missions.create({ sessionId: 'rollback', prompt: 'Teste sintético de rollback' })
      await getPool().query("alter table alix_mission_event add constraint operations_reject_complete check(event_type <> 'completed') not valid")
      try {
        await assert.rejects(missions.complete(mission.id, { response: 'Não deve ser publicado.' }))
        const restored = await missions.get(mission.id)
        assert.equal(restored?.status, 'queued')
        assert.equal(restored?.progress, 0)
        assert.ok(restored?.steps.every(step => step.status === 'pending'))
        const snapshot = JSON.parse(await readFile(join(directory, `${mission.id}.json`), 'utf8'))
        assert.equal(snapshot.status, 'queued')
        assert.equal(snapshot.result, undefined)
      } finally { await getPool().query('alter table alix_mission_event drop constraint operations_reject_complete') }
    })
    await check('Erro numa fonte gera cobertura parcial sem preencher contagem com zero', async () => {
      await getPool().query('alter table cliente_demanda rename to operations_demanda_unavailable')
      try {
        const plan = await operations.overview({ clienteId: 'operations-c1' })
        assert.equal(plan.coverage.status, 'partial')
        assert.equal(plan.counts.activeDemands, null)
        assert.equal(plan.counts.openProposals, 1)
      } finally { await getPool().query('alter table operations_demanda_unavailable rename to cliente_demanda') }
    })
  } finally {
    await closeDb()
    await rm(directory, { recursive: true, force: true })
  }
  const report = { generatedAt: new Date().toISOString(), database, externalMessagesSent: 0, businessActionsExecuted: 0, results }
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2))
  console.info(JSON.stringify(report, null, 2))
  if (results.some(result => !result.passed)) process.exitCode = 1
}
