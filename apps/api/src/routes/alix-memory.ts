// ============================================================
// ALETIS — Alix Memory Routes (Wave 9 — MEMORY)
//
// Rotas auto-registradas a partir de src/routes/* no server.ts.
//
// Contrato
// ────────
//   GET    /api/alix/memory                    → list()
//   GET    /api/alix/memory/:clienteId         → render + estrutura
//   PUT    /api/alix/memory/:clienteId         → body { patch }
//   POST   /api/alix/memory/:clienteId/nota    → body { secao, texto }
//   DELETE /api/alix/memory/:clienteId         → remove
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getAlixMemoryService } from '../services/alix/memory/AlixMemoryService.js'
import type {
  MemoriaCliente,
  SecaoNota,
} from '../services/alix/memory/types.js'

const SECOES_VALIDAS: SecaoNota[] = [
  'proximas-acoes',
  'alertas',
  'historico',
  'decisoes',
]

function erroInvalido(
  reply: FastifyReply,
  msg: string,
  status = 400,
): FastifyReply {
  return reply.status(status).send({ success: false, error: msg })
}

export default async function alixMemoryRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const service = getAlixMemoryService()

  // ── GET /api/alix/memory ────────────────────────────────
  fastify.get(
    '/api/alix/memory',
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const data = await service.list()
      return reply
        .status(200)
        .send({ success: true, data, total: data.length })
    },
  )

  // ── GET /api/alix/memory/:clienteId ─────────────────────
  fastify.get(
    '/api/alix/memory/:clienteId',
    async (
      req: FastifyRequest<{ Params: { clienteId: string } }>,
      reply: FastifyReply,
    ) => {
      const { clienteId } = req.params
      const memoria = await service.get(clienteId)
      if (!memoria) {
        return reply
          .status(404)
          .send({ success: false, error: 'Memória não encontrada' })
      }
      const markdown = await service.render(clienteId)
      return reply.status(200).send({
        success: true,
        data: { memoria, markdown },
      })
    },
  )

  // ── PUT /api/alix/memory/:clienteId ─────────────────────
  fastify.put(
    '/api/alix/memory/:clienteId',
    async (
      req: FastifyRequest<{
        Params: { clienteId: string }
        Body: { patch?: Partial<MemoriaCliente> } | Partial<MemoriaCliente>
      }>,
      reply: FastifyReply,
    ) => {
      const { clienteId } = req.params
      const body = req.body || {}
      // aceita tanto { patch: {...} } quanto o próprio patch no body
      const patch: Partial<MemoriaCliente> =
        body && typeof body === 'object' && 'patch' in body
          ? (body as { patch: Partial<MemoriaCliente> }).patch || {}
          : (body as Partial<MemoriaCliente>)

      if (!patch || typeof patch !== 'object') {
        return erroInvalido(reply, 'Body inválido — esperado { patch: ... }')
      }

      try {
        const memoria = await service.upsert(clienteId, patch)
        return reply.status(200).send({ success: true, data: memoria })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'erro desconhecido'
        return erroInvalido(reply, msg, 500)
      }
    },
  )

  // ── POST /api/alix/memory/:clienteId/nota ───────────────
  fastify.post(
    '/api/alix/memory/:clienteId/nota',
    async (
      req: FastifyRequest<{
        Params: { clienteId: string }
        Body: { secao?: string; texto?: string }
      }>,
      reply: FastifyReply,
    ) => {
      const { clienteId } = req.params
      const body = req.body || {}
      const secao = (body.secao || '').trim() as SecaoNota
      const texto = (body.texto || '').trim()
      if (!SECOES_VALIDAS.includes(secao)) {
        return erroInvalido(
          reply,
          `Seção inválida. Aceitas: ${SECOES_VALIDAS.join(', ')}`,
        )
      }
      if (!texto) {
        return erroInvalido(reply, 'Campo "texto" é obrigatório')
      }
      try {
        await service.appendNota(clienteId, secao, texto)
        const memoria = await service.get(clienteId)
        return reply.status(200).send({ success: true, data: memoria })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'erro desconhecido'
        return erroInvalido(reply, msg, 500)
      }
    },
  )

  // ── DELETE /api/alix/memory/:clienteId ──────────────────
  fastify.delete(
    '/api/alix/memory/:clienteId',
    async (
      req: FastifyRequest<{ Params: { clienteId: string } }>,
      reply: FastifyReply,
    ) => {
      const { clienteId } = req.params
      try {
        await service.delete(clienteId)
        return reply.status(204).send()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'erro desconhecido'
        return erroInvalido(reply, msg, 500)
      }
    },
  )

  console.log(
    '[ALIX] Memory routes registradas: GET/PUT/DELETE /api/alix/memory(/:clienteId) + POST /api/alix/memory/:clienteId/nota',
  )
}
