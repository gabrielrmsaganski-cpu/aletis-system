// ============================================================
// ALETIS — Alix Document Intake: PDF Parser
// Migrado de pdf-parse@1.1.1 (abandonado, sem release desde 2018)
// para `unpdf` (Node-first wrapper de pdfjs-dist, sem necessidade
// de polyfills DOM). Mantém o mesmo contrato ParserResult.
// ============================================================

import type { ParserResult } from './types.js'

export async function parsePdf(buffer: Buffer): Promise<ParserResult> {
  // unpdf é puramente ESM. Import dinâmico é compatível com tsx + Vitest.
  const { extractText, getDocumentProxy } = await import('unpdf')
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const pdf = await getDocumentProxy(data)
  const { totalPages, text } = await extractText(pdf, { mergePages: true })
  return {
    kind: 'pdf',
    extractedText: (text || '').toString().trim(),
    pageCount: totalPages,
    metadata: {},
  }
}
