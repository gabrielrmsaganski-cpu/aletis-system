import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { parseCsv, parseXlsx } from '../../src/services/alix/intake/XlsxParser.js'

describe('planilhas inteiramente recuperáveis', () => {
  it('indexa linha 451 e preserva linha/aba de origem após a antiga linha 200', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Garantias')
    sheet.addRow(['Contrato', 'Observação'])
    for (let i = 0; i < 450; i++) sheet.addRow([`contrato-${i}`, i === 449 ? 'Hipoteca extraordinária no final' : 'Condição comum'])
    const parsed = await parseXlsx(Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer))
    expect(parsed.extractedText).toContain('Hipoteca extraordinária no final')
    const last = parsed.chunks?.find(chunk => chunk.text.includes('Hipoteca extraordinária no final'))
    expect(last).toMatchObject({ sheet: 'Garantias', metadata: { rowStart: 441, rowEnd: 451 } })
    expect(parsed.metadata?.extractionCoverage).toMatchObject({ status: 'complete', totalRows: 451, extractedRows: 451 })
  })
  it('preserva preâmbulo, coluna fora do cabeçalho e última linha esparsa', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Patrimônio')
    sheet.getCell('A1').value = 'Responsável: Titular Sintético'
    sheet.getRow(3).values = ['Descrição', 'Valor', 'Referência']
    sheet.getCell('A500').value = 'Bem na linha final'
    sheet.getCell('D500').value = 'Garantia em coluna sem título'
    const parsed = await parseXlsx(Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer))
    expect(parsed.extractedText).toContain('Responsável: Titular Sintético')
    expect(parsed.extractedText).toContain('Bem na linha final')
    expect(parsed.extractedText).toContain('Garantia em coluna sem título')
    expect(parsed.metadata?.extractionCoverage).toMatchObject({ status: 'complete', totalRows: 500, extractedRows: 500 })
  })
  it('CSV lê além de 200 linhas com ponto e vírgula, decimal e campo multilinha', async () => {
    const csv = 'Contrato;Valor;Nota\r\n' + Array.from({ length: 249 }, (_, index) => `C${index};123,45;Normal`).join('\r\n') + '\r\nFINAL;999,99;"Primeira linha\nSegunda; com ""aspas"""'
    const parsed = await parseCsv(Buffer.from(csv))
    expect(parsed.extractedText).toContain('FINAL')
    expect(parsed.extractedText).toContain('999,99')
    expect(parsed.extractedText).toContain('Segunda; com "aspas"')
    expect(parsed.metadata?.extractionCoverage).toMatchObject({ status: 'complete', totalRows: 251, extractedRows: 251 })
    expect(parsed.chunks?.at(-1)?.metadata).toMatchObject({ rowStart: 241, rowEnd: 251 })
  })
  it('rejeita aspas não fechadas em vez de descartar o restante do arquivo', async () => {
    await expect(parseCsv(Buffer.from('nome,nota\nA,"campo sem fim'))).rejects.toThrow('aspas')
  })
  it('não declara cobertura completa quando ultrapassa orçamento de extração', async () => {
    const parsed = await parseCsv(Buffer.from('nome,nota\n' + Array.from({ length: 250 }, (_, index) => `${index},${'x'.repeat(10000)}`).join('\n')))
    expect(parsed.metadata?.extractionCoverage).toMatchObject({ status: 'partial', totalRows: 251 })
    expect((parsed.metadata?.extractionCoverage as { limitations: string[] }).limitations.join(' ')).toContain('orçamento')
  })
})
