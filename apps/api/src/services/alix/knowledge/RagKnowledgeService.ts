import { getPool, isPgEnabled } from '../../../db/client.js'
import { completeDocumentChunks } from '../intake/DocumentCorpus.js'
import type { DocumentChunk } from '../intake/types.js'
import {
  chunkText,
  ingestDocumentForRAG,
  ragContentHash,
  type RAGIngestChunk,
  type RAGIngestResult,
} from '../rag/RagService.js'

export type KnowledgeSourceKind = 'alix_document' | 'core_document'

export interface KnowledgeIndexResult extends RAGIngestResult {
  sourceKind: KnowledgeSourceKind
  sourceId: string
  clienteId?: string
  sessionId?: string
  skipped: boolean
}

type AlixDocumentRow = {
  id: string
  session_id: string
  cliente_id?: string | null
  filename: string
  payload: Record<string, unknown>
}

type CoreDocumentRow = {
  id: string
  cliente_id: string
  nome: string
  texto_extraido?: string | null
  metadata?: Record<string, unknown> | null
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function stringOrNull(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text || null
}

function normalizeChunk(item: unknown): RAGIngestChunk | null {
  if (!item || typeof item !== 'object') return null
  const value = item as Record<string, unknown>
  const text = String(value.text ?? value.chunkText ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  return {
    text,
    pageStart: numberOrNull(value.pageStart ?? value.page),
    pageEnd: numberOrNull(value.pageEnd ?? value.page),
    sheet: stringOrNull(value.sheet),
    metadata: {
      kind: value.kind,
      source: value.source,
      confidence: value.confidence,
      evidenceIds: value.evidenceIds,
      table: value.table,
      ordinal: value.ordinal,
    },
  }
}

export function buildCanonicalRagChunks(payload: Record<string, unknown>): RAGIngestChunk[] {
  return completeDocumentChunks({ extractedText: String(payload.extractedText ?? ''),
    chunks: Array.isArray(payload.chunks) ? payload.chunks as DocumentChunk[] : [],
  }, 1600).map(normalizeChunk).filter((item): item is RAGIngestChunk => Boolean(item))
}

async function updateState(input: {
  sourceKind: KnowledgeSourceKind
  sourceId: string
  documentId: string
  clienteId?: string | null
  sessionId?: string | null
  contentHash: string
  embeddingModel: string
  status: 'pending' | 'processing' | 'indexed' | 'failed' | 'skipped'
  chunkCount?: number
  embeddingCount?: number
  jobId?: string
  error?: string
  completed?: boolean
}): Promise<void> {
  await getPool().query(
    `insert into alix_rag_index_state (
       id, source_kind, source_id, document_id, cliente_id, session_id,
       content_hash, embedding_model, status, chunk_count, embedding_count,
       job_id, attempt_count, last_error, started_at, completed_at, created_at, updated_at
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
       case when $9 = 'processing' then 1 else 0 end,
       $13,
       case when $9 = 'processing' then now() else null end,
       case when $14 then now() else null end,
       now(),now()
     )
     on conflict (id) do update set
       document_id = excluded.document_id,
       cliente_id = excluded.cliente_id,
       session_id = excluded.session_id,
       content_hash = excluded.content_hash,
       embedding_model = excluded.embedding_model,
       status = excluded.status,
       chunk_count = excluded.chunk_count,
       embedding_count = excluded.embedding_count,
       job_id = coalesce(excluded.job_id, alix_rag_index_state.job_id),
       attempt_count = case when excluded.status = 'processing'
         then alix_rag_index_state.attempt_count + 1
         else alix_rag_index_state.attempt_count end,
       last_error = excluded.last_error,
       started_at = case when excluded.status = 'processing' then now() else alix_rag_index_state.started_at end,
       completed_at = case when $14 then now() else alix_rag_index_state.completed_at end,
       updated_at = now()`,
    [
      `${input.sourceKind}:${input.sourceId}`,
      input.sourceKind,
      input.sourceId,
      input.documentId,
      input.clienteId ?? null,
      input.sessionId ?? null,
      input.contentHash,
      input.embeddingModel,
      input.status,
      input.chunkCount ?? 0,
      input.embeddingCount ?? 0,
      input.jobId ?? null,
      input.error?.slice(0, 2_000) ?? null,
      Boolean(input.completed),
    ],
  )
}

async function canSkip(sourceKind: KnowledgeSourceKind, sourceId: string, hash: string, model: string): Promise<boolean> {
  const result = await getPool().query(
    `select 1
     from alix_rag_index_state s
     where s.id = $1 and s.content_hash = $2 and s.embedding_model = $3
       and s.status in ('indexed', 'skipped')
       and s.embedding_count > 0
       and exists (
         select 1 from alix_document_embedding e where e.document_id = s.document_id
       )
     limit 1`,
    [`${sourceKind}:${sourceId}`, hash, model],
  )
  return Boolean(result.rowCount)
}

async function mirrorAlixStatus(documentId: string, result: KnowledgeIndexResult): Promise<void> {
  await getPool().query(
    `update portal_upload
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
       'ragStatus', $2::text,
       'embeddingStatus', $2::text,
       'ragProvider', 'aletis-pgvector',
       'ragChunkCount', $3::int,
       'ragEmbeddingCount', $4::int,
       'ragIndexedAt', now()::text
     )
     where metadata->>'alixDocumentId' = $1`,
    [documentId, result.skipped ? 'indexed_cached' : 'indexed', result.chunkCount, result.embeddingCount],
  )
}

async function runIndex(input: {
  sourceKind: KnowledgeSourceKind
  sourceId: string
  documentId: string
  text: string
  chunks: RAGIngestChunk[]
  clienteId?: string | null
  sessionId?: string | null
  sourceFilename: string
  jobId?: string
  force?: boolean
}): Promise<KnowledgeIndexResult> {
  const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
  const contentHash = ragContentHash(input.chunks)
  const base = {
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    documentId: input.documentId,
    clienteId: input.clienteId ?? undefined,
    sessionId: input.sessionId ?? undefined,
  }

  if (!input.force && await canSkip(input.sourceKind, input.sourceId, contentHash, embeddingModel)) {
    const state = await getPool().query(
      `select chunk_count, embedding_count from alix_rag_index_state where id = $1`,
      [`${input.sourceKind}:${input.sourceId}`],
    )
    const cached = state.rows[0] || {}
    const result: KnowledgeIndexResult = {
      ...base,
      contentHash,
      embeddingModel,
      dimensions: Number(process.env.OPENAI_EMBEDDING_DIMENSIONS || 1536),
      chunkCount: Number(cached.chunk_count || input.chunks.length),
      embeddingCount: Number(cached.embedding_count || input.chunks.length),
      skipped: true,
    }
    await updateState({
      ...base,
      contentHash,
      embeddingModel,
      status: 'skipped',
      chunkCount: result.chunkCount,
      embeddingCount: result.embeddingCount,
      jobId: input.jobId,
      completed: true,
    })
    return result
  }

  await updateState({
    ...base,
    contentHash,
    embeddingModel,
    status: 'processing',
    jobId: input.jobId,
  })
  try {
    const indexed = await ingestDocumentForRAG(input.documentId, input.text, {
      clienteId: input.clienteId ?? undefined,
      sessionId: input.sessionId ?? undefined,
      source: input.sourceKind,
      sourceFilename: input.sourceFilename,
      chunks: input.chunks,
    })
    const result: KnowledgeIndexResult = { ...base, ...indexed, skipped: false }
    await updateState({
      ...base,
      contentHash: indexed.contentHash,
      embeddingModel: indexed.embeddingModel,
      status: 'indexed',
      chunkCount: indexed.chunkCount,
      embeddingCount: indexed.embeddingCount,
      jobId: input.jobId,
      completed: true,
    })
    return result
  } catch (error) {
    await updateState({
      ...base,
      contentHash,
      embeddingModel,
      status: 'failed',
      jobId: input.jobId,
      error: (error as Error).message,
      completed: true,
    })
    throw error
  }
}

export async function indexAlixDocument(documentId: string, options: { jobId?: string; force?: boolean } = {}): Promise<KnowledgeIndexResult> {
  if (!isPgEnabled()) throw new Error('PostgreSQL desabilitado: RAG persistente indisponível')
  const result = await getPool().query(
    `select id, session_id, cliente_id, filename, payload
     from alix_document where id = $1 limit 1`,
    [documentId],
  )
  const row = result.rows[0] as AlixDocumentRow | undefined
  if (!row) throw new Error(`Documento ALIX não encontrado: ${documentId}`)
  const chunks = buildCanonicalRagChunks(row.payload)
  if (!chunks.length) throw new Error(`Documento sem texto indexável: ${documentId}`)
  const indexed = await runIndex({
    sourceKind: 'alix_document',
    sourceId: row.id,
    documentId: row.id,
    text: String(row.payload.extractedText ?? ''),
    chunks,
    clienteId: row.cliente_id,
    sessionId: row.session_id,
    sourceFilename: row.filename,
    jobId: options.jobId,
    force: options.force,
  })
  await mirrorAlixStatus(documentId, indexed)
  return indexed
}

export async function indexCoreDocument(documentId: string, options: { jobId?: string; force?: boolean } = {}): Promise<KnowledgeIndexResult> {
  if (!isPgEnabled()) throw new Error('PostgreSQL desabilitado: RAG persistente indisponível')
  const result = await getPool().query(
    `select id, cliente_id, nome, texto_extraido, metadata
     from core_document where id = $1 limit 1`,
    [documentId],
  )
  const row = result.rows[0] as CoreDocumentRow | undefined
  if (!row) throw new Error(`Documento central não encontrado: ${documentId}`)
  const text = String(row.texto_extraido ?? '').trim()
  if (!text) throw new Error(`Documento central sem texto indexável: ${documentId}`)
  const chunks = chunkText(text, 1_600, 240).map((chunk) => ({ text: chunk }))
  const indexed = await runIndex({
    sourceKind: 'core_document',
    sourceId: row.id,
    documentId: row.id,
    text,
    chunks,
    clienteId: row.cliente_id,
    sessionId: `client-docs-${row.cliente_id}`,
    sourceFilename: row.nome,
    jobId: options.jobId,
    force: options.force,
  })
  await getPool().query(
    `update core_document set
       rag_status = $2,
       embedding_status = $2,
       rag_provider = 'aletis-pgvector',
       metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'ragChunkCount', $3::int,
         'ragEmbeddingCount', $4::int,
         'ragIndexedAt', now()::text
       ),
       atualizado_em = now()
     where id = $1`,
    [documentId, indexed.skipped ? 'indexed_cached' : 'indexed', indexed.chunkCount, indexed.embeddingCount],
  )
  return indexed
}

export async function getRagKnowledgeStats(): Promise<Record<string, number>> {
  if (!isPgEnabled()) return {
    sourceDocuments: 0, clientDocuments: 0, indexedDocuments: 0,
    indexedClientDocuments: 0, clientDocumentsWithoutText: 0,
    pendingDocuments: 0, failedDocuments: 0, chunks: 0, embeddings: 0,
  }
  const result = await getPool().query(`
    select
      (select count(*)::int from alix_document where coalesce(payload->>'extractedText','') <> '') as source_documents,
      (select count(*)::int from alix_document where cliente_id is not null and coalesce(payload->>'extractedText','') <> '') as client_documents,
      (select count(*)::int from alix_document d where d.cliente_id is not null
        and coalesce(d.payload->>'extractedText','') <> ''
        and exists (select 1 from alix_document_embedding e where e.document_id = d.id)
      ) as indexed_client_documents,
      (select count(*)::int from alix_document where cliente_id is not null
        and coalesce(payload->>'extractedText','') = '') as client_documents_without_text,
      (select count(*)::int from alix_rag_index_state where status in ('indexed','skipped')) as indexed_documents,
      (select count(*)::int from alix_rag_index_state where status in ('pending','processing')) as pending_documents,
      (select count(*)::int from alix_rag_index_state where status = 'failed') as failed_documents,
      (select count(*)::int from alix_document_chunk) as chunks,
      (select count(*)::int from alix_document_embedding) as embeddings
  `)
  const row = result.rows[0] || {}
  return {
    sourceDocuments: Number(row.source_documents || 0),
    clientDocuments: Number(row.client_documents || 0),
    indexedClientDocuments: Number(row.indexed_client_documents || 0),
    clientDocumentsWithoutText: Number(row.client_documents_without_text || 0),
    indexedDocuments: Number(row.indexed_documents || 0),
    pendingDocuments: Number(row.pending_documents || 0),
    failedDocuments: Number(row.failed_documents || 0),
    chunks: Number(row.chunks || 0),
    embeddings: Number(row.embeddings || 0),
  }
}
