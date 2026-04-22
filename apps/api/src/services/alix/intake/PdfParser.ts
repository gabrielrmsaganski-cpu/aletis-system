// ============================================================
// ALETIS — Alix Document Intake: PDF Parser
// Extrai texto e contagem de páginas de PDFs via pdf-parse.
// Usa import dinâmico porque pdf-parse é CJS e, em alguns
// cenários ESM, seu "debug harness" (index.js) tenta abrir
// ./test/data/05-versions-space.pdf no load. Só chamamos a
// implementação em lib/pdf-parse.js, que não tem esse side-effect.
// ============================================================

import type { ParserResult } from './types.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type PdfParseFn = (buffer: Buffer) => Promise<{
  numpages: number
  text: string
  info?: unknown
  metadata?: unknown
}>

let cachedPdfParse: PdfParseFn | null = null

function loadPdfParse(): PdfParseFn {
  if (cachedPdfParse) return cachedPdfParse
  // O entry do pacote é "index.js" e inclui bloco de teste que
  // tenta ler um PDF de exemplo. Carregamos direto o core.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('pdf-parse/lib/pdf-parse.js') as PdfParseFn | { default: PdfParseFn }
  const fn = typeof mod === 'function' ? mod : (mod as { default: PdfParseFn }).default
  cachedPdfParse = fn
  return fn
}

export async function parsePdf(buffer: Buffer): Promise<ParserResult> {
  const pdfParse = loadPdfParse()
  const result = await pdfParse(buffer)
  const text = (result.text ?? '').trim()
  return {
    kind: 'pdf',
    extractedText: text,
    pageCount: result.numpages ?? 0,
    metadata: {},
  }
}
