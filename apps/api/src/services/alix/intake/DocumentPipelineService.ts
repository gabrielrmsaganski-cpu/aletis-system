// ============================================================
// ALETIS — esteira documental especializada
// receber → validar → extrair → classificar → cruzar → revisar → cadastrar
// ============================================================

import { randomUUID } from 'node:crypto'

import { getPool, isPgEnabled } from '../../../db/client.js'
import { mimeWhitelist } from '../../../lib/upload-validation.js'
import {
  classifySpecializedDocument,
  documentFamilyKey,
  extractSpecializedDocument,
  type SpecializedClassification,
  type SpecializedDocumentType,
  type SpecializedExtraction,
  type SpecializedField,
} from '../extraction/SpecializedDocumentExtractor.js'
import { getDocumentOnboardingReviewService } from './DocumentOnboardingReviewService.js'
import { getDocumentIntakeService } from './DocumentIntakeService.js'
import type { IngestedDocument } from './types.js'

export const DOCUMENT_PIPELINE_STAGES = [
  'receber',
  'validar',
  'extrair',
  'classificar',
  'cruzar',
  'revisar',
  'cadastrar',
] as const

export type DocumentPipelineStage = typeof DOCUMENT_PIPELINE_STAGES[number]
export type DocumentPipelineStatus =
  | 'queued'
  | 'running'
  | 'needs_review'
  | 'awaiting_registration'
  | 'registered'
  | 'cancelled'
  | 'failed'

export interface DocumentPipelineFinding {
  id?: string
  kind: 'validation' | 'missing_field' | 'low_confidence' | 'duplicate' | 'divergence' | 'expired' | 'version_change'
  severity: 'info' | 'warning' | 'high' | 'critical'
  fieldKey?: string
  title: string
  description: string
  relatedDocumentIds?: string[]
  evidence?: unknown[]
  status?: 'open' | 'resolved' | 'dismissed'
}

export interface DocumentFieldChange {
  fieldKey: string
  previousValue?: string
  currentValue?: string
  change: 'added' | 'removed' | 'changed'
}

export type DocumentFieldReviewStatus = 'confirmed' | 'contested' | 'rejected'

export interface DocumentPipelineField extends SpecializedField {
  id: string
  status: 'extracted' | 'low_confidence' | DocumentFieldReviewStatus
  reviewedBy?: string
  reviewedAt?: string
  reviewNote?: string
}

export interface DocumentPipelineRunView {
  id: string
  documentId: string
  sessionId: string
  clienteId?: string
  pipelineVersion: number
  status: DocumentPipelineStatus
  currentStage: DocumentPipelineStage
  progress: number
  specializedType?: SpecializedDocumentType
  classifierMethod?: string
  classificationConfidence?: string
  documentFamilyKey?: string
  sourceSha256?: string
  jobId?: string
  reviewId?: string
  registeredEntityId?: string
  extraction?: SpecializedExtraction
  stageHistory: Array<{ stage: DocumentPipelineStage; status: string; at: string; detail?: string }>
  error?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
  fields?: DocumentPipelineField[]
  findings?: DocumentPipelineFinding[]
  comparisons?: Array<{
    id: string
    baselineRunId?: string
    comparisonType: string
    similarity?: string
    changedFields: DocumentFieldChange[]
    summary: string
    createdAt: string
  }>
}

type ProcessInput = { sessionId: string; documentId: string; jobId?: string; force?: boolean }

const STAGE_PROGRESS: Record<DocumentPipelineStage, number> = {
  receber: 5,
  validar: 15,
  extrair: 40,
  classificar: 52,
  cruzar: 72,
  revisar: 88,
  cadastrar: 100,
}

const MIME_ALLOWLIST = mimeWhitelist('pdf', 'image', 'spreadsheet', 'doc', 'xml')
MIME_ALLOWLIST.add('text/plain')

const CROSS_DOCUMENT_FIELDS = new Set([
  'devedor_cpf_cnpj',
  'emitente_cpf_cnpj',
  'proprietario_cpf_cnpj',
  'contribuinte_cpf_cnpj',
  'titular_cpf_cnpj',
  'cliente_cpf_cnpj',
  'entidade_cnpj',
  'area_total',
  'car',
  'ccir',
  'matricula',
  'cib_nirf',
])

export class DocumentPipelineService {
  async process(input: ProcessInput): Promise<DocumentPipelineRunView> {
    if (!isPgEnabled()) throw new Error('A esteira documental durável requer ALETIS_PG_ENABLED=1.')
    const doc = await getDocumentIntakeService().get(input.sessionId, input.documentId)
    if (!doc) throw new Error('Documento não encontrado para a esteira especializada.')

    const existing = await this.getLatestForDocument(doc.id, true)
    if (existing && !input.force && !['queued', 'failed', 'cancelled'].includes(existing.status)) {
      const interruptedSameJob = existing.status === 'running' && Boolean(input.jobId) && existing.jobId === input.jobId
      if (!interruptedSameJob) {
        if (input.jobId && !existing.jobId) await this.attachJob(existing.id, input.jobId)
        return existing
      }
      const detail = 'Execução anterior interrompida; retomada durável iniciada pelo mesmo job.'
      await getPool().query(
        `update alix_document_pipeline_run
         set status = 'failed', error = $2, completed_at = now(), updated_at = now()
         where id = $1 and status = 'running'`,
        [existing.id, detail],
      )
      await this.appendStage(existing.id, existing.currentStage, 'failed', detail)
    }

    const run = await this.createRun(doc, input)
    try {
      await this.advance(run.id, 'receber', 'completed', 'Arquivo recebido e origem registrada.')
      await this.advance(run.id, 'validar', 'running')
      const validationFindings = validateDocument(doc)
      if (validationFindings.some((item) => item.severity === 'critical')) {
        await this.persistFindings(run.id, doc, validationFindings)
        throw new Error(validationFindings.map((item) => item.description).join(' '))
      }
      await this.advance(run.id, 'validar', 'completed', validationFindings.length ? 'Validação concluída com alertas.' : 'Formato, tamanho e conteúdo validados.')

      await this.advance(run.id, 'extrair', 'running')
      const classification = await classifySpecializedDocument(doc)
      const extraction = await extractSpecializedDocument(doc, classification)
      const familyKey = documentFamilyKey(doc, classification.type, extraction.fields)
      await this.persistExtraction(run.id, doc, classification, extraction, familyKey)
      await this.persistFields(run.id, doc, extraction.fields)
      await this.advance(run.id, 'extrair', 'completed', `${extraction.fields.length} campo(s) extraído(s) com evidência.`)

      await this.advance(run.id, 'classificar', 'running')
      await this.advance(run.id, 'classificar', 'completed', `${classification.type} (${Math.round(classification.confidence * 100)}%).`)

      await this.advance(run.id, 'cruzar', 'running')
      const crossed = await this.crossDocumentEvidence(run.id, doc, classification, extraction, familyKey)
      await this.persistFindings(run.id, doc, [...validationFindings, ...crossed.findings])
      if (crossed.comparison) await this.persistComparison(run.id, crossed.comparison)
      await this.advance(run.id, 'cruzar', 'completed', `${crossed.findings.length} achado(s); ${crossed.comparison ? 'versão comparada' : 'primeira versão conhecida'}.`)

      await this.advance(run.id, 'revisar', 'running')
      const review = await this.refreshReview(doc, extraction, crossed.findings)
      await this.advance(run.id, 'revisar', 'completed', review ? `Revisão ${review.status} preparada.` : 'Extração sem sinal suficiente para pré-cadastro.')

      const blockingFindings = crossed.findings.filter((item) => ['high', 'critical'].includes(item.severity))
      const status: DocumentPipelineStatus = review && extraction.missingRequiredFields.length === 0 && blockingFindings.length === 0
        ? 'awaiting_registration'
        : 'needs_review'
      await getPool().query(
        `update alix_document_pipeline_run
         set status = $2, current_stage = 'cadastrar', progress = 100,
             review_id = $3, completed_at = now(), updated_at = now(), error = null
         where id = $1`,
        [run.id, status, review?.id || null],
      )
      await this.appendStage(run.id, 'cadastrar', status, status === 'awaiting_registration'
        ? 'Pronto para cadastro após confirmação humana.'
        : 'Cadastro bloqueado até resolver a revisão documental.')

      await getDocumentIntakeService().saveMetadata(doc.sessionId, doc.id, {
        specializedPipeline: {
          runId: run.id,
          status,
          type: classification.type,
          confidence: extraction.confidence,
          fieldCount: extraction.fields.length,
          findingCount: crossed.findings.length + validationFindings.length,
          reviewId: review?.id,
          updatedAt: new Date().toISOString(),
        },
      })
      return (await this.get(run.id, true)) as DocumentPipelineRunView
    } catch (error) {
      const message = (error as Error).message.slice(0, 2_000)
      await getPool().query(
        `update alix_document_pipeline_run set status = 'failed', error = $2, completed_at = now(), updated_at = now() where id = $1`,
        [run.id, message],
      )
      await this.appendStage(run.id, (await this.currentStage(run.id)) || 'validar', 'failed', message)
      throw error
    }
  }

  async createQueued(input: Omit<ProcessInput, 'jobId'> & { jobId?: string }): Promise<DocumentPipelineRunView> {
    if (!isPgEnabled()) throw new Error('PostgreSQL não está habilitado.')
    const doc = await getDocumentIntakeService().get(input.sessionId, input.documentId)
    if (!doc) throw new Error('Documento não encontrado.')
    return this.createRun(doc, input)
  }

  async attachJob(runId: string, jobId: string): Promise<void> {
    if (!isPgEnabled()) return
    await getPool().query(`update alix_document_pipeline_run set job_id = $2, updated_at = now() where id = $1`, [runId, jobId])
  }

  async get(runId: string, includeDetails = true): Promise<DocumentPipelineRunView | null> {
    if (!isPgEnabled()) return null
    const result = await getPool().query(`select * from alix_document_pipeline_run where id = $1 limit 1`, [runId])
    const row = result.rows[0]
    if (!row) return null
    return this.hydrateRun(row, includeDetails)
  }

  async getLatestForDocument(documentId: string, includeDetails = true): Promise<DocumentPipelineRunView | null> {
    if (!isPgEnabled()) return null
    const result = await getPool().query(
      `select * from alix_document_pipeline_run where document_id = $1 order by pipeline_version desc limit 1`,
      [documentId],
    )
    return result.rows[0] ? this.hydrateRun(result.rows[0], includeDetails) : null
  }

  async list(opts: {
    sessionId?: string
    clienteId?: string
    status?: DocumentPipelineStatus
    limit?: number
  } = {}): Promise<DocumentPipelineRunView[]> {
    if (!isPgEnabled()) return []
    const params: unknown[] = []
    const scopeWhere: string[] = []
    const resultWhere: string[] = []
    if (opts.sessionId) { params.push(opts.sessionId); scopeWhere.push(`session_id = $${params.length}`) }
    if (opts.clienteId) { params.push(opts.clienteId); scopeWhere.push(`cliente_id = $${params.length}`) }
    if (opts.status) { params.push(opts.status); resultWhere.push(`status = $${params.length}`) }
    params.push(Math.max(1, Math.min(200, opts.limit || 50)))
    const rows = await getPool().query(
      `with latest as (
         select distinct on (document_id) *
         from alix_document_pipeline_run
         ${scopeWhere.length ? `where ${scopeWhere.join(' and ')}` : ''}
         order by document_id, pipeline_version desc, created_at desc
       )
       select * from latest
       ${resultWhere.length ? `where ${resultWhere.join(' and ')}` : ''}
       order by updated_at desc limit $${params.length}`,
      params,
    )
    return Promise.all(rows.rows.map((row) => this.hydrateRun(row, false)))
  }

  async register(runId: string, input: { registeredEntityId: string; reviewConfirmed: boolean; actorId?: string }): Promise<DocumentPipelineRunView> {
    const current = await this.get(runId, false)
    if (!current) throw new Error('Execução documental não encontrada.')
    if (!input.reviewConfirmed) throw new Error('O cadastro exige confirmação explícita da revisão humana.')
    if (!['awaiting_registration', 'needs_review'].includes(current.status)) throw new Error(`Execução não pode ser cadastrada no status ${current.status}.`)
    const registeredEntityId = input.registeredEntityId.trim()
    if (!registeredEntityId) throw new Error('registeredEntityId é obrigatório.')
    await getPool().query(
      `update alix_document_pipeline_run
       set status = 'registered', registered_entity_id = $2, completed_at = now(), updated_at = now()
       where id = $1`,
      [runId, registeredEntityId],
    )
    await this.appendStage(runId, 'cadastrar', 'completed', `Cadastro confirmado: ${registeredEntityId}.`)
    if (current.reviewId) {
      await getDocumentOnboardingReviewService().updateStatus(current.reviewId, 'converted').catch(() => null)
    }
    await getPool().query(
      `insert into audit_log (ator, acao, recurso, dados_depois)
       values ($1, 'alix.document_pipeline.register', $2, $3::jsonb)`,
      [input.actorId || 'system', `alix_document_pipeline_run:${runId}`, JSON.stringify({ registeredEntityId })],
    ).catch(() => undefined)
    return (await this.get(runId, true)) as DocumentPipelineRunView
  }

  async resolveFinding(findingId: string, input: { status: 'resolved' | 'dismissed'; actorId?: string }): Promise<void> {
    await getPool().query(
      `update alix_document_finding
       set status = $2, resolved_by = $3, resolved_at = now(), updated_at = now()
       where id = $1`,
      [findingId, input.status, input.actorId || 'system'],
    )
  }

  async reviewField(fieldId: string, input: {
    status: DocumentFieldReviewStatus
    actorId?: string
    note?: string
  }): Promise<DocumentPipelineField> {
    if (!isPgEnabled()) throw new Error('A revisão durável de campos requer PostgreSQL habilitado.')
    const actorId = input.actorId?.trim() || 'system'
    const note = input.note?.trim().slice(0, 1_000) || undefined
    const reviewedAt = new Date().toISOString()
    const result = await getPool().query(
      `update alix_document_field
       set status = $2,
           metadata = metadata || $3::jsonb,
           updated_at = now()
       where id = $1
       returning *`,
      [fieldId, input.status, JSON.stringify({ reviewedBy: actorId, reviewedAt, ...(note ? { reviewNote: note } : {}) })],
    )
    const row = result.rows[0]
    if (!row) throw new Error('Campo documental não encontrado.')

    if (input.status === 'confirmed') {
      await getPool().query(
        `update alix_document_finding
         set status = 'resolved', resolved_by = $2, resolved_at = now(), updated_at = now()
         where run_id = $1 and field_key = $3 and kind = 'low_confidence' and status = 'open'`,
        [row.run_id, actorId, row.field_key],
      )
    }
    await getPool().query(
      `insert into audit_log (ator, acao, recurso, dados_depois)
       values ($1, 'alix.document_field.review', $2, $3::jsonb)`,
      [actorId, `alix_document_field:${fieldId}`, JSON.stringify({ status: input.status, note, reviewedAt })],
    ).catch(() => undefined)
    return fieldFromRow(row)
  }

  async stats(): Promise<Record<string, unknown>> {
    if (!isPgEnabled()) return { total: 0, documents: 0, completedDocuments: 0, byStatus: {}, openFindings: 0, expired: 0 }
    const [runs, findings, coverage, attempts] = await Promise.all([
      getPool().query(`
        with latest as (
          select distinct on (document_id) document_id, status
          from alix_document_pipeline_run
          order by document_id, pipeline_version desc, created_at desc
        )
        select status, count(*)::int total from latest group by status
      `),
      getPool().query(`
        with latest as (
          select distinct on (document_id) id
          from alix_document_pipeline_run
          order by document_id, pipeline_version desc, created_at desc
        )
        select finding.kind, count(*)::int total
        from alix_document_finding finding
        join latest on latest.id = finding.run_id
        where finding.status = 'open'
        group by finding.kind
      `),
      getPool().query(`
        with latest as (
          select distinct on (document_id) document_id, status
          from alix_document_pipeline_run
          order by document_id, pipeline_version desc, created_at desc
        )
        select count(*)::int documents,
          count(*) filter (where status in ('needs_review','awaiting_registration','registered'))::int completed_documents
        from latest
      `),
      getPool().query(`
        select count(*)::int total_attempts,
          count(*) filter (where status = 'failed')::int historical_failed_attempts
        from alix_document_pipeline_run
      `),
    ])
    const byStatus = Object.fromEntries(runs.rows.map((row) => [String(row.status), Number(row.total)]))
    const byFinding = Object.fromEntries(findings.rows.map((row) => [String(row.kind), Number(row.total)]))
    const latest = coverage.rows[0] || {}
    const history = attempts.rows[0] || {}
    return {
      total: Object.values(byStatus).reduce((sum, value) => sum + Number(value), 0),
      totalAttempts: Number(history.total_attempts || 0),
      historicalFailedAttempts: Number(history.historical_failed_attempts || 0),
      documents: Number(latest.documents || 0),
      completedDocuments: Number(latest.completed_documents || 0),
      byStatus,
      openFindings: Object.values(byFinding).reduce((sum, value) => sum + Number(value), 0),
      byFinding,
      expired: Number(byFinding.expired || 0),
      divergences: Number(byFinding.divergence || 0),
      duplicates: Number(byFinding.duplicate || 0),
    }
  }

  private async createRun(doc: IngestedDocument, input: ProcessInput): Promise<DocumentPipelineRunView> {
    const existing = await this.getLatestForDocument(doc.id, false)
    if (existing && !input.force && ['queued', 'running', 'needs_review', 'awaiting_registration', 'registered'].includes(existing.status)) {
      if (input.jobId && !existing.jobId) await this.attachJob(existing.id, input.jobId)
      return (await this.get(existing.id, false)) as DocumentPipelineRunView
    }
    const version = (existing?.pipelineVersion || 0) + 1
    const id = `docpipe_${randomUUID()}`
    const now = new Date().toISOString()
    const stageHistory = [{ stage: 'receber', status: 'queued', at: now }]
    await getPool().query(
      `insert into alix_document_pipeline_run (
         id, document_id, session_id, cliente_id, pipeline_version, status, current_stage,
         progress, source_sha256, job_id, stage_history, created_at, updated_at
       ) values ($1,$2,$3,$4,$5,'queued','receber',0,$6,$7,$8::jsonb,now(),now())`,
      [
        id,
        doc.id,
        doc.sessionId,
        doc.clienteId || null,
        version,
        typeof doc.metadata?.sha256 === 'string' ? doc.metadata.sha256 : null,
        input.jobId || null,
        JSON.stringify(stageHistory),
      ],
    )
    return (await this.get(id, false)) as DocumentPipelineRunView
  }

  private async advance(runId: string, stage: DocumentPipelineStage, status: string, detail?: string): Promise<void> {
    await getPool().query(
      `update alix_document_pipeline_run
       set status = 'running', current_stage = $2, progress = $3,
           started_at = coalesce(started_at, now()), updated_at = now()
       where id = $1 and status <> 'cancelled'`,
      [runId, stage, STAGE_PROGRESS[stage]],
    )
    await this.appendStage(runId, stage, status, detail)
  }

  private async appendStage(runId: string, stage: DocumentPipelineStage, status: string, detail?: string): Promise<void> {
    const event = { stage, status, at: new Date().toISOString(), ...(detail ? { detail } : {}) }
    await getPool().query(
      `update alix_document_pipeline_run
       set stage_history = coalesce(stage_history, '[]'::jsonb) || $2::jsonb, updated_at = now()
       where id = $1`,
      [runId, JSON.stringify([event])],
    )
  }

  private async currentStage(runId: string): Promise<DocumentPipelineStage | null> {
    const result = await getPool().query(`select current_stage from alix_document_pipeline_run where id = $1`, [runId])
    const value = String(result.rows[0]?.current_stage || '')
    return DOCUMENT_PIPELINE_STAGES.includes(value as DocumentPipelineStage) ? value as DocumentPipelineStage : null
  }

  private async persistExtraction(
    runId: string,
    doc: IngestedDocument,
    classification: SpecializedClassification,
    extraction: SpecializedExtraction,
    familyKey: string,
  ): Promise<void> {
    await getPool().query(
      `update alix_document_pipeline_run
       set specialized_type = $2, classifier_method = $3, classification_confidence = $4,
           document_family_key = $5, extraction = $6::jsonb, cliente_id = coalesce(cliente_id, $7), updated_at = now()
       where id = $1`,
      [runId, classification.type, classification.method, classification.confidence.toFixed(3), familyKey, JSON.stringify(extraction), doc.clienteId || null],
    )
  }

  private async persistFields(runId: string, doc: IngestedDocument, fields: SpecializedField[]): Promise<void> {
    await getPool().query(`delete from alix_document_field where run_id = $1`, [runId])
    for (const field of fields) {
      await getPool().query(
        `insert into alix_document_field (
           id, run_id, document_id, cliente_id, field_key, value_text, normalized_value,
           value_type, confidence, evidence_text, evidence_source, page, sheet, status,
           expires_at, metadata
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
         on conflict (run_id, field_key, normalized_value, evidence_text) do nothing`,
        [
          `docfield_${randomUUID()}`, runId, doc.id, doc.clienteId || null, field.fieldKey,
          field.valueText, field.normalizedValue, field.valueType, field.confidence.toFixed(3),
          field.evidenceText, field.evidenceSource, field.page || null, field.sheet || null,
          field.confidence < 0.65 ? 'low_confidence' : 'extracted', field.expiresAt || null,
          JSON.stringify({ extractor: field.extractor }),
        ],
      )
    }
  }

  private async crossDocumentEvidence(
    runId: string,
    doc: IngestedDocument,
    classification: SpecializedClassification,
    extraction: SpecializedExtraction,
    familyKey: string,
  ): Promise<{
    findings: DocumentPipelineFinding[]
    comparison?: { baselineRunId?: string; type: string; similarity: number; changedFields: DocumentFieldChange[]; summary: string }
  }> {
    const findings: DocumentPipelineFinding[] = []
    for (const missing of extraction.missingRequiredFields) {
      findings.push({ kind: 'missing_field', severity: 'warning', fieldKey: missing, title: 'Campo obrigatório ausente', description: `${missing} não foi localizado com evidência literal.` })
    }
    for (const field of extraction.fields.filter((item) => item.confidence < 0.65)) {
      findings.push({ kind: 'low_confidence', severity: 'warning', fieldKey: field.fieldKey, title: 'Campo com baixa confiança', description: `${field.fieldKey} precisa de conferência humana.`, evidence: [field.evidenceText] })
    }
    const now = Date.now()
    for (const field of extraction.fields.filter((item) => item.expiresAt && new Date(item.expiresAt).getTime() < now)) {
      findings.push({ kind: 'expired', severity: 'high', fieldKey: field.fieldKey, title: 'Documento ou informação vencida', description: `${field.fieldKey} venceu em ${String(field.expiresAt).slice(0, 10)}.`, evidence: [field.evidenceText] })
    }

    const sha = typeof doc.metadata?.sha256 === 'string' ? doc.metadata.sha256 : ''
    if (sha) {
      const duplicates = await getPool().query(
        `select id, filename from alix_document
         where sha256 = $1 and id <> $2
           and (cliente_id = $3 or session_id = $4)
         order by uploaded_at desc limit 10`,
        [sha, doc.id, doc.clienteId || null, doc.sessionId],
      )
      if (duplicates.rows.length > 0) {
        findings.push({
          kind: 'duplicate', severity: 'high', title: 'Arquivo duplicado',
          description: `O mesmo conteúdo já foi recebido como ${duplicates.rows.map((row) => row.filename).join(', ')}.`,
          relatedDocumentIds: duplicates.rows.map((row) => String(row.id)),
          evidence: [{ sha256: sha }],
        })
      }
    }

    const baselineRows = await getPool().query(
      `select id, document_id, extraction from alix_document_pipeline_run
       where id <> $1 and document_family_key = $2
         and (($3::text is not null and cliente_id = $3) or session_id = $4)
         and status <> 'failed'
       order by created_at desc limit 1`,
      [runId, familyKey, doc.clienteId || null, doc.sessionId],
    )
    let comparison: { baselineRunId?: string; type: string; similarity: number; changedFields: DocumentFieldChange[]; summary: string } | undefined
    const baseline = baselineRows.rows[0]
    if (baseline) {
      const previous = ((baseline.extraction || {}).fields || []) as SpecializedField[]
      const changedFields = compareDocumentFields(previous, extraction.fields)
      const similarity = fieldSimilarity(previous, extraction.fields)
      comparison = {
        baselineRunId: String(baseline.id),
        type: 'automatic_version',
        similarity,
        changedFields,
        summary: changedFields.length === 0 ? 'Nenhuma alteração de campo identificada.' : `${changedFields.length} campo(s) alterado(s) em relação à versão anterior.`,
      }
      if (changedFields.length > 0) {
        findings.push({
          kind: 'version_change', severity: 'info', title: 'Nova versão documental',
          description: comparison.summary,
          relatedDocumentIds: [String(baseline.document_id)],
          evidence: changedFields,
        })
      }
    }

    if (doc.clienteId) {
      for (const field of extraction.fields.filter((item) => CROSS_DOCUMENT_FIELDS.has(item.fieldKey))) {
        const related = await getPool().query(
          `select f.document_id, f.field_key, f.value_text, f.normalized_value, f.evidence_text
           from alix_document_field f
           join alix_document_pipeline_run r on r.id = f.run_id
           where f.cliente_id = $1 and f.document_id <> $2 and f.field_key = $3
             and f.normalized_value <> $4 and r.status <> 'failed'
           order by f.created_at desc limit 5`,
          [doc.clienteId, doc.id, field.fieldKey, field.normalizedValue],
        )
        if (related.rows.length === 0) continue
        const severity = ['car', 'ccir', 'matricula', 'cib_nirf'].includes(field.fieldKey) ? 'high' : 'warning'
        findings.push({
          kind: 'divergence', severity, fieldKey: field.fieldKey,
          title: 'Divergência entre documentos',
          description: `${field.fieldKey} aparece como “${field.valueText}” neste documento e possui valor diferente em ${related.rows.length} documento(s) do cliente.`,
          relatedDocumentIds: [...new Set(related.rows.map((row) => String(row.document_id)))],
          evidence: [{ current: field.evidenceText }, ...related.rows.map((row) => ({ documentId: row.document_id, value: row.value_text, evidence: row.evidence_text }))],
        })
      }
    }

    if (classification.type === 'outro') {
      findings.push({ kind: 'validation', severity: 'warning', title: 'Tipo documental não especializado', description: 'O arquivo não correspondeu aos onze perfis especializados desta versão.' })
    }
    return { findings: deduplicateFindings(findings), comparison }
  }

  private async persistFindings(runId: string, doc: IngestedDocument, findings: DocumentPipelineFinding[]): Promise<void> {
    await getPool().query(`delete from alix_document_finding where run_id = $1`, [runId])
    for (const finding of deduplicateFindings(findings)) {
      await getPool().query(
        `insert into alix_document_finding (
           id, run_id, document_id, cliente_id, kind, severity, field_key, title,
           description, related_document_ids, evidence, status
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'open')`,
        [
          `docfinding_${randomUUID()}`, runId, doc.id, doc.clienteId || null,
          finding.kind, finding.severity, finding.fieldKey || null, finding.title, finding.description,
          finding.relatedDocumentIds || [], JSON.stringify(finding.evidence || []),
        ],
      )
    }
  }

  private async persistComparison(runId: string, comparison: { baselineRunId?: string; type: string; similarity: number; changedFields: DocumentFieldChange[]; summary: string }): Promise<void> {
    await getPool().query(
      `insert into alix_document_comparison (
         id, run_id, baseline_run_id, comparison_type, similarity, changed_fields, summary
       ) values ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
      [`doccompare_${randomUUID()}`, runId, comparison.baselineRunId || null, comparison.type, comparison.similarity.toFixed(4), JSON.stringify(comparison.changedFields), comparison.summary],
    )
  }

  private async refreshReview(doc: IngestedDocument, extraction: SpecializedExtraction, findings: DocumentPipelineFinding[]) {
    const reviewService = getDocumentOnboardingReviewService()
    const existing = await reviewService.get(`docrev_${doc.id}`, doc.sessionId)
    if (!existing) return null
    const blocking = extraction.missingRequiredFields.length > 0 || findings.some((item) => ['high', 'critical'].includes(item.severity))
    const status = existing.status === 'converted' || existing.status === 'dismissed'
      ? existing.status
      : blocking ? 'needs_review' : 'ready_for_hitl'
    return reviewService.updateStatus(existing.id, status)
  }

  private async hydrateRun(row: Record<string, unknown>, includeDetails: boolean): Promise<DocumentPipelineRunView> {
    const run: DocumentPipelineRunView = {
      id: String(row.id),
      documentId: String(row.document_id),
      sessionId: String(row.session_id),
      clienteId: row.cliente_id ? String(row.cliente_id) : undefined,
      pipelineVersion: Number(row.pipeline_version || 1),
      status: String(row.status) as DocumentPipelineStatus,
      currentStage: String(row.current_stage) as DocumentPipelineStage,
      progress: Number(row.progress || 0),
      specializedType: row.specialized_type ? String(row.specialized_type) as SpecializedDocumentType : undefined,
      classifierMethod: row.classifier_method ? String(row.classifier_method) : undefined,
      classificationConfidence: row.classification_confidence != null ? String(row.classification_confidence) : undefined,
      documentFamilyKey: row.document_family_key ? String(row.document_family_key) : undefined,
      sourceSha256: row.source_sha256 ? String(row.source_sha256) : undefined,
      jobId: row.job_id ? String(row.job_id) : undefined,
      reviewId: row.review_id ? String(row.review_id) : undefined,
      registeredEntityId: row.registered_entity_id ? String(row.registered_entity_id) : undefined,
      extraction: row.extraction as SpecializedExtraction | undefined,
      stageHistory: Array.isArray(row.stage_history) ? row.stage_history as DocumentPipelineRunView['stageHistory'] : [],
      error: row.error ? String(row.error) : undefined,
      startedAt: iso(row.started_at),
      completedAt: iso(row.completed_at),
      createdAt: iso(row.created_at) || new Date().toISOString(),
      updatedAt: iso(row.updated_at) || new Date().toISOString(),
    }
    if (!includeDetails) return run
    const [fields, findings, comparisons] = await Promise.all([
      getPool().query(`select * from alix_document_field where run_id = $1 order by field_key, confidence desc`, [run.id]),
      getPool().query(`select * from alix_document_finding where run_id = $1 order by case severity when 'critical' then 4 when 'high' then 3 when 'warning' then 2 else 1 end desc, created_at`, [run.id]),
      getPool().query(`select * from alix_document_comparison where run_id = $1 order by created_at desc`, [run.id]),
    ])
    run.fields = fields.rows.map(fieldFromRow)
    run.findings = findings.rows.map((item) => ({
      id: String(item.id), kind: String(item.kind) as DocumentPipelineFinding['kind'], severity: String(item.severity) as DocumentPipelineFinding['severity'],
      fieldKey: item.field_key ? String(item.field_key) : undefined, title: String(item.title), description: String(item.description),
      relatedDocumentIds: Array.isArray(item.related_document_ids) ? item.related_document_ids.map(String) : [],
      evidence: Array.isArray(item.evidence) ? item.evidence : [], status: String(item.status) as DocumentPipelineFinding['status'],
    }))
    run.comparisons = comparisons.rows.map((item) => ({
      id: String(item.id), baselineRunId: item.baseline_run_id ? String(item.baseline_run_id) : undefined,
      comparisonType: String(item.comparison_type), similarity: item.similarity != null ? String(item.similarity) : undefined,
      changedFields: Array.isArray(item.changed_fields) ? item.changed_fields as DocumentFieldChange[] : [],
      summary: String(item.summary), createdAt: iso(item.created_at) || new Date().toISOString(),
    }))
    return run
  }
}

export function validateDocument(doc: IngestedDocument): DocumentPipelineFinding[] {
  const findings: DocumentPipelineFinding[] = []
  const normalizedMime = String(doc.mimetype || '').toLowerCase().split(';')[0].trim()
  if (!MIME_ALLOWLIST.has(normalizedMime)) {
    findings.push({ kind: 'validation', severity: 'critical', title: 'Formato não permitido', description: `MIME ${doc.mimetype} não pertence à lista segura.` })
  }
  if (!doc.extractedText?.trim() && !doc.imageBase64) {
    findings.push({ kind: 'validation', severity: 'critical', title: 'Documento sem conteúdo legível', description: 'Parser/OCR não encontrou texto ou imagem utilizável.' })
  }
  if (doc.sizeBytes <= 0) findings.push({ kind: 'validation', severity: 'critical', title: 'Arquivo vazio', description: 'O documento possui zero bytes.' })
  if (!doc.clienteId) findings.push({ kind: 'validation', severity: 'info', title: 'Escopo apenas da sessão', description: 'O arquivo ainda não está vinculado a um cliente do CRM; cruzamentos globais ficaram limitados.' })
  return findings
}

export function compareDocumentFields(previous: SpecializedField[], current: SpecializedField[]): DocumentFieldChange[] {
  const previousMap = new Map(previous.map((item) => [item.fieldKey, item.valueText]))
  const currentMap = new Map(current.map((item) => [item.fieldKey, item.valueText]))
  const keys = new Set([...previousMap.keys(), ...currentMap.keys()])
  const changes: DocumentFieldChange[] = []
  for (const key of [...keys].sort()) {
    const before = previousMap.get(key)
    const after = currentMap.get(key)
    if (before === after) continue
    changes.push({
      fieldKey: key,
      previousValue: before,
      currentValue: after,
      change: before == null ? 'added' : after == null ? 'removed' : 'changed',
    })
  }
  return changes
}

export function fieldSimilarity(previous: SpecializedField[], current: SpecializedField[]): number {
  const a = new Set(previous.map((item) => `${item.fieldKey}:${item.normalizedValue}`))
  const b = new Set(current.map((item) => `${item.fieldKey}:${item.normalizedValue}`))
  const union = new Set([...a, ...b])
  if (union.size === 0) return 1
  let intersection = 0
  for (const item of a) if (b.has(item)) intersection += 1
  return intersection / union.size
}

function deduplicateFindings(findings: DocumentPipelineFinding[]): DocumentPipelineFinding[] {
  const byKey = new Map<string, DocumentPipelineFinding>()
  for (const item of findings) {
    const key = `${item.kind}:${item.fieldKey || ''}:${item.description}`
    if (!byKey.has(key)) byKey.set(key, item)
  }
  return [...byKey.values()]
}

function fieldFromRow(row: Record<string, unknown>): DocumentPipelineField {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {}
  return {
    id: String(row.id),
    fieldKey: String(row.field_key), valueText: String(row.value_text), normalizedValue: String(row.normalized_value),
    valueType: String(row.value_type) as SpecializedField['valueType'], confidence: Number(row.confidence || 0),
    evidenceText: String(row.evidence_text), evidenceSource: String(row.evidence_source),
    page: row.page ? Number(row.page) : undefined, sheet: row.sheet ? String(row.sheet) : undefined,
    expiresAt: iso(row.expires_at), extractor: String(metadata.extractor || 'deterministic') as SpecializedField['extractor'],
    status: String(row.status || 'extracted') as DocumentPipelineField['status'],
    reviewedBy: metadata.reviewedBy ? String(metadata.reviewedBy) : undefined,
    reviewedAt: iso(metadata.reviewedAt),
    reviewNote: metadata.reviewNote ? String(metadata.reviewNote) : undefined,
  }
}

function iso(value: unknown): string | undefined {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

let singleton: DocumentPipelineService | null = null

export function getDocumentPipelineService(): DocumentPipelineService {
  if (!singleton) singleton = new DocumentPipelineService()
  return singleton
}

export async function runSpecializedDocumentPipeline(input: ProcessInput): Promise<DocumentPipelineRunView> {
  return getDocumentPipelineService().process(input)
}
