// Inspeção estática do pacote Excel: não calcula fórmulas, acessa vínculos
// externos nem executa VBA. Mantém erros do cache separados de referências
// inválidas presentes na fórmula; um cache ausente não equivale a zero.
import JSZip from 'jszip'
import { load } from 'cheerio'
import { posix } from 'node:path'

export interface SpreadsheetQualitySample {
  sheet?: string
  cell?: string
  name?: string
  code: string
}

export interface SpreadsheetSheetQuality {
  name: string
  visibility: 'visible' | 'hidden' | 'veryHidden'
  rows: number
  columns: number
  formulas: number
  populatedCells: number
  cachedFormulaErrors: number
  literalErrorCells: number
  missingFormulaCaches: number
  brokenFormulaReferences: number
  externalFormulaCells: number
}

export interface SpreadsheetQuality {
  format: 'ooxml' | 'legacy-xls' | 'unsupported'
  status: 'review-required' | 'inspected' | 'conversion-required' | 'unreadable'
  inspected: boolean
  cachedFormulaErrors: number
  literalErrorCells: number
  missingFormulaCaches: number
  brokenFormulaReferences: number
  brokenDefinedNames: number
  externalLinks: number
  externalFormulaCells: number
  hiddenSheets: number
  definedNames: number
  macrosPresent: boolean | null
  calculationMode: string | null
  samples: SpreadsheetQualitySample[]
  limitations: string[]
}

export interface SpreadsheetQualityResult {
  quality: SpreadsheetQuality
  sheets: SpreadsheetSheetQuality[]
}

const MAX_FILE_BYTES = 64 * 1024 * 1024
const MAX_XML_BYTES = 96 * 1024 * 1024
const MAX_UNCOMPRESSED_BYTES = 384 * 1024 * 1024
const ERROR_TOKEN = /#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A\b|NUM!|NULL!|SPILL!|CALC!|GETTING_DATA\b)/gi
const EXTERNAL_REFERENCE = /(?:\[\d+\][^!]*!|\[[^\]]+\.(?:xlsx?|xlsm|xlsb|xltx|csv)\][^!]*!)/i

/** Ignora texto entre aspas em fórmulas: IF(A1=0,"#REF!",A1) não está quebrada. */
export function formulaWithoutStringLiterals(formula: string): string {
  return formula.replace(/"(?:[^"]|"")*"/g, '""')
}

function baseQuality(format: SpreadsheetQuality['format']): SpreadsheetQuality {
  return {
    format, status: 'inspected', inspected: false, cachedFormulaErrors: 0,
    literalErrorCells: 0, missingFormulaCaches: 0, brokenFormulaReferences: 0,
    brokenDefinedNames: 0, externalLinks: 0, externalFormulaCells: 0,
    hiddenSheets: 0, definedNames: 0, macrosPresent: null, calculationMode: null,
    samples: [], limitations: ['Inspeção estrutural; não recalcula resultados nem certifica paridade com o motor nativo.'],
  }
}

export function uninspectedSpreadsheetQuality(
  format: 'legacy-xls' | 'unsupported',
  reason: string,
): SpreadsheetQualityResult {
  const quality = baseQuality(format)
  quality.status = 'conversion-required'
  quality.limitations.push(reason)
  return { quality, sheets: [] }
}

function addSample(quality: SpreadsheetQuality, sample: SpreadsheetQualitySample): void {
  // O relatório completo contabiliza todas as células. Exemplos são limitados
  // por tipo para evitar respostas gigantes e preservar diversidade de alertas.
  if (quality.samples.filter((s) => s.code === sample.code).length < 8) quality.samples.push(sample)
}

function cellCoordinate(cell: string): { row: number; column: number } | null {
  const match = /^([A-Z]+)([1-9]\d*)$/i.exec(cell)
  if (!match) return null
  let column = 0
  for (const character of match[1].toUpperCase()) column = column * 26 + character.charCodeAt(0) - 64
  return { row: Number(match[2]), column }
}

export async function inspectSpreadsheetQuality(buffer: Buffer, filename: string): Promise<SpreadsheetQualityResult> {
  if (/\.xls$/i.test(filename)) return uninspectedSpreadsheetQuality('legacy-xls', 'XLS binário: converter uma cópia para XLSX antes da inspeção no sistema; original preservado.')
  if (!/\.(?:xlsx|xlsm|xltx|xltm)$/i.test(filename)) return uninspectedSpreadsheetQuality('unsupported', 'Formato ainda sem inspeção estrutural no sistema.')
  const quality = baseQuality('ooxml')
  const sheets: SpreadsheetSheetQuality[] = []
  try {
    if (buffer.length > MAX_FILE_BYTES) throw new Error('Planilha excede o limite de inspeção de 64 MiB')
    const zip = await JSZip.loadAsync(buffer)
    // A inspeção não descompacta objetos incorporados; o teto também impede
    // que metadados de um ZIP comprimido excessivamente consumam toda a API.
    let totalDeclared = 0
    for (const entry of Object.values(zip.files)) {
      const declared = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0
      totalDeclared += declared
    }
    if (totalDeclared > MAX_UNCOMPRESSED_BYTES) throw new Error('Conteúdo descompactado excede o limite de inspeção')
    const readXml = async (name: string) => {
      const file = zip.file(name)
      if (!file) throw new Error(`Parte obrigatória ausente: ${name}`)
      const declared = (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0
      if (declared > MAX_XML_BYTES) throw new Error('XML excede o limite de inspeção')
      const contents = await file.async('string')
      if (Buffer.byteLength(contents) > MAX_XML_BYTES) throw new Error('XML excede o limite de inspeção')
      return load(contents, { xmlMode: true })
    }
    const workbook = await readXml('xl/workbook.xml')
    const relationships = await readXml('xl/_rels/workbook.xml.rels')
    const targets = new Map<string, { target: string; external: boolean }>()
    relationships('Relationship').each((_, element) => {
      const rel = relationships(element)
      targets.set(rel.attr('Id') ?? '', { target: rel.attr('Target') ?? '', external: rel.attr('TargetMode') === 'External' })
    })
    quality.macrosPresent = Object.keys(zip.files).some((name) => /(?:^|\/)vbaProject\.bin$/i.test(name))
    quality.calculationMode = workbook('calcPr').attr('calcMode') ?? null
    workbook('definedNames > definedName').each((_, element) => {
      const name = workbook(element)
      quality.definedNames++
      if (formulaWithoutStringLiterals(name.text()).match(ERROR_TOKEN)) {
        quality.brokenDefinedNames++
        addSample(quality, { name: name.attr('name'), code: 'broken-defined-name' })
      }
    })
    quality.externalLinks = workbook('externalReferences > externalReference').length
    for (const element of workbook('sheets > sheet').toArray()) {
      const definition = workbook(element)
      const name = definition.attr('name') ?? ''
      const relation = targets.get(definition.attr('r:id') ?? '')
      if (!relation || relation.external) throw new Error('Relacionamento da aba ausente ou externo')
      const target = relation.target.startsWith('/') ? relation.target.slice(1) : posix.normalize(posix.join('xl', relation.target))
      if (!target.startsWith('xl/') || target.includes('../')) throw new Error('Caminho da aba inválido')
      const xml = await readXml(target)
      const state = definition.attr('state')
      const sheet: SpreadsheetSheetQuality = {
        name, visibility: state === 'hidden' || state === 'veryHidden' ? state : 'visible',
        rows: 0, columns: 0, formulas: 0, populatedCells: 0, cachedFormulaErrors: 0,
        literalErrorCells: 0, missingFormulaCaches: 0, brokenFormulaReferences: 0, externalFormulaCells: 0,
      }
      const shared = new Map<string, string>()
      xml('sheetData > row > c > f[t="shared"]').each((_, f) => {
        const formula = xml(f)
        if (formula.text()) shared.set(formula.attr('si') ?? '', formula.text())
      })
      xml('sheetData > row > c').each((_, element) => {
        const cell = xml(element)
        const formulaNode = cell.children('f')
        const cached = cell.children('v')
        if (!formulaNode.length && !cached.length && !cell.children('is').length) return
        const address = cell.attr('r') ?? ''
        const coordinate = cellCoordinate(address)
        if (coordinate) { sheet.rows = Math.max(sheet.rows, coordinate.row); sheet.columns = Math.max(sheet.columns, coordinate.column) }
        sheet.populatedCells++
        const type = cell.attr('t') ?? 'n'
        if (formulaNode.length) {
          sheet.formulas++
          const rawFormula = formulaNode.text() || (formulaNode.attr('t') === 'shared' ? shared.get(formulaNode.attr('si') ?? '') ?? '' : '')
          const formula = formulaWithoutStringLiterals(rawFormula)
          if (formula.match(ERROR_TOKEN)) {
            sheet.brokenFormulaReferences++
            addSample(quality, { sheet: name, cell: address, code: 'broken-formula-reference' })
          }
          if (EXTERNAL_REFERENCE.test(formula)) {
            sheet.externalFormulaCells++
            addSample(quality, { sheet: name, cell: address, code: 'external-formula-reference' })
          }
          if (type === 'e') {
            sheet.cachedFormulaErrors++
            addSample(quality, { sheet: name, cell: address, code: `cached-error:${cached.text() || 'unknown'}` })
          }
          if (!cached.length || (!cached.text() && type !== 'str' && type !== 'inlineStr')) {
            sheet.missingFormulaCaches++
            addSample(quality, { sheet: name, cell: address, code: 'missing-formula-cache' })
          }
        } else if (type === 'e') {
          sheet.literalErrorCells++
          addSample(quality, { sheet: name, cell: address, code: `literal-error:${cached.text() || 'unknown'}` })
        }
      })
      sheets.push(sheet)
      for (const key of ['cachedFormulaErrors', 'literalErrorCells', 'missingFormulaCaches', 'brokenFormulaReferences', 'externalFormulaCells'] as const) quality[key] += sheet[key]
      if (sheet.visibility !== 'visible') quality.hiddenSheets++
    }
    quality.inspected = true
    if (quality.cachedFormulaErrors || quality.literalErrorCells || quality.missingFormulaCaches || quality.brokenFormulaReferences || quality.brokenDefinedNames || quality.externalLinks || quality.externalFormulaCells) quality.status = 'review-required'
    if (quality.macrosPresent) quality.limitations.push('VBA preservado e identificado; macros não executadas nem substituídas automaticamente.')
    if (quality.externalLinks || quality.externalFormulaCells) quality.limitations.push('Vínculos externos não acessados; resultados dependentes exigem conferência da fonte.')
    return { quality, sheets }
  } catch (error) {
    quality.status = 'unreadable'
    quality.inspected = false
    quality.limitations.push(error instanceof Error ? error.message : 'Não foi possível inspecionar o arquivo')
    return { quality, sheets }
  }
}
