import { createHash } from 'node:crypto'
import type { DocumentChunk, IngestedDocument } from './types.js'

const normalized = (text: string) => text.replace(/\s+/g, ' ').trim()
const digest = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 20)

/** Mantém a origem do parser e acrescenta texto recuperado que seus chunks não cobrem. */
export function completeDocumentChunks(
  doc: Pick<IngestedDocument, 'extractedText' | 'chunks'>,
  maxChars = 3200,
): DocumentChunk[] {
  const size = Number.isFinite(maxChars) ? Math.max(400, Math.min(16000, Math.floor(maxChars))) : 3200
  const text = normalized(doc.extractedText || '')
  const result: DocumentChunk[] = []
  const covered: Array<[number, number]> = []
  let searchFrom = 0
  const append = (chunk: DocumentChunk) => {
    const value = normalized(chunk.text || '')
    for (let start = 0; start < value.length;) {
      let end = Math.min(value.length, start + size)
      const boundary = value.lastIndexOf(' ', end)
      if (end < value.length && boundary > start + size * 0.6) end = boundary + 1
      const part = value.slice(start, end)
      result.push({ ...chunk, text: part, ordinal: result.length,
        id: value.length <= size && chunk.id ? chunk.id : `corpus-${digest(`${chunk.id}:${start}:${part}`)}`,
        metadata: { ...chunk.metadata, ...(value.length > size ? { sourceChunkId: chunk.id, sourceChunkOffset: start } : {}) },
      })
      start = end
    }
  }
  for (const chunk of doc.chunks || []) {
    // Entidades são interpretações derivadas, não substituem a leitura da fonte.
    if (!chunk || typeof chunk !== 'object' || chunk.kind === 'entity' || typeof chunk.text !== 'string' || !chunk.text.trim()) continue
    const value = normalized(chunk.text)
    let at = text.indexOf(value, searchFrom)
    if (at < 0) at = text.indexOf(value)
    if (at >= 0) { covered.push([at, at + value.length]); searchFrom = at + value.length }
    append({ ...chunk, evidenceIds: Array.isArray(chunk.evidenceIds) ? chunk.evidenceIds : [] })
  }
  const supplement = (start: number, end: number) => {
    const value = text.slice(start, end).trim()
    if (!value) return
    append({ id: `text-${digest(`${start}:${value}`)}`, ordinal: result.length, kind: 'text',
      text: value, source: 'document:extracted-text', evidenceIds: [],
      metadata: { normalizedCharacterStart: start, normalizedCharacterEnd: end, supplementalText: true },
    })
  }
  let end = 0
  for (const [start, finish] of covered.sort((a, b) => a[0] - b[0])) {
    if (start > end) supplement(end, start)
    end = Math.max(end, finish)
  }
  supplement(end, text.length)
  return result
}
