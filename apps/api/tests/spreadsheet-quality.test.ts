import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { inspectSpreadsheetQuality, formulaWithoutStringLiterals } from '../src/services/processo-assessoria/SpreadsheetQualityService.js'
import { discoverSpreadsheetFiles, deduplicateSpreadsheetFiles } from '../src/services/processo-assessoria/SpreadsheetIntelligenceService.js'

async function workbook(options: { cells: string; state?: string; names?: string; external?: boolean; macro?: boolean; secondSheet?: string }): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('xl/workbook.xml', `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Dados" sheetId="1" r:id="rId1" state="${options.state ?? 'visible'}"/>${options.secondSheet ? '<sheet name="Apoio" sheetId="2" r:id="rId2" state="veryHidden"/>' : ''}</sheets><definedNames>${options.names ?? ''}</definedNames>${options.external ? '<externalReferences><externalReference r:id="rExt"/></externalReferences>' : ''}<calcPr calcMode="manual"/></workbook>`)
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>')
  zip.file('xl/worksheets/sheet1.xml', `<worksheet><dimension ref="A1:XFD1048576"/><sheetData><row r="1">${options.cells}</row></sheetData></worksheet>`)
  if (options.secondSheet) zip.file('xl/worksheets/sheet2.xml', `<worksheet><sheetData><row r="2">${options.secondSheet}</row></sheetData></worksheet>`)
  if (options.macro) zip.file('xl/vbaProject.bin', Buffer.from('not executable test data'))
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('qualidade estrutural de planilhas', () => {
  it('inspeciona abas ocultas e células reais sem confiar na dimensão estilizada', async () => {
    const result = await inspectSpreadsheetQuality(await workbook({
      state: 'hidden', cells: '<c r="A1" t="inlineStr"><is><t>Nome</t></is></c><c r="B1"><f>1+1</f><v>2</v></c><c r="XFD1048576" s="3"/>',
      secondSheet: '<c r="C2"><f>Dados!B1</f><v>2</v></c>',
    }), 'exemplo.xlsx')
    expect(result.quality).toMatchObject({ inspected: true, status: 'inspected', hiddenSheets: 2, macrosPresent: false, calculationMode: 'manual' })
    expect(result.sheets).toMatchObject([{ visibility: 'hidden', rows: 1, columns: 2, formulas: 1, populatedCells: 2 }, { visibility: 'veryHidden', rows: 2, columns: 3, formulas: 1, populatedCells: 1 }])
  })

  it('distingue fórmula quebrada, cache com erro, erro constante e texto literal', async () => {
    const result = await inspectSpreadsheetQuality(await workbook({ cells: [
      '<c r="A1" t="e"><f>SUM(#REF!)</f><v>#REF!</v></c>',
      '<c r="B1" t="str"><f>IF(1=1,"#REF!","#NAME?")</f><v>#REF!</v></c>',
      '<c r="C1" t="inlineStr"><is><t>=#REF! e =1/0</t></is></c>',
      '<c r="D1" t="e"><v>#VALUE!</v></c>',
      '<c r="E1" t="e"><f>1/0</f><v>#DIV/0!</v></c>',
    ].join('') }), 'erros.xlsx')
    expect(result.quality).toMatchObject({ status: 'review-required', cachedFormulaErrors: 2, brokenFormulaReferences: 1, literalErrorCells: 1, missingFormulaCaches: 0 })
    expect(result.sheets[0].formulas).toBe(3)
  })

  it('preserva cache zero e string vazia sem confundir com cache numérico ausente', async () => {
    const result = await inspectSpreadsheetQuality(await workbook({ cells: [
      '<c r="A1"><f>0</f><v>0</v></c>',
      '<c r="B1"><f>1</f></c>',
      '<c r="C1"><f>1</f><v/></c>',
      '<c r="D1" t="str"><f>""</f><v/></c>',
    ].join('') }), 'caches.xlsx')
    expect(result.quality.missingFormulaCaches).toBe(2)
    expect(result.quality.samples.filter((s) => s.code === 'missing-formula-cache').map((s) => s.cell)).toEqual(['B1', 'C1'])
  })

  it('conta fórmulas compartilhadas e propaga referência inválida do grupo', async () => {
    const result = await inspectSpreadsheetQuality(await workbook({ cells: '<c r="A1"><f t="shared" si="0" ref="A1:B1">#REF!+1</f><v>1</v></c><c r="B1"><f t="shared" si="0"/><v>2</v></c>' }), 'compartilhadas.xlsx')
    expect(result.sheets[0]).toMatchObject({ formulas: 2, brokenFormulaReferences: 2 })
  })

  it('detecta vínculo externo real sem marcar tabela estruturada nem link escrito como texto', async () => {
    const result = await inspectSpreadsheetQuality(await workbook({ external: true, cells: [
      '<c r="A1"><f>\'[1]Origem\'!B2</f><v>1</v></c>',
      '<c r="B1"><f>SUM(Tabela[Valor])</f><v>1</v></c>',
      '<c r="C1" t="str"><f>"[1]Origem!B2"</f><v>texto</v></c>',
    ].join('') }), 'externo.xlsx')
    expect(result.quality.externalFormulaCells).toBe(1)
    expect(result.quality.externalLinks).toBe(1)
    expect(result.quality.limitations.join(' ')).toContain('Vínculos externos não acessados')
  })

  it('conta nomes quebrados e identifica VBA pela entrada real, não apenas extensão', async () => {
    const buffer = await workbook({ cells: '<c r="A1"><v>1</v></c>', names: '<definedName name="ruim">Dados!#REF!</definedName><definedName name="texto">"#REF!"</definedName>', macro: true })
    const result = await inspectSpreadsheetQuality(buffer, 'macro.xlsx')
    expect(result.quality).toMatchObject({ macrosPresent: true, definedNames: 2, brokenDefinedNames: 1 })
    const noVba = await inspectSpreadsheetQuality(await workbook({ cells: '<c r="A1"><v>1</v></c>' }), 'sem-projeto.xlsm')
    expect(noVba.quality.macrosPresent).toBe(false)
  })

  it('reporta XLS legado e arquivo danificado sem alegar inspeção nem inventar resultados', async () => {
    expect((await inspectSpreadsheetQuality(Buffer.from('BIFF'), 'legado.xls')).quality).toMatchObject({ inspected: false, status: 'conversion-required', macrosPresent: null })
    expect((await inspectSpreadsheetQuality(Buffer.from('invalid ZIP'), 'danificado.xlsx')).quality).toMatchObject({ inspected: false, status: 'unreadable' })
    expect((await inspectSpreadsheetQuality(Buffer.from('binary'), 'arquivo.xlsb')).quality).toMatchObject({ inspected: false, status: 'conversion-required', format: 'unsupported' })
  })

  it('limita exemplos sem truncar a contagem completa de falhas', async () => {
    const result = await inspectSpreadsheetQuality(await workbook({ cells: Array.from({ length: 40 }, (_, i) => `<c r="A${i + 1}" t="e"><f>1/0</f><v>#DIV/0!</v></c>`).join('') }), 'muitos-erros.xlsx')
    expect(result.quality.cachedFormulaErrors).toBe(40)
    expect(result.quality.samples.filter((s) => s.code === 'cached-error:#DIV/0!')).toHaveLength(8)
  })

  it('respeita aspas escapadas do Excel ao remover texto literal', () => {
    expect(formulaWithoutStringLiterals('IF(A1="valor ""#REF!""",#REF!,"[1]Origem!A1")')).toBe('IF(A1="",#REF!,"")')
  })
})

describe('inventário por conteúdo', () => {
  const directories: string[] = []
  afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })

  it('inclui originais numerados, revisão, atualizados, pasta novos, templates e arquivos diretos', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'aletis-spreadsheet-audit-')); directories.push(parent)
    const project = join(parent, 'system')
    const original = join(project, 'documentos/processo-assessoria/originais')
    const templates = join(project, 'apps/api/src/services/processo-assessoria/templates')
    for (const dir of [original, join(original, 'novos'), join(original, '22.08.25 - atualizados'), templates]) await mkdir(dir, { recursive: true })
    const files = [join(original, 'Simulador v16 (1).xlsm'), join(original, 'Registro (v.01 em rev).xlsm'), join(original, 'novos/FARMS.xlsx'), join(original, '22.08.25 - atualizados/cadastro.xlsx'), join(templates, 'cadastro.xlsx'), join(parent, 'QUADRO.xls')]
    for (const file of files) await writeFile(file, 'content')
    await writeFile(join(original, '~$Excel.xlsx'), 'temporary lock')
    expect(discoverSpreadsheetFiles(project)).toEqual(files.sort())
  })

  it('deduplica somente bytes idênticos e preserva versões de mesmo nome com valores distintos', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aletis-spreadsheet-sha-')); directories.push(directory)
    const paths = ['Modelo.xlsx', 'Modelo (1).xlsx', 'Modelo (2).xlsx'].map((name) => join(directory, name))
    await writeFile(paths[0], 'original'); await writeFile(paths[1], 'original'); await writeFile(paths[2], 'versão distinta')
    const result = await deduplicateSpreadsheetFiles(paths)
    expect(result).toHaveLength(2)
    expect(result[0].sourcePaths).toEqual(paths.slice(0, 2))
    expect(result[1].sourcePaths).toEqual(paths.slice(2))
    expect(result.every((group) => /^[a-f0-9]{64}$/.test(group.sha256))).toBe(true)
  })
})
