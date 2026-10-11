// ============================================================
// ALETIS - Alix Document Intake Service (Wave 9-INTAKE)
// Orquestra a ingestao de documentos: detecta o tipo, delega ao
// parser apropriado, persiste o resultado em disco e devolve um
// IngestedDocument pronto para ser anexado ao contexto da Alix.
// ============================================================

import { promises as fs } from 'fs'
import { join } from 'path'
import { createHash, randomUUID } from 'crypto'
import { z } from 'zod'

import type {
  IngestedDocument,
  IntakeInput,
  ParserResult,
} from './types.js'
import { MAX_FILE_BYTES } from './types.js'
import { classifyAgroDoc } from './AgroDocClassifier.js'
import { extractDocViaLlm } from './LlmDocExtractor.js'
import { getPool, isPgEnabled } from '../../../db/client.js'

import { parsePdf } from './PdfParser.js'
import { parseDocx } from './DocxParser.js'
import { parseXlsx, parseCsv } from './XlsxParser.js'
import { processImage } from './ImageProcessor.js'
import { parseText } from './TextParser.js'
import { parseWithDocling } from './DoclingParser.js'
import { extractEntitiesFromDocument } from './DocEntityExtractor.js'
import { getDocumentIndexService } from './DocumentIndexService.js'
import { smartExtract } from '../extraction/SmartExtractor.js'
import { buildDocumentReadingPlan } from './DocumentReadingPlan.js'

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
    mt === 'application/vnd.ms-excel.sheet.macroenabled.12' ||
    mt === 'application/vnd.ms-excel' ||
    ext === 'xlsx' ||
    ext === 'xlsm' ||
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

function safeSegment(value: string, fallback = 'anon'): string {
  const safe = (value || fallback).replace(/[^A-Za-z0-9_.-]/g, '_').trim()
  return safe || fallback
}

export function chooseBestParsed(base: ParserResult, docling: ParserResult | null): ParserResult {
  if (!docling?.extractedText?.trim()) return base
  const baseText = base.extractedText?.trim() ?? ''
  const doclingText = docling.extractedText.trim()
  const baseHasTables = /\|.+\|/.test(baseText)
  const doclingHasTables = /\|.+\|/.test(doclingText)
  const doclingMuchRicher = doclingText.length > Math.max(800, baseText.length * 1.35)
  const baseWeak = baseText.length < 500
  if (baseWeak || doclingMuchRicher || (!baseHasTables && doclingHasTables)) {
    return {
      ...base,
      // O parser adicional pode recuperar OCR/tabelas e ainda omitir texto nativo.
      // Conserva ambos quando não há inclusão literal; a origem continua explícita.
      extractedText: baseText && !doclingText.replace(/\s+/g, ' ').includes(baseText.replace(/\s+/g, ' '))
        ? `${doclingText}\n\n[Texto preservado da extração nativa]\n${baseText}` : doclingText,
      chunks: [...(base.chunks || []), ...(docling.chunks || [])],
      evidences: [...(base.evidences || []), ...(docling.evidences || [])],
      metadata: {
        ...(base.metadata ?? {}),
        ...(docling.metadata ?? {}),
        doclingSelected: true,
        parserFallback: 'docling',
      },
    }
  }
  return {
    ...base,
    metadata: {
      ...(base.metadata ?? {}),
      doclingAvailable: true,
      doclingTextLength: doclingText.length,
    },
  }
}

// ------------------------- service -------------------------

export interface DocumentScopeRequest {
  requestedBy: string
  requestedClienteId?: string
}

export interface DocumentClientScopeReview extends DocumentScopeRequest {
  status: 'pending' | 'unverified' | 'conflict' | 'verified'
  requestedAt: string
  detectedCpfCnpj?: string
  detectedClienteId?: string
  identityEvidenceVerified?: boolean
  reviewedBy?: string
  reviewedAt?: string
  reason?: string
  verification?: 'human' | 'document_identity'
  verifiedClienteId?: string
}

export function documentClientScopeReview(doc: Pick<IngestedDocument, 'metadata'>): DocumentClientScopeReview | undefined {
  const review = doc.metadata?.clientScopeReview
  return review && typeof review === 'object' ? review as DocumentClientScopeReview : undefined
}

function awaitingClientScope(doc: Pick<IngestedDocument, 'metadata'>): boolean {
  const review = documentClientScopeReview(doc)
  return Boolean(review && review.status !== 'verified')
}

export class DocumentIntakeService {
  private pgReady = false
  private deferredActive = 0
  private readonly deferredQueue: Array<() => Promise<void>> = []
  private readonly deferredRunning = new Set<string>()
  private readonly scopeLocks = new Map<string, Promise<unknown>>()

  constructor(private readonly storageDir: string) {}

  private deferredConcurrency(): number {
    return Math.max(1, Math.min(6, Number(process.env.ALIX_INTAKE_CONCURRENCY || 2)))
  }

  private drainDeferredQueue(): void {
    while (this.deferredActive < this.deferredConcurrency() && this.deferredQueue.length > 0) {
      const task = this.deferredQueue.shift()
      if (!task) break
      this.deferredActive += 1
      task().catch(() => undefined).finally(() => {
        this.deferredActive -= 1
        this.drainDeferredQueue()
      })
    }
  }

  private scheduleDeferred(sessionId: string, documentId: string): void {
    const key = `${sessionId}:${documentId}`
    if (this.deferredRunning.has(key)) return
    this.deferredRunning.add(key)
    this.deferredQueue.push(async () => {
      try {
        const stored = await this.get(sessionId, documentId)
        const original = await this.getOriginalFile(sessionId, documentId)
        if (!stored || !original) throw new Error('Arquivo original não está disponível para processamento.')
        const attempts = Number(stored.metadata?.processingAttempts || 0) + 1
        await this.saveMetadata(sessionId, documentId, {
          processingState: 'processing', processingStartedAt: new Date().toISOString(), processingAttempts: attempts, processingError: null,
        })
        await this.ingest({
          buffer: original.buffer, filename: original.filename, mimetype: original.mimetype,
          sessionId, clienteId: stored.clienteId, processingMode: 'deep', documentId, forceProcess: true,
          source: stored.metadata?.source as IntakeInput['source'],
        })
      } catch (error) {
        await this.saveMetadata(sessionId, documentId, {
          processingState: 'failed', processingFailedAt: new Date().toISOString(),
          processingError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        }).catch(() => null)
      } finally {
        this.deferredRunning.delete(key)
      }
    })
    this.drainDeferredQueue()
  }

  /** Aceita e persiste o arquivo antes de iniciar parser/OCR/IA. */
  async enqueue(file: IntakeInput, scopeRequest?: DocumentScopeRequest): Promise<IngestedDocument> {
    if (!file?.buffer?.byteLength) throw new Error('Arquivo ausente ou vazio.')
    if (file.buffer.byteLength > MAX_FILE_BYTES) throw new Error(`Arquivo excede o limite de ${Math.round(MAX_FILE_BYTES / 1048576)} MB.`)
    const sessionId = file.sessionId || 'anon'
    const sha = createHash('sha256').update(file.buffer).digest('hex')
    if (file.documentId) {
      const existing = await this.get(sessionId, file.documentId)
      if (existing) {
        const review = documentClientScopeReview(existing)
        if (existing.metadata.sha256 !== sha || (scopeRequest && (review?.requestedBy !== scopeRequest.requestedBy || review.requestedClienteId !== scopeRequest.requestedClienteId))) throw new Error('Identificador documental já utilizado por outro arquivo, cliente ou responsável.')
        if (file.clienteId && (awaitingClientScope(existing) || (existing.clienteId && existing.clienteId !== file.clienteId))) throw new Error('O documento não permite vínculo a este cliente sem revisão.')
        return existing
      }
    }
    const found = await this.findBySha(sha, sessionId)
    const cached = file.documentId ? null : this.scopeCompatibleCache(found, scopeRequest)
    if (cached?.clienteId && file.clienteId && cached.clienteId !== file.clienteId) {
      throw new Error('Este conteúdo já está vinculado a outro cliente nesta conversa. Abra uma conversa para o cliente atual.')
    }
    if (cached && cached.metadata?.processingState !== 'failed') {
      if (file.clienteId && awaitingClientScope(cached) && !scopeRequest) throw new Error('O documento aguarda confirmação de identidade antes do vínculo ao cliente.')
      if (file.source) {
        cached.metadata = { ...cached.metadata, source: file.source }
        await this.persist(cached)
      }
      if (['queued', 'processing'].includes(String(cached.metadata?.processingState || ''))) this.scheduleDeferred(sessionId, cached.id)
      return cached
    }
    const id = file.documentId || cached?.id || randomUUID()
    const now = new Date().toISOString()
    const rawFile = cached?.metadata?.rawFile || await this.persistRawFile(file, id, sha)
    const queued: IngestedDocument = {
      id, sessionId, clienteId: scopeRequest ? undefined : file.clienteId?.trim() || cached?.clienteId,
      filename: file.filename || `document-${id}`, mimetype: file.mimetype || 'application/octet-stream',
      sizeBytes: file.buffer.byteLength, uploadedAt: cached?.uploadedAt || now, kind: detectKind(file.filename, file.mimetype),
      extractedText: cached?.extractedText || '', metadata: {
        ...(cached?.metadata || {}), ...(file.source ? { source: file.source } : {}), sha256: sha, rawFile, processingState: 'queued', processingQueuedAt: now,
        processingError: null,
        ...(scopeRequest ? { clientScopeReview: documentClientScopeReview(cached || { metadata: {} }) || this.newScopeReview(scopeRequest) } : {}),
      },
    }
    await this.persist(queued)
    this.scheduleDeferred(sessionId, id)
    return queued
  }

  private newScopeReview(input: DocumentScopeRequest): DocumentClientScopeReview {
    if (!input.requestedBy?.trim()) throw new Error('Responsável ausente na revisão documental.')
    return { status: 'pending', requestedBy: input.requestedBy.trim(), requestedClienteId: input.requestedClienteId?.trim() || undefined, requestedAt: new Date().toISOString() }
  }

  private scopeCompatibleCache(doc: IngestedDocument | null, input?: DocumentScopeRequest): IngestedDocument | null {
    if (!doc || !input) return doc
    const review = documentClientScopeReview(doc)
    // Um novo contexto não reaproveita nem altera o vínculo histórico de um arquivo.
    return !doc.clienteId && review?.requestedBy === input.requestedBy
      && review.requestedClienteId === (input.requestedClienteId?.trim() || undefined) ? doc : null
  }

  async resumePending(sessionId: string): Promise<void> {
    const listed = await this.list(sessionId)
    for (const doc of listed) {
      const state = String(doc.metadata?.processingState || '')
      const attempts = Number(doc.metadata?.processingAttempts || 0)
      if ((state === 'queued' || state === 'processing' || state === 'failed') && attempts < 3) this.scheduleDeferred(sessionId, doc.id)
    }
  }

  private sessionDir(sessionId: string): string {
    return join(this.storageDir, safeSegment(sessionId))
  }

  private rawFileDir(sessionId: string): string {
    return join(this.storageDir, '_files', safeSegment(sessionId))
  }

  private async ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true })
  }

  private async ensurePg(): Promise<void> {
    if (!isPgEnabled() || this.pgReady) return
    const pool = getPool()
    await pool.query(`
      create table if not exists alix_document (
        id text primary key,
        session_id text not null,
        cliente_id text,
        filename text not null,
        mimetype text not null,
        kind text not null,
        sha256 text,
        payload jsonb not null,
        uploaded_at timestamptz not null,
        updated_at timestamptz not null default now()
      )
    `)
    await pool.query(`create index if not exists idx_alix_document_session on alix_document(session_id)`)
    await pool.query(`create index if not exists idx_alix_document_cliente on alix_document(cliente_id)`)
    await pool.query(`create index if not exists idx_alix_document_sha on alix_document(session_id, sha256)`)
    this.pgReady = true
  }

  private rawStorageName(id: string, filename: string): string {
    const ext = extFromName(filename)
    return `${safeSegment(id, 'document')}.${ext || 'bin'}`
  }

  private async persistRawFile(file: IntakeInput, id: string, sha256: string): Promise<Record<string, unknown>> {
    const dir = this.rawFileDir(file.sessionId || 'anon')
    await this.ensureDir(dir)
    const nomeStorage = this.rawStorageName(id, file.filename)
    const path = join(dir, nomeStorage)
    await fs.writeFile(path, file.buffer)
    return {
      path,
      nomeStorage,
      nomeOriginal: file.filename,
      mime: file.mimetype || 'application/octet-stream',
      tamanho: file.buffer.byteLength,
      sha256,
    }
  }

  /**
   * Ingere um arquivo: detecta tipo, extrai texto/imagem e persiste
   * o resultado como JSON. Retorna o documento pronto para uso.
   */
  async ingest(file: IntakeInput, scopeRequest?: DocumentScopeRequest): Promise<IngestedDocument> {
    if (!file?.buffer) throw new Error('Arquivo ausente ou vazio.')
    const size = file.buffer.byteLength
    if (size === 0) throw new Error('Arquivo vazio.')
    if (size > MAX_FILE_BYTES) {
      throw new Error(
        `Arquivo excede o limite de ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB.`,
      )
    }

    // ── Cache de extração por SHA-256 do buffer ──
    // Re-uploads do mesmo arquivo (consultor reenvia, cliente envia
    // duas vezes) evitam re-rodar parser e visão OpenAI.
    const sessionId = file.sessionId || 'anon'
    let clienteId = scopeRequest ? undefined : file.clienteId?.trim() || undefined
    const sha = createHash('sha256').update(file.buffer).digest('hex')
    const kind = detectKind(file.filename, file.mimetype)
    const found = await this.findBySha(sha, sessionId)
    const cached = this.scopeCompatibleCache(found, scopeRequest)
    if (cached?.clienteId && clienteId && cached.clienteId !== clienteId) {
      throw new Error('Este conteúdo já está vinculado a outro cliente nesta conversa.')
    }
    if (cached && clienteId && awaitingClientScope(cached)) throw new Error('O documento aguarda confirmação de identidade antes do vínculo ao cliente.')
    if (cached && cached.kind === kind && !file.forceProcess) {
      const next = clienteId && cached.clienteId !== clienteId
        ? {
            ...cached,
            clienteId,
            metadata: { ...(cached.metadata ?? {}), clienteId },
          }
        : cached
      if (!next.metadata?.rawFile) {
        next.metadata = {
          ...(next.metadata ?? {}),
          rawFile: await this.persistRawFile(file, next.id, sha),
        }
      }
      await this.persist(next)
      const indexService = getDocumentIndexService()
      if (!awaitingClientScope(next)) await indexService.indexDocument(next)
      if (file.processingMode === 'deep' && !next.metadata?.smartExtraction) {
        await this.applySmartExtraction(next)
      } else if (file.processingMode !== 'deep' && !next.metadata?.smartExtraction) {
        // Mesmo documentos reaproveitados devem continuar o enriquecimento
        // assíncrono caso a primeira leitura tenha sido interrompida.
        this.applySmartExtraction(next).catch((err) => {
          next.metadata.processingState = 'failed'
          next.metadata.processingError = (err as Error).message.slice(0, 500)
          void this.persist(next)
          console.warn('[DocumentIntakeService] smartExtract do cache falhou:', (err as Error).message)
        })
      }
      await this.enqueueKnowledge(next)
      return next
    }

    const parsedBase = await this.runParser(kind, file)
    // O caminho rápido é usado por uploads interativos (ex.: cadastro de cliente).
    // Parsers auxiliares/OCR pesado ficam para o processamento assíncrono profundo;
    // assim um arquivo grande ou uma fonte externa lenta não prende a requisição HTTP.
    const parsed = chooseBestParsed(
      parsedBase,
      file.processingMode === 'deep' ? await parseWithDocling(parsedBase.kind, file) : null,
    )

    const id = file.documentId || randomUUID()
    const now = new Date().toISOString()
    const rawFile = await this.persistRawFile(file, id, sha)
    const previous = file.documentId ? await this.get(sessionId, file.documentId) : null
    if (!clienteId && previous && !scopeRequest) clienteId = previous.clienteId
    if (previous && awaitingClientScope(previous)) clienteId = undefined

    // Classificação agro determinística, rápida e sem custo de modelo.
    let agroClass = classifyAgroDoc(parsed.extractedText ?? '')

    // Fallback de visão OpenAI quando a classificação determinística é insuficiente.
    const regexInsuficiente = agroClass.tipo === 'OUTRO' || agroClass.confianca < 0.5
    if (file.processingMode === 'deep' && regexInsuficiente && parsed.imageBase64 && parsed.imageMediaType) {
      const llm = await extractDocViaLlm({
        imageBase64: parsed.imageBase64,
        imageMediaType: parsed.imageMediaType,
        textContext: parsed.extractedText ?? '',
      })
      if (llm && llm.confianca >= agroClass.confianca) {
        agroClass = llm
      }
    }

    // Wave 10 — extração genérica de entidades para CRM/análise
    let entityExtraction: Awaited<ReturnType<typeof extractEntitiesFromDocument>> = null
    if (file.processingMode === 'deep' && parsed.extractedText && parsed.extractedText.trim().length > 20) {
      try {
        entityExtraction = await extractEntitiesFromDocument({
          text: parsed.extractedText,
          filename: file.filename,
          kind: parsed.kind,
          pageCount: parsed.pageCount,
        })
      } catch (err) {
        console.warn('[DocumentIntakeService] entity extraction falhou:', (err as Error).message)
      }
    }

    const doc: IngestedDocument = {
      id,
      sessionId,
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
      clienteId,
      chunks: parsed.chunks,
      evidences: parsed.evidences,
      metadata: {
        ...(previous?.metadata ?? {}),
        ...(parsed.metadata ?? {}),
        ...(file.source ? { source: file.source } : {}),
        sha256: sha,
        rawFile,
        processingState: 'extracting',
        parsingCompletedAt: now,
        ...(scopeRequest ? { clientScopeReview: this.newScopeReview(scopeRequest) } : {}),
        ...(clienteId ? { clienteId } : {}),
        ...(entityExtraction
          ? {
              entityDocumentType: entityExtraction.tipoDocumento,
              entities: entityExtraction.entidades,
              entitySummary: entityExtraction.resumoExecutivo,
              suggestedActions: entityExtraction.acoesSugeridas,
              entityStructured: entityExtraction.camposEstruturados,
              entityReadingCoverage: entityExtraction.readingCoverage,
              entityFieldConflicts: entityExtraction.fieldConflicts,
            }
          : {}),
        ...(agroClass.tipo !== 'OUTRO' && agroClass.confianca >= 0.5
          ? {
              agroTipo: agroClass.tipo,
              agroConfianca: agroClass.confianca,
              agroCampos: agroClass.camposExtraidos,
              agroIndicadores: agroClass.indicadores,
            }
          : {}),
      },
    }

    const indexService = getDocumentIndexService()
    const index = indexService.buildIndex(doc)
    doc.metadata.documentIndex = {
      chunkCount: index.chunks.length,
      evidenceCount: index.evidences.length,
      hasOcr: index.evidences.some((e) => e.kind === 'ocr'),
      confidence: index.confidence,
    }

    await this.persist(doc)
    if (!awaitingClientScope(doc)) await indexService.persist(index)

    if (file.processingMode === 'deep') {
      await this.applySmartExtraction(doc)
      await this.enqueueKnowledge(doc)
    } else {
      await this.enqueueKnowledge(doc)
      // Fluxos de chat continuam responsivos; o resultado especializado é anexado
      // ao documento assim que terminar.
      this.applySmartExtraction(doc)
        .then(async () => {
          if (!doc.clienteId || awaitingClientScope(doc)) return
          const { getAiJobQueueService } = await import('../jobs/AiJobQueueService.js')
          const queue = getAiJobQueueService()
          if (queue.ready()) {
            await queue.enqueueFactExtraction({
              sourceKind: 'alix_document',
              sourceId: doc.id,
              clienteId: doc.clienteId,
              revision: 'smart-extraction',
            }).catch(() => undefined)
          }
        })
        .catch((err) => {
          doc.metadata.processingState = 'failed'
          doc.metadata.processingError = (err as Error).message.slice(0, 500)
          void this.persist(doc)
          console.warn('[DocumentIntakeService] smartExtract falhou:', (err as Error).message)
        })
    }

    return doc
  }

  private async enqueueKnowledge(doc: IngestedDocument): Promise<void> {
    if (awaitingClientScope(doc)) return
    if (!isPgEnabled()) return
    try {
      const { getAiJobQueueService } = await import('../jobs/AiJobQueueService.js')
      const queue = getAiJobQueueService()
      if (!queue.ready()) return
      const pipeline = await queue.enqueueDocumentPipeline({
        sessionId: doc.sessionId,
        documentId: doc.id,
        clienteId: doc.clienteId,
      }).catch((error) => {
        if (!String((error as Error).message).includes('equivalente')) throw error
        return null
      })
      if (pipeline) {
        doc.metadata.documentPipelineJob = pipeline
        await this.persist(doc)
      }
      if (doc.extractedText?.trim()) {
        await queue.enqueueDocumentKnowledge({ documentId: doc.id, clienteId: doc.clienteId })
      }
    } catch (err) {
      console.warn('[DocumentIntakeService] não foi possível enfileirar a esteira/conhecimento:', (err as Error).message)
    }
  }

  private async applySmartExtraction(doc: IngestedDocument): Promise<void> {
    const extracted = await smartExtract(doc)
    doc.metadata.smartExtractionTimingMs = extracted.timingMs
    doc.metadata.smartExtractionClass = extracted.classification
    if (!extracted.result) {
      doc.metadata.processingState = 'completed_basic'
      doc.metadata.processingCompletedAt = new Date().toISOString()
      await this.persist(doc)
      return
    }
    doc.metadata.smartExtraction = extracted.result
    doc.metadata.processingState = 'completed'
    doc.metadata.processingCompletedAt = new Date().toISOString()
    await this.persist(doc)
    await this.refreshOnboardingReview(doc)
  }

  private async refreshOnboardingReview(doc: IngestedDocument): Promise<void> {
    const {
      buildDocumentOnboardingCandidate,
      getDocumentOnboardingReviewService,
    } = await import('./DocumentOnboardingReviewService.js')
    const candidate = buildDocumentOnboardingCandidate(doc)
    if (!candidate) return
    const reviewSvc = getDocumentOnboardingReviewService()
    const existing = await reviewSvc.get(`docrev_${doc.id}`, doc.sessionId)
    const lockedStatus = existing && ['blocked_duplicate', 'dismissed', 'converted'].includes(existing.status)
      ? existing.status
      : undefined
    await reviewSvc.createFromDocument(doc, {
      status: lockedStatus ?? (candidate.ready ? 'ready_for_hitl' : 'needs_review'),
      duplicateCliente: existing?.duplicateCliente,
    })
  }

  private async runParser(
    kind: DetectedKind,
    file: IntakeInput,
  ): Promise<ParserResult> {
    switch (kind) {
      case 'pdf':
        return parsePdf(file.buffer, file.processingMode === 'deep' ? undefined : { maxOcrPages: 2 })
      case 'docx':
        return parseDocx(file.buffer)
      case 'xlsx':
        return parseXlsx(file.buffer)
      case 'csv':
        return parseCsv(file.buffer)
      case 'image':
        return processImage(file.buffer, file.filename, file.mimetype, { ocr: file.processingMode === 'deep' })
      case 'text':
      default:
        return parseText(file.buffer)
    }
  }

  /** Persiste o documento em disco (um JSON por arquivo). */
  private async persist(doc: IngestedDocument, requirePg = false): Promise<void> {
    if (doc.clienteId && awaitingClientScope(doc)) throw new Error('Documento em quarentena não pode ter vínculo ao cliente.')
    if (isPgEnabled()) {
      try {
        await this.ensurePg()
        const persisted = await getPool().query(
          `
            insert into alix_document (
              id, session_id, cliente_id, filename, mimetype, kind, sha256, payload, uploaded_at, updated_at
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::timestamptz, now())
            on conflict (id) do update set
              session_id = excluded.session_id,
              cliente_id = excluded.cliente_id,
              filename = excluded.filename,
              mimetype = excluded.mimetype,
              kind = excluded.kind,
              sha256 = excluded.sha256,
              payload = excluded.payload,
              updated_at = now()
            where alix_document.cliente_id is null or alix_document.cliente_id is not distinct from excluded.cliente_id
          `,
          [
            doc.id,
            doc.sessionId,
            doc.clienteId ?? null,
            doc.filename,
            doc.mimetype,
            doc.kind,
            typeof doc.metadata?.sha256 === 'string' ? doc.metadata.sha256 : null,
            JSON.stringify(doc),
            doc.uploadedAt,
          ],
        )
        if (persisted.rowCount === 0) throw new Error('Documento já vinculado a outro cliente; recarregue a revisão.')
      } catch (err) {
        if (requirePg) throw err
        console.warn('[DocumentIntakeService] PG persist falhou:', (err as Error).message)
      }
    }

    const dir = this.sessionDir(doc.sessionId)
    await this.ensureDir(dir)
    const path = join(dir, `${doc.id}.json`)
    // A leitura deve observar uma versão completa, inclusive durante o intake
    // assíncrono. Um temporário por gravação evita colisões entre workers.
    const temporaryPath = `${path}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(temporaryPath, JSON.stringify(doc, null, 2), 'utf-8')
      await fs.rename(temporaryPath, path)
    } finally {
      await fs.unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
    }
  }

  /** Recupera um documento persistido. */
  async get(sessionId: string, id: string): Promise<IngestedDocument | null> {
    if (isPgEnabled()) {
      try {
        await this.ensurePg()
        const res = await getPool().query(
          `select payload from alix_document where session_id = $1 and id = $2 limit 1`,
          [sessionId, id],
        )
        const payload = res.rows[0]?.payload
        if (payload) return payload as IngestedDocument
      } catch (err) {
        console.warn('[DocumentIntakeService] PG get falhou:', (err as Error).message)
      }
    }

    const path = join(this.sessionDir(sessionId), `${safeSegment(id, 'document')}.json`)
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
   * Persiste enriquecimentos derivados sem reprocessar o arquivo original.
   * Usado para análises profundas: evita pagar e esperar novamente pelo mesmo
   * diagnóstico quando o consultor abre o documento, o chat e o Notebook.
   */
  async saveMetadata(
    sessionId: string,
    id: string,
    patch: Record<string, unknown>,
  ): Promise<IngestedDocument | null> {
    const doc = await this.get(sessionId, id)
    if (!doc) return null
    doc.metadata = { ...(doc.metadata ?? {}), ...patch }
    await this.persist(doc)
    return doc
  }

  /** Checkpoint exclusivo da leitura: PG autoritativo, revisão conferida e nenhum campo da fonte regravado. */
  async saveDeepAnalysisCheckpoint(sessionId: string, id: string, expectedSourceHash: string, input: {
    deepAnalysis?: Record<string, unknown>
    continuation?: { rootJobId: string; checkpoint: Record<string, unknown> }
  }): Promise<IngestedDocument> {
    const patch = z.object({
      deepAnalysis: z.record(z.unknown()).optional(),
      continuation: z.object({ rootJobId: z.string().uuid(), checkpoint: z.record(z.unknown()) }).optional(),
    }).strict().parse(input)
    z.string().regex(/^[a-f0-9]{64}$/).parse(expectedSourceHash)
    const apply = (doc: IngestedDocument): IngestedDocument => {
      if (buildDocumentReadingPlan(doc).sourceHash !== expectedSourceHash) {
        throw new Error('O conteúdo do documento mudou durante a análise; inicie uma nova leitura para usar a versão atual.')
      }
      const metadata = { ...doc.metadata }
      if (patch.deepAnalysis) metadata.deepAnalysis = patch.deepAnalysis
      if (patch.continuation) {
        const saved = z.record(z.record(z.unknown())).safeParse(metadata.deepAnalysisContinuations)
        if (metadata.deepAnalysisContinuations !== undefined && !saved.success) throw new Error('Checkpoints de leitura inválidos; revisão necessária antes de gravar.')
        const checkpoints = saved.success ? saved.data : {}
        const rootJobId = patch.continuation.rootJobId
        if (!checkpoints[rootJobId]) {
          // Só descarta cadeias encerradas. Leituras ativas conservam os próprios segmentos/foco.
          const removable = Object.entries(checkpoints)
            .filter(([, checkpoint]) => !['running', 'continuation_required'].includes(String(checkpoint.status)))
            .sort((a, b) => String(a[1].updatedAt).localeCompare(String(b[1].updatedAt)))
          while (Object.keys(checkpoints).length >= 8 && removable.length) delete checkpoints[removable.shift()![0]]
          if (Object.keys(checkpoints).length >= 8) throw new Error('Este documento já possui oito leituras em andamento; aguarde a conclusão antes de iniciar outro foco.')
        }
        metadata.deepAnalysisContinuations = { ...checkpoints, [rootJobId]: patch.continuation.checkpoint }
      }
      return { ...doc, metadata }
    }
    let doc: IngestedDocument
    if (isPgEnabled()) {
      await this.ensurePg()
      const client = await getPool().connect()
      try {
        await client.query('BEGIN')
        const current = await client.query('select payload from alix_document where session_id = $1 and id = $2 for update', [sessionId, id])
        if (!current.rows[0]?.payload) throw new Error('Documento não encontrado no banco autoritativo.')
        doc = apply(current.rows[0].payload as IngestedDocument)
        await client.query(
          `update alix_document set payload = jsonb_set(payload, '{metadata}', $3::jsonb, true), updated_at = now() where session_id = $1 and id = $2`,
          [sessionId, id, JSON.stringify(doc.metadata)],
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      } finally { client.release() }
    } else {
      const current = await this.get(sessionId, id)
      if (!current) throw new Error('Documento não encontrado.')
      doc = apply(current)
    }
    // O espelho local só observa o checkpoint confirmado; não chama persist(), que regravaria o PG.
    const directory = this.sessionDir(sessionId)
    await this.ensureDir(directory)
    const path = join(directory, `${safeSegment(id, 'document')}.json`)
    const temporaryPath = `${path}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(temporaryPath, JSON.stringify(doc, null, 2), 'utf-8')
      await fs.rename(temporaryPath, path)
    } finally {
      await fs.unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error })
    }
    return doc
  }

  /** Vincula um documento já analisado ao cliente sem executar parser/LLM novamente. */
  async linkToCliente(sessionId: string, id: string, clienteId: string): Promise<IngestedDocument | null> {
    const normalizedClienteId = clienteId.trim()
    if (!normalizedClienteId) throw new Error('clienteId ausente para vínculo documental.')
    const doc = await this.get(sessionId, id)
    if (!doc) return null
    if (doc.clienteId && doc.clienteId !== normalizedClienteId) throw new Error('Documento já vinculado a outro cliente.')
    if (awaitingClientScope(doc)) throw new Error('Confirme a identidade do documento antes de anexar ao cliente.')
    if (doc.clienteId === normalizedClienteId) return doc
    doc.clienteId = normalizedClienteId
    doc.metadata = {
      ...(doc.metadata ?? {}),
      clienteId: normalizedClienteId,
      linkedToClienteAt: new Date().toISOString(),
    }
    await this.persist(doc, true)
    await getDocumentIndexService().indexDocument(doc)
    await this.enqueueKnowledge(doc)
    return doc
  }

  /** Promove apenas a revisão concluída; reexecução no mesmo destino é idempotente. */
  async confirmClientScope(sessionId: string, id: string, input: {
    clienteId: string
    reviewedBy: string
    reason: string
    verification: 'human' | 'document_identity'
  }): Promise<IngestedDocument | null> {
    const key = `${sessionId}:${id}`
    const previous = this.scopeLocks.get(key) || Promise.resolve()
    const next = previous.catch(() => undefined).then(async () => {
      const doc = await this.get(sessionId, id)
      if (!doc) return null
      const review = documentClientScopeReview(doc)
      if (!review) throw new Error('Documento sem revisão de identidade registrada.')
      const clienteId = input.clienteId.trim()
      if (!clienteId || !input.reviewedBy.trim() || input.reason.trim().length < 10) throw new Error('Informe cliente, responsável e motivo da confirmação (mínimo 10 caracteres).')
      if (!['completed', 'completed_basic'].includes(String(doc.metadata.processingState))) throw new Error('Aguarde a conclusão da leitura antes de confirmar o destino.')
      if (doc.clienteId && doc.clienteId !== clienteId) throw new Error('Documento já vinculado a outro cliente.')
      if (input.verification === 'document_identity' && (review.status !== 'pending' || review.requestedClienteId !== clienteId || !review.identityEvidenceVerified)) {
        throw new Error('A revisão exige confirmação humana do destino.')
      }
      if (review.status !== 'verified') {
        doc.clienteId = clienteId
        doc.metadata = { ...doc.metadata, clienteId, clientScopeReview: {
          ...review, status: 'verified', verifiedClienteId: clienteId, reviewedBy: input.reviewedBy.trim(),
          reviewedAt: new Date().toISOString(), reason: input.reason.trim(), verification: input.verification,
        } satisfies DocumentClientScopeReview }
        await this.persist(doc, true)
      }
      // Se houve falha depois da gravação, a repetição recupera os derivados.
      await getDocumentIndexService().indexDocument(doc)
      await this.enqueueKnowledge(doc)
      return doc
    })
    this.scopeLocks.set(key, next)
    try { return await next } finally { if (this.scopeLocks.get(key) === next) this.scopeLocks.delete(key) }
  }

  async getOriginalFile(
    sessionId: string,
    id: string,
  ): Promise<{
    buffer: Buffer
    filename: string
    mimetype: string
    sizeBytes: number
    sha256?: string
  } | null> {
    const doc = await this.get(sessionId, id)
    if (!doc) return null
    const rawFile = doc.metadata?.rawFile as Record<string, unknown> | undefined
    const rawPath = typeof rawFile?.path === 'string' ? rawFile.path : undefined
    if (!rawPath) return null
    try {
      const buffer = await fs.readFile(rawPath)
      return {
        buffer,
        filename: String(rawFile?.nomeOriginal || doc.filename),
        mimetype: String(rawFile?.mime || doc.mimetype || 'application/octet-stream'),
        sizeBytes: buffer.byteLength,
        sha256: typeof rawFile?.sha256 === 'string' ? rawFile.sha256 : undefined,
      }
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e?.code === 'ENOENT') return null
      throw err
    }
  }

  /**
   * Procura no diretório da sessão um documento previamente ingerido
   * com mesmo SHA-256 do buffer. Devolve o IngestedDocument cacheado
   * ou null. Implementação: leitura linear do diretório, suficiente
   * para volumes típicos por sessão (<200 arquivos).
   */
  private async findBySha(sha256: string, sessionId: string): Promise<IngestedDocument | null> {
    if (isPgEnabled()) {
      try {
        await this.ensurePg()
        const res = await getPool().query(
          `select payload from alix_document where session_id = $1 and sha256 = $2 order by uploaded_at desc limit 1`,
          [sessionId, sha256],
        )
        const payload = res.rows[0]?.payload
        if (payload) return payload as IngestedDocument
      } catch (err) {
        console.warn('[DocumentIntakeService] PG findBySha falhou:', (err as Error).message)
      }
    }

    const dir = this.sessionDir(sessionId)
    let files: string[] = []
    try {
      files = await fs.readdir(dir)
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e?.code === 'ENOENT') return null
      return null
    }
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      try {
        const raw = await fs.readFile(join(dir, f), 'utf-8')
        const doc = JSON.parse(raw) as IngestedDocument
        if (doc.metadata?.sha256 === sha256) return doc
      } catch {
        // ignore corrompido
      }
    }
    return null
  }

  /**
   * Lista documentos da sessao (metadados; sem texto/base64 pesados).
   */
  async list(sessionId: string): Promise<
    Array<Omit<IngestedDocument, 'extractedText' | 'imageBase64' | 'chunks' | 'evidences'> & {
      hasText: boolean
      hasImage: boolean
      chunkCount: number
      evidenceCount: number
    }>
  > {
    if (isPgEnabled()) {
      try {
        await this.ensurePg()
        const res = await getPool().query(
          `select payload from alix_document where session_id = $1 order by uploaded_at desc`,
          [sessionId],
        )
        return res.rows.map((row) => {
          const d = row.payload as IngestedDocument
          const { extractedText, imageBase64, chunks, evidences, ...rest } = d
          return {
            ...rest,
            hasText: !!extractedText && extractedText.length > 0,
            hasImage: !!imageBase64 && imageBase64.length > 0,
            chunkCount: chunks?.length ?? Number((d.metadata?.documentIndex as { chunkCount?: number } | undefined)?.chunkCount ?? 0),
            evidenceCount: evidences?.length ?? Number((d.metadata?.documentIndex as { evidenceCount?: number } | undefined)?.evidenceCount ?? 0),
          }
        })
      } catch (err) {
        console.warn('[DocumentIntakeService] PG list falhou:', (err as Error).message)
      }
    }

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
      Omit<IngestedDocument, 'extractedText' | 'imageBase64' | 'chunks' | 'evidences'> & {
        hasText: boolean
        hasImage: boolean
        chunkCount: number
        evidenceCount: number
      }
    > = []
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      try {
        const raw = await fs.readFile(join(dir, f), 'utf-8')
        const d = JSON.parse(raw) as IngestedDocument
        const { extractedText, imageBase64, chunks, evidences, ...rest } = d
        docs.push({
          ...rest,
          hasText: !!extractedText && extractedText.length > 0,
          hasImage: !!imageBase64 && imageBase64.length > 0,
          chunkCount: chunks?.length ?? Number((d.metadata?.documentIndex as { chunkCount?: number } | undefined)?.chunkCount ?? 0),
          evidenceCount: evidences?.length ?? Number((d.metadata?.documentIndex as { evidenceCount?: number } | undefined)?.evidenceCount ?? 0),
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
    const existingDoc = await this.get(sessionId, id)
    let removedPg = false
    if (isPgEnabled()) {
      try {
        await this.ensurePg()
        const res = await getPool().query(
          `delete from alix_document where session_id = $1 and id = $2`,
          [sessionId, id],
        )
        removedPg = (res.rowCount ?? 0) > 0
      } catch (err) {
        console.warn('[DocumentIntakeService] PG remove falhou:', (err as Error).message)
      }
    }

    await getDocumentIndexService().remove(sessionId, id)

    const rawPath = (existingDoc?.metadata?.rawFile as Record<string, unknown> | undefined)?.path
    if (typeof rawPath === 'string' && rawPath) {
      try { await fs.unlink(rawPath) } catch { /* raw file best-effort */ }
    }

    const path = join(this.sessionDir(sessionId), `${safeSegment(id, 'document')}.json`)
    try {
      await fs.unlink(path)
      return true
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e?.code === 'ENOENT') return removedPg
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
