/**
 * Rotas — Situação Fiscal / CND Checklist.
 *
 * Prefixo: /api/fiscal
 * Convenções:
 *   - Resposta padrão { success: true, data } / { success: false, error }.
 *   - Path params sanitizados pra evitar path traversal.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getFiscalService } from '../services/fiscal/FiscalService.js'
import type {
  CertidaoCNDCreatePayload,
  CertidaoCNDUpdatePayload,
  TipoCND,
} from '@aletis/shared-types'

const TIPOS_VALIDOS: TipoCND[] = [
  'federal_receita',
  'estadual',
  'municipal',
  'trabalhista',
  'fgts',
  'inss',
  'ambiental',
]

function safeId(raw: string): string {
  return (raw || '').replace(/[^a-zA-Z0-9_-]/g, '')
}

export default async function (fastify: FastifyInstance) {
  const service = getFiscalService()

  /* ------------------------------------------------------------------
   * GET /api/fiscal/:clienteId/cnds — lista todas as certidões
   * ------------------------------------------------------------------ */
  fastify.get('/api/fiscal/:clienteId/cnds', async (request: FastifyRequest) => {
    const { clienteId } = request.params as { clienteId: string }
    const lista = service.listar(safeId(clienteId))
    return {
      success: true,
      data: {
        clienteId: safeId(clienteId),
        total: lista.length,
        certidoes: lista,
      },
    }
  })

  /* ------------------------------------------------------------------
   * POST /api/fiscal/:clienteId/cnds — adiciona certidão
   * Body: CertidaoCNDCreatePayload
   * ------------------------------------------------------------------ */
  fastify.post(
    '/api/fiscal/:clienteId/cnds',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { clienteId } = request.params as { clienteId: string }
      const body = request.body as CertidaoCNDCreatePayload | undefined
      if (!body || !body.tipo) {
        reply.status(400)
        return { success: false, error: 'Campo obrigatório: tipo' }
      }
      if (!TIPOS_VALIDOS.includes(body.tipo)) {
        reply.status(400)
        return {
          success: false,
          error: `Tipo inválido. Aceitos: ${TIPOS_VALIDOS.join(', ')}`,
        }
      }
      try {
        const cnd = service.adicionar(safeId(clienteId), body)
        return { success: true, data: cnd }
      } catch (err) {
        reply.status(500)
        return { success: false, error: (err as Error).message }
      }
    },
  )

  /* ------------------------------------------------------------------
   * PATCH /api/fiscal/:clienteId/cnds/:cndId — atualiza certidão
   * ------------------------------------------------------------------ */
  fastify.patch(
    '/api/fiscal/:clienteId/cnds/:cndId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { clienteId, cndId } = request.params as {
        clienteId: string
        cndId: string
      }
      const patch = request.body as CertidaoCNDUpdatePayload | undefined
      if (!patch) {
        reply.status(400)
        return { success: false, error: 'Body obrigatório' }
      }
      if (patch.tipo && !TIPOS_VALIDOS.includes(patch.tipo)) {
        reply.status(400)
        return {
          success: false,
          error: `Tipo inválido. Aceitos: ${TIPOS_VALIDOS.join(', ')}`,
        }
      }
      const atualizada = service.atualizar(safeId(clienteId), safeId(cndId), patch)
      if (!atualizada) {
        reply.status(404)
        return { success: false, error: 'Certidão não encontrada' }
      }
      return { success: true, data: atualizada }
    },
  )

  /* ------------------------------------------------------------------
   * DELETE /api/fiscal/:clienteId/cnds/:cndId
   * ------------------------------------------------------------------ */
  fastify.delete(
    '/api/fiscal/:clienteId/cnds/:cndId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { clienteId, cndId } = request.params as {
        clienteId: string
        cndId: string
      }
      const ok = service.remover(safeId(clienteId), safeId(cndId))
      if (!ok) {
        reply.status(404)
        return { success: false, error: 'Certidão não encontrada' }
      }
      return { success: true, data: { id: safeId(cndId) } }
    },
  )

  /* ------------------------------------------------------------------
   * GET /api/fiscal/:clienteId/checklist — retorna agregado ChecklistFiscal
   * ------------------------------------------------------------------ */
  fastify.get(
    '/api/fiscal/:clienteId/checklist',
    async (request: FastifyRequest) => {
      const { clienteId } = request.params as { clienteId: string }
      const checklist = service.calcularChecklist(safeId(clienteId))
      return { success: true, data: checklist }
    },
  )
}
