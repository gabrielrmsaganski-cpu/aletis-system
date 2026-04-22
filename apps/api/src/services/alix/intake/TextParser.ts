// ============================================================
// ALETIS — Alix Document Intake: Text / Markdown Parser
// Decodifica UTF-8 (com strip de BOM) e devolve como texto puro.
// ============================================================

import type { ParserResult } from './types.js'

export async function parseText(buffer: Buffer): Promise<ParserResult> {
  let text = buffer.toString('utf-8')
  // Remove BOM UTF-8 se presente
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return {
    kind: 'text',
    extractedText: text.trim(),
    metadata: {},
  }
}
