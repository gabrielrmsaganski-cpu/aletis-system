import { randomUUID } from 'crypto'
import { and, desc, eq, lt, or, sql } from 'drizzle-orm'
import { getDb, isPgEnabled } from '../../db/client.js'
import { automationEvent } from '../../db/schema.js'
import { getN8nAutomationService } from '../integrations/N8nAutomationService.js'

export interface AutomationEventInput {
  eventType: string
  payload?: Record<string, unknown>
  targetProvider?: 'internal' | 'n8n'
  targetUrl?: string
  metadata?: Record<string, unknown>
  dispatch?: boolean
}

export interface AutomationEventRecord {
  id: string
  eventType: string
  payload: Record<string, unknown>
  status: string
  attempts: number
  error?: string | null
  targetProvider: string
  targetUrl?: string | null
  metadata?: Record<string, unknown>
  criadoEm: string
  processedAt?: string | null
}

const memoryEvents: AutomationEventRecord[] = []

function project(row: any): AutomationEventRecord {
  return {
    id: row.id,
    eventType: row.eventType ?? row.event_type,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    status: row.status,
    attempts: Number(row.attempts ?? 0),
    error: row.error,
    targetProvider: row.targetProvider ?? row.target_provider ?? 'internal',
    targetUrl: row.targetUrl ?? row.target_url,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    criadoEm: (row.criadoEm ?? row.criado_em) instanceof Date ? (row.criadoEm ?? row.criado_em).toISOString() : String(row.criadoEm ?? row.criado_em ?? new Date().toISOString()),
    processedAt: row.processedAt instanceof Date ? row.processedAt.toISOString() : row.processed_at,
  }
}

export class AutomationEventService {
  async record(input: AutomationEventInput): Promise<AutomationEventRecord> {
    const id = `auto_${randomUUID()}`
    const targetProvider = input.targetProvider || 'internal'
    const payload = input.payload || {}
    let record: AutomationEventRecord = {
      id,
      eventType: input.eventType,
      payload,
      status: 'queued',
      attempts: 0,
      targetProvider,
      targetUrl: input.targetUrl,
      metadata: input.metadata || {},
      criadoEm: new Date().toISOString(),
    }

    if (isPgEnabled()) {
      const [inserted] = await getDb().insert(automationEvent).values({
        id, eventType: input.eventType, payload, status: 'queued', attempts: 0,
        targetProvider, targetUrl: input.targetUrl ?? null, metadata: input.metadata || {},
      }).returning()
      record = project(inserted)
    } else {
      memoryEvents.unshift(record)
    }

    // Falha de persistência rejeita antes de qualquer chamada externa.
    if (input.dispatch) return this.dispatch(record)
    return record
  }

  async dispatch(record: AutomationEventRecord): Promise<AutomationEventRecord> {
    let claimed = record
    if (isPgEnabled()) {
      const [row] = await getDb().update(automationEvent).set({
        status: 'processing', attempts: sql`${automationEvent.attempts} + 1`,
        nextAttemptAt: sql`now() + interval '60 seconds'`,
      }).where(and(eq(automationEvent.id, record.id), lt(automationEvent.attempts, 5),
        or(eq(automationEvent.status, 'queued'), and(eq(automationEvent.status, 'failed'),
          sql`(${automationEvent.nextAttemptAt} IS NULL OR ${automationEvent.nextAttemptAt} <= now())`)),
      )).returning()
      if (!row) {
        const [existing] = await getDb().select().from(automationEvent).where(eq(automationEvent.id, record.id)).limit(1)
        if (!existing) throw new Error('Evento de automação não persistido.')
        return project(existing)
      }
      // Usa o conteúdo persistido, nunca uma cópia possivelmente obsoleta do caller.
      claimed = project(row)
    } else {
      const idx = memoryEvents.findIndex(event => event.id === record.id)
      if (idx < 0) throw new Error('Evento de automação não registrado.')
      if (!['queued', 'failed'].includes(memoryEvents[idx].status)) return memoryEvents[idx]
      claimed = { ...memoryEvents[idx], status: 'processing', attempts: memoryEvents[idx].attempts + 1 }
      memoryEvents[idx] = claimed
    }

    let result: { ok: boolean; skipped?: boolean; detail?: unknown }
    try {
      result = claimed.targetProvider === 'n8n'
        ? await getN8nAutomationService().dispatch({ id: claimed.id, eventType: claimed.eventType, payload: claimed.payload })
        : { ok: true, skipped: true, detail: 'internal event recorded' }
    } catch {
      result = { ok: false, detail: 'Falha ao despachar automação.' }
    }
    const status = result.ok ? (result.skipped ? 'skipped' : 'succeeded') : 'failed'
    const error = result.ok ? null : 'Falha ao despachar automação. Consulte o provedor antes de tentar novamente.'
    const processedAt = new Date()
    const nextAttemptAt = result.ok ? null : new Date(Date.now() + Math.min(300, 15 * 2 ** (claimed.attempts - 1)) * 1000)
    if (isPgEnabled()) {
      const [updated] = await getDb().update(automationEvent).set({ status, error, processedAt, nextAttemptAt })
        .where(and(eq(automationEvent.id, claimed.id), eq(automationEvent.status, 'processing'), eq(automationEvent.attempts, claimed.attempts))).returning()
      if (!updated) throw new Error('O resultado da automação não pôde ser confirmado.')
      return project(updated)
    }
    const next = { ...claimed, status, error, processedAt: processedAt.toISOString() }
    const idx = memoryEvents.findIndex(event => event.id === claimed.id)
    memoryEvents[idx] = next
    return next
  }

  /**
   * Os efeitos de domínio já estão no mesmo commit do recibo. Este consumidor
   * encerra apenas os recibos internos novos, inclusive depois de um reinício.
   * Não reenvia eventos históricos nem aciona integrações externas.
   */
  async processInternalWorkflowEvents(): Promise<number> {
    if (!isPgEnabled()) return 0
    const result = await getDb().execute(sql`
      WITH pending AS (
        SELECT id FROM automation_event
        WHERE status = 'queued' AND target_provider = 'internal'
          AND metadata->>'source' = 'proposal_workflow'
        ORDER BY criado_em, id LIMIT 100 FOR UPDATE SKIP LOCKED
      )
      UPDATE automation_event AS event
      SET status = 'succeeded', attempts = event.attempts + 1, processed_at = now(), error = NULL
      FROM pending WHERE event.id = pending.id RETURNING event.id
    `)
    return result.rows.length
  }

  async list(limit = 100): Promise<AutomationEventRecord[]> {
    if (isPgEnabled()) {
      const rows = await getDb().select().from(automationEvent).orderBy(desc(automationEvent.criadoEm)).limit(limit)
      return rows.map(project)
    }
    return memoryEvents.slice(0, limit)
  }
}

let singleton: AutomationEventService | null = null

export function getAutomationEventService(): AutomationEventService {
  if (!singleton) singleton = new AutomationEventService()
  return singleton
}
