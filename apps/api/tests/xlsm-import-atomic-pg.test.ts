import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import ExcelJS from 'exceljs'
import * as schema from '../src/db/schema.js'
import { importarDeXlsm } from '../src/services/gestao-financeira/XlsmImporter.js'

let pool: pg.Pool, admin: pg.Pool
let db: ReturnType<typeof drizzle<typeof schema>>
const fixtureSchema = `xlsm_import_${randomUUID().replaceAll('-', '')}`
const { publish } = vi.hoisted(() => ({ publish: vi.fn() }))
vi.mock('../src/services/gestao-financeira/GfEventBus.js', () => ({ publish }))
vi.mock('../src/db/client.js', () => ({ isPgEnabled: () => true, getDb: () => db }))

const tables = ['gf_grupo', 'gf_membro', 'gf_cultura_safra', 'gf_custo_safra', 'gf_demanda', 'gf_contrato_divida', 'gf_ativo_fazenda', 'gf_ativo_outro', 'gf_passivo_outro', 'gf_garantia', 'gf_premissa', 'gf_insight', 'gf_snapshot_calculo', 'gf_changelog']
const input = { grupoId: 'grupo-fixture', replaceExisting: true }
async function workbook(cost = '100.01', complete = true, edit?: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  for (const name of ['3 - Cadastro', '5 - Demandas', '10 - Endividamento', '8 - Ativos', '7 - Safra', '6 - Custos do Cliente']) wb.addWorksheet(name)
  if (complete) for (const name of ['11 - Passivos', '14 - Garantias', '10.1 - Premissas Endividamento', '13 - PREMISSAS(PADRONIZAR)', '15 - Premissas e Suporte']) wb.addWorksheet(name)
  const cad = wb.getWorksheet('3 - Cadastro')!; cad.getCell('C21').value = 'Novo membro'; cad.getCell('D17').value = 'Grupo importado'
  const costs = wb.getWorksheet('6 - Custos do Cliente')!; costs.getCell('D13').value = '2026/27'; costs.getCell('D75').value = 'Despesa de teste'; costs.getCell('E75').value = cost
  edit?.(wb)
  return Buffer.from(await wb.xlsx.writeBuffer())
}
async function snapshot() {
  const result: Record<string, unknown[]> = {}
  for (const table of tables) result[table] = (await pool.query(`SELECT to_jsonb(t) AS payload FROM "${table}" t ORDER BY id`)).rows.map((r) => r.payload)
  return result
}

describe('importação R.OP.001 transacional em PostgreSQL descartável', () => {
  beforeAll(async () => {
    const url = (await readFile('/tmp/aletis-drive-corpus-fixture-url', 'utf8')).trim()
    const parsed = new URL(url)
    if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.port !== '55436' || parsed.pathname !== '/aletis_implementation_fixture') throw new Error('Fixture PostgreSQL não autorizada')
    admin = new pg.Pool({ connectionString: url, max: 1 })
    await admin.query(`CREATE SCHEMA "${fixtureSchema}"`)
    pool = new pg.Pool({ connectionString: url, max: 2, options: `-c search_path=${fixtureSchema}` })
    for (const file of ['0012_gestao_financeira.sql', '0013_gestao_financeira_v2.sql', '0014_gestao_financeira_wave_f.sql', '0015_gestao_financeira_wave_g.sql', '0019_custos_rop010_fields.sql']) await pool.query(await readFile(new URL(`../src/db/migrations/${file}`, import.meta.url), 'utf8'))
    db = drizzle(pool, { schema })
  }, 30000)
  beforeEach(async () => {
    await pool.query('DROP TRIGGER IF EXISTS reject_fixture_cost ON gf_custo_safra; DROP TRIGGER IF EXISTS reject_fixture_audit ON gf_changelog')
    await pool.query(`TRUNCATE ${tables.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY`)
    await pool.query("INSERT INTO gf_grupo(id, cliente_id, nome_grupo, data_base) VALUES ('grupo-fixture','cliente-fixture','Grupo anterior','2026-01-01'),('grupo-outro','cliente-outro','Outro cliente','2026-01-01')")
    await pool.query("INSERT INTO gf_membro(id, grupo_id, nome) VALUES ('membro-antigo','grupo-fixture','Membro anterior'),('membro-outro','grupo-outro','Membro outro cliente')")
    await pool.query("INSERT INTO gf_custo_safra(id, grupo_id, safra, tipo, descricao, valor_anual) VALUES ('custo-antigo','grupo-fixture','2025/26','fixo','Custo anterior','123.45')")
    publish.mockClear()
  })
  afterAll(async () => {
    await pool?.end()
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${fixtureSchema}" CASCADE`); await admin.end() }
  })

  it('falha tardia desfaz limpeza, cabeçalho, linhas já inseridas e changelog', async () => {
    const before = await snapshot()
    await pool.query("CREATE OR REPLACE FUNCTION reject_cost_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.descricao = 'Despesa de teste' THEN RAISE EXCEPTION 'falha de fixture'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_fixture_cost BEFORE INSERT ON gf_custo_safra FOR EACH ROW EXECUTE FUNCTION reject_cost_fixture()")
    await expect(importarDeXlsm({ ...input, buffer: await workbook() })).rejects.toMatchObject({ cause: { message: 'falha de fixture' } })
    expect(await snapshot()).toEqual(before)
    expect(publish).not.toHaveBeenCalled()
  })

  it('falha do registro de auditoria também reverte toda a importação', async () => {
    const before = await snapshot()
    await pool.query("CREATE OR REPLACE FUNCTION reject_audit_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entidade = 'importacao_xlsm' THEN RAISE EXCEPTION 'auditoria indisponivel'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_fixture_audit BEFORE INSERT ON gf_changelog FOR EACH ROW EXECUTE FUNCTION reject_audit_fixture()")
    await expect(importarDeXlsm({ ...input, buffer: await workbook() })).rejects.toMatchObject({ cause: { message: 'auditoria indisponivel' } })
    expect(await snapshot()).toEqual(before)
    expect(publish).not.toHaveBeenCalled()
  })

  it('planilha incompatível ou valor inválido não inicia limpeza nem altera o grupo', async () => {
    const before = await snapshot()
    await expect(importarDeXlsm({ ...input, buffer: await workbook('100.01', false) })).rejects.toThrow('Substituição exige')
    await expect(importarDeXlsm({ ...input, buffer: await workbook('12abc') })).rejects.toThrow('número completo')
    expect(await snapshot()).toEqual(before)
    expect(publish).not.toHaveBeenCalled()
  })

  it('preserva passivo e premissa anteriores quando a substituição omite conteúdo material', async () => {
    await pool.query("INSERT INTO gf_passivo_outro(id,grupo_id,tipo,descricao,valor) VALUES ('arrendamento-antigo','grupo-fixture','arrendamento','Contrato anterior','12345.67')")
    await pool.query("INSERT INTO gf_premissa(id,grupo_id,chave,rotulo,valor) VALUES ('premissa-antiga','grupo-fixture','taxa','Taxa','0.12')")
    const before = await snapshot()
    const lease = await workbook('100.01', true, (wb) => { wb.getWorksheet('11 - Passivos')!.getCell('AV22').value = 'Fazenda sem montante mapeado' })
    await expect(importarDeXlsm({ ...input, buffer: lease })).rejects.toThrow('passivos existentes foram preservados')
    const premise = await workbook('100.01', true, (wb) => { const ws = wb.getWorksheet('15 - Premissas e Suporte')!; ws.getCell('A1').value = 'Taxa'; ws.getCell('B1').value = { formula: '1/0', result: { error: '#DIV/0!' } } })
    await expect(importarDeXlsm({ ...input, buffer: premise })).rejects.toThrow('15 - Premissas e Suporte!B1')
    expect(await snapshot()).toEqual(before)
    expect(publish).not.toHaveBeenCalled()
  })

  it('confirma registros, centavos e auditoria juntos e preserva outro cliente', async () => {
    const result = await importarDeXlsm({ ...input, buffer: await workbook() })
    expect(result.grupo.nomeGrupo).toBe('Grupo importado')
    expect(result.imported).toMatchObject({ membros: 1, custos: 1 })
    const costs = (await pool.query("SELECT valor_anual, valor_mensal FROM gf_custo_safra WHERE grupo_id='grupo-fixture'")).rows
    expect(costs).toEqual([{ valor_anual: '100.0100', valor_mensal: '8.3300' }])
    expect((await pool.query("SELECT nome FROM gf_membro WHERE grupo_id='grupo-outro'")).rows).toEqual([{ nome: 'Membro outro cliente' }])
    const audit = (await pool.query("SELECT entidade, acao, origem FROM gf_changelog WHERE grupo_id='grupo-fixture' ORDER BY id")).rows
    expect(audit.some((row) => row.entidade === 'membro' && row.acao === 'delete' && row.origem === 'import')).toBe(true)
    expect(audit.at(-1)).toEqual({ entidade: 'importacao_xlsm', acao: 'create', origem: 'import' })
    expect(publish).toHaveBeenCalledTimes(1)
  })
})
