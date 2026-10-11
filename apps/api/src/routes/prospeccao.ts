import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { randomUUID } from 'crypto'
import { getProspeccaoService, BatchEvent } from '../services/prospeccao/ProspeccaoService.js'
import { SICARError } from '../services/prospeccao/SICARClient.js'
import { getCaptchaSolver, hasCaptchaKey } from '../services/captcha/CaptchaSolver.js'
import type { ContactOutcome, ContactOutcomeTipo, LeadFull, ProspeccaoFilters } from '../services/prospeccao/types.js'

const OUTCOME_TIPOS: readonly ContactOutcomeTipo[] = [
  'sucesso',
  'interessado',
  'retornar',
  'recusou',
  'ja_regularizou',
  'nao_agro',
  'fora_target',
]
const CANAIS: readonly NonNullable<ContactOutcome['canal']>[] = [
  'whatsapp',
  'telefone',
  'email',
  'presencial',
  'outro',
]

interface SqlLeadsQuery {
  uf?: string
  minScore?: string
  minDivida?: string
  maxDivida?: string
  tipoPessoa?: 'PF' | 'PJ'
  ajuizado?: string
  limit?: string
  offset?: string
  orderBy?: string
}

function boundedInteger(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(Math.floor(parsed), maximum)
}

function nonNegativeInteger(value: string | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

function nonNegativeNumber(value: string | undefined): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function normalizedUf(value: string | undefined): string | undefined {
  const uf = value?.trim().toUpperCase()
  return uf && /^[A-Z]{2}$/.test(uf) ? uf : undefined
}

function sqlFallbackLead(lead: LeadFull) {
  return {
    cnpjCpf: lead.cpfCnpj,
    nome: lead.nome,
    uf: lead.uf,
    areaEstimadaHa: Number.isFinite(lead.area.hectaresEstimados)
      ? String(lead.area.hectaresEstimados)
      : null,
    totalDivida: Number.isFinite(lead.totalDivida) ? lead.totalDivida.toFixed(2) : null,
    inscricoesCount: lead.qtdInscricoes,
    ajuizado: lead.temAjuizada,
    agroScore: Number.isFinite(lead.score.total) ? Math.round(lead.score.total) : null,
  }
}

function sqlFallbackResponse(
  service: Pick<ReturnType<typeof getProspeccaoService>, 'buscar'>,
  query: SqlLeadsQuery,
  reason: string,
) {
  const limit = boundedInteger(query.limit, 50, 500)
  const offset = nonNegativeInteger(query.offset)
  const ajuizado = query.ajuizado === 'true' ? true : query.ajuizado === 'false' ? false : undefined
  const result = service.buscar({
    uf: normalizedUf(query.uf),
    minDivida: nonNegativeNumber(query.minDivida),
    maxDivida: nonNegativeNumber(query.maxDivida),
    tipoPessoa: query.tipoPessoa,
    temAjuizada: ajuizado,
    sortBy: query.orderBy === 'score' ? 'score' : 'divida',
    pageSize: limit,
    offset,
  })

  return {
    success: true,
    source: 'memory' as const,
    aviso: `Consulta SQL indisponível; exibindo índice local (${reason}).`,
    total: result.total,
    limit: result.pageSize,
    offset,
    leads: result.leads.map(sqlFallbackLead),
  }
}

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

  /**
   * Wave-PG-12: query SQL direto na tabela lead_pgfn (39k leads).
   * Vantagem: filtros indexados (UF, agroScore, totalDivida) muito
   * mais rápidos que filtrar Map em RAM com 39k entries.
   *
   * Query params:
   *   - uf=PR              filtra por UF
   *   - minScore=75        agroScore >= N
   *   - minDivida=1000000  totalDivida >= R$ (em reais)
   *   - maxDivida=50000000 totalDivida <= R$
   *   - ajuizado=true|false
   *   - limit=N            default 50, max 500
   *   - offset=N           paginação
   *   - orderBy=divida|score|nome    default 'divida desc'
   */
  app.get('/api/prospeccao/leads/sql', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as SqlLeadsQuery
    const limit = boundedInteger(q.limit, 50, 500)
    const offset = nonNegativeInteger(q.offset)
    const minScore = nonNegativeNumber(q.minScore)
    const minDivida = nonNegativeNumber(q.minDivida)
    const maxDivida = nonNegativeNumber(q.maxDivida)
    const uf = normalizedUf(q.uf)

    try {
      const { isPgEnabled, getDb } = await import('../db/client.js')
      if (!isPgEnabled()) {
        return reply.status(200).send(sqlFallbackResponse(service, q, 'PostgreSQL desativado'))
      }
      const { leadPgfn } = await import('../db/schema.js')
      const { and, eq, gte, lte, desc, asc, sql } = await import('drizzle-orm')
      const db = getDb()

      const filters = [] as Array<ReturnType<typeof and>>
      if (uf) filters.push(eq(leadPgfn.uf, uf) as any)
      if (minScore !== undefined) filters.push(gte(leadPgfn.agroScore, minScore) as any)
      if (minDivida !== undefined) filters.push(gte(leadPgfn.totalDivida, String(minDivida)) as any)
      if (maxDivida !== undefined) filters.push(lte(leadPgfn.totalDivida, String(maxDivida)) as any)
      if (q.ajuizado === 'true') filters.push(eq(leadPgfn.ajuizado, true) as any)
      if (q.ajuizado === 'false') filters.push(eq(leadPgfn.ajuizado, false) as any)
      if (q.tipoPessoa === 'PF' || q.tipoPessoa === 'PJ') {
        const documentLength = q.tipoPessoa === 'PF' ? 11 : 14
        filters.push(
          sql`length(regexp_replace(${leadPgfn.cnpjCpf}, '\\D', '', 'g')) = ${documentLength}` as any,
        )
      }

      const whereClause = filters.length > 0 ? and(...(filters as Parameters<typeof and>)) : undefined

      const orderClause = (() => {
        switch (q.orderBy) {
          case 'score':
            return desc(leadPgfn.agroScore)
          case 'nome':
            return asc(leadPgfn.nome)
          case 'divida':
          default:
            return desc(leadPgfn.totalDivida)
        }
      })()

      const baseSelect = db
        .select({
          cnpjCpf: leadPgfn.cnpjCpf,
          nome: leadPgfn.nome,
          uf: leadPgfn.uf,
          areaEstimadaHa: leadPgfn.areaEstimadaHa,
          totalDivida: leadPgfn.totalDivida,
          inscricoesCount: leadPgfn.inscricoesCount,
          ajuizado: leadPgfn.ajuizado,
          agroScore: leadPgfn.agroScore,
        })
        .from(leadPgfn)

      const rows = whereClause
        ? await baseSelect.where(whereClause).orderBy(orderClause).limit(limit).offset(offset)
        : await baseSelect.orderBy(orderClause).limit(limit).offset(offset)

      const totalRow = whereClause
        ? await db.select({ n: sql<number>`count(*)::int` }).from(leadPgfn).where(whereClause)
        : await db.select({ n: sql<number>`count(*)::int` }).from(leadPgfn)

      return reply.status(200).send({
        success: true,
        source: 'postgres',
        total: totalRow[0]?.n ?? 0,
        limit,
        offset,
        leads: rows,
      })
    } catch (err) {
      app.log.warn({ err }, 'Consulta SQL de prospecção indisponível; usando índice local.')
      return reply.status(200).send(sqlFallbackResponse(service, q, 'PostgreSQL indisponível'))
    }
  })

  /**
   * Hot-swap do índice SICAR — usado pelo orquestrador `refresh-sicar` depois
   * do ingest. Relê `sicar-imoveis.json` do disco sem restart da API.
   * Resposta inclui stats novas (pro cron logar delta).
   */
  app.post('/api/prospeccao/sicar/reload', async () => {
    const stats = service.reloadSicarIndex()
    return { success: true, data: { stats, reloadedAt: new Date().toISOString() } }
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

  // ─── Feedback loop (contatos, hot-leads, reengajamento) ─────

  app.post(
    '/api/prospeccao/lead/:cpfCnpj/contato',
    async (
      req: FastifyRequest<{
        Params: { cpfCnpj: string }
        Body: {
          tipo?: ContactOutcomeTipo
          canal?: ContactOutcome['canal']
          notas?: string
          registradoPor?: string
        } | null
      }>,
      reply: FastifyReply
    ) => {
      const body = req.body || {}
      if (!body.tipo || !OUTCOME_TIPOS.includes(body.tipo)) {
        reply.status(400)
        return {
          success: false,
          error: `tipo inválido; use um de: ${OUTCOME_TIPOS.join(', ')}`,
          code: 'INVALID_TIPO',
        }
      }
      if (body.canal && !CANAIS.includes(body.canal)) {
        reply.status(400)
        return {
          success: false,
          error: `canal inválido; use um de: ${CANAIS.join(', ')}`,
          code: 'INVALID_CANAL',
        }
      }
      const result = service.registrarContato(req.params.cpfCnpj, {
        tipo: body.tipo,
        canal: body.canal,
        notas: body.notas,
        registradoPor: body.registradoPor,
      })
      if (!result) {
        reply.status(404)
        return { success: false, error: 'Lead não encontrado', code: 'LEAD_NOT_FOUND' }
      }
      return { success: true, data: result }
    }
  )

  app.get(
    '/api/prospeccao/lead/:cpfCnpj/contatos',
    async (
      req: FastifyRequest<{ Params: { cpfCnpj: string } }>,
    ) => {
      const contatos = service.listarContatos(req.params.cpfCnpj)
      return { success: true, data: contatos }
    }
  )

  app.get(
    '/api/prospeccao/hot-leads',
    async (
      req: FastifyRequest<{
        Querystring: { limite?: string; diasSemContato?: string }
      }>,
    ) => {
      const limite = req.query.limite ? Math.max(1, Math.min(500, Number(req.query.limite))) : undefined
      const diasSemContato = req.query.diasSemContato
        ? Math.max(0, Number(req.query.diasSemContato))
        : undefined
      const data = service.hotLeads({ limite, diasSemContato })
      return { success: true, data }
    }
  )

  app.get(
    '/api/prospeccao/leads-reengajar',
    async (req: FastifyRequest<{ Querystring: { limite?: string } }>) => {
      const limite = req.query.limite ? Math.max(1, Math.min(500, Number(req.query.limite))) : 20
      return { success: true, data: service.leadsParaReengajar(limite) }
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

  /* ═══════════════════ Fila persistente de enriquecimento ═══════════════════
   * Substitui o fluxo in-memory do `enriquecer-lote` por jobs persistidos
   * com backoff em disco. O cliente dispara e some — o drainer processa em
   * background e sobrevive a reinícios da API.
   */

  app.post(
    '/api/prospeccao/fila/agendar',
    async (req: FastifyRequest<{
      Body: ProspeccaoFilters & { prioridade?: 'alta' | 'normal' | 'baixa'; motivo?: string }
    }>) => {
      const body = (req.body || {}) as ProspeccaoFilters & { prioridade?: 'alta' | 'normal' | 'baixa'; motivo?: string }
      const { prioridade, motivo, ...filters } = body
      const res = service.enfileirarLote(filters, { prioridade, motivo })
      return { success: true, data: res }
    }
  )

  app.get('/api/prospeccao/fila', async () => {
    return { success: true, data: service.getQueue().stats() }
  })

  app.get(
    '/api/prospeccao/fila/jobs',
    async (req: FastifyRequest<{
      Querystring: { status?: 'pending' | 'running' | 'done' | 'failed' | 'cancelled'; batchId?: string; limite?: string }
    }>) => {
      const { status, batchId, limite } = req.query || {}
      const jobs = service.getQueue().listarJobs({
        status,
        batchId,
        limite: limite ? Number(limite) : undefined,
      })
      return { success: true, data: jobs }
    }
  )

  app.post(
    '/api/prospeccao/fila/:id/retry',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const job = service.getQueue().retry(req.params.id)
      if (!job) {
        reply.status(404)
        return { success: false, error: 'Job não encontrado' }
      }
      return { success: true, data: job }
    }
  )

  app.delete(
    '/api/prospeccao/fila/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const ok = service.getQueue().cancel(req.params.id)
      if (!ok) {
        reply.status(409)
        return { success: false, error: 'Job em execução ou já finalizado' }
      }
      return { success: true }
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
        l.temAjuizada ? 'sim' : 'não',
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

  // Fontes ativas — UI de admin e telemetria consomem daqui.
  app.get('/api/prospeccao/fontes', async () => {
    try {
      const fontes = service.listarFontes()
      return { success: true, data: { fontes } }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Falha listando fontes' }
    }
  })

  // Força recarregamento das fontes (uso admin — após ingest offline).
  app.post('/api/prospeccao/fontes/reload', async () => {
    try {
      service.recarregarFontes()
      const fontes = service.listarFontes()
      return { success: true, data: { fontes } }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Falha recarregando fontes' }
    }
  })
}
