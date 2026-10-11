import { createHash } from 'node:crypto'
import type { PoolClient } from 'pg'

import { getPool, isPgEnabled } from '../../../db/client.js'
import { resolveClienteId } from '../../../db/ClienteRepository.js'

export type FactStatus = 'confirmed' | 'inferred' | 'pending_review' | 'contested' | 'expired'
export type FactSource = 'conversation' | 'documento' | 'crm' | 'manual' | 'web' | 'system'

export interface FactEvidence {
  source: FactSource
  sourceId?: string
  documentId?: string
  sessionId?: string
  filename?: string
  page?: number
  sheet?: string
  fieldPath?: string
  excerpt?: string
  observedAt?: string
  url?: string
}

export interface FactLedgerInput {
  clienteId: string
  consultorId?: string
  sessionId?: string
  factType: string
  factKey: string
  factValue: string
  confidence: number
  source: FactSource
  sourceId?: string
  status?: FactStatus
  evidence?: FactEvidence[]
  expiresAt?: Date | null
  metadata?: Record<string, unknown>
}

export interface LedgerFact {
  id: number
  clienteId: string
  factType: string
  factKey: string
  canonicalKey: string
  factValue: string
  confidence: number
  source: FactSource
  sourceId?: string | null
  status: FactStatus
  version: number
  evidence: FactEvidence[]
  expiresAt?: string | null
  lastVerifiedAt?: string | null
  atualizadoEm: string
}

export interface StructuredFactCandidate {
  factType: string
  factKey: string
  factValue: string
  fieldPath: string
  confidence: number
}

type FactRow = {
  id: number | string
  cliente_id: string
  fact_type: string
  fact_key: string
  canonical_key: string
  fact_value: string
  confidence: string | number
  source: FactSource
  source_id?: string | null
  status: FactStatus
  version: number | string
  value_hash: string
  evidence: unknown
  expires_at?: Date | string | null
  last_verified_at?: Date | string | null
  atualizado_em: Date | string
  metadata?: unknown
}

const ACTIVE_STATUSES: FactStatus[] = ['confirmed', 'inferred', 'pending_review', 'contested']
const MAX_FACTS_PER_SOURCE = 120
const MAX_VALUE_CHARS = 1_200
const MAX_EVIDENCES = 24

function cleanText(value: unknown, max = MAX_VALUE_CHARS): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 3).trim()}...` : text
}

export function canonicalFactKey(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 160)
  return normalized || 'fato'
}

function valueHash(value: string): string {
  const normalized = cleanText(value).toLocaleLowerCase('pt-BR')
  return createHash('sha256').update(normalized).digest('hex')
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.max(0, Math.min(1, value))
}

function normalizeEvidence(input: FactEvidence): FactEvidence {
  return {
    source: input.source,
    ...(input.sourceId ? { sourceId: cleanText(input.sourceId, 220) } : {}),
    ...(input.documentId ? { documentId: cleanText(input.documentId, 220) } : {}),
    ...(input.sessionId ? { sessionId: cleanText(input.sessionId, 220) } : {}),
    ...(input.filename ? { filename: cleanText(input.filename, 260) } : {}),
    ...(Number.isFinite(input.page) ? { page: Number(input.page) } : {}),
    ...(input.sheet ? { sheet: cleanText(input.sheet, 160) } : {}),
    ...(input.fieldPath ? { fieldPath: cleanText(input.fieldPath, 220) } : {}),
    // Conversas guardam o trecho literal: normalizar espaços invalidaria os
    // offsets/hash da mensagem que sustentam a revisão humana.
    ...(input.excerpt ? { excerpt: input.source === 'conversation' ? input.excerpt.slice(0, 1000) : cleanText(input.excerpt, 700) } : {}),
    ...(input.url ? { url: cleanText(input.url, 500) } : {}),
    observedAt: input.observedAt || new Date().toISOString(),
  }
}

function evidenceKey(evidence: FactEvidence): string {
  return [
    evidence.source,
    evidence.sourceId,
    evidence.documentId,
    evidence.fieldPath,
    evidence.page,
    evidence.sheet,
    evidence.excerpt,
  ].map((value) => String(value ?? '')).join('|')
}

function mergeEvidence(current: unknown, incoming: FactEvidence[]): FactEvidence[] {
  const source = Array.isArray(current) ? current : []
  const result: FactEvidence[] = []
  const seen = new Set<string>()
  for (const item of [...source, ...incoming]) {
    if (!item || typeof item !== 'object') continue
    const normalized = normalizeEvidence(item as FactEvidence)
    const key = evidenceKey(normalized)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result.slice(-MAX_EVIDENCES)
}

function defaultStatus(input: FactLedgerInput): FactStatus {
  // Confiança da extração não é confirmação humana. Documentos e conversas
  // entram como candidatos; a revisão explícita usa reviewLedgerFact/origem manual.
  if ((input.source === 'conversation' || input.source === 'documento') && (!input.status || input.status === 'confirmed')) return 'pending_review'
  if (input.status) return input.status
  if (input.source === 'manual' || input.source === 'crm') return 'confirmed'
  if (input.source === 'web') return 'inferred'
  return input.confidence >= 0.9 ? 'confirmed' : 'pending_review'
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function rowToFact(row: FactRow): LedgerFact {
  return {
    id: Number(row.id),
    clienteId: row.cliente_id,
    factType: row.fact_type,
    factKey: row.fact_key,
    canonicalKey: row.canonical_key,
    factValue: row.fact_value,
    confidence: Number(row.confidence),
    source: row.source,
    sourceId: row.source_id,
    status: row.status,
    version: Number(row.version),
    evidence: Array.isArray(row.evidence) ? row.evidence as FactEvidence[] : [],
    expiresAt: toIso(row.expires_at),
    lastVerifiedAt: toIso(row.last_verified_at),
    atualizadoEm: toIso(row.atualizado_em) || new Date().toISOString(),
  }
}

async function enqueueDossierRefreshSafe(clienteId: string, reason: string, factId: number): Promise<void> {
  try {
    const { getAiJobQueueService } = await import('../jobs/AiJobQueueService.js')
    const queue = getAiJobQueueService()
    if (!queue.ready()) return
    await queue.enqueueDossierRefresh({ clienteId, reason, factIds: [factId] })
  } catch {
    // A fila é complementar; o Livro de Fatos nunca falha por causa dela.
  }
}

async function insertRevision(client: PoolClient, input: {
  factId: number
  version: number
  previousValue?: string | null
  factValue: string
  previousConfidence?: number | null
  confidence: number
  previousStatus?: FactStatus | null
  status: FactStatus
  source: FactSource
  sourceId?: string
  evidence: FactEvidence[]
  reason: string
}): Promise<void> {
  await client.query(
    `insert into alix_fact_revision (
       fact_id, version, previous_value, fact_value,
       previous_confidence, confidence, previous_status, status,
       source, source_id, evidence, change_reason
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)`,
    [
      input.factId,
      input.version,
      input.previousValue ?? null,
      input.factValue,
      input.previousConfidence ?? null,
      input.confidence.toFixed(2),
      input.previousStatus ?? null,
      input.status,
      input.source,
      input.sourceId ?? null,
      JSON.stringify(input.evidence),
      input.reason,
    ],
  )
}

export async function upsertLedgerFact(raw: FactLedgerInput): Promise<LedgerFact | null> {
  if (!isPgEnabled()) return null
  const clienteId = cleanText(raw.clienteId, 220)
  const factKey = cleanText(raw.factKey, 180)
  const factValue = cleanText(raw.factValue)
  if (!clienteId || !factKey || !factValue) return null

  const canonicalKey = canonicalFactKey(factKey)
  const confidence = clampConfidence(raw.confidence)
  const incomingStatus = defaultStatus({ ...raw, confidence })
  const incomingEvidence = (raw.evidence || []).map(normalizeEvidence)
  const incomingHash = valueHash(factValue)
  const lockKey = `${clienteId}:${raw.factType}:${canonicalKey}`
  const client = await getPool().connect()

  try {
    await client.query('begin')
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [lockKey])
    const currentResult = await client.query<FactRow>(
      `select * from alix_memory_fact
       where cliente_id = $1 and fact_type = $2 and canonical_key = $3
         and status = any($4::text[])
       order by atualizado_em desc limit 1 for update`,
      [clienteId, cleanText(raw.factType, 100), canonicalKey, ACTIVE_STATUSES],
    )
    const current = currentResult.rows[0]

    if (!current) {
      const evidence = mergeEvidence([], incomingEvidence)
      const inserted = await client.query<FactRow>(
        `insert into alix_memory_fact (
           cliente_id, consultor_id, session_id, fact_type, fact_key,
           canonical_key, fact_value, confidence, source, source_id,
           status, version, value_hash, evidence, valid_from,
           last_verified_at, expires_at, metadata, criado_em, atualizado_em
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,$12,$13::jsonb,now(),now(),$14,$15::jsonb,now(),now())
         returning *`,
        [
          clienteId,
          raw.consultorId ?? null,
          raw.sessionId ?? null,
          cleanText(raw.factType, 100),
          factKey,
          canonicalKey,
          factValue,
          confidence.toFixed(2),
          raw.source,
          raw.sourceId ?? null,
          incomingStatus,
          incomingHash,
          JSON.stringify(evidence),
          raw.expiresAt ?? null,
          JSON.stringify(raw.metadata || {}),
        ],
      )
      const row = inserted.rows[0]
      await insertRevision(client, {
        factId: Number(row.id),
        version: 1,
        factValue,
        confidence,
        status: incomingStatus,
        source: raw.source,
        sourceId: raw.sourceId,
        evidence,
        reason: 'created',
      })
      await client.query('commit')
      void enqueueDossierRefreshSafe(clienteId, `Fato ${canonicalKey} criado`, Number(row.id))
      return rowToFact(row)
    }

    const duplicateRevision = await client.query(
      `select 1 from alix_fact_revision
       where fact_id = $1 and source = $2 and source_id is not distinct from $3 and fact_value = $4
       limit 1`,
      [current.id, raw.source, raw.sourceId ?? null, factValue],
    )
    if (duplicateRevision.rowCount) {
      const verified = await client.query<FactRow>(
        `update alix_memory_fact set last_verified_at = now(), atualizado_em = now()
         where id = $1 returning *`,
        [current.id],
      )
      await client.query('commit')
      return rowToFact(verified.rows[0])
    }

    const sameValue = current.value_hash === incomingHash
    const currentConfidence = Number(current.confidence)
    const evidence = mergeEvidence(current.evidence, incomingEvidence)
    const version = Number(current.version) + 1
    // Um primeiro conflito já altera o estado para contested. As próximas
    // extrações também devem preservar o valor até que a divergência seja revisada.
    const protectsConfirmedValue = !sameValue
      && (current.status === 'confirmed' || current.status === 'contested')
      && incomingStatus !== 'confirmed'
    const nextValue = protectsConfirmedValue ? current.fact_value : factValue
    const nextHash = protectsConfirmedValue ? current.value_hash : incomingHash
    const nextStatus: FactStatus = protectsConfirmedValue
      ? 'contested'
      : sameValue && (current.status === 'confirmed' || (current.status === 'contested' && incomingStatus !== 'confirmed'))
        ? current.status
        : incomingStatus
    const nextConfidence = sameValue
      ? Math.max(currentConfidence, confidence)
      : protectsConfirmedValue
        ? currentConfidence
        : confidence
    const reason = protectsConfirmedValue
      ? 'conflict_detected'
      : sameValue
        ? 'corroborated'
        : 'value_changed'

    const updated = await client.query<FactRow>(
      `update alix_memory_fact set
         consultor_id = coalesce($2, consultor_id),
         session_id = coalesce($3, session_id),
         fact_key = $4,
         fact_value = $5,
         confidence = $6,
         source = $7,
         source_id = $8,
         status = $9,
         version = $10,
         value_hash = $11,
         evidence = $12::jsonb,
         last_verified_at = now(),
         expires_at = $13,
         metadata = metadata || $14::jsonb,
         atualizado_em = now()
       where id = $1 returning *`,
      [
        current.id,
        raw.consultorId ?? null,
        raw.sessionId ?? null,
        factKey,
        nextValue,
        nextConfidence.toFixed(2),
        raw.source,
        raw.sourceId ?? null,
        nextStatus,
        version,
        nextHash,
        JSON.stringify(evidence),
        raw.expiresAt ?? current.expires_at ?? null,
        JSON.stringify(raw.metadata || {}),
      ],
    )
    await insertRevision(client, {
      factId: Number(current.id),
      version,
      previousValue: current.fact_value,
      factValue,
      previousConfidence: currentConfidence,
      confidence,
      previousStatus: current.status,
      status: nextStatus,
      source: raw.source,
      sourceId: raw.sourceId,
      evidence: incomingEvidence,
      reason,
    })
    await client.query('commit')
    void enqueueDossierRefreshSafe(clienteId, `Fato ${canonicalKey} recebeu nova versão`, Number(updated.rows[0].id))
    return rowToFact(updated.rows[0])
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

function factTypeForPath(path: string): string {
  const key = canonicalFactKey(path)
  if (/(cpf|cnpj|nome|email|telefone|whatsapp|endereco|cidade|municipio|uf|estado)/.test(key)) return 'identidade'
  if (/(divida|saldo|valor|taxa|cet|parcela|vencimento|credor|banco|contrato|amortizacao|carencia)/.test(key)) return 'financeiro'
  if (/(car_|ccir|matricula|imovel|propriedade|fazenda|area_|hectare|garantia|penhor|hipoteca)/.test(key)) return 'patrimonio'
  if (/(jurid|processo|ajuiz|clausula|risco|protesto|restricao)/.test(key)) return 'perfil_risco'
  if (/(cultura|safra|producao|produtividade|atividade|rebanho|plantio|colheita)/.test(key)) return 'dado_operacional'
  if (/(prefer|canal_contato|horario_contato)/.test(key)) return 'preferencia'
  if (/(objetivo|intencao|estrategia|negociacao)/.test(key)) return 'intencao'
  return 'contexto'
}

function isIgnoredPath(path: string): boolean {
  return /(rawfile|imagebase64|embedding|documentindex|timingms|warnings|evidences|chunks|textoextraido|extractedtext)/i.test(path)
}

export function extractStructuredFactCandidates(
  value: unknown,
  options: { prefix?: string; confidence?: number; maxFacts?: number } = {},
): StructuredFactCandidate[] {
  const output: StructuredFactCandidate[] = []
  const seen = new Set<string>()
  const maxFacts = Math.min(MAX_FACTS_PER_SOURCE, Math.max(1, options.maxFacts ?? MAX_FACTS_PER_SOURCE))

  const walk = (current: unknown, path: string, depth: number): void => {
    if (output.length >= maxFacts || depth > 5 || isIgnoredPath(path)) return
    if (current === null || current === undefined || current === '') return
    if (Array.isArray(current)) {
      const primitives = current.filter((item) => ['string', 'number', 'boolean'].includes(typeof item))
      if (primitives.length === current.length && primitives.length > 0) {
        walk(primitives.slice(0, 20).map((item) => cleanText(item, 180)).join('; '), path, depth + 1)
        return
      }
      current.slice(0, 12).forEach((item, index) => walk(item, `${path}_${index + 1}`, depth + 1))
      return
    }
    if (typeof current === 'object') {
      for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
        walk(child, path ? `${path}_${key}` : key, depth + 1)
      }
      return
    }
    const factValue = cleanText(current)
    if (!factValue || factValue === '[object Object]') return
    const factKey = canonicalFactKey(path || 'fato')
    const dedupe = `${factKey}:${factValue.toLocaleLowerCase('pt-BR')}`
    if (seen.has(dedupe)) return
    seen.add(dedupe)
    output.push({
      factType: factTypeForPath(factKey),
      factKey,
      factValue,
      fieldPath: path || factKey,
      confidence: clampConfidence(options.confidence ?? 0.78),
    })
  }

  walk(value, options.prefix || '', 0)
  return output
}

function findDocumentEvidence(payload: Record<string, unknown>, candidate: StructuredFactCandidate): FactEvidence {
  const evidences = Array.isArray(payload.evidences) ? payload.evidences : []
  const needle = candidate.factValue.toLocaleLowerCase('pt-BR').slice(0, 80)
  const matched = evidences.find((item) => {
    if (!item || typeof item !== 'object') return false
    const text = cleanText((item as Record<string, unknown>).text, 2_000).toLocaleLowerCase('pt-BR')
    return needle.length >= 3 && text.includes(needle)
  }) as Record<string, unknown> | undefined
  return {
    source: 'documento',
    fieldPath: candidate.fieldPath,
    ...(typeof matched?.page === 'number' ? { page: matched.page } : {}),
    ...(typeof matched?.sheet === 'string' ? { sheet: matched.sheet } : {}),
    ...(matched?.text ? { excerpt: cleanText(matched.text, 700) } : {}),
  }
}

export async function ingestFactsFromAlixDocument(documentId: string): Promise<{ createdOrUpdated: number; skipped: number }> {
  if (!isPgEnabled()) return { createdOrUpdated: 0, skipped: 0 }
  const result = await getPool().query(
    `select id, session_id, cliente_id, filename, payload
     from alix_document where id = $1 limit 1`,
    [documentId],
  )
  const row = result.rows[0] as {
    id: string
    session_id: string
    cliente_id?: string | null
    filename: string
    payload: Record<string, unknown>
  } | undefined
  if (!row?.cliente_id || !row.payload) return { createdOrUpdated: 0, skipped: 1 }

  const metadata = (row.payload.metadata && typeof row.payload.metadata === 'object'
    ? row.payload.metadata
    : {}) as Record<string, unknown>
  const sources: Array<{ prefix: string; value: unknown; confidence: number }> = [
    { prefix: 'documento', value: metadata.entityStructured, confidence: 0.82 },
    { prefix: 'agro', value: metadata.agroCampos, confidence: Number(metadata.agroConfianca ?? 0.82) },
    { prefix: 'analise', value: metadata.smartExtraction, confidence: 0.8 },
  ]
  const candidates = sources.flatMap((source) => extractStructuredFactCandidates(source.value, {
    prefix: source.prefix,
    confidence: source.confidence,
    maxFacts: 60,
  })).slice(0, MAX_FACTS_PER_SOURCE)

  let createdOrUpdated = 0
  for (const candidate of candidates) {
    const evidence = findDocumentEvidence(row.payload, candidate)
    evidence.documentId = row.id
    evidence.sourceId = row.id
    evidence.sessionId = row.session_id
    evidence.filename = row.filename
    evidence.url = `/api/alix/documents/${encodeURIComponent(row.session_id)}/${encodeURIComponent(row.id)}`
    await upsertLedgerFact({
      clienteId: row.cliente_id,
      sessionId: row.session_id,
      factType: candidate.factType,
      factKey: candidate.factKey,
      factValue: candidate.factValue,
      confidence: candidate.confidence,
      source: 'documento',
      sourceId: row.id,
      status: 'pending_review',
      evidence: [evidence],
      metadata: { fieldPath: candidate.fieldPath, filename: row.filename },
    })
    createdOrUpdated += 1
  }
  return { createdOrUpdated, skipped: candidates.length ? 0 : 1 }
}

export async function ingestFactsFromCrmClient(clienteId: string): Promise<{ createdOrUpdated: number; skipped: number }> {
  if (!isPgEnabled()) return { createdOrUpdated: 0, skipped: 0 }
  clienteId = await resolveClienteId(clienteId)
  const result = await getPool().query(
    `select id, nome, cpf_cnpj, cidade, uf, email, estagio, consultor,
            credor, valor_total_divida, payload
     from cliente where id = $1 and (payload->'identityMerge'->>'status') is distinct from 'merged' limit 1`,
    [clienteId],
  )
  const row = result.rows[0] as Record<string, unknown> | undefined
  if (!row) return { createdOrUpdated: 0, skipped: 1 }
  const payload = row.payload && typeof row.payload === 'object' ? row.payload as Record<string, unknown> : {}
  const snapshot = {
    nome: row.nome,
    cpfCnpj: row.cpf_cnpj,
    cidade: row.cidade,
    uf: row.uf,
    email: row.email,
    estagio: row.estagio,
    consultor: row.consultor,
    credor: row.credor,
    valorTotalDivida: row.valor_total_divida,
    atividade: payload.atividade,
    areaTotalHa: payload.areaTotalHa,
    culturas: payload.culturas,
    propriedades: payload.propriedades,
    dividas: payload.dividas,
  }
  const candidates = extractStructuredFactCandidates(snapshot, { prefix: 'crm', confidence: 1, maxFacts: 100 })
  let createdOrUpdated = 0
  for (const candidate of candidates) {
    await upsertLedgerFact({
      clienteId,
      factType: candidate.factType,
      factKey: candidate.factKey,
      factValue: candidate.factValue,
      confidence: 1,
      source: 'crm',
      sourceId: clienteId,
      status: 'confirmed',
      evidence: [{
        source: 'crm',
        sourceId: clienteId,
        fieldPath: candidate.fieldPath,
        url: `/api/clientes/${encodeURIComponent(clienteId)}`,
      }],
      metadata: { fieldPath: candidate.fieldPath },
    })
    createdOrUpdated += 1
  }
  return { createdOrUpdated, skipped: candidates.length ? 0 : 1 }
}

export async function listLedgerFacts(clienteId: string, options: { limit?: number; includeContested?: boolean } = {}): Promise<LedgerFact[]> {
  if (!isPgEnabled()) return []
  const statuses = options.includeContested === false
    ? ['confirmed', 'inferred', 'pending_review']
    : ACTIVE_STATUSES
  const limit = Math.max(1, Math.min(500, options.limit ?? 150))
  const result = await getPool().query<FactRow>(
    `select * from alix_memory_fact
     where cliente_id = $1
       and status = any($2::text[])
       and (expires_at is null or expires_at > now())
     order by
       case status when 'confirmed' then 0 when 'contested' then 1 when 'pending_review' then 2 else 3 end,
       confidence desc, atualizado_em desc
     limit $3`,
    [clienteId, statuses, limit],
  )
  return result.rows.map(rowToFact)
}

export async function reviewLedgerFact(input: {
  factId: number
  status: 'confirmed' | 'contested' | 'expired'
  factValue?: string
  reviewer?: string
  note?: string
}): Promise<LedgerFact | null> {
  if (!isPgEnabled()) return null
  const client = await getPool().connect()
  try {
    await client.query('begin')
    const selected = await client.query<FactRow>(
      `select * from alix_memory_fact where id = $1 for update`,
      [input.factId],
    )
    const current = selected.rows[0]
    if (!current) {
      await client.query('rollback')
      return null
    }
    const nextValue = cleanText(input.factValue || current.fact_value)
    const nextVersion = Number(current.version) + 1
    const evidence = mergeEvidence(current.evidence, [{
      source: 'manual',
      sourceId: input.reviewer,
      fieldPath: current.canonical_key,
      ...(input.note ? { excerpt: input.note } : {}),
    }])
    const updated = await client.query<FactRow>(
      `update alix_memory_fact set
         fact_value = $2,
         value_hash = $3,
         status = $4,
         source = 'manual',
         source_id = $5,
         version = $6,
         evidence = $7::jsonb,
         last_verified_at = now(),
         expires_at = case when $4 = 'expired' then now() else expires_at end,
         metadata = metadata || $8::jsonb,
         atualizado_em = now()
       where id = $1 returning *`,
      [
        input.factId,
        nextValue,
        valueHash(nextValue),
        input.status,
        input.reviewer || 'consultor',
        nextVersion,
        JSON.stringify(evidence),
        JSON.stringify({ reviewNote: cleanText(input.note, 700), reviewedBy: input.reviewer || 'consultor' }),
      ],
    )
    await insertRevision(client, {
      factId: input.factId,
      version: nextVersion,
      previousValue: current.fact_value,
      factValue: nextValue,
      previousConfidence: Number(current.confidence),
      confidence: Number(current.confidence),
      previousStatus: current.status,
      status: input.status,
      source: 'manual',
      sourceId: input.reviewer || 'consultor',
      evidence: evidence.slice(-1),
      reason: 'human_review',
    })
    await client.query('commit')
    void enqueueDossierRefreshSafe(current.cliente_id, `Fato ${current.canonical_key} revisado por humano`, input.factId)
    return rowToFact(updated.rows[0])
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function listFactRevisions(factId: number, limit = 100): Promise<Array<Record<string, unknown>>> {
  if (!isPgEnabled()) return []
  const result = await getPool().query(
    `select id, fact_id, version, previous_value, fact_value,
            previous_confidence, confidence, previous_status, status,
            source, source_id, evidence, change_reason, created_at
     from alix_fact_revision where fact_id = $1
     order by version desc limit $2`,
    [factId, Math.max(1, Math.min(500, limit))],
  )
  return result.rows
}

export async function getFactLedgerStats(): Promise<Record<string, number>> {
  if (!isPgEnabled()) return { total: 0, confirmed: 0, pendingReview: 0, contested: 0, revisions: 0 }
  const result = await getPool().query(`
    select
      count(*)::int as total,
      count(*) filter (where status = 'confirmed')::int as confirmed,
      count(*) filter (where status = 'pending_review')::int as pending_review,
      count(*) filter (where status = 'contested')::int as contested,
      (select count(*)::int from alix_fact_revision) as revisions
    from alix_memory_fact
  `)
  const row = result.rows[0] || {}
  return {
    total: Number(row.total || 0),
    confirmed: Number(row.confirmed || 0),
    pendingReview: Number(row.pending_review || 0),
    contested: Number(row.contested || 0),
    revisions: Number(row.revisions || 0),
  }
}

export function formatLedgerFactsForPrompt(facts: LedgerFact[]): string {
  if (!facts.length) return ''
  const lines = [
    '**LIVRO DE FATOS DO CLIENTE:**',
    'Use fatos confirmados como dados. Trate pendências e conflitos como hipóteses que exigem revisão.',
  ]
  for (const fact of facts) {
    const label = fact.status === 'confirmed'
      ? 'CONFIRMADO'
      : fact.status === 'contested'
        ? 'CONFLITO'
        : fact.status === 'pending_review'
          ? 'REVISAR'
          : 'INFERÊNCIA'
    const citation = fact.evidence[0]
    const location = citation
      ? [citation.filename, citation.page ? `p.${citation.page}` : '', citation.fieldPath].filter(Boolean).join(' · ')
      : ''
    lines.push(`- [${label}] ${fact.factKey}: ${fact.factValue} (conf=${fact.confidence.toFixed(2)}${location ? `; fonte=${location}` : ''})`)
  }
  return lines.join('\n')
}
