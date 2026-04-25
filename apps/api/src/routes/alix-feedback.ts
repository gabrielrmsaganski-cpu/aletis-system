// ============================================================
// alix-feedback — endpoints de feedback do Christian (Fase C.1)
// ============================================================
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getFeedbackService, type FeedbackRating } from '../services/alix/learning/FeedbackService.js'

export default async function alixFeedbackRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/alix/feedback
  fastify.post('/api/alix/feedback', async (
    req: FastifyRequest<{
      Body: {
        msgId: string
        sessionId: string
        rating: FeedbackRating
        notas?: string
        agent?: string
        tools?: string[]
      }
    }>,
    reply: FastifyReply,
  ) => {
    const body = req.body || ({} as any)
    if (!body.msgId || !body.sessionId || !body.rating) {
      return reply.status(400).send({ success: false, error: 'msgId, sessionId e rating são obrigatórios' })
    }
    const validRatings: FeedbackRating[] = ['util', 'irrelevante', 'incorreto', 'off-tom']
    if (!validRatings.includes(body.rating)) {
      return reply.status(400).send({ success: false, error: `rating inválido (use ${validRatings.join('|')})` })
    }
    const svc = getFeedbackService()
    const entry = svc.record({
      msgId: body.msgId,
      sessionId: body.sessionId,
      rating: body.rating,
      notas: body.notas,
      agent: body.agent,
      tools: Array.isArray(body.tools) ? body.tools : undefined,
    })
    return reply.send({ success: true, data: entry })
  })

  // GET /api/alix/feedback/recent?limit=50
  fastify.get('/api/alix/feedback/recent', async (
    req: FastifyRequest<{ Querystring: { limit?: string } }>,
    reply: FastifyReply,
  ) => {
    const svc = getFeedbackService()
    const limit = Number(req.query?.limit) || 50
    const [feedbacks, ranking] = await Promise.all([
      svc.recent(limit),
      svc.toolRanking(),
    ])
    return reply.send({ success: true, data: { feedbacks, rankingTools: ranking } })
  })

  console.log('[ALIX] Feedback routes registradas: POST /api/alix/feedback, GET /api/alix/feedback/recent')
}
