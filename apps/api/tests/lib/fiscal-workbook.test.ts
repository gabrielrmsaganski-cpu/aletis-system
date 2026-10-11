import { beforeAll, describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { buildFiscalWorkbook } from '../../src/services/fiscal-connection/FiscalWorkbookService.js'
import { runFiscalWorkbook } from '../../src/services/fiscal-connection/FiscalWorkbookJob.js'
import { excelDecimal, prepareFiscalWorkbook, type FiscalWorkbookInput, type FiscalWorkbookRecord } from '../../src/services/fiscal-connection/FiscalWorkbookData.js'

const key = '50260911222333000181550010000000011000000010'
const xml = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${key}"><ide><nNF>0001</nNF></ide><det nItem="1"><prod><cProd>001</cProd><xProd>=HYPERLINK("https://invalid.example")</xProd><NCM>01000000</NCM><CFOP>5102</CFOP><uCom>KG</uCom><qCom>2.5</qCom><vUnCom>40.04</vUnCom><vProd>100.10</vProd></prod><imposto><ICMS><ICMS00><CST>00</CST><vBC>100.10</vBC><pICMS>18</pICMS><vICMS>18.02</vICMS></ICMS00></ICMS><IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS><vBC>100.10</vBC><gIBSUF><pIBSUF>0.1</pIBSUF><vIBSUF>0.10</vIBSUF></gIBSUF><vIBS>0.10</vIBS><gCBS><pCBS>0.9</pCBS><vCBS>0.90</vCBS></gCBS></gIBSCBS></IBSCBS></imposto></det><total><ICMSTot><vNF>100.10</vNF></ICMSTot><IBSCBSTot><gIBS><vIBS>0.10</vIBS></gIBS><gCBS><vCBS>0.90</vCBS></gCBS></IBSCBSTot><vNFTot>101.10</vNFTot></total><pag><detPag><tPag>17</tPag><vPag>100.10</vPag></detPag><vTroco>0.00</vTroco></pag><transp><modFrete>0</modFrete><vol><qVol>1</qVol><pesoB>2.6</pesoB></vol><vol><qVol>2</qVol><pesoB>5.2</pesoB></vol></transp></infNFe><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><KeyInfo><X509Data><X509Certificate>NEVER-EXPORT-THIS-CERTIFICATE</X509Certificate></X509Data></KeyInfo></Signature></NFe></nfeProc>`
const record = (id: string, tipo: 'nfe' | 'resumo' | 'evento', situacao: 'autorizada' | 'cancelada', chave = key): FiscalWorkbookRecord => ({
  document: { id, tipo, chave, nsu: '000000000000001', numero: '0001', serie: '001', direcao: 'recebida', situacao, emissao: '2026-09-01T23:30:00-04:00', valor: '100.10', emitente: '=HYPERLINK("https://invalid.example")', emitenteDocumento: '00122333000181', destinatario: 'Titular sintético', destinatarioDocumento: '01234567890', recebidoEm: '2026-09-03T01:00:00Z', arquivoNome: `SEFAZ-${id}.xml`, processamento: 'encaminhado', detalhes: { versao: 1, situacao, numero: '0001', serie: '001', totais: { vNF: '100.10' }, itens: [], parcelas: tipo === 'nfe' ? [{ numero: '001', vencimento: '2026-10-01', valor: '100.10' }] : [], eventoTipo: tipo === 'evento' ? '110111' : undefined } },
  xml: tipo === 'nfe' ? xml.replaceAll(key, chave) : tipo === 'resumo' ? `<resNFe xmlns="http://www.portalfiscal.inf.br/nfe"><chNFe>${chave}</chNFe><vNF>100.10</vNF></resNFe>` : `<resEvento xmlns="http://www.portalfiscal.inf.br/nfe"><chNFe>${chave}</chNFe><tpEvento>110111</tpEvento></resEvento>`, sha256: 'a'.repeat(64), queryId: 'synthetic-query', schema: 'synthetic.xsd',
})
const input: FiscalWorkbookInput = { cliente: { id: 'synthetic', nome: 'Cliente sintético' }, generatedAt: '2026-09-14T12:00:00Z', filters: { busca: '', tipo: 'todos' }, records: [record('summary', 'resumo', 'autorizada'), record('full', 'nfe', 'autorizada'), record('cancelled', 'nfe', 'cancelada', key.slice(0, -1) + '2'), record('event', 'evento', 'cancelada', key.slice(0, -1) + '2')] }

describe('Excel fiscal completo e interativo', () => {
  let buffer: Buffer, wb: ExcelJS.Workbook, zip: JSZip
  beforeAll(async () => { buffer = await buildFiscalWorkbook(input); wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer as never); zip = await JSZip.loadAsync(buffer) })
  it('concilia resumo/XML por chave e exclui canceladas dos valores autorizados', () => {
    const m = prepareFiscalWorkbook(input)
    expect(m.notes).toHaveLength(2); expect(m.notes[0].record.document.tipo).toBe('nfe')
    expect(m.notes.map(n => n.eligible.toFixed(2))).toEqual(['100.10', '0.00'])
    expect(wb.getWorksheet('Painel')!.getCell('A11').result).toBe(2)
    expect(wb.getWorksheet('Painel')!.getCell('I11').result).toBe(1)
    expect(wb.getWorksheet('Painel')!.getCell('I15').result).toBe(100.1)
    expect(wb.getWorksheet('Painel')!.getCell('A15').result).toBe(0)
  })
  it('preserva chaves e códigos como texto, datas locais e conteúdo que parece fórmula', () => {
    const notes = wb.getWorksheet('Notas')!, items = wb.getWorksheet('Itens')!
    expect(notes.getCell('A9').value).toBe(key); expect(notes.getCell('A9').type).toBe(ExcelJS.ValueType.String)
    expect(notes.getCell('B9').value).toBe('0001'); expect(notes.getCell('J9').value).toBe('00122333000181')
    expect(notes.getCell('D9').value).toEqual(new Date('2026-09-01T00:00:00Z'))
    expect(notes.getCell('I9').type).toBe(ExcelJS.ValueType.String)
    expect(items.getCell('H9').type).toBe(ExcelJS.ValueType.String)
    expect(items.getCell('I9').value).toBe('01000000')
    expect(items.getCell('O9').value).toBe(40.04)
  })
  it('inclui tributos tradicionais, IBS/CBS, duplicatas, pagamento e todos os volumes', () => {
    const tax = wb.getWorksheet('Tributos')!
    expect(tax.getCell('J9').value).toBe(18.02); expect(tax.getCell('AH9').value).toBe(0.1)
    expect(tax.getCell('AE9').value).toBe('000001'); expect(tax.getCell('AM9').value).toBe(0.9)
    expect(wb.getWorksheet('Parcelas')!.getCell('F9').value).toEqual(new Date('2026-10-01T00:00:00Z'))
    expect(wb.getWorksheet('Pagamentos')!.getCell('G9').value).toBe('PIX dinâmico')
    expect(wb.getWorksheet('Transporte')!.getCell('R10').value).toBe(5.2)
    expect(wb.getWorksheet('Transporte')!.getCell('A12').value).toBeTruthy()
  })
  it('rastreia campos e registros sem incluir material de assinatura', async () => {
    const fields = prepareFiscalWorkbook(input).fields
    expect(fields.some(r => r[4] === '/nfeProc/NFe/infNFe/total/vNFTot' && r[6] === '101.10')).toBe(true)
    expect(fields.some(r => String(r[4]).includes('vol[2]'))).toBe(true)
    expect(JSON.stringify(fields)).not.toContain('NEVER-EXPORT')
    const strings = await zip.file('xl/sharedStrings.xml')!.async('string')
    expect(strings).not.toContain('NEVER-EXPORT')
    expect(wb.getWorksheet('Registros')!.getCell('A12').value).toBe('event')
    expect(wb.worksheets).toHaveLength(14)
  })
  it('tem fórmulas, cache inicial, tabelas, subtotais, pesquisa paginada, validação e gráficos nativos', async () => {
    const notes = wb.getWorksheet('Notas')!, panel = wb.getWorksheet('Painel')!, finder = wb.getWorksheet('Buscar')!
    expect(notes.getCell('AQ9').formula).toContain('SEARCH(')
    expect(notes.getCell('AQ9').formula).toContain('SUBSTITUTE(')
    expect(notes.getCell('AR10').formula).toBe('AQ10+AR9')
    expect(notes.getCell('G7').formula).toContain('SUBTOTAL(109')
    expect(notes.getTable('tbNotas')).toBeTruthy()
    expect(finder.getCell('Q9').formula).toContain('MATCH(')
    expect(finder.getCell('P9').formula).toContain('HYPERLINK(')
    expect(panel.getCell('E7').dataValidation.type).toBe('list')
    expect(notes.views[0]).toMatchObject({ state: 'frozen', ySplit: 8, xSplit: 2 })
    expect(await zip.file('xl/workbook.xml')!.async('string')).toContain('calcMode="auto"')
    expect(await zip.file('xl/charts/chart1.xml')!.async('string')).toContain("'Mensal'!$C$9:$C$9")
    expect(await zip.file('xl/charts/chart2.xml')!.async('string')).toContain("'Parceiros'!$M$9:$M$18")
    expect(Object.keys(zip.files).some(p => /vbaProject|externalLinks|connections\.xml/.test(p))).toBe(false)
    const table = await zip.file('xl/tables/table1.xml')!.async('string'); expect(table).toContain('autoFilter')
  })
  it('processa arquivo vazio sem dados inventados e roda no worker isolado', async () => {
    const empty = { ...input, records: [] }
    const generated = await runFiscalWorkbook(empty), workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(generated as never)
    expect(workbook.getWorksheet('Painel')!.getCell('A11').result).toBe(0)
    expect(workbook.getWorksheet('Notas')!.getCell('A9').value).toBeNull()
    expect(workbook.getWorksheet('Buscar')!.getCell('Q9').result ?? '').toBe('')
  })
  it('mantém valores exatos e recusa perda monetária e truncamento', () => {
    expect(excelDecimal('123456789012345.67')).toBe('123456789012345.67')
    expect(() => excelDecimal('123456789012345.67', true)).toThrow(/precisão/)
    expect(excelDecimal('9999999999999.99', true)).toBe(9999999999999.99)
    expect(() => prepareFiscalWorkbook({ ...input, records: Array(5001).fill(input.records[0]) })).toThrow(/5.000/)
    expect(() => prepareFiscalWorkbook({ ...input, records: [{ ...input.records[0], xml: '<!DOCTYPE x><x/>' }] })).toThrow(/declaração/)
  })
})
