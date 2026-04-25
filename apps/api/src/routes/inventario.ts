// ============================================================
// Rotas REST — Inventário patrimonial + Custo operacional
// ============================================================
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getInventarioService } from '../services/inventario/InventarioService.js'
import {
  getCustoOperacionalService,
  type CulturaAgro,
  type CustoOperacionalInput,
} from '../services/inventario/CustoOperacionalService.js'
import type { Patrimonio, TipoPatrimonio } from '../services/inventario/types.js'

export default async function inventarioRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = getInventarioService()
  const custo = getCustoOperacionalService()

  // ── GET inventário completo de um cliente ────────────────
  fastify.get('/api/inventario/:clienteId', async (
    req: FastifyRequest<{ Params: { clienteId: string }; Querystring: { tipo?: TipoPatrimonio } }>,
    reply: FastifyReply,
  ) => {
    const { clienteId } = req.params
    const tipo = req.query?.tipo
    const inv = svc.get(clienteId)
    if (tipo) {
      return reply.send({
        success: true,
        data: {
          ...inv,
          ativos: inv.ativos.filter((a) => a.tipo === tipo),
        },
      })
    }
    return reply.send({ success: true, data: inv })
  })

  // ── POST adicionar patrimônio ────────────────────────────
  fastify.post('/api/inventario/:clienteId', async (
    req: FastifyRequest<{ Params: { clienteId: string }; Body: Omit<Patrimonio, 'id' | 'criadoEm' | 'atualizadoEm' | 'clienteId'> }>,
    reply: FastifyReply,
  ) => {
    const { clienteId } = req.params
    const body = req.body as any
    if (!body?.tipo) return reply.status(400).send({ success: false, error: 'campo "tipo" obrigatório' })
    if (!body?.nome) return reply.status(400).send({ success: false, error: 'campo "nome" obrigatório' })
    try {
      const novo = svc.adicionar(clienteId, {
        status: 'ativo',
        ...body,
      })
      return reply.status(201).send({ success: true, data: novo })
    } catch (err) {
      return reply.status(400).send({ success: false, error: (err as Error).message })
    }
  })

  // ── PATCH atualizar ─────────────────────────────────────
  fastify.patch('/api/inventario/:clienteId/:id', async (
    req: FastifyRequest<{ Params: { clienteId: string; id: string }; Body: Partial<Patrimonio> }>,
    reply: FastifyReply,
  ) => {
    const { clienteId, id } = req.params
    const updated = svc.atualizar(clienteId, id, req.body as any)
    if (!updated) return reply.status(404).send({ success: false, error: 'patrimônio não encontrado' })
    return reply.send({ success: true, data: updated })
  })

  // ── DELETE remover ──────────────────────────────────────
  fastify.delete('/api/inventario/:clienteId/:id', async (
    req: FastifyRequest<{ Params: { clienteId: string; id: string } }>,
    reply: FastifyReply,
  ) => {
    const { clienteId, id } = req.params
    const ok = svc.remover(clienteId, id)
    if (!ok) return reply.status(404).send({ success: false, error: 'patrimônio não encontrado' })
    return reply.send({ success: true, data: { clienteId, id, removido: true } })
  })

  // ── GET garantia disponível consolidada ─────────────────
  fastify.get('/api/inventario/:clienteId/garantia', async (
    req: FastifyRequest<{ Params: { clienteId: string } }>,
    reply: FastifyReply,
  ) => {
    const data = svc.valorGarantiaDisponivel(req.params.clienteId)
    return reply.send({ success: true, data })
  })

  // ── GET calculadora custo operacional ───────────────────
  fastify.get('/api/inventario/custo-operacional/culturas', async (_req, reply) => {
    return reply.send({
      success: true,
      data: {
        culturas: custo.culturasSuportadas(),
        observacao: 'Endpoint POST /api/inventario/custo-operacional retorna decomposição completa.',
      },
    })
  })

  fastify.post('/api/inventario/custo-operacional', async (
    req: FastifyRequest<{ Body: CustoOperacionalInput }>,
    reply: FastifyReply,
  ) => {
    try {
      const r = await custo.calcular(req.body)
      return reply.send({ success: true, data: r })
    } catch (err) {
      return reply.status(400).send({ success: false, error: (err as Error).message })
    }
  })

  fastify.get('/api/inventario/custo-operacional/coeficientes/:cultura', async (
    req: FastifyRequest<{ Params: { cultura: CulturaAgro } }>,
    reply: FastifyReply,
  ) => {
    const c = req.params.cultura
    const coefs = custo.coeficientesDaCultura(c)
    if (!coefs.length) return reply.status(404).send({ success: false, error: `cultura não catalogada: ${c}` })
    return reply.send({ success: true, data: { cultura: c, operacoes: coefs } })
  })

  console.log('[INVENTARIO] Rotas registradas: CRUD /api/inventario + custo-operacional')
}
