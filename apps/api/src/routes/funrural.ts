/**
 * Rotas — Calculadora Funrural 2026.
 *
 * Prefixo: /api/funrural
 * Convenções:
 *   - Resposta padrão { success: true, data } / { success: false, error }
 *   - Stateless (sem persistência).
 *
 * Endpoints:
 *   POST /api/funrural/calcular   body = CenarioFunrural
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getFunruralService } from '../services/funrural/FunruralService.js'
import type {
  CenarioFunrural,
  TipoContribuinte,
} from '@aletis/shared-types/src/funrural.js'

const TIPOS_VALIDOS: TipoContribuinte[] = [
  'PF',
  'PJ_empregador_rural',
  'agroindustria',
  'adquirente',
]

export default async function (fastify: FastifyInstance) {
  const service = getFunruralService()

  /* ------------------------------------------------------------------
   * POST /api/funrural/calcular — calcula as 2 opções e recomenda.
   * ------------------------------------------------------------------ */
  fastify.post(
    '/api/funrural/calcular',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as CenarioFunrural | undefined
      if (!body) {
        reply.status(400)
        return { success: false, error: 'Body obrigatório' }
      }
      const { tipo, receitaBrutaAnual, folhaPagamentoAnual, ratMultiplicador } =
        body
      if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
        reply.status(400)
        return {
          success: false,
          error: `Campo "tipo" inválido. Aceitos: ${TIPOS_VALIDOS.join(', ')}`,
        }
      }
      if (typeof receitaBrutaAnual !== 'number' || receitaBrutaAnual < 0) {
        reply.status(400)
        return {
          success: false,
          error: 'Campo "receitaBrutaAnual" obrigatório e não-negativo.',
        }
      }
      if (typeof folhaPagamentoAnual !== 'number' || folhaPagamentoAnual < 0) {
        reply.status(400)
        return {
          success: false,
          error: 'Campo "folhaPagamentoAnual" obrigatório e não-negativo.',
        }
      }
      if (![1, 2, 3].includes(ratMultiplicador)) {
        reply.status(400)
        return {
          success: false,
          error: 'Campo "ratMultiplicador" deve ser 1 (leve), 2 (médio) ou 3 (grave).',
        }
      }
      try {
        const data = service.calcular(body)
        return { success: true, data }
      } catch (err) {
        reply.status(500)
        return { success: false, error: (err as Error).message }
      }
    },
  )
}
