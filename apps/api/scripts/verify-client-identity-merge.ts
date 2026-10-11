/** Prova isolada de consolidação, concorrência e memória. Nunca aceita banco de produção. */
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { applyIdentityMerge, prepareIdentityMerge } from '../src/services/core/ClientIdentityMergeService.js'

const supplied = new URL(process.env.DATABASE_URL || 'postgresql://invalid/')
if (supplied.hostname !== '127.0.0.1' || supplied.port !== '55436' || supplied.pathname !== '/aletis_implementation_fixture' || process.env.ALETIS_CLIENT_IDENTITY_FIXTURE !== '1') throw new Error('Exige fixture local explícita 55436 e ALETIS_CLIENT_IDENTITY_FIXTURE=1.')
const schema = `client_identity_fixture_${randomUUID().replaceAll('-', '')}`
const admin = new pg.Pool({ connectionString: supplied.toString(), max: 1 })
const scoped = new URL(supplied); scoped.searchParams.set('options', `-c search_path=${schema}`)
process.env.DATABASE_URL = scoped.toString(); process.env.ALETIS_PG_ENABLED = '1'
const pool = new pg.Pool({ connectionString: scoped.toString(), max: 4 })
const directory = await mkdtemp(join(tmpdir(), 'aletis-identity-fixture-'))
const oldCwd = process.cwd(); process.chdir(directory)
const [{ closeDb }, repository, memories, { AlixMemoryService }] = await Promise.all([import('../src/db/client.js'), import('../src/db/ClienteRepository.js'), import('../src/db/AlixMemoryRepository.js'), import('../src/services/alix/memory/AlixMemoryService.js')])
const source = { id: 'former', nome: 'Pessoa Sintética', cpfCnpj: '000.000.000-00', estagio: 'analise', valorTotalDivida: '9999.99', valorTotalPago: '1000.00', dividas: [{ contrato: '123456' }, { contrato: '456789' }], pagamentos: [{ valor: '9999.99' }], telefone: 'inventado', cidade: 'inventada', timeline: [{ data: '2025-01-01', descricao: 'Histórico anterior' }], googleDriveInventory: { totalFiles: 4 } }
const canonical = { id: 'current', nome: 'Pessoa Sintética', cpfCnpj: '52998224725', estagio: 'analise', valorTotalDivida: '1234.56', valorTotalPago: '0.00', dividas: [], pagamentos: [], telefone: 'real', cidade: 'documental', tags: ['duplicidade_potencial'], observacoes: 'Contrato(s): 123456, 456789.', timeline: [{ data: '2026-01-01', descricao: 'Original' }] }
const memory = (id: string, name = 'Pessoa Sintética') => ({ clienteId: id, clienteNome: name, atualizadoEm: '2026-09-07T10:00:00Z', perfil: [`perfil ${id}`], alertas: [], decisoes: [], historico: [{ data: '2026-01-01', texto: `history ${id}` }], dividasAtivas: [], proximasAcoes: [] })
const results: Array<{ name: string; passed: boolean; error?: string }> = []
async function check(name: string, run: () => Promise<void>) { try { await reset(); await run(); results.push({ name, passed: true }) } catch (error) { results.push({ name, passed: false, error: error instanceof Error ? error.message : String(error) }) } }
async function reset() {
  await pool.query('truncate audit_log,alix_memory,alix_memory_fact,alix_session,alix_automation_suggestion,client_google_drive_folder,finance_reference,cliente cascade')
  for (const client of [source, canonical]) await pool.query('insert into cliente(id,nome,cpf_cnpj,estagio,payload,valor_total_divida,valor_total_pago) values($1,$2,$3,$4,$5::jsonb,$6,$7)', [client.id, client.nome, client.cpfCnpj, client.estagio, JSON.stringify(client), client.valorTotalDivida, client.valorTotalPago])
  for (const id of ['former', 'current']) await pool.query('insert into alix_memory(cliente_id,cliente_nome,payload) values($1,$2,$3::jsonb)', [id, 'Pessoa Sintética', JSON.stringify(memory(id))])
  await pool.query("insert into alix_session values('session','former','owner','Historical description former')")
  await pool.query("insert into finance_reference values('financial','former','999999999999.99')")
  await pool.query("insert into client_google_drive_folder values('folder','org-test','former','drive-folder')")
  await pool.query("insert into alix_automation_suggestion values('suggestion','former',$1::jsonb)", [JSON.stringify({ payload: { clienteId: 'former' }, explanation: 'Original former' })])
}
const prepare = () => prepareIdentityMerge(pool, { sourceId: 'former', canonicalId: 'current', reason: 'Consolidação autorizada de identidade confirmada por contratos.' })
const apply = async (plan?: Awaited<ReturnType<typeof prepare>>) => applyIdentityMerge(pool, plan ?? await prepare(), { actor: 'fixture-owner', maintenanceMode: true })
try {
  await admin.query(`create schema ${schema}`)
  await pool.query(`create table cliente(id text primary key,nome text not null,cpf_cnpj text not null,cidade text,uf varchar(2),telefone text,email text,estagio text not null,consultor text,escritorio text,credor text,valor_total_divida numeric(18,2),valor_total_pago numeric(18,2),area_total_ha numeric(12,2),culturas text[],data_cadastro timestamptz,ultima_atualizacao timestamptz,payload jsonb not null,criado_em timestamptz default now(),atualizado_em timestamptz default now(),organization_id text not null default 'org-test',office_id text,responsible_user_id text);
    create table alix_memory(cliente_id text primary key,cliente_nome text not null check(cliente_nome<>'reject-fixture'),atualizado_em timestamptz default now(),payload jsonb not null);
    create table alix_session(id text primary key,cliente_id text references cliente(id),consultor_id text,content text);
    create table finance_reference(id text primary key,client_id text references cliente(id),amount numeric(18,2));
    create table client_google_drive_folder(id text primary key,tenant_id text,client_id text references cliente(id),folder_id text,unique(tenant_id,client_id));
    create table alix_automation_suggestion(id text primary key,cliente_id text,proposed_action jsonb);
    create table alix_memory_fact(id text primary key,cliente_id text,fact_key text,unique(cliente_id,fact_key));
    create table audit_log(id bigserial primary key,ator text,acao text check(ator<>'reject-audit'),recurso text,dados_antes jsonb,dados_depois jsonb);`)
  await check('preserva cliente arquivado, todos os IDs e valores financeiros, autoria e histórico', async () => {
    const report = await apply()
    const rows = (await pool.query('select * from cliente order by id')).rows
    assert.equal(rows.length, 2); assert.equal(rows.find(row => row.id === 'former').payload.identityMerge.canonicalId, 'current')
    const current = rows.find(row => row.id === 'current'); assert.equal(current.valor_total_divida, '1234.56'); assert.deepEqual(current.payload.dividas, [])
    assert.equal((await pool.query('select amount from finance_reference')).rows[0].amount, '999999999999.99')
    assert.deepEqual((await pool.query('select * from alix_session')).rows[0], { id: 'session', cliente_id: 'current', consultor_id: 'owner', content: 'Historical description former' })
    const suggestion = (await pool.query('select proposed_action from alix_automation_suggestion')).rows[0].proposed_action
    assert.equal(suggestion.payload.clienteId, 'current'); assert.equal(suggestion.explanation, 'Original former')
    assert.equal((await pool.query('select count(*) from audit_log')).rows[0].count, '1')
    assert.equal((await pool.query('select count(*) from alix_memory')).rows[0].count, '1')
    assert.equal(report.mergedMemory.identityMergeArchives[0].original.payload.clienteId, 'former')
  })
  await check('falha na auditoria reverte todos os vínculos e valores', async () => {
    const plan = await prepare(); await assert.rejects(applyIdentityMerge(pool, plan, { actor: 'reject-audit', maintenanceMode: true }))
    assert.equal((await pool.query('select cliente_id from alix_session')).rows[0].cliente_id, 'former')
    assert.equal((await pool.query('select count(*) from alix_memory')).rows[0].count, '2')
    assert.equal((await pool.query("select payload->'identityMerge' merged from cliente where id='former'")).rows[0].merged, null)
  })
  await check('mudança após preparação impede mescla e preserva alteração concorrente', async () => {
    const plan = await prepare(); await pool.query("update alix_session set content='Concurrent update' where id='session'")
    await assert.rejects(apply(plan), /desatualizado/)
    assert.equal((await pool.query('select cliente_id from alix_session')).rows[0].cliente_id, 'former')
  })
  await check('nova referência depois do plano impede mescla parcial', async () => {
    const plan = await prepare(); await pool.query("insert into alix_session values('later','former','owner','later')")
    await assert.rejects(apply(plan), /desatualizado/)
  })
  await check('colisão de unicidade entre fatos bloqueia sem perder memória', async () => {
    await pool.query("insert into alix_memory_fact values('a','former','key'),('b','current','key')")
    await assert.rejects(apply())
    assert.equal((await pool.query('select count(*) from alix_memory_fact')).rows[0].count, '2')
    assert.equal((await pool.query('select cliente_id from alix_session')).rows[0].cliente_id, 'former')
  })
  await check('duas aplicações concorrentes produzem uma única consolidação auditada', async () => {
    const plan = await prepare(); const outcomes = await Promise.allSettled([apply(plan), apply(plan)])
    assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1)
    assert.equal((await pool.query('select count(*) from audit_log')).rows[0].count, '1')
  })
  await check('alias não reaparece na carteira nem pode ressuscitar por writer antigo', async () => {
    await apply(); assert.equal(await repository.resolveClienteId('former'), 'current')
    assert.equal((await repository.listClientes()).length, 1)
    await assert.rejects(repository.upsertClienteStrict(source), /consolidado/)
    assert.equal((await repository.listClienteAliases())[0].canonicalId, 'current')
  })
  await check('memória canônica prevalece sobre Markdown antigo e alias lê identidade atual', async () => {
    await apply(); await mkdir(join(directory, 'storage/alix-memory'), { recursive: true }); await writeFile(join(directory, 'storage/alix-memory/current.md'), 'old markdown must not win')
    const service = new AlixMemoryService(); assert.equal((await service.get('former'))?.clienteId, 'current')
    assert.equal((await service.list()).length, 1)
    await pool.query('delete from alix_memory'); assert.equal(await service.get('current'), null)
  })
  await check('concorrência de notas usa bloqueio PostgreSQL e preserva ambas as contribuições', async () => {
    const update = (text: string) => memories.updateAlixMemoryStrict('current', previous => ({ ...previous!, historico: [...(previous!.historico as unknown[]), { data: '2026-09-07', texto: text }] }))
    await Promise.all([update('A'), update('B')]); const result = await memories.getAlixMemory('current')
    assert.deepEqual((result!.historico as any[]).slice(-2).map(item => item.texto).sort(), ['A', 'B'])
  })
  await check('erro de persistência não altera o espelho Markdown', async () => {
    const service = new AlixMemoryService(); await service.upsert('current', { alertas: ['válido'] })
    const path = join(directory, 'storage/alix-memory/current.md'), previous = createHash('sha256').update(await readFile(path)).digest('hex')
    await assert.rejects(service.upsert('current', { clienteNome: 'reject-fixture' }))
    assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), previous)
  })
  await check('aplicação exige manutenção explícita', async () => await assert.rejects(applyIdentityMerge(pool, await prepare(), { actor: 'fixture', maintenanceMode: false }), /manutenção/))
} finally {
  await pool.end(); await closeDb(); await admin.query(`drop schema if exists ${schema} cascade`); await admin.end(); process.chdir(oldCwd); await rm(directory, { recursive: true, force: true })
}
process.stdout.write(JSON.stringify({ fixture: true, productionMutations: 0, passed: results.filter(item => item.passed).length, failed: results.filter(item => !item.passed).length, results }, null, 2) + '\n')
if (results.some(item => !item.passed)) process.exitCode = 1
