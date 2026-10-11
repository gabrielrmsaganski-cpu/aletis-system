import { createHash } from 'node:crypto'
import { completeDocumentChunks } from './DocumentCorpus.js'
import { documentExtractionCoverage } from './DocumentReadingPlan.js'
import type { IngestedDocument } from './types.js'

export interface DocumentReadOptions { cursor?: string; maxChars?: number }

/** Cursor vinculado ao conteúdo: não repete o início nem mistura versões do documento. */
export function readDocumentPage(doc: IngestedDocument, options: DocumentReadOptions = {}) {
  const chunks = completeDocumentChunks(doc)
  const extraction = documentExtractionCoverage(doc)
  const sourceHash = createHash('sha256').update(JSON.stringify({ id: doc.id, sessionId: doc.sessionId,
    clienteId: doc.clienteId, chunks, extraction })).digest('hex')
  const totalCharacters = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0)
  let offset = 0
  if (options.cursor) {
    try {
      if (typeof options.cursor !== 'string' || options.cursor.length > 512) throw new Error()
      const cursor = JSON.parse(Buffer.from(options.cursor, 'base64url').toString('utf8'))
      if (cursor.version !== 1 || cursor.sourceHash !== sourceHash || !Number.isSafeInteger(cursor.offset)
        || cursor.offset < 0 || cursor.offset > totalCharacters) throw new Error()
      offset = cursor.offset
    } catch {
      throw Object.assign(new Error('A leitura mudou ou o cursor é inválido. Reinicie a leitura deste documento.'), {
        code: 'DOCUMENT_READ_CURSOR_INVALID', statusCode: 409,
      })
    }
  }
  const limit = Number.isFinite(options.maxChars) ? Math.max(1000, Math.min(16000, Math.floor(options.maxChars!))) : 12000
  const selected: Array<(typeof chunks)[number] & { readStart: number; readEnd: number }> = []
  let position = 0
  let remaining = limit
  for (const chunk of chunks) {
    const chunkEnd = position + chunk.text.length
    if (chunkEnd > offset && remaining > 0) {
      const start = Math.max(0, offset - position)
      const end = Math.min(chunk.text.length, start + remaining)
      selected.push({ ...chunk, text: chunk.text.slice(start, end), readStart: start, readEnd: end })
      remaining -= end - start
    }
    position = chunkEnd
  }
  const returnedCharacters = limit - remaining
  const endCharacter = offset + returnedCharacters
  const nextCursor = endCharacter < totalCharacters
    ? Buffer.from(JSON.stringify({ version: 1, sourceHash, offset: endCharacter })).toString('base64url') : null
  return {
    id: doc.id, filename: doc.filename, kind: doc.kind, pageCount: doc.pageCount, sourceHash,
    extractedText: selected.map(chunk => chunk.text).join('\n'), chunks: selected,
    coverage: { totalCharacters, startCharacter: offset, endCharacter, returnedCharacters,
      remainingCharacters: totalCharacters - endCharacter, hasMore: Boolean(nextCursor), extraction },
    nextCursor,
    instruction: nextCursor
      ? 'Continue com o nextCursor para ler os demais trechos; esta resposta contém apenas uma parte da fonte.'
      : 'Fim dos trechos extraídos. Confira a cobertura de extração: fim da paginação não comprova leitura integral do arquivo original.',
  }
}

/** Contabiliza trechos realmente entregues às ferramentas nesta execução, inclusive releituras. */
export function createDocumentReader() {
  const reads = new Map<string, Array<[number, number]>>()
  return (doc: IngestedDocument, options: DocumentReadOptions = {}) => {
    const page = readDocumentPage(doc, options)
    const intervals = [...(reads.get(page.sourceHash) || []), [page.coverage.startCharacter, page.coverage.endCharacter] as [number, number]]
      .sort((a, b) => a[0] - b[0])
    const merged: Array<[number, number]> = []
    for (const [start, end] of intervals) {
      const previous = merged.at(-1)
      if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end)
      else merged.push([start, end])
    }
    reads.set(page.sourceHash, merged)
    const deliveredCharacters = merged.reduce((sum, [start, end]) => sum + end - start, 0)
    return { ...page, readingProgress: { deliveredCharacters, totalCharacters: page.coverage.totalCharacters,
      allExtractedTextDelivered: page.coverage.totalCharacters > 0 && deliveredCharacters === page.coverage.totalCharacters,
      meaning: 'Trechos entregues nesta execução; não é uma garantia de compreensão ou revisão jurídica.' } }
  }
}
