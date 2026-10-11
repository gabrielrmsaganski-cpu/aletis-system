// ============================================================
// ALETIS — ALIX Workspace por missões
//
// Converte cada pedido substancial em uma unidade operacional com modo,
// passos, fontes, custo, resultado estruturado e ciclo cancelável/retomável.
// PostgreSQL é a fonte principal; o snapshot em disco mantém a estratégia
// de compatibilidade e inspeção operacional já usada pelas sessões ALIX.
// ============================================================

import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { PoolClient } from 'pg'
import { z } from 'zod'

import { getPool, isPgEnabled } from '../../../db/client.js'

export const ALIX_WORK_MODES = [
  'client_analysis',
  'documentary',
  'negotiation',
  'research',
  'document_generation',
  'due_diligence',
] as const

export type AlixWorkMode = typeof ALIX_WORK_MODES[number]
export type AlixMissionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type AlixMissionStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface AlixMissionStructuredResult {
  conclusion: string
  facts: string[]
  risks: string[]
  gaps: string[]
  nextAction: string
  rawResponse: string
}

export interface AlixMissionStepView {
  id: string
  position: number
  code: string
  title: string
  status: AlixMissionStepStatus
  progress: number
  details?: string
  startedAt?: string
  completedAt?: string
}

export interface AlixMissionSourceView {
  id: string
  kind: string
  sourceId?: string
  label: string
  url?: string
  evidence: unknown
  createdAt: string
}

export interface AlixMissionView {
  id: string
  sessionId: string
  clienteId?: string
  consultorId?: string
  title: string
  prompt: string
  workMode: AlixWorkMode
  analysisMode: 'standard' | 'deep'
  status: AlixMissionStatus
  progress: number
  currentStep?: string
  queueName?: string
  jobId?: string
  costUsd: string
  inputTokens: number
  outputTokens: number
  model?: string
  result?: AlixMissionStructuredResult
  error?: string
  cancellable: boolean
  cancelledAt?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
  steps: AlixMissionStepView[]
  sources: AlixMissionSourceView[]
}

interface MissionStepDefinition { code: string; title: string; progress: number }

interface MissionMutation { client: PoolClient; snapshots: Map<string, AlixMissionView> }
const pendingMutations = new Map<string, Promise<void>>()
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(jsonValueSchema), z.record(jsonValueSchema)]))
const resultSchema = z.object({ conclusion: z.string(), facts: z.array(z.string()), risks: z.array(z.string()), gaps: z.array(z.string()), nextAction: z.string(), rawResponse: z.string() })

const MODE_STEPS: Record<AlixWorkMode, MissionStepDefinition[]> = {
  client_analysis: [
    { code: 'scope', title: 'Delimitar cliente e objetivo', progress: 10 },
    { code: 'gather', title: 'Cruzar CRM, documentos e fatos', progress: 35 },
    { code: 'analyze', title: 'Diagnosticar cenário e indicadores', progress: 65 },
    { code: 'synthesize', title: 'Priorizar riscos e oportunidades', progress: 85 },
    { code: 'deliver', title: 'Entregar conclusão e próxima ação', progress: 100 },
  ],
  documentary: [
    { code: 'scope', title: 'Identificar documentos e escopo', progress: 10 },
    { code: 'gather', title: 'Recuperar campos e evidências', progress: 35 },
    { code: 'analyze', title: 'Cruzar versões e divergências', progress: 65 },
    { code: 'synthesize', title: 'Consolidar riscos e lacunas', progress: 85 },
    { code: 'deliver', title: 'Preparar revisão documental', progress: 100 },
  ],
  negotiation: [
    { code: 'scope', title: 'Definir dívida, credor e objetivo', progress: 10 },
    { code: 'gather', title: 'Reunir contratos, propostas e capacidade', progress: 35 },
    { code: 'analyze', title: 'Simular cenários e concessões', progress: 65 },
    { code: 'synthesize', title: 'Montar estratégia e limites', progress: 85 },
    { code: 'deliver', title: 'Entregar roteiro de negociação', progress: 100 },
  ],
  research: [
    { code: 'scope', title: 'Definir pergunta e critérios', progress: 10 },
    { code: 'gather', title: 'Pesquisar fontes internas e externas', progress: 35 },
    { code: 'analyze', title: 'Validar atualidade e confiabilidade', progress: 65 },
    { code: 'synthesize', title: 'Comparar evidências', progress: 85 },
    { code: 'deliver', title: 'Entregar síntese com fontes', progress: 100 },
  ],
  document_generation: [
    { code: 'scope', title: 'Definir entrega, público e formato', progress: 10 },
    { code: 'gather', title: 'Reunir dados e fontes autorizadas', progress: 35 },
    { code: 'analyze', title: 'Validar conteúdo e lacunas', progress: 65 },
    { code: 'synthesize', title: 'Redigir e revisar artefato', progress: 85 },
    { code: 'deliver', title: 'Gerar arquivo e próximos passos', progress: 100 },
  ],
  due_diligence: [
    { code: 'scope', title: 'Definir objeto e materialidade', progress: 10 },
    { code: 'gather', title: 'Reunir documentos, cadastros e fontes', progress: 35 },
    { code: 'analyze', title: 'Testar consistência e riscos', progress: 65 },
    { code: 'synthesize', title: 'Classificar achados e pendências', progress: 85 },
    { code: 'deliver', title: 'Emitir conclusão e plano de mitigação', progress: 100 },
  ],
}

const MODE_PROMPTS: Record<AlixWorkMode, string> = {
  client_analysis: 'Priorize o contexto do cliente, indicadores, demandas, documentos e fatos confirmados. Diferencie diagnóstico, risco e recomendação.',
  documentary: 'Priorize documentos, evidências por campo, versões, divergências, duplicidades, validade e revisão humana antes de qualquer cadastro.',
  negotiation: 'Priorize contratos, capacidade de pagamento, cenários calculados, limites de concessão, estratégia e próximos movimentos com o credor.',
  research: 'Priorize fontes atuais e confiáveis, registre data e origem, confronte evidências e explicite o que é inferência.',
  document_generation: 'Priorize a finalidade, o público, os fatos autorizados, a rastreabilidade das fontes e a validação antes de gerar o artefato.',
  due_diligence: 'Priorize materialidade, consistência entre fontes, riscos jurídicos/financeiros/operacionais, red flags e pendências de comprovação.',
}

export class AlixMissionService {
  private readonly mutationContext = new AsyncLocalStorage<MissionMutation>()
  constructor(private readonly storageDir = join(process.cwd(), 'storage', 'alix-missions')) {}

  async create(input: {
    /** Identificador interno estável para preparações idempotentes. */
    id?: string
    sessionId: string
    clienteId?: string
    consultorId?: string
    prompt: string
    title?: string
    workMode?: AlixWorkMode
    analysisMode?: 'standard' | 'deep'
  }): Promise<AlixMissionView> {
    const workMode = normalizeWorkMode(input.workMode)
    const id = input.id || `mission_${randomUUID()}`
    if (!/^mission_[A-Za-z0-9_-]{1,160}$/.test(id)) throw new Error('Identificador interno da missão inválido.')
    const title = cleanText(input.title || input.prompt, 100) || 'Nova missão ALIX'
    const now = new Date().toISOString()
    const base: AlixMissionView = {
      id,
      sessionId: input.sessionId,
      clienteId: input.clienteId,
      consultorId: input.consultorId,
      title,
      prompt: cleanText(input.prompt, 20_000),
      workMode,
      analysisMode: input.analysisMode === 'standard' ? 'standard' : 'deep',
      status: 'queued',
      progress: 0,
      costUsd: '0.000000',
      inputTokens: 0,
      outputTokens: 0,
      cancellable: true,
      createdAt: now,
      updatedAt: now,
      steps: MODE_STEPS[workMode].map((step, position) => ({
        id: `missionstep_${randomUUID()}`,
        position,
        code: step.code,
        title: step.title,
        status: 'pending',
        progress: step.progress,
      })),
      sources: [],
    }
    if (isPgEnabled()) {
      const client = await getPool().connect()
      try {
        await client.query('begin')
        await client.query(
          `insert into alix_mission (
            id, session_id, cliente_id, consultor_id, title, prompt, work_mode,
            analysis_mode, status, progress, cost_usd, created_at, updated_at
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,'queued',0,0,now(),now())`,
          [id, input.sessionId, input.clienteId || null, input.consultorId || null, title, base.prompt, workMode, base.analysisMode],
        )
        for (const step of base.steps) {
          await client.query(
            `insert into alix_mission_step (id, mission_id, position, code, title, status, progress)
             values ($1,$2,$3,$4,$5,'pending',$6)`,
            [step.id, id, step.position, step.code, step.title, step.progress],
          )
        }
        await client.query(
          `insert into alix_mission_event (mission_id, event_type, status, payload) values ($1,'created','queued',$2::jsonb)`,
          [id, JSON.stringify({ workMode })],
        )
        await client.query('commit')
      } catch (error) {
        await client.query('rollback').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    }
    await this.writeSnapshot(base)
    return base
  }

  async get(id: string): Promise<AlixMissionView | null> {
    if (isPgEnabled()) {
      const result = await this.query(`select * from alix_mission where id = $1 limit 1`, [id])
      return result.rows[0] ? this.hydrate(result.rows[0]) : null
    }
    try {
      return JSON.parse(await fs.readFile(this.path(id), 'utf8')) as AlixMissionView
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async list(opts: { sessionId?: string; clienteId?: string; status?: AlixMissionStatus; limit?: number; consultorIds?: string[]; sharedSessionIds?: string[] } = {}): Promise<AlixMissionView[]> {
    if (!isPgEnabled()) return this.listSnapshots(opts)
    const params: unknown[] = []
    const where: string[] = []
    if (opts.sessionId) { params.push(opts.sessionId); where.push(`session_id = $${params.length}`) }
    if (opts.clienteId) { params.push(opts.clienteId); where.push(`cliente_id = $${params.length}`) }
    if (opts.status) { params.push(opts.status); where.push(`status = $${params.length}`) }
    if (opts.consultorIds) {
      params.push(opts.consultorIds, opts.sharedSessionIds || [])
      where.push(`(consultor_id = any($${params.length - 1}::text[]) or session_id = any($${params.length}::text[]))`)
    }
    params.push(Math.max(1, Math.min(100, opts.limit || 30)))
    const result = await this.query(
      `select * from alix_mission ${where.length ? `where ${where.join(' and ')}` : ''}
       order by created_at desc limit $${params.length}`,
      params,
    )
    return Promise.all(result.rows.map((row) => this.hydrate(row)))
  }

  async start(id: string, options: { exclusive?: boolean } = {}): Promise<AlixMissionView> {
    return this.mutate(id, async () => {
      const mission = await this.require(id)
      // A execução de modelo precisa de um único vencedor, inclusive entre
      // processos. Preparações determinísticas mantêm o start idempotente.
      if (options.exclusive && mission.status !== 'queued') {
        throw Object.assign(new Error('Este trabalho já foi iniciado. Abra a conversa para acompanhar o resultado.'), {
          code: 'ALIX_MISSION_ALREADY_STARTED', statusCode: 409,
        })
      }
      if (mission.status === 'cancelled' || mission.status === 'failed') throw new Error('Missão cancelada ou com falha; retome-a antes de executar.')
      if (mission.status === 'completed') return mission
      const nextStep = mission.steps.find((step) => step.code === mission.currentStep && step.status !== 'completed')
        || mission.steps.find((step) => step.status !== 'completed')
        || mission.steps[mission.steps.length - 1]
      const progress = Math.max(mission.progress, 5, nextStep.progress - 10)
      if (isPgEnabled()) {
        await this.query(
          `update alix_mission set status = 'running', progress = greatest(progress, $2),
           current_step = case when progress <= $2 then $3 else current_step end,
           started_at = coalesce(started_at, now()), error = null, updated_at = now()
           where id = $1 and status in ('queued','running')`,
          [id, progress, nextStep.code],
        )
        await this.setStep(id, nextStep.code, 'running', nextStep.code === 'scope'
          ? 'Escopo e contexto inicial em preparação.'
          : 'Missão retomada a partir do último passo não concluído.')
        await this.event(id, 'started', 'running', { code: nextStep.code, resumed: nextStep.code !== 'scope' })
        return this.refreshSnapshot(id)
      }
      mission.status = 'running'; mission.progress = progress; mission.currentStep = nextStep.code; mission.startedAt ||= new Date().toISOString(); mission.updatedAt = new Date().toISOString()
      nextStep.status = 'running'; nextStep.startedAt ||= mission.updatedAt
      await this.writeSnapshot(mission)
      return mission
    })
  }

  async advance(id: string, code: string, details?: string): Promise<AlixMissionView> {
    return this.mutate(id, async () => {
      const mission = await this.require(id)
      if (!['queued', 'running'].includes(mission.status)) return mission
      const target = mission.steps.find((step) => step.code === code)
      if (!target) throw new Error(`Passo desconhecido: ${code}`)
      const current = mission.steps.find((step) => step.code === mission.currentStep)
      if (target.status === 'completed' || (current && target.position < current.position)) return mission
      if (isPgEnabled()) {
        await this.query(
          `update alix_mission_step
           set status = 'completed', started_at = coalesce(started_at, now()), completed_at = now(),
               details = coalesce($3, details), updated_at = now()
           where mission_id = $1 and position < $2 and status not in ('completed','cancelled')`,
          [id, target.position, details || null],
        )
        await this.setStep(id, code, 'running', details)
        const progress = Math.max(mission.progress, 1, target.progress - 10)
        await this.query(
          `update alix_mission set status = 'running',
           current_step = case when progress <= $3 then $2 else current_step end,
           progress = greatest(progress, $3), updated_at = now()
           where id = $1 and status in ('queued','running')`,
          [id, code, progress],
        )
        await this.event(id, 'step_started', 'running', { code, details })
        return this.refreshSnapshot(id)
      }
      for (const step of mission.steps) if (step.position < target.position && step.status !== 'completed') step.status = 'completed'
      target.status = 'running'; target.startedAt ||= new Date().toISOString(); target.details = details
      mission.status = 'running'; mission.currentStep = code; mission.progress = Math.max(mission.progress, 1, target.progress - 10); mission.updatedAt = new Date().toISOString()
      await this.writeSnapshot(mission)
      return mission
    })
  }

  async addSources(id: string, sources: Array<{ kind: string; sourceId?: string; label: string; url?: string; evidence?: unknown }>): Promise<void> {
    if (sources.length === 0) return
    return this.mutate(id, async () => {
      const mission = await this.require(id)
      const existing = new Set(mission.sources.map((source) => `${source.kind}:${source.sourceId || ''}:${source.label}`))
      for (const source of sources) {
        const key = `${source.kind}:${source.sourceId || ''}:${source.label}`
        if (existing.has(key)) continue
        existing.add(key)
        const item: AlixMissionSourceView = {
          id: `missionsource_${randomUUID()}`,
          kind: cleanText(source.kind, 80) || 'source',
          sourceId: cleanText(source.sourceId, 300) || undefined,
          label: cleanText(source.label, 300) || 'Fonte consultada',
          url: cleanText(source.url, 1_500) || undefined,
          evidence: safeEvidence(source.evidence),
          createdAt: new Date().toISOString(),
        }
        mission.sources.push(item)
        if (isPgEnabled()) {
          await this.query(
            `insert into alix_mission_source (id, mission_id, kind, source_id, label, url, evidence)
             values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
            [item.id, id, item.kind, item.sourceId || null, item.label, item.url || null, JSON.stringify(jsonValueSchema.parse(item.evidence ?? {}))],
          )
        }
      }
      await this.writeSnapshot(isPgEnabled() ? await this.hydrateById(id) : mission)
    })
  }

  async complete(id: string, input: {
    response: string
    model?: string
    costUsd?: string
    inputTokens?: number
    outputTokens?: number
  }): Promise<AlixMissionView> {
    return this.mutate(id, async () => {
      const mission = await this.require(id)
      if (!['queued', 'running'].includes(mission.status)) return mission
      const result = resultSchema.parse(structureMissionResponse(input.response))
      if (isPgEnabled()) {
        await this.query(
          `update alix_mission_step
           set status = 'completed', started_at = coalesce(started_at, now()), completed_at = now(), updated_at = now()
           where mission_id = $1 and status <> 'cancelled'`,
          [id],
        )
        await this.query(
          `update alix_mission
           set status = 'completed', progress = 100, current_step = 'deliver', result = $2::jsonb,
               model = $3, cost_usd = $4, input_tokens = $5, output_tokens = $6,
               cancellable = false, completed_at = now(), updated_at = now(), error = null
           where id = $1 and status <> 'cancelled'`,
          [
            id, JSON.stringify(result), input.model || null, normalizeMoneyString(input.costUsd || '0'),
            Math.max(0, Math.trunc(input.inputTokens || 0)), Math.max(0, Math.trunc(input.outputTokens || 0)),
          ],
        )
        await this.event(id, 'completed', 'completed', { result: { conclusion: result.conclusion, nextAction: result.nextAction } })
        return this.refreshSnapshot(id)
      }
      mission.status = 'completed'; mission.progress = 100; mission.currentStep = 'deliver'; mission.result = result
      mission.model = input.model; mission.costUsd = normalizeMoneyString(input.costUsd || '0'); mission.inputTokens = input.inputTokens || 0; mission.outputTokens = input.outputTokens || 0
      mission.cancellable = false; mission.completedAt = new Date().toISOString(); mission.updatedAt = mission.completedAt
      mission.steps.forEach((step) => { step.status = 'completed'; step.completedAt ||= mission.completedAt })
      await this.writeSnapshot(mission)
      return mission
    })
  }

  async fail(id: string, error: unknown): Promise<AlixMissionView> {
    return this.mutate(id, async () => {
      const mission = await this.require(id)
      if (mission.status === 'cancelled' || mission.status === 'completed') return mission
      const message = cleanText(error instanceof Error ? error.message : error, 2_000) || 'Falha não especificada.'
      if (isPgEnabled()) {
        await this.query(
          `update alix_mission set status = 'failed', error = $2, cancellable = false, completed_at = now(), updated_at = now() where id = $1`,
          [id, message],
        )
        await this.query(
          `update alix_mission_step set status = 'failed', details = $2, completed_at = now(), updated_at = now()
           where mission_id = $1 and status = 'running'`,
          [id, message],
        )
        await this.event(id, 'failed', 'failed', { error: message })
        return this.refreshSnapshot(id)
      }
      mission.status = 'failed'; mission.error = message; mission.cancellable = false; mission.completedAt = new Date().toISOString(); mission.updatedAt = mission.completedAt
      mission.steps.filter((step) => step.status === 'running').forEach((step) => { step.status = 'failed'; step.details = message })
      await this.writeSnapshot(mission)
      return mission
    })
  }

  async cancel(id: string, actorId?: string): Promise<AlixMissionView> {
    return this.mutate(id, async () => {
      const mission = await this.require(id)
      if (mission.status === 'completed') throw new Error('Missão concluída não pode ser cancelada.')
      if (mission.status === 'cancelled') return mission
      if (isPgEnabled()) {
        await this.query(
          `update alix_mission set status = 'cancelled', cancellable = false, cancelled_at = now(), updated_at = now() where id = $1`,
          [id],
        )
        await this.query(
          `update alix_mission_step set status = 'cancelled', completed_at = now(), updated_at = now()
           where mission_id = $1 and status in ('pending','running')`,
          [id],
        )
        await this.event(id, 'cancelled', 'cancelled', { actorId })
        return this.refreshSnapshot(id)
      }
      mission.status = 'cancelled'; mission.cancellable = false; mission.cancelledAt = new Date().toISOString(); mission.updatedAt = mission.cancelledAt
      mission.steps.filter((step) => step.status !== 'completed').forEach((step) => { step.status = 'cancelled' })
      await this.writeSnapshot(mission)
      return mission
    })
  }

  async resume(id: string, actorId?: string): Promise<AlixMissionView> {
    return this.mutate(id, async () => {
      const mission = await this.require(id)
      if (!['cancelled', 'failed'].includes(mission.status)) throw new Error('Somente missão cancelada ou com falha pode ser retomada.')
      const firstOpen = mission.steps.find((step) => step.status !== 'completed') || mission.steps[0]
      if (isPgEnabled()) {
        await this.query(
          `update alix_mission set status = 'queued', progress = $2, current_step = $3,
           cancellable = true, cancelled_at = null, completed_at = null, error = null, updated_at = now()
           where id = $1`,
          [id, Math.max(mission.progress, 0, firstOpen.progress - 10), firstOpen.code],
        )
        await this.query(
          `update alix_mission_step set status = 'pending', completed_at = null, updated_at = now()
           where mission_id = $1 and status in ('failed','cancelled')`,
          [id],
        )
        await this.event(id, 'resumed', 'queued', { actorId })
        return this.refreshSnapshot(id)
      }
      mission.status = 'queued'; mission.progress = Math.max(mission.progress, 0, firstOpen.progress - 10); mission.cancellable = true; mission.cancelledAt = undefined; mission.completedAt = undefined; mission.error = undefined; mission.currentStep = firstOpen.code; mission.updatedAt = new Date().toISOString()
      mission.steps.filter((step) => ['failed', 'cancelled'].includes(step.status)).forEach((step) => { step.status = 'pending'; step.completedAt = undefined })
      await this.writeSnapshot(mission)
      return mission
    })
  }

  async stats(consultorIds?: string[], sharedSessionIds: string[] = []): Promise<Record<string, unknown>> {
    if (!isPgEnabled()) {
      const missions = await this.listSnapshots({ limit: 100, consultorIds, sharedSessionIds })
      return missionStats(missions)
    }
    const result = await this.query(
      `select status, count(*)::int total, coalesce(sum(cost_usd),0)::text cost_usd
       from alix_mission ${consultorIds ? 'where (consultor_id = any($1::text[]) or session_id = any($2::text[]))' : ''} group by status`,
      consultorIds ? [consultorIds, sharedSessionIds] : [],
    )
    const byStatus = Object.fromEntries(result.rows.map((row) => [String(row.status), Number(row.total)]))
    const costUsd = result.rows.reduce((sum, row) => decimalStringAdd(sum, String(row.cost_usd || '0')), '0.000000')
    return { total: Object.values(byStatus).reduce((sum, value) => sum + Number(value), 0), byStatus, costUsd }
  }

  private query(text: string, values?: unknown[]) {
    return (this.mutationContext.getStore()?.client || getPool()).query(text, values)
  }

  /** Cada transição lê e grava o mesmo estado sob lock. O snapshot só é
   * publicado depois do commit, evitando confirmação local de um rollback. */
  private async mutate<T>(id: string, task: () => Promise<T>): Promise<T> {
    const key = `${isPgEnabled() ? 'postgres' : this.storageDir}:${id}`
    const previous = pendingMutations.get(key) || Promise.resolve()
    let release!: () => void
    const hold = new Promise<void>(resolve => { release = resolve })
    const tail = previous.catch(() => undefined).then(() => hold)
    pendingMutations.set(key, tail)
    await previous.catch(() => undefined)
    let client: PoolClient | undefined
    let committed = false
    try {
      if (!isPgEnabled()) return await task()
      client = await getPool().connect()
      await client.query('begin')
      await client.query('select id from alix_mission where id = $1 for update', [id])
      const context: MissionMutation = { client, snapshots: new Map() }
      const result = await this.mutationContext.run(context, task)
      await client.query('commit')
      committed = true
      for (const mission of context.snapshots.values()) await this.publishSnapshot(mission)
      return result
    } catch (error) {
      if (client && !committed) await client.query('rollback').catch(() => undefined)
      throw error
    } finally {
      client?.release()
      release()
      if (pendingMutations.get(key) === tail) pendingMutations.delete(key)
    }
  }

  private async setStep(id: string, code: string, status: AlixMissionStepStatus, details?: string): Promise<void> {
    await this.query(
      `update alix_mission_step
       set status = $3, details = coalesce($4, details),
           started_at = case when $3 = 'running' then coalesce(started_at, now()) else started_at end,
           completed_at = case when $3 in ('completed','failed','cancelled') then now() else completed_at end,
           updated_at = now()
       where mission_id = $1 and code = $2
         and ($3 <> 'running' or status <> 'completed')`,
      [id, code, status, details || null],
    )
  }

  private async event(id: string, type: string, status?: string, payload: unknown = {}): Promise<void> {
    if (!isPgEnabled()) return
    await this.query(
      `insert into alix_mission_event (mission_id, event_type, status, payload) values ($1,$2,$3,$4::jsonb)`,
      [id, type, status || null, JSON.stringify(jsonValueSchema.parse(JSON.parse(JSON.stringify(payload ?? {}))))],
    )
  }

  private async hydrate(row: Record<string, unknown>): Promise<AlixMissionView> {
    const [steps, sources] = await Promise.all([
      this.query(`select * from alix_mission_step where mission_id = $1 order by position`, [row.id]),
      this.query(`select * from alix_mission_source where mission_id = $1 order by created_at`, [row.id]),
    ])
    return {
      id: String(row.id), sessionId: String(row.session_id), clienteId: optionalString(row.cliente_id), consultorId: optionalString(row.consultor_id),
      title: String(row.title), prompt: String(row.prompt), workMode: normalizeWorkMode(row.work_mode),
      analysisMode: row.analysis_mode === 'standard' ? 'standard' : 'deep', status: String(row.status) as AlixMissionStatus,
      progress: Number(row.progress || 0), currentStep: optionalString(row.current_step), queueName: optionalString(row.queue_name), jobId: optionalString(row.job_id),
      costUsd: normalizeMoneyString(String(row.cost_usd || '0')), inputTokens: Number(row.input_tokens || 0), outputTokens: Number(row.output_tokens || 0), model: optionalString(row.model),
      result: row.result && typeof row.result === 'object' ? row.result as AlixMissionStructuredResult : undefined,
      error: optionalString(row.error), cancellable: Boolean(row.cancellable), cancelledAt: iso(row.cancelled_at), startedAt: iso(row.started_at), completedAt: iso(row.completed_at),
      createdAt: iso(row.created_at) || new Date().toISOString(), updatedAt: iso(row.updated_at) || new Date().toISOString(),
      steps: steps.rows.map((step) => ({
        id: String(step.id), position: Number(step.position), code: String(step.code), title: String(step.title), status: String(step.status) as AlixMissionStepStatus,
        progress: Number(step.progress), details: optionalString(step.details), startedAt: iso(step.started_at), completedAt: iso(step.completed_at),
      })),
      sources: sources.rows.map((source) => ({
        id: String(source.id), kind: String(source.kind), sourceId: optionalString(source.source_id), label: String(source.label), url: optionalString(source.url),
        evidence: source.evidence || {}, createdAt: iso(source.created_at) || new Date().toISOString(),
      })),
    }
  }

  private async hydrateById(id: string): Promise<AlixMissionView> {
    const result = await this.query(`select * from alix_mission where id = $1 limit 1`, [id])
    if (!result.rows[0]) throw new Error('Missão não encontrada.')
    return this.hydrate(result.rows[0])
  }

  private async refreshSnapshot(id: string): Promise<AlixMissionView> {
    const mission = await this.hydrateById(id)
    await this.writeSnapshot(mission)
    return mission
  }

  private async require(id: string): Promise<AlixMissionView> {
    const mission = await this.get(id)
    if (!mission) throw new Error('Missão ALIX não encontrada.')
    return mission
  }

  private path(id: string): string {
    const safe = id.replace(/[^A-Za-z0-9_.-]/g, '_')
    return join(this.storageDir, `${safe}.json`)
  }

  private async writeSnapshot(mission: AlixMissionView): Promise<void> {
    const mutation = this.mutationContext.getStore()
    if (mutation) {
      mutation.snapshots.set(mission.id, mission)
      return
    }
    await this.publishSnapshot(mission)
  }

  private async publishSnapshot(mission: AlixMissionView): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true })
    const target = this.path(mission.id)
    const temporary = `${target}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(temporary, JSON.stringify(mission, null, 2), 'utf8')
      await fs.rename(temporary, target)
    } finally {
      await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
    }
  }

  private async listSnapshots(opts: { sessionId?: string; clienteId?: string; status?: AlixMissionStatus; limit?: number; consultorIds?: string[]; sharedSessionIds?: string[] }): Promise<AlixMissionView[]> {
    let files: string[] = []
    try { files = await fs.readdir(this.storageDir) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const rows: AlixMissionView[] = []
    for (const file of files.filter((item) => item.endsWith('.json'))) {
      try {
        const mission = JSON.parse(await fs.readFile(join(this.storageDir, file), 'utf8')) as AlixMissionView
        if (opts.sessionId && mission.sessionId !== opts.sessionId) continue
        if (opts.clienteId && mission.clienteId !== opts.clienteId) continue
        if (opts.status && mission.status !== opts.status) continue
        if (opts.consultorIds && (!mission.consultorId || !opts.consultorIds.includes(mission.consultorId)) && !opts.sharedSessionIds?.includes(mission.sessionId)) continue
        rows.push(mission)
      } catch { /* snapshot inválido não bloqueia o workspace */ }
    }
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, Math.max(1, Math.min(100, opts.limit || 30)))
  }
}

export function normalizeWorkMode(value: unknown): AlixWorkMode {
  return ALIX_WORK_MODES.includes(value as AlixWorkMode) ? value as AlixWorkMode : 'client_analysis'
}

export function workModePrompt(mode: AlixWorkMode): string {
  return MODE_PROMPTS[normalizeWorkMode(mode)]
}

export function structureMissionResponse(response: string): AlixMissionStructuredResult {
  const text = String(response || '').trim()
  const sections = splitSections(text)
  const conclusion = firstSection(sections, ['conclusao', 'conclusão', 'resumo executivo', 'resumo']) || firstParagraph(text)
  const facts = listSection(sections, ['fatos', 'fatos confirmados', 'evidencias', 'evidências'])
  const risks = listSection(sections, ['riscos', 'alertas'])
  const gaps = listSection(sections, ['lacunas', 'pendencias', 'pendências', 'dados faltantes'])
  const nextAction = firstSection(sections, ['proxima acao', 'próxima ação', 'proximos passos', 'próximos passos']) || 'Revisar a conclusão e definir o responsável pela próxima ação.'
  return { conclusion, facts, risks, gaps, nextAction, rawResponse: text }
}

function splitSections(text: string): Map<string, string> {
  const sections = new Map<string, string>()
  const heading = '(conclus[aã]o|resumo executivo|resumo|fatos(?: confirmados)?|evid[eê]ncias|riscos|alertas|lacunas|pend[eê]ncias|dados faltantes|pr[oó]xima a[cç][aã]o|pr[oó]ximos passos)'
  const mark = '(?:\\*\\*|__)'
  const inlinePattern = new RegExp(`^(?:#{1,4}\\s*)?${mark}?${heading}\\s*${mark}?\\s*:\\s*${mark}?\\s*(.+?)\\s*$`, 'i')
  const headingPattern = new RegExp(`^(?:#{1,4}\\s*)?${mark}?${heading}\\s*${mark}?\\s*:?\\s*${mark}?\\s*$`, 'i')
  let currentHeading = ''
  let buffer: string[] = []
  const flush = () => {
    if (currentHeading) sections.set(normalizeHeading(currentHeading), buffer.join('\n').trim())
    buffer = []
  }

  for (const line of text.split(/\r?\n/)) {
    const inline = line.trim().match(inlinePattern)
    const standalone = inline ? null : line.trim().match(headingPattern)
    const match = inline || standalone
    if (match) {
      flush()
      currentHeading = match[1]
      if (inline?.[2]) buffer.push(inline[2].trim())
      continue
    }
    if (currentHeading) buffer.push(line)
  }
  flush()
  return sections
}

function firstSection(sections: Map<string, string>, names: string[]): string {
  for (const name of names) {
    const value = sections.get(normalizeHeading(name))
    if (value) return value.replace(/^[-*]\s+/gm, '').trim()
  }
  return ''
}

function listSection(sections: Map<string, string>, names: string[]): string[] {
  const value = firstSection(sections, names)
  if (!value) return []
  const lines = value.split(/\n+/).map((item) => item.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean)
  return lines.length > 1 ? lines : value.split(/;\s+/).map((item) => item.trim()).filter(Boolean)
}

function normalizeHeading(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function firstParagraph(text: string): string {
  return text.split(/\n\s*\n/).map((item) => item.replace(/^#+\s*/, '').trim()).find(Boolean) || 'Sem conclusão registrada.'
}

function safeEvidence(value: unknown): unknown {
  if (value == null) return {}
  try {
    const text = JSON.stringify(value)
    return text.length <= 12_000 ? jsonValueSchema.parse(JSON.parse(text)) : { summary: `${text.slice(0, 11_900)}…`, truncated: true }
  } catch {
    return { summary: cleanText(value, 2_000) }
  }
}

function cleanText(value: unknown, max: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.slice(0, max)
}

function normalizeMoneyString(value: string): string {
  const raw = String(value || '0').replace(/[^\d.-]/g, '')
  const match = raw.match(/^-?\d+(?:\.\d+)?$/)
  if (!match) return '0.000000'
  const [whole, fraction = ''] = raw.split('.')
  return `${whole}.${fraction.padEnd(6, '0').slice(0, 6)}`
}

function decimalStringAdd(a: string, b: string): string {
  const toMicros = (value: string): bigint => {
    const normalized = normalizeMoneyString(value)
    const negative = normalized.startsWith('-')
    const [wholeRaw, fraction] = normalized.replace('-', '').split('.')
    const micros = BigInt(wholeRaw || '0') * 1_000_000n + BigInt(fraction || '0')
    return negative ? -micros : micros
  }
  const total = toMicros(a) + toMicros(b)
  const negative = total < 0n
  const absolute = negative ? -total : total
  return `${negative ? '-' : ''}${absolute / 1_000_000n}.${String(absolute % 1_000_000n).padStart(6, '0')}`
}

function missionStats(missions: AlixMissionView[]): Record<string, unknown> {
  const byStatus: Record<string, number> = {}
  let costUsd = '0.000000'
  for (const mission of missions) {
    byStatus[mission.status] = (byStatus[mission.status] || 0) + 1
    costUsd = decimalStringAdd(costUsd, mission.costUsd)
  }
  return { total: missions.length, byStatus, costUsd }
}

function optionalString(value: unknown): string | undefined {
  const text = String(value ?? '').trim()
  return text || undefined
}

function iso(value: unknown): string | undefined {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

let singleton: AlixMissionService | null = null

export function getAlixMissionService(): AlixMissionService {
  if (!singleton) singleton = new AlixMissionService()
  return singleton
}
