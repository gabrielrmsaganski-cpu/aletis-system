// ============================================================
// ALETIS — ALIX Grounding Guard
//
// Barreiras determinísticas para impedir escrita no CRM baseada em
// documento sem confiança mínima, evidências e identificador de origem.
// ============================================================

import { documentMoney, documentMoneyMatches } from '../crm/DocumentFinancialReview.js'

export type GroundedCrmOperation = 'onboarding_cliente_completo' | 'atualizar_cliente_completo'

export interface GroundingGuardDecision {
  ok: boolean
  severity: 'allow' | 'warn' | 'block'
  score: number
  reasons: string[]
  warnings: string[]
  evidenceFields: string[]
  missingEvidenceFields: string[]
  confidence?: number
}

const DEFAULT_MIN_CONFIDENCE = 0.65

function minConfidence(): number {
  const raw = Number(process.env.ALIX_MIN_DOCUMENT_CONFIDENCE ?? DEFAULT_MIN_CONFIDENCE)
  if (!Number.isFinite(raw)) return DEFAULT_MIN_CONFIDENCE
  return Math.max(0, Math.min(1, raw))
}

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
  return true
}

function normalizeEvidenceField(value: unknown): string {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function evidenceFields(payload: Record<string, unknown>): string[] {
  const evidencias = Array.isArray(payload.evidencias) ? payload.evidencias : []
  const fields = new Set<string>()
  for (const ev of evidencias) {
    if (!ev || typeof ev !== 'object') continue
    const raw = ev as Record<string, unknown>
    const candidates = [
      raw.field,
      raw.campo,
      raw.source,
      raw.fonte,
      raw.text,
      raw.trecho,
    ]
    for (const candidate of candidates) {
      const normalized = normalizeEvidenceField(candidate)
      if (normalized) fields.add(normalized)
    }
  }
  return Array.from(fields)
}

function evidenceRows(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  return (Array.isArray(payload.evidencias) ? payload.evidencias : [])
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
}

function hasEvidenceFor(fields: string[], aliases: string[]): boolean {
  return fields.some((field) => aliases.some((alias) => field.includes(alias)))
}

function localizedNumbers(value: unknown): number[] {
  return clean(value).match(/-?\d[\d.\s]*(?:,\d+)?/g)?.map((raw) => {
    const compact = raw.replace(/\s/g, '')
    return Number(compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact)
  }).filter(Number.isFinite) ?? []
}

function snippetSupportsValue(snippet: unknown, expected: unknown): boolean {
  if (!hasValue(expected)) return true
  const expectedDigits = clean(expected).replace(/\D/g, '')
  if ((expectedDigits.length === 11 || expectedDigits.length === 14) && clean(snippet).replace(/\D/g, '').includes(expectedDigits)) return true
  if (typeof expected === 'number') {
    return localizedNumbers(snippet).some((candidate) =>
      Math.abs(candidate - expected) <= Math.max(0.01, Math.abs(expected) * 0.000001))
  }
  const normalizedExpected = normalizeEvidenceField(expected)
  return normalizedExpected.length >= 2 && normalizeEvidenceField(snippet).includes(normalizedExpected)
}

interface MaterialValue { value: unknown; money?: 'current' | 'principal' | 'global_current' }

function materialValues(key: string, payload: Record<string, unknown>): MaterialValue[] {
  if (key === 'nome' || key === 'cpfCnpj') return hasValue(payload[key]) ? [{ value: payload[key] }] : []
  if (key === 'dividaTotal') return hasValue(payload[key]) ? [{ value: payload[key], money: 'global_current' }] : []
  if (key === 'dividas') {
    return (Array.isArray(payload.dividas) ? payload.dividas : []).flatMap((item): MaterialValue[] => {
      if (!item || typeof item !== 'object') return []
      const row = item as Record<string, unknown>
      return [
        ...(hasValue(row.valorAtualizado) ? [{ value: row.valorAtualizado, money: 'current' as const }] : []),
        ...(hasValue(row.valorOriginal) ? [{ value: row.valorOriginal, money: 'principal' as const }] : []),
        ...[row.numeroContrato, row.contrato].filter(hasValue).map(value => ({ value })),
      ]
    })
  }
  if (key === 'propriedades') {
    return (Array.isArray(payload.propriedades) ? payload.propriedades : []).flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const row = item as Record<string, unknown>
      return [row.areaHa, row.car, row.ccir, row.matricula].filter(hasValue).map(value => ({ value }))
    })
  }
  return []
}

function hasGroundedValues(payload: Record<string, unknown>, aliases: string[], values: MaterialValue[]): boolean {
  if (!values.length) return true
  const rows = evidenceRows(payload).filter((row) => {
    const field = normalizeEvidenceField(row.field || row.campo || row.source || row.fonte)
    return aliases.some((alias) => field.includes(alias))
  })
  return values.every(({ value, money }) => rows.some((row) => money
    ? documentMoneyMatches(row.trecho || row.text || row.fonte, value, money)
    : snippetSupportsValue(row.trecho || row.text || row.fonte, value)))
}

function requiredEvidenceFor(operation: GroundedCrmOperation, payload: Record<string, unknown>): Array<{ key: string; aliases: string[] }> {
  const required: Array<{ key: string; aliases: string[] }> = []
  if (operation === 'onboarding_cliente_completo') {
    required.push({ key: 'nome', aliases: ['nome', 'cliente', 'contratante', 'devedor', 'produtor'] })
    if (hasValue(payload.dividaTotal)) required.push({ key: 'dividaTotal', aliases: ['divida', 'debito', 'saldo', 'valor'] })
  }
  if (Array.isArray(payload.dividas) && payload.dividas.length > 0) {
    required.push({ key: 'dividas', aliases: ['divida', 'debito', 'saldo', 'valor', 'contrato', 'credor'] })
  }
  if (Array.isArray(payload.propriedades) && payload.propriedades.length > 0) {
    required.push({ key: 'propriedades', aliases: ['propriedade', 'imovel', 'rural', 'car', 'ccir', 'matricula'] })
  }
  if (payload.cpfCnpj) {
    required.push({ key: 'cpfCnpj', aliases: ['cpf', 'cnpj', 'cpfcnpj', 'documento'] })
  }
  return required
}

function scoreDecision(reasons: string[], warnings: string[], missingEvidenceFields: string[], confidence?: number): number {
  let score = 1
  if (typeof confidence === 'number') score = Math.min(score, confidence)
  score -= reasons.length * 0.25
  score -= warnings.length * 0.08
  score -= missingEvidenceFields.length * 0.12
  return Number(Math.max(0, Math.min(1, score)).toFixed(3))
}

export function validateDocumentGrounding(
  operation: GroundedCrmOperation,
  payload: Record<string, unknown>,
): GroundingGuardDecision {
  const reasons: string[] = []
  const warnings: string[] = []
  const fields = evidenceFields(payload)
  const confidence = typeof payload.confiancaDocumento === 'number'
    ? Math.max(0, Math.min(1, payload.confiancaDocumento))
    : undefined
  const hasDocumentContext = Boolean(payload.documentoId || payload.documentReviewId || fields.length > 0 || confidence !== undefined)

  if (!hasDocumentContext) {
    reasons.push('Ação documental sem documento, revisão, evidências ou confiança de origem.')
  }

  if (!payload.documentoId) {
    const origem = clean(payload.origem || 'alix-documento').toLowerCase()
    if (origem.includes('document')) reasons.push('Ação documental sem documentoId vinculado.')
    else warnings.push('Sem documentoId vinculado; operação será menos auditável.')
  }

  if (confidence === undefined) {
    if (operation === 'onboarding_cliente_completo') reasons.push('Onboarding documental sem confiancaDocumento.')
    else warnings.push('Atualização documental sem confiancaDocumento.')
  } else if (confidence < minConfidence()) {
    reasons.push(`Confiança documental ${Math.round(confidence * 100)}% abaixo do mínimo ${Math.round(minConfidence() * 100)}%.`)
  }

  if (operation === 'onboarding_cliente_completo') {
    for (const field of ['nome']) {
      if (!hasValue(payload[field])) reasons.push(`Campo obrigatório ausente ou vazio: ${field}.`)
    }
  }

  if (hasValue(payload.dividaTotal) && documentMoney(payload.dividaTotal) === undefined) {
    reasons.push('Saldo total inválido: use valor decimal não negativo com até duas casas decimais.')
  }
  const missingEvidenceFields: string[] = []
  for (const req of requiredEvidenceFor(operation, payload)) {
    if (
      !hasEvidenceFor(fields, req.aliases)
      || !hasGroundedValues(payload, req.aliases, materialValues(req.key, payload))
    ) missingEvidenceFields.push(req.key)
  }
  if (missingEvidenceFields.length > 0) {
    reasons.push(`Evidência documental insuficiente para: ${missingEvidenceFields.join(', ')}.`)
  }

  if (fields.length === 0) {
    reasons.push('Nenhuma evidência textual/estruturada foi enviada junto com a ação.')
  }

  const score = scoreDecision(reasons, warnings, missingEvidenceFields, confidence)
  const severity: GroundingGuardDecision['severity'] = reasons.length > 0 ? 'block' : warnings.length > 0 ? 'warn' : 'allow'
  return {
    ok: reasons.length === 0,
    severity,
    score,
    reasons,
    warnings,
    evidenceFields: fields.slice(0, 30),
    missingEvidenceFields,
    confidence,
  }
}

export function assertDocumentGrounding(operation: GroundedCrmOperation, payload: Record<string, unknown>): GroundingGuardDecision {
  const decision = validateDocumentGrounding(operation, payload)
  if (!decision.ok) {
    throw new Error(`Guardrail ALIX bloqueou escrita no CRM: ${decision.reasons.join(' ')}`)
  }
  return decision
}
