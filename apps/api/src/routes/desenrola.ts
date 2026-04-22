/**
 * Rotas — Desenrola Rural / PGFN (simulação + elegibilidade).
 *
 * Prefixo: /api/desenrola
 * Convenções:
 *   - Resposta padrão { success: true, data } / { success: false, error }
 *   - Stateless (sem persistência).
 *
 * Endpoints:
 *   POST /api/desenrola/simular        body = { divida, perfil }
 *   POST /api/desenrola/elegibilidade  body = { divida, perfil }
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getDesenrolaRuralService } from '../services/desenrola/DesenrolaRuralService.js'
import type {
  DividaRural,
  FaixaCapacidadePagamento,
  PerfilProdutor,
} from '@aletis/shared-types/src/desenrola-rural.js'

interface SimulacaoBody {
  divida?: DividaRural
  perfil?: PerfilProdutor
}

const FAIXAS_VALIDAS: FaixaCapacidadePagamento[] = ['A', 'B', 'C', 'D']
const ORIGENS_VALIDAS = [
  'pgfn',
  'receita_federal',
  'banco_publico',
  'banco_cooperativa',
  'outro',
]
const MODALIDADES_VALIDAS = [
  'custeio',
  'investimento',
  'comercializacao',
  'outra',
]

function validarBody(body: SimulacaoBody | undefined): string | null {
  if (!body) return 'Body obrigatório: { divida, perfil }.'
  const { divida, perfil } = body
  if (!divida) return 'Campo "divida" obrigatório.'
  if (!perfil) return 'Campo "perfil" obrigatório.'
  if (!divida.id) return 'Campo "divida.id" obrigatório.'
  if (typeof divida.valorInscrito !== 'number' || divida.valorInscrito < 0) {
    return 'Campo "divida.valorInscrito" obrigatório e não-negativo.'
  }
  if (typeof divida.valorAtualizado !== 'number' || divida.valorAtualizado < 0) {
    return 'Campo "divida.valorAtualizado" obrigatório e não-negativo.'
  }
  if (!divida.dataInscricao) return 'Campo "divida.dataInscricao" obrigatório (ISO YYYY-MM-DD).'
  if (!ORIGENS_VALIDAS.includes(divida.origem)) {
    return `Campo "divida.origem" inválido. Aceitos: ${ORIGENS_VALIDAS.join(', ')}`
  }
  if (!MODALIDADES_VALIDAS.includes(divida.modalidade)) {
    return `Campo "divida.modalidade" inválido. Aceitos: ${MODALIDADES_VALIDAS.join(', ')}`
  }
  if (perfil.tipo !== 'PF' && perfil.tipo !== 'PJ') {
    return 'Campo "perfil.tipo" deve ser PF ou PJ.'
  }
  if (!FAIXAS_VALIDAS.includes(perfil.capacidadePagamento)) {
    return `Campo "perfil.capacidadePagamento" inválido. Aceitos: ${FAIXAS_VALIDAS.join(', ')}`
  }
  return null
}

export default async function (fastify: FastifyInstance) {
  const service = getDesenrolaRuralService()

  /* ------------------------------------------------------------------
   * POST /api/desenrola/simular — simulação completa (desconto + cronograma)
   * ------------------------------------------------------------------ */
  fastify.post(
    '/api/desenrola/simular',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as SimulacaoBody | undefined
      const err = validarBody(body)
      if (err) {
        reply.status(400)
        return { success: false, error: err }
      }
      try {
        const data = service.simular(body!.divida!, body!.perfil!)
        return { success: true, data }
      } catch (e) {
        reply.status(500)
        return { success: false, error: (e as Error).message }
      }
    },
  )

  /* ------------------------------------------------------------------
   * POST /api/desenrola/elegibilidade — retorna apenas verdadeiro/falso + motivos
   * ------------------------------------------------------------------ */
  fastify.post(
    '/api/desenrola/elegibilidade',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as SimulacaoBody | undefined
      const err = validarBody(body)
      if (err) {
        reply.status(400)
        return { success: false, error: err }
      }
      try {
        const data = service.elegibilidade(body!.divida!, body!.perfil!)
        return { success: true, data }
      } catch (e) {
        reply.status(500)
        return { success: false, error: (e as Error).message }
      }
    },
  )
}
