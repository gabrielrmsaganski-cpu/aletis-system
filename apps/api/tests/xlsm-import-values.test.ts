import { describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { load } from 'cheerio'
import { prepareXlsmImport } from '../src/services/gestao-financeira/XlsmImporter.js'
import { parseImportDecimal, importAnnualToMonthly, XlsmValueReader } from '../src/services/gestao-financeira/XlsmImportValues.js'
import type { GfGrupo } from '../src/db/schema.js'

vi.mock('../src/db/client.js', () => ({ isPgEnabled: () => false, getDb: () => { throw new Error('A preparação não deve acessar o banco') } }))

const group = { id: 'gf-fixture', clienteId: 'cliente-fixture', nomeGrupo: 'Grupo anterior', dataBase: '2026-01-01', historico: null } as GfGrupo
const sheets = ['3 - Cadastro', '5 - Demandas', '10 - Endividamento', '8 - Ativos', '7 - Safra', '6 - Custos do Cliente']
async function fixture(edit?: (workbook: ExcelJS.Workbook) => void, complete = false): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  for (const name of sheets) workbook.addWorksheet(name)
  if (complete) for (const name of ['11 - Passivos', '14 - Garantias', '10.1 - Premissas Endividamento', '13 - PREMISSAS(PADRONIZAR)', '15 - Premissas e Suporte']) workbook.addWorksheet(name)
  workbook.getWorksheet('3 - Cadastro')!.getCell('C21').value = 'Pessoa do teste'
  edit?.(workbook)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

describe('valores exatos do importador R.OP.001', () => {
  it.each([
    ['12.34', '12.34'], ['1.234', '1234'], ['1.234,56', '1234.56'], ['R$ 1.234,56', '1234.56'],
    ['0.123', '0.123'], ['(1.234,56)', '-1234.56'], ['0', '0'], ['99999999999999,99', '99999999999999.99'],
  ])('interpreta %s de maneira completa', (source, expected) => expect(parseImportDecimal(source)).toBe(expected))

  it.each(['12abc', '12.34.56', '10%', '1,234.56', 'Infinity', 'NaN', '--1', '1 000', true, { result: 12 }])('rejeita conteúdo numérico ambíguo/inválido %s', (source) => expect(() => parseImportDecimal(source)).toThrow())

  it('preserva números XML, cache zero e ausência como estados distintos', () => {
    expect(parseImportDecimal('1.234', 'A1', true)).toBe('1.234')
    expect(parseImportDecimal('1.23456789E-5', 'A1', true)).toBe('0.0000123456789')
    expect(parseImportDecimal(null)).toBeNull()
    expect(parseImportDecimal('')).toBeNull()
    expect(importAnnualToMonthly('100.01')).toBe('8.33')
    expect(importAnnualToMonthly('99999999999999.99')).toBe('8333333333333.33')
  })

  it('não transforma datas inválidas nem booleanos parciais em valores plausíveis', () => {
    const cell = new ExcelJS.Workbook().addWorksheet('Dados').getCell('A1'), reader = new XlsmValueReader()
    cell.value = '31/02/2026'; expect(() => reader.date(cell)).toThrow('data inexistente')
    cell.value = '29/02/2024'; expect(reader.date(cell)).toBe('2024-02-29')
    cell.value = 'sem informação'; expect(() => reader.boolean(cell)).toThrow('Sim ou Não')
    cell.value = 'Não'; expect(reader.boolean(cell)).toBe(false)
  })

  it('prepara valores monetários a partir do XML sem perder centavos antes da importação', async () => {
    const buffer = await fixture((wb) => { const ws = wb.getWorksheet('5 - Demandas')!; ws.getCell('F19').value = 'Credor de teste'; ws.getCell('I19').value = 1 })
    const zip = await JSZip.loadAsync(buffer)
    const xml = load(await zip.file('xl/worksheets/sheet2.xml')!.async('string'), { xmlMode: true })
    xml('c[r="I19"] > v').text('99999999999999.99')
    zip.file('xl/worksheets/sheet2.xml', xml.xml())
    const plan = await prepareXlsmImport({ grupoId: group.id, buffer: await zip.generateAsync({ type: 'nodebuffer' }) }, group)
    expect(plan.operations.find((op) => op.method === 'upsertDemanda')?.payload.valor).toBe('99999999999999.99')
    expect(plan.imported).toMatchObject({ membros: 1, demandas: 1 })
  })

  it('rejeita fórmula sem cache e erro de fórmula no endereço importado antes de qualquer escrita', async () => {
    for (const value of [{ formula: '1+1' }, { formula: '1/0', result: { error: '#DIV/0!' } }]) {
      const buffer = await fixture((wb) => { const ws = wb.getWorksheet('5 - Demandas')!; ws.getCell('F19').value = 'Credor'; ws.getCell('I19').value = value as ExcelJS.CellValue })
      await expect(prepareXlsmImport({ grupoId: group.id, buffer }, group)).rejects.toThrow('5 - Demandas!I19')
    }
  })

  it('preserva resultado zero explícito e não inclui erro em aba de relatório não mapeada', async () => {
    const buffer = await fixture((wb) => {
      const ws = wb.getWorksheet('5 - Demandas')!; ws.getCell('F19').value = 'Credor'; ws.getCell('I19').value = { formula: '0', result: 0 }
      wb.addWorksheet('RELATÓRIO').getCell('A1').value = { formula: '1/0', result: { error: '#DIV/0!' } }
    })
    const plan = await prepareXlsmImport({ grupoId: group.id, buffer }, group)
    expect(plan.operations.find((op) => op.method === 'upsertDemanda')?.payload.valor).toBe('0')
  })

  it('rejeita layout incorreto e substituição incompleta', async () => {
    const invalid = new ExcelJS.Workbook(); invalid.addWorksheet('Cadastro')
    await expect(prepareXlsmImport({ grupoId: group.id, buffer: Buffer.from(await invalid.xlsx.writeBuffer()) }, group)).rejects.toThrow('Abas obrigatórias ausentes')
    await expect(prepareXlsmImport({ grupoId: group.id, buffer: await fixture(), replaceExisting: true }, group)).rejects.toThrow('Substituição exige')
    await expect(prepareXlsmImport({ grupoId: group.id, buffer: await fixture(), versao: 'v1' }, group)).rejects.toThrow('v1 ainda não tem mapeamento')
  })

  it('exige valor de passivo nomeado e safra de custo antes de importar', async () => {
    const supplier = await fixture((wb) => { wb.getWorksheet('11 - Passivos')!.getCell('AM22').value = 'Fornecedor' }, true)
    await expect(prepareXlsmImport({ grupoId: group.id, buffer: supplier }, group)).rejects.toThrow('valor obrigatório não informado')
    const cost = await fixture((wb) => { const ws = wb.getWorksheet('6 - Custos do Cliente')!; ws.getCell('D75').value = 'Despesa'; ws.getCell('E75').value = '100,01' })
    await expect(prepareXlsmImport({ grupoId: group.id, buffer: cost }, group)).rejects.toThrow('safra dos custos não informada')
  })

  it('mensaliza com Decimal e registra arrendamento sem inventar passivo de valor zero', async () => {
    const buffer = await fixture((wb) => {
      const cost = wb.getWorksheet('6 - Custos do Cliente')!; cost.getCell('D13').value = '2026/27'; cost.getCell('D75').value = 'Despesa'; cost.getCell('E75').value = '100,01'
      wb.getWorksheet('11 - Passivos')!.getCell('AV22').value = 'Fazenda arrendada'
    }, true)
    const plan = await prepareXlsmImport({ grupoId: group.id, buffer }, group)
    expect(plan.operations.find((op) => op.method === 'upsertCusto')?.payload).toMatchObject({ safra: '2026/27', valorAnual: '100.01', valorMensal: '8.33' })
    expect(plan.imported.passivosOutros).toBe(0)
    expect(plan.warnings.join(' ')).toContain('nenhum passivo de valor zero foi criado')
    await expect(prepareXlsmImport({ grupoId: group.id, buffer, replaceExisting: true }, group)).rejects.toThrow('passivos existentes foram preservados')
  })

  it('não substitui premissas rotuladas quando o cache da fonte está defeituoso', async () => {
    for (const value of [{ formula: '1+1' }, { formula: '1/0', result: { error: '#DIV/0!' } }]) {
      const buffer = await fixture((wb) => { const ws = wb.getWorksheet('15 - Premissas e Suporte')!; ws.getCell('A1').value = 'Taxa de referência'; ws.getCell('B1').value = value as ExcelJS.CellValue }, true)
      await expect(prepareXlsmImport({ grupoId: group.id, buffer, replaceExisting: true }, group)).rejects.toThrow('15 - Premissas e Suporte!B1')
    }
  })
})
