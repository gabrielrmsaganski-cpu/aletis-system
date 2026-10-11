// ============================================================
// XlsmExporter — gera xlsm preenchido a partir dos dados do
// sistema, preservando 100% do VBA + fórmulas + estilos.
// ============================================================
// Estratégia:
//   1. Lê o template original R.OP.001 v2.0 (ou v1.0) de
//      apps/api/src/services/processo-assessoria/templates/
//   2. Abre via pizzip (mantém VBA, fórmulas, charts, estilos)
//   3. Substitui células-alvo no XML do worksheet por inlineStr
//      ou número conforme o tipo
//   4. Devolve buffer pronto para download
// ============================================================
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import PizZip from 'pizzip'
import type {
  GfGrupo, GfMembro, GfCulturaSafra, GfCustoSafra,
  GfDemanda, GfContratoDivida, GfAtivoFazenda,
  GfPassivoOutro, GfGarantia, GfPremissa,
} from '../../db/schema.js'
import { getGestaoFinanceiraService } from './GestaoFinanceiraService.js'
import { getGestaoFinanceiraServiceV2 } from './GestaoFinanceiraServiceV2.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const TEMPLATES_DIR = join(__dirname, '../processo-assessoria/templates')

export interface ExportXlsmInput {
  grupoId: string
  /** v1 = R.OP.001 v1.0 (17 sheets) | v2 = R.OP.001 v2.0 Registro Gestão (28 sheets) */
  versao?: 'v1' | 'v2'
}

export interface ExportXlsmResult {
  buffer: Buffer
  filename: string
  contentType: string
  templateUsed: string
  cellsWritten: number
}

/** Escape XML — caracteres especiais. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

interface CellWrite {
  sheet: string
  addr: string                // ex: "C18"
  value: string | number | null
  type: 'text' | 'number'
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const raw = String(value).trim()
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw
  const n = typeof value === 'number' ? value : parseFloat(normalized)
  return isFinite(n) ? n : null
}

/** Constrói lista de células a injetar com base nos dados do grupo. */
function buildCellWrites(args: {
  grupo: GfGrupo
  membros: GfMembro[]
  culturas: GfCulturaSafra[]
  custos: GfCustoSafra[]
  demandas: GfDemanda[]
  contratos: GfContratoDivida[]
  fazendas: GfAtivoFazenda[]
  passivosOutros: GfPassivoOutro[]
  garantias: GfGarantia[]
  premissas: GfPremissa[]
  versao: 'v1' | 'v2'
}): CellWrite[] {
  const writes: CellWrite[] = []
  const { grupo, membros, culturas, custos, demandas, contratos, fazendas, passivosOutros, garantias, premissas, versao } = args

  // Mapping de células conforme versão
  const sheetCadastro = versao === 'v2' ? '3 - Cadastro' : 'Cadastro'
  const sheetSafra = versao === 'v2' ? '7 - Safra' : 'Safra'
  const sheetCustos = versao === 'v2' ? '6 - Custos do Cliente' : 'Custos do Cliente'
  const sheetDemandas = versao === 'v2' ? '5 - Demandas' : 'Crédito'
  const sheetEndividamento = versao === 'v2' ? '10 - Endividamento' : 'Endividamento'
  const sheetAtivos = versao === 'v2' ? '8 - Ativos' : 'Ativos'
  const sheetPassivos = versao === 'v2' ? '11 - Passivos' : 'Passivos'
  const sheetGarantias = versao === 'v2' ? '14 - Garantias' : 'Garantias'
  const sheetPremissas = versao === 'v2' ? '13 - PREMISSAS(PADRONIZAR)' : 'Premissas'

  // ── 3 - Cadastro
  // C18 (v2) ou C17 (v1) = Nome do Grupo
  writes.push({ sheet: sheetCadastro, addr: versao === 'v2' ? 'D15' : 'C18', value: grupo.nomeGrupo, type: 'text' })
  writes.push({ sheet: sheetCadastro, addr: versao === 'v2' ? 'D17' : 'C15', value: grupo.dataBase, type: 'text' })
  if (grupo.historico) {
    writes.push({ sheet: sheetCadastro, addr: versao === 'v2' ? 'C34' : 'C24', value: grupo.historico.slice(0, 1000), type: 'text' })
  }

  // Membros — bloco C19+ na v1, C21..C32 na v2 (named range NOME)
  const membroStartRow = versao === 'v2' ? 21 : 19
  for (let i = 0; i < Math.min(membros.length, 12); i++) {
    const m = membros[i]
    const r = membroStartRow + i
    writes.push({ sheet: sheetCadastro, addr: `C${r}`, value: m.nome, type: 'text' })
    if (m.cpfCnpj) writes.push({ sheet: sheetCadastro, addr: `D${r}`, value: m.cpfCnpj, type: 'text' })
    if (m.tipoRelacao) writes.push({ sheet: sheetCadastro, addr: `E${r}`, value: m.tipoRelacao, type: 'text' })
    writes.push({ sheet: sheetCadastro, addr: `F${r}`, value: m.atuaAtividade ? 'Sim' : 'Não', type: 'text' })
  }

  // ── Demandas — sheet 5 na v2, Crédito na v1
  // Linha 19+ (cabeçalho na 18)
  for (let i = 0; i < Math.min(demandas.length, 6); i++) {
    const d = demandas[i]
    const r = 19 + i
    if (d.numero != null) writes.push({ sheet: sheetDemandas, addr: `C${r}`, value: d.numero, type: 'number' })
    if (d.data) writes.push({ sheet: sheetDemandas, addr: `D${r}`, value: d.data, type: 'text' })
    if (d.tomador) writes.push({ sheet: sheetDemandas, addr: `E${r}`, value: d.tomador, type: 'text' })
    if (d.credor) writes.push({ sheet: sheetDemandas, addr: `F${r}`, value: d.credor, type: 'text' })
    if (d.finalidade) writes.push({ sheet: sheetDemandas, addr: `G${r}`, value: d.finalidade, type: 'text' })
    if (d.modalidade) writes.push({ sheet: sheetDemandas, addr: `H${r}`, value: d.modalidade, type: 'text' })
    if (d.valor != null) writes.push({ sheet: sheetDemandas, addr: `I${r}`, value: parseFloat(String(d.valor)), type: 'number' })
    if (d.garantias) writes.push({ sheet: sheetDemandas, addr: `J${r}`, value: d.garantias, type: 'text' })
    if (d.prazo) writes.push({ sheet: sheetDemandas, addr: `K${r}`, value: d.prazo, type: 'text' })
    if (d.parecerTex) writes.push({ sheet: sheetDemandas, addr: `L${r}`, value: d.parecerTex, type: 'text' })
    if (d.status) writes.push({ sheet: sheetDemandas, addr: `Q${r}`, value: d.status, type: 'text' })
  }

  // ── Endividamento — linha 23+ (cabeçalho 19/20)
  for (let i = 0; i < Math.min(contratos.length, 70); i++) {
    const c = contratos[i]
    const r = 23 + i
    writes.push({ sheet: sheetEndividamento, addr: `C${r}`, value: c.credor, type: 'text' })
    if (c.emitente) writes.push({ sheet: sheetEndividamento, addr: `D${r}`, value: c.emitente, type: 'text' })
    if (c.garantiaVinculada) writes.push({ sheet: sheetEndividamento, addr: `E${r}`, value: c.garantiaVinculada, type: 'text' })
    if (c.contrato) writes.push({ sheet: sheetEndividamento, addr: `G${r}`, value: c.contrato, type: 'text' })
    if (c.valorLiberado != null) writes.push({ sheet: sheetEndividamento, addr: `H${r}`, value: parseFloat(String(c.valorLiberado)), type: 'number' })
    if (c.valorFinanciado != null) writes.push({ sheet: sheetEndividamento, addr: `I${r}`, value: parseFloat(String(c.valorFinanciado)), type: 'number' })
    if (c.parcelaCapitalAmortizar != null) writes.push({ sheet: sheetEndividamento, addr: `L${r}`, value: parseFloat(String(c.parcelaCapitalAmortizar)), type: 'number' })
    if (c.valorParcelaFixa != null) writes.push({ sheet: sheetEndividamento, addr: `M${r}`, value: parseFloat(String(c.valorParcelaFixa)), type: 'number' })
    if (c.periodicidade) writes.push({ sheet: sheetEndividamento, addr: `N${r}`, value: c.periodicidade, type: 'text' })
    if (c.metodoCalculo) writes.push({ sheet: sheetEndividamento, addr: `O${r}`, value: c.metodoCalculo, type: 'text' })
    if (c.enquadramento) writes.push({ sheet: sheetEndividamento, addr: `P${r}`, value: c.enquadramento, type: 'text' })
    if (c.finalidade) writes.push({ sheet: sheetEndividamento, addr: `Q${r}`, value: c.finalidade, type: 'text' })
    if (c.prazoParcelas != null) writes.push({ sheet: sheetEndividamento, addr: `R${r}`, value: c.prazoParcelas, type: 'number' })
    if (c.dataContratacao) writes.push({ sheet: sheetEndividamento, addr: `S${r}`, value: c.dataContratacao, type: 'text' })
    if (c.primeiraParcela) writes.push({ sheet: sheetEndividamento, addr: `T${r}`, value: c.primeiraParcela, type: 'text' })
    if (c.ultimaParcela) writes.push({ sheet: sheetEndividamento, addr: `U${r}`, value: c.ultimaParcela, type: 'text' })
    if (c.parcelasPagas != null) writes.push({ sheet: sheetEndividamento, addr: `V${r}`, value: c.parcelasPagas, type: 'number' })
    if (c.taxaNominalAa != null) writes.push({ sheet: sheetEndividamento, addr: `X${r}`, value: parseFloat(String(c.taxaNominalAa)), type: 'number' })
    if (c.cetAnual != null) writes.push({ sheet: sheetEndividamento, addr: `AF${r}`, value: parseFloat(String(c.cetAnual)), type: 'number' })
    if (c.indexador) writes.push({ sheet: sheetEndividamento, addr: `AB${r}`, value: c.indexador, type: 'text' })
    if (c.valorPresente != null) writes.push({ sheet: sheetEndividamento, addr: `AJ${r}`, value: parseFloat(String(c.valorPresente)), type: 'number' })
    if (c.valorPresenteAtualizado != null) writes.push({ sheet: sheetEndividamento, addr: `AK${r}`, value: parseFloat(String(c.valorPresenteAtualizado)), type: 'number' })
  }

  // ── Ativos / Fazendas — linha 30+ (v2) ou 25+ (v1)
  const fazRow0 = versao === 'v2' ? 30 : 25
  for (let i = 0; i < Math.min(fazendas.length, 67); i++) {
    const f = fazendas[i]
    const r = fazRow0 + i
    writes.push({ sheet: sheetAtivos, addr: `C${r}`, value: f.fazenda, type: 'text' })
    if (f.proprietario) writes.push({ sheet: sheetAtivos, addr: `D${r}`, value: f.proprietario, type: 'text' })
    if (f.matricula) writes.push({ sheet: sheetAtivos, addr: `E${r}`, value: f.matricula, type: 'text' })
    if (f.cidade) writes.push({ sheet: sheetAtivos, addr: `F${r}`, value: f.cidade, type: 'text' })
    if (f.estado) writes.push({ sheet: sheetAtivos, addr: `G${r}`, value: f.estado, type: 'text' })
    if (f.areaTotalHa != null) writes.push({ sheet: sheetAtivos, addr: `H${r}`, value: parseFloat(String(f.areaTotalHa)), type: 'number' })
    if (f.areaPlantioHa != null) writes.push({ sheet: sheetAtivos, addr: `J${r}`, value: parseFloat(String(f.areaPlantioHa)), type: 'number' })
    if (f.valorHaMercado != null) writes.push({ sheet: sheetAtivos, addr: `V${r}`, value: parseFloat(String(f.valorHaMercado)), type: 'number' })
    if (f.valorHaForcado != null) writes.push({ sheet: sheetAtivos, addr: `X${r}`, value: parseFloat(String(f.valorHaForcado)), type: 'number' })
    if (f.nrCcir) writes.push({ sheet: sheetAtivos, addr: `Z${r}`, value: f.nrCcir, type: 'text' })
    if (f.nrItr) writes.push({ sheet: sheetAtivos, addr: `AA${r}`, value: f.nrItr, type: 'text' })
    if (f.nrCar) writes.push({ sheet: sheetAtivos, addr: `AC${r}`, value: f.nrCar, type: 'text' })
  }

  // ── Passivos não bancários — espelha importador da aba 11
  let fornecedorRow = 22
  let dividendosRow = 22
  let arrendamentoRow = 22
  for (const p of passivosOutros) {
    if ((p.tipo === 'fornecedor' || p.tipo === 'fiscal' || p.tipo === 'trabalhista' || p.tipo === 'outro') && fornecedorRow <= 85) {
      const r = fornecedorRow++
      writes.push({ sheet: sheetPassivos, addr: `AM${r}`, value: p.credor ?? p.descricao, type: 'text' })
      if (p.observacoes) writes.push({ sheet: sheetPassivos, addr: `AN${r}`, value: p.observacoes, type: 'text' })
      if (p.finalidade) writes.push({ sheet: sheetPassivos, addr: `AO${r}`, value: p.finalidade, type: 'text' })
      if (p.vencimento) writes.push({ sheet: sheetPassivos, addr: `AP${r}`, value: p.vencimento, type: 'text' })
      const valor = num(p.valor)
      if (valor !== null) writes.push({ sheet: sheetPassivos, addr: `AQ${r}`, value: valor, type: 'number' })
    } else if ((p.tipo === 'dividendos' || p.tipo === 'pro_labore') && dividendosRow <= 85) {
      const r = dividendosRow++
      const valor = num(p.valor)
      if (valor !== null) {
        writes.push({ sheet: sheetPassivos, addr: p.tipo === 'dividendos' ? `AS${r}` : `AT${r}`, value: valor, type: 'number' })
      }
    } else if (p.tipo === 'arrendamento' && arrendamentoRow <= 85) {
      const r = arrendamentoRow++
      writes.push({ sheet: sheetPassivos, addr: `AV${r}`, value: p.descricao, type: 'text' })
      if (p.vencimento) writes.push({ sheet: sheetPassivos, addr: `BB${r}`, value: p.vencimento, type: 'text' })
      if (p.valor) {
        const valor = num(p.valor)
        if (valor !== null) writes.push({ sheet: sheetPassivos, addr: `BH${r}`, value: valor, type: 'number' })
      }
      if (p.observacoes) writes.push({ sheet: sheetPassivos, addr: `AX${r}`, value: p.observacoes, type: 'text' })
    }
  }

  // ── Garantias — aba 14
  for (let i = 0; i < Math.min(garantias.length, 64); i++) {
    const g = garantias[i]
    const r = 22 + i
    if (g.matricula) writes.push({ sheet: sheetGarantias, addr: `C${r}`, value: g.matricula, type: 'text' })
    writes.push({ sheet: sheetGarantias, addr: `D${r}`, value: g.descricao, type: 'text' })
    const area = num(g.areaHa)
    if (area !== null) writes.push({ sheet: sheetGarantias, addr: `F${r}`, value: area, type: 'number' })
    const valorMercado = num(g.valorMercado)
    if (valorMercado !== null) writes.push({ sheet: sheetGarantias, addr: `H${r}`, value: valorMercado, type: 'number' })
    const valorForcado = num(g.valorForcado)
    if (valorForcado !== null) writes.push({ sheet: sheetGarantias, addr: `I${r}`, value: valorForcado, type: 'number' })
    if (g.contratoVinculado) writes.push({ sheet: sheetGarantias, addr: `P${r}`, value: g.contratoVinculado, type: 'text' })
    if (g.registrosAverbacoes) writes.push({ sheet: sheetGarantias, addr: `T${r}`, value: g.registrosAverbacoes, type: 'text' })
    if (g.baixasAditivos) writes.push({ sheet: sheetGarantias, addr: `U${r}`, value: g.baixasAditivos, type: 'text' })
    if (g.observacoes) writes.push({ sheet: sheetGarantias, addr: `V${r}`, value: g.observacoes, type: 'text' })
  }

  // ── Premissas gerais — bloco aberto para auditoria e reimportação
  for (let i = 0; i < Math.min(premissas.length, 80); i++) {
    const p = premissas[i]
    const r = 22 + i
    writes.push({ sheet: sheetPremissas, addr: `B${r}`, value: p.rotulo, type: 'text' })
    const valor = num(p.valor)
    writes.push({ sheet: sheetPremissas, addr: `C${r}`, value: valor ?? p.valor, type: valor === null ? 'text' : 'number' })
    if (p.unidade) writes.push({ sheet: sheetPremissas, addr: `D${r}`, value: p.unidade, type: 'text' })
    if (p.fonte) writes.push({ sheet: sheetPremissas, addr: `E${r}`, value: p.fonte, type: 'text' })
    if (p.observacoes) writes.push({ sheet: sheetPremissas, addr: `F${r}`, value: p.observacoes, type: 'text' })
  }

  // ── Custos do Cliente — bloco D19:I66 (insumos por cultura) ou D75:E96 (demais custos)
  // Por simplicidade, popula bloco "demais custos operacionais" linha 75+ e fixos 100+
  let opRow = 75
  let fixRow = 100
  for (const c of custos) {
    if (c.tipo === 'operacional' && opRow <= 96) {
      writes.push({ sheet: sheetCustos, addr: `D${opRow}`, value: c.descricao, type: 'text' })
      if (c.valorAnual != null) writes.push({ sheet: sheetCustos, addr: `E${opRow}`, value: parseFloat(String(c.valorAnual)), type: 'number' })
      if (c.valorMensal != null) writes.push({ sheet: sheetCustos, addr: `G${opRow}`, value: parseFloat(String(c.valorMensal)), type: 'number' })
      opRow++
    } else if (c.tipo === 'fixo' && fixRow <= 120) {
      writes.push({ sheet: sheetCustos, addr: `D${fixRow}`, value: c.descricao, type: 'text' })
      if (c.valorAnual != null) writes.push({ sheet: sheetCustos, addr: `E${fixRow}`, value: parseFloat(String(c.valorAnual)), type: 'number' })
      fixRow++
    }
  }

  // ── Safras — bloco "BaseSafra"-style replicado em "7 - Safra"
  // Linhas 50+ por cultura, com colunas E..I por cenário
  // Por simplicidade, escreve apenas o cenário "planejado" no bloco principal
  const safraGrupos = new Map<string, GfCulturaSafra[]>()
  for (const c of culturas) {
    const k = c.cultura
    if (!safraGrupos.has(k)) safraGrupos.set(k, [])
    safraGrupos.get(k)!.push(c)
  }
  let safraIdx = 0
  for (const [cultura, rows] of safraGrupos) {
    if (safraIdx >= 10) break
    const blockStart = 49 + safraIdx * 23
    writes.push({ sheet: sheetSafra, addr: `D${blockStart}`, value: safraIdx + 1, type: 'number' })
    writes.push({ sheet: sheetSafra, addr: `E${blockStart}`, value: cultura, type: 'text' })
    // Para cada safra, popula uma coluna (E..I)
    const colMap = ['E', 'F', 'G', 'H', 'I']
    rows.slice(0, 5).forEach((row, idx) => {
      const col = colMap[idx]
      if (!col) return
      writes.push({ sheet: sheetSafra, addr: `${col}${blockStart + 1}`, value: row.safra, type: 'text' })
      if (row.areaPropriaHa != null) writes.push({ sheet: sheetSafra, addr: `${col}${blockStart + 2}`, value: parseFloat(String(row.areaPropriaHa)), type: 'number' })
      if (row.areaArrendadaHa != null) writes.push({ sheet: sheetSafra, addr: `${col}${blockStart + 3}`, value: parseFloat(String(row.areaArrendadaHa)), type: 'number' })
      if (row.rendimentoScHa != null) writes.push({ sheet: sheetSafra, addr: `${col}${blockStart + 5}`, value: parseFloat(String(row.rendimentoScHa)), type: 'number' })
      if (row.precoMedioRs != null) writes.push({ sheet: sheetSafra, addr: `${col}${blockStart + 7}`, value: parseFloat(String(row.precoMedioRs)), type: 'number' })
      if (row.custoUnitarioInsumosRs != null) writes.push({ sheet: sheetSafra, addr: `${col}${blockStart + 8}`, value: parseFloat(String(row.custoUnitarioInsumosRs)), type: 'number' })
      if (row.arrendamentoBaseScHa != null) writes.push({ sheet: sheetSafra, addr: `${col}${blockStart + 9}`, value: parseFloat(String(row.arrendamentoBaseScHa)), type: 'number' })
    })
    safraIdx++
  }

  return writes
}

/** Aplica writes ao XLSM via PizZip + XML parsing. */
function applyWritesToZip(zip: PizZip, writes: CellWrite[]): number {
  const workbookXmlFile = zip.file('xl/workbook.xml')
  const workbookRelsFile = zip.file('xl/_rels/workbook.xml.rels')
  if (!workbookXmlFile || !workbookRelsFile) return 0

  const workbookXml = workbookXmlFile.asText()
  const workbookRels = workbookRelsFile.asText()

  // sheetName → r:id
  const nameToRid = new Map<string, string>()
  const sheetIdRe = /<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = sheetIdRe.exec(workbookXml)) !== null) {
    nameToRid.set(m[1], m[2])
  }
  // r:id → target
  const ridToTarget = new Map<string, string>()
  const relRe = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g
  while ((m = relRe.exec(workbookRels)) !== null) {
    ridToTarget.set(m[1], m[2])
  }

  // agrupa writes por sheet
  const bySheet = new Map<string, CellWrite[]>()
  for (const w of writes) {
    if (!bySheet.has(w.sheet)) bySheet.set(w.sheet, [])
    bySheet.get(w.sheet)!.push(w)
  }

  let written = 0
  for (const [sheet, ws] of bySheet) {
    const rId = nameToRid.get(sheet)
    if (!rId) continue
    const target = ridToTarget.get(rId)
    if (!target) continue
    const sheetPath = `xl/${target.replace(/^\/?xl\//, '')}`
    const sheetFile = zip.file(sheetPath)
    if (!sheetFile) continue
    let sheetXml = sheetFile.asText()

    for (const w of ws) {
      const addr = w.addr
      // Build replacement
      let replacement: string
      if (w.value === null || w.value === undefined || w.value === '') continue
      if (w.type === 'number') {
        const num = typeof w.value === 'number' ? w.value : parseFloat(String(w.value))
        if (!isFinite(num)) continue
        replacement = `<c r="${addr}"><v>${num}</v></c>`
      } else {
        replacement = `<c r="${addr}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(w.value))}</t></is></c>`
      }
      // Tenta substituir cell existente
      const cellRe = new RegExp(`<c[^>]*\\sr="${addr}"(?:[^>]*?\\/>|[^>]*?>[\\s\\S]*?</c>)`, 'g')
      let replaced = false
      const newXml = sheetXml.replace(cellRe, () => {
        replaced = true
        return replacement
      })
      if (replaced) {
        sheetXml = newXml
        written++
      } else {
        // Não existe — insere antes de </row> da linha correspondente
        const rowMatch = addr.match(/^([A-Z]+)(\d+)$/)
        if (!rowMatch) continue
        const rowNum = rowMatch[2]
        const rowRe = new RegExp(`(<row[^>]*r="${rowNum}"[^>]*>)([\\s\\S]*?)(</row>)`)
        const inserted = sheetXml.replace(rowRe, (_, openTag, inner, closeTag) => `${openTag}${inner}${replacement}${closeTag}`)
        if (inserted !== sheetXml) {
          sheetXml = inserted
          written++
        } else {
          // Linha não existe — adiciona antes de </sheetData>
          const sheetDataRe = /(<\/sheetData>)/
          const newSheetXml = sheetXml.replace(sheetDataRe, `<row r="${rowNum}">${replacement}</row>$1`)
          if (newSheetXml !== sheetXml) {
            sheetXml = newSheetXml
            written++
          }
        }
      }
    }
    zip.file(sheetPath, sheetXml)
  }

  return written
}

export async function exportarParaXlsm(input: ExportXlsmInput): Promise<ExportXlsmResult> {
  const versao = input.versao ?? 'v2'
  const templateName = versao === 'v2'
    ? 'R.OP.001_Registro_Gestao_Financeira_v2.xlsm'
    : 'R.OP.001_Diagnostico_Financeiro.xlsm'
  const templatePath = join(TEMPLATES_DIR, templateName)
  if (!existsSync(templatePath)) {
    throw new Error(`Template ${templateName} não encontrado em ${TEMPLATES_DIR}. Rode pnpm build:processo-templates`)
  }

  const svc = getGestaoFinanceiraService()
  const svcV2 = getGestaoFinanceiraServiceV2()
  const grupo = await svc.obterGrupo(input.grupoId)
  if (!grupo) throw new Error(`Grupo ${input.grupoId} não encontrado`)

  const [membros, culturas, custos, demandas, contratos, fazendas, passivosOutros, garantias, premissas] = await Promise.all([
    svc.listarMembros(input.grupoId),
    svc.listarCulturas(input.grupoId),
    svc.listarCustos(input.grupoId),
    svc.listarDemandas(input.grupoId),
    svc.listarContratos(input.grupoId),
    svc.listarFazendas(input.grupoId),
    svcV2.listarPassivosOutros(input.grupoId),
    svcV2.listarGarantias(input.grupoId),
    svcV2.listarPremissas(input.grupoId),
  ])

  const writes = buildCellWrites({
    grupo,
    membros,
    culturas,
    custos,
    demandas,
    contratos,
    fazendas,
    passivosOutros,
    garantias,
    premissas,
    versao,
  })

  const buf = readFileSync(templatePath)
  const zip = new PizZip(buf)
  const cellsWritten = applyWritesToZip(zip, writes)
  const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer

  const dia = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const nameSafe = grupo.nomeGrupo.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 40).trim().replace(/\s+/g, '_')
  const filename = `R.OP.001_${versao}__${nameSafe}__${dia}.xlsm`

  return {
    buffer: out,
    filename,
    contentType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    templateUsed: templateName,
    cellsWritten,
  }
}
