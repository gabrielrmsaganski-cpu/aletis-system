import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { applyAlixAuth } from '../middleware/alixAuth.js'
import {
  getAlixGovernanceService,
  type AutomationSuggestionStatus,
} from '../services/alix/governance/AlixGovernanceService.js'
import type { OperationalActor } from '../services/alix/workspace/OperationalDocumentarySource.js'

const ok = <T>(data: T) => ({ success: true, data })
const fail = (error: string, code = 'GOVERNANCE_ERROR') => ({ success: false, error, code })

const thresholdsSchema = z.object({
  minPassRate: z.number().min(0).max(1).optional(),
  minEvidenceRate: z.number().min(0).max(1).optional(),
  minSampleSize: z.number().int().min(1).max(100_000).optional(),
  maxCriticalFailures: z.number().int().min(0).max(10_000).optional(),
}).strict()

const createReleaseSchema = z.object({
  component: z.string().trim().min(1).max(160),
  changeType: z.enum(['prompt', 'model', 'policy', 'workflow']),
  candidateVersion: z.string().trim().min(1).max(180),
  baselineVersion: z.string().trim().min(1).max(180).optional(),
  thresholds: thresholdsSchema.optional(),
  datasetVersion: z.number().int().min(1).max(10_000).optional(),
}).strict()

const evaluationSchema = z.object({
  suite: z.string().trim().min(1).max(180),
  datasetVersion: z.number().int().min(1).max(10_000).optional(),
  sampleSize: z.number().int().min(1).max(1_000_000),
  passed: z.number().int().min(0).max(1_000_000),
  failed: z.number().int().min(0).max(1_000_000),
  evidenceRate: z.number().min(0).max(1),
  criticalFailures: z.number().int().min(0).max(1_000_000).optional(),
  extractionPrecision: z.number().min(0).max(1).optional(),
  latencyP95Ms: z.number().min(0).max(86_400_000).optional(),
  costUsd: z.string().trim().regex(/^\d+(?:\.\d{1,6})?$/).optional(),
  evidence: z.array(z.unknown()).max(500).optional(),
  gitSha: z.string().trim().max(80).optional(),
}).strict().refine((value) => value.passed + value.failed === value.sampleSize, {
  message: 'passed + failed deve ser igual ao sampleSize.',
})

const reviewSchema = z.object({ decision: z.enum(['approve', 'reject']) }).strict()
const suggestionStatuses = [
  'pending_review', 'awaiting_confirmation', 'approved', 'auto_executed',
  'executed', 'dismissed', 'expired', 'failed',
] as const

function actor(request: FastifyRequest): string {
  return request.alixUser?.id || request.alixUser?.sub || 'anonymous'
}

function documentaryActor(request: FastifyRequest): OperationalActor | undefined {
  const user = request.alixUser
  return user?.id && user.authSource !== 'anonymous' ? { userId: user.id, userName: user.nome, role: user.role || 'consultor', tenantId: process.env.ALETIS_TENANT_ID || 'default' } : undefined
}

function requireGovernanceAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  const strict = (process.env.ALIX_AUTH_STRICT || '').toLowerCase() === 'true'
  if (!strict) return true
  const role = String(request.alixUser?.role || '').toLowerCase()
  if (['admin', 'diretor', 'governance', 'governanca'].includes(role)) return true
  void reply.status(403).send(fail('Aprovação e ativação de releases exigem perfil de governança.', 'GOVERNANCE_ROLE_REQUIRED'))
  return false
}

export default async function alixGovernanceRoutes(fastify: FastifyInstance): Promise<void> {
  applyAlixAuth(fastify)
  const service = getAlixGovernanceService()

  fastify.get('/api/alix/governance/dashboard', async () => ok(await service.dashboard()))

  fastify.get('/api/alix/governance/releases', async (
    request: FastifyRequest<{ Querystring: { limit?: string } }>,
  ) => ok({ releases: await service.listReleases(Number(request.query?.limit || 100)) }))

  fastify.post('/api/alix/governance/releases', async (
    request: FastifyRequest<{ Body: unknown }>,
    reply: FastifyReply,
  ) => {
    const parsed = createReleaseSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send(fail(parsed.error.issues[0]?.message || 'Release inválida.', 'INVALID_RELEASE'))
    try {
      return reply.status(201).send(ok(await service.createRelease({ ...parsed.data, createdBy: actor(request) })))
    } catch (error) {
      return reply.status(409).send(fail((error as Error).message, 'RELEASE_NOT_CREATED'))
    }
  })

  fastify.post('/api/alix/governance/releases/:id/evaluations', async (
    request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
    reply: FastifyReply,
  ) => {
    const parsed = evaluationSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send(fail(parsed.error.issues[0]?.message || 'Avaliação inválida.', 'INVALID_EVALUATION'))
    try {
      const result = await service.recordEvaluation({ releaseId: request.params.id, ...parsed.data, createdBy: actor(request) })
      return reply.status(result.gate.passed ? 201 : 422).send(ok(result))
    } catch (error) {
      return reply.status(409).send(fail((error as Error).message, 'EVALUATION_NOT_RECORDED'))
    }
  })

  fastify.post('/api/alix/governance/releases/:id/review', async (
    request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
    reply: FastifyReply,
  ) => {
    if (!requireGovernanceAdmin(request, reply)) return
    const parsed = reviewSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send(fail('Decisão de revisão inválida.', 'INVALID_REVIEW'))
    try {
      return ok(await service.approveRelease(request.params.id, { actorId: actor(request), decision: parsed.data.decision }))
    } catch (error) {
      return reply.status(409).send(fail((error as Error).message, 'PROMOTION_BLOCKED'))
    }
  })

  fastify.post('/api/alix/governance/releases/:id/activate', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    if (!requireGovernanceAdmin(request, reply)) return
    try {
      return ok(await service.activateRelease(request.params.id, actor(request)))
    } catch (error) {
      return reply.status(409).send(fail((error as Error).message, 'ACTIVATION_BLOCKED'))
    }
  })

  fastify.get('/api/alix/governance/suggestions', async (
    request: FastifyRequest<{ Querystring: { status?: string; clienteId?: string; limit?: string } }>,
    reply: FastifyReply,
  ) => {
    reply.header('Cache-Control', 'private, no-store')
    const verified = documentaryActor(request)
    if (!verified) return reply.status(401).send(fail('Entre no sistema para consultar sugestões.', 'AUTH_REQUIRED'))
    const status = request.query?.status
    if (status && !suggestionStatuses.includes(status as typeof suggestionStatuses[number])) {
      return reply.status(400).send(fail('Status de sugestão inválido.', 'INVALID_SUGGESTION_STATUS'))
    }
    const suggestions = await service.listSuggestions({
      status: status as AutomationSuggestionStatus | undefined,
      clienteId: request.query?.clienteId?.trim() || undefined,
      limit: Number(request.query?.limit || 100),
      actor: verified,
    })
    return ok({ suggestions, total: suggestions.length })
  })

  fastify.post('/api/alix/governance/suggestions/scan', async (request, reply) => {
    const verified = documentaryActor(request)
    if (!verified) return reply.status(401).send(fail('Entre no sistema para conferir pendências.', 'AUTH_REQUIRED'))
    try {
      const scan = await service.scanDeterministicCandidates(verified)
      return reply.status(202).send(ok(scan))
    } catch (error) {
      return reply.status(500).send(fail((error as Error).message, 'SCAN_FAILED'))
    }
  })

  fastify.post('/api/alix/governance/suggestions/:id/prepare', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const verified = documentaryActor(request)
    if (!verified) return reply.status(401).send(fail('Entre no sistema para preparar sugestões.', 'AUTH_REQUIRED'))
    try {
      return ok(await service.prepareSuggestion(request.params.id, actor(request), verified))
    } catch (error) {
      return reply.status(409).send(fail((error as Error).message, 'SUGGESTION_NOT_PREPARED'))
    }
  })

  fastify.post('/api/alix/governance/suggestions/:id/dismiss', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const verified = documentaryActor(request)
    if (!verified) return reply.status(401).send(fail('Entre no sistema para revisar sugestões.', 'AUTH_REQUIRED'))
    try {
      return ok(await service.dismissSuggestion(request.params.id, actor(request), verified))
    } catch (error) {
      return reply.status(404).send(fail((error as Error).message, 'SUGGESTION_NOT_FOUND'))
    }
  })

  fastify.log.info('[ALIX] Governança registrada: releases, evals, sugestões e dashboard')
}
