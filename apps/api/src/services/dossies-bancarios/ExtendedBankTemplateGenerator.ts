import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import PizZip from 'pizzip'
import { mutateOoxmlWorkbook, type OoxmlCellWrite } from './OoxmlWorkbookWriter.js'
import type { GeneratorInput } from './BankTemplateGenerator.js'
import type {
  ArquivoBancarioGerado,
  DividaDossieInput,
  MembroGrupoDossieInput,
  ProducaoDossieInput,
} from './types.js'

const DAYCOVAL_FILE = '2026.02.03 - Cadastro Agro Daycoval 2025 - ATUALIZACAO 26.xlsx'
const SANTANDER_FILE = 'Cadastro Santander - Agronegócios (versão 3.2).xlsm'
const BOCOM_FILE = 'Cadastro_BOCOM BBM.xlsm'
const BOCOM_LETTER_FILE = '_Carta PDEV_Cadastro Positivo_CAD_CPR.docx'
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const XLSM_TYPE = 'application/vnd.ms-excel.sheet.macroEnabled.12'
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

interface ProductionLayout {
  sheet: string
  starts: number[]
  labelColumn: string
  regionColumn?: string
  columns: { anterior: string[]; atual: string[]; planejada: string[] }
  offsets: {
    safra: number
    propria: number
    arrendada: number
    produtividade: number
    preco: number
    custo?: number
    custoOutros?: number
  }
  observationColumn?: string
  observationRows?: number
  blockMatches?: Record<number, string[]>
  offsetOverrides?: Record<number, Partial<ProductionLayout['offsets']>>
  regionAtBlockEnd?: boolean
  lastRow?: number
}

interface LivestockLayout {
  sheet: string
  columns: { anterior: string[]; atual: string[]; planejada: string[] }
  blocks: {
    suinos: number
    leite: number
    aves: number
  }
  observationColumn?: string
}

function fold(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function text(value: unknown, max = 600): string | undefined {
  if (value === null || value === undefined) return undefined
  const normalized = String(value).replace(/\s+/g, ' ').trim()
  return normalized ? normalized.slice(0, max) : undefined
}

function numberValue(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}

function safeName(value: string): string {
  return fold(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 70) || 'cliente'
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

function rows(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

function clear(writes: OoxmlCellWrite[], sheet: string, rowList: number[], columns: string[]): void {
  for (const row of rowList) {
    for (const column of columns) {
      writes.push({ sheet, address: `${column}${row}`, value: null, reason: 'sanitize' })
    }
  }
}

function addText(writes: OoxmlCellWrite[], sheet: string, address: string, value: unknown): void {
  const normalized = text(value)
  if (normalized !== undefined) writes.push({ sheet, address, value: normalized, type: 'text', reason: 'data' })
}

function addNumber(writes: OoxmlCellWrite[], sheet: string, address: string, value: unknown): void {
  const normalized = numberValue(value)
  if (normalized !== undefined) writes.push({ sheet, address, value: normalized, type: 'number', reason: 'data' })
}

function addFormula(writes: OoxmlCellWrite[], sheet: string, address: string, value: string): void {
  writes.push({ sheet, address, value, type: 'formula', reason: 'formula' })
}

function location(city?: string, uf?: string): string | undefined {
  return text([city, uf].filter(Boolean).join('/'))
}

function groupMembers(input: GeneratorInput): MembroGrupoDossieInput[] {
  const principal: MembroGrupoDossieInput = {
    nome: input.cliente.nome,
    cpfCnpj: input.cliente.cpfCnpj,
    atuaAtividade: true,
  }
  const unique = new Map<string, MembroGrupoDossieInput>()
  for (const member of [principal, ...(input.dados.grupoEconomico ?? [])]) {
    const key = fold(text(member.cpfCnpj) || text(member.nome) || '')
    if (key) unique.set(key, { ...(unique.get(key) ?? {}), ...member })
  }
  return [...unique.values()]
}

function companies(input: GeneratorInput) {
  const result = [...(input.dados.empresas ?? [])]
  if (input.cliente.tipo === 'pessoa_juridica') {
    result.unshift({
      razaoSocial: input.cliente.nome,
      cnpj: input.cliente.cpfCnpj,
      atividade: input.cliente.atividade,
    })
  }
  const unique = new Map<string, (typeof result)[number]>()
  for (const company of result) {
    const key = fold(text(company.cnpj) || text(company.razaoSocial) || '')
    if (key) unique.set(key, { ...(unique.get(key) ?? {}), ...company })
  }
  return [...unique.values()]
}

function writeRiskCadastro(
  input: GeneratorInput,
  writes: OoxmlCellWrite[],
  config: {
    pfStart: number
    pfEnd: number
    pjStart: number
    pjEnd: number
    observations: string
    dateCell?: string
    signatureCell?: string
    bocom?: boolean
  },
): void {
  const sheet = 'Cadastro'
  const cols = config.bocom ? ['C', 'D', 'E', 'F', 'G'] : ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']
  clear(writes, sheet, rows(config.pfStart, config.pfEnd), cols)
  clear(writes, sheet, rows(config.pjStart, config.pjEnd), cols)
  clear(writes, sheet, [Number(config.observations.replace(/\D/g, ''))], [config.observations.replace(/\d/g, '')])
  if (config.dateCell) addText(writes, sheet, config.dateCell, input.dados.dataBase)
  if (config.signatureCell) {
    clear(writes, sheet, [Number(config.signatureCell.replace(/\D/g, ''))], [config.signatureCell.replace(/\d/g, '')])
    addText(writes, sheet, config.signatureCell, input.cliente.nome)
  }

  groupMembers(input).slice(0, config.pfEnd - config.pfStart + 1).forEach((member, index) => {
    const row = config.pfStart + index
    addText(writes, sheet, `C${row}`, member.nome)
    addText(writes, sheet, `D${row}`, member.cpfCnpj)
    addNumber(writes, sheet, `E${row}`, member.idade)
    if (config.bocom) {
      addText(writes, sheet, `F${row}`, member.atuaAtividade === false ? 'Não' : 'Sim')
      addText(writes, sheet, `G${row}`, member.parentesco)
      return
    }
    addText(writes, sheet, `F${row}`, member.restricoes)
    addNumber(writes, sheet, `G${row}`, member.bacenTotal)
    addNumber(writes, sheet, `H${row}`, member.curtoPrazo)
    if (member.longoPrazo !== undefined) addNumber(writes, sheet, `I${row}`, member.longoPrazo)
    else addFormula(writes, sheet, `I${row}`, `G${row}-H${row}`)
    addNumber(writes, sheet, `J${row}`, member.coobrigacoes)
    addNumber(writes, sheet, `K${row}`, member.moedaEstrangeira)
  })

  companies(input).slice(0, config.pjEnd - config.pjStart + 1).forEach((company, index) => {
    const row = config.pjStart + index
    addText(writes, sheet, `C${row}`, company.razaoSocial)
    addText(writes, sheet, `D${row}`, company.cnpj)
    addText(writes, sheet, `E${row}`, company.atividade)
    if (config.bocom) {
      addText(writes, sheet, `F${row}`, input.dados.grupoEconomico?.map((member) =>
        [member.nome, member.participacaoPct === undefined ? '' : `${member.participacaoPct}%`].filter(Boolean).join(' '),
      ).join('; '))
      return
    }
    addText(writes, sheet, `F${row}`, company.restricoes)
    addNumber(writes, sheet, `G${row}`, company.bacenTotal)
    addNumber(writes, sheet, `H${row}`, company.curtoPrazo)
    if (company.longoPrazo !== undefined) addNumber(writes, sheet, `I${row}`, company.longoPrazo)
    else addFormula(writes, sheet, `I${row}`, `G${row}-H${row}`)
    addNumber(writes, sheet, `J${row}`, company.coobrigacoes)
    addNumber(writes, sheet, `K${row}`, company.moedaEstrangeira)
  })
  addText(writes, sheet, config.observations, input.dados.operacao?.comentarios || input.cliente.observacoes)
}

function productionGroups(productions: ProducaoDossieInput[]): ProducaoDossieInput[][] {
  const grouped = new Map<string, ProducaoDossieInput[]>()
  for (const item of productions) {
    const key = `${fold(text(item.cultura) || 'outra')}|${fold(text(item.regiao) || '')}`
    const group = grouped.get(key) ?? []
    group.push(item)
    grouped.set(key, group)
  }
  return [...grouped.values()]
}

function writeProduction(
  writes: OoxmlCellWrite[],
  productions: ProducaoDossieInput[],
  layout: ProductionLayout,
): void {
  const allInputColumns = [...new Set([
    ...layout.columns.anterior,
    ...layout.columns.atual,
    ...layout.columns.planejada,
  ])]
  for (const [blockIndex, start] of layout.starts.entries()) {
    const blockOffsets = { ...layout.offsets, ...(layout.offsetOverrides?.[start] ?? {}) }
    const offsets = [
      blockOffsets.safra,
      blockOffsets.propria,
      blockOffsets.arrendada,
      blockOffsets.produtividade,
      blockOffsets.preco,
      blockOffsets.custo,
      blockOffsets.custoOutros,
    ].filter((value): value is number => value !== undefined)
    clear(writes, layout.sheet, offsets.map((offset) => start + offset), allInputColumns)
    if (layout.regionAtBlockEnd && layout.regionColumn) {
      const end = layout.starts[blockIndex + 1] ? layout.starts[blockIndex + 1] - 1 : (layout.lastRow ?? start + 13)
      clear(writes, layout.sheet, [end], [layout.regionColumn])
    }
    if (layout.observationColumn) {
      clear(
        writes,
        layout.sheet,
        rows(start, start + (layout.observationRows ?? 12)),
        [layout.observationColumn],
      )
    }
  }

  const availableStarts = [...layout.starts]
  productionGroups(productions).slice(0, layout.starts.length).forEach((group) => {
    const normalizedCulture = fold(text(group[0]?.cultura) || '')
    const matching = availableStarts
      .map((start) => ({
        start,
        score: (layout.blockMatches?.[start] ?? [])
          .filter((match) => match === '*' || normalizedCulture.includes(fold(match)))
          .reduce((score, match) => Math.max(score, match === '*' ? 1 : fold(match).length + 1), 0),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
    const start = matching[0]?.start ?? availableStarts[0]
    if (start === undefined) return
    availableStarts.splice(availableStarts.indexOf(start), 1)
    const blockIndex = layout.starts.indexOf(start)
    const blockOffsets = { ...layout.offsets, ...(layout.offsetOverrides?.[start] ?? {}) }
    addText(writes, layout.sheet, `${layout.labelColumn}${start}`, group[0]?.cultura || 'Outra cultura')
    if (layout.regionColumn) {
      const regionRow = layout.regionAtBlockEnd
        ? (layout.starts[blockIndex + 1] ? layout.starts[blockIndex + 1] - 1 : (layout.lastRow ?? start + 13))
        : start
      addText(writes, layout.sheet, `${layout.regionColumn}${regionRow}`, group[0]?.regiao)
    }
    const used = { anterior: 0, atual: 0, planejada: 0 }
    for (const item of group) {
      const period = item.periodo ?? 'atual'
      const available = layout.columns[period]
      const column = available[Math.min(used[period], available.length - 1)]
      used[period]++
      addText(writes, layout.sheet, `${column}${start + blockOffsets.safra}`, item.safra)
      addNumber(writes, layout.sheet, `${column}${start + blockOffsets.propria}`, item.areaPropriaHa)
      addNumber(writes, layout.sheet, `${column}${start + blockOffsets.arrendada}`, item.areaArrendadaHa)
      addNumber(writes, layout.sheet, `${column}${start + blockOffsets.produtividade}`, item.produtividade)
      addNumber(writes, layout.sheet, `${column}${start + blockOffsets.preco}`, item.precoUnitario)
      if (blockOffsets.custo !== undefined) {
        addNumber(writes, layout.sheet, `${column}${start + blockOffsets.custo}`, item.custoHa)
      }
      if (blockOffsets.custoOutros !== undefined) {
        addNumber(writes, layout.sheet, `${column}${start + blockOffsets.custoOutros}`, item.custoHa)
      }
      if (layout.observationColumn) {
        addText(writes, layout.sheet, `${layout.observationColumn}${start + 1}`, item.observacoes)
      }
    }
  })
}

function writeLivestock(input: GeneratorInput, writes: OoxmlCellWrite[], layout: LivestockLayout): void {
  const columns = [...new Set([
    ...layout.columns.anterior,
    ...layout.columns.atual,
    ...layout.columns.planejada,
  ])]
  const inputOffsets = {
    suinos: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    leite: [1, 2, 3, 6, 7, 9],
    aves: [1, 2, 3, 4],
  }
  for (const type of ['suinos', 'leite', 'aves'] as const) {
    const start = layout.blocks[type]
    clear(writes, layout.sheet, inputOffsets[type].map((offset) => start + offset), columns)
    if (layout.observationColumn) {
      clear(writes, layout.sheet, [start + 1], [layout.observationColumn])
    }
  }

  const used = {
    suinos: { anterior: 0, atual: 0, planejada: 0 },
    leite: { anterior: 0, atual: 0, planejada: 0 },
    aves: { anterior: 0, atual: 0, planejada: 0 },
  }
  for (const item of input.dados.pecuaria ?? []) {
    const normalized = fold(text(item.tipoAnimal) || '')
    const type = /leit|lactic/.test(normalized)
      ? 'leite'
      : /avi|frango|galinha/.test(normalized)
        ? 'aves'
        : /suin|porc/.test(normalized)
          ? 'suinos'
          : null
    if (!type) continue
    const period = item.periodo ?? 'atual'
    const available = layout.columns[period]
    const column = available[Math.min(used[type][period], available.length - 1)]
    used[type][period]++
    const start = layout.blocks[type]
    addText(writes, layout.sheet, `${column}${start + 1}`, input.dados.dataBase)
    if (type === 'suinos') {
      addNumber(writes, layout.sheet, `${column}${start + 8}`, item.quantidadeTotal)
      addNumber(writes, layout.sheet, `${column}${start + 9}`, item.precoArroba)
      addNumber(writes, layout.sheet, `${column}${start + 10}`, item.custeioAnimalAno)
    } else if (type === 'leite') {
      addNumber(writes, layout.sheet, `${column}${start + 2}`, item.quantidadeTotal)
      addNumber(writes, layout.sheet, `${column}${start + 3}`, item.quantidadeComercializada)
      addNumber(writes, layout.sheet, `${column}${start + 6}`, item.precoArroba)
      addNumber(writes, layout.sheet, `${column}${start + 7}`, item.custeioAnimalAno)
    } else {
      addNumber(writes, layout.sheet, `${column}${start + 2}`, item.quantidadeTotal)
      addNumber(writes, layout.sheet, `${column}${start + 3}`, item.precoArroba)
      addNumber(writes, layout.sheet, `${column}${start + 4}`, item.custeioAnimalAno)
    }
    if (layout.observationColumn) {
      addText(writes, layout.sheet, `${layout.observationColumn}${start + 1}`, item.observacoes)
    }
  }
}

function writeProperties(
  writes: OoxmlCellWrite[],
  input: GeneratorInput,
  config: {
    start: number
    end: number
    cityStateCombined?: boolean
    bocom?: boolean
  },
): void {
  const sheet = 'Ativos'
  clear(writes, sheet, rows(config.start, config.end), rows(2, config.bocom ? 18 : 13).map((index) =>
    String.fromCharCode(64 + index),
  ))
  ;(input.dados.propriedades ?? []).slice(0, config.end - config.start + 1).forEach((property, index) => {
    const row = config.start + index
    addText(writes, sheet, `B${row}`, property.fazenda)
    addText(writes, sheet, `C${row}`, property.proprietario)
    addText(writes, sheet, `D${row}`, property.matricula || property.car)
    addText(writes, sheet, `E${row}`, config.cityStateCombined ? location(property.municipio, property.uf) : property.municipio)
    if (config.bocom) {
      addNumber(writes, sheet, `G${row}`, property.areaTotalHa)
      addNumber(writes, sheet, `H${row}`, property.areaPlantioHa)
      addNumber(writes, sheet, `I${row}`, property.areaIrrigadaHa)
      addNumber(writes, sheet, `J${row}`, property.areaPastagemHa)
      addNumber(writes, sheet, `K${row}`, property.reservaLegalHa)
      addText(writes, sheet, `L${row}`, property.onus)
      addNumber(writes, sheet, `M${row}`, property.avaliacao)
      return
    }
    addText(writes, sheet, `F${row}`, property.uf)
    addNumber(writes, sheet, `G${row}`, property.areaTotalHa)
    addNumber(writes, sheet, `H${row}`, property.areaPlantioHa)
    addNumber(writes, sheet, `I${row}`, property.areaIrrigadaHa)
    addNumber(writes, sheet, `J${row}`, property.areaPastagemHa)
    addNumber(writes, sheet, `K${row}`, property.reservaLegalHa)
    addNumber(writes, sheet, `L${row}`, property.avaliacao)
    addText(writes, sheet, `M${row}`, property.livreOnus ?? !property.onus ? 'Sim' : 'Não')
  })
}

function normalizedRate(value: unknown): number | undefined {
  const rate = numberValue(value)
  if (rate === undefined) return undefined
  return Math.abs(rate) > 1 ? rate / 100 : rate
}

function debtSchedule(debt: DividaDossieInput, years: Array<number | 'after'>): number[] {
  const explicit = debt.amortizacoes as Record<string, number | undefined> | undefined
  if (explicit && Object.values(explicit).some((value) => numberValue(value) !== undefined)) {
    return years.map((year) => {
      if (year === 'after') {
        return Object.entries(explicit)
          .filter(([key]) => key.startsWith('apos'))
          .reduce((sum, [, value]) => sum + (numberValue(value) ?? 0), 0)
      }
      return numberValue(explicit[String(year)]) ?? 0
    })
  }
  const total = numberValue(debt.saldoDevedor) ?? 0
  const dueYear = debt.vencimento ? new Date(debt.vencimento).getUTCFullYear() : NaN
  return years.map((year) => {
    if (year === 'after') return !Number.isFinite(dueYear) || dueYear > Math.max(...years.filter((item): item is number => item !== 'after')) ? total : 0
    return dueYear === year ? total : 0
  })
}

function writeDebts(
  writes: OoxmlCellWrite[],
  input: GeneratorInput,
  config: {
    start: number
    end: number
    totalColumn: string
    scheduleColumns: string[]
    years: Array<number | 'after'>
    hasBorrower: boolean
  },
): void {
  const sheet = 'Passivos'
  const preTotalColumns = config.hasBorrower
    ? ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
    : ['B', 'C', 'D', 'E', 'F', 'G', 'H']
  clear(writes, sheet, rows(config.start, config.end), [...preTotalColumns, ...config.scheduleColumns])
  ;(input.dados.dividas ?? []).slice(0, config.end - config.start + 1).forEach((debt, index) => {
    const row = config.start + index
    let offset = 0
    addText(writes, sheet, `B${row}`, debt.instituicao)
    if (config.hasBorrower) {
      addText(writes, sheet, `C${row}`, debt.tomador)
      offset = 1
    }
    const columns = config.hasBorrower
      ? { modality: 'D', currency: 'E', purpose: 'F', start: 'G', due: 'H', rate: 'I' }
      : { modality: 'C', currency: 'D', purpose: 'E', start: 'F', due: 'G', rate: 'H' }
    void offset
    addText(writes, sheet, `${columns.modality}${row}`, debt.tipoCredito)
    addText(writes, sheet, `${columns.currency}${row}`, debt.moeda || 'BRL')
    addText(writes, sheet, `${columns.purpose}${row}`, debt.finalidade)
    addText(writes, sheet, `${columns.start}${row}`, debt.contratacao)
    addText(writes, sheet, `${columns.due}${row}`, debt.vencimento)
    addNumber(writes, sheet, `${columns.rate}${row}`, normalizedRate(debt.taxaJuros))
    debtSchedule(debt, config.years).forEach((amount, scheduleIndex) => {
      addNumber(writes, sheet, `${config.scheduleColumns[scheduleIndex]}${row}`, amount)
    })
    addFormula(
      writes,
      sheet,
      `${config.totalColumn}${row}`,
      `SUM(${config.scheduleColumns[0]}${row}:${config.scheduleColumns.at(-1)}${row})`,
    )
  })
}

function writeLeases(
  writes: OoxmlCellWrite[],
  input: GeneratorInput,
  config: { start: number; end: number; kind: 'daycoval' | 'santander' | 'bocom' },
): void {
  const sheet = 'Passivos'
  clear(writes, sheet, rows(config.start, config.end), rows(2, 13).map((index) => String.fromCharCode(64 + index)))
  ;(input.dados.arrendamentos ?? []).slice(0, config.end - config.start + 1).forEach((lease, index) => {
    const row = config.start + index
    if (config.kind === 'daycoval') {
      addText(writes, sheet, `B${row}`, lease.fazenda)
      addText(writes, sheet, `C${row}`, lease.proprietario)
      addText(writes, sheet, `D${row}`, lease.matricula || lease.car)
      addText(writes, sheet, `E${row}`, lease.municipio)
      addText(writes, sheet, `F${row}`, lease.uf)
      addNumber(writes, sheet, `G${row}`, lease.areaTotalHa ?? lease.areaArrendadaHa)
      addNumber(writes, sheet, `H${row}`, lease.areaArrendadaHa)
      addText(writes, sheet, `L${row}`, lease.vencimento)
      addNumber(writes, sheet, `M${row}`, lease.custoScHa ?? lease.custoMensal)
      addFormula(writes, sheet, `N${row}`, `M${row}*G${row}`)
      return
    }
    addText(writes, sheet, `B${row}`, lease.fazenda)
    addText(writes, sheet, `C${row}`, lease.municipio)
    if (config.kind === 'santander') {
      addText(writes, sheet, `D${row}`, lease.uf)
      addText(writes, sheet, `E${row}`, lease.proprietario)
      addText(writes, sheet, `G${row}`, lease.inicio)
      addText(writes, sheet, `H${row}`, lease.vencimento)
    } else {
      addText(writes, sheet, `E${row}`, lease.uf)
      addText(writes, sheet, `F${row}`, lease.proprietario)
      addText(writes, sheet, `H${row}`, lease.vencimento)
    }
    addNumber(writes, sheet, `I${row}`, lease.areaTotalHa ?? lease.areaArrendadaHa)
    addNumber(writes, sheet, `J${row}`, lease.custoScHa)
    addFormula(writes, sheet, `K${row}`, `I${row}*J${row}`)
    addNumber(writes, sheet, `L${row}`, lease.custoMensal)
    addFormula(writes, sheet, `M${row}`, `I${row}*L${row}`)
  })
}

function writeInvestments(
  writes: OoxmlCellWrite[],
  input: GeneratorInput,
  config: { start: number; end: number; kind: 'santander' | 'bocom' },
): void {
  const sheet = 'Passivos'
  clear(writes, sheet, rows(config.start, config.end), ['B', 'C', 'E', 'F', 'G', 'H', 'I'])
  ;(input.dados.investimentos ?? []).slice(0, config.end - config.start + 1).forEach((investment, index) => {
    const row = config.start + index
    addText(writes, sheet, `B${row}`, investment.descricao)
    addNumber(writes, sheet, `C${row}`, investment.valorTotal)
    addNumber(writes, sheet, `E${row}`, investment.fundingProprio)
    addNumber(writes, sheet, `F${row}`, investment.fundingTerceiro)
    addText(writes, sheet, `G${row}`, investment.dataPrevista)
    addText(writes, sheet, `H${row}`, investment.prazo)
    addNumber(writes, sheet, `I${row}`, investment.payback)
  })
}

interface ConstantSanitizeConfig {
  sheet: string
  columns: string[]
  startRow: number
  endRow: number
  excludedRows?: number[]
}

function constantCellSanitizers(template: Buffer, configs: ConstantSanitizeConfig[]): OoxmlCellWrite[] {
  const zip = new PizZip(template)
  const workbook = zip.file('xl/workbook.xml')?.asText() ?? ''
  const relationships = zip.file('xl/_rels/workbook.xml.rels')?.asText() ?? ''
  const writes: OoxmlCellWrite[] = []
  for (const config of configs) {
    const sheetMatch = [...workbook.matchAll(/<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"/g)]
      .find((match) => match[1] === config.sheet)
    if (!sheetMatch) continue
    const relationship = [...relationships.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g)]
      .find((match) => match[1] === sheetMatch[2])
    if (!relationship) continue
    const target = relationship[2].replace(/^\/?xl\//, '')
    const sheet = zip.file(`xl/${target}`)?.asText()
    if (!sheet) continue
    const excluded = new Set(config.excludedRows ?? [])
    for (const match of sheet.matchAll(/<c\b(?=[^>]*\br="([A-Z]{1,3})(\d+)")[^>]*>([\s\S]*?)<\/c>/g)) {
      const column = match[1]
      const row = Number(match[2])
      const content = match[3]
      if (!config.columns.includes(column) || row < config.startRow || row > config.endRow || excluded.has(row)) continue
      if (/<f(?:\s|>)/.test(content)) continue
      if (!/<(?:v|is)(?:\s|>)/.test(content)) continue
      writes.push({ sheet: config.sheet, address: `${column}${row}`, value: null, reason: 'sanitize' })
    }
  }
  return writes
}

function output(
  input: GeneratorInput,
  templateFile: string,
  modelId: string,
  prefix: string,
  contentType: string,
  writes: OoxmlCellWrite[],
  observations: string[],
  constantSanitize: ConstantSanitizeConfig[] = [],
): ArquivoBancarioGerado | null {
  const path = join(input.sourceDir, templateFile)
  if (!existsSync(path)) return null
  const template = readFileSync(path)
  const finalWriteList = [...constantCellSanitizers(template, constantSanitize), ...writes]
  const result = mutateOoxmlWorkbook(template, finalWriteList)
  const finalWrites = new Map(finalWriteList.map((write) => [`${write.sheet}!${write.address}`, write]))
  const missingData = result.missing.filter((reference) => finalWrites.get(reference)?.reason !== 'sanitize')
  return {
    modeloId: modelId,
    filename: `${prefix}_${safeName(input.cliente.nome || 'cliente')}_${stamp()}.${templateFile.split('.').at(-1)}`,
    buffer: result.buffer,
    contentType,
    celulasGravadas: result.written,
    celulasHigienizadas: result.sanitized,
    formulasAjustadas: result.formulas,
    observacoes: [
      ...observations,
      `Higienização e preenchimento concluídos em ${result.written} células.`,
      ...(missingData.length
        ? [
            `${missingData.length} campos de dados não existiam nesta versão do modelo e foram ignorados.`,
            `Primeiras referências ausentes: ${missingData.slice(0, 12).join(', ')}.`,
          ]
        : []),
    ],
  }
}

function generateDaycoval(input: GeneratorInput): ArquivoBancarioGerado | null {
  const writes: OoxmlCellWrite[] = []
  writeRiskCadastro(input, writes, {
    pfStart: 6,
    pfEnd: 25,
    pjStart: 29,
    pjEnd: 48,
    observations: 'B51',
    dateCell: 'E4',
    signatureCell: 'C61',
  })

  clear(writes, 'Operacional', [6], ['B'])
  clear(writes, 'Operacional', rows(15, 19), ['B', 'D', 'F'])
  clear(writes, 'Operacional', rows(26, 28), ['B'])
  addText(writes, 'Operacional', 'B6', input.dados.historico)
  ;(input.dados.administradores ?? []).slice(0, 5).forEach((administrator, index) => {
    const row = 15 + index
    addText(writes, 'Operacional', `B${row}`, administrator.nome)
    addText(writes, 'Operacional', `D${row}`, administrator.responsabilidade)
    addText(writes, 'Operacional', `F${row}`, administrator.experiencia)
  })
  addText(writes, 'Operacional', 'B26', input.dados.infraestrutura)

  for (const start of [33, 44, 55]) {
    clear(writes, 'Operacional', [start, start + 1, start + 2, start + 3, start + 4, start + 5, start + 6, start + 7, start + 8, start + 9], ['B', 'D', 'F'])
  }
  const commercial = new Map<string, typeof input.dados.compradores>()
  for (const buyer of input.dados.compradores ?? []) {
    const key = fold(text(buyer.cultura) || 'outra')
    commercial.set(key, [...(commercial.get(key) ?? []), buyer])
  }
  ;([...commercial.entries()]).slice(0, 3).forEach(([, buyers], index) => {
    const start = [33, 44, 55][index]
    const current = buyers?.[0]
    const planned = buyers?.[1]
    addText(writes, 'Operacional', `B${start}`, current?.cultura || planned?.cultura)
    for (const [column, buyer] of [['D', current], ['F', planned]] as const) {
      addText(writes, 'Operacional', `${column}${start}`, buyer?.safra)
      addText(writes, 'Operacional', `${column}${start + 1}`, buyer?.nome)
      addNumber(writes, 'Operacional', `${column}${start + 2}`, buyer?.volume)
      addNumber(writes, 'Operacional', `${column}${start + 3}`, buyer?.estoque)
      addNumber(writes, 'Operacional', `${column}${start + 4}`, buyer?.percentualVendidoPlantio)
      addText(writes, 'Operacional', `${column}${start + 5}`, buyer?.precoRegime)
      addNumber(writes, 'Operacional', `${column}${start + 6}`, buyer?.precoUnitario)
      addNumber(writes, 'Operacional', `${column}${start + 7}`, buyer?.percentualSpot)
      addText(writes, 'Operacional', `${column}${start + 8}`, buyer?.entrega)
      addText(writes, 'Operacional', `${column}${start + 9}`, buyer?.hedgeCambial)
    }
  })

  clear(writes, 'Operacional', rows(69, 71), ['B', 'D', 'F'])
  ;(input.dados.fornecedores ?? []).slice(0, 3).forEach((supplier, index) => {
    const row = 69 + index
    addText(writes, 'Operacional', `B${row}`, supplier.tipoProduto)
    addText(writes, 'Operacional', `D${row}`, supplier.nome)
    addText(writes, 'Operacional', `F${row}`, supplier.prazoPagamento || supplier.vencimento)
  })
  clear(writes, 'Operacional', [73, 75], ['D', 'F'])
  addNumber(writes, 'Operacional', 'D75', (input.dados.fornecedores ?? [])
    .reduce((sum, item) => sum + (numberValue(item.valor) ?? 0), 0))
  addText(writes, 'Operacional', 'F75', input.dados.fornecedores?.map((item) => item.observacoes).filter(Boolean).join('; '))
  clear(writes, 'Operacional', rows(81, 88), ['D', 'I'])
  ;(input.dados.investimentos ?? []).slice(0, 8).forEach((investment, index) => {
    addText(writes, 'Operacional', `D${81 + index}`, investment.descricao)
    addNumber(writes, 'Operacional', `I${81 + index}`, investment.valorTotal)
  })
  clear(writes, 'Operacional', [91], ['B'])
  addText(writes, 'Operacional', 'B91', input.dados.investimentos?.map((item) => item.descricao).filter(Boolean).join('; '))

  writeProduction(writes, input.dados.producoes ?? [], {
    sheet: 'Produção',
    starts: [6, 20, 34, 48, 70, 90, 104, 118, 132, 146, 168, 190, 217, 231, 245, 259, 278, 297, 316, 389, 403, 417, 431],
    labelColumn: 'D',
    regionColumn: 'E',
    columns: { anterior: ['E', 'F'], atual: ['G'], planejada: ['H'] },
    offsets: { safra: 1, propria: 3, arrendada: 4, produtividade: 5, preco: 7, custo: 8 },
    observationColumn: 'J',
    regionAtBlockEnd: true,
    lastRow: 444,
    blockMatches: {
      6: ['soja'], 20: ['soja'], 34: ['soja irrigada'],
      48: ['soja semente', 'semente soja'], 70: ['soja semente', 'semente soja'],
      90: ['milho'], 104: ['milho'], 118: ['milho'], 132: ['milho'],
      146: ['milho semente', 'semente milho'], 168: ['milho semente', 'semente milho'],
      190: ['cana'], 217: ['cafe'], 231: ['laranja'], 245: ['limao'],
      259: ['algodao'], 278: ['algodao'], 297: ['algodao'], 316: ['algodao'],
      389: ['gergelim'], 403: ['milheto'], 417: ['*'], 431: ['*'],
    },
    offsetOverrides: {
      48: { preco: 10, custo: 12 },
      70: { preco: 10, custo: 12 },
      146: { preco: 10, custo: 12 },
      168: { preco: 10, custo: 12 },
      190: { produtividade: 6, preco: 9, custo: 12 },
      259: { preco: 11, custo: 13 },
      278: { preco: 11, custo: 13 },
      297: { preco: 11, custo: 13 },
      316: { preco: 11, custo: 13 },
    },
  })
  writeLivestock(input, writes, {
    sheet: 'Produção',
    columns: { anterior: ['E', 'F'], atual: ['G'], planejada: ['H'] },
    blocks: { suinos: 335, leite: 351, aves: 365 },
    observationColumn: 'J',
  })
  writeProperties(writes, input, { start: 8, end: 47 })
  clear(writes, 'Ativos', [51], ['B'])
  addText(writes, 'Ativos', 'B51', input.dados.propriedades?.map((item) => item.capacidadeProdutiva).filter(Boolean).join('; '))

  clear(writes, 'Relação de bens ', rows(6, 36), ['B', 'C', 'D', 'E', 'F', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'])
  ;(input.dados.ativosOutros ?? []).slice(0, 31).forEach((asset, index) => {
    const row = 6 + index
    addText(writes, 'Relação de bens ', `B${row}`, asset.descricao || asset.tipo)
    addText(writes, 'Relação de bens ', `C${row}`, asset.fonte)
    addNumber(writes, 'Relação de bens ', `D${row}`, asset.quantidade)
    addNumber(writes, 'Relação de bens ', `E${row}`, asset.valor)
    addText(writes, 'Relação de bens ', `F${row}`, asset.observacoes)
  })
  ;(input.dados.maquinas ?? []).slice(0, 31).forEach((machine, index) => {
    const row = 6 + index
    addText(writes, 'Relação de bens ', `H${row}`, machine.tipo)
    addText(writes, 'Relação de bens ', `I${row}`, machine.marca)
    addText(writes, 'Relação de bens ', `J${row}`, machine.descricao)
    addNumber(writes, 'Relação de bens ', `M${row}`, 1)
    addNumber(writes, 'Relação de bens ', `N${row}`, machine.valor)
    addText(writes, 'Relação de bens ', `O${row}`, machine.onus)
  })

  writeDebts(writes, input, {
    start: 10,
    end: 59,
    totalColumn: 'J',
    scheduleColumns: ['K', 'L', 'M', 'N', 'O', 'P', 'Q'],
    years: [2025, 2026, 2027, 2028, 2029, 2030, 'after'],
    hasBorrower: true,
  })
  clear(writes, 'Passivos', rows(73, 88), ['B', 'E', 'F', 'G', 'H'])
  ;(input.dados.fornecedores ?? []).slice(0, 16).forEach((supplier, index) => {
    const row = 73 + index
    addText(writes, 'Passivos', `B${row}`, supplier.nome)
    addNumber(writes, 'Passivos', `E${row}`, supplier.valor)
    addNumber(writes, 'Passivos', `F${row}`, supplier.volumeSoja)
    addNumber(writes, 'Passivos', `G${row}`, supplier.volumeMilho)
    addText(writes, 'Passivos', `H${row}`, supplier.vencimento)
  })
  clear(writes, 'Passivos', rows(73, 86), ['J', 'K', 'L', 'M', 'N', 'O', 'P'])
  ;(input.dados.dividasTerras ?? []).slice(0, 14).forEach((debt, index) => {
    const row = 73 + index
    addText(writes, 'Passivos', `J${row}`, debt.descricao)
    addNumber(writes, 'Passivos', `K${row}`, debt.areaTotalHa)
    addText(writes, 'Passivos', `L${row}`, debt.formaPagamento)
    addNumber(writes, 'Passivos', `P${row}`, debt.valorTotal)
    addFormula(writes, 'Passivos', `Q${row}`, `SUM(L${row}:P${row})`)
  })
  clear(writes, 'Passivos', [65, 92, 100], ['B', 'P'])
  writeLeases(writes, input, { start: 103, end: 133, kind: 'daycoval' })

  return output(
    input,
    DAYCOVAL_FILE,
    'daycoval-cadastro-agro-2025',
    'Cadastro_Daycoval',
    XLSX_TYPE,
    writes,
    [
      'Cadastro, operação, produção, patrimônio, bens e passivos preenchidos a partir da base canônica ALETIS.',
      'Todos os blocos que continham dados de exemplo foram higienizados.',
      'Fórmulas e estrutura visual do modelo oficial foram preservadas.',
    ],
    [{
      sheet: 'Produção',
      columns: ['E', 'F', 'G', 'H'],
      startRow: 6,
      endRow: 444,
      excludedRows: [6, 20, 34, 48, 70, 90, 104, 118, 132, 146, 168, 190, 217, 231, 245, 259, 278, 297, 316, 335, 351, 365, 375, 389, 403, 417, 431],
    }],
  )
}

function writeSantanderOrBocomAssets(
  writes: OoxmlCellWrite[],
  input: GeneratorInput,
  kind: 'santander' | 'bocom',
): void {
  if (kind === 'santander') {
    writeProperties(writes, input, { start: 10, end: 32 })
    clear(writes, 'Ativos', rows(53, 65), ['B', 'C', 'E', 'F', 'G'])
    ;(input.dados.compradores ?? []).slice(0, 13).forEach((buyer, index) => {
      const row = 53 + index
      addText(writes, 'Ativos', `B${row}`, buyer.cultura)
      addText(writes, 'Ativos', `C${row}`, buyer.nome)
      addText(writes, 'Ativos', `E${row}`, buyer.safra)
      addNumber(writes, 'Ativos', `F${row}`, buyer.volume)
      addNumber(writes, 'Ativos', `G${row}`, buyer.precoUnitario)
    })
    clear(writes, 'Ativos', rows(51, 65), ['I', 'K', 'L'])
    ;(input.dados.ativosOutros ?? []).slice(0, 15).forEach((asset, index) => {
      const row = 51 + index
      addText(writes, 'Ativos', `I${row}`, asset.descricao || asset.tipo)
      addNumber(writes, 'Ativos', `K${row}`, asset.valor)
      addText(writes, 'Ativos', `L${row}`, asset.observacoes)
    })
    clear(writes, 'Ativos', rows(81, 85), ['B', 'C', 'D'])
    const machines = new Map<string, { count: number; value: number }>()
    for (const machine of input.dados.maquinas ?? []) {
      const key = text(machine.tipo) || 'Outros'
      const current = machines.get(key) ?? { count: 0, value: 0 }
      current.count += 1
      current.value += numberValue(machine.valor) ?? 0
      machines.set(key, current)
    }
    ;([...machines.entries()]).slice(0, 5).forEach(([type, values], index) => {
      addText(writes, 'Ativos', `B${81 + index}`, type)
      addNumber(writes, 'Ativos', `C${81 + index}`, values.count)
      addNumber(writes, 'Ativos', `D${81 + index}`, values.value)
    })
    return
  }

  writeProperties(writes, input, { start: 9, end: 36, cityStateCombined: true, bocom: true })
  clear(writes, 'Ativos', rows(53, 69), ['B', 'C', 'D', 'E', 'F'])
  ;(input.dados.compradores ?? []).slice(0, 17).forEach((buyer, index) => {
    const row = 53 + index
    addText(writes, 'Ativos', `B${row}`, buyer.nome)
    addText(writes, 'Ativos', `C${row}`, buyer.safra)
    addText(writes, 'Ativos', `D${row}`, buyer.cultura)
    addNumber(writes, 'Ativos', `E${row}`, buyer.volume)
    addNumber(writes, 'Ativos', `F${row}`, buyer.precoUnitario)
    addFormula(writes, 'Ativos', `G${row}`, `E${row}*F${row}`)
  })
  clear(writes, 'Ativos', rows(52, 77), ['I', 'J', 'K', 'L', 'M'])
  ;(input.dados.ativosOutros ?? []).slice(0, 26).forEach((asset, index) => {
    const row = 52 + index
    addText(writes, 'Ativos', `I${row}`, asset.descricao || asset.tipo)
    addText(writes, 'Ativos', `J${row}`, asset.fonte)
    addNumber(writes, 'Ativos', `K${row}`, asset.quantidade)
    addNumber(writes, 'Ativos', `M${row}`, asset.valor)
  })
  clear(writes, 'Ativos', rows(103, 127), ['B', 'C', 'D', 'E'])
  ;(input.dados.maquinas ?? []).slice(0, 25).forEach((machine, index) => {
    const row = 103 + index
    addText(writes, 'Ativos', `B${row}`, [machine.tipo, machine.descricao, machine.marca].filter(Boolean).join(' - '))
    addNumber(writes, 'Ativos', `C${row}`, 1)
    addNumber(writes, 'Ativos', `D${row}`, machine.valor)
    addNumber(writes, 'Ativos', `E${row}`, machine.ano)
  })
}

function generateSantander(input: GeneratorInput): ArquivoBancarioGerado | null {
  const writes: OoxmlCellWrite[] = []
  writeRiskCadastro(input, writes, {
    pfStart: 6,
    pfEnd: 25,
    pjStart: 31,
    pjEnd: 50,
    observations: 'C54',
  })
  writeProduction(writes, input.dados.producoes ?? [], {
    sheet: 'Produção',
    starts: [9, 23, 37, 51, 65, 87, 109, 129, 143, 157, 171, 185, 207, 229, 247, 265, 279, 293, 307, 321, 335, 349, 363, 382, 440, 454, 468, 482, 496],
    labelColumn: 'B',
    columns: { anterior: ['C'], atual: ['D'], planejada: ['E'] },
    offsets: { safra: 1, propria: 3, arrendada: 4, produtividade: 5, preco: 7, custo: 8 },
    observationColumn: 'G',
    blockMatches: {
      9: ['soja'], 23: ['soja'], 37: ['soja'], 51: ['soja'],
      65: ['soja semente', 'semente soja'], 87: ['soja semente', 'semente soja'], 109: ['soja semente', 'semente soja'],
      129: ['milho'], 143: ['milho'], 157: ['milho'], 171: ['milho'],
      185: ['milho semente', 'semente milho'], 207: ['milho semente', 'semente milho'],
      229: ['cana'], 247: ['cana'], 265: ['cafe'],
      279: ['laranja'], 293: ['laranja'], 307: ['laranja'],
      321: ['limao'], 335: ['limao'], 349: ['limao'],
      363: ['algodao'], 382: ['algodao'],
      440: ['*'], 454: ['*'], 468: ['*'], 482: ['*'], 496: ['*'],
    },
    offsetOverrides: {
      65: { preco: 10, custo: 12 },
      87: { preco: 10, custo: 12 },
      109: { preco: 10, custo: 12 },
      185: { preco: 10, custo: 12 },
      207: { preco: 10, custo: 12 },
      229: { propria: 4, arrendada: 5, produtividade: 6, preco: 9, custo: 10 },
      247: { propria: 4, arrendada: 5, produtividade: 6, preco: 9, custo: 10 },
      363: { preco: 11, custo: 13 },
      382: { preco: 11, custo: 13 },
    },
  })
  writeLivestock(input, writes, {
    sheet: 'Produção',
    columns: { anterior: ['C'], atual: ['D'], planejada: ['E'] },
    blocks: { suinos: 401, leite: 416, aves: 430 },
    observationColumn: 'G',
  })
  writeSantanderOrBocomAssets(writes, input, 'santander')
  writeDebts(writes, input, {
    start: 10,
    end: 201,
    totalColumn: 'I',
    scheduleColumns: ['J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'],
    years: [2024, 2025, 2026, 2027, 2028, 2029, 2030, 'after'],
    hasBorrower: false,
  })
  clear(writes, 'Passivos', rows(226, 255), ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'])
  ;(input.dados.dividasTerras ?? []).slice(0, 30).forEach((debt, index) => {
    const row = 226 + index
    addText(writes, 'Passivos', `B${row}`, debt.descricao)
    addNumber(writes, 'Passivos', `C${row}`, debt.areaTotalHa)
    addText(writes, 'Passivos', `D${row}`, debt.formaPagamento)
    addNumber(writes, 'Passivos', `L${row}`, debt.valorTotal)
    addFormula(writes, 'Passivos', `M${row}`, `SUM(D${row}:L${row})`)
  })
  clear(writes, 'Passivos', rows(266, 281), ['B', 'E', 'F'])
  ;(input.dados.fornecedores ?? []).slice(0, 16).forEach((supplier, index) => {
    const row = 266 + index
    addText(writes, 'Passivos', `B${row}`, supplier.nome)
    addNumber(writes, 'Passivos', `E${row}`, supplier.valor)
    addText(writes, 'Passivos', `F${row}`, supplier.vencimento)
  })
  clear(writes, 'Passivos', [265], ['H'])
  addText(writes, 'Passivos', 'H265', input.dados.fornecedores?.map((item) => item.observacoes).filter(Boolean).join('; '))
  writeLeases(writes, input, { start: 294, end: 315, kind: 'santander' })
  writeInvestments(writes, input, { start: 322, end: 335, kind: 'santander' })
  clear(writes, 'Passivos', [321], ['G'])
  addText(writes, 'Passivos', 'G321', input.dados.investimentos?.map((item) => item.descricao).filter(Boolean).join('; '))
  clear(writes, 'Plano Comercial', rows(7, 18), ['C', 'D'])
  addNumber(writes, 'Plano Comercial', 'D20', input.dados.operacao?.limiteSolicitado)

  return output(
    input,
    SANTANDER_FILE,
    'santander-cadastro-agro-v32',
    'Cadastro_Santander',
    XLSM_TYPE,
    writes,
    [
      'Macros, fórmulas, gráficos e estrutura de apresentação foram preservados.',
      'Cadastro, produção, ativos, passivos e plano comercial foram higienizados e preenchidos.',
    ],
    [{
      sheet: 'Produção',
      columns: ['C', 'D', 'E', 'G', 'H', 'I'],
      startRow: 9,
      endRow: 508,
      excludedRows: [9, 23, 37, 51, 65, 87, 109, 129, 143, 157, 171, 185, 207, 229, 247, 265, 279, 293, 307, 321, 335, 349, 363, 382, 401, 416, 430, 440, 454, 468, 482, 496],
    }],
  )
}

function generateBocomWorkbook(input: GeneratorInput): ArquivoBancarioGerado | null {
  const writes: OoxmlCellWrite[] = []
  writeRiskCadastro(input, writes, {
    pfStart: 5,
    pfEnd: 24,
    pjStart: 28,
    pjEnd: 47,
    observations: 'B50',
    bocom: true,
  })
  clear(writes, 'Histórico', [32], ['B'])
  addText(writes, 'Histórico', 'B32', input.dados.historico || input.cliente.observacoes)
  writeProduction(writes, input.dados.producoes ?? [], {
    sheet: 'Produção',
    starts: [9, 28, 56, 75, 94, 122, 150, 169, 188, 207, 271],
    labelColumn: 'B',
    columns: { anterior: ['C', 'D', 'E'], atual: ['F'], planejada: ['G', 'H'] },
    offsets: { safra: 1, propria: 3, arrendada: 4, produtividade: 5, preco: 7, custoOutros: 13 },
    blockMatches: {
      9: ['soja'], 28: ['soja semente', 'semente soja'],
      56: ['milho 1', 'milho verao', 'milho'], 75: ['milho 2', 'milho safrinha', 'milho'],
      94: ['milho semente', 'semente milho'], 122: ['cana'],
      150: ['*'], 169: ['*'], 188: ['*'], 207: ['algodao'], 271: ['*'],
    },
    offsetOverrides: {
      28: { preco: 10, custoOutros: 17 },
      94: { preco: 10, custoOutros: 17 },
      122: { produtividade: 9, preco: 12, custoOutros: 20 },
      207: { preco: 11, custoOutros: 19 },
    },
  })
  writeLivestock(input, writes, {
    sheet: 'Produção',
    columns: { anterior: ['C', 'D', 'E'], atual: ['F'], planejada: ['G', 'H'] },
    blocks: { suinos: 232, leite: 247, aves: 261 },
  })
  writeSantanderOrBocomAssets(writes, input, 'bocom')
  writeDebts(writes, input, {
    start: 10,
    end: 70,
    totalColumn: 'I',
    scheduleColumns: ['J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'],
    years: [2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 'after'],
    hasBorrower: false,
  })
  clear(writes, 'Passivos', rows(90, 116), ['B', 'C', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'N', 'O', 'P', 'Q', 'R'])
  ;(input.dados.dividasTerras ?? []).slice(0, 27).forEach((debt, index) => {
    const row = 90 + index
    addText(writes, 'Passivos', `E${row}`, debt.descricao)
    addNumber(writes, 'Passivos', `F${row}`, debt.areaTotalHa)
    addText(writes, 'Passivos', `G${row}`, debt.vencimentoFinal)
    addText(writes, 'Passivos', `H${row}`, debt.formaPagamento)
    addNumber(writes, 'Passivos', `L${row}`, debt.valorTotal)
  })
  ;(input.dados.fornecedores ?? []).slice(0, 27).forEach((supplier, index) => {
    const row = 90 + index
    addText(writes, 'Passivos', `N${row}`, supplier.nome)
    addText(writes, 'Passivos', `O${row}`, supplier.tipoProduto)
    addText(writes, 'Passivos', `Q${row}`, supplier.vencimento)
    addNumber(writes, 'Passivos', `R${row}`, supplier.valor)
  })
  writeLeases(writes, input, { start: 132, end: 146, kind: 'bocom' })
  writeInvestments(writes, input, { start: 156, end: 165, kind: 'bocom' })
  clear(writes, 'Passivos', [153], ['K'])
  addText(writes, 'Passivos', 'K153', input.dados.investimentos?.map((item) => item.descricao).filter(Boolean).join('; '))

  return output(
    input,
    BOCOM_FILE,
    'bocom-bbm-cadastro',
    'Cadastro_BOCOM_BBM',
    XLSM_TYPE,
    writes,
    [
      'Macros, fórmulas e estrutura financeira do modelo oficial foram preservadas.',
      'Cadastro, histórico, produção, ativos e passivos foram higienizados e preenchidos.',
    ],
    [{
      sheet: 'Produção',
      columns: ['C', 'D', 'E', 'F', 'G', 'H'],
      startRow: 9,
      endRow: 281,
      excludedRows: [9, 28, 56, 75, 94, 122, 150, 169, 188, 207, 232, 247, 261, 271],
    }],
  )
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function generateBocomLetter(input: GeneratorInput): ArquivoBancarioGerado | null {
  const path = join(input.sourceDir, BOCOM_LETTER_FILE)
  if (!existsSync(path)) return null
  const zip = new PizZip(readFileSync(path))
  const document = zip.file('word/document.xml')
  if (!document) return null
  let xml = document.asText()
  const members = groupMembers(input)
  const physical = members
    .filter((member) => text(member.cpfCnpj)?.replace(/\D/g, '').length !== 14)
    .map((member, index) => `${index + 1}. ${member.nome || ''} — CPF ${member.cpfCnpj || ''}`)
    .join('\n') || 'Não aplicável.'
  const legal = companies(input)
    .map((company, index) => `${index + 1}. ${company.razaoSocial || ''} — CNPJ ${company.cnpj || ''}`)
    .join('\n') || 'Não aplicável.'
  let replacements = 0
  for (const [marker, value] of [['#P_F#', physical], ['#P_J#', legal]] as const) {
    const occurrences = xml.split(marker).length - 1
    if (!occurrences) continue
    xml = xml.replaceAll(marker, xmlEscape(value))
    replacements += occurrences
  }
  zip.file('word/document.xml', xml)
  return {
    modeloId: 'bocom-carta-pdev-cad-cpr',
    filename: `Autorizacao_BOCOM_BBM_${safeName(input.cliente.nome || 'cliente')}_${stamp()}.docx`,
    buffer: zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer,
    contentType: DOCX_TYPE,
    celulasGravadas: replacements,
    celulasHigienizadas: replacements,
    formulasAjustadas: 0,
    observacoes: [
      'Listas de pessoas físicas e jurídicas autorizadas foram preenchidas nas versões em português e inglês.',
      'O texto jurídico original foi preservado e deve ser conferido antes da assinatura.',
    ],
  }
}

export function generateExtendedBankFiles(input: GeneratorInput): ArquivoBancarioGerado[] {
  const files: Array<ArquivoBancarioGerado | null> = []
  if (input.banco === 'daycoval') files.push(generateDaycoval(input))
  if (input.banco === 'santander') files.push(generateSantander(input))
  if (input.banco === 'bocom') files.push(generateBocomWorkbook(input), generateBocomLetter(input))
  return files.filter((file): file is ArquivoBancarioGerado => file !== null)
}
