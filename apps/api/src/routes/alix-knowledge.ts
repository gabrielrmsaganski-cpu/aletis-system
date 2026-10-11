import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { getAiJobQueueService } from '../services/alix/jobs/AiJobQueueService.js'
import {
  getFactLedgerStats,
  listFactRevisions,
  listLedgerFacts,
  reviewLedgerFact,
  upsertLedgerFact,
  type FactStatus,
} from '../services/alix/knowledge/FactLedgerService.js'
import { getRagKnowledgeStats } from '../services/alix/knowledge/RagKnowledgeService.js'
import { knowledgeReadiness } from '../services/alix/knowledge/KnowledgeReadiness.js'

const ok = <T>(data: T) => ({ success: true, data })
const fail = (error: string, code = 'ERROR') => ({ success: false, error, code })

function text(value: unknown, max = 1_200): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export default async function alixKnowledgeRoutes(fastify: FastifyInstance): Promise<void> {
  const queue = getAiJobQueueService()

  fastify.get('/api/alix/knowledge/status', async () => {
    const [rag, facts, jobs] = await Promise.all([
      getRagKnowledgeStats(),
      getFactLedgerStats(),
      queue.status(),
    ])
    return ok({
      ...knowledgeReadiness(rag, jobs),
      rag,
      facts,
      jobs,
      generatedAt: new Date().toISOString(),
    })
  })

  fastify.post('/api/alix/knowledge/backfill', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (
    request: FastifyRequest<{ Body: { includeSessionDocuments?: boolean; force?: boolean } }>,
    reply: FastifyReply,
  ) => {
    if (!queue.ready()) return reply.status(503).send(fail('Fila de IA indisponível.', 'QUEUE_UNAVAILABLE'))
    try {
      const job = await queue.enqueueBackfill({
        includeSessionDocuments: Boolean(request.body?.includeSessionDocuments),
        force: Boolean(request.body?.force),
      })
      return reply.status(202).send(ok(job))
    } catch (error) {
      return reply.status(409).send(fail((error as Error).message, 'BACKFILL_NOT_ENQUEUED'))
    }
  })

  fastify.get('/api/alix/jobs/:queue/:id', async (
    request: FastifyRequest<{ Params: { queue: string; id: string } }>,
    reply: FastifyReply,
  ) => {
    if (!queue.ready()) return reply.status(503).send(fail('Fila de IA indisponível.', 'QUEUE_UNAVAILABLE'))
    try {
      const job = await queue.getJob(request.params.queue, request.params.id)
      if (!job) return reply.status(404).send(fail('Trabalho não encontrado.', 'JOB_NOT_FOUND'))
      return ok(job)
    } catch (error) {
      return reply.status(400).send(fail((error as Error).message, 'BAD_JOB'))
    }
  })

  fastify.get('/api/alix/knowledge/facts/:clienteId', async (
    request: FastifyRequest<{ Params: { clienteId: string }; Querystring: { limit?: string; includeContested?: string } }>,
  ) => {
    const facts = await listLedgerFacts(request.params.clienteId, {
      limit: Number(request.query?.limit || 150),
      includeContested: request.query?.includeContested !== 'false',
    })
    return ok({ clienteId: request.params.clienteId, facts, total: facts.length })
  })

  fastify.post('/api/alix/knowledge/facts/:clienteId', async (
    request: FastifyRequest<{
      Params: { clienteId: string }
      Body: { factType?: string; factKey?: string; factValue?: string; confidence?: number; reviewer?: string; note?: string }
    }>,
    reply: FastifyReply,
  ) => {
    const factType = text(request.body?.factType, 100)
    const factKey = text(request.body?.factKey, 180)
    const factValue = text(request.body?.factValue)
    if (!factType || !factKey || !factValue) {
      return reply.status(400).send(fail('factType, factKey e factValue são obrigatórios.', 'BAD_FACT'))
    }
    const fact = await upsertLedgerFact({
      clienteId: request.params.clienteId,
      factType,
      factKey,
      factValue,
      confidence: Number.isFinite(request.body?.confidence) ? Number(request.body.confidence) : 1,
      source: 'manual',
      sourceId: text(request.body?.reviewer, 160) || 'consultor',
      status: 'confirmed',
      evidence: [{
        source: 'manual',
        sourceId: text(request.body?.reviewer, 160) || 'consultor',
        fieldPath: factKey,
        excerpt: text(request.body?.note, 700) || undefined,
      }],
    })
    return reply.status(201).send(ok(fact))
  })

  fastify.patch('/api/alix/knowledge/facts/:id/review', async (
    request: FastifyRequest<{
      Params: { id: string }
      Body: { status?: FactStatus; factValue?: string; reviewer?: string; note?: string }
    }>,
    reply: FastifyReply,
  ) => {
    const factId = Number(request.params.id)
    const allowed = new Set<FactStatus>(['confirmed', 'contested', 'expired'])
    const status = request.body?.status
    if (!Number.isInteger(factId) || factId <= 0 || !status || !allowed.has(status)) {
      return reply.status(400).send(fail('Fato ou status de revisão inválido.', 'BAD_REVIEW'))
    }
    const fact = await reviewLedgerFact({
      factId,
      status: status as 'confirmed' | 'contested' | 'expired',
      factValue: text(request.body?.factValue) || undefined,
      reviewer: text(request.body?.reviewer, 160) || 'consultor',
      note: text(request.body?.note, 700) || undefined,
    })
    if (!fact) return reply.status(404).send(fail('Fato não encontrado.', 'FACT_NOT_FOUND'))
    return ok(fact)
  })

  fastify.get('/api/alix/knowledge/facts/:id/revisions', async (
    request: FastifyRequest<{ Params: { id: string }; Querystring: { limit?: string } }>,
    reply: FastifyReply,
  ) => {
    const factId = Number(request.params.id)
    if (!Number.isInteger(factId) || factId <= 0) return reply.status(400).send(fail('Fato inválido.', 'BAD_FACT'))
    const revisions = await listFactRevisions(factId, Number(request.query?.limit || 100))
    return ok({ factId, revisions, total: revisions.length })
  })
}
