import { describe, expect, it } from 'vitest'
import PizZip from 'pizzip'
import { mutateOoxmlWorkbook } from '../../../src/services/dossies-bancarios/OoxmlWorkbookWriter.js'

function workbookFixture(): Buffer {
  const zip = new PizZip()
  zip.file(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
      + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheets><sheet name="Produção " sheetId="1" r:id="rId1"/></sheets>'
      + '<calcPr calcId="191029"/></workbook>',
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" '
      + 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
      + 'Target="/xl/worksheets/sheet1.xml"/>'
      + '</Relationships>',
  )
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<?xml version="1.0" encoding="UTF-8"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetData><row r="1">'
      + '<c r="A1" s="7" t="s"><v>0</v></c>'
      + '<c r="B1" s="8"/>'
      + '<c r="C1" s="9"><f>A1*2</f><v>10</v></c>'
      + '</row></sheetData></worksheet>',
  )
  return zip.generate({ type: 'nodebuffer' }) as Buffer
}

describe('mutateOoxmlWorkbook', () => {
  it('preserva estilos e grava texto, número e fórmula sem reserializar o workbook', () => {
    const result = mutateOoxmlWorkbook(workbookFixture(), [
      { sheet: 'Produção ', address: 'A1', value: 'Soja & Milho', type: 'text', reason: 'data' },
      { sheet: 'Produção ', address: 'B1', value: 1250.5, type: 'number', reason: 'data' },
      { sheet: 'Produção ', address: 'C1', value: 'B1*2', type: 'formula', reason: 'formula' },
    ])
    const zip = new PizZip(result.buffer)
    const sheet = zip.file('xl/worksheets/sheet1.xml')?.asText() ?? ''
    const workbook = zip.file('xl/workbook.xml')?.asText() ?? ''

    expect(result.missing).toEqual([])
    expect(result.written).toBe(3)
    expect(result.formulas).toBe(1)
    expect(sheet).toContain('<c r="A1" s="7" t="inlineStr">')
    expect(sheet).toContain('Soja &amp; Milho')
    expect(sheet).toContain('<c r="B1" s="8"><v>1250.5</v></c>')
    expect(sheet).toContain('<c r="C1" s="9"><f>B1*2</f></c>')
    expect(workbook).toContain('calcMode="auto"')
    expect(workbook).toContain('fullCalcOnLoad="1"')
  })

  it('higieniza o valor mantendo o estilo original da célula', () => {
    const result = mutateOoxmlWorkbook(workbookFixture(), [
      { sheet: 'Produção ', address: 'A1', value: null, reason: 'sanitize' },
    ])
    const zip = new PizZip(result.buffer)
    const sheet = zip.file('xl/worksheets/sheet1.xml')?.asText() ?? ''

    expect(result.sanitized).toBe(1)
    expect(sheet).toContain('<c r="A1" s="7"/>')
    expect(sheet).not.toContain('<v>0</v>')
  })
})
