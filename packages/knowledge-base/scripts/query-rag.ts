/**
 * ALETIS - Knowledge Base / RAG
 * Smoke query helper. Uso:
 *   pnpm -F @aletis/knowledge-base exec tsx scripts/query-rag.ts "TIR versus retorno de longo prazo" 3
 */
import { getRagService } from '../src/rag/index.js'

async function main() {
  const q = process.argv[2] ?? 'TIR versus retorno de longo prazo'
  const k = Number(process.argv[3] ?? '3') || 3
  const rag = getRagService()
  await rag.ensureReady()
  const hits = await rag.search(q, k)
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    query: q,
    k,
    hits: hits.map(h => ({
      id: h.id,
      source: h.source,
      score: Number(h.score.toFixed(4)),
      page: h.metadata.page,
      preview: h.text.slice(0, 360),
    })),
  }, null, 2))
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
