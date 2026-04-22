/**
 * ALETIS - Knowledge Base / RAG
 * Implementacao BM25 em TypeScript puro (k1=1.2, b=0.75) com IDF+0.5.
 */
import { tokenize } from './chunker.js'
import type { RagBm25Document, RagBm25Stats } from './types.js'

export interface Bm25BuildInput {
  id: string
  text: string
}

/**
 * Constroi estatisticas BM25 a partir de uma colecao de chunks.
 */
export function buildBm25(inputs: Bm25BuildInput[], k1 = 1.2, b = 0.75): {
  stats: RagBm25Stats
  docs: RagBm25Document[]
} {
  const docs: RagBm25Document[] = []
  const df: Record<string, number> = {}
  let totalLen = 0

  for (const input of inputs) {
    const tokens = tokenize(input.text)
    const tf: Record<string, number> = {}
    for (const tk of tokens) tf[tk] = (tf[tk] ?? 0) + 1
    for (const term of Object.keys(tf)) df[term] = (df[term] ?? 0) + 1
    docs.push({ id: input.id, dl: tokens.length, tf })
    totalLen += tokens.length
  }

  const N = docs.length
  const avgdl = N > 0 ? totalLen / N : 0
  return {
    stats: { N, avgdl, df, k1, b },
    docs,
  }
}

/**
 * Calcula o score BM25 de um documento para um conjunto de termos da query.
 */
export function scoreBm25(
  doc: RagBm25Document,
  queryTerms: string[],
  stats: RagBm25Stats,
): number {
  if (stats.N === 0 || doc.dl === 0) return 0
  const { k1, b, avgdl, df, N } = stats
  const norm = avgdl > 0 ? doc.dl / avgdl : 1
  let score = 0
  for (const term of queryTerms) {
    const f = doc.tf[term]
    if (!f) continue
    const n = df[term] ?? 0
    // IDF suavizado: ln(1 + (N - n + 0.5) / (n + 0.5))
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
    const numerator = f * (k1 + 1)
    const denominator = f + k1 * (1 - b + b * norm)
    score += idf * (numerator / denominator)
  }
  return score
}

/**
 * Executa uma busca BM25 retornando os top-k IDs com scores (descendente).
 */
export function searchBm25(
  query: string,
  docs: RagBm25Document[],
  stats: RagBm25Stats,
  k = 5,
): Array<{ id: string; score: number }> {
  const terms = tokenize(query)
  if (terms.length === 0) return []
  const results: Array<{ id: string; score: number }> = []
  for (const doc of docs) {
    const score = scoreBm25(doc, terms, stats)
    if (score > 0) results.push({ id: doc.id, score })
  }
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, Math.max(1, k))
}
