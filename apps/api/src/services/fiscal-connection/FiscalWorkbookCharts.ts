import JSZip from 'jszip'
import type ExcelJS from 'exceljs'
import type { Scalar } from './FiscalWorkbookData.js'

const escape = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const result = (value: ExcelJS.CellValue): unknown => value && typeof value === 'object' && 'result' in value ? value.result : value
interface ChartData { monthly: ExcelJS.CellValue[][]; ranking: Scalar[][]; monthCount: number }

/** ExcelJS não grava gráficos. Acrescentamos somente as partes OOXML de gráficos nativos. */
export async function addFiscalWorkbookCharts(buffer: Buffer, data: ChartData): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer)
  const charts = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
  const drawing = 'http://schemas.openxmlformats.org/drawingml/2006/main'
  const rels = 'http://schemas.openxmlformats.org/package/2006/relationships'
  const docRels = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const categories = data.monthly.length ? data.monthly.map(r => String(r[0])) : ['Sem dados']
  const monthEnd = Math.max(9, 8 + data.monthCount)
  const points = (values: unknown[], numeric: boolean) => `<c:ptCount val="${values.length}"/>` + values.map((v, i) => `<c:pt idx="${i}"><c:v>${escape(numeric ? (typeof v === 'number' ? v : 0) : v)}</c:v></c:pt>`).join('')
  function series(index: number, name: string, color: string, catRef: string, cats: string[], valRef: string, values: unknown[]) {
    return `<c:ser><c:idx val="${index}"/><c:order val="${index}"/><c:tx><c:v>${escape(name)}</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:cat><c:strRef><c:f>${escape(catRef)}</c:f><c:strCache>${points(cats, false)}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>${escape(valRef)}</c:f><c:numCache><c:formatCode>#,##0.00</c:formatCode>${points(values, true)}</c:numCache></c:numRef></c:val></c:ser>`
  }
  function chart(body: string, horizontal: boolean) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="${charts}" xmlns:a="${drawing}" xmlns:r="${docRels}"><c:lang val="pt-BR"/><c:roundedCorners val="0"/><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/><c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${body}<c:gapWidth val="80"/><c:overlap val="0"/><c:axId val="101"/><c:axId val="102"/></c:barChart><c:catAx><c:axId val="101"/><c:scaling><c:orientation val="${horizontal ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'l' : 'b'}"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="102"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/>${!horizontal ? `<c:tickLblSkip val="${Math.max(1, Math.ceil(categories.length / 14))}"/>` : ''}</c:catAx><c:valAx><c:axId val="102"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'b' : 'l'}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E7EFE9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="[&gt;=1000000]0.0,,&quot; mi&quot;;[&gt;=1000]0,&quot; mil&quot;;0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="101"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea>${!horizontal ? '<c:legend><c:legendPos val="b"/><c:layout/><c:overlay val="0"/></c:legend>' : ''}<c:plotVisOnly val="1"/><c:dispBlanksAs val="zero"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="950"><a:solidFill><a:srgbClr val="20362F"/></a:solidFill><a:latin typeface="Aptos"/></a:defRPr></a:pPr><a:endParaRPr lang="pt-BR"/></a:p></c:txPr><c:printSettings><c:headerFooter/><c:pageMargins b="0.25" l="0.25" r="0.25" t="0.25" header="0.1" footer="0.1"/><c:pageSetup/></c:printSettings></c:chartSpace>`
  }
  const monthlySeries = series(0, 'Emitidas (R$)', '163D32', `'Mensal'!$A$9:$A$${monthEnd}`, categories, `'Mensal'!$C$9:$C$${monthEnd}`, data.monthly.length ? data.monthly.map(r => result(r[2])) : [0]) + series(1, 'Recebidas (R$)', 'B99245', `'Mensal'!$A$9:$A$${monthEnd}`, categories, `'Mensal'!$D$9:$D$${monthEnd}`, data.monthly.length ? data.monthly.map(r => result(r[3])) : [0])
  const ranking = Array.from({ length: 10 }, (_, i) => data.ranking[i] ?? ['', 0])
  zip.file('xl/charts/chart1.xml', chart(monthlySeries, false))
  zip.file('xl/charts/chart2.xml', chart(series(0, 'Valor autorizado (R$)', '346B56', "'Parceiros'!$L$9:$L$18", ranking.map(r => String(r[0])), "'Parceiros'!$M$9:$M$18", ranking.map(r => r[1])), true))
  const anchor = (id: number, start: number, end: number) => `<xdr:twoCellAnchor><xdr:from><xdr:col>${start}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>23</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${end}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>40</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="Gráfico fiscal ${id}" descr="${id === 1 ? 'Evolução mensal de emitidas e recebidas' : 'Dez maiores contrapartes por valor autorizado'}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${charts}"><c:chart xmlns:c="${charts}" xmlns:r="${docRels}" r:id="rId${id}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
  zip.file('xl/drawings/drawing1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${drawing}">${anchor(1, 0, 8)}${anchor(2, 8, 16)}</xdr:wsDr>`)
  zip.file('xl/drawings/_rels/drawing1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${rels}"><Relationship Id="rId1" Type="${docRels}/chart" Target="../charts/chart1.xml"/><Relationship Id="rId2" Type="${docRels}/chart" Target="../charts/chart2.xml"/></Relationships>`)
  const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
  zip.file('xl/worksheets/sheet1.xml', sheet.replace('</worksheet>', '<drawing r:id="rIdFiscalCharts"/></worksheet>'))
  const sheetRelsPath = 'xl/worksheets/_rels/sheet1.xml.rels'
  const sheetRels = await zip.file(sheetRelsPath)?.async('string') ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${rels}"></Relationships>`
  zip.file(sheetRelsPath, sheetRels.replace('</Relationships>', `<Relationship Id="rIdFiscalCharts" Type="${docRels}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`))
  const types = await zip.file('[Content_Types].xml')!.async('string')
  zip.file('[Content_Types].xml', types.replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/charts/chart2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>'))
  const workbook = await zip.file('xl/workbook.xml')!.async('string')
  zip.file('xl/workbook.xml', workbook.replace(/<calcPr[^>]*\/>/, '<calcPr calcId="0" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>'))
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}
