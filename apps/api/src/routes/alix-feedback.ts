// ============================================================
// Feedback, triagem e melhoria contínua da ALIX.
// ============================================================

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { getFeedbackService } from '../services/alix/learning/FeedbackService.js'
import { getQualityReviewService } from '../services/alix/learning/QualityReviewService.js'

const feedbackSchema = z.object({
  msgId: z.string().trim().min(1).max(200),
  sessionId: z.string().trim().min(1).max(200),
  rating: z.enum(['util', 'incompleta', 'incorreto', 'off-tom']),
  motivo: z.enum(['fonte_errada', 'dado_ausente', 'calculo', 'interpretacao', 'escrita', 'acao_indevida']).optional(),
  notas: z.string().trim().max(4_000).optional(),
  category: z.string().trim().max(80).optional(),
  clienteId: z.string().trim().max(160).optional(),
  missionId: z.string().trim().max(160).optional(),
  notebookId: z.string().trim().max(160).optional(),
  artifactId: z.string().trim().max(160).optional(),
  responseExcerpt: z.string().trim().max(4_000).optional(),
  expectedCorrection: z.string().trim().max(4_000).optional(),
  agent: z.string().trim().max(120).optional(),
  tools: z.array(z.string().trim().min(1).max(160)).max(100).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.rating === 'incorreto' && !value.motivo) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['motivo'], message: 'Selecione o motivo da resposta incorreta.' })
  }
})

const queueQuerySchema = z.object({
  status: z.enum(['open', 'investigating', 'fixed', 'dismissed']).optional(),
  category: z.string().trim().max(80).optional(),
  currentWeek: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

const queueUpdateSchema = z.object({
  status: z.enum(['open', 'investigating', 'fixed', 'dismissed']).optional(),
  ownerId: z.string().trim().max(160).nullable().optional(),
  resolution: z.string().trim().max(4_000).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma alteração.')

export default async function alixFeedbackRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/alix/feedback', async (
    req: FastifyRequest<{ Body: unknown }>,
    reply: FastifyReply,
  ) => {
    const parsed = feedbackSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues[0]?.message || 'Feedback inválido.',
        issues: parsed.error.issues,
      })
    }
    try {
      const result = await getFeedbackService().record(parsed.data)
      let qualityCase = null
      try {
        qualityCase = await getQualityReviewService().createFromFeedback(result.entry, result.feedbackId)
      } catch (err) {
        req.log.error({ err }, '[alix-feedback] criação do caso de qualidade falhou')
      }
      return reply.status(201).send({ success: true, data: { feedback: result.entry, qualityCase } })
    } catch (err) {
      req.log.error({ err }, '[alix-feedback] persistência falhou')
      return reply.status(500).send({ success: false, error: 'Não foi possível registrar o feedback.' })
    }
  })

  fastify.get('/api/alix/feedback/recent', async (
    req: FastifyRequest<{ Querystring: { limit?: string } }>,
    reply: FastifyReply,
  ) => {
    const svc = getFeedbackService()
    const limit = Math.max(1, Math.min(500, Number(req.query?.limit) || 50))
    const [feedbacks, ranking] = await Promise.all([svc.recent(limit), svc.toolRanking()])
    return reply.send({ success: true, data: { feedbacks, rankingTools: ranking } })
  })

  fastify.get('/api/alix/feedback/stats', async () => {
    const repo = await import('../db/AlixConfirmationFeedbackRepository.js')
    return { success: true, data: await repo.feedbackStats() }
  })

  fastify.get('/api/alix/feedback/quality-queue', async (
    req: FastifyRequest<{ Querystring: Record<string, unknown> }>,
    reply: FastifyReply,
  ) => {
    const parsed = queueQuerySchema.safeParse(req.query || {})
    if (!parsed.success) return reply.status(400).send({ success: false, error: parsed.error.issues[0]?.message })
    try {
      const cases = await getQualityReviewService().list({
        ...parsed.data,
        currentWeek: parsed.data.currentWeek === 'true',
      })
      return { success: true, data: { cases, total: cases.length } }
    } catch (err) {
      req.log.error({ err }, '[alix-feedback] leitura da fila falhou')
      return reply.status(500).send({ success: false, error: 'Não foi possível consultar a fila de qualidade.' })
    }
  })

  fastify.patch('/api/alix/feedback/quality-queue/:id', async (
    req: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
    reply: FastifyReply,
  ) => {
    const parsed = queueUpdateSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ success: false, error: parsed.error.issues[0]?.message })
    try {
      const qualityCase = await getQualityReviewService().update(req.params.id, parsed.data)
      if (!qualityCase) return reply.status(404).send({ success: false, error: 'Caso de qualidade não encontrado.' })
      return { success: true, data: qualityCase }
    } catch (err) {
      req.log.error({ err }, '[alix-feedback] atualização da fila falhou')
      return reply.status(500).send({ success: false, error: 'Não foi possível atualizar o caso de qualidade.' })
    }
  })

  fastify.get('/api/alix/feedback/weekly', async (req, reply) => {
    try {
      return { success: true, data: await getQualityReviewService().weeklySummary() }
    } catch (err) {
      req.log.error({ err }, '[alix-feedback] resumo semanal falhou')
      return reply.status(500).send({ success: false, error: 'Não foi possível consultar o resumo semanal.' })
    }
  })

  fastify.get('/api/alix/confirmations/pendentes', async (
    req: FastifyRequest<{ Querystring: { sessionId?: string; limit?: string } }>,
  ) => {
    const repo = await import('../db/AlixConfirmationFeedbackRepository.js')
    const list = await repo.listConfirmations({
      sessionId: req.query?.sessionId,
      status: 'pending',
      limit: Number(req.query?.limit) || 50,
    })
    return { success: true, data: list }
  })
}
