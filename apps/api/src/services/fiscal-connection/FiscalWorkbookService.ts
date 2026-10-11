import ExcelJS from 'exceljs'
import Decimal from 'decimal.js'
import { addFiscalWorkbookCharts } from './FiscalWorkbookCharts.js'
import { prepareFiscalWorkbook, excelDay, excelDecimal, decimal, processingLabels, WORKBOOK_LIMITS, FiscalWorkbookLimitError, type FiscalWorkbookInput, type Scalar, type WorkbookNote } from './FiscalWorkbookData.js'

const C = { green: '163D32', mid: '346B56', gold: 'B99245', cream: 'F5F3EA', sage: 'E7EFE9', ink: '20362F', mute: '66796F', input: 'FFF0CB', red: 'FBE4E1', white: 'FFFFFF' }
const BRL = '"R$" #,##0.00;[Red]("R$" #,##0.00);"R$" 0.00'
const NUM = '#,##0.00########;[Red](#,##0.00########);0.00'
const START = 9
type Value = ExcelJS.CellValue
type Column = { name: string; width?: number; format?: string; hidden?: boolean; description?: string }
const col = (name: string, width = 20, format = '@'): Column => ({ name, width, format })
const money = (name: string): Column => col(name, 20, BRL)
const quantity = (name: string): Column => col(name, 19, NUM)
const integer = (name: string): Column => col(name, 17, '0')
const day = (name: string): Column => col(name, 15, 'dd/mm/yyyy')
const formula = (expression: string, result: Scalar): Value => ({ formula: expression, ...(result === null ? {} : { result }) })
const link = (sheet: string, row = 1, text = 'Abrir'): Value => ({ text, hyperlink: `#'${sheet}'!A${row}`, tooltip: `Ir para ${sheet}` })
const sum = (notes: WorkbookNote[], get: (n: WorkbookNote) => Decimal) => notes.reduce((a, n) => a.plus(get(n)), new Decimal(0))
const cached = (d: Decimal) => excelDecimal(d, true)
const safeText = (s: string) => s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')

/** XLSX sem macros/conexões externas: fórmulas locais, tabelas, filtros e gráficos nativos. */
export async function buildFiscalWorkbook(input: FiscalWorkbookInput): Promise<Buffer> {
  const model = prepareFiscalWorkbook(input), notes = model.notes, count = notes.length
  const sourceLabel = (schema: string) => schema === 'sefaz-ms-portal-summary-v1' ? 'e-Fazenda MS / Informações Fiscais' : 'Ambiente Nacional da NF-e'
  const sources = [...new Set(input.records.map(record => sourceLabel(record.schema)))]
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ALETIS · Finanças Estratégicas & Agrobusiness'
  wb.title = `Inteligência fiscal · ${input.cliente.nome}`
  wb.subject = 'Acervo NF-e · análise documental'
  wb.description = 'Painel interativo, pesquisa, notas, itens, tributos e rastreabilidade de documentos fiscais oficiais.'
  wb.created = new Date(input.generatedAt); wb.modified = new Date(input.generatedAt)
  wb.calcProperties.fullCalcOnLoad = true
  wb.views = [{ x: 0, y: 0, width: 16000, height: 10000, visibility: 'visible', firstSheet: 0, activeTab: 0 }]
  const stamp = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(input.generatedAt))
  const catalog: { sheet: string; columns: Column[]; description: string }[] = []
  let cellCount = 0

  function base(name: string, title: string, subtitle: string, dashboard = false) {
    const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: name === 'Painel' ? C.gold : name === 'Buscar' ? C.mid : C.green }, defaultRowHeight: 21 }, views: [{ showGridLines: false, state: 'frozen', ySplit: dashboard ? 4 : 8, xSplit: dashboard ? 0 : 2, zoomScale: dashboard ? 85 : 90 }] })
    ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: dashboard ? '1:4' : '1:8', margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } }
    ws.headerFooter.oddFooter = '&LALETIS · Uso do cliente e equipe autorizada&C&P / &N&R' + stamp
    if (dashboard) for (let i = 1; i <= 16; i++) ws.getColumn(i).width = 10
    ws.mergeCells('A1:P2'); const titleCell = ws.getCell('A1'); titleCell.value = title
    titleCell.font = { name: 'Aptos Display', size: 25, bold: true, color: { argb: C.white } }; titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.green } }; titleCell.alignment = { vertical: 'middle', indent: 1 }
    ws.getRow(1).height = 25; ws.getRow(2).height = 22
    ws.mergeCells('A3:P3'); ws.getCell('A3').value = subtitle; ws.getCell('A3').font = { name: 'Aptos', size: 11, color: { argb: C.mute } }; ws.getRow(3).height = 26
    for (const [range, target, label] of [['A4:D4', 'Painel', '01  PAINEL'], ['E4:H4', 'Buscar', '02  BUSCAR NOTAS'], ['I4:L4', 'Notas', '03  BASE COMPLETA'], ['M4:P4', 'Guia', '04  GUIA E ÍNDICE']]) {
      ws.mergeCells(range); const c = ws.getCell(range.split(':')[0]); c.value = link(target, 1, label); c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: target === name ? C.gold : C.sage } }; c.font = { name: 'Aptos', size: 10, bold: true, color: { argb: C.green } }; c.alignment = { horizontal: 'center', vertical: 'middle' }
    }
    ws.getRow(4).height = 28
    return ws
  }
  const panel = base('Painel', 'ALETIS  /  INTELIGÊNCIA FISCAL', `${input.cliente.nome}  ·  Acervo SEFAZ  ·  Gerado em ${stamp} (Brasília)`, true)
  const finder = base('Buscar', 'BUSCAR  /  SUAS NOTAS EM SEGUNDOS', 'Use os filtros amarelos do Painel. Os resultados abaixo acompanham o recorte automaticamente.', true)

  function table(name: string, tableName: string, description: string, columns: Column[], rows: Value[][]) {
    cellCount += Math.max(rows.length, 1) * columns.length
    if (cellCount > WORKBOOK_LIMITS.cells) throw new FiscalWorkbookLimitError('O detalhamento excede o limite de células do Excel. Restrinja o período ou os filtros; nenhum dado foi truncado.')
    const ws = base(name, name.toLocaleUpperCase('pt-BR') + '  /  ACERVO FISCAL', description)
    columns.forEach((c, i) => { const column = ws.getColumn(i + 1); column.width = c.width ?? 20; column.numFmt = c.format ?? '@'; column.hidden = c.hidden ?? false })
    const prepared = rows.length ? rows.map(row => columns.map((_, i) => typeof row[i] === 'string' ? safeText(row[i] as string) : row[i] ?? null)) : [columns.map(() => null)]
    ws.addTable({ name: tableName, ref: 'A8', headerRow: true, totalsRow: false, style: { theme: 'TableStyleMedium4', showRowStripes: true, showColumnStripes: false }, columns: columns.map(c => ({ name: c.name, filterButton: true })), rows: prepared })
    ws.getRow(8).height = 36
    ws.getRow(8).eachCell(c => { c.font = { name: 'Aptos', bold: true, size: 11, color: { argb: C.white } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.green } }; c.alignment = { vertical: 'middle', wrapText: true } })
    for (let r = START; r < START + prepared.length; r++) {
      const row = ws.getRow(r); row.height = 23
      row.eachCell(c => { c.font = { name: 'Aptos', size: 11, color: { argb: C.ink } }; c.alignment = { vertical: 'middle' }; if (c.type === ExcelJS.ValueType.Hyperlink) c.font = { ...c.font, color: { argb: C.mid }, underline: true } })
    }
    ws.mergeCells('A6:D6'); ws.getCell('A6').value = formula(`SUBTOTAL(103,${tableName}[${columns[0].name}])&" linha(s) visível(is) de ${rows.length}"`, `${rows.length} linha(s) visível(is) de ${rows.length}`); ws.getCell('A6').font = { name: 'Aptos', size: 12, bold: true, color: { argb: C.green } }
    ws.mergeCells('E6:P6'); ws.getCell('E6').value = 'Filtre pelos cabeçalhos · Ctrl+F para localizar · Primeiras colunas e cabeçalho fixos'; ws.getCell('E6').font = { name: 'Aptos', size: 11, color: { argb: C.mute } }
    ws.pageSetup.printArea = `A1:${ws.getColumn(columns.length).letter}${START + prepared.length - 1}`
    catalog.push({ sheet: name, columns, description })
    return ws
  }

  const partnerIds = new Map<string, string>()
  const partnerInfo = new Map<string, { id: string; name: string; document: string; direction: string; notes: WorkbookNote[] }>()
  const notePartner = new Map<string, string>()
  for (const n of notes) {
    const d = n.record.document, emitted = d.direcao === 'emitida', name = (emitted ? d.destinatario : d.emitente) ?? 'Não informado', document = (emitted ? d.destinatarioDocumento : d.emitenteDocumento) ?? '', key = JSON.stringify([document || name, n.direction])
    if (!partnerIds.has(key)) { const id = 'p_' + String(partnerIds.size + 1).padStart(5, '0'); partnerIds.set(key, id); partnerInfo.set(id, { id, name, document, direction: n.direction, notes: [] }) }
    const id = partnerIds.get(key)!; partnerInfo.get(id)!.notes.push(n); notePartner.set(n.key, id)
  }
  const starts = { items: new Map<string, number>(), taxes: new Map<string, number>(), installments: new Map<string, number>(), events: new Map<string, number>(), fields: new Map<string, number>() }
  for (const [rows, map] of [[model.events, starts.events], [model.fields, starts.fields]] as const) rows.forEach((r, i) => { if (!map.has(String(r[0]))) map.set(String(r[0]), START + i) })
  const collect = (kind: 'items' | 'taxes' | 'installments' | 'payments' | 'transport') => {
    const all: Value[][] = []
    for (const n of notes) { if ((kind === 'items' || kind === 'taxes' || kind === 'installments') && n[kind].length) starts[kind].set(n.key, START + all.length); all.push(...n[kind]) }
    return all
  }
  const itemRows = collect('items'), taxRows = collect('taxes'), installmentRows = collect('installments'), paymentRows = collect('payments'), transportRows = collect('transport')
  const countSearchParts = Math.max(1, ...notes.map(n => n.searches.length))
  const columns: Column[] = [col('Chave', 48), col('Numero', 13), col('Serie', 10), day('Emissao'), col('Competencia', 14), col('Vinculo', 18), col('Situacao', 18), col('Conteudo', 18), col('Emitente', 38), col('Documento emitente', 21), col('UF emitente', 13), col('Destinatario', 38), col('Documento destinatario', 23), col('UF destinatario', 16), col('Natureza', 40), col('Finalidade', 16), money('Valor NF-e'), money('Produtos'), money('Desconto'), money('Frete'), money('Seguro'), money('Outras despesas'), money('ICMS'), money('ICMS ST'), money('IPI'), money('PIS'), money('COFINS'), money('Tributos aproximados'), money('Valor elegivel'), integer('Itens'), integer('Parcelas'), integer('Eventos'), col('CRM', 23), col('Protocolo', 23), col('NSU', 21), col('Informacoes adicionais', 60), col('Ver itens', 18), col('Ver tributos', 18), col('Ver parcelas', 18), col('Ver eventos', 18), col('Ver campos XML', 22), col('Valor exato', 24), { ...integer('No recorte'), hidden: true }, { ...integer('Ordem do recorte'), hidden: true }, { ...col('Parceiro ID'), hidden: true }, ...Array.from({ length: countSearchParts }, (_, i) => ({ ...col('Pesquisa ' + (i + 1)), hidden: true })), money('IBS'), money('CBS'), money('Total com reforma'), col('Emissao original', 28)]
  const index = (name: string) => columns.findIndex(c => c.name === name) + 1
  const letters = (n: number): string => n > 26 ? letters(Math.floor((n - 1) / 26)) + String.fromCharCode(65 + (n - 1) % 26) : String.fromCharCode(64 + n)
  const address = (name: string, row: number) => letters(index(name)) + row
  const escapedSearch = 'SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(Painel!$M$7,"~","~~"),"*","~*"),"?","~?")'
  const navigation = (sheet: string, map: Map<string, number>, key: string): Value => map.has(key) ? link(sheet, map.get(key)!, 'Abrir detalhes') : 'Não consta'
  const total = (n: WorkbookNote, tag: string) => excelDecimal(n.totals['ICMSTot/' + tag] ?? n.record.document.detalhes?.totais[tag])
  const noteRows: Value[][] = notes.map((n, i) => {
    const d = n.record.document, x = d.detalhes, row = i + START
    const searches = Array.from({ length: countSearchParts }, (_, j) => `ISNUMBER(SEARCH(${escapedSearch},${address('Pesquisa ' + (j + 1), row)}))`).join(',')
    const selected = `IF(AND(IF(Painel!$A$7="",TRUE,AND(ISNUMBER(D${row}),D${row}>=Painel!$A$7)),IF(Painel!$C$7="",TRUE,AND(ISNUMBER(D${row}),D${row}<=Painel!$C$7)),OR(Painel!$E$7="Todas",F${row}=Painel!$E$7),OR(Painel!$I$7="Todas",G${row}=Painel!$I$7),OR(Painel!$M$7="",${searches})),1,0)`
    return [n.key, d.numero ?? '', d.serie ?? '', excelDay(d.emissao), n.month, n.direction, n.situation, n.content, d.emitente ?? '', d.emitenteDocumento ?? '', x?.emitenteUF ?? '', d.destinatario ?? '', d.destinatarioDocumento ?? '', x?.destinatarioUF ?? '', x?.natureza ?? '', ({ '1': 'Normal', '2': 'Complementar', '3': 'Ajuste', '4': 'Devolução' } as Record<string, string>)[x?.finalidade ?? ''] ?? x?.finalidade ?? '', excelDecimal(d.valor, true), total(n, 'vProd'), total(n, 'vDesc'), total(n, 'vFrete'), total(n, 'vSeg'), total(n, 'vOutro'), total(n, 'vICMS'), total(n, 'vST'), total(n, 'vIPI'), total(n, 'vPIS'), total(n, 'vCOFINS'), total(n, 'vTotTrib'), formula(`IF(AND(G${row}="Autorizada",H${row}="XML integral"),Q${row},0)`, cached(n.eligible)), n.items.length, n.installments.length, model.eventCounts.get(n.key) ?? 0, processingLabels[d.processamento ?? 'pendente'] ?? d.processamento ?? '', x?.protocolo ?? '', d.nsu, x?.informacoes ?? '', navigation('Itens', starts.items, n.key), navigation('Tributos', starts.taxes, n.key), navigation('Parcelas', starts.installments, n.key), navigation('Eventos', starts.events, n.key), navigation('Campos XML', starts.fields, n.key), d.valor ?? '', formula(selected, 1), formula(`${address('No recorte', row)}${i ? '+' + address('Ordem do recorte', row - 1) : ''}`, i + 1), notePartner.get(n.key) ?? '', ...Array.from({ length: countSearchParts }, (_, j) => n.searches[j] ?? ''), excelDecimal(n.totals['IBSCBSTot/gIBS/vIBS']), excelDecimal(n.totals['IBSCBSTot/gCBS/vCBS']), excelDecimal(n.totals['vNFTot']), d.emissao ?? '']
  })
  const invoices = table('Notas', 'tbNotas', 'Uma linha por chave, com preferência pelo XML integral. Valores documentais não comprovam pagamento ou dívida.', columns, noteRows)
  invoices.addConditionalFormatting({ ref: `A9:${letters(columns.length)}${Math.max(9, count + 8)}`, rules: [{ type: 'expression', formulae: ['$G9="Cancelada"'], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.red } }, font: { color: { argb: '8B3434' } } } }] })
  invoices.mergeCells('A7:F7'); invoices.getCell('A7').value = 'Total documental das linhas visíveis (inclui canceladas):'
  invoices.getCell('G7').value = formula('ROUND(SUBTOTAL(109,tbNotas[Valor NF-e]),2)', cached(sum(notes, n => n.amount))); invoices.getCell('G7').numFmt = BRL
  invoices.mergeCells('I7:N7'); invoices.getCell('I7').value = 'XML autorizados nas linhas visíveis:'
  invoices.getCell('O7').value = formula('ROUND(SUBTOTAL(109,tbNotas[Valor elegivel]),2)', cached(sum(notes, n => n.eligible))); invoices.getCell('O7').numFmt = BRL

  table('Itens', 'tbItens', 'Produtos por nota: quantidades, preços, descontos, códigos fiscais, unidade tributável e pedidos.', [col('Chave', 48), col('Numero', 13), day('Emissao'), col('Vinculo', 18), col('Situacao', 18), col('Item', 10), col('Codigo', 22), col('Descricao', 55), col('NCM', 14), col('CFOP', 12), col('CEST', 14), col('EAN', 20), col('Unidade', 13), quantity('Quantidade'), quantity('Valor unitario'), money('Valor produtos'), money('Desconto'), money('Frete'), money('Seguro'), money('Outras despesas'), col('Unidade tributavel'), quantity('Quantidade tributavel'), quantity('Unitario tributavel'), col('Compoe total', 15), col('Pedido', 22), col('Item pedido', 14), col('Informacoes produto', 60)], itemRows)
  table('Tributos', 'tbTributos', 'Uma linha por item. Campo vazio = não informado no XML. Alíquotas em pontos percentuais; demais campos estão em Campos XML.', [col('Chave', 48), col('Item', 10), col('Descricao', 45), col('NCM', 14), col('CFOP', 12), col('Origem', 12), col('CST ou CSOSN', 17), money('Base ICMS'), quantity('Aliquota ICMS'), money('ICMS'), money('Base ICMS ST'), quantity('Aliquota ICMS ST'), money('ICMS ST'), money('ICMS desonerado'), money('FCP'), money('ICMS mono retido'), col('CST PIS', 13), money('Base PIS'), quantity('Aliquota PIS'), money('PIS'), col('CST COFINS', 14), money('Base COFINS'), quantity('Aliquota COFINS'), money('COFINS'), col('CST IPI', 13), money('Base IPI'), quantity('Aliquota IPI'), money('IPI'), money('Tributos aproximados'), col('CST IBS CBS', 16), col('Classe tributaria', 20), money('Base IBS CBS'), quantity('Aliquota IBS UF'), money('IBS UF'), quantity('Aliquota IBS municipio'), money('IBS municipio'), money('IBS'), quantity('Aliquota CBS'), money('CBS'), money('IBS monofasico'), money('CBS monofasica')], taxRows)
  const installmentSheet = table('Parcelas', 'tbParcelas', 'Duplicatas declaradas no XML. Vencimento é uma previsão documental; não indica saldo em aberto ou quitação.', [col('Chave', 48), col('Numero NF-e', 15), col('Vinculo', 18), col('Situacao', 18), col('Parcela', 15), day('Vencimento'), money('Valor'), col('Valor exato', 24)], installmentRows)
  installmentSheet.getColumn(8).hidden = false
  table('Pagamentos', 'tbPagamentos', 'Meios de pagamento declarados. Troco é do conjunto da nota e pode se repetir nas formas de pagamento; não somar essa coluna.', [col('Chave', 48), col('Numero NF-e', 15), col('Vinculo', 18), col('Situacao', 18), col('Indicador pagamento', 23), col('Codigo forma', 17), col('Forma de pagamento', 36), money('Valor declarado'), money('Troco da nota'), col('CNPJ credenciadora', 24), col('Bandeira', 15), col('Autorizacao', 25), col('Valor exato', 24)], paymentRows)
  table('Transporte', 'tbTransporte', 'Transportador, veículo e volumes. Uma linha por volume; dados do transportador se repetem quando há vários volumes.', [col('Chave', 48), col('Numero NF-e', 15), col('Modalidade', 15), col('Responsavel frete', 33), col('Transportador', 38), col('CPF CNPJ', 23), col('IE', 20), col('Endereco', 45), col('Municipio', 28), col('UF', 9), col('Placa', 15), col('UF veiculo', 13), col('RNTC', 20), quantity('Volumes'), col('Especie', 20), col('Marca', 20), col('Numeracao volume', 24), quantity('Peso bruto kg'), quantity('Peso liquido kg')], transportRows)
  table('Eventos', 'tbEventos', 'Eventos e resumos de eventos recebidos no recorte exportado. A situação das notas considera também cancelamentos vinculados no acervo.', [col('Chave', 48), col('NSU', 21), col('Codigo evento', 18), col('Evento', 45), col('Data original', 28), col('Retorno SEFAZ', 18), col('Protocolo', 23), col('Sequencia', 14), col('Justificativa ou correcao', 70), col('Recebido em UTC', 28), col('Registro ALETIS', 40), col('SHA-256', 68)], model.events)

  const monthly = [...new Set(notes.map(n => n.month))].sort()
  const monthRows = monthly.map((month, i) => {
    const row = i + START, list = notes.filter(n => n.month === month)
    return [month, formula(`SUMIFS(tbNotas[No recorte],tbNotas[Competencia],A${row})`, list.length), formula(`ROUND(SUMIFS(tbNotas[Valor elegivel],tbNotas[Competencia],A${row},tbNotas[Vinculo],"Emitida",tbNotas[No recorte],1),2)`, cached(sum(list.filter(n => n.direction === 'Emitida'), n => n.eligible))), formula(`ROUND(SUMIFS(tbNotas[Valor elegivel],tbNotas[Competencia],A${row},tbNotas[Vinculo],"Recebida",tbNotas[No recorte],1),2)`, cached(sum(list.filter(n => n.direction === 'Recebida'), n => n.eligible))), formula(`COUNTIFS(tbNotas[Competencia],A${row},tbNotas[Situacao],"Cancelada",tbNotas[No recorte],1)`, list.filter(n => n.situation === 'Cancelada').length), formula(`COUNTIFS(tbNotas[Competencia],A${row},tbNotas[Conteudo],"Resumo",tbNotas[No recorte],1)`, list.filter(n => n.content === 'Resumo').length)]
  })
  table('Mensal', 'tbMensal', 'Evolução por competência de emissão. Indicadores e gráfico respondem aos filtros do Painel.', [col('Competencia', 18), integer('Notas'), money('Emitidas'), money('Recebidas'), integer('Canceladas'), integer('Sem XML')], monthRows)
  const partners = [...partnerInfo.values()], lastPartner = Math.max(START, START + partners.length - 1)
  const ranked = [...partners].sort((a, b) => sum(b.notes.filter(n => ['Emitida', 'Recebida'].includes(n.direction)), n => n.eligible).cmp(sum(a.notes.filter(n => ['Emitida', 'Recebida'].includes(n.direction)), n => n.eligible)))
  const partyRows = partners.map((p, i) => {
    const r = START + i
    return [p.name, p.document, p.direction, formula(`COUNTIFS(tbNotas[Parceiro ID],I${r},tbNotas[No recorte],1)`, p.notes.length), formula(`ROUND(SUMIFS(tbNotas[Valor elegivel],tbNotas[Parceiro ID],I${r},tbNotas[Vinculo],"Emitida",tbNotas[No recorte],1),2)`, cached(sum(p.notes.filter(n => n.direction === 'Emitida'), n => n.eligible))), formula(`ROUND(SUMIFS(tbNotas[Valor elegivel],tbNotas[Parceiro ID],I${r},tbNotas[Vinculo],"Recebida",tbNotas[No recorte],1),2)`, cached(sum(p.notes.filter(n => n.direction === 'Recebida'), n => n.eligible))), formula(`ROUND(SUM(E${r}:F${r}),2)`, cached(sum(p.notes.filter(n => ['Emitida', 'Recebida'].includes(n.direction)), n => n.eligible))), formula(`RANK(G${r},$G$9:$G$${lastPartner},0)+COUNTIF($G$9:G${r},G${r})-1`, ranked.findIndex(x => x.id === p.id) + 1), p.id]
  })
  const partySheet = table('Parceiros', 'tbParceiros', 'Contrapartes agrupadas por documento e vínculo. Valores de XML autorizados; ranking acompanha os filtros do Painel.', [col('Contraparte', 44), col('Documento', 24), col('Vinculo', 19), integer('Notas'), money('Emitidas'), money('Recebidas'), money('Total'), { ...integer('Ordem'), hidden: true }, { ...col('ID'), hidden: true }], partyRows)
  partySheet.getColumn('L').width = 42; partySheet.getColumn('M').width = 20
  partySheet.getCell('L8').value = '10 maiores no recorte'; partySheet.getCell('M8').value = 'Valor autorizado'
  for (let i = 0; i < 10; i++) {
    const row = START + i, p = ranked[i]
    partySheet.getCell(`L${row}`).value = formula(`IFERROR(INDEX(A$9:A$${lastPartner},MATCH(${i + 1},H$9:H$${lastPartner},0)),"")`, p?.name ?? '')
    partySheet.getCell(`M${row}`).value = formula(`IFERROR(INDEX(G$9:G$${lastPartner},MATCH(${i + 1},H$9:H$${lastPartner},0)),0)`, p ? cached(sum(p.notes.filter(n => ['Emitida', 'Recebida'].includes(n.direction)), n => n.eligible)) : 0); partySheet.getCell(`M${row}`).numFmt = BRL
  }
  table('Campos XML', 'tbCamposXml', 'Inventário dos campos fiscais de todos os registros, com caminho, item e valor original em texto. Inclui campos novos e opcionais do leiaute.', [col('Chave', 48), col('Tipo', 15), col('NSU', 21), col('Item', 10), col('Caminho XML', 78), col('Campo', 25), col('Valor original', 75), integer('Parte'), col('Registro ALETIS', 40)], model.fields)
  table('Registros', 'tbRegistros', 'Inventário de origem: notas, resumos e eventos. Pode conter vários registros da mesma chave; não somar valores como notas distintas.', [col('Registro ALETIS', 40), col('Tipo', 18), col('Chave', 48), col('NSU', 21), col('Emissao original', 28), col('Recebido em UTC', 28), col('Origem', 38), col('Schema XML', 28), col('SHA-256', 68), col('Consulta ALETIS', 40), col('Upload CRM', 40), col('Processamento CRM', 25), col('Analise', 24), col('Drive', 24), col('Arquivo XML', 60), col('Valor original', 24)], input.records.map(r => { const d = r.document; return [d.id, d.tipo, d.chave ?? '', d.nsu, d.emissao ?? '', d.recebidoEm, sourceLabel(r.schema), r.schema, r.sha256, r.queryId, d.portalUploadId ?? '', processingLabels[d.processamento ?? 'pendente'] ?? d.processamento ?? '', d.analiseStatus ?? '', d.driveStatus ?? '', d.arquivoNome, d.valor ?? ''] }))

  buildPanel(); buildFinder(); buildGuide()
  const raw = await wb.xlsx.writeBuffer()
  return addFiscalWorkbookCharts(Buffer.from(raw), { monthly: monthRows, ranking: ranked.slice(0, 10).map(p => [p.name, cached(sum(p.notes.filter(n => ['Emitida', 'Recebida'].includes(n.direction)), n => n.eligible))]), monthCount: monthly.length })

  function band(ws: ExcelJS.Worksheet, range: string, value: Value, size = 12, fill = C.cream, color = C.ink) {
    ws.mergeCells(range); const c = ws.getCell(range.split(':')[0]); c.value = value; c.font = { name: 'Aptos', size, bold: size >= 16, color: { argb: color } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }; c.alignment = { vertical: 'middle', wrapText: true, indent: 1 }; return c
  }
  function buildPanel() {
    const controls = [['A6:B6', 'Emissão de', 'A7:B7', null], ['C6:D6', 'Até', 'C7:D7', null], ['E6:H6', 'Vínculo', 'E7:H7', 'Todas'], ['I6:L6', 'Situação', 'I7:L7', 'Todas'], ['M6:P6', 'Localizar texto', 'M7:P7', null]] as const
    for (const [labelRange, label, inputRange, value] of controls) { band(panel, labelRange, label, 11, C.white, C.mute); const c = band(panel, inputRange, value, 12, C.input); c.font = { ...c.font, bold: true } }
    for (const cell of ['A7', 'C7']) { panel.getCell(cell).numFmt = 'dd/mm/yyyy'; panel.getCell(cell).dataValidation = { type: 'date', operator: 'between', allowBlank: true, formulae: [new Date('1900-01-01'), new Date('2199-12-31')], showErrorMessage: true, errorTitle: 'Data inválida', error: 'Digite uma data válida ou deixe em branco.' } }
    panel.getCell('E7').dataValidation = { type: 'list', allowBlank: false, formulae: ['"Todas,Emitida,Recebida,Outro vínculo,Não informado"'], showErrorMessage: true, error: 'Escolha um vínculo da lista.' }
    panel.getCell('I7').dataValidation = { type: 'list', allowBlank: false, formulae: ['"Todas,Autorizada,Cancelada,Denegada,Não informada"'], showErrorMessage: true, error: 'Escolha uma situação da lista.' }
    panel.getCell('M7').numFmt = '@'; panel.getCell('M7').dataValidation = { type: 'textLength', operator: 'lessThanOrEqual', formulae: [160], allowBlank: true, showErrorMessage: true, error: 'Pesquise com até 160 caracteres.' }
    panel.getRow(7).height = 32
    band(panel, 'A8:P8', 'Edite as células amarelas. Busque por chave, número, empresa, CPF/CNPJ, produto, NCM ou CFOP. Datas vazias = todo o período.', 10, C.white, C.mute)
    const metrics: [string, string, string, Value][] = [
      ['A10:D10', 'NF-e NO RECORTE', 'A11:D12', formula('SUM(tbNotas[No recorte])', count)],
      ['E10:H10', 'XML INTEGRAIS', 'E11:H12', formula('COUNTIFS(tbNotas[Conteudo],"XML integral",tbNotas[No recorte],1)', notes.filter(n => n.content === 'XML integral').length)],
      ['I10:L10', 'CANCELADAS', 'I11:L12', formula('COUNTIFS(tbNotas[Situacao],"Cancelada",tbNotas[No recorte],1)', notes.filter(n => n.situation === 'Cancelada').length)],
      ['M10:P10', 'EVENTOS NO ARQUIVO', 'M11:P12', model.events.length],
    ]
    for (const [labelRange, label, valueRange, value] of metrics) { band(panel, labelRange, label, 10, C.sage, C.mid); band(panel, valueRange, value, 29, C.sage, C.green).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 } }
    for (const [labelRange, label, valueRange, direction] of [['A14:H14', 'EMITIDAS · XML AUTORIZADO', 'A15:H17', 'Emitida'], ['I14:P14', 'RECEBIDAS · XML AUTORIZADO', 'I15:P17', 'Recebida']]) {
      band(panel, labelRange, label, 11, C.green, C.white)
      const c = band(panel, valueRange, formula(`ROUND(SUMIFS(tbNotas[Valor elegivel],tbNotas[Vinculo],"${direction}",tbNotas[No recorte],1),2)`, cached(sum(notes.filter(n => n.direction === direction), n => n.eligible))), 30, C.green, C.white); c.numFmt = BRL; c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    }
    band(panel, 'A19:H20', formula('COUNTIFS(tbNotas[Conteudo],"Resumo",tbNotas[No recorte],1)&" nota(s) no recorte apenas com resumo. Detalhes dependem da disponibilidade do XML na SEFAZ."', `${notes.filter(n => n.content === 'Resumo').length} nota(s) no recorte apenas com resumo. Detalhes dependem da disponibilidade do XML na SEFAZ.`), 11)
    band(panel, 'I19:P20', 'Valores documentais em BRL. Canceladas, denegadas e resumos não compõem os valores autorizados. Não representam saldo, quitação ou fluxo de caixa.', 11)
    band(panel, 'A22:H22', 'EVOLUÇÃO MENSAL', 14, C.white, C.green); band(panel, 'I22:P22', '10 MAIORES CONTRAPARTES', 14, C.white, C.green)
    band(panel, 'A41:P42', 'Os gráficos acompanham o recorte acima. Mensal e Parceiros mostram os números de apoio. As demais bases têm filtros próprios nos cabeçalhos.', 11, C.sage)
    band(panel, 'A44:E44', link('Buscar', 1, '1  ENCONTRE UMA NOTA'), 12, C.gold, C.green)
    band(panel, 'F44:K44', link('Itens', 1, '2  ANALISE PRODUTOS E TRIBUTOS'), 12, C.gold, C.green)
    band(panel, 'L44:P44', link('Guia', 1, '3  EXPLORE TODAS AS ABAS'), 12, C.gold, C.green)
    band(panel, 'A46:P47', `Recorte exportado: ${count} chave(s), ${input.records.length} registro(s), ${itemRows.length} item(ns). Esta é uma fotografia do acervo em ${stamp}; novas consultas exigem novo download.`, 11, C.white, C.mute)
    panel.pageSetup.printArea = 'A1:P47'; panel.pageSetup.fitToHeight = 1
  }

  function buildFinder() {
    band(finder, 'A6:B6', 'Página', 12, C.white); band(finder, 'C6:D6', 1, 13, C.input)
    finder.getCell('C6').numFmt = '0'; finder.getCell('C6').dataValidation = { type: 'whole', operator: 'between', formulae: [1, 200], showErrorMessage: true, error: 'Informe uma página entre 1 e 200.' }
    band(finder, 'E6:L6', formula('Painel!A11&" resultado(s) · "&MAX(1,ROUNDUP(Painel!A11/25,0))&" página(s) · 25 notas por página"', `${count} resultado(s) · ${Math.max(1, Math.ceil(count / 25))} página(s) · 25 notas por página`), 12, C.white)
    band(finder, 'M6:P6', link('Painel', 6, 'ALTERAR BUSCA E FILTROS'), 11, C.gold)
    const ranges = [['A8:A8', '#'], ['B8:C8', 'Número / série'], ['D8:E8', 'Emissão'], ['F8:G8', 'Vínculo / situação'], ['H8:J8', 'Emitente'], ['K8:M8', 'Destinatário'], ['N8:O8', 'Valor da NF-e'], ['P8:P8', 'Detalhes']]
    for (const [r, text] of ranges) band(finder, r, text, 11, C.green, C.white)
    finder.getRow(8).height = 32
    finder.getColumn('Q').hidden = true
    for (let i = 0; i < 25; i++) {
      const r = 9 + i, n = notes[i], d = n?.record.document, target = `(($C$6-1)*25+${i + 1})`, selected = `$Q${r}`
      finder.getCell(selected).value = formula(`IF(${target}>Painel!$A$11,"",IFERROR(MATCH(${target},tbNotas[Ordem do recorte],0),""))`, n ? i + 1 : '')
      const ref = (name: string, result: Scalar) => formula(`IF(${selected}="","",IF(INDEX(tbNotas[${name}],${selected})="","",INDEX(tbNotas[${name}],${selected})))`, n ? result : '')
      const bg = i % 2 ? C.white : C.cream
      band(finder, `A${r}:A${r}`, formula(`IF(${selected}="","",${target})`, n ? i + 1 : ''), 10, bg)
      band(finder, `B${r}:C${r}`, formula(`IF(${selected}="","",IF(INDEX(tbNotas[Numero],${selected})="","—",INDEX(tbNotas[Numero],${selected}))&" / "&IF(INDEX(tbNotas[Serie],${selected})="","—",INDEX(tbNotas[Serie],${selected})))`, n ? `${d?.numero || '—'} / ${d?.serie || '—'}` : ''), 11, bg)
      const dateCell = band(finder, `D${r}:E${r}`, ref('Emissao', excelDay(d?.emissao)), 11, bg); dateCell.numFmt = 'dd/mm/yyyy'
      band(finder, `F${r}:G${r}`, formula(`IF(${selected}="","",INDEX(tbNotas[Vinculo],${selected})&" / "&INDEX(tbNotas[Situacao],${selected}))`, n ? `${n.direction} / ${n.situation}` : ''), 10, bg)
      band(finder, `H${r}:J${r}`, ref('Emitente', d?.emitente ?? ''), 10, bg)
      band(finder, `K${r}:M${r}`, ref('Destinatario', d?.destinatario ?? ''), 10, bg)
      band(finder, `N${r}:O${r}`, ref('Valor NF-e', excelDecimal(d?.valor)), 11, bg).numFmt = BRL
      band(finder, `P${r}:P${r}`, formula(`IF(${selected}="","",HYPERLINK("#'Notas'!A"&(${selected}+8),"Abrir"))`, n ? 'Abrir' : ''), 11, bg, C.mid)
      finder.getRow(r).height = 40
    }
    band(finder, 'A36:P37', formula('IF(Painel!A11=0,"Nenhuma nota corresponde aos filtros. Volte ao Painel e ajuste o recorte.",IF(($C$6-1)*25>=Painel!A11,"Esta página não tem resultados. Volte para a página 1.","Clique em Abrir para acessar a linha da NF-e. Na aba Notas, use os links para itens, tributos, parcelas, eventos e campos XML."))', count ? 'Clique em Abrir para acessar a linha da NF-e. Na aba Notas, use os links para itens, tributos, parcelas, eventos e campos XML.' : 'Nenhuma nota corresponde aos filtros. Volte ao Painel e ajuste o recorte.'), 12, C.sage)
    finder.pageSetup.printArea = 'A1:P37'; finder.pageSetup.fitToHeight = 1
  }

  function buildGuide() {
    const ws = base('Guia', 'GUIA  /  UM ACERVO, VÁRIAS LEITURAS', `${input.cliente.nome} · Exportação ${stamp} · ALETIS`, true)
    const instructions = [
      ['COMECE PELO PAINEL', 'Edite os campos amarelos: emissão inicial/final, vínculo, situação e texto. Deixe as datas/texto vazios e selecione Todas para restaurar o recorte completo. A busca ignora maiúsculas/minúsculas; use a grafia e os acentos do documento.'],
      ['BUSQUE SEM PERCORRER LINHAS', 'Buscar apresenta 25 resultados por página. Altere a página na célula amarela C6. A pesquisa inclui chave, NSU, número, partes, CPF/CNPJ, natureza, produtos, NCM, CFOP e informações adicionais.'],
      ['FILTRE E ORDENE AS BASES', 'Notas, Itens, Tributos e demais bases são Tabelas do Excel com filtros de texto, data e número. Use as setas dos cabeçalhos, Ctrl+F e os links de detalhe. Notas tem subtotais que acompanham as linhas visíveis. Os filtros dessas tabelas são independentes dos filtros do Painel.'],
      ['ENTENDA OS VALORES', 'Os indicadores somam uma NF-e por chave e somente XML integrais autorizados. Resumos, canceladas e denegadas ficam na base para conferência. Valor NF-e usa vNF; Total com reforma expõe vNFTot separadamente. Não some os dois campos. Não inferimos crédito tributário, saldo devedor, pagamento ou receita contábil.'],
      ['PRESERVE IDENTIFICADORES', 'Chaves, CPF/CNPJ, NSU, códigos e protocolos são texto para preservar todos os dígitos e zeros iniciais. Valores com mais de 15 dígitos significativos ficam em texto nas bases detalhadas. Valor exato e Campos XML preservam a representação original. Campo vazio significa ausente, e zero significa zero informado.'],
      ['CONSULTE A ORIGEM', 'Registros traz os identificadores, SHA-256 e nomes dos XML para cruzamento com o ZIP do mesmo filtro. Campos XML contém os campos fiscais, inclusive extensões do leiaute, organizados pelo caminho de origem. Valores longos usam várias linhas na coluna Parte. Assinaturas e certificados não integram a planilha.'],
      ['ATUALIZAÇÃO E COMPATIBILIDADE', 'Arquivo sem macros. As fórmulas usam recursos do Excel 2016 ou superior. Abra com cálculo automático habilitado. O acervo corresponde ao instante do download; para incluir novas notas, baixe novamente. A leitura dos XML não substitui a verificação criptográfica da assinatura.'],
      ['ESCOPO DO DOWNLOAD', 'Exporta todas as páginas dos filtros aplicados no CRM/portal. Os filtros do Painel refinam somente os dados que estão neste arquivo. Eventos respeitam o filtro exportado, mas a situação fiscal incorpora cancelamentos vinculados conhecidos no acervo. Um resumo exportado isoladamente não ganha detalhes de XML fora do filtro.'],
    ]
    let row = 6
    for (const [title, text] of instructions) { band(ws, `A${row}:D${row + 2}`, title, 12, C.sage, C.green); band(ws, `E${row}:P${row + 2}`, text, 11, C.cream); row += 4 }
    band(ws, `A${row}:P${row}`, 'ÍNDICE DAS ABAS · clique para abrir', 15, C.green, C.white); row += 2
    for (const entry of catalog) { band(ws, `A${row}:D${row + 1}`, link(entry.sheet, 1, entry.sheet), 12, C.sage); band(ws, `E${row}:P${row + 1}`, entry.description, 11, C.cream); row += 3 }
    band(ws, `A${row}:P${row}`, 'FILTROS APLICADOS NA EXPORTAÇÃO', 15, C.green, C.white); row += 2
    const filterNames: Record<string, string> = { busca: 'Busca', tipo: 'Tipo', direcao: 'Vínculo', situacao: 'Situação', anos: 'Anos selecionados', inicio: 'Emissão de', fim: 'Emissão até', minimo: 'Valor mínimo', maximo: 'Valor máximo', processamento: 'Encaminhamento CRM' }
    for (const [key, label] of Object.entries(filterNames)) { band(ws, `A${row}:D${row}`, label, 11, C.sage); band(ws, `E${row}:P${row}`, String(input.filters[key] ?? '') || 'Sem restrição', 11); row += 2 }
    band(ws, `A${row}:P${row + 1}`, `${count} notas únicas · ${input.records.length} registros · ${itemRows.length} itens · ${model.events.length} eventos · ${model.fields.length} campos de origem. Fontes: ${sources.join('; ')}. Limites: 5.000 registros, 25 MB de XML, 25.000 itens e 150.000 campos, sem truncamento silencioso.`, 11, C.sage)
    ws.pageSetup.printArea = `A1:P${row + 1}`
  }
}
