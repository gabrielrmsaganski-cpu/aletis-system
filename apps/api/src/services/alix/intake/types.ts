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

export interface SpreadsheetColumnProfile {
  index: number
  header: string
  nonEmpty: number
  numericCount: number
  textCount: number
  dateCount: number
  formulaCount: number
  sum?: number
  min?: number
  max?: number
  avg?: number
  sampleValues: string[]
}

export interface SpreadsheetSheetProfile {
  name: string
  rows: number
  cols: number
  nonEmptyRows: number
  formulaCells: number
  mergedCells: number
  columns: SpreadsheetColumnProfile[]
}

export interface SpreadsheetProfile {
  totalSheets: number
  totalRows: number
  totalCols: number
  totalFormulaCells: number
  sheets: SpreadsheetSheetProfile[]
}

export type DocumentEvidenceKind = 'text' | 'ocr' | 'table' | 'entity' | 'image'

export interface DocumentEvidence {
  id: string
  kind: DocumentEvidenceKind
  source: string
  text: string
  page?: number
  sheet?: string
  table?: string
  entityType?: string
  confidence?: number
  chunkId?: string
  metadata?: Record<string, unknown>
}

export interface DocumentChunk {
  id: string
  ordinal: number
  kind: Exclude<DocumentEvidenceKind, 'image'>
  text: string
  source: string
  pageStart?: number
  pageEnd?: number
  sheet?: string
  table?: string
  confidence?: number
  evidenceIds: string[]
  metadata?: Record<string, unknown>
}

export interface DocumentIndexRecord {
  documentId: string
  sessionId: string
  clienteId?: string
  filename: string
  kind: DocumentKind
  createdAt: string
  source: {
    mimetype: string
    sizeBytes: number
    sha256?: string
  }
  chunks: DocumentChunk[]
  evidences: DocumentEvidence[]
  entities: unknown[]
  tables: TablePreview[]
  confidence?: number
}

export interface IngestedDocumentMetadata {
  /** Lista de abas de uma planilha (xlsx) */
  sheets?: SheetInfo[]
  /** Pré-visualização tabular (primeiras 5 linhas) por aba */
  tablePreviews?: TablePreview[]
  /** Perfil estatístico calculado sobre todas as linhas de planilhas. */
  spreadsheetProfile?: SpreadsheetProfile
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
  /** Base64 pronto para entrada multimodal da OpenAI (apenas imagens). */
  imageBase64?: string
  imageMediaType?: ImageMediaType
  /** Cliente vinculado no CRM, quando o upload veio contextualizado. */
  clienteId?: string
  /** Chunks indexáveis para RAG/local retrieval. */
  chunks?: DocumentChunk[]
  /** Evidências com origem recuperável (página, tabela, entidade, OCR). */
  evidences?: DocumentEvidence[]
  metadata: IngestedDocumentMetadata
}

export interface ParserResult {
  kind: DocumentKind
  extractedText: string
  pageCount?: number
  imageBase64?: string
  imageMediaType?: ImageMediaType
  chunks?: DocumentChunk[]
  evidences?: DocumentEvidence[]
  metadata?: IngestedDocumentMetadata
}

export interface DocumentSource {
  type: 'google_drive'
  fileId: string
  url: string
  path: string
  modifiedAt: string | null
  importedAt: string
  originalName?: string
  originalMimeType?: string
  exportMimeType?: string
  sizeBytes?: string | null
  version?: string | null
  md5Checksum?: string | null
  revisionKey?: string | null
  contentSha256?: string
  verifiedAt?: string
  tenantId?: string
  requestedClienteId?: string
}

export interface IntakeInput {
  buffer: Buffer
  filename: string
  mimetype: string
  sessionId: string
  clienteId?: string
  source?: DocumentSource
  /** `deep` aguarda classificação e extração especializada antes de responder. */
  processingMode?: 'fast' | 'deep'
  /** Uso interno da fila: preserva o identificador criado no aceite do upload. */
  documentId?: string
  /** Ignora cache de placeholder e executa o parser sobre o arquivo persistido. */
  forceProcess?: boolean
}

/** Limite padrão (20 MB) por arquivo aceito pelo intake. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024
