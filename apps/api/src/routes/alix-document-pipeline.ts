import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { applyAlixAuth } from '../middleware/alixAuth.js'
import { AI_JOB_QUEUES, getAiJobQueueService } from '../services/alix/jobs/AiJobQueueService.js'
import {
  getDocumentPipelineService,
  type DocumentPipelineStatus,
} from '../services/alix/intake/DocumentPipelineService.js'

const ok = <T>(data: T) => ({ success: true, data })
const fail = (error: string, code = 'ERROR') => ({ success: false, error, code })

const enqueueSchema = z.object({
  sessionId: z.string().trim().min(1).max(180),
  documentId: z.string().trim().min(1).max(180),
  clienteId: z.string().trim().min(1).max(180).optional(),
  force: z.boolean().optional(),
})

const registerSchema = z.object({
  registeredEntityId: z.string().trim().min(1).max(180),
  reviewConfirmed: z.literal(true),
})

const findingSchema = z.object({ status: z.enum(['resolved', 'dismissed']) })
const fieldReviewSchema = z.object({
  status: z.enum(['confirmed', 'contested', 'rejected']),
  note: z.string().trim().max(1_000).optional(),
})

export default async function alixDocumentPipelineRoutes(fastify: FastifyInstance): Promise<void> {
  applyAlixAuth(fastify)
  const pipeline = getDocumentPipelineService()
  const queue = getAiJobQueueService()

  fastify.get('/api/alix/document-pipeline/profiles', async () => ok({
    pipeline: ['receber', 'validar', 'extrair', 'classificar', 'cruzar', 'revisar', 'cadastrar'],
    documentTypes: [
      'contrato', 'cpr', 'ccb', 'matricula_imovel', 'car', 'ccir', 'itr',
      'extrato_bancario', 'balanco_patrimonial', 'dre', 'proposta',
    ],
    safeguards: ['evidencia_por_campo', 'confianca_por_campo', 'hitl', 'comparacao_de_versoes', 'duplicidade', 'divergencia', 'validade'],
  }))

  fastify.get('/api/alix/document-pipeline/stats', async () => ok(await pipeline.stats()))

  fastify.get('/api/alix/document-pipeline', async (
    request: FastifyRequest<{ Querystring: { sessionId?: string; clienteId?: string; status?: DocumentPipelineStatus; limit?: string } }>,
  ) => {
    const runs = await pipeline.list({
      sessionId: request.query?.sessionId?.trim() || undefined,
      clienteId: request.query?.clienteId?.trim() || undefined,
      status: request.query?.status,
      limit: Number(request.query?.limit || 50),
    })
    return ok({ runs, total: runs.length })
  })

  fastify.post('/api/alix/document-pipeline', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (
    request: FastifyRequest<{ Body: z.infer<typeof enqueueSchema> }>,
    reply: FastifyReply,
  ) => {
    const parsed = enqueueSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send(fail(parsed.error.issues[0]?.message || 'Payload inválido.', 'BAD_PIPELINE_REQUEST'))
    if (!queue.ready()) return reply.status(503).send(fail('Fila durável da ALIX indisponível.', 'QUEUE_UNAVAILABLE'))
    try {
      const job = await queue.enqueueDocumentPipeline(parsed.data)
      return reply.status(202).send(ok(job))
    } catch (error) {
      return reply.status(409).send(fail((error as Error).message, 'PIPELINE_NOT_ENQUEUED'))
    }
  })

  fastify.get('/api/alix/document-pipeline/document/:documentId', async (
    request: FastifyRequest<{ Params: { documentId: string } }>,
    reply: FastifyReply,
  ) => {
    const run = await pipeline.getLatestForDocument(request.params.documentId, true)
    if (!run) return reply.status(404).send(fail('Documento ainda não possui execução da esteira.', 'PIPELINE_NOT_FOUND'))
    return ok(run)
  })

  fastify.get('/api/alix/document-pipeline/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const run = await pipeline.get(request.params.id, true)
    if (!run) return reply.status(404).send(fail('Execução documental não encontrada.', 'PIPELINE_NOT_FOUND'))
    return ok(run)
  })

  fastify.post('/api/alix/document-pipeline/:id/rerun', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const current = await pipeline.get(request.params.id, false)
    if (!current) return reply.status(404).send(fail('Execução documental não encontrada.', 'PIPELINE_NOT_FOUND'))
    if (!queue.ready()) return reply.status(503).send(fail('Fila durável da ALIX indisponível.', 'QUEUE_UNAVAILABLE'))
    const job = await queue.enqueueDocumentPipeline({
      sessionId: current.sessionId,
      documentId: current.documentId,
      clienteId: current.clienteId,
      force: true,
    })
    return reply.status(202).send(ok(job))
  })

  fastify.post('/api/alix/document-pipeline/:id/register', async (
    request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof registerSchema> }>,
    reply: FastifyReply,
  ) => {
    const parsed = registerSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send(fail('Confirmação humana e destino cadastrado são obrigatórios.', 'HITL_REQUIRED'))
    try {
      const run = await pipeline.register(request.params.id, {
        ...parsed.data,
        actorId: request.alixUser?.id,
      })
      return ok(run)
    } catch (error) {
      return reply.status(409).send(fail((error as Error).message, 'REGISTRATION_BLOCKED'))
    }
  })

  fastify.patch('/api/alix/document-pipeline/findings/:id', async (
    request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof findingSchema> }>,
    reply: FastifyReply,
  ) => {
    const parsed = findingSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send(fail('Status de achado inválido.', 'BAD_FINDING_STATUS'))
    await pipeline.resolveFinding(request.params.id, { ...parsed.data, actorId: request.alixUser?.id })
    return ok({ id: request.params.id, ...parsed.data })
  })

  fastify.patch('/api/alix/document-pipeline/fields/:id', async (
    request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof fieldReviewSchema> }>,
    reply: FastifyReply,
  ) => {
    const parsed = fieldReviewSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send(fail('Revisão de campo inválida.', 'BAD_FIELD_REVIEW'))
    try {
      const field = await pipeline.reviewField(request.params.id, {
        ...parsed.data,
        actorId: request.alixUser?.id,
      })
      return ok(field)
    } catch (error) {
      const message = (error as Error).message
      return reply.status(message.includes('não encontrado') ? 404 : 409).send(fail(message, 'FIELD_REVIEW_FAILED'))
    }
  })

  fastify.post('/api/alix/document-pipeline/jobs/:id/cancel', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    if (!queue.ready()) return reply.status(503).send(fail('Fila durável da ALIX indisponível.', 'QUEUE_UNAVAILABLE'))
    const cancelled = await queue.cancelJob(AI_JOB_QUEUES.documentPipeline, request.params.id)
    return ok({ cancelled, jobId: request.params.id })
  })
}
