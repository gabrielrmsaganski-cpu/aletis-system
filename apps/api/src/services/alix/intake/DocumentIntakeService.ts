// ============================================================
// ALETIS - Alix Document Intake Service (Wave 9-INTAKE)
// Orquestra a ingestao de documentos: detecta o tipo, delega ao
// parser apropriado, persiste o resultado em disco e devolve um
// IngestedDocument pronto para ser anexado ao contexto da Alix.
// ============================================================

import { promises as fs } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

import type {
  IngestedDocument,
  IntakeInput,
  ParserResult,
} from './types.js'
import { MAX_FILE_BYTES } from './types.js'

import { parsePdf } from './PdfParser.js'
import { parseDocx } from './DocxParser.js'
import { parseXlsx, parseCsv } from './XlsxParser.js'
import { processImage } from './ImageProcessor.js'
import { parseText } from './TextParser.js'

// ------------------------- helpers -------------------------

function extFromName(filename: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(filename ?? '')
  return m ? m[1].toLowerCase() : ''
}

type DetectedKind = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'image' | 'text'

function detectKind(filename: string, mimetype: string): DetectedKind {
  const mt = (mimetype ?? '').toLowerCase()
  const ext = extFromName(filename)

  if (mt === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (
    mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  )
    return 'docx'
  if (
    mt === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mt === 'application/vnd.ms-excel' ||
    ext === 'xlsx' ||
    ext === 'xls'
  )
    return 'xlsx'
  if (mt === 'text/csv' || ext === 'csv') return 'csv'
  if (mt.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(ext))
    return 'image'
  if (
    mt.startsWith('text/') ||
    mt === 'application/json' ||
    ['txt', 'md', 'markdown', 'json', 'log'].includes(ext)
  )
    return 'text'

  // fallback conservador: trate como texto (melhor que falhar).
  return 'text'
}

function buildSummary(text: string): string | undefined {
  const t = (text ?? '').trim()
  if (!t) return undefined
  const single = t.replace(/\s+/g, ' ').trim()
  return single.length > 500 ? single.slice(0, 497) + '...' : single
}

// ------------------------- service -------------------------

export class DocumentIntakeService {
  constructor(private readonly storageDir: string) {}

  private sessionDir(sessionId: string): string {
    const safe = (sessionId || 'anon').replace(/[^A-Za-z0-9_.-]/g, '_')
    return join(this.storageDir, safe)
  }

  private async ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true })
  }

  /**
   * Ingere um arquivo: detecta tipo, extrai texto/imagem e persiste
   * o resultado como JSON. Retorna o documento pronto para uso.
   */
  async ingest(file: IntakeInput): Promise<IngestedDocument> {
    if (!file?.buffer) throw new Error('Arquivo ausente ou vazio.')
    const size = file.buffer.byteLength
    if (size === 0) throw new Error('Arquivo vazio.')
    if (size > MAX_FILE_BYTES) {
      throw new Error(
        `Arquivo excede o limite de ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB.`,
      )
    }

    const kind = detectKind(file.filename, file.mimetype)
    const parsed = await this.runParser(kind, file)

    const id = randomUUID()
    const now = new Date().toISOString()

    const doc: IngestedDocument = {
      id,
      sessionId: file.sessionId || 'anon',
      filename: file.filename || `document-${id}`,
      mimetype: file.mimetype || 'application/octet-stream',
      sizeBytes: size,
      uploadedAt: now,
      kind: parsed.kind,
      extractedText: parsed.extractedText ?? '',
      pageCount: parsed.pageCount,
      summary: buildSummary(parsed.extractedText ?? ''),
      imageBase64: parsed.imageBase64,
      imageMediaType: parsed.imageMediaType,
      metadata: parsed.metadata ?? {},
    }

    await this.persist(doc)
    return doc
  }

  private async runParser(
    kind: DetectedKind,
    file: IntakeInput,
  ): Promise<ParserResult> {
    switch (kind) {
      case 'pdf':
        return parsePdf(file.buffer)
      case 'docx':
        return parseDocx(file.buffer)
      case 'xlsx':
        return parseXlsx(file.buffer)
      case 'csv':
        return parseCsv(file.buffer)
      case 'image':
        return processImage(file.buffer, file.filename, file.mimetype)
      case 'text':
      default:
        return parseText(file.buffer)
    }
  }

  /** Persiste o documento em disco (um JSON por arquivo). */
  private async persist(doc: IngestedDocument): Promise<void> {
    const dir = this.sessionDir(doc.sessionId)
    await this.ensureDir(dir)
    const path = join(dir, `${doc.id}.json`)
    await fs.writeFile(path, JSON.stringify(doc, null, 2), 'utf-8')
  }

  /** Recupera um documento persistido. */
  async get(sessionId: string, id: string): Promise<IngestedDocument | null> {
    const path = join(this.sessionDir(sessionId), `${id}.json`)
    try {
      const raw = await fs.readFile(path, 'utf-8')
      return JSON.parse(raw) as IngestedDocument
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e?.code === 'ENOENT') return null
      throw err
    }
  }

  /**
   * Lista documentos da sessao (metadados; sem texto/base64 pesados).
   */
  async list(sessionId: string): Promise<
    Array<Omit<IngestedDocument, 'extractedText' | 'imageBase64'> & {
      hasText: boolean
      hasImage: boolean
    }>
  > {
    const dir = this.sessionDir(sessionId)
    let files: string[] = []
    try {
      files = await fs.readdir(dir)
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e?.code === 'ENOENT') return []
      throw err
    }
    const docs: Array<
      Omit<IngestedDocument, 'extractedText' | 'imageBase64'> & {
        hasText: boolean
        hasImage: boolean
      }
    > = []
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      try {
        const raw = await fs.readFile(join(dir, f), 'utf-8')
        const d = JSON.parse(raw) as IngestedDocument
        const { extractedText, imageBase64, ...rest } = d
        docs.push({
          ...rest,
          hasText: !!extractedText && extractedText.length > 0,
          hasImage: !!imageBase64 && imageBase64.length > 0,
        })
      } catch {
        // ignora arquivos corrompidos
      }
    }
    // ordena por uploadedAt desc
    docs.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1))
    return docs
  }

  /** Remove um documento. Retorna true se apagou algo. */
  async remove(sessionId: string, id: string): Promise<boolean> {
    const path = join(this.sessionDir(sessionId), `${id}.json`)
    try {
      await fs.unlink(path)
      return true
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e?.code === 'ENOENT') return false
      throw err
    }
  }
}

// ------------------ singleton helper ------------------

let singleton: DocumentIntakeService | null = null

export function getDocumentIntakeService(): DocumentIntakeService {
  if (singleton) return singleton
  const storageDir = join(process.cwd(), 'storage', 'alix-documents')
  singleton = new DocumentIntakeService(storageDir)
  return singleton
}
