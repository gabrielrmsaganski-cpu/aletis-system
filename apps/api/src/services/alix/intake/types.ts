// ============================================================
// ALETIS — Alix Document Intake (Wave 9-INTAKE)
// Tipagem compartilhada entre o DocumentIntakeService, seus
// parsers específicos (PDF/DOCX/XLSX/IMG/TXT) e as rotas HTTP.
// ============================================================

export type DocumentKind =
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'image'
  | 'text'
  | 'csv'

export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp'

export interface TablePreview {
  sheet: string
  headers: string[]
  rows: string[][]
}

export interface SheetInfo {
  name: string
  rows: number
  cols: number
}

export interface IngestedDocumentMetadata {
  /** Lista de abas de uma planilha (xlsx) */
  sheets?: SheetInfo[]
  /** Pré-visualização tabular (primeiras 5 linhas) por aba */
  tablePreviews?: TablePreview[]
  /** Quaisquer extras livres definidos pelos parsers */
  [k: string]: unknown
}

export interface IngestedDocument {
  id: string
  sessionId: string
  filename: string
  mimetype: string
  sizeBytes: number
  uploadedAt: string // ISO-8601
  kind: DocumentKind
  /** Conteúdo textual extraído (para prompt / RAG). */
  extractedText: string
  /** Número de páginas (quando aplicável, ex.: PDF). */
  pageCount?: number
  /** Resumo curto (primeiras ~500 chars de extractedText). */
  summary?: string
  /** Base64 pronto para bloco image do Claude (apenas imagens). */
  imageBase64?: string
  imageMediaType?: ImageMediaType
  metadata: IngestedDocumentMetadata
}

export interface ParserResult {
  kind: DocumentKind
  extractedText: string
  pageCount?: number
  imageBase64?: string
  imageMediaType?: ImageMediaType
  metadata?: IngestedDocumentMetadata
}

export interface IntakeInput {
  buffer: Buffer
  filename: string
  mimetype: string
  sessionId: string
}

/** Limite padrão (20 MB) por arquivo aceito pelo intake. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024
