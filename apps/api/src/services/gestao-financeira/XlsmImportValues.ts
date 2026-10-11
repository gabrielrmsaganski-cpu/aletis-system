import ExcelJS from 'exceljs'
import Decimal from 'decimal.js'
import JSZip from 'jszip'
import { load } from 'cheerio'
import { posix } from 'node:path'

const ExactDecimal = Decimal.clone({ precision: 48 })

export class XlsmImportValidationError extends Error {
  readonly code = 'XLSM_IMPORT_VALIDATION'
  readonly statusCode = 422
  constructor(message: string) { super(message); this.name = 'XlsmImportValidationError' }
}

function invalid(location: string, reason: string): never {
  throw new XlsmImportValidationError(`${location}: ${reason}`)
}

/** Texto digitado: pt-BR agrupado ou decimal simples; jamais aceita prefixo parcial. */
export function parseImportDecimal(value: unknown, location = 'Valor', rawExcelNumber = false): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' && typeof value !== 'number') invalid(location, 'valor numérico inválido')
  if (typeof value === 'number' && !Number.isFinite(value)) invalid(location, 'valor numérico não finito')
  let text = String(value).trim()
  if (!text) return null
  if (text.length > 128) invalid(location, 'valor numérico excede o tamanho permitido')
  if (rawExcelNumber || typeof value === 'number') {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d{1,3})?$/i.test(text)) invalid(location, 'cache numérico Excel inválido')
  } else {
    text = text.replace(/^R\$\s*/i, '').trim()
    const negativeParentheses = /^\(.+\)$/.test(text)
    if (negativeParentheses) text = '-' + text.slice(1, -1)
    if (/^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text) && !/^[+-]?0\./.test(text)) text = text.replace(/\./g, '').replace(',', '.')
    else if (/^[+-]?\d+(?:,\d+)?$/.test(text)) text = text.replace(',', '.')
    else if (!/^[+-]?\d+\.\d+$/.test(text)) invalid(location, 'informe um número completo; não são aceitos textos, percentuais ou sufixos')
  }
  let decimal: Decimal
  try { decimal = new ExactDecimal(text) } catch { invalid(location, 'valor decimal inválido') }
  if (!decimal.isFinite() || decimal.abs().gte('1e30')) invalid(location, 'valor fora do limite decimal de importação')
  return decimal.toFixed()
}

export function importAnnualToMonthly(value: string): string {
  return new ExactDecimal(value).div(12).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
}

interface RawCell {
  type: string
  formula: boolean
  cachePresent: boolean
  value: string
}

export class XlsmValueReader {
  constructor(private readonly rawCells: Map<string, RawCell> = new Map()) {}

  private location(cell: ExcelJS.Cell): string { return `${cell.worksheet.name}!${cell.address}` }

  private read(cell: ExcelJS.Cell): { value: unknown; rawNumeric: boolean } {
    const location = this.location(cell)
    const raw = this.rawCells.get(location)
    if (raw?.type === 'e') invalid(location, 'célula contém erro do Excel; corrija e recalcule antes de importar')
    if (raw?.formula && (!raw.cachePresent || (!raw.value && raw.type !== 'str'))) invalid(location, 'fórmula sem resultado armazenado; recalcule e salve no Excel antes de importar')
    if (raw?.formula && raw.type === 'str' && raw.cachePresent) return { value: raw.value, rawNumeric: false }
    if (raw && raw.type === 'n' && raw.cachePresent && raw.value !== '' && !(cell.value instanceof Date)) return { value: raw.value, rawNumeric: true }
    let value: unknown = cell.value
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const object = value as Record<string, unknown>
      if ('formula' in object || 'sharedFormula' in object) {
        if (object.result === undefined || object.result === null) invalid(location, 'fórmula sem resultado armazenado; recalcule e salve antes de importar')
        value = object.result
      }
    }
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const object = value as Record<string, unknown>
      if ('error' in object) invalid(location, 'célula contém erro do Excel')
      if (Array.isArray(object.richText)) value = object.richText.map((item: { text?: string }) => item.text ?? '').join('')
      else if (typeof object.text === 'string') value = object.text
      else invalid(location, 'tipo de célula não suportado neste campo')
    }
    return { value, rawNumeric: false }
  }

  text(cell: ExcelJS.Cell): string | null {
    const { value } = this.read(cell)
    if (value === null || value === undefined) return null
    if (value instanceof Date) return this.date(cell)
    const text = String(value).trim()
    return text || null
  }

  decimal(cell: ExcelJS.Cell): string | null {
    const { value, rawNumeric } = this.read(cell)
    return parseImportDecimal(value, this.location(cell), rawNumeric)
  }

  optionalDecimal(cell: ExcelJS.Cell): string | undefined { return this.decimal(cell) ?? undefined }

  validateCachedValue(cell: ExcelJS.Cell): void { this.read(cell) }

  requiredDecimal(cell: ExcelJS.Cell): string {
    const value = this.decimal(cell)
    if (value === null) invalid(this.location(cell), 'valor obrigatório não informado; ausência não equivale a zero')
    return value
  }

  integer(cell: ExcelJS.Cell): number | null {
    const value = this.decimal(cell)
    if (value === null) return null
    const decimal = new ExactDecimal(value)
    if (!decimal.isInteger() || decimal.lt(0) || decimal.gt(Number.MAX_SAFE_INTEGER)) invalid(this.location(cell), 'informe uma quantidade inteira não negativa')
    return decimal.toNumber()
  }

  boolean(cell: ExcelJS.Cell): boolean | undefined {
    const value = this.text(cell)
    if (value === null) return undefined
    if (/^(?:sim|s|true|1|yes)$/i.test(value)) return true
    if (/^(?:não|nao|n|false|0|no)$/i.test(value)) return false
    invalid(this.location(cell), 'informe Sim ou Não')
  }

  date(cell: ExcelJS.Cell): string | null {
    const { value } = this.read(cell)
    if (value === null || value === undefined || value === '') return null
    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) invalid(this.location(cell), 'data inválida')
      const year = value.getUTCFullYear()
      if (year < 1900 || year > 2200) invalid(this.location(cell), 'ano fora do intervalo esperado')
      return value.toISOString().slice(0, 10)
    }
    const text = String(value).trim()
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
    const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
    if (!iso && !br) invalid(this.location(cell), 'data deve estar em DD/MM/AAAA ou AAAA-MM-DD')
    const [year, month, day] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [Number(br![3]), Number(br![2]), Number(br![1])]
    const result = new Date(Date.UTC(year, month - 1, day))
    if (year < 1900 || year > 2200 || result.getUTCFullYear() !== year || result.getUTCMonth() !== month - 1 || result.getUTCDate() !== day) invalid(this.location(cell), 'data inexistente ou ano fora do intervalo esperado')
    return result.toISOString().slice(0, 10)
  }

  numericCandidate(cell: ExcelJS.Cell): boolean {
    const raw = this.rawCells.get(this.location(cell))
    if (raw?.type === 'e') return false
    if (raw?.type === 'n' && raw.cachePresent && raw.value !== '') return !(cell.value instanceof Date)
    // Abas de premissas incluem texto e instruções; só campos numéricos
    // identificados entram no plano. Fórmulas candidatas são validadas depois.
    const value = cell.value
    if (typeof value === 'number') return true
    if (typeof value === 'string') return /^(?:R\$\s*)?[+-]?\d[\d.,]*$/.test(value.trim())
    if (value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) return typeof value.result === 'number'
    return false
  }
}

/** Guarda os números originais em texto antes de a biblioteca aplicar IEEE-754. */
export async function createXlsmValueReader(buffer: Buffer): Promise<XlsmValueReader> {
  const zip = await JSZip.loadAsync(buffer)
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string')
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
  if (!workbookXml || !relsXml) throw new XlsmImportValidationError('Arquivo Excel incompleto')
  const workbook = load(workbookXml, { xmlMode: true })
  const rels = load(relsXml, { xmlMode: true })
  const targets = new Map<string, string>()
  rels('Relationship').each((_, element) => {
    const rel = rels(element)
    if (rel.attr('TargetMode') !== 'External') targets.set(rel.attr('Id') ?? '', rel.attr('Target') ?? '')
  })
  const rawCells = new Map<string, RawCell>()
  for (const element of workbook('sheets > sheet').toArray()) {
    const sheet = workbook(element), name = sheet.attr('name') ?? '', target = targets.get(sheet.attr('r:id') ?? '')
    if (!target) continue
    const path = target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join('xl', target))
    const xmlText = await zip.file(path)?.async('string')
    if (!xmlText) continue
    const xml = load(xmlText, { xmlMode: true })
    xml('sheetData > row > c').each((_, element) => {
      const cell = xml(element), cached = cell.children('v')
      rawCells.set(`${name}!${cell.attr('r') ?? ''}`, { type: cell.attr('t') ?? 'n', formula: !!cell.children('f').length, cachePresent: !!cached.length, value: cached.text() })
    })
  }
  return new XlsmValueReader(rawCells)
}
