import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { resolveInternalSession } from '../lib/internal-auth.js'
import { getRecalculoAcordoService } from '../services/recalculo-acordo/RecalculoAcordoService.js'
import { getIndexSyncState, isIndexStale, markIndexHydrated, sincronizarIndices } from '../services/recalculo-acordo/IndexSyncService.js'
import { gerarRecalculoAcordoPdf } from '../services/recalculo-acordo/RecalculoAcordoPdf.js'

const parcelSchema = z.object({ id: z.string().min(1), vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), valorOriginal: z.string().min(1) })
const inputSchema = z.object({
  titulo: z.string().trim().min(1).max(200), indiceCode: z.string().trim().min(1), corrigirAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  moraMensalPct: z.string().min(1), parcelas: z.array(parcelSchema).min(1).max(1000), compatibilidadePlanilha: z.boolean().optional(),
  organizationId: z.string().optional(), usuarioId: z.string().optional(), usuarioNome: z.string().optional(), clienteId: z.string().optional(), propostaId: z.string().optional(), negociacaoId: z.string().optional(),
})
function tenantId(req: { headers: Record<string, string | string[] | undefined> }): string {
  const header = req.headers['x-tenant-id']
  return (Array.isArray(header) ? header[0] : header)?.trim() || process.env.ALETIS_TENANT_ID || 'default'
}

export default async function recalculoAcordoRoutes(fastify: FastifyInstance): Promise<void> {
  const service = getRecalculoAcordoService()
  try { await service.hydrate(); await service.hydrateSeries(); for (const item of service.listIndices()) { const last = service.getSeries(item.code).at(-1)?.fetchedAt; if (last) markIndexHydrated(item.code, last) } } catch (error) { fastify.log.warn({ error }, 'Não foi possível hidratar recálculos/índices do Postgres; usando cache em memória.') }
  fastify.post<{ Body: { codes?: string[] } }>('/api/recalculos-acordo/indices/sync', async (req, reply) => {
    const result = await sincronizarIndices(req.body?.codes as Array<'INPC' | 'IPCA' | 'IPCA-E' | 'IGP-M' | 'SELIC' | 'TR' | 'CDI'> | undefined)
    return reply.send({ success: true, data: result })
  })
  fastify.get('/api/recalculos-acordo/indices', async (_req, reply) => {
    const configured = service.listIndices()
    for (const item of configured) {
      if (isIndexStale(item.code) && !getIndexSyncState(item.code).running) void sincronizarIndices([item.code]).catch(() => undefined)
    }
    const data = configured.map((item) => ({ ...item, ...getIndexSyncState(item.code), status: getIndexSyncState(item.code).error ? 'ERRO_SINCRONIZACAO' : item.ultimoPeriodo ? (isIndexStale(item.code) ? 'CACHE_DESATUALIZADO' : 'ATUALIZADO') : 'SINCRONIZANDO' }))
    return reply.send({ success: true, data })
  })
  fastify.get<{ Params: { code: string }; Querystring: { from?: string; to?: string } }>('/api/recalculos-acordo/indices/:code/serie', async (req, reply) => {
    try { return reply.send({ success: true, data: service.getSeries(req.params.code, req.query.from, req.query.to) }) } catch (error) { return reply.status(400).send({ success: false, error: (error as Error).message }) }
  })
  fastify.post<{ Body: unknown }>('/api/recalculos-acordo/calcular', async (req, reply) => {
    const parsed = inputSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ success: false, error: parsed.error.issues.map((issue) => issue.message).join('; ') })
    try { return reply.send({ success: true, data: service.calculate(parsed.data) }) } catch (error) { return reply.status(422).send({ success: false, error: (error as Error).message }) }
  })
  fastify.post<{ Body: unknown }>('/api/recalculos-acordo', async (req, reply) => {
    const parsed = inputSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ success: false, error: parsed.error.issues.map((issue) => issue.message).join('; ') })
    try {
      const actor = resolveInternalSession(fastify, req)
      const record = await service.save({ ...parsed.data, organizationId: tenantId(req), usuarioId: actor?.id, usuarioNome: actor?.nome }, actor?.id ?? 'system')
      return reply.status(201).send({ success: true, data: record })
    } catch (error) { return reply.status(422).send({ success: false, error: (error as Error).message }) }
  })
  fastify.get('/api/recalculos-acordo', async (req, reply) => reply.send({ success: true, data: service.list(tenantId(req)) }))
  fastify.get<{ Params: { id: string } }>('/api/recalculos-acordo/:id', async (req, reply) => {
    const record = service.get(req.params.id, tenantId(req))
    return record ? reply.send({ success: true, data: record }) : reply.status(404).send({ success: false, error: 'Recálculo não encontrado.' })
  })
  fastify.get<{ Params: { id: string } }>('/api/recalculos-acordo/:id/pdf', async (req, reply) => {
    const record = service.get(req.params.id, tenantId(req))
    if (!record) return reply.status(404).send({ success: false, error: 'Recálculo não encontrado.' })
    const buffer = await gerarRecalculoAcordoPdf(record)
    return reply.type('application/pdf').header('Content-Disposition', `attachment; filename="ALETIS_${record.codigo}.pdf"`).send(buffer)
  })
  fastify.post<{ Params: { id: string }; Body: unknown }>('/api/recalculos-acordo/:id/recalcular', async (req, reply) => {
    const original = service.get(req.params.id, tenantId(req))
    if (!original) return reply.status(404).send({ success: false, error: 'Recálculo não encontrado.' })
    const parsed = inputSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ success: false, error: parsed.error.issues.map((issue) => issue.message).join('; ') })
    try { const actor = resolveInternalSession(fastify, req); const record = await service.save({ ...parsed.data, organizationId: tenantId(req), usuarioId: actor?.id, usuarioNome: actor?.nome, clienteId: original.clienteId, propostaId: original.propostaId, negociacaoId: original.negociacaoId }, actor?.id ?? 'system'); return reply.status(201).send({ success: true, data: record, basedOn: original.id }) } catch (error) { return reply.status(422).send({ success: false, error: (error as Error).message }) }
  })
  fastify.post<{ Params: { id: string } }>('/api/recalculos-acordo/:id/duplicar', async (req, reply) => {
    try { const actor = resolveInternalSession(fastify, req); return reply.status(201).send({ success: true, data: await service.duplicate(req.params.id, actor?.id ?? 'system', tenantId(req)) }) } catch (error) { return reply.status(404).send({ success: false, error: (error as Error).message }) }
  })
  fastify.delete<{ Params: { id: string } }>('/api/recalculos-acordo/:id', async (req, reply) => {
    try { const actor = resolveInternalSession(fastify, req); await service.archive(req.params.id, actor?.id ?? 'system', tenantId(req)); return reply.send({ success: true }) } catch (error) { return reply.status(404).send({ success: false, error: (error as Error).message }) }
  })
}
