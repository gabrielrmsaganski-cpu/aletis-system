import { createHash, randomUUID } from 'node:crypto'

import { getPool, isPgEnabled } from '../../../db/client.js'
import { getAlixConfirmationStore } from '../AlixConfirmationStore.js'
import { OPERATIONAL_ACTIVE_CLIENT_STAGES, authorizedDocumentaryClientIds, readOperationalDocumentaryRecords, type OperationalActor } from '../workspace/OperationalDocumentarySource.js'
import { isDriveCorpusAdministrator } from '../../google-workspace/DriveCorpusService.js'

export type GovernanceReleaseStatus = 'draft' | 'evaluating' | 'evaluated' | 'approved' | 'rejected' | 'active' | 'rolled_back'
export type AutomationSuggestionStatus = 'pending_review' | 'awaiting_confirmation' | 'approved' | 'auto_executed' | 'executed' | 'dismissed' | 'expired' | 'failed'
export type AutomationRisk = 'read' | 'internal' | 'write' | 'external' | 'critical'

export interface GovernanceThresholds {
  minPassRate: number
  minEvidenceRate: number
  minSampleSize: number
  maxCriticalFailures: number
}

export interface GovernanceMetrics {
  sampleSize: number
  passed: number
  failed: number
  passRate: number
  evidenceRate: number
  criticalFailures: number
  extractionPrecision?: number
  latencyP95Ms?: number
  costUsd?: string
}

export interface GovernanceGateDecision {
  passed: boolean
  checks: Array<{ key: keyof GovernanceThresholds; passed: boolean; actual: number; required: number; operator: '>=' | '<=' }>
  reasons: string[]
}

export interface AutomationSuggestionInput {
  fingerprint?: string
  clienteId?: string
  suggestionType: string
  title: string
  description: string
  severity?: 'info' | 'important' | 'critical'
  riskLevel?: AutomationRisk
  sources?: unknown[]
  proposedAction?: { toolName?: string; payload?: Record<string, unknown>; label?: string; operationalItemId?: string }
  status?: AutomationSuggestionStatus
  metadata?: Record<string, unknown>
}

const DEFAULT_THRESHOLDS: GovernanceThresholds = {
  minPassRate: 0.95,
  minEvidenceRate: 0.98,
  minSampleSize: 100,
  maxCriticalFailures: 0,
}

const memoryReleases: Array<Record<string, unknown>> = []
const memoryRuns: Array<Record<string, unknown>> = []
const memorySuggestions: Array<Record<string, unknown>> = []
const memoryApprovals: Array<Record<string, unknown>> = []

function clampRate(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(1, parsed))
}

function safeCount(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.trunc(parsed))
}

function clean(value: unknown, max = 2_000): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.slice(0, max)
}

function iso(value: unknown): string | undefined {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function rowRelease(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    component: row.component,
    changeType: row.change_type ?? row.changeType,
    candidateVersion: row.candidate_version ?? row.candidateVersion,
    baselineVersion: row.baseline_version ?? row.baselineVersion,
    status: row.status,
    thresholds: jsonObject(row.thresholds),
    metrics: jsonObject(row.metrics),
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    datasetVersion: Number(row.dataset_version ?? row.datasetVersion ?? 1),
    evaluationPassed: Boolean(row.evaluation_passed ?? row.evaluationPassed),
    createdBy: row.created_by ?? row.createdBy,
    reviewedBy: row.reviewed_by ?? row.reviewedBy,
    reviewedAt: iso(row.reviewed_at ?? row.reviewedAt),
    activatedAt: iso(row.activated_at ?? row.activatedAt),
    createdAt: iso(row.created_at ?? row.createdAt),
    updatedAt: iso(row.updated_at ?? row.updatedAt),
  }
}

function rowSuggestion(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    clienteId: row.cliente_id ?? row.clienteId,
    suggestionType: row.suggestion_type ?? row.suggestionType,
    title: row.title,
    description: row.description,
    severity: row.severity,
    riskLevel: row.risk_level ?? row.riskLevel,
    status: row.status,
    sources: Array.isArray(row.sources) ? row.sources : [],
    proposedAction: jsonObject(row.proposed_action ?? row.proposedAction),
    confirmationId: row.confirmation_id ?? row.confirmationId,
    detectedAt: iso(row.detected_at ?? row.detectedAt),
    lastSeenAt: iso(row.last_seen_at ?? row.lastSeenAt),
    resolvedAt: iso(row.resolved_at ?? row.resolvedAt),
    resolvedBy: row.resolved_by ?? row.resolvedBy,
    metadata: jsonObject(row.metadata),
  }
}

export function evaluateGovernanceGate(
  rawMetrics: Partial<GovernanceMetrics>,
  rawThresholds: Partial<GovernanceThresholds> = {},
): GovernanceGateDecision {
  const thresholds: GovernanceThresholds = {
    minPassRate: clampRate(rawThresholds.minPassRate ?? DEFAULT_THRESHOLDS.minPassRate),
    minEvidenceRate: clampRate(rawThresholds.minEvidenceRate ?? DEFAULT_THRESHOLDS.minEvidenceRate),
    minSampleSize: Math.max(1, safeCount(rawThresholds.minSampleSize ?? DEFAULT_THRESHOLDS.minSampleSize)),
    maxCriticalFailures: safeCount(rawThresholds.maxCriticalFailures ?? DEFAULT_THRESHOLDS.maxCriticalFailures),
  }
  const sampleSize = safeCount(rawMetrics.sampleSize)
  const passed = safeCount(rawMetrics.passed)
  const passRate = clampRate(rawMetrics.passRate ?? (sampleSize ? passed / sampleSize : 0))
  const evidenceRate = clampRate(rawMetrics.evidenceRate)
  const criticalFailures = safeCount(rawMetrics.criticalFailures)
  const checks: GovernanceGateDecision['checks'] = [
    { key: 'minPassRate', passed: passRate >= thresholds.minPassRate, actual: passRate, required: thresholds.minPassRate, operator: '>=' },
    { key: 'minEvidenceRate', passed: evidenceRate >= thresholds.minEvidenceRate, actual: evidenceRate, required: thresholds.minEvidenceRate, operator: '>=' },
    { key: 'minSampleSize', passed: sampleSize >= thresholds.minSampleSize, actual: sampleSize, required: thresholds.minSampleSize, operator: '>=' },
    { key: 'maxCriticalFailures', passed: criticalFailures <= thresholds.maxCriticalFailures, actual: criticalFailures, required: thresholds.maxCriticalFailures, operator: '<=' },
  ]
  const reasons = checks.filter((item) => !item.passed).map((item) => (
    `${item.key}: obtido ${item.actual}, exigido ${item.operator} ${item.required}`
  ))
  return { passed: checks.every((item) => item.passed), checks, reasons }
}

function fingerprint(input: AutomationSuggestionInput): string {
  if (input.fingerprint) return clean(input.fingerprint, 128)
  const action = input.proposedAction || {}
  const material = JSON.stringify({
    type: input.suggestionType,
    clienteId: input.clienteId || '',
    title: clean(input.title, 240),
    toolName: action.toolName || '',
    payload: action.payload || {},
  })
  return createHash('sha256').update(material).digest('hex')
}

export class AlixGovernanceService {
  async createRelease(input: {
    component: string
    changeType: 'prompt' | 'model' | 'policy' | 'workflow'
    candidateVersion: string
    baselineVersion?: string
    thresholds?: Partial<GovernanceThresholds>
    datasetVersion?: number
    createdBy?: string
  }): Promise<Record<string, unknown>> {
    const id = `govrel_${randomUUID()}`
    const thresholds = { ...DEFAULT_THRESHOLDS, ...(input.thresholds || {}) }
    const row = {
      id,
      component: clean(input.component, 160),
      changeType: input.changeType,
      candidateVersion: clean(input.candidateVersion, 180),
      baselineVersion: input.baselineVersion ? clean(input.baselineVersion, 180) : undefined,
      status: 'draft' as GovernanceReleaseStatus,
      thresholds,
      metrics: {},
      evidence: [],
      datasetVersion: Math.max(1, safeCount(input.datasetVersion || 1)),
      evaluationPassed: false,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    if (!row.component || !row.candidateVersion) throw new Error('Componente e versão candidata são obrigatórios.')
    if (!isPgEnabled()) {
      if (memoryReleases.some((item) => item.component === row.component && item.candidateVersion === row.candidateVersion)) {
        throw new Error('Já existe uma release para este componente e versão.')
      }
      memoryReleases.unshift(row)
      return row
    }
    const result = await getPool().query(
      `insert into alix_governance_release (
         id, component, change_type, candidate_version, baseline_version,
         status, thresholds, metrics, evidence, dataset_version,
         evaluation_passed, created_by
       ) values ($1,$2,$3,$4,$5,'draft',$6::jsonb,'{}'::jsonb,'[]'::jsonb,$7,false,$8)
       returning *`,
      [id, row.component, row.changeType, row.candidateVersion, row.baselineVersion || null, JSON.stringify(thresholds), row.datasetVersion, input.createdBy || null],
    )
    return rowRelease(result.rows[0])
  }

  async recordEvaluation(input: {
    releaseId: string
    suite: string
    datasetVersion?: number
    sampleSize: number
    passed: number
    failed: number
    evidenceRate: number
    criticalFailures?: number
    extractionPrecision?: number
    latencyP95Ms?: number
    costUsd?: string
    evidence?: unknown[]
    gitSha?: string
    createdBy?: string
  }): Promise<{ run: Record<string, unknown>; release: Record<string, unknown>; gate: GovernanceGateDecision }> {
    const release = await this.getRelease(input.releaseId)
    if (!release) throw new Error('Release de governança não encontrada.')
    if (['approved', 'active', 'rolled_back'].includes(String(release.status))) {
      throw new Error(`Release no status ${release.status} não aceita nova avaliação.`)
    }
    const sampleSize = safeCount(input.sampleSize)
    const passed = safeCount(input.passed)
    const failed = safeCount(input.failed)
    if (sampleSize < 1 || passed + failed !== sampleSize) throw new Error('passed + failed deve ser igual ao sampleSize.')
    const metrics: GovernanceMetrics = {
      sampleSize,
      passed,
      failed,
      passRate: sampleSize ? passed / sampleSize : 0,
      evidenceRate: clampRate(input.evidenceRate),
      criticalFailures: safeCount(input.criticalFailures),
      ...(input.extractionPrecision == null ? {} : { extractionPrecision: clampRate(input.extractionPrecision) }),
      ...(input.latencyP95Ms == null ? {} : { latencyP95Ms: Math.max(0, Number(input.latencyP95Ms) || 0) }),
      ...(input.costUsd == null ? {} : { costUsd: clean(input.costUsd, 40) }),
    }
    const gate = evaluateGovernanceGate(metrics, release.thresholds as Partial<GovernanceThresholds>)
    const runId = `goveval_${randomUUID()}`
    const now = new Date().toISOString()
    const run = {
      id: runId,
      releaseId: input.releaseId,
      suite: clean(input.suite, 180),
      datasetVersion: Math.max(1, safeCount(input.datasetVersion || release.datasetVersion || 1)),
      sampleSize,
      passed,
      failed,
      metrics,
      evidence: input.evidence || [],
      gitSha: input.gitSha,
      createdBy: input.createdBy,
      createdAt: now,
    }
    if (!isPgEnabled()) {
      memoryRuns.unshift(run)
      Object.assign(release, { status: 'evaluated', metrics, evidence: input.evidence || [], evaluationPassed: gate.passed, updatedAt: now })
      return { run, release, gate }
    }
    const client = await getPool().connect()
    try {
      await client.query('begin')
      await client.query(
        `insert into alix_governance_eval_run (
           id, release_id, suite, dataset_version, sample_size, passed, failed,
           metrics, evidence, git_sha, created_by
         ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)`,
        [runId, input.releaseId, run.suite, run.datasetVersion, sampleSize, passed, failed, JSON.stringify(metrics), JSON.stringify(run.evidence), input.gitSha || null, input.createdBy || null],
      )
      const updated = await client.query(
        `update alix_governance_release set
           status = 'evaluated', metrics = $2::jsonb, evidence = $3::jsonb,
           evaluation_passed = $4, updated_at = now()
         where id = $1 returning *`,
        [input.releaseId, JSON.stringify(metrics), JSON.stringify(run.evidence), gate.passed],
      )
      await client.query('commit')
      return { run, release: rowRelease(updated.rows[0]), gate }
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async approveRelease(id: string, input: { actorId: string; decision: 'approve' | 'reject' }): Promise<Record<string, unknown>> {
    const release = await this.getRelease(id)
    if (!release) throw new Error('Release de governança não encontrada.')
    if (input.decision === 'approve' && (release.status !== 'evaluated' || !release.evaluationPassed)) {
      throw new Error('Promoção bloqueada: a release precisa concluir e passar pelas avaliações.')
    }
    const status: GovernanceReleaseStatus = input.decision === 'approve' ? 'approved' : 'rejected'
    const now = new Date().toISOString()
    if (!isPgEnabled()) {
      Object.assign(release, { status, reviewedBy: input.actorId, reviewedAt: now, updatedAt: now })
      return release
    }
    const result = await getPool().query(
      `update alix_governance_release set status = $2, reviewed_by = $3,
         reviewed_at = now(), updated_at = now() where id = $1 returning *`,
      [id, status, input.actorId],
    )
    return rowRelease(result.rows[0])
  }

  async activateRelease(id: string, actorId: string): Promise<Record<string, unknown>> {
    const release = await this.getRelease(id)
    if (!release) throw new Error('Release de governança não encontrada.')
    if (release.status !== 'approved' || !release.evaluationPassed || !release.reviewedBy) {
      throw new Error('Ativação bloqueada: avaliação aprovada e revisão humana são obrigatórias.')
    }
    if (!isPgEnabled()) {
      for (const item of memoryReleases) {
        if (item.component === release.component && item.status === 'active') item.status = 'rolled_back'
      }
      Object.assign(release, { status: 'active', activatedAt: new Date().toISOString(), activatedBy: actorId })
      return release
    }
    const client = await getPool().connect()
    try {
      await client.query('begin')
      await client.query(
        `update alix_governance_release set status = 'rolled_back', updated_at = now()
         where component = $1 and status = 'active' and id <> $2`,
        [release.component, id],
      )
      const result = await client.query(
        `update alix_governance_release set status = 'active', activated_at = now(),
           updated_at = now(), evidence = evidence || $2::jsonb where id = $1 returning *`,
        [id, JSON.stringify([{ kind: 'activation', actorId, at: new Date().toISOString() }])],
      )
      await client.query('commit')
      return rowRelease(result.rows[0])
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async getRelease(id: string): Promise<Record<string, unknown> | null> {
    if (!isPgEnabled()) return memoryReleases.find((item) => item.id === id) || null
    const result = await getPool().query(`select * from alix_governance_release where id = $1 limit 1`, [id])
    return result.rows[0] ? rowRelease(result.rows[0]) : null
  }

  async listReleases(limit = 100): Promise<Array<Record<string, unknown>>> {
    const safeLimit = Math.max(1, Math.min(500, safeCount(limit) || 100))
    if (!isPgEnabled()) return memoryReleases.slice(0, safeLimit)
    const result = await getPool().query(`select * from alix_governance_release order by updated_at desc limit $1`, [safeLimit])
    return result.rows.map(rowRelease)
  }

  async upsertSuggestion(input: AutomationSuggestionInput): Promise<Record<string, unknown>> {
    const key = fingerprint(input)
    const id = `autosug_${randomUUID()}`
    const status = input.status || 'pending_review'
    const row = {
      id,
      fingerprint: key,
      clienteId: input.clienteId,
      suggestionType: clean(input.suggestionType, 120),
      title: clean(input.title, 240),
      description: clean(input.description, 4_000),
      severity: input.severity || 'info',
      riskLevel: input.riskLevel || 'read',
      status,
      sources: input.sources || [],
      proposedAction: input.proposedAction || {},
      detectedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      metadata: input.metadata || {},
    }
    if (!isPgEnabled()) {
      const existing = memorySuggestions.find((item) => item.fingerprint === key)
      if (existing) {
        Object.assign(existing, { ...row, id: existing.id, detectedAt: existing.detectedAt,
          status: ['dismissed', 'executed', 'auto_executed'].includes(String(existing.status)) ? existing.status : row.status,
          metadata: { ...jsonObject(existing.metadata), ...row.metadata } })
        return existing
      }
      memorySuggestions.unshift(row)
      return row
    }
    const result = await getPool().query(
      `insert into alix_automation_suggestion (
         id, fingerprint, cliente_id, suggestion_type, title, description,
         severity, risk_level, status, sources, proposed_action, metadata
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb)
       on conflict (fingerprint) do update set
         cliente_id = excluded.cliente_id,
         title = excluded.title,
         description = excluded.description,
         severity = excluded.severity,
         risk_level = excluded.risk_level,
         sources = excluded.sources,
         proposed_action = excluded.proposed_action,
         metadata = alix_automation_suggestion.metadata || excluded.metadata,
         last_seen_at = now(),
         status = case
           when alix_automation_suggestion.status in ('dismissed','executed','auto_executed')
             then alix_automation_suggestion.status
           else excluded.status
         end
       returning *`,
      [id, key, input.clienteId || null, row.suggestionType, row.title, row.description, row.severity, row.riskLevel, status, JSON.stringify(row.sources), JSON.stringify(row.proposedAction), JSON.stringify(row.metadata)],
    )
    return rowSuggestion(result.rows[0])
  }

  async ingestInsights(insights: Array<{
    id: string
    tipo: string
    urgencia: 'info' | 'importante' | 'critico'
    titulo: string
    detalhes: string
    payload?: Record<string, unknown>
  }>): Promise<number> {
    let written = 0
    for (const insight of insights) {
      const payload = insight.payload || {}
      const proposedAction = payload.suggestedTool
        ? { toolName: String(payload.suggestedTool), payload: jsonObject(payload.suggestedPayload), label: insight.titulo }
        : undefined
      await this.upsertSuggestion({
        fingerprint: clean(payload.uniqueKey || `${insight.tipo}:${payload.clienteId || ''}:${payload.propostaId || ''}:${insight.titulo}`, 128),
        clienteId: payload.clienteId ? String(payload.clienteId) : undefined,
        suggestionType: insight.tipo,
        title: insight.titulo,
        description: insight.detalhes,
        severity: insight.urgencia === 'critico' ? 'critical' : insight.urgencia === 'importante' ? 'important' : 'info',
        riskLevel: proposedAction ? 'write' : 'read',
        sources: [{ kind: 'proactive_insight', id: insight.id }],
        proposedAction,
        metadata: { originalInsightId: insight.id },
      })
      written += 1
    }
    return written
  }

  async scanDeterministicCandidates(actor?: OperationalActor): Promise<{ findings: number; expiring: number; contestedFacts: number }> {
    if (!isPgEnabled()) return { findings: 0, expiring: 0, contestedFacts: 0 }
    const clientIds = actor ? await authorizedDocumentaryClientIds(actor)
      : (await getPool().query("select id from cliente where coalesce(payload->'identityMerge'->>'status','') <> 'merged' and estagio = any($1::text[])", [OPERATIONAL_ACTIVE_CLIENT_STAGES])).rows.map(row => String(row.id))
    const records = await readOperationalDocumentaryRecords(clientIds)
    for (const record of records) {
      await this.upsertSuggestion({
        fingerprint: `documentary:${record.id}`,
        clienteId: record.clienteId, suggestionType: record.kind, title: record.title,
        description: record.description, severity: record.severity, riskLevel: 'read',
        sources: [record.source, ...(record.relatedSources || [])],
        proposedAction: { label: 'Trabalhar com a ALIX', operationalItemId: `documentary:${record.id}` },
        metadata: { origin: 'operational_documentary' },
      })
    }
    // Resolver a fonte remove a prioridade; reconhecer a recomendação não a conclui.
    await getPool().query(`update alix_automation_suggestion set status = 'expired', resolved_at = now(),
        metadata = metadata || '{"resolutionReason":"source_no_longer_current"}'::jsonb
      where cliente_id = any($1::text[]) and status in ('pending_review','approved','failed')
        and (metadata->>'origin' = 'operational_documentary' or fingerprint like 'finding:%'
          or fingerprint like 'field-expiry:%' or fingerprint like 'contested-fact:%')
        and not (fingerprint = any($2::text[]))`, [clientIds, records.map(record => `documentary:${record.id}`)])
    return {
      findings: records.filter(record => record.source.kind === 'document_finding').length,
      expiring: records.filter(record => record.kind === 'field_expiry').length,
      contestedFacts: records.filter(record => record.kind === 'fact_divergence').length,
    }
  }

  async listSuggestions(input: { status?: AutomationSuggestionStatus; clienteId?: string; limit?: number; actor?: OperationalActor } = {}): Promise<Array<Record<string, unknown>>> {
    const limit = Math.max(1, Math.min(500, safeCount(input.limit) || 100))
    if (!isPgEnabled()) {
      return memorySuggestions.filter((item) => (!input.status || item.status === input.status) && (!input.clienteId || item.clienteId === input.clienteId)).slice(0, limit)
    }
    const params: unknown[] = []
    const where: string[] = []
    if (input.actor) {
      params.push(await authorizedDocumentaryClientIds(input.actor, input.clienteId))
      where.push(`(cliente_id = any($${params.length}::text[])${isDriveCorpusAdministrator(input.actor) ? ' or cliente_id is null' : ''})`)
    }
    if (input.status) { params.push(input.status); where.push(`status = $${params.length}`) }
    if (input.clienteId) { params.push(input.clienteId); where.push(`cliente_id = $${params.length}`) }
    params.push(limit)
    const result = await getPool().query(
      `select * from alix_automation_suggestion ${where.length ? `where ${where.join(' and ')}` : ''}
       order by case severity when 'critical' then 3 when 'important' then 2 else 1 end desc,
                last_seen_at desc limit $${params.length}`,
      params,
    )
    return result.rows.map(rowSuggestion)
  }

  async prepareSuggestion(id: string, actorId: string, actor?: OperationalActor): Promise<Record<string, unknown>> {
    const suggestion = (await this.listSuggestions({ limit: 500, actor })).find((item) => item.id === id)
    if (!suggestion) throw new Error('Sugestão não encontrada.')
    if (!['pending_review', 'failed'].includes(String(suggestion.status))) throw new Error(`Sugestão no status ${suggestion.status} não pode ser preparada.`)
    const action = jsonObject(suggestion.proposedAction)
    const toolName = clean(action.toolName, 180)
    if (!toolName) {
      return this.updateSuggestion(id, { status: 'pending_review', metadata: { acknowledgedBy: actorId, acknowledgedAt: new Date().toISOString(), executionPending: true } })
    }
    const payload = { ...jsonObject(action.payload), _governanceSuggestionId: id }
    const pending = getAlixConfirmationStore().create(
      toolName,
      clean(action.label || suggestion.title, 500),
      payload,
      undefined,
    )
    return this.updateSuggestion(id, {
      status: 'awaiting_confirmation',
      confirmationId: pending.id,
      resolvedBy: actorId,
      metadata: { approvalPreparedAt: new Date().toISOString(), approvalsRequired: pending.approvalsRequired },
    })
  }

  async dismissSuggestion(id: string, actorId: string, actor?: OperationalActor): Promise<Record<string, unknown>> {
    if (actor && !(await this.listSuggestions({ limit: 500, actor })).some(item => item.id === id)) throw new Error('Sugestão não encontrada neste contexto.')
    return this.updateSuggestion(id, { status: 'dismissed', resolvedBy: actorId, resolvedAt: new Date().toISOString() })
  }

  async markSuggestionExecuted(id: string, input: { actorId: string; status: 'executed' | 'failed'; details?: Record<string, unknown> }): Promise<void> {
    await this.updateSuggestion(id, {
      status: input.status,
      resolvedBy: input.actorId,
      resolvedAt: new Date().toISOString(),
      metadata: input.details || {},
    }).catch(() => undefined)
  }

  async recordDossierRefresh(input: { clienteId: string; notebookId: string; artifactId?: string; status: 'auto_executed' | 'failed'; reason: string; details?: Record<string, unknown> }): Promise<void> {
    await this.upsertSuggestion({
      fingerprint: `dossier-refresh:${input.notebookId}:${input.artifactId || 'none'}:${clean(input.reason, 120)}`,
      clienteId: input.clienteId,
      suggestionType: 'dossier_refresh',
      title: input.status === 'auto_executed' ? 'Dossiê atualizado por fatos novos' : 'Atualização automática do dossiê falhou',
      description: input.reason,
      severity: input.status === 'failed' ? 'important' : 'info',
      riskLevel: 'internal',
      status: input.status,
      sources: [{ kind: 'fact_ledger', clienteId: input.clienteId }, { kind: 'notebook', id: input.notebookId, artifactId: input.artifactId }],
      metadata: input.details,
    })
  }

  async recordApproval(input: {
    confirmationId: string
    batchId?: string
    actorId: string
    approvalStep: number
    decision: 'approved' | 'rejected' | 'executed' | 'failed'
    riskLevel: string
    toolName: string
    details?: Record<string, unknown>
  }): Promise<void> {
    const row = { id: `approval_${randomUUID()}`, ...input, createdAt: new Date().toISOString() }
    if (!isPgEnabled()) {
      memoryApprovals.unshift(row)
      return
    }
    await getPool().query(
      `insert into alix_confirmation_approval (
         id, confirmation_id, batch_id, actor_id, approval_step,
         decision, risk_level, tool_name, details
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [row.id, input.confirmationId, input.batchId || null, input.actorId, input.approvalStep, input.decision, input.riskLevel, input.toolName, JSON.stringify(input.details || {})],
    )
  }

  async dashboard(): Promise<Record<string, unknown>> {
    if (!isPgEnabled()) {
      return {
        releases: { total: memoryReleases.length, active: memoryReleases.filter((item) => item.status === 'active').length, blocked: memoryReleases.filter((item) => item.status === 'evaluated' && !item.evaluationPassed).length },
        evaluations: { total: memoryRuns.length },
        goldenSet: { total: 0, approved: 0, baseline: 0, candidate: 0 },
        extraction: { reviewed: 0, confirmed: 0, contested: 0, precision: null },
        approvals: { total: memoryApprovals.length, executed: memoryApprovals.filter((item) => item.decision === 'executed').length },
        automations: { pending: memorySuggestions.filter((item) => item.status === 'pending_review').length, awaitingConfirmation: memorySuggestions.filter((item) => item.status === 'awaiting_confirmation').length, autoExecuted: memorySuggestions.filter((item) => item.status === 'auto_executed').length },
      }
    }
    const [release, evals, golden, extraction, approvals, automation] = await Promise.all([
      getPool().query(`select count(*)::int total, count(*) filter (where status = 'active')::int active, count(*) filter (where status = 'evaluated' and not evaluation_passed)::int blocked from alix_governance_release`),
      getPool().query(`select count(*)::int total, coalesce(sum(sample_size),0)::int cases, coalesce(sum(passed),0)::int passed from alix_governance_eval_run`),
      getPool().query(`select count(*)::int total, count(*) filter (where review_status = 'approved')::int approved, count(*) filter (where review_status = 'baseline')::int baseline, count(*) filter (where review_status = 'candidate')::int candidate, coalesce(max(dataset_version),1)::int dataset_version from alix_golden_case`),
      getPool().query(`select count(*) filter (where status in ('confirmed','contested','rejected'))::int reviewed, count(*) filter (where status = 'confirmed')::int confirmed, count(*) filter (where status in ('contested','rejected'))::int contested from alix_document_field`),
      getPool().query(`select count(*)::int total, count(*) filter (where decision = 'executed')::int executed, count(*) filter (where decision = 'rejected')::int rejected, count(*) filter (where approval_step = 2 and decision = 'approved')::int double_approved from alix_confirmation_approval`),
      getPool().query(`select count(*) filter (where status = 'pending_review')::int pending, count(*) filter (where status = 'awaiting_confirmation')::int awaiting_confirmation, count(*) filter (where status = 'auto_executed')::int auto_executed, count(*) filter (where status = 'executed')::int executed, count(*) filter (where status = 'failed')::int failed from alix_automation_suggestion`),
    ])
    const extractionRow = extraction.rows[0] || {}
    const reviewed = Number(extractionRow.reviewed || 0)
    const confirmed = Number(extractionRow.confirmed || 0)
    return {
      generatedAt: new Date().toISOString(),
      releases: release.rows[0],
      evaluations: evals.rows[0],
      goldenSet: golden.rows[0],
      extraction: { ...extractionRow, precision: reviewed > 0 ? Number((confirmed / reviewed).toFixed(4)) : null },
      approvals: approvals.rows[0],
      automations: automation.rows[0],
      safeguards: {
        responseEvidenceGuard: process.env.ALIX_RESPONSE_GROUNDING !== 'false',
        documentWriteGuard: true,
        singleConfirmation: true,
        doubleConfirmationHighImpact: true,
        automaticExternalWrites: false,
      },
    }
  }

  private async updateSuggestion(id: string, patch: {
    status?: AutomationSuggestionStatus
    confirmationId?: string
    resolvedBy?: string
    resolvedAt?: string
    metadata?: Record<string, unknown>
  }): Promise<Record<string, unknown>> {
    if (!isPgEnabled()) {
      const row = memorySuggestions.find((item) => item.id === id)
      if (!row) throw new Error('Sugestão não encontrada.')
      Object.assign(row, patch, { lastSeenAt: new Date().toISOString(), metadata: { ...jsonObject(row.metadata), ...(patch.metadata || {}) } })
      return row
    }
    const result = await getPool().query(
      `update alix_automation_suggestion set
         status = coalesce($2, status),
         confirmation_id = coalesce($3, confirmation_id),
         resolved_by = coalesce($4, resolved_by),
         resolved_at = coalesce($5, resolved_at),
         metadata = metadata || $6::jsonb,
         last_seen_at = now()
       where id = $1 returning *`,
      [id, patch.status || null, patch.confirmationId || null, patch.resolvedBy || null, patch.resolvedAt ? new Date(patch.resolvedAt) : null, JSON.stringify(patch.metadata || {})],
    )
    if (!result.rows[0]) throw new Error('Sugestão não encontrada.')
    return rowSuggestion(result.rows[0])
  }
}

let singleton: AlixGovernanceService | null = null
export function getAlixGovernanceService(): AlixGovernanceService {
  if (!singleton) singleton = new AlixGovernanceService()
  return singleton
}
