/**
 * Rotas — Balanced Scorecard Agro (Wave 8a)
 *
 * Prefixo: /api/bsc
 * Convenções:
 *   - Resposta padrão { success: true, data } / { success: false, error }
 *   - Endpoints puros (cálculo) são stateless; snapshot persiste em
 *     `apps/api/storage/bsc/{clienteId}.jsonl`.
 *
 * Endpoints:
 *   GET  /api/bsc/kpis                     — catálogo completo
 *   GET  /api/bsc/kpis/:perspectiva        — catálogo filtrado
 *   POST /api/bsc/calcular                 — body = ContextoBSCCalculo
 *   POST /api/bsc/snapshot/:clienteId      — calcula + persiste
 *   GET  /api/bsc/snapshot/:clienteId      — histórico do cliente
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getBscService } from '../services/bsc/BscService.js'
import type {
  ContextoBSCCalculo,
  PerspectivaBSC,
} from '@aletis/shared-types/src/bsc.js'

const PERSPECTIVAS_VALIDAS: PerspectivaBSC[] = [
  'financeira',
  'clientes',
  'processos_internos',
  'aprendizado_crescimento',
]

/** Valida os campos numéricos mínimos do contexto. */
function validarContexto(body: unknown): { ok: true; ctx: ContextoBSCCalculo } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Body deve ser um objeto ContextoBSCCalculo.' }
  }
  const b = body as Record<string, unknown>
  const requeridos: (keyof ContextoBSCCalculo)[] = [
    'receitaBruta',
    'receitaLiquida',
    'custosProducao',
    'despesasOperacionais',
    'ebitda',
    'lucroLiquido',
    'ativoTotal',
    'passivoCirculante',
    'ativoCirculante',
    'estoque',
    'contasReceber',
    'dividasTotal',
    'patrimonioLiquido',
    'investimentoCapital',
    'areaPlantadaHa',
    'producaoTotalTon',
    'periodo',
  ]
  for (const campo of requeridos) {
    if (!(campo in b)) {
      return { ok: false, error: `Campo obrigatório ausente: "${String(campo)}"` }
    }
    if (campo === 'periodo') {
      if (typeof b[campo] !== 'string' || !b[campo]) {
        return { ok: false, error: 'Campo "periodo" deve ser string não-vazia.' }
      }
    } else if (typeof b[campo] !== 'number' || !Number.isFinite(b[campo] as number)) {
      return {
        ok: false,
        error: `Campo "${String(campo)}" deve ser número finito.`,
      }
    }
  }
  return { ok: true, ctx: body as ContextoBSCCalculo }
}

export default async function (fastify: FastifyInstance) {
  const service = getBscService()

  /* ------------------------------------------------------------------
   * GET /api/bsc/kpis — catálogo completo dos 12-15 KPIs canônicos.
   * ------------------------------------------------------------------ */
  fastify.get('/api/bsc/kpis', async () => {
    const data = service.listarKpis()
    return {
      success: true,
      data: {
        total: data.length,
        kpis: data,
      },
    }
  })

  /* ------------------------------------------------------------------
   * GET /api/bsc/kpis/:perspectiva — filtro por perspectiva.
   * ------------------------------------------------------------------ */
  fastify.get(
    '/api/bsc/kpis/:perspectiva',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { perspectiva } = request.params as { perspectiva: string }
      if (!PERSPECTIVAS_VALIDAS.includes(perspectiva as PerspectivaBSC)) {
        reply.status(400)
        return {
          success: false,
          error: `Perspectiva inválida. Aceitas: ${PERSPECTIVAS_VALIDAS.join(', ')}`,
        }
      }
      const data = service.listarPorPerspectiva(perspectiva as PerspectivaBSC)
      return {
        success: true,
        data: {
          perspectiva,
          total: data.length,
          kpis: data,
        },
      }
    },
  )

  /* ------------------------------------------------------------------
   * POST /api/bsc/calcular — calcula o BSC para um contexto.
   * ------------------------------------------------------------------ */
  fastify.post(
    '/api/bsc/calcular',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const v = validarContexto(request.body)
      if (!v.ok) {
        reply.status(400)
        return { success: false, error: v.error }
      }
      try {
        const data = service.calcular(v.ctx)
        return { success: true, data }
      } catch (err) {
        reply.status(500)
        return { success: false, error: (err as Error).message }
      }
    },
  )

  /* ------------------------------------------------------------------
   * POST /api/bsc/snapshot/:clienteId — calcula + persiste JSONL.
   * ------------------------------------------------------------------ */
  fastify.post(
    '/api/bsc/snapshot/:clienteId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { clienteId } = request.params as { clienteId: string }
      if (!clienteId || !/^[a-zA-Z0-9_\-.]+$/.test(clienteId)) {
        reply.status(400)
        return {
          success: false,
          error: 'clienteId inválido (apenas letras, dígitos, "-", "_", ".").',
        }
      }
      const v = validarContexto(request.body)
      if (!v.ok) {
        reply.status(400)
        return { success: false, error: v.error }
      }
      try {
        const { resultado, record } = await service.snapshot(clienteId, v.ctx)
        return {
          success: true,
          data: {
            clienteId,
            calculadoEm: record.calculadoEm,
            resultado,
          },
        }
      } catch (err) {
        reply.status(500)
        return { success: false, error: (err as Error).message }
      }
    },
  )

  /* ------------------------------------------------------------------
   * GET /api/bsc/snapshot/:clienteId — histórico append-only.
   * ------------------------------------------------------------------ */
  fastify.get(
    '/api/bsc/snapshot/:clienteId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { clienteId } = request.params as { clienteId: string }
      if (!clienteId || !/^[a-zA-Z0-9_\-.]+$/.test(clienteId)) {
        reply.status(400)
        return { success: false, error: 'clienteId inválido.' }
      }
      try {
        const historico = await service.historico(clienteId)
        return {
          success: true,
          data: {
            clienteId,
            total: historico.length,
            snapshots: historico,
          },
        }
      } catch (err) {
        reply.status(500)
        return { success: false, error: (err as Error).message }
      }
    },
  )
}
