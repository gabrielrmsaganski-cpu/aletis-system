/**
 * ALETIS - Knowledge Base / RAG
 * Barrel do modulo RAG (BM25 em memoria sobre PDFs de inbox/documentos).
 */
export type {
  RagChunk,
  RagChunkMetadata,
  RagBm25Document,
  RagBm25Stats,
  RagIndex,
  RagSearchResult,
} from './types.js'

export { tokenize, chunkPages, countWords } from './chunker.js'
export { buildBm25, scoreBm25, searchBm25 } from './bm25.js'
export { loadPdf, listPdfs } from './pdf-loader.js'
export type { PdfDocument, PdfPage } from './pdf-loader.js'
export {
  RagService,
  getRagService,
  _resetRagServiceForTests,
} from './RagService.js'
export type { RagServiceOptions } from './RagService.js'
