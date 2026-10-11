/**
 * Rotas — Calculadoras Agro nativas.
 *
 * Prefixo: /api/calculadoras-agro
 *
 * Reimplementação em TS das planilhas em /ALETIS2/novos/sistema agro/.
 * Stateless — todas as rotas recebem inputs no body, retornam o resultado.
 *
 * Endpoints:
 *   POST /api/calculadoras-agro/dupont-fleuriet
 *   POST /api/calculadoras-agro/preco-venda
 *   POST /api/calculadoras-agro/farms-viabilidade
 *   POST /api/calculadoras-agro/farms-cenarios   (compara múltiplos)
 *   GET  /api/calculadoras-agro/fechamento-embarque/default
 *   POST /api/calculadoras-agro/fechamento-embarque
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  calcularDupontFleuriet,
  calcularPrecoVenda,
  calcularFarms,
  rankearCenarios,
  calcularFechamentoGeralEmbarque,
  FECHAMENTO_ARI_PRADO_2024_INPUT,
  type DREInput,
  type BPInput,
  type FormacaoPrecoInput,
  type FarmsInput,
  type FechamentoGeralEmbarqueInput,
} from '@aletis/financial-calc'

const ok = <T>(data: T) => ({ success: true as const, data })
const fail = (error: string) => ({ success: false as const, error })

export default async function (fastify: FastifyInstance) {
  fastify.post(
    '/api/calculadoras-agro/dupont-fleuriet',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as { dre?: DREInput; bp?: BPInput } | undefined
      if (!body?.dre || !body?.bp) {
        reply.status(400)
        return fail('Body deve conter "dre" e "bp"')
      }
      try {
        return ok(calcularDupontFleuriet(body.dre, body.bp))
      } catch (e) {
        reply.status(400)
        return fail(e instanceof Error ? e.message : 'erro')
      }
    },
  )

  fastify.post(
    '/api/calculadoras-agro/preco-venda',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as FormacaoPrecoInput | undefined
      if (!body) {
        reply.status(400)
        return fail('Body obrigatório')
      }
      try {
        return ok(calcularPrecoVenda(body))
      } catch (e) {
        reply.status(400)
        return fail(e instanceof Error ? e.message : 'erro')
      }
    },
  )

  fastify.post(
    '/api/calculadoras-agro/farms-viabilidade',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as FarmsInput | undefined
      if (!body) {
        reply.status(400)
        return fail('Body obrigatório')
      }
      try {
        return ok(calcularFarms(body))
      } catch (e) {
        reply.status(400)
        return fail(e instanceof Error ? e.message : 'erro')
      }
    },
  )

  fastify.post(
    '/api/calculadoras-agro/farms-cenarios',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as { cenarios?: { nome: string; input: FarmsInput }[] } | undefined
      if (!body?.cenarios?.length) {
        reply.status(400)
        return fail('Body deve conter "cenarios" não vazio')
      }
      try {
        const computed = body.cenarios.map((c) => ({ nome: c.nome, result: calcularFarms(c.input) }))
        return ok(rankearCenarios(computed))
      } catch (e) {
        reply.status(400)
        return fail(e instanceof Error ? e.message : 'erro')
      }
    },
  )

  fastify.get('/api/calculadoras-agro/fechamento-embarque/default', async () => {
    return ok(FECHAMENTO_ARI_PRADO_2024_INPUT)
  })

  fastify.post(
    '/api/calculadoras-agro/fechamento-embarque',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as FechamentoGeralEmbarqueInput | undefined
      if (!body?.embarques?.length) {
        reply.status(400)
        return fail('Body deve conter "nome" e "embarques" nao vazio')
      }
      try {
        return ok(calcularFechamentoGeralEmbarque(body))
      } catch (e) {
        reply.status(400)
        return fail(e instanceof Error ? e.message : 'erro')
      }
    },
  )
}
