// ============================================================
// ALETIS — Alix Document Intake: DOCX Parser
// Extrai texto puro de .docx via mammoth.
// ============================================================

import type { ParserResult } from './types.js'

export async function parseDocx(buffer: Buffer): Promise<ParserResult> {
  // mammoth é CJS-compatível; usamos import dinâmico para não
  // quebrar o bundle ESM em ambientes que reclamam do default.
  const mammothMod = await import('mammoth')
  const result = await mammothMod.extractRawText({ buffer })
  const text = (result.value ?? '').trim()
  return {
    kind: 'docx',
    extractedText: text,
    metadata: {
      warnings: Array.isArray(result.messages)
        ? result.messages.map((m) => m.message).slice(0, 20)
        : [],
    },
  }
}
