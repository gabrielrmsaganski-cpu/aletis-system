/**
 * Rotas — Plano Simples de Custeio Agrícola 2026.
 *
 * Prefixo: /api/custeio
 * Convenções:
 *   - Resposta padrão { success: true, data } / { success: false, error }.
 *   - Path params são normalizados pra evitar "/" problemáticos.
 *   - PDF retornado como application/pdf com filename sugerido.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getCusteioService } from '../services/custeio/CusteioService.js'
import { gerarPdfCusteio } from '../services/custeio/CusteioPdfGenerator.js'
import type {
  PlanoCusteioCreatePayload,
  PlanoCusteioUpdatePayload,
  PlanoCusteioListFilters,
} from '@aletis/shared-types'

/** Sanitiza id no path (alfanumérico + - _). Evita "/"- based path traversal. */
function safeId(raw: string): string {
  return (raw || '').replace(/[^a-zA-Z0-9_-]/g, '')
}

export default async function (fastify: FastifyInstance) {
  const service = getCusteioService()

  /* ------------------------------------------------------------------
   * POST /api/custeio — cria novo plano (rascunho)
   * ------------------------------------------------------------------ */
  fastify.post('/api/custeio', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as PlanoCusteioCreatePayload | undefined
    if (!body || !body.clienteId || !body.safra || !body.proponente) {
      reply.status(400)
      return {
        success: false,
        error: 'Campos obrigatórios: clienteId, safra, proponente { nome, tipo, cpfCnpj }',
      }
    }
    if (!body.proponente.nome || !body.proponente.cpfCnpj || !body.proponente.tipo) {
      reply.status(400)
      return {
        success: false,
        error: 'Proponente incompleto — nome, tipo e cpfCnpj são obrigatórios',
      }
    }
    try {
      const plano = service.criar(body)
      return { success: true, data: plano }
    } catch (err) {
      reply.status(500)
      return { success: false, error: (err as Error).message }
    }
  })

  /* ------------------------------------------------------------------
   * GET /api/custeio — lista com filtros opcionais
   * Query: ?clienteId=...&safra=...&status=...
   * ------------------------------------------------------------------ */
  fastify.get('/api/custeio', async (request: FastifyRequest) => {
    const q = request.query as Partial<PlanoCusteioListFilters>
    const filtros: PlanoCusteioListFilters = {}
    if (q.clienteId) filtros.clienteId = String(q.clienteId)
    if (q.safra) filtros.safra = String(q.safra)
    if (q.status) filtros.status = q.status
    const lista = service.listar(filtros)
    return {
      success: true,
      data: {
        total: lista.length,
        planos: lista,
      },
    }
  })

  /* ------------------------------------------------------------------
   * GET /api/custeio/:id — obtém plano
   * ------------------------------------------------------------------ */
  fastify.get('/api/custeio/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const plano = service.buscar(safeId(id))
    if (!plano) {
      reply.status(404)
      return { success: false, error: 'Plano não encontrado' }
    }
    return { success: true, data: plano }
  })

  /* ------------------------------------------------------------------
   * PUT /api/custeio/:id — atualização parcial (merge)
   * ------------------------------------------------------------------ */
  fastify.put('/api/custeio/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const patch = request.body as PlanoCusteioUpdatePayload | undefined
    if (!patch) {
      reply.status(400)
      return { success: false, error: 'Body obrigatório' }
    }
    const atualizado = service.atualizar(safeId(id), patch)
    if (!atualizado) {
      reply.status(404)
      return { success: false, error: 'Plano não encontrado' }
    }
    return { success: true, data: atualizado }
  })

  /* ------------------------------------------------------------------
   * DELETE /api/custeio/:id — remove plano
   * ------------------------------------------------------------------ */
  fastify.delete('/api/custeio/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const ok = service.deletar(safeId(id))
    if (!ok) {
      reply.status(404)
      return { success: false, error: 'Plano não encontrado' }
    }
    return { success: true, data: { id } }
  })

  /* ------------------------------------------------------------------
   * POST /api/custeio/:id/duplicar
   * Body: { novaSafra: string }
   * ------------------------------------------------------------------ */
  fastify.post('/api/custeio/:id/duplicar', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { novaSafra?: string } | undefined
    if (!body?.novaSafra) {
      reply.status(400)
      return { success: false, error: 'novaSafra é obrigatório' }
    }
    const novo = service.duplicar(safeId(id), body.novaSafra)
    if (!novo) {
      reply.status(404)
      return { success: false, error: 'Plano original não encontrado' }
    }
    return { success: true, data: novo }
  })

  /* ------------------------------------------------------------------
   * GET /api/custeio/:id/indicadores
   * Query: ?taxaAnual=12 (opcional)
   * Calcula e retorna; se ?persistir=1, salva no plano.
   * ------------------------------------------------------------------ */
  fastify.get('/api/custeio/:id/indicadores', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const q = request.query as { taxaAnual?: string; persistir?: string }
    const plano = service.buscar(safeId(id))
    if (!plano) {
      reply.status(404)
      return { success: false, error: 'Plano não encontrado' }
    }
    const taxaAnual = q.taxaAnual ? Number(q.taxaAnual) : undefined
    if (taxaAnual !== undefined && (!Number.isFinite(taxaAnual) || taxaAnual < 0)) {
      reply.status(400)
      return { success: false, error: 'taxaAnual deve ser número ≥ 0' }
    }

    if (q.persistir === '1' || q.persistir === 'true') {
      const atualizado = service.calcularESalvar(safeId(id), { taxaAnual })
      return { success: true, data: atualizado?.resultadoEsperado }
    }
    const ind = service.calcularIndicadores(plano, { taxaAnual })
    return { success: true, data: ind }
  })

  /* ------------------------------------------------------------------
   * GET /api/custeio/:id/pdf — gera PDF do plano
   * ------------------------------------------------------------------ */
  fastify.get('/api/custeio/:id/pdf', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const plano = service.buscar(safeId(id))
    if (!plano) {
      reply.status(404)
      return { success: false, error: 'Plano não encontrado' }
    }
    try {
      const bytes = await gerarPdfCusteio(plano)
      const filename = `plano-custeio-${safeId(id)}-${plano.safra.replace(/\//g, '-')}.pdf`
      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('Content-Length', bytes.length.toString())
      return reply.send(Buffer.from(bytes))
    } catch (err) {
      reply.status(500)
      return { success: false, error: `Falha ao gerar PDF: ${(err as Error).message}` }
    }
  })
}
