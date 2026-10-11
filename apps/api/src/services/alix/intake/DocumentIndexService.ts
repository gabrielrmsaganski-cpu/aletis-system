// ============================================================
// ALETIS — Alix Document Index / RAG
// Índice documental por sessão/cliente com chunks, evidências,
// páginas, tabelas, entidades, fonte e confiança. Postgres é a
// fonte principal quando habilitado; disco fica como cache/artefato.
// ============================================================

import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { join } from 'path'

import { getPool, isPgEnabled } from '../../../db/client.js'
import { completeDocumentChunks } from './DocumentCorpus.js'
import type {
  DocumentChunk,
  DocumentEvidence,
  DocumentIndexRecord,
  IngestedDocument,
  TablePreview,
} from './types.js'

function safeSegment(value: string, fallback = 'anon'): string {
  const safe = (value || fallback).replace(/[^A-Za-z0-9_.-]/g, '_').trim()
  return safe || fallback
}

function normalizeText(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim()
}

function splitText(text: string, maxChars = 3200, overlap = 250): string[] {
  const clean = normalizeText(text)
  if (!clean) return []
  if (clean.length <= maxChars) return [clean]

  const chunks: string[] = []
  let start = 0
  while (start < clean.length) {
    const hardEnd = Math.min(clean.length, start + maxChars)
    let end = hardEnd
    const sentenceBreak = clean.lastIndexOf('. ', hardEnd)
    if (sentenceBreak > start + maxChars * 0.55) end = sentenceBreak + 1
    chunks.push(clean.slice(start, end).trim())
    if (end >= clean.length) break
    start = Math.max(0, end - overlap)
  }
  return chunks.filter(Boolean)
}

function tableToText(table: TablePreview): string {
  const rows = table.rows.slice(0, 20)
  const header = table.headers.join(' | ')
  const body = rows.map((row) => row.join(' | ')).join('\n')
  return normalizeText([`Aba: ${table.sheet}`, header, body].filter(Boolean).join('\n'))
}

function entityToText(entity: unknown): { type?: string; text: string; confidence?: number } {
  if (!entity || typeof entity !== 'object') return { text: String(entity ?? '') }
  const rec = entity as Record<string, unknown>
  const type =
    typeof rec.tipo === 'string' ? rec.tipo :
    typeof rec.type === 'string' ? rec.type :
    typeof rec.categoria === 'string' ? rec.categoria :
    undefined
  const confidence =
    typeof rec.confianca === 'number' ? rec.confianca :
    typeof rec.confidence === 'number' ? rec.confidence :
    undefined
  return { type, text: JSON.stringify(rec), confidence }
}

function tokens(query: string): string[] {
  return normalizeText(query)
    .toLowerCase()
    .split(/[^a-z0-9áàâãéêíóôõúüç]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
}

function scoreText(text: string, query: string, queryTokens: string[]): number {
  const haystack = normalizeText(text).toLowerCase()
  if (!haystack) return 0
  let score = haystack.includes(query.toLowerCase()) ? 5 : 0
  for (const token of queryTokens) {
    if (haystack.includes(token)) score += 1
  }
  return score
}

export interface DocumentSearchHit {
  documentId: string
  filename: string
  sessionId: string
  clienteId?: string
  chunkId: string
  text: string
  source: string
  page?: number
  sheet?: string
  table?: string
  kind: DocumentChunk['kind']
  confidence?: number
  score: number
  evidences: DocumentEvidence[]
}

export interface DocumentSearchOptions {
  sessionId: string
  clienteId?: string
  query: string
  limit?: number
  documentId?: string
}

export class DocumentIndexService {
  private pgReady = false

  constructor(private readonly storageDir: string) {}

  private sessionDir(sessionId: string): string {
    return join(this.storageDir, safeSegment(sessionId))
  }

  private async ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true })
  }

  private async ensurePg(): Promise<void> {
    if (!isPgEnabled() || this.pgReady) return
    const pool = getPool()
    await pool.query(`
      create table if not exists alix_document_index (
        id text primary key,
        session_id text not null,
        cliente_id text,
        document_id text not null,
        filename text not null,
        kind text not null,
        payload jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `)
    await pool.query(`create index if not exists idx_alix_document_index_session on alix_document_index(session_id)`)
    await pool.query(`create index if not exists idx_alix_document_index_cliente on alix_document_index(cliente_id)`)
    await pool.query(`create index if not exists idx_alix_document_index_document on alix_document_index(document_id)`)
    this.pgReady = true
  }

  buildIndex(doc: IngestedDocument): DocumentIndexRecord {
    const evidences: DocumentEvidence[] = [...(doc.evidences ?? [])]
    const chunks: DocumentChunk[] = completeDocumentChunks(doc)
    let ordinal = chunks.length

    if (chunks.length === 0 && doc.extractedText) {
      const evidence: DocumentEvidence = {
        id: randomUUID(),
        kind: 'text',
        source: `${doc.kind}:document:text`,
        text: doc.extractedText,
        confidence: 0.75,
      }
      evidences.push(evidence)
      for (const text of splitText(doc.extractedText)) {
        chunks.push({
          id: randomUUID(),
          ordinal,
          kind: 'text',
          text,
          source: evidence.source,
          confidence: evidence.confidence,
          evidenceIds: [evidence.id],
        })
        ordinal += 1
      }
    }

    const tables = Array.isArray(doc.metadata?.tablePreviews)
      ? doc.metadata.tablePreviews as TablePreview[]
      : []
    for (const table of tables) {
      const text = tableToText(table)
      if (!text) continue
      const evidence: DocumentEvidence = {
        id: randomUUID(),
        kind: 'table',
        source: `${doc.kind}:sheet:${table.sheet}:preview`,
        text,
        sheet: table.sheet,
        table: table.sheet,
        confidence: 0.9,
      }
      evidences.push(evidence)
      chunks.push({
        id: randomUUID(),
        ordinal,
        kind: 'table',
        text,
        source: evidence.source,
        sheet: table.sheet,
        table: table.sheet,
        confidence: evidence.confidence,
        evidenceIds: [evidence.id],
      })
      ordinal += 1
    }

    const entities = Array.isArray(doc.metadata?.entities) ? doc.metadata.entities : []
    for (const entity of entities) {
      const parsed = entityToText(entity)
      if (!parsed.text) continue
      const evidence: DocumentEvidence = {
        id: randomUUID(),
        kind: 'entity',
        source: `${doc.kind}:entity:${parsed.type ?? 'unknown'}`,
        text: parsed.text,
        entityType: parsed.type,
        confidence: parsed.confidence ?? 0.7,
      }
      evidences.push(evidence)
      chunks.push({
        id: randomUUID(),
        ordinal,
        kind: 'entity',
        text: parsed.text,
        source: evidence.source,
        confidence: evidence.confidence,
        evidenceIds: [evidence.id],
        metadata: { entityType: parsed.type },
      })
      ordinal += 1
    }

    const confidenceValues = chunks
      .map((c) => c.confidence)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    const confidence = confidenceValues.length
      ? confidenceValues.reduce((sum, v) => sum + v, 0) / confidenceValues.length
      : undefined

    return {
      documentId: doc.id,
      sessionId: doc.sessionId,
      clienteId: doc.clienteId,
      filename: doc.filename,
      kind: doc.kind,
      createdAt: doc.uploadedAt,
      source: {
        mimetype: doc.mimetype,
        sizeBytes: doc.sizeBytes,
        sha256: typeof doc.metadata?.sha256 === 'string' ? doc.metadata.sha256 : undefined,
      },
      chunks,
      evidences,
      entities,
      tables,
      confidence,
    }
  }

  async indexDocument(doc: IngestedDocument): Promise<DocumentIndexRecord> {
    const index = this.buildIndex(doc)
    await this.persist(index)
    return index
  }

  async persist(index: DocumentIndexRecord): Promise<void> {
    if (isPgEnabled()) {
      try {
        await this.ensurePg()
        await getPool().query(
          `
            insert into alix_document_index (
              id, session_id, cliente_id, document_id, filename, kind, payload, created_at, updated_at
            )
            values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz, now())
            on conflict (id) do update set
              session_id = excluded.session_id,
              cliente_id = excluded.cliente_id,
              document_id = excluded.document_id,
              filename = excluded.filename,
              kind = excluded.kind,
              payload = excluded.payload,
              updated_at = now()
          `,
          [
            index.documentId,
            index.sessionId,
            index.clienteId ?? null,
            index.documentId,
            index.filename,
            index.kind,
            JSON.stringify(index),
            index.createdAt,
          ],
        )
      } catch (err) {
        throw err
      }
    }

    const dir = this.sessionDir(index.sessionId)
    await this.ensureDir(dir)
    await fs.writeFile(join(dir, `${safeSegment(index.documentId, 'document')}.json`), JSON.stringify(index, null, 2), 'utf-8')
  }

  async get(sessionId: string, documentId: string): Promise<DocumentIndexRecord | null> {
    if (isPgEnabled()) {
      try {
        await this.ensurePg()
        const res = await getPool().query(
          `select payload from alix_document_index where session_id = $1 and document_id = $2 limit 1`,
          [sessionId, documentId],
        )
        const payload = res.rows[0]?.payload
        return payload ? payload as DocumentIndexRecord : null
      } catch (err) {
        throw err
      }
    }

    try {
      const raw = await fs.readFile(join(this.sessionDir(sessionId), `${safeSegment(documentId, 'document')}.json`), 'utf-8')
      return JSON.parse(raw) as DocumentIndexRecord
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e?.code === 'ENOENT') return null
      throw err
    }
  }

  private async listIndexes(sessionId: string, clienteId?: string): Promise<DocumentIndexRecord[]> {
    if (isPgEnabled()) {
      try {
        await this.ensurePg()
        const params: unknown[] = [sessionId]
        let clause = 'session_id = $1'
        if (clienteId) {
          params.push(clienteId)
          clause += ' and cliente_id = $2'
        }
        const res = await getPool().query(
          `select payload from alix_document_index where ${clause} order by created_at desc`,
          params,
        )
        return res.rows.map((r) => r.payload as DocumentIndexRecord)
      } catch (err) {
        throw err
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

    const indexes: DocumentIndexRecord[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await fs.readFile(join(dir, file), 'utf-8')
        const index = JSON.parse(raw) as DocumentIndexRecord
        if (!clienteId || index.clienteId === clienteId) indexes.push(index)
      } catch {
        // cache corrompido não deve bloquear busca.
      }
    }
    return indexes.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }

  async search(opts: DocumentSearchOptions): Promise<DocumentSearchHit[]> {
    const query = normalizeText(opts.query)
    if (!query) return []
    const queryTokens = tokens(query)
    if (queryTokens.length === 0) return []
    const indexes = await this.listIndexes(opts.sessionId, opts.clienteId)
    const hits: DocumentSearchHit[] = []

    for (const index of indexes) {
      if (opts.documentId && index.documentId !== opts.documentId) continue
      const evidenceById = new Map(index.evidences.map((e) => [e.id, e]))
      for (const chunk of index.chunks) {
        const score = scoreText(chunk.text, query, queryTokens)
        if (score <= 0) continue
        hits.push({
          documentId: index.documentId,
          filename: index.filename,
          sessionId: index.sessionId,
          clienteId: index.clienteId,
          chunkId: chunk.id,
          text: chunk.text,
          source: chunk.source,
          page: chunk.pageStart,
          sheet: chunk.sheet,
          table: chunk.table,
          kind: chunk.kind,
          confidence: chunk.confidence,
          score,
          evidences: chunk.evidenceIds
            .map((id) => evidenceById.get(id))
            .filter((e): e is DocumentEvidence => Boolean(e)),
        })
      }
    }

    return hits
      .sort((a, b) => b.score - a.score || (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, Math.max(1, Math.min(opts.limit ?? 8, 30)))
  }

  async remove(sessionId: string, documentId: string): Promise<void> {
    if (isPgEnabled()) {
      try {
        await this.ensurePg()
        await getPool().query(
          `delete from alix_document_index where session_id = $1 and document_id = $2`,
          [sessionId, documentId],
        )
      } catch (err) {
        throw err
      }
    }
    await fs.rm(join(this.sessionDir(sessionId), `${safeSegment(documentId, 'document')}.json`), { force: true })
  }
}

let singleton: DocumentIndexService | null = null

export function getDocumentIndexService(): DocumentIndexService {
  if (singleton) return singleton
  singleton = new DocumentIndexService(join(process.cwd(), 'storage', 'alix-document-index'))
  return singleton
}
