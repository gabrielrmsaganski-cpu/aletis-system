import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { getAlixOperationalPlanService } from '../services/alix/workspace/AlixOperationalPlanService.js'
import { alixAuthMiddleware } from '../middleware/alixAuth.js'
import { getAlixOperationalHandoffService, operationalHandoffInput } from '../services/alix/workspace/AlixOperationalHandoffService.js'
import { operationalEvidenceSchema, type OperationalActor } from '../services/alix/workspace/OperationalDocumentarySource.js'

const scopeSchema = z.object({ clienteId: z.string().trim().min(1).max(180).optional() }).strict()
const countSchema = z.number().int().nonnegative()
const planSchema = z.object({
  generatedAt: z.string().datetime(), referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), timeZone: z.literal('America/Cuiaba'),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/), scope: scopeSchema,
  coverage: z.object({
    status: z.enum(['complete', 'partial', 'unavailable']),
    sources: z.array(z.object({ key: z.enum(['clients', 'demands', 'proposals', 'documentary']), label: z.string(), status: z.enum(['available', 'unavailable']), origin: z.enum(['postgres', 'memory']), records: countSchema.nullable(), detail: z.string().optional() })),
  }),
  counts: z.object({ clients: countSchema.nullable(), activeClients: countSchema.nullable(), activeDemands: countSchema.nullable(), openProposals: countSchema.nullable(), priorities: countSchema, overdue: countSchema, dueToday: countSchema, missingNextAction: countSchema, missingOwner: countSchema }),
  items: z.array(z.object({
    id: z.string(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(), kind: z.string(), priority: z.enum(['critical', 'attention', 'info']), title: z.string(), reason: z.string(), nextAction: z.string(), clienteId: z.string(), clienteName: z.string().optional(),
    entity: z.object({ type: z.enum(['client', 'demand', 'checklist', 'proposal', 'document_finding', 'document_field', 'fact_ledger', 'drive_analysis']), id: z.string(), parentId: z.string().optional() }),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), owner: z.string().optional(), to: z.string().startsWith('/'),
    sources: z.array(operationalEvidenceSchema),
  })),
})
const preparedSchema = z.object({
  plan: planSchema, reused: z.boolean(),
  mission: z.object({
    id: z.string(), sessionId: z.string(), status: z.literal('completed'), progress: z.literal(100),
    result: z.object({ conclusion: z.string(), facts: z.array(z.string()), risks: z.array(z.string()), gaps: z.array(z.string()), nextAction: z.string(), rawResponse: z.string() }),
  }).passthrough(),
})
const handoffSchema = z.object({
  id: z.string(), referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  item: planSchema.shape.items.element,
  session: z.object({ id: z.string(), clienteId: z.string(), archived: z.boolean() }),
  mission: z.object({
    id: z.string(), sessionId: z.string(), clienteId: z.string(), consultorId: z.string(),
    prompt: z.string().min(1), workMode: z.enum(['client_analysis', 'documentary', 'negotiation', 'research', 'document_generation', 'due_diligence']),
    status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  }).passthrough(),
  deliverables: z.array(z.string()), actionPolicy: z.literal('prepare_only'), canStart: z.boolean(), reused: z.boolean(),
}).superRefine((handoff, context) => {
  if (handoff.session.id !== handoff.mission.sessionId || handoff.session.clienteId !== handoff.mission.clienteId || handoff.item.clienteId !== handoff.session.clienteId
    || (handoff.canStart && (handoff.session.archived || handoff.mission.status !== 'queued'))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'O trabalho preparado diverge do contexto ou do estado da missão.' })
  }
})

export default async function alixOperationsRoutes(fastify: FastifyInstance): Promise<void> {
  const actor = (request: FastifyRequest): OperationalActor | undefined => request.alixUser?.id && request.alixUser.authSource !== 'anonymous'
    ? { userId: request.alixUser.id, userName: request.alixUser.nome, role: request.alixUser.role || 'consultor', tenantId: process.env.ALETIS_TENANT_ID || 'default' } : undefined
  fastify.post('/api/alix/operations/handoff', { onRequest: alixAuthMiddleware }, async (request, reply) => {
    const parsed = operationalHandoffInput.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Prioridade inválida. Atualize a leitura e tente novamente.' })
    const actorId = request.alixUser?.consultorId || request.alixUser?.id
    if (!actorId || ['anonymous', 'unknown'].includes(actorId)) return reply.status(401).send({ success: false, error: 'Entre no sistema para preparar este trabalho.' })
    try {
      const result = await getAlixOperationalHandoffService().prepare(parsed.data, actorId, actor(request))
      return { success: true, data: handoffSchema.parse(result) }
    } catch (error) {
      const known = error as Error & { statusCode?: number; code?: string }
      if ([401, 409, 503].includes(known.statusCode || 0)) return reply.status(known.statusCode!).send({ success: false, error: known.message, code: known.code })
      request.log.error({ err: error }, 'Falha ao preparar trabalho operacional da ALIX')
      return reply.status(503).send({ success: false, error: 'Não foi possível preparar este trabalho. Tente novamente; a mesma prioridade reutiliza a conversa já criada.' })
    }
  })

  fastify.get('/api/alix/operations', { onRequest: alixAuthMiddleware }, async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store')
    const parsed = scopeSchema.safeParse(request.query)
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Escopo operacional inválido.' })
    const plan = await getAlixOperationalPlanService().overview({ ...parsed.data, actor: actor(request) })
    return { success: true, data: planSchema.parse(plan) }
  })

  fastify.post('/api/alix/operations/prepare', { onRequest: alixAuthMiddleware }, async (request, reply) => {
    const parsed = scopeSchema.safeParse(request.body ?? {})
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Escopo operacional inválido.' })
    const user = request.user as { id?: string; sub?: string; consultorId?: string } | undefined
    const actorId = request.alixUser?.authSource === 'anonymous' ? undefined : request.alixUser?.consultorId || request.alixUser?.id || user?.consultorId || user?.id || user?.sub
    try {
      const result = await getAlixOperationalPlanService().prepare({ ...parsed.data, actorId, actor: actor(request) })
      return { success: true, data: preparedSchema.parse(result) }
    } catch (error) {
      request.log.error({ err: error }, 'Falha ao preparar plano operacional da ALIX')
      return reply.status(503).send({ success: false, error: 'Não foi possível preparar e salvar o plano agora. Atualize as fontes e tente novamente.' })
    }
  })
}
