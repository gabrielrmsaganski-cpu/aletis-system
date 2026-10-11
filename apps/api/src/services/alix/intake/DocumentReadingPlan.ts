import { createHash } from 'node:crypto'
import type { IngestedDocument } from './types.js'

export interface DocumentExtractionCoverage {
  status: 'complete' | 'partial' | 'unknown'
  totalPages?: number
  readablePages?: number[]
  pendingPages?: number[]
  failedPages?: number[]
  totalRows?: number
  extractedRows?: number
  limitations: string[]
}

export interface DocumentReadingSegment {
  /** Índice estável, começando em zero; end é exclusivo. */
  index: number
  start: number
  end: number
  contextStart: number
  text: string
  pageStart?: number
  pageEnd?: number
}

export interface DocumentReadingPlan {
  version: 1
  sourceHash: string
  totalCharacters: number
  segmentCharacters: number
  segments: DocumentReadingSegment[]
  extraction: DocumentExtractionCoverage
}

export interface DocumentReadingCoverage {
  version: 1
  sourceHash: string
  status: 'complete' | 'partial' | 'unavailable'
  complete: boolean
  totalCharacters: number
  analyzedCharacters: number
  totalSegments: number
  analyzedSegments: number
  pendingSegments: number[]
  failedSegments: number[]
  extraction: DocumentExtractionCoverage
  limitations: string[]
}

export function boundedReadingNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.max(min, Math.min(max, Math.floor(n))) : fallback
}

function pageNumbers(value: unknown): number[] {
  return Array.isArray(value) ? [...new Set(value.map(Number).filter(n => Number.isInteger(n) && n > 0))].sort((a, b) => a - b) : []
}

/** Não confunde texto disponível com prova de que todas as páginas foram extraídas. */
export function documentExtractionCoverage(doc: Pick<IngestedDocument, 'kind' | 'extractedText' | 'pageCount' | 'metadata' | 'evidences'>): DocumentExtractionCoverage {
  const saved = doc.metadata?.extractionCoverage as Partial<DocumentExtractionCoverage> | undefined
  if (saved && ['complete', 'partial', 'unknown'].includes(String(saved.status))) {
    return {
      ...saved,
      status: saved.status!,
      limitations: Array.isArray(saved.limitations) ? saved.limitations.map(String) : [],
      ...(saved.readablePages ? { readablePages: pageNumbers(saved.readablePages) } : {}),
      ...(saved.pendingPages ? { pendingPages: pageNumbers(saved.pendingPages) } : {}),
      ...(saved.failedPages ? { failedPages: pageNumbers(saved.failedPages) } : {}),
    }
  }
  if (doc.kind === 'pdf' && doc.pageCount) {
    const ocr = doc.metadata?.ocr as { failedPages?: Array<{ page: number }>; succeededPages?: number[] } | undefined
    const stats = Array.isArray(doc.metadata?.pageTextStats) ? doc.metadata.pageTextStats as Array<{ page: number; textChars: number; ocrSucceeded?: boolean }> : []
    const statsPages = pageNumbers(stats.map(stat => stat.page))
    if (statsPages.length === doc.pageCount && statsPages.every((page, index) => page === index + 1)) {
      const readablePages = pageNumbers(stats.filter(stat => Number(stat.textChars) >= 80 || stat.ocrSucceeded === true).map(stat => stat.page))
      const pendingPages = statsPages.filter(page => !readablePages.includes(page))
      return { status: pendingPages.length ? 'partial' : 'complete', totalPages: doc.pageCount, readablePages, pendingPages,
        failedPages: pageNumbers(ocr?.failedPages?.map(item => item.page)),
        limitations: pendingPages.length ? [`${pendingPages.length} página(s) sem texto suficiente ou OCR confirmado nos registros do parser.`] : [] }
    }
    const readablePages = pageNumbers([
      ...(doc.evidences || []).filter(e => e.text.trim().length > 0 && e.page).map(e => e.page),
      ...Array.from(doc.extractedText.matchAll(/---\s*(?:OCR\s+)?P[aá]gina\s+(\d+)\s*---/gi), m => Number(m[1])),
    ])
    const pendingPages = Array.from({ length: doc.pageCount }, (_, i) => i + 1).filter(page => !readablePages.includes(page))
    const failedPages = pageNumbers(ocr?.failedPages?.map(item => item.page))
    return {
      status: pendingPages.length || failedPages.length ? 'partial' : 'unknown',
      totalPages: doc.pageCount, readablePages, pendingPages, failedPages,
      limitations: pendingPages.length
        ? [`${pendingPages.length} página(s) sem texto verificável; é necessário concluir OCR ou revisar o original.`]
        : ['Documento legado sem comprovante de cobertura do parser; a leitura considera somente o texto extraído disponível.'],
    }
  }
  if (doc.kind === 'xlsx' || doc.kind === 'csv') {
    const rows = Number(doc.metadata?.spreadsheetProfile?.totalRows || 0)
    return { status: 'unknown', ...(rows ? { totalRows: rows } : {}), limitations: ['Planilha legada sem comprovante de cobertura; reprocessar o original para assegurar todas as linhas.'] }
  }
  if (doc.kind === 'image') return { status: 'partial', limitations: ['Imagem sem comprovante de OCR textual; a descrição de dimensões e a visão do modelo não comprovam extração integral indexável.'] }
  if (!doc.extractedText.trim()) return { status: 'partial', limitations: ['Não há texto verificável extraído; imagem ou arquivo nativo não comprovam cobertura textual.'] }
  return { status: 'complete', limitations: [] }
}

/** Segmentos consecutivos, sem amostragem. A sobreposição só fornece contexto e não infla a cobertura. */
export function buildDocumentReadingPlan(doc: Pick<IngestedDocument, 'kind' | 'extractedText' | 'pageCount' | 'metadata' | 'evidences'>, options: { segmentCharacters?: number; overlapCharacters?: number } = {}): DocumentReadingPlan {
  const text = String(doc.extractedText || '')
  const segmentCharacters = boundedReadingNumber(options.segmentCharacters, 32_000, 1_000, 100_000)
  const overlap = boundedReadingNumber(options.overlapCharacters, 400, 1, Math.min(2_000, segmentCharacters / 4))
  const extraction = documentExtractionCoverage(doc)
  const markers = Array.from(text.matchAll(/---\s*(?:OCR\s+)?P[aá]gina\s+(\d+)\s*---/gi), match => ({ position: match.index!, page: Number(match[1]) }))
  const segments: DocumentReadingSegment[] = []
  for (let start = 0; start < text.length;) {
    const hardEnd = Math.min(start + segmentCharacters, text.length)
    const newline = text.lastIndexOf('\n', hardEnd)
    const end = hardEnd < text.length && newline > start + segmentCharacters * .65 ? newline + 1 : hardEnd
    const contextStart = Math.max(0, start - overlap)
    const pages = markers.filter((marker, index) => marker.position < end && (markers[index + 1]?.position ?? text.length) > contextStart).map(marker => marker.page)
    segments.push({ index: segments.length, start, end, contextStart, text: text.slice(contextStart, end), ...(pages.length ? { pageStart: Math.min(...pages), pageEnd: Math.max(...pages) } : {}) })
    start = end
  }
  const sourceHash = createHash('sha256').update(JSON.stringify({ text, extraction, kind: doc.kind, pageCount: doc.pageCount })).digest('hex')
  return { version: 1, sourceHash, totalCharacters: text.length, segmentCharacters, segments, extraction }
}

export function documentReadingCoverage(plan: DocumentReadingPlan, completed: Iterable<number>, failed: Iterable<number> = [], limitations: string[] = []): DocumentReadingCoverage {
  const successes = new Set(completed)
  const failedSegments = [...new Set(failed)].filter(index => !successes.has(index) && plan.segments.some(segment => segment.index === index)).sort((a, b) => a - b)
  const pendingSegments = plan.segments.filter(segment => !successes.has(segment.index)).map(segment => segment.index)
  const analyzedCharacters = plan.segments.filter(segment => successes.has(segment.index)).reduce((sum, segment) => sum + segment.end - segment.start, 0)
  const complete = plan.segments.length > 0 && !pendingSegments.length && plan.extraction.status === 'complete'
  const notes = [...plan.extraction.limitations, ...limitations]
  if (pendingSegments.length) notes.push(`${pendingSegments.length} de ${plan.segments.length} segmento(s) ainda não analisado(s). Continue a leitura antes de concluir sobre o documento integral.`)
  return {
    version: 1, sourceHash: plan.sourceHash, status: complete ? 'complete' : analyzedCharacters ? 'partial' : 'unavailable', complete,
    totalCharacters: plan.totalCharacters, analyzedCharacters, totalSegments: plan.segments.length,
    analyzedSegments: plan.segments.length - pendingSegments.length, pendingSegments, failedSegments,
    extraction: plan.extraction, limitations: [...new Set(notes)],
  }
}
