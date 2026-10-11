// ============================================================
// ALETIS — RAG Service (Retrieval-Augmented Generation)
//
// Suporta dois backends:
//   1. pgvector (preferido) — similaridade vetorial via HNSW
//   2. JSONB fallback (default) — cosine similarity em JS
//   3. Full Text Search (sempre ativo) — busca textual rápida
//
// NOTE: Para ativar pgvector, execute no PostgreSQL:
//   CREATE EXTENSION IF NOT EXISTS vector;
// ============================================================

import { createHash } from 'node:crypto';
import { embedOpenAI } from '../../llm/OpenAIClient.js';
import { getDb } from '../../../db/client.js';
import { alixDocumentChunk } from '../../../db/schema.js';
import { sql } from 'drizzle-orm';

export interface RAGChunk {
  chunkId: number;
  documentId: string;
  sessionId?: string | null;
  chunkText: string;
  source: string;
  sourceFilename?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  sheet?: string | null;
  similarity: number;
}

export interface RAGSearchOpts {
  query: string;
  clienteId?: string;
  sessionId?: string;
  topK?: number;
  ftsOnly?: boolean;
}

type EmbeddingStorageMode = 'vector' | 'jsonb' | 'none';

export interface RAGIngestChunk {
  text: string;
  pageStart?: number | null;
  pageEnd?: number | null;
  sheet?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RAGIngestResult {
  documentId: string;
  contentHash: string;
  embeddingModel: string;
  dimensions: number;
  chunkCount: number;
  embeddingCount: number;
}

export function ragContentHash(chunks: RAGIngestChunk[]): string {
  return createHash('sha256')
    .update(chunks.map((chunk) => [chunk.pageStart, chunk.pageEnd, chunk.sheet, chunk.text].join('|')).join('\n'))
    .digest('hex');
}

let embeddingStorageMode: EmbeddingStorageMode | null = null;

async function getEmbeddingStorageMode(): Promise<EmbeddingStorageMode> {
  if (embeddingStorageMode !== null) return embeddingStorageMode;
  const db = getDb();
  if (!db) { embeddingStorageMode = 'none'; return embeddingStorageMode; }
  try {
    const result = await db.execute(sql`
      SELECT
        EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS has_vector,
        (
          SELECT udt_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'alix_document_embedding'
            AND column_name = 'embedding'
        ) AS embedding_type
    `);
    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    const row = rows[0] as { has_vector?: boolean; embedding_type?: string } | undefined;
    if (row?.has_vector && row.embedding_type === 'vector') embeddingStorageMode = 'vector';
    else if (row?.embedding_type === 'jsonb') embeddingStorageMode = 'jsonb';
    else embeddingStorageMode = 'none';
  } catch { embeddingStorageMode = 'none'; }
  return embeddingStorageMode;
}

export async function searchRAG(opts: RAGSearchOpts): Promise<RAGChunk[]> {
  const { query, clienteId, sessionId, topK = 5, ftsOnly = false } = opts;
  if (!query || query.trim().length < 3) return [];

  const db = getDb();
  if (!db) return [];

  const results: RAGChunk[] = [];

  // ── 1. Full Text Search ─────────────────────────────────
  try {
    let conditions = sql`to_tsvector('portuguese', chunk_text) @@ websearch_to_tsquery('portuguese', ${query.trim()})`;
    if (clienteId) conditions = sql`${conditions} AND cliente_id = ${clienteId}`;
    if (sessionId) conditions = sql`${conditions} AND session_id = ${sessionId}`;

    const ftsRows = await db.execute(sql`
      SELECT id, document_id, session_id, chunk_text, source, source_filename, page_start, page_end, sheet,
        ts_rank(to_tsvector('portuguese', chunk_text), websearch_to_tsquery('portuguese', ${query.trim()})) as rank
      FROM alix_document_chunk
      WHERE ${conditions}
      ORDER BY rank DESC LIMIT ${topK * 2}
    `);
    const rows = Array.isArray(ftsRows) ? ftsRows : (ftsRows as any).rows || [];
    for (const r of rows) {
      results.push({
        chunkId: Number(r.id), documentId: String(r.document_id),
        sessionId: r.session_id == null ? null : String(r.session_id), chunkText: String(r.chunk_text),
        source: String(r.source), sourceFilename: r.source_filename,
        pageStart: r.page_start == null ? null : Number(r.page_start),
        pageEnd: r.page_end == null ? null : Number(r.page_end),
        sheet: r.sheet == null ? null : String(r.sheet),
        similarity: Number(r.rank) || 0.5,
      });
    }
  } catch (err) {
    console.warn('[RAG] FTS failed:', (err as Error).message);
  }

  // ── 2. Semantic search ──────────────────────────────────
  if (!ftsOnly) {
    try {
      const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
      const dimensions = Number(process.env.OPENAI_EMBEDDING_DIMENSIONS || 1536);
      const embedResult = await embedOpenAI([query], { model: embeddingModel, dimensions });
      const queryVector = embedResult.embeddings[0];
      if (!queryVector) return results.slice(0, topK);

      const storageMode = await getEmbeddingStorageMode();
      if (storageMode === 'vector') {
        const vectorStr = `[${queryVector.join(',')}]`;
        let vecWhere = sql`1=1`;
        if (clienteId) vecWhere = sql`${vecWhere} AND e.cliente_id = ${clienteId}`;
        if (sessionId) vecWhere = sql`${vecWhere} AND c.session_id = ${sessionId}`;

        const vecRows = await db.execute(sql`
          SELECT c.id, c.document_id, c.session_id, c.chunk_text, c.source, c.source_filename, c.page_start, c.page_end, c.sheet,
            1 - (e.embedding <=> ${vectorStr}::vector) as similarity
          FROM alix_document_embedding e
          JOIN alix_document_chunk c ON c.id = e.chunk_id
          WHERE ${vecWhere}
          ORDER BY similarity DESC LIMIT ${topK * 2}
        `);
        const vrows = Array.isArray(vecRows) ? vecRows : (vecRows as any).rows || [];
        for (const r of vrows) {
          results.push({
            chunkId: Number(r.id), documentId: String(r.document_id),
            sessionId: r.session_id == null ? null : String(r.session_id), chunkText: String(r.chunk_text),
            source: String(r.source), sourceFilename: r.source_filename,
            pageStart: r.page_start == null ? null : Number(r.page_start),
            pageEnd: r.page_end == null ? null : Number(r.page_end),
            sheet: r.sheet == null ? null : String(r.sheet),
            similarity: Number(r.similarity) || 0.5,
          });
        }
      } else if (storageMode === 'jsonb') {
        // JSONB fallback: cosine similarity in JS
        let embWhere = sql`1=1`;
        if (clienteId) embWhere = sql`${embWhere} AND e.cliente_id = ${clienteId}`;
        if (sessionId) embWhere = sql`${embWhere} AND c.session_id = ${sessionId}`;

        const embRows = await db.execute(sql`
          SELECT e.chunk_id, e.document_id, e.embedding,
            c.id, c.session_id, c.chunk_text, c.source, c.source_filename, c.page_start, c.page_end, c.sheet
          FROM alix_document_embedding e
          JOIN alix_document_chunk c ON c.id = e.chunk_id
          WHERE ${embWhere}
        `);
        const allEmbeddings = Array.isArray(embRows) ? embRows : (embRows as any).rows || [];

        const scored = allEmbeddings.map((e: any) => ({
          chunkId: Number(e.chunk_id), documentId: String(e.document_id),
          sessionId: e.session_id == null ? null : String(e.session_id),
          chunkText: String(e.chunk_text), source: String(e.source),
          sourceFilename: e.source_filename,
          pageStart: e.page_start == null ? null : Number(e.page_start),
          pageEnd: e.page_end == null ? null : Number(e.page_end),
          sheet: e.sheet == null ? null : String(e.sheet),
          similarity: cosineSimilarity(queryVector, parseEmbedding(e.embedding)),
        }));
        scored.sort((a: any, b: any) => b.similarity - a.similarity);

        for (const s of scored.slice(0, topK * 2)) {
          results.push({
            chunkId: s.chunkId, documentId: s.documentId, sessionId: s.sessionId, chunkText: s.chunkText,
            source: s.source, sourceFilename: s.sourceFilename, pageStart: s.pageStart,
            pageEnd: s.pageEnd, sheet: s.sheet, similarity: s.similarity,
          });
        }
      }
    } catch (err) {
      console.warn('[RAG] semantic search failed:', (err as Error).message);
    }
  }

  // Deduplicar e reordenar
  const seen = new Set<number>();
  const unique: RAGChunk[] = [];
  for (const r of results.sort((a, b) => b.similarity - a.similarity)) {
    if (!seen.has(r.chunkId)) {
      seen.add(r.chunkId);
      unique.push(r);
      if (unique.length >= topK) break;
    }
  }
  return unique;
}

export function formatRAGContext(chunks: RAGChunk[]): string {
  if (chunks.length === 0) return '';
  const lines = ['**DOCUMENTOS RELEVANTES ENCONTRADOS:**'];
  for (const c of chunks) {
    const page = c.pageStart ? `p.${c.pageStart}${c.pageEnd && c.pageEnd !== c.pageStart ? `–${c.pageEnd}` : ''}` : '';
    const sheet = c.sheet ? `aba ${c.sheet}` : '';
    const loc = [c.sourceFilename || c.source, page, sheet].filter(Boolean).join(' · ');
    lines.push(`- [${loc}] ${c.chunkText.slice(0, 400)}`);
  }
  return lines.join('\n');
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function parseEmbedding(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Ingestão: chunka um documento, gera embeddings e salva. */
export async function ingestDocumentForRAG(
  documentId: string, text: string,
  opts: {
    clienteId?: string;
    sessionId?: string;
    source?: string;
    sourceFilename?: string;
    chunkSize?: number;
    chunkOverlap?: number;
    chunks?: RAGIngestChunk[];
  } = {},
): Promise<RAGIngestResult> {
  const db = getDb();
  if (!db) throw new Error('PostgreSQL indisponível para indexação RAG');
  const { clienteId, sessionId, source = 'upload', sourceFilename, chunkSize = 1_600, chunkOverlap = 240 } = opts;
  const prepared: RAGIngestChunk[] = opts.chunks?.length
    ? opts.chunks
      .map((chunk) => ({ ...chunk, text: chunk.text.replace(/\s+/g, ' ').trim() }))
      .filter((chunk) => chunk.text.length > 0)
    : chunkText(text, chunkSize, chunkOverlap).map((chunk) => ({ text: chunk }));
  if (prepared.length === 0) throw new Error('Documento sem texto utilizável para indexação RAG');

  const contentHash = ragContentHash(prepared);
  const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  const dimensions = Number(process.env.OPENAI_EMBEDDING_DIMENSIONS || 1536);
  if (!Number.isInteger(dimensions) || dimensions < 256 || dimensions > 3_072) {
    throw new Error('OPENAI_EMBEDDING_DIMENSIONS inválido');
  }

  const batchSize = Math.max(1, Math.min(100, Number(process.env.ALIX_EMBEDDING_BATCH_SIZE || 64)));
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < prepared.length; i += batchSize) {
    const result = await embedOpenAI(prepared.slice(i, i + batchSize).map((chunk) => chunk.text), {
      model: embeddingModel,
      dimensions,
    });
    allEmbeddings.push(...result.embeddings);
  }
  if (allEmbeddings.length !== prepared.length) {
    throw new Error(`Quantidade de embeddings divergente: ${allEmbeddings.length}/${prepared.length}`);
  }
  const storageMode = await getEmbeddingStorageMode();
  if (storageMode === 'none') throw new Error('Armazenamento de embeddings indisponivel')

  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM alix_document_embedding WHERE document_id = ${documentId}`)
    await tx.execute(sql`DELETE FROM alix_document_chunk WHERE document_id = ${documentId}`)
    const inserted = await tx.insert(alixDocumentChunk).values(prepared.map((chunk, index) => ({
      documentId, clienteId, sessionId, source, sourceFilename,
      pageStart: chunk.pageStart ?? null,
      pageEnd: chunk.pageEnd ?? null,
      sheet: chunk.sheet ?? null,
      chunkText: chunk.text,
      chunkIndex: index,
      chunkSize: chunk.text.length,
      contentHash,
      indexedAt: new Date(),
      metadata: chunk.metadata || {},
    }))).returning({ id: alixDocumentChunk.id, chunkIndex: alixDocumentChunk.chunkIndex })
    const chunkIds = new Map(inserted.map((row) => [row.chunkIndex, row.id]))

    for (let i = 0; i < prepared.length; i++) {
      const chunkId = chunkIds.get(i)
      const embedding = allEmbeddings[i] ?? []
      if (!chunkId || embedding.length === 0) throw new Error(`Embedding ausente para o bloco ${i}`)
      if (storageMode === 'vector') {
        const vectorStr = `[${embedding.join(',')}]`
        await tx.execute(sql`
          INSERT INTO alix_document_embedding
            (chunk_id, document_id, cliente_id, embedding_model, embedding, dimensions)
          VALUES
            (${chunkId}, ${documentId}, ${clienteId ?? null}, ${embeddingModel}, ${vectorStr}::vector, ${embedding.length})
        `)
      } else {
        const embeddingJson = JSON.stringify(embedding)
        await tx.execute(sql`
          INSERT INTO alix_document_embedding
            (chunk_id, document_id, cliente_id, embedding_model, embedding, dimensions)
          VALUES
            (${chunkId}, ${documentId}, ${clienteId ?? null}, ${embeddingModel}, ${embeddingJson}::jsonb, ${embedding.length})
        `)
      }
    }
  })

  return {
    documentId,
    contentHash,
    embeddingModel,
    dimensions,
    chunkCount: prepared.length,
    embeddingCount: allEmbeddings.length,
  };
}

export function chunkText(text: string, size: number, overlap: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
  if (!normalized) return []
  const safeSize = Math.max(200, Math.floor(size))
  const safeOverlap = Math.max(0, Math.min(Math.floor(overlap), Math.floor(safeSize / 3)))
  const chunks: string[] = []
  let cursor = 0
  while (cursor < normalized.length) {
    const target = Math.min(cursor + safeSize, normalized.length)
    let end = target
    if (target < normalized.length) {
      const minimum = cursor + Math.floor(safeSize * 0.6)
      const paragraphBreak = normalized.lastIndexOf('\n\n', target)
      const lineBreak = normalized.lastIndexOf('\n', target)
      const wordBreak = normalized.lastIndexOf(' ', target)
      const candidate = Math.max(paragraphBreak, lineBreak, wordBreak)
      if (candidate >= minimum) end = candidate
    }
    const chunk = normalized.slice(cursor, end).trim()
    if (chunk) chunks.push(chunk)
    if (end >= normalized.length) break
    const next = Math.max(cursor + 1, end - safeOverlap)
    cursor = next
    while (cursor < normalized.length && /\s/.test(normalized[cursor])) cursor++
  }
  return chunks
}
