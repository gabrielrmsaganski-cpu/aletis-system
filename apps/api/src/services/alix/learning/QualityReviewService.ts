// ============================================================
// Fila semanal de melhoria contínua da ALIX.
// Feedback negativo vira caso de qualidade rastreável, sem
// promover a observação do usuário automaticamente a fato.
// ============================================================

import { createHash, randomUUID } from 'node:crypto'

import { getPool, isPgEnabled } from '../../../db/client.js'
import type { FeedbackEntry, FeedbackReason } from './FeedbackService.js'

export type QualityCaseStatus = 'open' | 'investigating' | 'fixed' | 'dismissed'
export type QualitySeverity = 'critical' | 'high' | 'medium' | 'low'

export interface QualityCase {
  id: string
  feedbackId: number | null
  fingerprint: string
  category: string
  severity: QualitySeverity
  status: QualityCaseStatus
  summary: string
  context: Record<string, unknown>
  ownerId: string | null
  dueAt: string | null
  resolution: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

export function qualityCategory(entry: Pick<FeedbackEntry, 'rating' | 'motivo' | 'category'>): string {
  if (entry.category?.trim()) return entry.category.trim().slice(0, 80)
  if (entry.motivo) return entry.motivo
  if (entry.rating === 'incompleta') return 'dado_ausente'
  if (entry.rating === 'off-tom') return 'escrita'
  if (entry.rating === 'incorreto') return 'interpretacao'
  return 'feedback_positivo'
}

export function qualitySeverity(reason: FeedbackReason | undefined, rating: FeedbackEntry['rating']): QualitySeverity {
  if (reason === 'calculo' || reason === 'acao_indevida') return 'critical'
  if (reason === 'fonte_errada' || reason === 'dado_ausente' || reason === 'interpretacao') return 'high'
  if (rating === 'incorreto') return 'high'
  if (rating === 'incompleta' || rating === 'off-tom' || reason === 'escrita') return 'medium'
  return 'low'
}

function nextWeeklyReview(): Date {
  const due = new Date()
  due.setUTCDate(due.getUTCDate() + 7)
  due.setUTCHours(12, 0, 0, 0)
  return due
}

function rowToCase(row: Record<string, unknown>): QualityCase {
  const iso = (value: unknown): string | null => value instanceof Date
    ? value.toISOString()
    : typeof value === 'string' ? new Date(value).toISOString() : null
  return {
    id: String(row.id),
    feedbackId: row.feedback_id == null ? null : Number(row.feedback_id),
    fingerprint: String(row.fingerprint),
    category: String(row.category),
    severity: row.severity as QualitySeverity,
    status: row.status as QualityCaseStatus,
    summary: String(row.summary),
    context: row.context && typeof row.context === 'object' ? row.context as Record<string, unknown> : {},
    ownerId: row.owner_id == null ? null : String(row.owner_id),
    dueAt: iso(row.due_at),
    resolution: row.resolution == null ? null : String(row.resolution),
    createdAt: iso(row.created_at) || new Date(0).toISOString(),
    updatedAt: iso(row.updated_at) || new Date(0).toISOString(),
    resolvedAt: iso(row.resolved_at),
  }
}

export class QualityReviewService {
  async createFromFeedback(entry: FeedbackEntry, feedbackId: number | null): Promise<QualityCase | null> {
    if (entry.rating === 'util' || !isPgEnabled()) return null
    const category = qualityCategory(entry)
    const severity = qualitySeverity(entry.motivo, entry.rating)
    const fingerprint = createHash('sha256').update(JSON.stringify({
      rating: entry.rating,
      category,
      agent: entry.agent || 'alix',
      tools: [...(entry.tools || [])].sort(),
    })).digest('hex')
    const summary = (entry.notas || entry.expectedCorrection || `${entry.rating}: ${category}`)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1_000)
    const id = randomUUID()
    const result = await getPool().query(
      `insert into alix_quality_case (
         id, feedback_id, fingerprint, category, severity, status, summary,
         context, due_at, created_at, updated_at
       ) values ($1,$2,$3,$4,$5,'open',$6,$7::jsonb,$8,now(),now())
       on conflict (feedback_id) do update set
         category = excluded.category, severity = excluded.severity,
         summary = excluded.summary, context = excluded.context, updated_at = now()
       returning *`,
      [
        id,
        feedbackId,
        fingerprint,
        category,
        severity,
        summary || 'Feedback negativo sem observação adicional.',
        JSON.stringify({
          sessionId: entry.sessionId,
          messageId: entry.msgId,
          clienteId: entry.clienteId,
          missionId: entry.missionId,
          notebookId: entry.notebookId,
          artifactId: entry.artifactId,
          responseExcerpt: entry.responseExcerpt,
          expectedCorrection: entry.expectedCorrection,
          agent: entry.agent,
          tools: entry.tools,
        }),
        nextWeeklyReview(),
      ],
    )
    return result.rows[0] ? rowToCase(result.rows[0]) : null
  }

  async list(input: {
    status?: QualityCaseStatus
    category?: string
    currentWeek?: boolean
    limit?: number
  } = {}): Promise<QualityCase[]> {
    if (!isPgEnabled()) return []
    const conditions: string[] = []
    const params: unknown[] = []
    if (input.status) {
      params.push(input.status)
      conditions.push(`status = $${params.length}`)
    }
    if (input.category) {
      params.push(input.category)
      conditions.push(`category = $${params.length}`)
    }
    if (input.currentWeek) {
      conditions.push(`created_at >= date_trunc('week', now()) and created_at < date_trunc('week', now()) + interval '7 days'`)
    }
    params.push(Math.max(1, Math.min(500, input.limit || 100)))
    const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
    const result = await getPool().query(
      `select * from alix_quality_case ${where}
       order by
         case severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
         created_at desc
       limit $${params.length}`,
      params,
    )
    return result.rows.map(rowToCase)
  }

  async update(id: string, patch: {
    status?: QualityCaseStatus
    ownerId?: string | null
    resolution?: string | null
  }): Promise<QualityCase | null> {
    if (!isPgEnabled()) return null
    const result = await getPool().query(
      `update alix_quality_case set
         status = coalesce($2, status),
         owner_id = case when $3::boolean then $4 else owner_id end,
         resolution = case when $5::boolean then $6 else resolution end,
         resolved_at = case
           when $2 in ('fixed','dismissed') then now()
           when $2 in ('open','investigating') then null
           else resolved_at
         end,
         updated_at = now()
       where id = $1 returning *`,
      [
        id,
        patch.status || null,
        Object.prototype.hasOwnProperty.call(patch, 'ownerId'),
        patch.ownerId ?? null,
        Object.prototype.hasOwnProperty.call(patch, 'resolution'),
        patch.resolution ?? null,
      ],
    )
    return result.rows[0] ? rowToCase(result.rows[0]) : null
  }

  async weeklySummary(): Promise<{
    periodStart: string
    open: number
    investigating: number
    fixed: number
    critical: number
    byCategory: Array<{ category: string; total: number }>
    recurring: Array<{ fingerprint: string; category: string; total: number }>
  }> {
    const periodStart = new Date()
    periodStart.setUTCDate(periodStart.getUTCDate() - 7)
    if (!isPgEnabled()) {
      return { periodStart: periodStart.toISOString(), open: 0, investigating: 0, fixed: 0, critical: 0, byCategory: [], recurring: [] }
    }
    const [totals, categories, recurring] = await Promise.all([
      getPool().query(`select
        count(*) filter (where status = 'open')::int as open,
        count(*) filter (where status = 'investigating')::int as investigating,
        count(*) filter (where status = 'fixed')::int as fixed,
        count(*) filter (where severity = 'critical' and status not in ('fixed','dismissed'))::int as critical
        from alix_quality_case where created_at >= $1`, [periodStart]),
      getPool().query(`select category, count(*)::int as total from alix_quality_case where created_at >= $1 group by category order by total desc`, [periodStart]),
      getPool().query(`select fingerprint, min(category) as category, count(*)::int as total
        from alix_quality_case where created_at >= $1 group by fingerprint having count(*) > 1 order by total desc limit 20`, [periodStart]),
    ])
    const row = totals.rows[0] || {}
    return {
      periodStart: periodStart.toISOString(),
      open: Number(row.open || 0),
      investigating: Number(row.investigating || 0),
      fixed: Number(row.fixed || 0),
      critical: Number(row.critical || 0),
      byCategory: categories.rows.map((item) => ({ category: String(item.category), total: Number(item.total) })),
      recurring: recurring.rows.map((item) => ({ fingerprint: String(item.fingerprint), category: String(item.category), total: Number(item.total) })),
    }
  }
}

let singleton: QualityReviewService | null = null

export function getQualityReviewService(): QualityReviewService {
  singleton ||= new QualityReviewService()
  return singleton
}

