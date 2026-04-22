/**
 * ALETIS - Knowledge Base / RAG
 * Tipos compartilhados do indice BM25 leve em memoria.
 */

/**
 * Metadados livres para enriquecer um chunk (pagina, offset, etc.)
 */
export interface RagChunkMetadata {
  /** Pagina dentro do documento original (1-based). null se desconhecido. */
  page: number | null
  /** Posicao ordinal do chunk dentro da pagina/arquivo. */
  chunkIndex: number
  /** Tamanho aproximado em tokens (whitespace). */
  tokens: number
}

/**
 * Unidade basica indexada (um pedaco de texto de um PDF).
 */
export interface RagChunk {
  /** Identificador estavel composto por source + page + chunkIndex. */
  id: string
  /** Nome do arquivo de origem (sem path). */
  source: string
  /** Caminho absoluto/relativo do arquivo original para auditoria. */
  sourcePath: string
  /** Texto bruto do chunk. */
  text: string
  /** Metadados adicionais. */
  metadata: RagChunkMetadata
}

/**
 * Estatisticas BM25 necessarias para scoring em tempo de query.
 */
export interface RagBm25Stats {
  /** Numero de documentos (chunks) indexados. */
  N: number
  /** Tamanho medio dos chunks (em tokens apos tokenizacao). */
  avgdl: number
  /** Frequencia documental de cada termo (em quantos chunks aparece). */
  df: Record<string, number>
  /** Parametros BM25. */
  k1: number
  b: number
}

/**
 * Representacao de um chunk ja tokenizado e com seus term frequencies.
 */
export interface RagBm25Document {
  /** ID do chunk correspondente. */
  id: string
  /** Tamanho do chunk em tokens (para normalizacao pelo avgdl). */
  dl: number
  /** term frequency: termo -> ocorrencias dentro do chunk. */
  tf: Record<string, number>
}

/**
 * Indice serializavel (o arquivo storage/rag_index.json).
 */
export interface RagIndex {
  version: string
  builtAt: string
  chunks: RagChunk[]
  bm25: {
    stats: RagBm25Stats
    docs: RagBm25Document[]
  }
}

/**
 * Resultado de uma busca.
 */
export interface RagSearchResult {
  id: string
  source: string
  score: number
  text: string
  metadata: RagChunkMetadata
}
