// ============================================================
// ALETIS — Alix Document Intake: XLSX / CSV Parser
// - XLSX/XLS: exceljs (ler buffer, iterar sheets)
// - CSV: parser simples (split \n / ,) resiliente a aspas
// Gera extractedText em markdown (tabelas por aba) + previews.
// ============================================================

import type {
  DocumentChunk,
  DocumentEvidence,
  ParserResult,
  TablePreview,
  SheetInfo,
  SpreadsheetColumnProfile,
  SpreadsheetProfile,
  SpreadsheetSheetProfile,
} from './types.js'
import ExcelJS from 'exceljs'
import { createHash } from 'node:crypto'

/** O limite é de orçamento total e é informado; não corta cada aba nas primeiras linhas. */
const MAX_TEXT_CHARACTERS = 2_000_000
const MAX_TEXT_ROWS = 100_000
const ROWS_PER_CHUNK = 40
/** Linhas de pré-visualização persistidas em metadata (além do header). */
const PREVIEW_ROWS = 5
/** Evita metadata gigante em planilhas largas demais. */
const MAX_PROFILE_COLUMNS = 120

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>
    // exceljs richText / hyperlink / formula cells
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.result === 'string' || typeof obj.result === 'number')
      return String(obj.result)
    if (Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: string }>)
        .map((r) => r.text ?? '')
        .join('')
    }
    if (typeof obj.hyperlink === 'string') return obj.hyperlink
  }
  try {
    return String(v)
  } catch {
    return ''
  }
}

function looksLikeDate(raw: string): boolean {
  const s = raw.trim()
  if (!s) return false
  return (
    /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(s) ||
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s) ||
    /^\d{1,2}-\d{1,2}-\d{2,4}$/.test(s)
  )
}

function coerceNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v instanceof Date) return null
  if (typeof v === 'object' && v !== null) {
    const obj = v as Record<string, unknown>
    if (typeof obj.result === 'number' && Number.isFinite(obj.result)) return obj.result
    if (typeof obj.result === 'string') return coerceNumber(obj.result)
    if (typeof obj.text === 'string') return coerceNumber(obj.text)
  }
  if (typeof v !== 'string') return null

  let s = v.trim()
  if (!s) return null
  s = s
    .replace(/\s+/g, '')
    .replace(/^R\$/i, '')
    .replace(/%$/, '')
    .replace(/[^\d,.-]/g, '')
  if (!s || /^[-.,]+$/.test(s)) return null

  // pt-BR: 1.234.567,89
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (/^-?\d+,\d+$/.test(s)) {
    s = s.replace(',', '.')
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, '')
  }

  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function isFormulaValue(v: unknown): boolean {
  return !!(
    v &&
    typeof v === 'object' &&
    ('formula' in (v as Record<string, unknown>) ||
      'sharedFormula' in (v as Record<string, unknown>))
  )
}

type MutableColumnProfile = SpreadsheetColumnProfile & {
  sampleSet: Set<string>
}

function emptyColumnProfile(index: number, header: string): MutableColumnProfile {
  return {
    index,
    header: header || `col${index}`,
    nonEmpty: 0,
    numericCount: 0,
    textCount: 0,
    dateCount: 0,
    formulaCount: 0,
    sampleValues: [],
    sampleSet: new Set<string>(),
  }
}

function addSample(profile: MutableColumnProfile, value: string): void {
  const s = value.replace(/\s+/g, ' ').trim()
  if (!s || profile.sampleSet.has(s)) return
  if (profile.sampleValues.length >= 5) return
  profile.sampleSet.add(s)
  profile.sampleValues.push(s.length > 80 ? `${s.slice(0, 77)}...` : s)
}

function addNumeric(profile: MutableColumnProfile, n: number): void {
  profile.numericCount++
  profile.sum = (profile.sum ?? 0) + n
  profile.min = profile.min === undefined ? n : Math.min(profile.min, n)
  profile.max = profile.max === undefined ? n : Math.max(profile.max, n)
  profile.avg = profile.sum / profile.numericCount
}

function finalizeColumns(cols: MutableColumnProfile[]): SpreadsheetColumnProfile[] {
  return cols
    .filter((c) => c.nonEmpty > 0 || c.header)
    .map(({ sampleSet: _sampleSet, ...c }) => ({
      ...c,
      sum: c.sum === undefined ? undefined : Number(c.sum.toFixed(2)),
      min: c.min === undefined ? undefined : Number(c.min.toFixed(2)),
      max: c.max === undefined ? undefined : Number(c.max.toFixed(2)),
      avg: c.avg === undefined ? undefined : Number(c.avg.toFixed(2)),
    }))
}

function renderMarkdownTable(headers: string[], rows: string[][]): string {
  if (headers.length === 0 && rows.length === 0) return '_(planilha vazia)_'
  const safeHeaders = headers.length
    ? headers
    : rows[0]?.map((_, i) => `col${i + 1}`) ?? []
  const headerLine = `| ${safeHeaders.map((h) => h || ' ').join(' | ')} |`
  const sepLine = `| ${safeHeaders.map(() => '---').join(' | ')} |`
  const bodyLines = rows.map(
    (r) =>
      `| ${safeHeaders
        .map((_, i) => (r[i] ?? '').replace(/\r?\n/g, ' ').trim() || ' ')
        .join(' | ')} |`,
  )
  return [headerLine, sepLine, ...bodyLines].join('\n')
}

function appendSheetBlocks(args: {
  kind: 'xlsx' | 'csv'; sheet: string; headers: string[]; rows: Array<{ number: number; values: string[] }>;
  chunks: DocumentChunk[]; evidences: DocumentEvidence[]; budget: { characters: number; rows: number; partial: boolean };
}): number {
  let included = 0
  for (let offset = 0; offset < args.rows.length; offset += ROWS_PER_CHUNK) {
    const block = args.rows.slice(offset, offset + ROWS_PER_CHUNK)
    const start = block[0].number
    const end = block[block.length - 1].number
    const text = `## ${args.sheet} — linhas ${start}–${end}\n\n${renderMarkdownTable(['Linha', ...args.headers], block.map(row => [String(row.number), ...row.values]))}`
    if (args.budget.characters + text.length > MAX_TEXT_CHARACTERS || args.budget.rows + block.length > MAX_TEXT_ROWS) {
      args.budget.partial = true
      break
    }
    const source = `${args.kind}:sheet:${args.sheet}:rows:${start}-${end}`
    const id = createHash('sha256').update(`${source}\n${text}`).digest('hex').slice(0, 32)
    const evidence: DocumentEvidence = { id: `sheet-evidence-${id}`, kind: 'table', source, text, sheet: args.sheet, table: args.sheet, confidence: .95, metadata: { rowStart: start, rowEnd: end } }
    args.evidences.push(evidence)
    args.chunks.push({ id: `sheet-chunk-${id}`, ordinal: args.chunks.length, kind: 'table', text, source, sheet: args.sheet, table: args.sheet, confidence: .95, evidenceIds: [evidence.id], metadata: { rowStart: start, rowEnd: end } })
    args.budget.characters += text.length
    args.budget.rows += block.length
    included += block.length
  }
  return included
}

function spreadsheetCoverage(totalRows: number, extractedRows: number, partial: boolean) {
  return { status: partial ? 'partial' as const : 'complete' as const, totalRows, extractedRows,
    limitations: partial ? [`Extração parcial: ${extractedRows} de ${totalRows} linha(s); orçamento de ${MAX_TEXT_CHARACTERS} caracteres ou ${MAX_TEXT_ROWS} linhas atingido. Divida a planilha para completar a leitura.`] : [] }
}

function profileMatrix(sheetName: string, matrix: string[][]): SpreadsheetSheetProfile {
  const rows = matrix.length
  const cols = matrix.reduce((acc, r) => Math.max(acc, r.length), 0)
  const headers = matrix[0] ?? []
  const profiles: MutableColumnProfile[] = []
  const maxCols = Math.min(cols, MAX_PROFILE_COLUMNS)
  for (let i = 0; i < maxCols; i++) {
    profiles.push(emptyColumnProfile(i + 1, headers[i] || `col${i + 1}`))
  }

  let nonEmptyRows = 0
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? []
    let rowHasValue = false
    for (let c = 0; c < maxCols; c++) {
      const raw = row[c] ?? ''
      const text = cellToString(raw).trim()
      if (!text) continue
      rowHasValue = true
      const profile = profiles[c]
      profile.nonEmpty++
      const n = coerceNumber(text)
      if (n !== null) {
        addNumeric(profile, n)
      } else if (looksLikeDate(text)) {
        profile.dateCount++
      } else {
        profile.textCount++
      }
      addSample(profile, text)
    }
    if (rowHasValue) nonEmptyRows++
  }

  return {
    name: sheetName,
    rows,
    cols,
    nonEmptyRows,
    formulaCells: 0,
    mergedCells: 0,
    columns: finalizeColumns(profiles),
  }
}

function detectHeaderRow(ws: ExcelJS.Worksheet, maxRows = 12): number {
  let bestRow = 1
  let bestScore = -1
  const limit = Math.min(ws.actualRowCount || ws.rowCount || 1, maxRows)
  for (let rowNumber = 1; rowNumber <= limit; rowNumber++) {
    const values = ws.getRow(rowNumber).values as unknown[]
    const cells = values.slice(1).map(cellToString).map((v) => v.trim()).filter(Boolean)
    if (!cells.length) continue
    const textual = cells.filter((v) => coerceNumber(v) === null && !looksLikeDate(v)).length
    const score = cells.length + textual * 0.5
    if (score > bestScore) { bestScore = score; bestRow = rowNumber }
  }
  return bestRow
}

// ───────────────────────── CSV ─────────────────────────

/** Registros CSV preservam delimitadores e quebras de linha dentro de aspas. */
function parseCsvRecords(raw: string): string[][] {
  const firstRecord = raw.split(/\r?\n/, 1)[0] || ''
  const delimiterCounts = new Map([',', ';', '\t'].map(delimiter => [delimiter, 0]))
  let quoted = false
  for (let i = 0; i < firstRecord.length; i++) {
    if (firstRecord[i] === '"') { if (quoted && firstRecord[i + 1] === '"') i++; else quoted = !quoted }
    else if (!quoted && delimiterCounts.has(firstRecord[i])) delimiterCounts.set(firstRecord[i], delimiterCounts.get(firstRecord[i])! + 1)
  }
  const delimiter = [...delimiterCounts].sort((a, b) => b[1] - a[1])[0][0]
  const records: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else {
      if (ch === delimiter) {
        row.push(cur)
        cur = ''
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && raw[i + 1] === '\n') i++
        row.push(cur)
        if (row.some(value => value.length)) records.push(row)
        row = []; cur = ''
      } else if (ch === '"') {
        inQuotes = true
      } else {
        cur += ch
      }
    }
  }
  if (inQuotes) throw new Error('CSV inválido: campo entre aspas não foi fechado.')
  row.push(cur)
  if (row.some(value => value.length)) records.push(row)
  return records
}

export async function parseCsv(buffer: Buffer): Promise<ParserResult> {
  const raw = buffer.toString('utf-8').replace(/^﻿/, '')
  const matrix = parseCsvRecords(raw)
  const headers = matrix[0] ?? []
  const body = matrix.slice(1)
  const preview: TablePreview = {
    sheet: 'csv',
    headers,
    rows: body.slice(0, PREVIEW_ROWS),
  }
  const sheet: SheetInfo = {
    name: 'csv',
    rows: matrix.length,
    cols: matrix.reduce((acc, r) => Math.max(acc, r.length), 0),
  }
  const chunks: DocumentChunk[] = []
  const evidences: DocumentEvidence[] = []
  const budget = { characters: 0, rows: 0, partial: false }
  appendSheetBlocks({ kind: 'csv', sheet: 'csv', headers: Array.from({ length: sheet.cols }, (_, index) => headers[index] || `col${index + 1}`), rows: matrix.map((values, index) => ({ number: index + 1, values })), chunks, evidences, budget })
  const spreadsheetProfile: SpreadsheetProfile = {
    totalSheets: 1,
    totalRows: sheet.rows,
    totalCols: sheet.cols,
    totalFormulaCells: 0,
    sheets: [profileMatrix('csv', matrix)],
  }
  return {
    kind: 'csv',
    extractedText: chunks.map(chunk => chunk.text).join('\n\n'), chunks, evidences,
    metadata: {
      sheets: [sheet],
      tablePreviews: [preview],
      spreadsheetProfile,
      extractionCoverage: spreadsheetCoverage(matrix.length, budget.rows, budget.partial),
    },
  }
}

// ───────────────────────── XLSX ─────────────────────────

export async function parseXlsx(buffer: Buffer): Promise<ParserResult> {
  const workbook = new ExcelJS.Workbook()
  // exceljs tipa load() como aceitando Buffer/ArrayBuffer — ok em runtime.
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)

  const sheets: SheetInfo[] = []
  const previews: TablePreview[] = []
  const sheetProfiles: SpreadsheetSheetProfile[] = []
  const chunks: DocumentChunk[] = []
  const evidences: DocumentEvidence[] = []
  const budget = { characters: 0, rows: 0, partial: false }

  workbook.eachSheet((ws) => {
    // actualRowCount conta apenas linhas preenchidas; rowCount é a última linha real.
    const rowsCount = ws.rowCount || ws.actualRowCount || 0
    const colsCount = ws.columnCount || ws.actualColumnCount || 0
    sheets.push({ name: ws.name, rows: rowsCount, cols: colsCount })

    const headerRowNumber = detectHeaderRow(ws)
    const firstRow = ws.getRow(headerRowNumber)
    const headers: string[] = []
    if (firstRow && firstRow.values) {
      const vals = firstRow.values as unknown[]
      // exceljs é 1-indexed: values[0] é null
      for (let i = 1; i < vals.length; i++) {
        headers.push(cellToString(vals[i]))
      }
    }

    const bodyRows: string[][] = []
    const limit = Math.min(rowsCount, MAX_TEXT_ROWS)
    for (let r = headerRowNumber + 1; r <= Math.min(limit, headerRowNumber + PREVIEW_ROWS); r++) {
      const row = ws.getRow(r)
      if (!row || !row.values) {
        bodyRows.push([])
        continue
      }
      const vals = row.values as unknown[]
      const line: string[] = []
      for (let i = 1; i <= Math.max(headers.length, vals.length - 1); i++) {
        line.push(cellToString(vals[i]))
      }
      // evita linhas totalmente vazias
      if (line.some((c) => c && c.trim().length > 0)) bodyRows.push(line)
    }

    const maxProfileCols = Math.min(colsCount, MAX_PROFILE_COLUMNS)
    const profileCols: MutableColumnProfile[] = []
    for (let c = 1; c <= maxProfileCols; c++) {
      profileCols.push(emptyColumnProfile(c, headers[c - 1] || `col${c}`))
    }
    let nonEmptyRows = 0
    let formulaCells = 0

    for (let r = headerRowNumber + 1; r <= Math.max(rowsCount, ws.rowCount ?? 0); r++) {
      const row = ws.getRow(r)
      let rowHasValue = false
      for (let c = 1; c <= maxProfileCols; c++) {
        const cell = row.getCell(c)
        const value = cell?.value
        const text = cellToString(value).trim()
        const profile = profileCols[c - 1]
        if (isFormulaValue(value)) {
          formulaCells++
          profile.formulaCount++
        }
        if (!text) continue
        rowHasValue = true
        profile.nonEmpty++
        const n = coerceNumber(value)
        if (n !== null) {
          addNumeric(profile, n)
        } else if (value instanceof Date || looksLikeDate(text)) {
          profile.dateCount++
        } else {
          profile.textCount++
        }
        addSample(profile, text)
      }
      if (rowHasValue) nonEmptyRows++
    }

    const model = (ws as unknown as { model?: { merges?: unknown[] } }).model
    const mergedCells = Array.isArray(model?.merges) ? model.merges.length : 0
    sheetProfiles.push({
      name: ws.name,
      rows: rowsCount,
      cols: colsCount,
      nonEmptyRows,
      formulaCells,
      mergedCells,
      columns: finalizeColumns(profileCols),
    })

    previews.push({
      sheet: ws.name,
      headers,
      rows: bodyRows.slice(0, PREVIEW_ROWS),
    })

    const completeRows: Array<{ number: number; values: string[] }> = []
    for (let r = 1; r <= limit; r++) {
      const values = ws.getRow(r).values as unknown[]
      completeRows.push({ number: r, values: Array.from({ length: Math.max(headers.length, values.length - 1) }, (_, index) => cellToString(values[index + 1])) })
    }
    if (rowsCount > limit) budget.partial = true
    const fullHeaders = Array.from({ length: colsCount }, (_, index) => headers[index] || `col${index + 1}`)
    appendSheetBlocks({ kind: 'xlsx', sheet: ws.name, headers: fullHeaders, rows: completeRows, chunks, evidences, budget })
  })

  const spreadsheetProfile: SpreadsheetProfile = {
    totalSheets: sheetProfiles.length,
    totalRows: sheetProfiles.reduce((acc, s) => acc + s.rows, 0),
    totalCols: sheetProfiles.reduce((acc, s) => Math.max(acc, s.cols), 0),
    totalFormulaCells: sheetProfiles.reduce((acc, s) => acc + s.formulaCells, 0),
    sheets: sheetProfiles,
  }

  return {
    kind: 'xlsx',
    extractedText: chunks.map(chunk => chunk.text).join('\n\n').trim(), chunks, evidences,
    metadata: {
      sheets,
      tablePreviews: previews,
      spreadsheetProfile,
      extractionCoverage: spreadsheetCoverage(spreadsheetProfile.totalRows, budget.rows, budget.partial),
    },
  }
}
