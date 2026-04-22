// ============================================================
// ALETIS — Alix Document Intake: XLSX / CSV Parser
// - XLSX/XLS: exceljs (ler buffer, iterar sheets)
// - CSV: parser simples (split \n / ,) resiliente a aspas
// Gera extractedText em markdown (tabelas por aba) + previews.
// ============================================================

import type { ParserResult, TablePreview, SheetInfo } from './types.js'

/** Máximo de linhas consideradas em extractedText por aba. */
const MAX_ROWS_IN_TEXT = 200
/** Linhas de pré-visualização persistidas em metadata (além do header). */
const PREVIEW_ROWS = 5

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

// ───────────────────────── CSV ─────────────────────────

/** CSV line parser consciente de aspas duplas com escape "". */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else {
      if (ch === ',') {
        out.push(cur)
        cur = ''
      } else if (ch === '"') {
        inQuotes = true
      } else {
        cur += ch
      }
    }
  }
  out.push(cur)
  return out
}

export async function parseCsv(buffer: Buffer): Promise<ParserResult> {
  const raw = buffer.toString('utf-8').replace(/^﻿/, '')
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0)
  const matrix = lines.map(parseCsvLine)
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
  const md = `## csv\n\n${renderMarkdownTable(
    headers,
    body.slice(0, MAX_ROWS_IN_TEXT),
  )}`
  return {
    kind: 'csv',
    extractedText: md,
    metadata: {
      sheets: [sheet],
      tablePreviews: [preview],
    },
  }
}

// ───────────────────────── XLSX ─────────────────────────

export async function parseXlsx(buffer: Buffer): Promise<ParserResult> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  // exceljs tipa load() como aceitando Buffer/ArrayBuffer — ok em runtime.
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)

  const sheets: SheetInfo[] = []
  const previews: TablePreview[] = []
  const textChunks: string[] = []

  workbook.eachSheet((ws) => {
    const rowsCount = ws.actualRowCount ?? ws.rowCount ?? 0
    const colsCount = ws.actualColumnCount ?? ws.columnCount ?? 0
    sheets.push({ name: ws.name, rows: rowsCount, cols: colsCount })

    const firstRow = ws.getRow(1)
    const headers: string[] = []
    if (firstRow && firstRow.values) {
      const vals = firstRow.values as unknown[]
      // exceljs é 1-indexed: values[0] é null
      for (let i = 1; i < vals.length; i++) {
        headers.push(cellToString(vals[i]))
      }
    }

    const bodyRows: string[][] = []
    const limit = Math.min(rowsCount, MAX_ROWS_IN_TEXT + 1)
    for (let r = 2; r <= limit; r++) {
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

    previews.push({
      sheet: ws.name,
      headers,
      rows: bodyRows.slice(0, PREVIEW_ROWS),
    })

    textChunks.push(`## ${ws.name}\n\n${renderMarkdownTable(headers, bodyRows)}`)
  })

  return {
    kind: 'xlsx',
    extractedText: textChunks.join('\n\n').trim(),
    metadata: {
      sheets,
      tablePreviews: previews,
    },
  }
}
