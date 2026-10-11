import { createHash, randomUUID } from 'crypto'
import { existsSync, mkdirSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { dirname, extname, join } from 'path'
import { and, desc, eq } from 'drizzle-orm'
import { getDb, isPgEnabled } from '../../db/client.js'
import {
  coreDocument,
  documentVersion,
  portalUpload,
  type CoreDocument,
  type PortalUploadRow,
} from '../../db/schema.js'
import { auditAsync } from '../../db/AuditLog.js'
import { cleanText, toDateOrNull } from './CoreTypes.js'
import { getAutomationEventService } from './AutomationEventService.js'
import { ingestDocumentForRAG, searchRAG } from '../alix/rag/RagService.js'

export interface CoreDocumentUploadInput {
  clienteId: string
  filename: string
  mimetype: string
  buffer: Buffer
  categoria?: string
  status?: string
  validade?: string
  observacoes?: string
  criadoPor?: string
  source?: string
  sourceId?: string
}

export interface PublicDocument {
  id: string
  clienteId: string
  nome: string
  tipo: string
  mime: string
  categoria: string
  status: string
  tamanho: number
  sha256?: string | null
  criadoPor?: string | null
  criadoEm?: string
  atualizadoEm?: string
  validade?: string | null
  observacoes?: string | null
  textoExtraidoChars: number
  embeddingStatus?: string
  ragStatus?: string
  ragProvider?: string | null
  resumoIa?: string
  source: 'core' | 'portal'
  sourceId?: string | null
  downloadUrl: string
  metadata?: Record<string, unknown>
}

export interface GoogleDriveSyncMetadata {
  status: 'uploaded' | 'failed'
  fileId?: string
  url?: string
  subfolder: string
  syncedAt: string
  error?: string
}

const memoryDocs = new Map<string, CoreDocument[]>()

function storageRoot(): string {
  const dir = process.env.ALETIS_CORE_DOCUMENT_DIR || './storage/core-documents'
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 180) || 'arquivo'
}

function detectType(filename: string, mime: string): string {
  const lower = `${filename} ${mime}`.toLowerCase()
  if (lower.includes('proposta')) return 'proposta'
  if (lower.includes('contrato') || lower.includes('cpr') || lower.includes('aditivo')) return 'contrato'
  if (mime.includes('spreadsheet') || lower.endsWith('.xlsx') || lower.endsWith('.xlsm') || lower.endsWith('.csv')) return 'planilha'
  if (mime.includes('image')) return 'imagem'
  if (mime.includes('pdf')) return 'pdf'
  return 'documento'
}

function normalizeCategory(value: unknown): string {
  const categoria = String(value || 'outros').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const allowed = new Set(['identidade', 'contrato', 'fiscal', 'patrimonio', 'agro', 'proposta', 'outros'])
  return allowed.has(categoria) ? categoria : 'outros'
}

function toPublic(row: CoreDocument): PublicDocument {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>
  return {
    id: row.id,
    clienteId: row.clienteId,
    nome: row.nome,
    tipo: row.tipo,
    mime: row.mime,
    categoria: row.categoria,
    status: row.status,
    tamanho: row.tamanho,
    sha256: row.sha256,
    criadoPor: row.criadoPor,
    criadoEm: row.criadoEm instanceof Date ? row.criadoEm.toISOString() : String(row.criadoEm),
    atualizadoEm: row.atualizadoEm instanceof Date ? row.atualizadoEm.toISOString() : String(row.atualizadoEm),
    validade: row.validade instanceof Date ? row.validade.toISOString() : row.validade ? String(row.validade) : null,
    observacoes: row.observacoes,
    textoExtraidoChars: row.textoExtraido?.length ?? Number(metadata.textoExtraidoChars ?? 0),
    embeddingStatus: row.embeddingStatus,
    ragStatus: row.ragStatus,
    ragProvider: row.ragProvider,
    resumoIa: typeof metadata.entitySummary === 'string'
      ? metadata.entitySummary
      : typeof metadata.summary === 'string'
        ? metadata.summary
        : undefined,
    source: 'core',
    sourceId: row.sourceId,
    downloadUrl: `/api/documents/${row.id}/download`,
    metadata,
  }
}

function portalToPublic(row: PortalUploadRow): PublicDocument {
  const metadata = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>
  return {
    id: row.id,
    clienteId: row.clienteId,
    nome: row.nomeOriginal,
    tipo: detectType(row.nomeOriginal, row.mime),
    mime: row.mime,
    categoria: row.categoria || 'outros',
    status: String(metadata.status || 'recebido'),
    tamanho: row.tamanho,
    sha256: row.sha256,
    criadoPor: row.enviadoPor,
    criadoEm: row.enviadoEm instanceof Date ? row.enviadoEm.toISOString() : String(row.enviadoEm),
    atualizadoEm: row.enviadoEm instanceof Date ? row.enviadoEm.toISOString() : String(row.enviadoEm),
    validade: typeof metadata.validade === 'string' ? metadata.validade : null,
    observacoes: typeof metadata.observacaoConsultor === 'string' ? metadata.observacaoConsultor : null,
    textoExtraidoChars: Number(metadata.textoExtraidoChars ?? 0),
    embeddingStatus: String(metadata.embeddingStatus || 'legacy'),
    ragStatus: String(metadata.ragStatus || 'legacy'),
    ragProvider: typeof metadata.ragProvider === 'string' ? metadata.ragProvider : null,
    resumoIa: typeof metadata.resumoIa === 'string' ? metadata.resumoIa : undefined,
    source: 'portal',
    sourceId: row.id,
    downloadUrl: `/api/clientes/${row.clienteId}/documentos/${row.id}/download`,
    metadata,
  }
}

export class CoreDocumentService {
  async upload(input: CoreDocumentUploadInput): Promise<PublicDocument> {
    const id = `doc_${randomUUID()}`
    const sha256 = createHash('sha256').update(input.buffer).digest('hex')
    const ext = extname(input.filename) || '.bin'
    const storageKey = `${safeSegment(input.clienteId)}/${id}${ext}`
    const filePath = join(storageRoot(), storageKey)
    mkdirSync(dirname(filePath), { recursive: true })
    await writeFile(filePath, input.buffer)

    const sessionId = `client-docs-${input.clienteId}`
    let extractedText = ''
    let metadata: Record<string, unknown> = {
      sha256,
      alixSessionId: sessionId,
      source: input.source || 'crm',
    }

    try {
      const { getDocumentIntakeService } = await import('../alix/intake/DocumentIntakeService.js')
      const doc = await getDocumentIntakeService().ingest({
        buffer: input.buffer,
        filename: input.filename,
        mimetype: input.mimetype,
        sessionId,
        clienteId: input.clienteId,
      })
      extractedText = doc.extractedText || ''
      metadata = {
        ...metadata,
        alixDocumentId: doc.id,
        summary: doc.summary,
        kind: doc.kind,
        pageCount: doc.pageCount,
        textoExtraidoChars: extractedText.length,
        entitySummary: typeof doc.metadata?.entitySummary === 'string' ? doc.metadata.entitySummary : undefined,
        entityStructured: doc.metadata?.entityStructured,
        suggestedActions: doc.metadata?.suggestedActions,
        documentIndex: doc.metadata?.documentIndex,
      }
    } catch (err) {
      metadata.extractionError = (err as Error).message
    }

    const rowInput = {
      id,
      clienteId: input.clienteId,
      nome: input.filename,
      tipo: detectType(input.filename, input.mimetype),
      mime: input.mimetype,
      categoria: normalizeCategory(input.categoria),
      status: cleanText(input.status, 60) || 'recebido',
      storageProvider: 'local',
      storageKey,
      sha256,
      tamanho: input.buffer.length,
      textoExtraido: extractedText || null,
      embeddingStatus: extractedText ? 'pending' : 'not_available',
      ragStatus: extractedText ? 'pending' : 'not_available',
      criadoPor: cleanText(input.criadoPor, 160) || 'system',
      validade: toDateOrNull(input.validade),
      observacoes: cleanText(input.observacoes, 1600) || null,
      source: input.source || 'crm',
      sourceId: input.sourceId || null,
      metadata,
    }

    let saved: CoreDocument
    if (isPgEnabled()) {
      const db = getDb()
      const [duplicate] = await db.select().from(coreDocument)
        .where(and(eq(coreDocument.clienteId, input.clienteId), eq(coreDocument.sha256, sha256)))
        .limit(1)
      if (duplicate) return toPublic(duplicate)

      const [inserted] = await db.insert(coreDocument).values(rowInput as any).returning()
      saved = inserted
      await db.insert(documentVersion).values({
        id: `docver_${randomUUID()}`,
        documentId: id,
        versionNumber: 1,
        nome: input.filename,
        storageProvider: 'local',
        storageKey,
        mime: input.mimetype,
        tamanho: input.buffer.length,
        sha256,
        textoExtraido: extractedText || null,
        criadoPor: rowInput.criadoPor,
        metadata,
      })
    } else {
      saved = {
        ...rowInput,
        urlArquivo: null,
        ragProvider: null,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      } as CoreDocument
      const docs = memoryDocs.get(input.clienteId) || []
      memoryDocs.set(input.clienteId, [saved, ...docs])
    }

    auditAsync({
      ator: rowInput.criadoPor,
      acao: 'document_upload',
      recurso: `cliente:${input.clienteId}:document:${id}`,
      dadosDepois: { nome: input.filename, categoria: rowInput.categoria, tamanho: input.buffer.length },
    })
    void getAutomationEventService().record({
      eventType: 'document_uploaded',
      targetProvider: 'n8n',
      dispatch: true,
      payload: {
        clienteId: input.clienteId,
        documentId: id,
        nome: input.filename,
        categoria: rowInput.categoria,
      },
    }).catch(() => console.warn('[CoreDocument] Não foi possível registrar o evento de automação.'))

    if (extractedText && isPgEnabled()) {
      try {
        const { getAiJobQueueService } = await import('../alix/jobs/AiJobQueueService.js')
        const queue = getAiJobQueueService()
        if (queue.ready()) {
          const job = await queue.enqueueRagIndex({
            sourceKind: 'core_document',
            documentId: id,
            clienteId: input.clienteId,
          })
          saved = await this.updateDoc(id, {
            ragStatus: 'queued',
            embeddingStatus: 'queued',
            metadata: { ...metadata, ragJobId: job.jobId, ragJobStatusUrl: job.statusUrl },
          })
        } else if ((process.env.ALETIS_DOCUMENT_AUTO_INDEX || 'false').toLowerCase() === 'true') {
          await this.index(id)
          saved = await this.get(id) || saved
        }
      } catch (err) {
        saved = await this.updateDoc(id, {
          ragStatus: 'pending',
          embeddingStatus: 'pending',
          metadata: { ...metadata, ragQueueError: (err as Error).message },
        })
      }
    }

    return toPublic(saved)
  }

  async listClientDocuments(clienteId: string): Promise<PublicDocument[]> {
    const coreDocs = await this.listCoreDocuments(clienteId)
    const publicCore = coreDocs.map(toPublic)
    const coreIds = new Set(publicCore.map((d) => d.id))

    let legacy: PublicDocument[] = []
    if (isPgEnabled()) {
      try {
        const rows = await getDb().select().from(portalUpload).where(eq(portalUpload.clienteId, clienteId)).orderBy(desc(portalUpload.enviadoEm)).limit(500)
        legacy = rows
          .filter((row) => {
            const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>
            return !meta.coreDocumentId || !coreIds.has(String(meta.coreDocumentId))
          })
          .map(portalToPublic)
      } catch { /* ignore legacy */ }
    }

    return [...publicCore, ...legacy].sort((a, b) => new Date(b.criadoEm || 0).getTime() - new Date(a.criadoEm || 0).getTime())
  }

  async get(id: string): Promise<CoreDocument | null> {
    if (isPgEnabled()) {
      const rows = await getDb().select().from(coreDocument).where(eq(coreDocument.id, id)).limit(1)
      return rows[0] || null
    }
    for (const docs of memoryDocs.values()) {
      const found = docs.find((d) => d.id === id)
      if (found) return found
    }
    return null
  }

  async downloadBuffer(id: string): Promise<{ doc: CoreDocument; buffer: Buffer } | null> {
    const doc = await this.get(id)
    if (!doc) return null
    const filePath = join(storageRoot(), doc.storageKey)
    if (!existsSync(filePath)) return null
    return { doc, buffer: await readFile(filePath) }
  }

  async extract(id: string): Promise<PublicDocument> {
    const doc = await this.get(id)
    if (!doc) throw new Error('Documento não encontrado')
    const currentText = doc.textoExtraido || ''
    if (currentText.length > 0) return toPublic(doc)
    const dl = await this.downloadBuffer(id)
    if (!dl) throw new Error('Arquivo não encontrado no storage')

    const { getDocumentIntakeService } = await import('../alix/intake/DocumentIntakeService.js')
    const alixDoc = await getDocumentIntakeService().ingest({
      buffer: dl.buffer,
      filename: doc.nome,
      mimetype: doc.mime,
      sessionId: `client-docs-${doc.clienteId}`,
      clienteId: doc.clienteId,
    })
    const metadata = {
      ...(doc.metadata as Record<string, unknown>),
      alixDocumentId: alixDoc.id,
      summary: alixDoc.summary,
      textoExtraidoChars: alixDoc.extractedText?.length ?? 0,
      entitySummary: alixDoc.metadata?.entitySummary,
      entityStructured: alixDoc.metadata?.entityStructured,
      suggestedActions: alixDoc.metadata?.suggestedActions,
    }
    const updated = await this.updateDoc(id, {
      textoExtraido: alixDoc.extractedText || null,
      embeddingStatus: alixDoc.extractedText ? 'pending' : 'not_available',
      ragStatus: alixDoc.extractedText ? 'pending' : 'not_available',
      metadata,
    })
    return toPublic(updated)
  }

  async recordGoogleDriveSync(id: string, googleDrive: GoogleDriveSyncMetadata): Promise<PublicDocument> {
    const doc = await this.get(id)
    if (!doc) throw new Error('Documento não encontrado')
    const currentMetadata = doc.metadata && typeof doc.metadata === 'object' && !Array.isArray(doc.metadata)
      ? doc.metadata as Record<string, unknown>
      : {}
    const updated = await this.updateDoc(id, {
      metadata: { ...currentMetadata, googleDrive },
    })
    return toPublic(updated)
  }

  async index(id: string): Promise<PublicDocument> {
    let doc = await this.get(id)
    if (!doc) throw new Error('Documento não encontrado')
    if (!doc.textoExtraido) {
      const extracted = await this.extract(id)
      doc = await this.get(extracted.id)
      if (!doc) throw new Error('Documento não encontrado após extração')
    }
    if (!doc.textoExtraido) {
      const updated = await this.updateDoc(id, { ragStatus: 'not_available', embeddingStatus: 'not_available' })
      return toPublic(updated)
    }

    let ragStatus = 'indexed'
    let embeddingStatus = 'indexed'
    const ragProvider = 'aletis-local'
    const metadata = { ...(doc.metadata as Record<string, unknown>) }

    try {
      await ingestDocumentForRAG(doc.id, doc.textoExtraido, {
        clienteId: doc.clienteId,
        sessionId: `client-docs-${doc.clienteId}`,
        source: 'core_document',
        sourceFilename: doc.nome,
      })
    } catch (err) {
      ragStatus = 'failed'
      embeddingStatus = 'failed'
      metadata.localRagError = (err as Error).message
    }

    const updated = await this.updateDoc(id, {
      ragStatus,
      embeddingStatus,
      ragProvider,
      metadata,
    })
    return toPublic(updated)
  }

  async knowledgeSummary(clienteId: string): Promise<Record<string, unknown>> {
    const docs = await this.listClientDocuments(clienteId)
    const pendentes = docs.filter((d) => ['recebido', 'em_analise', 'pendente'].includes(d.status))
    const vencendo = docs.filter((d) => d.validade && new Date(d.validade).getTime() < Date.now() + 30 * 86_400_000)
    const categorias = docs.reduce<Record<string, number>>((acc, d) => {
      acc[d.categoria] = (acc[d.categoria] || 0) + 1
      return acc
    }, {})
    const ultimosResumos = docs
      .filter((d) => d.resumoIa)
      .slice(0, 8)
      .map((d) => ({ documentoId: d.id, nome: d.nome, resumo: d.resumoIa, source: d.source }))
    return {
      clienteId,
      totalDocumentos: docs.length,
      categorias,
      pendentes: pendentes.length,
      vencendo: vencendo.length,
      indexados: docs.filter((d) => String(d.ragStatus).startsWith('indexed')).length,
      pendentesIndexacao: docs.filter((d) => d.ragStatus === 'pending').length,
      ultimosResumos,
    }
  }

  async search(clienteId: string, query: string, topK = 6): Promise<Array<Record<string, unknown>>> {
    const hits = isPgEnabled() ? await searchRAG({ query, clienteId, topK }) : []
    if (hits.length > 0) {
      return hits.map((h) => ({
        documentId: h.documentId,
        source: h.source,
        sourceFilename: h.sourceFilename,
        pageStart: h.pageStart,
        similarity: h.similarity,
        excerpt: h.chunkText.slice(0, 900),
      }))
    }
    const docs = await this.listCoreDocuments(clienteId)
    const q = query.toLowerCase()
    return docs
      .filter((d) => d.textoExtraido?.toLowerCase().includes(q) || d.nome.toLowerCase().includes(q))
      .slice(0, topK)
      .map((d) => ({
        documentId: d.id,
        source: 'core_document',
        sourceFilename: d.nome,
        similarity: 0.35,
        excerpt: (d.textoExtraido || d.nome).slice(0, 900),
      }))
  }

  private async listCoreDocuments(clienteId: string): Promise<CoreDocument[]> {
    if (isPgEnabled()) {
      try {
        return await getDb().select().from(coreDocument).where(eq(coreDocument.clienteId, clienteId)).orderBy(desc(coreDocument.criadoEm)).limit(500)
      } catch { /* fallback */ }
    }
    return memoryDocs.get(clienteId) || []
  }

  private async updateDoc(id: string, patch: Partial<CoreDocument>): Promise<CoreDocument> {
    if (isPgEnabled()) {
      const [updated] = await getDb().update(coreDocument).set({
        ...patch,
        atualizadoEm: new Date(),
      } as any).where(eq(coreDocument.id, id)).returning()
      if (updated) return updated
    }
    for (const [clienteId, docs] of memoryDocs.entries()) {
      const idx = docs.findIndex((d) => d.id === id)
      if (idx >= 0) {
        const updated = { ...docs[idx], ...patch, atualizadoEm: new Date() } as CoreDocument
        docs[idx] = updated
        memoryDocs.set(clienteId, docs)
        return updated
      }
    }
    throw new Error('Documento não encontrado')
  }
}

let singleton: CoreDocumentService | null = null

export function getCoreDocumentService(): CoreDocumentService {
  if (!singleton) singleton = new CoreDocumentService()
  return singleton
}
