import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import PizZip from 'pizzip'
import { mutateOoxmlWorkbook, type OoxmlCellWrite } from './OoxmlWorkbookWriter.js'
import { generateExtendedBankFiles } from './ExtendedBankTemplateGenerator.js'
import { generateSupportingDocuments } from './SupportingDocumentGenerator.js'
import type {
  ArquivoBancarioGerado,
  ArrendamentoDossieInput,
  ClienteDossieInput,
  DadosCanonicosDossieInput,
  DividaDossieInput,
  MembroGrupoDossieInput,
  PecuariaDossieInput,
  PeriodoSafra,
  ProducaoDossieInput,
} from './types.js'
import type { BancoDossieId } from './manifest.js'

export interface GeneratorInput {
  banco: BancoDossieId
  sourceDir: string
  cliente: ClienteDossieInput
  dados: DadosCanonicosDossieInput
}

const BTG_CADASTRO_FILE = 'MODELO_CADASTRO BTG 2025_(Hevellyn).xlsx'
const BTG_PRODUCAO_FILE = 'Documentos Agro - Quadro de produção_MODELO BTG.xlsx'
const ITAU_QUESTIONARIO_FILE = 'MODELO QUADRO ITAU_Questionário de crédito - Itaú BBA Agro.xlsx'
const ITAU_BACEN_FILE = 'MODELO_BACEN_ITAU.docx'

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function fold(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function compactText(value: unknown, max = 300): string | undefined {
  if (value === null || value === undefined) return undefined
  const text = String(value).replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, max) : undefined
}

function finiteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = typeof value === 'number'
    ? value
    : Number(String(value).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}

function sanitizeFilename(value: string): string {
  return fold(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 70) || 'cliente'
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

function addText(writes: OoxmlCellWrite[], sheet: string, address: string, value: unknown): void {
  const text = compactText(value)
  if (text !== undefined) writes.push({ sheet, address, value: text, type: 'text', reason: 'data' })
}

function addNumber(writes: OoxmlCellWrite[], sheet: string, address: string, value: unknown): void {
  const number = finiteNumber(value)
  if (number !== undefined) writes.push({ sheet, address, value: number, type: 'number', reason: 'data' })
}

function addFormula(writes: OoxmlCellWrite[], sheet: string, address: string, formula: string): void {
  writes.push({ sheet, address, value: formula, type: 'formula', reason: 'formula' })
}

function clearCells(writes: OoxmlCellWrite[], sheet: string, rows: number[], columns: string[]): void {
  for (const row of rows) {
    for (const column of columns) {
      writes.push({ sheet, address: `${column}${row}`, value: null, reason: 'sanitize' })
    }
  }
}

function rowRange(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

function periodColumn(periodo: PeriodoSafra | undefined, mapping: Record<PeriodoSafra, string>): string {
  return mapping[periodo ?? 'atual']
}

function principalAndGroup(cliente: ClienteDossieInput, group: MembroGrupoDossieInput[] = []): MembroGrupoDossieInput[] {
  const principal: MembroGrupoDossieInput = {
    nome: cliente.nome,
    cpfCnpj: cliente.cpfCnpj,
    telefone: cliente.telefone,
    email: cliente.email,
    atuaAtividade: true,
  }
  const seen = new Set<string>()
  return [principal, ...group].filter((member) => {
    const key = fold(compactText(member.cpfCnpj) || compactText(member.nome) || '')
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function locationLabel(city?: string, uf?: string): string {
  return [compactText(city), compactText(uf)].filter(Boolean).join('/') || ''
}

function normalizedCurrency(currency?: string): string {
  const value = fold(compactText(currency) || 'brl')
  if (value.includes('usd') || value.includes('dolar') || value.includes('us$')) return 'US$ Mil'
  if (value.includes('soja') || value.includes('saca')) return 'Scs Soja'
  return 'R$ Mil'
}

function dueBuckets(debt: DividaDossieInput): [number, number, number] {
  const total = finiteNumber(debt.saldoDevedor) ?? 0
  const date = debt.vencimento ? new Date(debt.vencimento) : null
  if (!date || Number.isNaN(date.getTime())) return [0, 0, total]
  const days = (date.getTime() - Date.now()) / 86_400_000
  if (days <= 365) return [total, 0, 0]
  if (days <= 730) return [0, total, 0]
  return [0, 0, total]
}

function generateBtgCadastro(input: GeneratorInput): ArquivoBancarioGerado | null {
  const path = join(input.sourceDir, BTG_CADASTRO_FILE)
  if (!existsSync(path)) return null
  const writes: OoxmlCellWrite[] = []
  const { cliente, dados } = input
  const proposta = 'Proposta - Cadastro'

  clearCells(writes, proposta, rowRange(5, 7), ['B', 'C', 'D'])
  clearCells(writes, proposta, rowRange(11, 15), ['B', 'C'])
  clearCells(writes, proposta, rowRange(19, 27), ['B', 'C', 'D', 'E', 'F'])
  clearCells(writes, proposta, rowRange(32, 39), ['B', 'C', 'D', 'E', 'F'])
  clearCells(writes, proposta, rowRange(43, 48), ['B'])

  addText(writes, proposta, 'B5', dados.operacao?.cultura)
  addNumber(writes, proposta, 'C5', dados.operacao?.limiteSolicitado)
  addText(writes, proposta, 'D5', dados.operacao?.prazo)

  const activities = dados.atividades?.length
    ? dados.atividades
    : cliente.atividade ? [{ tipo: cliente.atividade }] : []
  activities.slice(0, 5).forEach((activity, index) => {
    addText(writes, proposta, `B${11 + index}`, activity.tipo)
    addNumber(writes, proposta, `C${11 + index}`, activity.receitaEstimada)
  })

  principalAndGroup(cliente, dados.grupoEconomico).slice(0, 9).forEach((member, index) => {
    const row = 19 + index
    addText(writes, proposta, `B${row}`, member.nome)
    addText(writes, proposta, `C${row}`, member.cpfCnpj)
    addNumber(writes, proposta, `D${row}`, member.participacaoPct)
    addText(writes, proposta, `E${row}`, member.telefone)
    addText(writes, proposta, `F${row}`, member.email)
  })

  const companies = [...(dados.empresas ?? [])]
  if (!companies.length && cliente.tipo === 'pessoa_juridica') {
    companies.push({
      razaoSocial: cliente.nome,
      cnpj: cliente.cpfCnpj,
      atividade: cliente.atividade,
    })
  }
  companies.slice(0, 8).forEach((company, index) => {
    const row = 32 + index
    addText(writes, proposta, `B${row}`, company.razaoSocial)
    addText(writes, proposta, `C${row}`, company.cnpj)
    addText(writes, proposta, `D${row}`, company.atividade)
    addNumber(writes, proposta, `F${row}`, company.faturamentoAnual)
  })
  addText(writes, proposta, 'B43', dados.operacao?.comentarios || cliente.observacoes)

  const ownSheet = 'Áreas Próprias'
  clearCells(writes, ownSheet, rowRange(3, 27), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'])
  ;(dados.propriedades ?? []).slice(0, 25).forEach((property, index) => {
    const row = 3 + index
    addText(writes, ownSheet, `A${row}`, property.fazenda)
    addText(writes, ownSheet, `B${row}`, property.proprietario)
    addText(writes, ownSheet, `C${row}`, property.car)
    addText(writes, ownSheet, `D${row}`, property.matricula)
    addText(writes, ownSheet, `E${row}`, locationLabel(property.municipio, property.uf))
    addNumber(writes, ownSheet, `F${row}`, property.areaTotalHa)
    addNumber(writes, ownSheet, `G${row}`, property.areaConsolidadaHa)
    addNumber(writes, ownSheet, `H${row}`, property.areaPlantioHa)
    addNumber(writes, ownSheet, `I${row}`, property.areaPastagemHa)
    addNumber(writes, ownSheet, `J${row}`, property.reservaLegalHa)
    addNumber(writes, ownSheet, `K${row}`, property.avaliacao)
    addText(writes, ownSheet, `L${row}`, property.onus)
  })

  const leaseSheet = 'Áreas Arrendadas'
  clearCells(writes, leaseSheet, rowRange(9, 28), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'])
  ;(dados.arrendamentos ?? []).slice(0, 20).forEach((lease, index) => {
    const row = 9 + index
    addText(writes, leaseSheet, `A${row}`, lease.fazenda)
    addText(writes, leaseSheet, `B${row}`, lease.proprietario)
    addText(writes, leaseSheet, `C${row}`, lease.car)
    addText(writes, leaseSheet, `D${row}`, lease.matricula)
    addText(writes, leaseSheet, `E${row}`, locationLabel(lease.municipio, lease.uf))
    addNumber(writes, leaseSheet, `F${row}`, lease.areaTotalHa)
    addNumber(writes, leaseSheet, `G${row}`, lease.areaArrendadaHa)
    addNumber(writes, leaseSheet, `H${row}`, lease.custoMensal)
    addText(writes, leaseSheet, `I${row}`, lease.vencimento)
  })

  const machineSheet = 'Máquinas'
  clearCells(writes, machineSheet, rowRange(11, 150), ['A', 'B', 'C', 'D', 'E', 'F'])
  ;(dados.maquinas ?? []).slice(0, 140).forEach((machine, index) => {
    const row = 11 + index
    addText(writes, machineSheet, `A${row}`, machine.tipo)
    addText(writes, machineSheet, `B${row}`, machine.descricao)
    addText(writes, machineSheet, `C${row}`, machine.marca)
    addNumber(writes, machineSheet, `D${row}`, machine.ano)
    addNumber(writes, machineSheet, `E${row}`, machine.valor)
    addText(writes, machineSheet, `F${row}`, machine.onus)
  })

  const buyerSheet = 'Clientes'
  clearCells(writes, buyerSheet, rowRange(5, 24), ['B', 'C', 'D', 'E', 'F'])
  ;(dados.compradores ?? []).slice(0, 20).forEach((buyer, index) => {
    const row = 5 + index
    addText(writes, buyerSheet, `B${row}`, buyer.nome)
    addText(writes, buyerSheet, `C${row}`, buyer.safra)
    addText(writes, buyerSheet, `D${row}`, buyer.cultura)
    addNumber(writes, buyerSheet, `E${row}`, buyer.volume)
    addNumber(writes, buyerSheet, `F${row}`, buyer.precoUnitario)
    if (row < 19) addFormula(writes, buyerSheet, `G${row}`, `F${row}*E${row}`)
  })

  const debtSheet = 'Dívidas'
  clearCells(writes, debtSheet, rowRange(14, 108), [
    'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S',
  ])
  ;(dados.dividas ?? []).slice(0, 95).forEach((debt, index) => {
    const row = 14 + index
    addText(writes, debtSheet, `B${row}`, debt.tomador || cliente.nome)
    addText(writes, debtSheet, `C${row}`, debt.documento || cliente.cpfCnpj)
    addText(writes, debtSheet, `D${row}`, debt.instituicao)
    addText(writes, debtSheet, `E${row}`, debt.tipoCredito)
    addText(writes, debtSheet, `F${row}`, debt.contratacao)
    addText(writes, debtSheet, `G${row}`, debt.vencimento)
    addText(writes, debtSheet, `H${row}`, debt.finalidade)
    addText(writes, debtSheet, `I${row}`, debt.moeda || 'BRL')
    addNumber(writes, debtSheet, `J${row}`, debt.taxaJuros)
    addNumber(writes, debtSheet, `K${row}`, debt.saldoDevedor)
    const amortizationColumns: Array<[keyof NonNullable<DividaDossieInput['amortizacoes']>, string]> = [
      ['2021', 'L'], ['2022', 'M'], ['2023', 'N'], ['2024', 'O'],
      ['2025', 'P'], ['2026', 'Q'], ['2027', 'R'], ['apos2027', 'S'],
    ]
    for (const [key, column] of amortizationColumns) {
      addNumber(writes, debtSheet, `${column}${row}`, debt.amortizacoes?.[key])
    }
  })

  clearCells(writes, debtSheet, rowRange(114, 125), ['B', 'C', 'D', 'E', 'F'])
  ;(dados.dividasTerras ?? []).slice(0, 12).forEach((debt, index) => {
    const row = 114 + index
    addText(writes, debtSheet, `B${row}`, debt.descricao)
    addNumber(writes, debtSheet, `C${row}`, debt.areaTotalHa)
    addNumber(writes, debtSheet, `D${row}`, debt.valorTotal)
    addText(writes, debtSheet, `E${row}`, debt.vencimentoFinal)
    addText(writes, debtSheet, `F${row}`, debt.formaPagamento)
  })
  clearCells(writes, debtSheet, rowRange(114, 124), ['I', 'J', 'K', 'L', 'M'])
  ;(dados.fornecedores ?? []).slice(0, 11).forEach((supplier, index) => {
    const row = 114 + index
    addText(writes, debtSheet, `I${row}`, supplier.nome)
    addNumber(writes, debtSheet, `L${row}`, supplier.valor)
    addText(writes, debtSheet, `M${row}`, supplier.vencimento)
  })

  mapBtgCadastroProduction(writes, dados.producoes ?? [])

  const result = mutateOoxmlWorkbook(readFileSync(path), writes)
  return {
    modeloId: 'btg-cadastro-2025',
    filename: `Cadastro_BTG_2025_${sanitizeFilename(cliente.nome || 'cliente')}_${dateStamp()}.xlsx`,
    buffer: result.buffer,
    contentType: XLSX_CONTENT_TYPE,
    celulasGravadas: result.written,
    celulasHigienizadas: result.sanitized,
    formulasAjustadas: result.formulas,
    observacoes: [
      'Template original preservado; saída gerada em uma nova cópia.',
      'Dados de exemplo das atividades foram removidos.',
      result.missing.length ? `${result.missing.length} células não estavam materializadas no XML e foram ignoradas.` : 'Todas as células mapeadas foram localizadas.',
    ],
  }
}

function mapBtgCadastroProduction(writes: OoxmlCellWrite[], productions: ProducaoDossieInput[]): void {
  const grainSheet = 'Produção (soja e milho)'
  const grainStarts = [3, 18, 34, 49, 64]
  const grainNames = new Set(['soja', 'milho', 'arroz', 'feijao', 'sorgo', 'trigo', 'milheto'])
  const groups = new Map<string, ProducaoDossieInput[]>()
  for (const production of productions) {
    const culture = fold(compactText(production.cultura) || '')
    if (!grainNames.has(culture)) continue
    const key = `${culture}|${fold(compactText(production.regiao) || '')}`
    const rows = groups.get(key) ?? []
    rows.push(production)
    groups.set(key, rows)
  }

  for (const start of grainStarts) {
    clearCells(writes, grainSheet, [start], ['B'])
    clearCells(writes, grainSheet, rowRange(start + 1, start + 9), ['C', 'D', 'E'])
    for (const column of ['C', 'D', 'E']) {
      addFormula(writes, grainSheet, `${column}${start + 2}`, `SUM(${column}${start + 3}:${column}${start + 4})`)
      addFormula(writes, grainSheet, `${column}${start + 7}`, `${column}${start + 2}*${column}${start + 6}`)
      addFormula(writes, grainSheet, `${column}${start + 10}`, `${column}${start + 8}*${column}${start + 7}`)
      addFormula(writes, grainSheet, `${column}${start + 11}`, `${column}${start + 9}*${column}${start + 2}`)
      addFormula(writes, grainSheet, `${column}${start + 12}`, `${column}${start + 10}-${column}${start + 11}`)
      addFormula(writes, grainSheet, `${column}${start + 13}`, `IFERROR(${column}${start + 12}/${column}${start + 10},0)`)
    }
  }

  Array.from(groups.values()).slice(0, grainStarts.length).forEach((rows, index) => {
    const start = grainStarts[index]
    const first = rows[0]
    addText(writes, grainSheet, `B${start}`, [
      compactText(first.cultura)?.toUpperCase(),
      compactText(first.regiao)?.toUpperCase(),
    ].filter(Boolean).join(' - '))
    for (const production of rows) {
      const column = periodColumn(production.periodo, { anterior: 'C', atual: 'D', planejada: 'E' })
      addText(writes, grainSheet, `${column}${start + 1}`, production.safra)
      addNumber(writes, grainSheet, `${column}${start + 3}`, production.areaPropriaHa)
      addNumber(writes, grainSheet, `${column}${start + 4}`, production.areaArrendadaHa)
      addNumber(writes, grainSheet, `${column}${start + 5}`, production.custoArrendamento)
      addNumber(writes, grainSheet, `${column}${start + 6}`, production.produtividade)
      addNumber(writes, grainSheet, `${column}${start + 8}`, production.precoUnitario)
      addNumber(writes, grainSheet, `${column}${start + 9}`, production.custoHa)
    }
  })

  const otherSheet = 'Produção (outras culturas)'
  const otherMaps: Record<string, { start: number; own: number; leased: number; yield: number; price: number; cost?: number }> = {
    'cana de acucar': { start: 3, own: 7, leased: 8, yield: 9, price: 12, cost: 13 },
    cafe: { start: 21, own: 24, leased: 25, yield: 26, price: 28, cost: 29 },
    feijao: { start: 35, own: 38, leased: 39, yield: 40, price: 42 },
    algodao: { start: 50, own: 53, leased: 54, yield: 56, price: 61, cost: 63 },
    arroz: { start: 69, own: 72, leased: 73, yield: 74, price: 76, cost: 77 },
  }
  for (const production of productions) {
    const map = otherMaps[fold(compactText(production.cultura) || '')]
    if (!map) continue
    const column = periodColumn(production.periodo, { anterior: 'C', atual: 'D', planejada: 'E' })
    addText(writes, otherSheet, `${column}${map.start + 1}`, production.safra)
    addNumber(writes, otherSheet, `${column}${map.own}`, production.areaPropriaHa)
    addNumber(writes, otherSheet, `${column}${map.leased}`, production.areaArrendadaHa)
    addNumber(writes, otherSheet, `${column}${map.yield}`, production.produtividade)
    addNumber(writes, otherSheet, `${column}${map.price}`, production.precoUnitario)
    if (map.cost) addNumber(writes, otherSheet, `${column}${map.cost}`, production.custoHa)
  }
}

function agriculturalRowsForBtg(period: PeriodoSafra): { main: Record<string, number>; others: number[] } {
  if (period === 'anterior') {
    return { main: { soja: 34, milho: 35 }, others: [40, 41, 42, 43, 44, 45] }
  }
  if (period === 'planejada') {
    return { main: { soja: 62, milho: 63 }, others: [68, 69, 70, 71, 72, 73] }
  }
  return { main: { soja: 6, milho: 7 }, others: [12, 13, 14, 15, 16, 17] }
}

function pecuaryRowsForBtg(period: PeriodoSafra): number[] {
  if (period === 'anterior') return [50, 51, 52, 53]
  if (period === 'planejada') return [78, 79, 80, 81]
  return [22, 23, 24, 25]
}

function leaseCost(production: ProducaoDossieInput): number | undefined {
  const direct = finiteNumber(production.custoArrendamento)
  if (direct !== undefined) return direct
  const area = finiteNumber(production.areaArrendadaHa)
  return area === undefined ? undefined : 0
}

function generateBtgProduction(input: GeneratorInput): ArquivoBancarioGerado | null {
  const path = join(input.sourceDir, BTG_PRODUCAO_FILE)
  if (!existsSync(path)) return null
  const sheet = 'PRODUÇÃO '
  const writes: OoxmlCellWrite[] = []
  const agriculturalRows = [6, 7, 12, 13, 14, 15, 16, 17, 34, 35, 40, 41, 42, 43, 44, 45, 62, 63, 68, 69, 70, 71, 72, 73]
  const pecuaryRows = [22, 23, 24, 25, 50, 51, 52, 53, 78, 79, 80, 81]

  clearCells(writes, sheet, agriculturalRows, ['C', 'D', 'F', 'H', 'J', 'L'])
  clearCells(writes, sheet, [12, 13, 14, 15, 16, 17, 40, 41, 42, 43, 44, 45, 68, 69, 70, 71, 72, 73], ['B'])
  clearCells(writes, sheet, pecuaryRows, ['C', 'D', 'E', 'G', 'I', 'J', 'M'])
  clearCells(writes, sheet, [28, 29, 56, 57, 84, 85], ['E'])
  clearCells(writes, sheet, [88], ['A'])

  for (const row of agriculturalRows) {
    addFormula(writes, sheet, `E${row}`, `SUM(C${row}:D${row})`)
    addFormula(writes, sheet, `G${row}`, `E${row}*F${row}`)
    addFormula(writes, sheet, `I${row}`, `G${row}*H${row}`)
    addFormula(writes, sheet, `K${row}`, `E${row}*J${row}`)
    addFormula(writes, sheet, `M${row}`, `I${row}-K${row}-L${row}`)
  }
  for (const row of pecuaryRows) {
    addFormula(writes, sheet, `F${row}`, `D${row}*E${row}`)
    addFormula(writes, sheet, `H${row}`, `F${row}*G${row}`)
    addFormula(writes, sheet, `K${row}`, `I${row}*C${row}`)
    addFormula(writes, sheet, `L${row}`, `J${row}+K${row}`)
    addFormula(writes, sheet, `N${row}`, `H${row}-L${row}-M${row}`)
  }

  const usedOtherRows = new Set<number>()
  for (const production of input.dados.producoes ?? []) {
    const period = production.periodo ?? 'atual'
    const map = agriculturalRowsForBtg(period)
    const culture = fold(compactText(production.cultura) || '')
    let row: number | undefined = map.main[culture]
    if (!row) {
      row = map.others.find((candidate) => !usedOtherRows.has(candidate))
      if (!row) continue
      usedOtherRows.add(row)
      addText(writes, sheet, `B${row}`, production.cultura)
    }
    addNumber(writes, sheet, `C${row}`, production.areaPropriaHa)
    addNumber(writes, sheet, `D${row}`, production.areaArrendadaHa)
    addNumber(writes, sheet, `F${row}`, production.produtividade)
    addNumber(writes, sheet, `H${row}`, production.precoUnitario)
    addNumber(writes, sheet, `J${row}`, production.custoHa)
    addNumber(writes, sheet, `L${row}`, leaseCost(production))
  }

  const usedPecuaryRows = new Set<number>()
  for (const livestock of input.dados.pecuaria ?? []) {
    const candidates = pecuaryRowsForBtg(livestock.periodo ?? 'atual')
    const preferred = candidates.find((row) => {
      const label = fold(compactText(livestock.tipoAnimal) || '')
      return (label.includes('bezer') && [22, 50, 78].includes(row))
        || (label.includes('novilh') && [23, 51, 79].includes(row))
        || (label.includes('boi') && [24, 52, 80].includes(row))
        || (label.includes('vaca') && [25, 53, 81].includes(row))
    })
    const row = preferred && !usedPecuaryRows.has(preferred)
      ? preferred
      : candidates.find((candidate) => !usedPecuaryRows.has(candidate))
    if (!row) continue
    usedPecuaryRows.add(row)
    addNumber(writes, sheet, `C${row}`, livestock.quantidadeTotal)
    addNumber(writes, sheet, `D${row}`, livestock.quantidadeComercializada)
    addNumber(writes, sheet, `E${row}`, livestock.pesoArrobas)
    addNumber(writes, sheet, `G${row}`, livestock.precoArroba)
    addNumber(writes, sheet, `I${row}`, livestock.custeioAnimalAno)
    addNumber(writes, sheet, `J${row}`, livestock.custoReposicao)
    addNumber(writes, sheet, `M${row}`, livestock.custoArrendamento)
  }

  const cycles = new Map<PeriodoSafra, string[]>()
  for (const livestock of input.dados.pecuaria ?? []) {
    const period = livestock.periodo ?? 'atual'
    const list = cycles.get(period) ?? []
    if (livestock.ciclo) list.push(livestock.ciclo)
    cycles.set(period, list)
  }
  addText(writes, sheet, 'E28', Array.from(new Set(cycles.get('atual') ?? [])).join(', '))
  addText(writes, sheet, 'E56', Array.from(new Set(cycles.get('anterior') ?? [])).join(', '))
  addText(writes, sheet, 'E84', Array.from(new Set(cycles.get('planejada') ?? [])).join(', '))
  addText(writes, sheet, 'A88', [
    input.dados.operacao?.comentarios,
    input.cliente.observacoes,
  ].filter(Boolean).join('\n'))

  const result = mutateOoxmlWorkbook(readFileSync(path), writes)
  return {
    modeloId: 'btg-quadro-producao',
    filename: `Quadro_Producao_BTG_${sanitizeFilename(input.cliente.nome || 'cliente')}_${dateStamp()}.xlsx`,
    buffer: result.buffer,
    contentType: XLSX_CONTENT_TYPE,
    celulasGravadas: result.written,
    celulasHigienizadas: result.sanitized,
    formulasAjustadas: result.formulas,
    observacoes: [
      'Valor de exemplo 640 removido.',
      'Fórmulas agrícolas e pecuárias completadas nas três safras.',
      'Cópia OOXML gerada sem reserializar o workbook.',
      result.missing.length ? `${result.missing.length} células não materializadas foram ignoradas.` : 'Todas as células mapeadas foram localizadas.',
    ],
  }
}

function itauProductionBlocks(productions: ProducaoDossieInput[]): Array<{ start: number; rows: ProducaoDossieInput[] }> {
  const pools = {
    cotton: [100, 111],
    coffee: [122, 134],
    orange: [146, 158],
    cane: [170, 182],
    generic: [10, 20, 30, 40, 50, 60, 70, 80, 90, 194, 203, 212, 221, 230],
  }
  const used = new Set<number>()
  const grouped = new Map<string, ProducaoDossieInput[]>()
  for (const production of productions) {
    const key = `${fold(compactText(production.cultura) || '')}|${fold(compactText(production.regiao) || '')}`
    const list = grouped.get(key) ?? []
    list.push(production)
    grouped.set(key, list)
  }

  const output: Array<{ start: number; rows: ProducaoDossieInput[] }> = []
  for (const rows of grouped.values()) {
    const culture = fold(compactText(rows[0]?.cultura) || '')
    const pool = culture.includes('algod') ? pools.cotton
      : culture.includes('cafe') ? pools.coffee
        : culture.includes('laranja') ? pools.orange
          : culture.includes('cana') ? pools.cane
            : pools.generic
    const start = pool.find((candidate) => !used.has(candidate))
    if (!start) continue
    used.add(start)
    output.push({ start, rows })
  }
  return output
}

function writeItauProductionValues(writes: OoxmlCellWrite[], start: number, production: ProducaoDossieInput): void {
  const column = periodColumn(production.periodo, { anterior: 'I', atual: 'J', planejada: 'K' })
  const culture = fold(compactText(production.cultura) || '')
  const area = (finiteNumber(production.areaPropriaHa) ?? 0) + (finiteNumber(production.areaArrendadaHa) ?? 0)

  if (culture.includes('cafe') || culture.includes('laranja')) {
    addNumber(writes, 'Questionário_Safra', `${column}${start + 1}`, area || undefined)
    addNumber(writes, 'Questionário_Safra', `${column}${start + 3}`, production.produtividade)
    addNumber(writes, 'Questionário_Safra', `${column}${start + 4}`, production.precoUnitario)
    addNumber(writes, 'Questionário_Safra', `${column}${start + 5}`, production.percentualFixado)
    addNumber(writes, 'Questionário_Safra', `${column}${start + 7}`, production.percentualColheita)
    addNumber(writes, 'Questionário_Safra', `${column}${start + 10}`, production.precoUnitario)
    return
  }
  if (culture.includes('cana')) {
    addNumber(writes, 'Questionário_Safra', `${column}${start + 1}`, area || undefined)
    addNumber(writes, 'Questionário_Safra', `${column}${start + 2}`, production.produtividade)
    addNumber(writes, 'Questionário_Safra', `${column}${start + 4}`, production.percentualColheita)
    addNumber(writes, 'Questionário_Safra', `${column}${start + 10}`, production.precoUnitario)
    return
  }

  addNumber(writes, 'Questionário_Safra', `${column}${start + 1}`, area || undefined)
  addNumber(writes, 'Questionário_Safra', `${column}${start + 2}`, production.produtividade)
  addNumber(writes, 'Questionário_Safra', `${column}${start + 3}`, production.precoUnitario)
  addNumber(writes, 'Questionário_Safra', `${column}${start + 4}`, production.percentualFixado)
  addNumber(writes, 'Questionário_Safra', `${column}${start + 5}`, production.percentualPlantio)
  addNumber(writes, 'Questionário_Safra', `${column}${start + 6}`, production.percentualColheita)
  if (area && finiteNumber(production.produtividade) !== undefined) {
    addNumber(writes, 'Questionário_Safra', `${column}${start + 7}`, area * (finiteNumber(production.produtividade) ?? 0) / 1000)
  }
  addNumber(writes, 'Questionário_Safra', `${column}${start + 8}`, production.precoUnitario)
}

function generateItauQuestionnaire(input: GeneratorInput): ArquivoBancarioGerado | null {
  const path = join(input.sourceDir, ITAU_QUESTIONARIO_FILE)
  if (!existsSync(path)) return null
  const writes: OoxmlCellWrite[] = []
  const { cliente, dados } = input

  clearCells(writes, 'Dados', rowRange(13, 37), ['C', 'K', 'M', 'O'])
  principalAndGroup(cliente, dados.grupoEconomico).slice(0, 25).forEach((member, index) => {
    const row = 13 + index
    addText(writes, 'Dados', `C${row}`, member.nome)
    addText(writes, 'Dados', `K${row}`, member.cpfCnpj)
    addText(writes, 'Dados', `M${row}`, member.parentesco)
    addText(writes, 'Dados', `O${row}`, member.atuaAtividade === undefined ? undefined : member.atuaAtividade ? 'Sim' : 'Não')
  })

  const blocks = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 111, 122, 134, 146, 158, 170, 182, 194, 203, 212, 221, 230]
  for (const start of blocks) {
    clearCells(writes, 'Questionário_Safra', [start], ['C', 'D', 'E', 'F', 'L'])
    const nextStart = blocks.find((candidate) => candidate > start) ?? 240
    clearCells(writes, 'Questionário_Safra', rowRange(start + 1, Math.min(nextStart - 2, start + 10)), ['I', 'J', 'K', 'L'])
  }
  for (const block of itauProductionBlocks(dados.producoes ?? [])) {
    const first = block.rows[0]
    addText(writes, 'Questionário_Safra', `C${block.start}`, first.cultura)
    addText(writes, 'Questionário_Safra', `E${block.start}`, first.sistema)
    addText(writes, 'Questionário_Safra', `F${block.start}`, first.regiao || locationLabel(cliente.cidade, cliente.uf))
    addText(writes, 'Questionário_Safra', `L${block.start}`, first.observacoes)
    block.rows.forEach((production) => writeItauProductionValues(writes, block.start, production))
  }

  clearCells(writes, 'Questionário_Safra', [240, 245, 250], ['D', 'E', 'F', 'L'])
  clearCells(writes, 'Questionário_Safra', [241, 242, 243, 246, 247, 248, 251, 252, 253], ['I', 'J', 'K', 'L'])
  ;(dados.pecuaria ?? []).slice(0, 3).forEach((livestock, index) => {
    const start = [240, 245, 250][index]
    const column = periodColumn(livestock.periodo, { anterior: 'I', atual: 'J', planejada: 'K' })
    addText(writes, 'Questionário_Safra', `D${start}`, livestock.sistemaCriacao)
    addText(writes, 'Questionário_Safra', `E${start}`, livestock.ciclo)
    addText(writes, 'Questionário_Safra', `F${start}`, livestock.regiao || locationLabel(cliente.cidade, cliente.uf))
    addText(writes, 'Questionário_Safra', `L${start}`, livestock.observacoes)
    addNumber(writes, 'Questionário_Safra', `${column}${start + 1}`, livestock.areaHa)
    addNumber(writes, 'Questionário_Safra', `${column}${start + 2}`, livestock.quantidadeComercializada)
    addNumber(writes, 'Questionário_Safra', `${column}${start + 3}`, livestock.precoArroba)
  })

  clearCells(writes, 'Situação Patrimonial - Ativos', rowRange(27, 32), ['C', 'D', 'E', 'G'])
  ;(dados.pecuaria ?? []).slice(0, 6).forEach((livestock, index) => {
    const row = 27 + index
    addText(writes, 'Situação Patrimonial - Ativos', `C${row}`, livestock.sistemaCriacao || livestock.ciclo)
    addText(writes, 'Situação Patrimonial - Ativos', `D${row}`, livestock.tipoAnimal)
    addNumber(writes, 'Situação Patrimonial - Ativos', `E${row}`, livestock.quantidadeTotal)
  })

  const propertyRows = [38, 39, 40, 41, 42, 43, 44, 45, 48]
  clearCells(writes, 'Situação Patrimonial - Ativos', propertyRows, ['C', 'D', 'E', 'F', 'G', 'H', 'I'])
  ;(dados.propriedades ?? []).slice(0, propertyRows.length).forEach((property, index) => {
    const row = propertyRows[index]
    addText(writes, 'Situação Patrimonial - Ativos', `C${row}`, property.fazenda)
    addText(writes, 'Situação Patrimonial - Ativos', `D${row}`, locationLabel(property.municipio, property.uf))
    addText(writes, 'Situação Patrimonial - Ativos', `E${row}`, cliente.atividade)
    addText(writes, 'Situação Patrimonial - Ativos', `F${row}`, property.capacidadeProdutiva)
    addNumber(writes, 'Situação Patrimonial - Ativos', `G${row}`, property.reservaLegalHa)
    addNumber(writes, 'Situação Patrimonial - Ativos', `H${row}`, property.areaPlantioHa)
    addNumber(writes, 'Situação Patrimonial - Ativos', `I${row}`, property.areaPossivelAbertaHa)
  })

  clearCells(writes, 'Situação Patrimonial - Ativos', rowRange(54, 67), ['C', 'D', 'E', 'F', 'G', 'H'])
  ;(dados.arrendamentos ?? []).slice(0, 14).forEach((lease, index) => {
    const row = 54 + index
    addText(writes, 'Situação Patrimonial - Ativos', `C${row}`, lease.fazenda)
    addText(writes, 'Situação Patrimonial - Ativos', `D${row}`, locationLabel(lease.municipio, lease.uf))
    addText(writes, 'Situação Patrimonial - Ativos', `E${row}`, lease.vencimento)
    addNumber(writes, 'Situação Patrimonial - Ativos', `F${row}`, lease.areaArrendadaHa)
    addText(writes, 'Situação Patrimonial - Ativos', `G${row}`, lease.unidadePagamento || 'Sacas de Soja')
    addNumber(writes, 'Situação Patrimonial - Ativos', `H${row}`, lease.custoScHa)
  })

  clearCells(writes, 'Situação Patrimonial - Passivos', rowRange(11, 30), ['C', 'D', 'E', 'F', 'G'])
  for (const row of rowRange(11, 30)) addFormula(writes, 'Situação Patrimonial - Passivos', `H${row}`, `E${row}-F${row}-G${row}`)
  ;(dados.dividas ?? []).slice(0, 20).forEach((debt, index) => {
    const row = 11 + index
    const [shortTerm, mediumTerm] = dueBuckets(debt)
    addText(writes, 'Situação Patrimonial - Passivos', `C${row}`, debt.instituicao)
    addText(writes, 'Situação Patrimonial - Passivos', `D${row}`, normalizedCurrency(debt.moeda))
    addNumber(writes, 'Situação Patrimonial - Passivos', `E${row}`, (finiteNumber(debt.saldoDevedor) ?? 0) / 1000)
    addNumber(writes, 'Situação Patrimonial - Passivos', `F${row}`, shortTerm / 1000)
    addNumber(writes, 'Situação Patrimonial - Passivos', `G${row}`, mediumTerm / 1000)
  })

  clearCells(writes, 'Intenção de Investimentos', rowRange(9, 14), ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'])
  for (const row of rowRange(9, 14)) addFormula(writes, 'Intenção de Investimentos', `K${row}`, `F${row}-SUM(G${row}:J${row})`)
  ;(dados.investimentos ?? []).slice(0, 6).forEach((investment, index) => {
    const row = 9 + index
    addText(writes, 'Intenção de Investimentos', `B${row}`, investment.descricao)
    addText(writes, 'Intenção de Investimentos', `C${row}`, investment.dataPrevista)
    addNumber(writes, 'Intenção de Investimentos', `D${row}`, investment.areaTotalHa)
    addText(writes, 'Intenção de Investimentos', `E${row}`, investment.unidadePagamento || 'R$ Mil')
    addNumber(writes, 'Intenção de Investimentos', `F${row}`, (finiteNumber(investment.valorTotal) ?? 0) / 1000)
    ;(investment.amortizacoes ?? []).slice(0, 4).forEach((value, valueIndex) => {
      addNumber(writes, 'Intenção de Investimentos', `${['G', 'H', 'I', 'J'][valueIndex]}${row}`, value / 1000)
    })
  })

  const result = mutateOoxmlWorkbook(readFileSync(path), writes)
  return {
    modeloId: 'itau-questionario-agro',
    filename: `Questionario_Itau_BBA_Agro_${sanitizeFilename(cliente.nome || 'cliente')}_${dateStamp()}.xlsx`,
    buffer: result.buffer,
    contentType: XLSX_CONTENT_TYPE,
    celulasGravadas: result.written,
    celulasHigienizadas: result.sanitized,
    formulasAjustadas: result.formulas,
    observacoes: [
      'Exemplos de produção, pecuária e patrimônio removidos da cópia.',
      'Valores monetários patrimoniais convertidos para R$ mil conforme o cabeçalho do Itaú.',
      'Validações, desenhos e estrutura OOXML preservados sem passagem por openpyxl/ExcelJS.',
      result.missing.length ? `${result.missing.length} células não materializadas foram ignoradas.` : 'Todas as células mapeadas foram localizadas.',
    ],
  }
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function replaceDocxParagraph(xml: string, marker: string, value: string): { xml: string; replaced: boolean } {
  let replaced = false
  const next = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (replaced || !paragraph.includes(marker)) return paragraph
    let wroteText = false
    const updated = paragraph.replace(/<w:t\b([^>]*)>[\s\S]*?<\/w:t>/g, (_textNode, attrs: string) => {
      if (wroteText) return `<w:t${attrs}></w:t>`
      wroteText = true
      return `<w:t${attrs} xml:space="preserve">${xmlEscape(value)}</w:t>`
    })
    if (wroteText) replaced = true
    return updated
  })
  return { xml: next, replaced }
}

function formatLongDate(dateValue?: string): string {
  const date = dateValue ? new Date(`${dateValue}T12:00:00Z`) : new Date()
  const safe = Number.isNaN(date.getTime()) ? new Date() : date
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(safe)
  return `${String(safe.getUTCDate()).padStart(2, '0')} de ${month} de ${safe.getUTCFullYear()}`
}

function generateItauBacen(input: GeneratorInput): ArquivoBancarioGerado | null {
  const path = join(input.sourceDir, ITAU_BACEN_FILE)
  if (!existsSync(path)) return null
  const zip = new PizZip(readFileSync(path))
  const documentFile = zip.file('word/document.xml')
  if (!documentFile) return null

  const name = compactText(input.cliente.nome) || 'CLIENTE ALETIS'
  const document = compactText(input.cliente.cpfCnpj) || 'A PREENCHER'
  const documentType = document.replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF'
  const address = [
    compactText(input.cliente.endereco),
    locationLabel(input.cliente.cidade, input.cliente.uf),
    input.cliente.cep ? `CEP: ${compactText(input.cliente.cep)}` : undefined,
  ].filter(Boolean).join(' - ') || 'endereço a preencher'
  const legalText = [
    'Nos termos da Resolução nº 4.571/17 do Conselho Monetário Nacional,',
    `${name}, inscrito(a) no ${documentType} sob o nº ${document}, residente e domiciliado(a) em ${address},`,
    'autoriza o Banco Itaú BBA S.A., o Itaú Unibanco S.A., o Itauleasing S.A., as sociedades do Conglomerado Itaú Unibanco e as demais instituições aptas a consultar o Sistema de Informações de Crédito (“SCR”) nos termos da regulamentação, a consultar no SCR informações a seu respeito.',
  ].join(' ')
  const dateLine = `${locationLabel(input.cliente.cidade, input.cliente.uf) || 'Local a preencher'}, ${formatLongDate(input.dados.dataBase)}.`

  let xml = documentFile.asText()
  let replacements = 0
  for (const [marker, value] of [
    ['ANDRE LAGUNA DEFENTE', legalText],
    ['Primavera do Leste/MT, 27 de Março de 2024.', dateLine],
    ['Nome:', `Nome: ${name}`],
    ['CPF/CNPJ Nº', `CPF/CNPJ Nº ${document}`],
  ] as const) {
    const result = replaceDocxParagraph(xml, marker, value)
    xml = result.xml
    if (result.replaced) replacements++
  }
  zip.file('word/document.xml', xml)
  const buffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer

  return {
    modeloId: 'itau-bacen',
    filename: `Autorizacao_BACEN_Itau_${sanitizeFilename(name)}_${dateStamp()}.docx`,
    buffer,
    contentType: DOCX_CONTENT_TYPE,
    celulasGravadas: replacements,
    celulasHigienizadas: replacements,
    formulasAjustadas: 0,
    observacoes: [
      'Nome, documento, endereço, local e data de exemplo foram substituídos.',
      'Texto regulatório remanescente do modelo original foi preservado.',
      'Documento deve passar por conferência jurídica e assinatura antes do envio.',
    ],
  }
}

export function generateBankFiles(input: GeneratorInput): ArquivoBancarioGerado[] {
  const files: Array<ArquivoBancarioGerado | null> = []
  if (input.banco === 'btg') {
    files.push(generateBtgCadastro(input), generateBtgProduction(input))
  }
  if (input.banco === 'itau') {
    files.push(generateItauQuestionnaire(input), generateItauBacen(input))
  }
  files.push(...generateExtendedBankFiles(input))
  files.push(...generateSupportingDocuments(input))
  return files.filter((file): file is ArquivoBancarioGerado => file !== null)
}
