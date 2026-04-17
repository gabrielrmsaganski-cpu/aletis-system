import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { randomUUID } from 'crypto'
import { getProspeccaoService, BatchEvent } from '../services/prospeccao/ProspeccaoService.js'
import { SICARError } from '../services/prospeccao/SICARClient.js'
import { getCaptchaSolver, hasCaptchaKey } from '../services/captcha/CaptchaSolver.js'
import type { ProspeccaoFilters } from '../services/prospeccao/types.js'

/**
 * Rotas de Prospecção — busca de leads agro com dívida ativa PGFN.
 *
 * POST /api/prospeccao/buscar     — busca com filtros, paginação e ordenação
 * GET  /api/prospeccao/lead/:cpf  — detalhe do lead (sem enriquecimento remoto)
 * POST /api/prospeccao/enriquecer/:cpf — dispara BrasilAPI e recomputa scoring
 * GET  /api/prospeccao/stats      — agregados (UF, faixas de dívida, signals)
 * GET  /api/prospeccao/export.csv — exporta resultado com filtros em CSV
 */
export default async function prospeccaoRoutes(app: FastifyInstance) {
  const service = getProspeccaoService()

  app.post('/api/prospeccao/buscar', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as ProspeccaoFilters
    const result = service.buscar(body)
    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    }
  })

  app.get(
    '/api/prospeccao/lead/:cpfCnpj',
    async (req: FastifyRequest<{ Params: { cpfCnpj: string } }>, reply: FastifyReply) => {
      const lead = service.getLead(req.params.cpfCnpj)
      if (!lead) {
        reply.status(404)
        return { success: false, error: 'Lead não encontrado', code: 'LEAD_NOT_FOUND' }
      }
      return { success: true, data: lead }
    }
  )

  app.post(
    '/api/prospeccao/enriquecer/:cpfCnpj',
    async (
      req: FastifyRequest<{
        Params: { cpfCnpj: string }
        Body: { codImovel?: string } | null
      }>,
      reply: FastifyReply
    ) => {
      const codImovel = req.body?.codImovel
      try {
        const lead = await service.enrichLead(req.params.cpfCnpj, codImovel)
        if (!lead) {
          reply.status(404)
          return { success: false, error: 'Lead não encontrado', code: 'LEAD_NOT_FOUND' }
        }
        return { success: true, data: lead }
      } catch (err) {
        if (err instanceof SICARError) {
          reply.status(err.code === 'SICAR_NOT_FOUND' ? 404 : 502)
          return { success: false, error: err.message, code: err.code }
        }
        throw err
      }
    }
  )

  app.get(
    '/api/prospeccao/car/consultar/:codImovel',
    async (
      req: FastifyRequest<{
        Params: { codImovel: string }
        Querystring: { cpfCnpj?: string }
      }>,
      reply: FastifyReply
    ) => {
      try {
        const result = await service.consultarCar(
          req.query.cpfCnpj || '',
          req.params.codImovel
        )
        return { success: true, data: result }
      } catch (err) {
        if (err instanceof SICARError) {
          reply.status(err.code === 'SICAR_NOT_FOUND' ? 404 : 502)
          return { success: false, error: err.message, code: err.code }
        }
        throw err
      }
    }
  )

  app.get('/api/prospeccao/car/status', async () => {
    const sicar = await service.sicarStatus()
    let captchaBalance: number | null = null
    let captchaError: string | null = null
    if (hasCaptchaKey()) {
      try {
        captchaBalance = await getCaptchaSolver().getBalance()
      } catch (err: any) {
        captchaError = err?.message || 'falha ao consultar saldo 2captcha'
      }
    }
    return {
      success: true,
      data: {
        sicar,
        captcha: {
          enabled: hasCaptchaKey(),
          balanceUsd: captchaBalance,
          error: captchaError,
        },
        index: service.sicarIndexStats(),
      },
    }
  })

  app.get('/api/prospeccao/stats', async () => {
    return { success: true, data: service.stats() }
  })

  // ─── Exclusão (soft-delete / blacklist) ─────────────────────

  app.delete(
    '/api/prospeccao/lead/:cpfCnpj',
    async (
      req: FastifyRequest<{
        Params: { cpfCnpj: string }
        Body: { motivo?: string } | null
      }>,
      reply: FastifyReply
    ) => {
      const motivo = req.body?.motivo || 'sem motivo informado'
      const entry = service.excluirLead(req.params.cpfCnpj, motivo)
      if (!entry) {
        reply.status(404)
        return { success: false, error: 'Lead não encontrado', code: 'LEAD_NOT_FOUND' }
      }
      return { success: true, data: entry }
    }
  )

  app.post(
    '/api/prospeccao/lead/:cpfCnpj/restaurar',
    async (
      req: FastifyRequest<{ Params: { cpfCnpj: string } }>,
      reply: FastifyReply
    ) => {
      const ok = service.restaurarLead(req.params.cpfCnpj)
      if (!ok) {
        reply.status(404)
        return { success: false, error: 'Lead não estava excluído', code: 'NOT_BLACKLISTED' }
      }
      return { success: true }
    }
  )

  // ─── Enriquecimento em lote (SSE) ───────────────────────────

  app.post(
    '/api/prospeccao/enriquecer-lote',
    async (
      req: FastifyRequest<{
        Body: ProspeccaoFilters & { concurrency?: number }
      }>,
      reply: FastifyReply
    ) => {
      const body = (req.body || {}) as ProspeccaoFilters & { concurrency?: number }
      const batchId = randomUUID()

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })

      const send = (ev: BatchEvent) => {
        reply.raw.write(`event: ${ev.type}\n`)
        reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`)
      }

      // ID inicial para o cliente cancelar depois
      reply.raw.write(`event: batch\n`)
      reply.raw.write(`data: ${JSON.stringify({ batchId })}\n\n`)

      // Se o cliente desconectar, cancela
      req.raw.on('close', () => {
        service.cancelBatch(batchId)
      })

      try {
        await service.enriquecerLote(body, {
          batchId,
          concurrency: body.concurrency,
          onProgress: send,
        })
      } catch (err: any) {
        send({
          type: 'done',
          batchId,
          processed: 0,
          total: 0,
          ok: 0,
          fail: 0,
        } as BatchEvent)
        reply.raw.write(
          `event: error\ndata: ${JSON.stringify({ error: err?.message || 'falha' })}\n\n`
        )
      } finally {
        reply.raw.end()
      }
    }
  )

  app.post(
    '/api/prospeccao/enriquecer-lote/preview',
    async (req: FastifyRequest<{ Body: ProspeccaoFilters }>) => {
      const body = (req.body || {}) as ProspeccaoFilters
      return { success: true, data: service.previewLote(body) }
    }
  )

  app.post(
    '/api/prospeccao/enriquecer-lote/:batchId/cancelar',
    async (req: FastifyRequest<{ Params: { batchId: string } }>) => {
      const ok = service.cancelBatch(req.params.batchId)
      return { success: ok }
    }
  )

  app.post(
    '/api/prospeccao/export.csv',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = { ...(req.body || {}), pageSize: 1000, page: 1 } as ProspeccaoFilters
      const { leads } = service.buscar(body)
      const header = [
        'cpf_cnpj',
        'tipo_pessoa',
        'nome',
        'uf',
        'divida_total',
        'qtd_inscricoes',
        'tem_ajuizada',
        'hectares_estimados',
        'area_confidence',
        'score',
        'classificacao',
        'honorarios_estimados',
        'agro_signals',
        'ultima_inscricao',
      ]
      const rows = leads.map((l) => [
        l.cpfCnpj,
        l.tipoPessoa,
        (l.nome || '').replace(/[";\n]/g, ' '),
        l.uf,
        l.totalDivida.toFixed(2),
        l.qtdInscricoes,
        l.temAjuizada ? 'sim' : 'nao',
        l.area.hectaresEstimados,
        l.area.confidence,
        l.score.total,
        l.score.classificacao,
        l.score.honorariosEstimados.toFixed(2),
        l.agroSignals.join('|'),
        l.ultimaInscricao,
      ])
      const csv =
        '\uFEFF' + // BOM para Excel reconhecer UTF-8
        [header.join(';'), ...rows.map((r) => r.join(';'))].join('\n')
      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="prospeccao-agro.csv"')
      return reply.send(csv)
    }
  )
}
