/**
 * Rotas — Planner Financeiro Anual (orçado vs realizado).
 *
 * Prefixo: /api/planner
 * Convenções:
 *   - Resposta padrão { success: true, data } / { success: false, error }.
 *   - Path params sanitizados.
 *   - `ano` é validado (inteiro entre 2000 e 2100).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getPlannerService } from '../services/planner/PlannerService.js'
import type {
  CategoriaPlanner,
  PlannerCellPatchPayload,
  PlannerPutPayload,
} from '@aletis/shared-types'

const CATEGORIAS_VALIDAS: CategoriaPlanner[] = [
  'receita_agricola',
  'receita_pecuaria',
  'receita_outras',
  'custo_insumos',
  'custo_mao_obra',
  'custo_servicos',
  'custo_combustivel',
  'despesa_administrativa',
  'despesa_financeira',
  'impostos_taxas',
  'investimento',
]

function safeId(raw: string): string {
  return (raw || '').replace(/[^a-zA-Z0-9_-]/g, '')
}

function parseAno(raw: string): number | null {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 2000 || n > 2100) return null
  return n
}

export default async function (fastify: FastifyInstance) {
  const service = getPlannerService()

  /* ------------------------------------------------------------------
   * GET /api/planner/:clienteId/:ano — planner completo
   * ------------------------------------------------------------------ */
  fastify.get(
    '/api/planner/:clienteId/:ano',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { clienteId, ano } = request.params as {
        clienteId: string
        ano: string
      }
      const anoNum = parseAno(ano)
      if (anoNum === null) {
        reply.status(400)
        return { success: false, error: 'ano inválido' }
      }
      const planner = service.obter(safeId(clienteId), anoNum)
      if (!planner) {
        reply.status(404)
        return { success: false, error: 'Planner não encontrado' }
      }
      return { success: true, data: planner }
    },
  )

  /* ------------------------------------------------------------------
   * PUT /api/planner/:clienteId/:ano — cria ou substitui o planner
   * ------------------------------------------------------------------ */
  fastify.put(
    '/api/planner/:clienteId/:ano',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { clienteId, ano } = request.params as {
        clienteId: string
        ano: string
      }
      const anoNum = parseAno(ano)
      if (anoNum === null) {
        reply.status(400)
        return { success: false, error: 'ano inválido' }
      }
      const body = request.body as PlannerPutPayload | undefined
      if (!body || !Array.isArray(body.linhas)) {
        reply.status(400)
        return { success: false, error: 'Body deve conter { linhas: LinhaPlanner[] }' }
      }
      for (const l of body.linhas) {
        if (!CATEGORIAS_VALIDAS.includes(l.categoria)) {
          reply.status(400)
          return {
            success: false,
            error: `Categoria inválida: ${l.categoria}. Aceitas: ${CATEGORIAS_VALIDAS.join(', ')}`,
          }
        }
      }
      try {
        const planner = service.salvar(safeId(clienteId), anoNum, body)
        return { success: true, data: planner }
      } catch (err) {
        reply.status(500)
        return { success: false, error: (err as Error).message }
      }
    },
  )

  /* ------------------------------------------------------------------
   * PATCH /api/planner/:clienteId/:ano/linha/:categoria/:mes
   * Body: { valor: number, tipo: 'orcado' | 'realizado' }
   * ------------------------------------------------------------------ */
  fastify.patch(
    '/api/planner/:clienteId/:ano/linha/:categoria/:mes',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { clienteId, ano, categoria, mes } = request.params as {
        clienteId: string
        ano: string
        categoria: string
        mes: string
      }
      const anoNum = parseAno(ano)
      if (anoNum === null) {
        reply.status(400)
        return { success: false, error: 'ano inválido' }
      }
      const mesNum = Number(mes)
      if (!Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12) {
        reply.status(400)
        return { success: false, error: 'mes deve ser inteiro 1..12' }
      }
      if (!CATEGORIAS_VALIDAS.includes(categoria as CategoriaPlanner)) {
        reply.status(400)
        return {
          success: false,
          error: `Categoria inválida. Aceitas: ${CATEGORIAS_VALIDAS.join(', ')}`,
        }
      }
      const body = request.body as PlannerCellPatchPayload | undefined
      if (!body || typeof body.valor !== 'number' || !['orcado', 'realizado'].includes(body.tipo)) {
        reply.status(400)
        return {
          success: false,
          error: 'Body deve conter { valor: number, tipo: "orcado"|"realizado" }',
        }
      }
      try {
        const planner = service.atualizarCelula(
          safeId(clienteId),
          anoNum,
          categoria as CategoriaPlanner,
          mesNum,
          body.valor,
          body.tipo,
        )
        return { success: true, data: planner }
      } catch (err) {
        reply.status(400)
        return { success: false, error: (err as Error).message }
      }
    },
  )

  /* ------------------------------------------------------------------
   * GET /api/planner/:clienteId/:ano/resumo — agregado calculado
   * ------------------------------------------------------------------ */
  fastify.get(
    '/api/planner/:clienteId/:ano/resumo',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { clienteId, ano } = request.params as {
        clienteId: string
        ano: string
      }
      const anoNum = parseAno(ano)
      if (anoNum === null) {
        reply.status(400)
        return { success: false, error: 'ano inválido' }
      }
      const resumo = service.calcularResumo(safeId(clienteId), anoNum)
      return { success: true, data: resumo }
    },
  )
}
