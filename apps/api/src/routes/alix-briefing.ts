// ============================================================
// ALETIS — Alix Briefing Routes (Wave 9 — MEMORY)
//
// Rotas auto-registradas a partir de src/routes/* no server.ts.
//
// Contrato
// ────────
//   GET /api/alix/briefing/:clienteId  → Briefing
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getBriefingService } from '../services/alix/memory/BriefingService.js'

export default async function alixBriefingRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const service = getBriefingService()

  fastify.get(
    '/api/alix/briefing/:clienteId',
    async (
      req: FastifyRequest<{ Params: { clienteId: string } }>,
      reply: FastifyReply,
    ) => {
      const { clienteId } = req.params
      try {
        const briefing = await service.gerar(clienteId)
        return reply.status(200).send({ success: true, data: briefing })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'erro desconhecido'
        return reply
          .status(500)
          .send({ success: false, error: msg })
      }
    },
  )

  console.log(
    '[ALIX] Briefing routes registradas: GET /api/alix/briefing/:clienteId',
  )
}
