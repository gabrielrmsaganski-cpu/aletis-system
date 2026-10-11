import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { applyAlixAuth } from '../middleware/alixAuth.js'
import { accessibleLegacySharedSessionIds, alixAccessError, alixOwnerIds, assertAlixSessionAccess, canAccessAlixOwner, filterAlixSessionResources, isAlixAccessEnforced, isAlixAdmin } from '../services/alix/AlixAccessService.js'
import {
  ALIX_WORK_MODES,
  getAlixMissionService,
  type AlixMissionStatus,
} from '../services/alix/workspace/AlixMissionService.js'

const ok = <T>(data: T) => ({ success: true, data })
const fail = (error: string, code = 'ERROR') => ({ success: false, error, code })

const workModeSchema = z.enum(ALIX_WORK_MODES)
const createSchema = z.object({
  sessionId: z.string().trim().min(1).max(180),
  clienteId: z.string().trim().min(1).max(180).optional(),
  title: z.string().trim().min(1).max(100).optional(),
  prompt: z.string().trim().min(1).max(20_000),
  workMode: workModeSchema.default('client_analysis'),
  analysisMode: z.enum(['standard', 'deep']).default('deep'),
})

export default async function alixMissionRoutes(fastify: FastifyInstance): Promise<void> {
  applyAlixAuth(fastify)
  const missions = getAlixMissionService()
  const ownerFilter = (request: FastifyRequest) => isAlixAccessEnforced(request.alixUser) && !isAlixAdmin(request.alixUser) ? alixOwnerIds(request.alixUser) : undefined
  fastify.addHook('preHandler', async (request) => {
    if (!isAlixAccessEnforced(request.alixUser)) return
    const params = request.params as { id?: string }
    if (params.id) {
      const mission = await missions.get(params.id)
      if (!mission) {
        throw alixAccessError(404, 'Missão não encontrada ou indisponível para este usuário.')
      }
      const session = await assertAlixSessionAccess(request.alixUser, mission.sessionId)
      if (!session.legacyShared && !canAccessAlixOwner(request.alixUser, mission.consultorId)) {
        throw alixAccessError(404, 'Missão não encontrada ou indisponível para este usuário.')
      }
    }
    const input = (request.method === 'POST' ? request.body : request.query) as { sessionId?: unknown } | undefined
    if (input?.sessionId !== undefined) {
      if (typeof input.sessionId !== 'string') throw alixAccessError(400, 'Identificador de sessão inválido.')
      await assertAlixSessionAccess(request.alixUser, input.sessionId)
    }
  })

  fastify.get('/api/alix/missions/modes', async () => ok({
    modes: [
      { id: 'client_analysis', label: 'Análise de cliente', description: 'Cruza CRM, fatos, documentos e indicadores.' },
      { id: 'documentary', label: 'Documental', description: 'Extrai, compara e revisa evidências documentais.' },
      { id: 'negotiation', label: 'Negociação', description: 'Modela cenários e estratégia com o credor.' },
      { id: 'research', label: 'Pesquisa', description: 'Investiga fontes internas e externas atuais.' },
      { id: 'document_generation', label: 'Geração de documento', description: 'Prepara entregas formais rastreáveis.' },
      { id: 'due_diligence', label: 'Due diligence', description: 'Testa consistência, materialidade e red flags.' },
    ],
    responseContract: ['conclusion', 'facts', 'risks', 'gaps', 'nextAction'],
  }))

  fastify.get('/api/alix/missions/stats', async (request) => ok(await missions.stats(ownerFilter(request), await accessibleLegacySharedSessionIds(request.alixUser))))

  fastify.get('/api/alix/missions', async (
    request: FastifyRequest<{ Querystring: { sessionId?: string; clienteId?: string; status?: AlixMissionStatus; limit?: string } }>,
  ) => {
    const rows = await missions.list({
      sessionId: request.query?.sessionId?.trim() || undefined,
      clienteId: request.query?.clienteId?.trim() || undefined,
      status: request.query?.status,
      limit: Number(request.query?.limit || 30),
      consultorIds: ownerFilter(request),
      sharedSessionIds: await accessibleLegacySharedSessionIds(request.alixUser),
    })
    const visible = await filterAlixSessionResources(request.alixUser, rows)
    return ok({ missions: visible, total: visible.length })
  })

  fastify.post('/api/alix/missions', async (
    request: FastifyRequest<{ Body: z.infer<typeof createSchema> }>,
    reply: FastifyReply,
  ) => {
    const parsed = createSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send(fail(parsed.error.issues[0]?.message || 'Missão inválida.', 'BAD_MISSION'))
    const mission = await missions.create({ ...parsed.data, consultorId: request.alixUser?.consultorId || request.alixUser?.id })
    return reply.status(201).send(ok(mission))
  })

  fastify.get('/api/alix/missions/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const mission = await missions.get(request.params.id)
    if (!mission) return reply.status(404).send(fail('Missão não encontrada.', 'MISSION_NOT_FOUND'))
    return ok(mission)
  })

  fastify.post('/api/alix/missions/:id/cancel', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      return ok(await missions.cancel(request.params.id, request.alixUser?.id))
    } catch (error) {
      return reply.status(409).send(fail((error as Error).message, 'MISSION_NOT_CANCELLED'))
    }
  })

  fastify.post('/api/alix/missions/:id/resume', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      return ok(await missions.resume(request.params.id, request.alixUser?.id))
    } catch (error) {
      return reply.status(409).send(fail((error as Error).message, 'MISSION_NOT_RESUMED'))
    }
  })
}
