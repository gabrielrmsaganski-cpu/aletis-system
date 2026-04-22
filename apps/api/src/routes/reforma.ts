/**
 * Rotas — Simulador Reforma Tributária (CBS / IBS) 2026+
 *
 * Prefixo: /api/reforma
 * Convenções:
 *   - Resposta padrão { success: true, data } / { success: false, error }
 *   - Todos os endpoints são stateless (sem persistência).
 *
 * Endpoints:
 *   POST /api/reforma/simular       body = CenarioTributario
 *   GET  /api/reforma/aliquotas/:ano
 *   GET  /api/reforma/imunidade/:regime
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getReformaTributariaService } from '../services/reforma/ReformaTributariaService.js'
import type {
  CenarioTributario,
  RegimeTributarioRural,
} from '@aletis/shared-types/src/reforma-tributaria.js'

const REGIMES_VALIDOS: RegimeTributarioRural[] = [
  'produtor_rural_pf_imune',
  'produtor_rural_pf_normal',
  'produtor_rural_pj_imune',
  'produtor_rural_pj_normal',
  'agroindustria',
]

export default async function (fastify: FastifyInstance) {
  const service = getReformaTributariaService()

  /* ------------------------------------------------------------------
   * POST /api/reforma/simular — roda a simulação CBS/IBS × sistema atual.
   * ------------------------------------------------------------------ */
  fastify.post(
    '/api/reforma/simular',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as CenarioTributario | undefined
      if (!body) {
        reply.status(400)
        return { success: false, error: 'Body obrigatório' }
      }
      const { ano, regime, receitaBruta, comprasInsumos } = body
      if (typeof ano !== 'number' || ano < 2026) {
        reply.status(400)
        return {
          success: false,
          error: 'Campo "ano" obrigatório e >= 2026 (CBS/IBS só vigem a partir de 2026).',
        }
      }
      if (!regime || !REGIMES_VALIDOS.includes(regime)) {
        reply.status(400)
        return {
          success: false,
          error: `Campo "regime" inválido. Aceitos: ${REGIMES_VALIDOS.join(', ')}`,
        }
      }
      if (typeof receitaBruta !== 'number' || receitaBruta < 0) {
        reply.status(400)
        return {
          success: false,
          error: 'Campo "receitaBruta" obrigatório e não-negativo.',
        }
      }
      if (typeof comprasInsumos !== 'number' || comprasInsumos < 0) {
        reply.status(400)
        return {
          success: false,
          error: 'Campo "comprasInsumos" obrigatório e não-negativo.',
        }
      }
      try {
        const data = service.simular(body)
        return { success: true, data }
      } catch (err) {
        reply.status(500)
        return { success: false, error: (err as Error).message }
      }
    },
  )

  /* ------------------------------------------------------------------
   * GET /api/reforma/aliquotas/:ano — alíquotas oficiais de transição.
   * ------------------------------------------------------------------ */
  fastify.get(
    '/api/reforma/aliquotas/:ano',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { ano } = request.params as { ano: string }
      const anoNum = Number(ano)
      if (!Number.isFinite(anoNum) || anoNum < 2026) {
        reply.status(400)
        return {
          success: false,
          error: 'Ano inválido. Deve ser um inteiro >= 2026.',
        }
      }
      const aliquotas = service.aliquotasTransicao(anoNum)
      return {
        success: true,
        data: {
          ano: anoNum,
          cbs: aliquotas.cbs,
          ibs: aliquotas.ibs,
          cbsPercent: `${(aliquotas.cbs * 100).toFixed(2)}%`,
          ibsPercent: `${(aliquotas.ibs * 100).toFixed(2)}%`,
          fonte: 'Cronograma oficial LC 214/2025 Anexo II',
        },
      }
    },
  )

  /* ------------------------------------------------------------------
   * GET /api/reforma/imunidade/:regime — texto explicativo.
   * ------------------------------------------------------------------ */
  fastify.get(
    '/api/reforma/imunidade/:regime',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { regime } = request.params as { regime: string }
      if (!REGIMES_VALIDOS.includes(regime as RegimeTributarioRural)) {
        reply.status(400)
        return {
          success: false,
          error: `Regime inválido. Aceitos: ${REGIMES_VALIDOS.join(', ')}`,
        }
      }
      const texto = service.explicarImunidade(regime as RegimeTributarioRural)
      return {
        success: true,
        data: {
          regime,
          explicacao: texto,
          pisoImunidade: 3_600_000,
          baseLegal: ['EC 132/2023', 'LC 214/2025 (art. 156-A §2º CF)', 'LC 215/2025'],
        },
      }
    },
  )
}
