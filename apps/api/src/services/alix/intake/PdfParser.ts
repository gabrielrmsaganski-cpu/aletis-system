// ============================================================
// ALETIS — Alix Document Intake: PDF Parser
// Extração por página + renderização + OCR real. PDFs digitais
// preservam texto nativo; páginas escaneadas/fracas passam por
// render PNG e Tesseract. O parser também devolve chunks e
// evidências recuperáveis para RAG.
// ============================================================

import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { promisify } from 'util'
import { execFile } from 'child_process'

import type { DocumentChunk, DocumentEvidence, ParserResult } from './types.js'
import type { DocumentExtractionCoverage } from './DocumentReadingPlan.js'

const execFileAsync = promisify(execFile)

const DEFAULT_CHUNK_CHARS = 3200
const DEFAULT_CHUNK_OVERLAP = 250

function envNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

function normalizeText(text: string): string {
  return (text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

function splitText(text: string, maxChars = DEFAULT_CHUNK_CHARS, overlap = DEFAULT_CHUNK_OVERLAP): string[] {
  const clean = normalizeText(text)
  if (!clean) return []
  if (clean.length <= maxChars) return [clean]

  const chunks: string[] = []
  let start = 0
  while (start < clean.length) {
    const hardEnd = Math.min(clean.length, start + maxChars)
    let end = hardEnd
    const paragraphBreak = clean.lastIndexOf('\n\n', hardEnd)
    if (paragraphBreak > start + maxChars * 0.55) end = paragraphBreak
    else {
      const sentenceBreak = clean.lastIndexOf('. ', hardEnd)
      if (sentenceBreak > start + maxChars * 0.55) end = sentenceBreak + 1
    }
    chunks.push(clean.slice(start, end).trim())
    if (end >= clean.length) break
    start = Math.max(0, end - overlap)
  }
  return chunks.filter(Boolean)
}

function makeEvidence(args: {
  kind: DocumentEvidence['kind']
  source: string
  text: string
  page: number
  confidence: number
  metadata?: Record<string, unknown>
}): DocumentEvidence {
  return {
    id: randomUUID(),
    kind: args.kind,
    source: args.source,
    text: args.text,
    page: args.page,
    confidence: args.confidence,
    metadata: args.metadata,
  }
}

function chunksFromEvidence(
  evidence: DocumentEvidence,
  ordinalStart: number,
): { chunks: DocumentChunk[]; nextOrdinal: number } {
  let ordinal = ordinalStart
  const chunks = splitText(evidence.text).map((text) => {
    const chunk: DocumentChunk = {
      id: randomUUID(),
      ordinal,
      kind: evidence.kind === 'ocr' ? 'ocr' : 'text',
      text,
      source: evidence.source,
      pageStart: evidence.page,
      pageEnd: evidence.page,
      confidence: evidence.confidence,
      evidenceIds: [evidence.id],
    }
    ordinal += 1
    return chunk
  })
  return { chunks, nextOrdinal: ordinal }
}

async function renderPageWithUnpdf(
  pdf: unknown,
  pageNumber: number,
  targetPath: string,
): Promise<void> {
  const { renderPageAsImage } = await import('unpdf')
  const scale = envNumber('ALIX_PDF_RENDER_SCALE', 2)
  const rendered = await renderPageAsImage(pdf as never, pageNumber, {
    scale,
    toDataURL: false,
  })
  await fs.writeFile(targetPath, Buffer.from(rendered as ArrayBuffer))
}

async function renderPageWithPdftoppm(
  pdfPath: string,
  pageNumber: number,
  workDir: string,
): Promise<string> {
  const prefix = join(workDir, `pdftoppm-page-${pageNumber}`)
  const before = new Set(await fs.readdir(workDir))
  const density = String(envNumber('ALIX_PDF_RENDER_DPI', 220))
  await execFileAsync(
    'pdftoppm',
    ['-png', '-r', density, '-f', String(pageNumber), '-l', String(pageNumber), pdfPath, prefix],
    { timeout: envNumber('ALIX_PDF_RENDER_TIMEOUT_MS', 30_000), maxBuffer: 1024 * 1024 },
  )
  const after = await fs.readdir(workDir)
  const created = after.find((name) => !before.has(name) && name.startsWith(basename(prefix)) && name.endsWith('.png'))
  if (!created) throw new Error(`pdftoppm não gerou imagem para página ${pageNumber}`)
  return join(workDir, created)
}

async function renderPageImage(args: {
  pdf: unknown
  pdfPath: string
  pageNumber: number
  workDir: string
}): Promise<{ path: string; renderer: 'unpdf' | 'pdftoppm' }> {
  const targetPath = join(args.workDir, `page-${args.pageNumber}.png`)
  try {
    await renderPageWithUnpdf(args.pdf, args.pageNumber, targetPath)
    return { path: targetPath, renderer: 'unpdf' }
  } catch {
    const fallbackPath = await renderPageWithPdftoppm(args.pdfPath, args.pageNumber, args.workDir)
    return { path: fallbackPath, renderer: 'pdftoppm' }
  }
}

async function runTesseract(imagePath: string): Promise<string> {
  const lang = process.env.ALIX_TESSERACT_LANG || 'por+eng'
  const { stdout } = await execFileAsync(
    'tesseract',
    [imagePath, 'stdout', '-l', lang, '--psm', process.env.ALIX_TESSERACT_PSM || '6'],
    {
      timeout: envNumber('ALIX_TESSERACT_TIMEOUT_MS', 60_000),
      maxBuffer: envNumber('ALIX_TESSERACT_MAX_BUFFER', 8 * 1024 * 1024),
    },
  )
  return normalizeText(stdout)
}

function shouldOcrPage(pageText: string, totalTextChars: number): boolean {
  if (process.env.ALIX_PDF_OCR === '0') return false
  if (process.env.ALIX_PDF_OCR_ALL === '1') return true
  const minPageChars = envNumber('ALIX_PDF_OCR_MIN_PAGE_TEXT_CHARS', 80)
  const minDocChars = envNumber('ALIX_PDF_OCR_MIN_DOC_TEXT_CHARS', 400)
  return normalizeText(pageText).length < minPageChars || totalTextChars < minDocChars
}

function buildExtractedText(sections: Array<{ label: string; text: string }>): string {
  return sections
    .filter((s) => normalizeText(s.text))
    .map((s) => `--- ${s.label} ---\n${normalizeText(s.text)}`)
    .join('\n\n')
    .trim()
}

export async function parsePdf(buffer: Buffer, options: { maxOcrPages?: number } = {}): Promise<ParserResult> {
  const { extractText, getDocumentProxy } = await import('unpdf')
  // Cópia explícita para evitar problemas com Buffer pool do Node.js,
  // que pode reusar o ArrayBuffer subjacente e causar detached ArrayBuffer
  // em bibliotecas como unpdf.
  const data = Uint8Array.from(buffer)
  const pdf = await getDocumentProxy(data)
  const extracted = await extractText(pdf, { mergePages: false }) as { totalPages: number; text: string[] }
  const totalPages = extracted.totalPages || extracted.text?.length || 0
  const pageTexts = Array.from({ length: totalPages }, (_, idx) => normalizeText(extracted.text?.[idx] ?? ''))
  const totalTextChars = pageTexts.reduce((sum, page) => sum + page.length, 0)
  const maxOcrPages = options.maxOcrPages ?? envNumber('ALIX_PDF_OCR_MAX_PAGES', 20)

  const evidences: DocumentEvidence[] = []
  const chunks: DocumentChunk[] = []
  const sections: Array<{ label: string; text: string; page: number }> = []
  const ocrStats: {
    enabled: boolean
    engine: 'tesseract'
    lang: string
    attemptedPages: number[]
    succeededPages: number[]
    failedPages: Array<{ page: number; error: string }>
    pendingPages: number[]
    renderers: Record<string, number>
    maxPages: number
  } = {
    enabled: process.env.ALIX_PDF_OCR !== '0',
    engine: 'tesseract',
    lang: process.env.ALIX_TESSERACT_LANG || 'por+eng',
    attemptedPages: [],
    succeededPages: [],
    failedPages: [],
    pendingPages: [],
    renderers: {},
    maxPages: maxOcrPages,
  }

  let ordinal = 0
  for (let pageIndex = 0; pageIndex < pageTexts.length; pageIndex += 1) {
    const page = pageIndex + 1
    const text = pageTexts[pageIndex]
    if (text) {
      const evidence = makeEvidence({
        kind: 'text',
        source: `pdf:p${page}:text`,
        text,
        page,
        confidence: 0.95,
        metadata: { extraction: 'pdfjs-text' },
      })
      evidences.push(evidence)
      const built = chunksFromEvidence(evidence, ordinal)
      chunks.push(...built.chunks)
      ordinal = built.nextOrdinal
      sections.push({ label: `Página ${page}`, text, page })
    }
  }

  let firstRenderedPageBase64: string | undefined
  const workDir = await fs.mkdtemp(join(tmpdir(), 'alix-pdf-'))
  const pdfPath = join(workDir, 'input.pdf')
  try {
    await fs.writeFile(pdfPath, buffer)
    let attempted = 0
    for (let pageIndex = 0; pageIndex < pageTexts.length; pageIndex += 1) {
      const page = pageIndex + 1
      if (!shouldOcrPage(pageTexts[pageIndex], totalTextChars)) continue
      if (attempted >= maxOcrPages) {
        ocrStats.pendingPages.push(page)
        continue
      }
      attempted += 1
      ocrStats.attemptedPages.push(page)

      try {
        const rendered = await renderPageImage({ pdf, pdfPath, pageNumber: page, workDir })
        ocrStats.renderers[rendered.renderer] = (ocrStats.renderers[rendered.renderer] ?? 0) + 1
        if (!firstRenderedPageBase64) {
          firstRenderedPageBase64 = (await fs.readFile(rendered.path)).toString('base64')
        }
        const ocrText = await runTesseract(rendered.path)
        if (!ocrText) {
          ocrStats.failedPages.push({ page, error: 'OCR não encontrou texto legível nesta página.' })
          continue
        }

        const evidence = makeEvidence({
          kind: 'ocr',
          source: `pdf:p${page}:ocr:tesseract`,
          text: ocrText,
          page,
          confidence: 0.72,
          metadata: { engine: 'tesseract', lang: ocrStats.lang },
        })
        evidences.push(evidence)
        const built = chunksFromEvidence(evidence, ordinal)
        chunks.push(...built.chunks)
        ordinal = built.nextOrdinal
        sections.push({ label: `OCR Página ${page}`, text: ocrText, page })
        ocrStats.succeededPages.push(page)
      } catch (err) {
        ocrStats.failedPages.push({
          page,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }

  sections.sort((a, b) => a.page - b.page)
  chunks.sort((a, b) => (a.pageStart || 0) - (b.pageStart || 0) || a.ordinal - b.ordinal)
  chunks.forEach((chunk, index) => { chunk.ordinal = index })
  const extractedText = buildExtractedText(sections)
  const hasOcr = ocrStats.succeededPages.length > 0
  const readablePages = pageTexts.flatMap((text, idx) => (
    text.length >= envNumber('ALIX_PDF_OCR_MIN_PAGE_TEXT_CHARS', 80) || ocrStats.succeededPages.includes(idx + 1)
  ) ? [idx + 1] : [])
  const pendingPages = Array.from({ length: totalPages }, (_, idx) => idx + 1).filter(page => !readablePages.includes(page))
  const limitations: string[] = []
  if (ocrStats.pendingPages.length) limitations.push(`OCR atingiu o limite de ${maxOcrPages} página(s); ${ocrStats.pendingPages.length} página(s) aguardam processamento.`)
  if (ocrStats.failedPages.length) limitations.push(`OCR falhou ou não encontrou texto em ${ocrStats.failedPages.length} página(s); revisar o original.`)
  if (!ocrStats.enabled && pendingPages.length) limitations.push('OCR está desabilitado e há páginas com texto insuficiente.')
  if (pendingPages.length && !limitations.length) limitations.push(`${pendingPages.length} página(s) com texto insuficiente; é necessária nova leitura ou revisão.`)
  const extractionCoverage: DocumentExtractionCoverage = {
    status: pendingPages.length ? 'partial' : totalPages ? 'complete' : 'unknown',
    totalPages, readablePages, pendingPages,
    failedPages: ocrStats.failedPages.map(item => item.page), limitations,
  }

  return {
    kind: 'pdf',
    extractedText,
    pageCount: totalPages,
    imageBase64: firstRenderedPageBase64,
    imageMediaType: firstRenderedPageBase64 ? 'image/png' : undefined,
    chunks,
    evidences,
    metadata: {
      ocr: ocrStats,
      extractionCoverage,
      index: {
        chunkCount: chunks.length,
        evidenceCount: evidences.length,
        hasOcr,
      },
      pageTextStats: pageTexts.map((text, idx) => ({
        page: idx + 1,
        textChars: text.length,
        ocrAttempted: ocrStats.attemptedPages.includes(idx + 1),
        ocrSucceeded: ocrStats.succeededPages.includes(idx + 1),
      })),
    },
  }
}
