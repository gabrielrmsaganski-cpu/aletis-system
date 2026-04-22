/**
 * ALETIS - Knowledge Base / RAG
 * CLI: forca rebuild completo do indice BM25 a partir de inbox/documentos.
 *
 * Uso:
 *   pnpm -F @aletis/knowledge-base run rag:build
 *   pnpm -F @aletis/knowledge-base run rag:build -- --docs-dir /abs/path
 */
import { statSync } from 'node:fs'
import { RagService } from '../src/rag/RagService.js'

function parseArgs(argv: string[]): { docsDir?: string; storagePath?: string } {
  const out: { docsDir?: string; storagePath?: string } = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--docs-dir' && argv[i + 1]) {
      out.docsDir = argv[i + 1]
      i++
    } else if (a === '--storage' && argv[i + 1]) {
      out.storagePath = argv[i + 1]
      i++
    }
  }
  return out
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const t0 = Date.now()
  const rag = new RagService(opts)
  const index = await rag.reindex()
  const ms = Date.now() - t0
  const stats = await rag.stats()
  const bytes = stats.sizeBytes ?? (statSync(stats.storagePath).size ?? 0)
  const sizeKb = (bytes / 1024).toFixed(1)
  const sources = new Set<string>()
  for (const c of index.chunks) sources.add(c.source)

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    ok: true,
    builtAt: index.builtAt,
    ms,
    docsDir: stats.docsDir,
    storagePath: stats.storagePath,
    chunks: index.chunks.length,
    documents: sources.size,
    avgdl: Number(index.bm25.stats.avgdl.toFixed(2)),
    indexSizeKb: Number(sizeKb),
    sources: Array.from(sources),
  }, null, 2))
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error('[rag:build] erro:', err)
  process.exit(1)
})
