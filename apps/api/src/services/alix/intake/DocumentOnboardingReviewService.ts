// ============================================================
// ALETIS — revisão documental para onboarding CRM
//
// Não cria cliente. Monta um pré-cadastro auditável com campos,
// lacunas e evidências para a ALIX/HITL decidir sem alucinar.
// Postgres é a fonte principal quando habilitado; disco é cache.
// ============================================================

import { randomUUID } from 'crypto'
import { buildDocumentFinancialReview, documentMoney, documentMoneyMatches } from '../crm/DocumentFinancialReview.js'
import type { DocumentFinancialReview } from '@aletis/shared-types'
import { promises as fs } from 'fs'
import { join } from 'path'

import { getPool, isPgEnabled } from '../../../db/client.js'
import { isValidCpfCnpj, normalizeCpfCnpj } from '../../../db/ClienteRepository.js'
import type { DocumentEvidence, IngestedDocument } from './types.js'
import type { DocumentExtractionResult, DocumentEvidence as SmartDocumentEvidence } from '@aletis/shared-types'

export type DocumentOnboardingReviewStatus =
  | 'needs_review'
  | 'ready_for_hitl'
  | 'blocked_duplicate'
  | 'dismissed'
  | 'converted'

export interface CandidateEvidence {
  field: string
  value?: unknown
  source: string
  text: string
  page?: number
  sheet?: string
  table?: string
  confidence?: number
}

export interface DocumentOnboardingCandidate {
  documentoId: string
  sessionId: string
  filename: string
  candidate: {
    nome?: string
    cpfCnpj?: string
    tipoPessoa?: 'PF' | 'PJ'
    cidade?: string
    uf?: string
    email?: string
    telefone?: string
    dividaTotal?: string
    bancos: string[]
    estrategia?: string
  }
  missingFields: string[]
  evidence: CandidateEvidence[]
  confidence: number
  ready: boolean
  reason: string
  revisaoFinanceira?: DocumentFinancialReview
}

export interface DocumentOnboardingReview extends DocumentOnboardingCandidate {
  id: string
  status: DocumentOnboardingReviewStatus
  duplicateCliente?: { id?: string; nome?: string; cpfCnpj?: string }
  createdAt: string
  updatedAt: string
}

function safeSegment(value: string, fallback = 'anon'): string {
  const safe = (value || fallback).replace(/[^A-Za-z0-9_.-]/g, '_').trim()
  return safe || fallback
}

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function confidenceOf(entity: Record<string, unknown> | null | undefined, fallback?: number): number | undefined {
  const raw = entity?.confianca ?? entity?.confidence ?? fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return undefined
  return Math.max(0, Math.min(1, n))
}

function entityText(entity: Record<string, unknown>): string {
  return [
    entity.categoria,
    entity.descricao,
    entity.nome,
    entity.fonte,
    entity.source,
  ].map(cleanText).filter(Boolean).join(' ')
}

function findSourceEvidence(doc: IngestedDocument, entity: Record<string, unknown>, fallbackField: string): DocumentEvidence | null {
  const fonte = cleanText(entity.fonte ?? entity.source)
  if (fonte) {
    const needle = fonte.slice(0, 120)
    const direct = (doc.evidences ?? []).find((ev) => cleanText(ev.text).includes(needle))
    if (direct) return direct
  }
  const value = cleanText(entity.nome ?? entity.cpfCnpj ?? entity.valor ?? entity.descricao)
  if (value) {
    const direct = (doc.evidences ?? []).find((ev) => cleanText(ev.text).includes(value))
    if (direct) return direct
  }
  return (doc.evidences ?? []).find((ev) => ev.kind === 'entity' && ev.entityType === fallbackField) ?? null
}

function toEvidence(
  doc: IngestedDocument,
  field: string,
  value: unknown,
  entity: Record<string, unknown>,
): CandidateEvidence {
  const ev = findSourceEvidence(doc, entity, field)
  const text = cleanText(entity.fonte ?? entity.source ?? ev?.text ?? entity.descricao ?? entity.nome ?? value)
  return {
    field,
    value,
    source: ev?.source ?? `${doc.kind}:entity:${field}`,
    text: text.slice(0, 500),
    page: ev?.page,
    sheet: ev?.sheet,
    table: ev?.table,
    confidence: confidenceOf(entity, ev?.confidence),
  }
}

function extractUf(value: string): string | undefined {
  const match = value.match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/i)
  return match ? match[1].toUpperCase() : undefined
}

function extractCidade(value: string, uf?: string): string | undefined {
  if (!uf) return undefined
  const escapedUf = uf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = value.match(new RegExp(`([A-Za-zÀ-ÿ .'/-]{3,60})\\s*[-/]\\s*${escapedUf}\\b`, 'i'))
  if (!match) return undefined
  const cidade = cleanText(match[1]).replace(/^(cidade|município|municipio)\s*[:,-]?\s*/i, '').trim()
  return cidade.length >= 3 ? cidade : undefined
}

function isDebtValue(entity: Record<string, unknown>): boolean {
  const text = entityText(entity)
  return /d[ií]vida|d[ée]bito|saldo|passivo|valor\s+(total|atualizado)|renegocia|pgfn|credor|banco|contrato/i.test(text)
}

function chooseIdentity(entities: Record<string, unknown>[]): Record<string, unknown> | null {
  const people = entities.filter((e) => e.tipo === 'pessoa' || e.tipo === 'empresa')
  if (people.length === 0) return null
  return [...people].sort((a, b) => {
    const aCpf = isValidCpfCnpj(normalizeCpfCnpj(a.cpfCnpj)) ? 1 : 0
    const bCpf = isValidCpfCnpj(normalizeCpfCnpj(b.cpfCnpj)) ? 1 : 0
    return bCpf - aCpf || (confidenceOf(b) ?? 0) - (confidenceOf(a) ?? 0)
  })[0] ?? null
}

function smartExtractionOf(doc: IngestedDocument): DocumentExtractionResult | null {
  const raw = doc.metadata?.smartExtraction
  if (!raw || typeof raw !== 'object') return null
  const extraction = raw as Partial<DocumentExtractionResult>
  if (!extraction.clienteData || typeof extraction.clienteData !== 'object') return null
  return extraction as DocumentExtractionResult
}

function smartEvidenceToCandidate(
  doc: IngestedDocument,
  evidence: SmartDocumentEvidence,
): CandidateEvidence {
  return {
    field: evidence.field,
    value: evidence.value,
    source: evidence.fonte || `${doc.kind}:smart:${evidence.field}`,
    text: cleanText(evidence.trecho || evidence.fonte || evidence.value).slice(0, 500),
    page: evidence.page,
    confidence: confidenceOf({ confianca: evidence.confianca }),
  }
}

function firstSmartEvidence(
  extraction: DocumentExtractionResult,
  field: string,
  fallbackValue?: unknown,
): SmartDocumentEvidence {
  const evidencias = Array.isArray(extraction.evidencias) ? extraction.evidencias : []
  return evidencias.find((ev) => ev.field === field)
    ?? {
      field,
      value: fallbackValue,
      fonte: `smartExtraction:${field}`,
      trecho: cleanText(fallbackValue),
      confianca: extraction.confianca,
    }
}

function buildSmartDocumentOnboardingCandidate(doc: IngestedDocument): DocumentOnboardingCandidate | null {
  const extraction = smartExtractionOf(doc)
  if (!extraction) return null
  const cd = extraction.clienteData
  const dividas = Array.isArray(extraction.dividas) ? extraction.dividas : []
  const entidades = Array.isArray(extraction.entidades) ? extraction.entidades : []
  const candidate: DocumentOnboardingCandidate['candidate'] = {
    bancos: Array.from(new Set(dividas.map((d) => cleanText(d.credor)).filter(Boolean))).slice(0, 5),
  }
  const evidence: CandidateEvidence[] = []

  const nome = cleanText(cd.nome)
  if (nome) {
    candidate.nome = nome
    evidence.push(smartEvidenceToCandidate(doc, firstSmartEvidence(extraction, 'nome', nome)))
  }
  const cpfCnpj = normalizeCpfCnpj(cd.cpfCnpj)
  if (isValidCpfCnpj(cpfCnpj)) {
    candidate.cpfCnpj = cpfCnpj
    candidate.tipoPessoa = cd.tipoPessoa ?? (cpfCnpj.length === 14 ? 'PJ' : 'PF')
    evidence.push(smartEvidenceToCandidate(doc, firstSmartEvidence(extraction, 'cpfCnpj', cpfCnpj)))
  }
  if (cd.cidade) {
    candidate.cidade = cd.cidade
    evidence.push(smartEvidenceToCandidate(doc, firstSmartEvidence(extraction, 'cidade', cd.cidade)))
  }
  if (cd.uf) {
    candidate.uf = cd.uf
    evidence.push(smartEvidenceToCandidate(doc, firstSmartEvidence(extraction, 'uf', cd.uf)))
  }
  if (cd.email) {
    candidate.email = cd.email
    evidence.push(smartEvidenceToCandidate(doc, firstSmartEvidence(extraction, 'email', cd.email)))
  }
  if (cd.telefone) {
    candidate.telefone = cd.telefone
    evidence.push(smartEvidenceToCandidate(doc, firstSmartEvidence(extraction, 'telefone', cd.telefone)))
  }
  const revisaoFinanceira = buildDocumentFinancialReview(dividas.map(d => ({ ...d })), extraction.evidencias)
  const dividaTotal = revisaoFinanceira.saldoAtualTotalComprovado
  if (dividaTotal !== undefined) {
    candidate.dividaTotal = dividaTotal
    const totalEvidence = extraction.evidencias.filter(ev => /^(?:dividaTotal|valorTotalDivida|saldoDevedorTotal|saldoAtualTotal)$/i.test(ev.field)
      && documentMoneyMatches(ev.trecho, dividaTotal, 'global_current'))
    evidence.push(...totalEvidence.map(ev => smartEvidenceToCandidate(doc, ev)))
  }
  for (const banco of candidate.bancos) {
    evidence.push(smartEvidenceToCandidate(doc, firstSmartEvidence(extraction, 'banco', banco)))
  }
  if (candidate.bancos.length > 0 || candidate.dividaTotal) {
    candidate.estrategia = extraction.acoesSugeridas[0] ?? 'Renegociação com base nos dados extraídos do documento'
  }

  const missingFields = Array.from(new Set([
    ...(!candidate.nome ? ['nome'] : []),
    ...(candidate.dividaTotal === undefined ? ['dividaTotal'] : []),
    ...(extraction.confianca > 0 && extraction.confianca < 0.65 ? ['confiancaDocumental'] : []),
  ]))
  const hasSignal = evidence.length > 0 || entidades.length > 0 || dividas.length > 0
  if (!hasSignal) return null

  return {
    documentoId: doc.id,
    sessionId: doc.sessionId,
    filename: doc.filename,
    candidate,
    revisaoFinanceira,
    missingFields,
    evidence,
    confidence: Math.max(0, Math.min(1, extraction.confianca)),
    ready: missingFields.length === 0,
    reason: missingFields.length === 0
      ? 'Smart extraction encontrou campos mínimos para HITL de onboarding completo.'
      : `Smart extraction precisa de revisão: ${missingFields.join(', ')}.`,
  }
}

export function buildDocumentOnboardingCandidate(doc: IngestedDocument): DocumentOnboardingCandidate | null {
  const smartCandidate = buildSmartDocumentOnboardingCandidate(doc)
  if (smartCandidate) return smartCandidate

  const entities = Array.isArray(doc.metadata?.entities)
    ? (doc.metadata.entities as Record<string, unknown>[])
    : []
  const evidence: CandidateEvidence[] = []
  const candidate: DocumentOnboardingCandidate['candidate'] = { bancos: [] }

  const identity = chooseIdentity(entities)
  if (identity) {
    const nome = cleanText(identity.nome)
    const cpfCnpj = normalizeCpfCnpj(identity.cpfCnpj)
    if (nome) {
      candidate.nome = nome
      evidence.push(toEvidence(doc, 'nome', nome, identity))
    }
    if (isValidCpfCnpj(cpfCnpj)) {
      candidate.cpfCnpj = cpfCnpj
      candidate.tipoPessoa = cpfCnpj.length === 14 ? 'PJ' : 'PF'
      evidence.push(toEvidence(doc, 'cpfCnpj', cpfCnpj, identity))
    }
    const endereco = cleanText(identity.endereco)
    const uf = extractUf(endereco)
    if (uf) {
      candidate.uf = uf
      evidence.push(toEvidence(doc, 'uf', uf, identity))
    }
    const cidade = extractCidade(endereco, uf)
    if (cidade) {
      candidate.cidade = cidade
      evidence.push(toEvidence(doc, 'cidade', cidade, identity))
    }
    const email = cleanText(identity.email)
    if (email) {
      candidate.email = email
      evidence.push(toEvidence(doc, 'email', email, identity))
    }
    const telefone = cleanText(identity.telefone)
    if (telefone) {
      candidate.telefone = telefone
      evidence.push(toEvidence(doc, 'telefone', telefone, identity))
    }
  }

  const bancos = entities
    .filter((e) => e.tipo === 'banco' && cleanText(e.nome))
    .sort((a, b) => (confidenceOf(b) ?? 0) - (confidenceOf(a) ?? 0))
    .map((e) => cleanText(e.nome))
  candidate.bancos = Array.from(new Set(bancos)).slice(0, 5)
  for (const banco of candidate.bancos) {
    const ent = entities.find((e) => cleanText(e.nome) === banco)
    if (ent) evidence.push(toEvidence(doc, 'banco', banco, ent))
  }

  const debtValues = entities.filter(e => e.tipo === 'valor' && isDebtValue(e)
    && documentMoney(e.valor) !== undefined && documentMoneyMatches(e.fonte ?? e.source, e.valor, 'global_current'))
  const totals = new Set(debtValues.map(e => documentMoney(e.valor)!))
  if (totals.size === 1) {
    const debt = debtValues[0]
    candidate.dividaTotal = documentMoney(debt.valor)
    evidence.push(toEvidence(doc, 'dividaTotal', candidate.dividaTotal, debt))
  }

  if (candidate.bancos.length > 0 || candidate.dividaTotal) {
    candidate.estrategia = 'Renegociação com base nos dados extraídos do documento'
  }

  const missingFields: string[] = []
  if (!candidate.nome) missingFields.push('nome')
  if (candidate.dividaTotal === undefined) missingFields.push('dividaTotal')

  const requiredEvidence = evidence.filter((ev) => ['nome', 'dividaTotal'].includes(ev.field))
  const confidenceValues = requiredEvidence
    .map((ev) => ev.confidence)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  const confidence = confidenceValues.length
    ? confidenceValues.reduce((sum, n) => sum + n, 0) / confidenceValues.length
    : 0
  if (confidence > 0 && confidence < 0.65) missingFields.push('confiancaDocumental')

  const hasSignal = evidence.length > 0 || entities.length > 0
  if (!hasSignal) return null

  return {
    documentoId: doc.id,
    sessionId: doc.sessionId,
    filename: doc.filename,
    candidate,
    missingFields: Array.from(new Set(missingFields)),
    evidence,
    confidence,
    ready: missingFields.length === 0,
    reason: missingFields.length === 0
      ? 'Documento tem campos mínimos para HITL de onboarding completo.'
      : `Documento precisa de revisão: ${Array.from(new Set(missingFields)).join(', ')}.`,
  }
}

export class DocumentOnboardingReviewService {
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
      create table if not exists alix_document_onboarding_review (
        id text primary key,
        session_id text not null,
        document_id text not null,
        status text not null,
        payload jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `)
    await pool.query(`create index if not exists idx_alix_doc_onboarding_review_session on alix_document_onboarding_review(session_id)`)
    await pool.query(`create index if not exists idx_alix_doc_onboarding_review_status on alix_document_onboarding_review(status)`)
    await pool.query(`create index if not exists idx_alix_doc_onboarding_review_document on alix_document_onboarding_review(document_id)`)
    this.pgReady = true
  }

  async createFromDocument(
    doc: IngestedDocument,
    opts: {
      status?: DocumentOnboardingReviewStatus
      duplicateCliente?: DocumentOnboardingReview['duplicateCliente']
    } = {},
  ): Promise<DocumentOnboardingReview | null> {
    const candidate = buildDocumentOnboardingCandidate(doc)
    if (!candidate) return null
    const now = new Date().toISOString()
    const review: DocumentOnboardingReview = {
      ...candidate,
      id: `docrev_${doc.id}`,
      status: opts.status ?? (candidate.ready ? 'ready_for_hitl' : 'needs_review'),
      duplicateCliente: opts.duplicateCliente,
      createdAt: now,
      updatedAt: now,
    }
    await this.persist(review)
    return review
  }

  async get(id: string, sessionId?: string): Promise<DocumentOnboardingReview | null> {
    if (isPgEnabled()) {
      try {
        await this.ensurePg()
        const params = sessionId ? [id, sessionId] : [id]
        const res = await getPool().query(
          `select payload from alix_document_onboarding_review where id = $1${sessionId ? ' and session_id = $2' : ''} limit 1`,
          params,
        )
        const payload = res.rows[0]?.payload
        if (payload) return payload as DocumentOnboardingReview
      } catch (err) {
        console.warn('[DocumentOnboardingReviewService] PG get falhou:', (err as Error).message)
      }
    }

    if (sessionId) {
      try {
        const raw = await fs.readFile(join(this.sessionDir(sessionId), `${safeSegment(id, 'review')}.json`), 'utf-8')
        return JSON.parse(raw) as DocumentOnboardingReview
      } catch (err) {
        const e = err as NodeJS.ErrnoException
        if (e?.code !== 'ENOENT') throw err
      }
    }
    const reviews = await this.list(sessionId ? { sessionId } : {})
    return reviews.find((r) => r.id === id) ?? null
  }

  async persist(review: DocumentOnboardingReview): Promise<void> {
    if (isPgEnabled()) {
      try {
        await this.ensurePg()
        await getPool().query(
          `
            insert into alix_document_onboarding_review (
              id, session_id, document_id, status, payload, created_at, updated_at
            )
            values ($1, $2, $3, $4, $5::jsonb, $6::timestamptz, $7::timestamptz)
            on conflict (id) do update set
              session_id = excluded.session_id,
              document_id = excluded.document_id,
              status = excluded.status,
              payload = excluded.payload,
              updated_at = excluded.updated_at
          `,
          [
            review.id,
            review.sessionId,
            review.documentoId,
            review.status,
            JSON.stringify(review),
            review.createdAt,
            review.updatedAt,
          ],
        )
      } catch (err) {
        console.warn('[DocumentOnboardingReviewService] PG persist falhou:', (err as Error).message)
      }
    }

    const dir = this.sessionDir(review.sessionId)
    await this.ensureDir(dir)
    await fs.writeFile(join(dir, `${safeSegment(review.id, randomUUID())}.json`), JSON.stringify(review, null, 2), 'utf-8')
  }

  async list(opts: { sessionId?: string; status?: DocumentOnboardingReviewStatus } = {}): Promise<DocumentOnboardingReview[]> {
    if (isPgEnabled()) {
      try {
        await this.ensurePg()
        const params: unknown[] = []
        const where: string[] = []
        if (opts.sessionId) {
          params.push(opts.sessionId)
          where.push(`session_id = $${params.length}`)
        }
        if (opts.status) {
          params.push(opts.status)
          where.push(`status = $${params.length}`)
        }
        const res = await getPool().query(
          `select payload from alix_document_onboarding_review ${where.length ? `where ${where.join(' and ')}` : ''} order by updated_at desc limit 200`,
          params,
        )
        if (res.rows.length > 0) return res.rows.map((r) => r.payload as DocumentOnboardingReview)
      } catch (err) {
        console.warn('[DocumentOnboardingReviewService] PG list falhou:', (err as Error).message)
      }
    }

    const roots = opts.sessionId ? [this.sessionDir(opts.sessionId)] : []
    if (!opts.sessionId) {
      try {
        const sessions = await fs.readdir(this.storageDir)
        roots.push(...sessions.map((s) => join(this.storageDir, s)))
      } catch (err) {
        const e = err as NodeJS.ErrnoException
        if (e?.code === 'ENOENT') return []
        throw err
      }
    }

    const out: DocumentOnboardingReview[] = []
    for (const dir of roots) {
      let files: string[] = []
      try {
        files = await fs.readdir(dir)
      } catch (err) {
        const e = err as NodeJS.ErrnoException
        if (e?.code === 'ENOENT') continue
        throw err
      }
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        try {
          const review = JSON.parse(await fs.readFile(join(dir, file), 'utf-8')) as DocumentOnboardingReview
          if (!opts.status || review.status === opts.status) out.push(review)
        } catch {
          // cache corrompido não bloqueia fila.
        }
      }
    }
    return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 200)
  }

  async updateStatus(id: string, status: DocumentOnboardingReviewStatus): Promise<DocumentOnboardingReview | null> {
    const reviews = await this.list()
    const review = reviews.find((r) => r.id === id)
    if (!review) return null
    const updated: DocumentOnboardingReview = { ...review, status, updatedAt: new Date().toISOString() }
    await this.persist(updated)
    return updated
  }
}

let singleton: DocumentOnboardingReviewService | null = null

export function getDocumentOnboardingReviewService(): DocumentOnboardingReviewService {
  if (singleton) return singleton
  singleton = new DocumentOnboardingReviewService(join(process.cwd(), 'storage', 'alix-document-onboarding-reviews'))
  return singleton
}
