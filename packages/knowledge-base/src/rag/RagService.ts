/**
 * ALETIS - Knowledge Base / RAG
 *
 * RagService: singleton que carrega um indice BM25 em memoria, capaz de:
 * - ler PDFs de um diretorio (default: ../../inbox/documentos do monorepo)
 * - quebrar em chunks com overlap
 * - persistir o indice em storage/rag_index.json (write-tmp + rename)
 * - responder buscas em < 50 ms para ~alguns milhares de chunks
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildBm25, searchBm25 } from './bm25.js'
import { chunkPages } from './chunker.js'
import { listPdfs, loadPdf } from './pdf-loader.js'
import type {
  RagChunk,
  RagIndex,
  RagSearchResult,
} from './types.js'

const INDEX_VERSION = '1.0.0'
const DEFAULT_CHUNK_TARGET = 800
const DEFAULT_CHUNK_OVERLAP = 120

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Resolve o diretorio padrao de documentos: aletis-system/../inbox/documentos.
 * A partir de `packages/knowledge-base/dist/rag/RagService.js` (apos build),
 * subimos ate a raiz do repo e entao para ../inbox/documentos.
 */
function defaultDocsDir(): string {
  // __dirname apontara para .../packages/knowledge-base/(src|dist)/rag
  // Subimos 4 niveis para chegar em aletis-system/ e entao ../inbox/documentos.
  return resolve(__dirname, '..', '..', '..', '..', '..', 'inbox', 'documentos')
}

/**
 * Resolve o caminho default do storage do indice.
 * Fica em packages/knowledge-base/storage/rag_index.json (fora de src/ e dist/).
 */
function defaultStoragePath(): string {
  // __dirname: .../packages/knowledge-base/(src|dist)/rag
  return resolve(__dirname, '..', '..', 'storage', 'rag_index.json')
}

export interface RagServiceOptions {
  /** Diretorio de PDFs. Default: aletis-system/../inbox/documentos. */
  docsDir?: string
  /** Caminho do arquivo persistido. Default: packages/knowledge-base/storage/rag_index.json. */
  storagePath?: string
  /** Tamanho alvo do chunk em tokens (words). Default 800. */
  chunkTargetTokens?: number
  /** Overlap em tokens entre chunks. Default 120. */
  chunkOverlapTokens?: number
}

export class RagService {
  private readonly docsDir: string
  private readonly storagePath: string
  private readonly chunkTargetTokens: number
  private readonly chunkOverlapTokens: number
  private index: RagIndex | null = null
  private loading: Promise<void> | null = null

  constructor(opts: RagServiceOptions = {}) {
    this.docsDir = opts.docsDir ? this.absolutize(opts.docsDir) : defaultDocsDir()
    this.storagePath = opts.storagePath ? this.absolutize(opts.storagePath) : defaultStoragePath()
    this.chunkTargetTokens = opts.chunkTargetTokens ?? DEFAULT_CHUNK_TARGET
    this.chunkOverlapTokens = opts.chunkOverlapTokens ?? DEFAULT_CHUNK_OVERLAP
  }

  private absolutize(p: string): string {
    return isAbsolute(p) ? p : resolve(process.cwd(), p)
  }

  /** Estado basico. */
  isReady(): boolean {
    return this.index !== null && this.index.chunks.length > 0
  }

  /** Garante que o indice esta em memoria (carrega de disco se possivel). */
  async ensureReady(): Promise<void> {
    if (this.index) return
    if (this.loading) return this.loading
    this.loading = (async () => {
      try {
        if (existsSync(this.storagePath)) {
          const raw = await readFile(this.storagePath, 'utf8')
          const parsed = JSON.parse(raw) as RagIndex
          if (parsed?.version && Array.isArray(parsed?.chunks)) {
            this.index = parsed
            return
          }
        }
      } catch {
        // indice corrompido: reconstroi
        this.index = null
      }
      await this.reindex()
    })()
    try {
      await this.loading
    } finally {
      this.loading = null
    }
  }

  /** Reconstroi o indice do zero a partir dos PDFs. */
  async reindex(): Promise<RagIndex> {
    const pdfs = existsSync(this.docsDir) ? await listPdfs(this.docsDir) : []
    const allChunks: RagChunk[] = []

    for (const filePath of pdfs) {
      try {
        const doc = await loadPdf(filePath)
        const chunkInputs = doc.pages.map(p => ({ text: p.text, page: p.page }))
        const chunks = chunkPages(chunkInputs, {
          targetTokens: this.chunkTargetTokens,
          overlapTokens: this.chunkOverlapTokens,
        })
        for (const c of chunks) {
          const id = `${doc.source}::p${c.page ?? 0}::c${c.chunkIndex}`
          allChunks.push({
            id,
            source: doc.source,
            sourcePath: doc.sourcePath,
            text: c.text,
            metadata: {
              page: c.page,
              chunkIndex: c.chunkIndex,
              tokens: c.tokens,
            },
          })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // eslint-disable-next-line no-console
        console.warn(`[rag] falha ao processar ${filePath}: ${msg}`)
      }
    }

    const bm25 = buildBm25(allChunks.map(c => ({ id: c.id, text: c.text })))

    const index: RagIndex = {
      version: INDEX_VERSION,
      builtAt: new Date().toISOString(),
      chunks: allChunks,
      bm25,
    }

    this.index = index
    await this.persist(index)
    return index
  }

  /** Grava o indice no disco de forma atomica (write-tmp + rename). */
  private async persist(index: RagIndex): Promise<void> {
    await mkdir(dirname(this.storagePath), { recursive: true })
    const tmp = `${this.storagePath}.tmp`
    const payload = JSON.stringify(index)
    await writeFile(tmp, payload, 'utf8')
    await rename(tmp, this.storagePath)
  }

  /**
   * Busca BM25: retorna ate `k` trechos mais relevantes.
   * Carrega o indice de disco se necessario.
   */
  async search(query: string, k = 5): Promise<RagSearchResult[]> {
    await this.ensureReady()
    if (!this.index) return []
    const { bm25, chunks } = this.index
    const hits = searchBm25(query, bm25.docs, bm25.stats, k)
    if (hits.length === 0) return []
    const byId = new Map<string, RagChunk>()
    for (const c of chunks) byId.set(c.id, c)
    const out: RagSearchResult[] = []
    for (const hit of hits) {
      const chunk = byId.get(hit.id)
      if (!chunk) continue
      out.push({
        id: chunk.id,
        source: chunk.source,
        score: hit.score,
        text: chunk.text,
        metadata: chunk.metadata,
      })
    }
    return out
  }

  /** Metadados utilitarios (para debug/relatorios). */
  async stats(): Promise<{
    ready: boolean
    chunks: number
    docs: number
    avgdl: number
    storagePath: string
    docsDir: string
    sizeBytes: number | null
  }> {
    await this.ensureReady()
    let sizeBytes: number | null = null
    try {
      const s = await stat(this.storagePath)
      sizeBytes = s.size
    } catch {
      sizeBytes = null
    }
    const sources = new Set<string>()
    for (const c of this.index?.chunks ?? []) sources.add(c.source)
    return {
      ready: this.isReady(),
      chunks: this.index?.chunks.length ?? 0,
      docs: sources.size,
      avgdl: this.index?.bm25.stats.avgdl ?? 0,
      storagePath: this.storagePath,
      docsDir: this.docsDir,
      sizeBytes,
    }
  }
}

let _singleton: RagService | null = null

/**
 * Retorna o singleton do RagService. Aceita opcoes apenas na primeira chamada.
 */
export function getRagService(opts?: RagServiceOptions): RagService {
  if (!_singleton) _singleton = new RagService(opts)
  return _singleton
}

/**
 * Helper: reseta o singleton (util em testes).
 */
export function _resetRagServiceForTests(): void {
  _singleton = null
}
