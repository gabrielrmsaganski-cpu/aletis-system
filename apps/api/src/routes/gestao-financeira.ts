// ============================================================
// /api/gestao-financeira — REST do sistema R.OP.001 v2.0 nativo
// ============================================================
import type { FastifyInstance } from 'fastify'
import { getGestaoFinanceiraService } from '../services/gestao-financeira/GestaoFinanceiraService.js'
import { getGestaoFinanceiraServiceV2 } from '../services/gestao-financeira/GestaoFinanceiraServiceV2.js'
import { getDb, isPgEnabled } from '../db/client.js'

function envelope<T>(data: T) {
  return { success: true, data }
}
function err(message: string, code = 'ERR') {
  return { success: false, error: message, code }
}

function extrairResumo(tipo: string, payload: any): Record<string, any> {
  const out: Record<string, any> = {}
  if (payload?.raioX?.indicadores) {
    out.ebitda = payload.raioX.indicadores.ebitdaTotal
    out.dividaPorEbitda = payload.raioX.indicadores.diviPorEbitda
    out.margemEbitda = payload.raioX.indicadores.margemEbitda
  }
  if (payload?.endividamento?.saldoTotalAtual !== undefined) {
    out.dividaTotal = payload.endividamento.saldoTotalAtual
  }
  if (Array.isArray(payload)) {
    out.itens = payload.length
  }
  if (payload?.totais) {
    out.totais = payload.totais
  }
  return out
}

export default async function gestaoFinanceiraRoutes(fastify: FastifyInstance) {
  const svc = getGestaoFinanceiraService()
  const svcV2 = getGestaoFinanceiraServiceV2()

  // Aceita XML raw no webhook NF-e
  fastify.addContentTypeParser(
    ['text/xml', 'application/xml'],
    { parseAs: 'string' },
    (_req, body, done) => done(null, body),
  )

  // ── Grupos ──────────────────────────────────────────────
  fastify.get('/api/gestao-financeira/grupos', async (req) => {
    const clienteId = (req.query as any)?.clienteId as string | undefined
    const list = clienteId ? await svc.listarGruposPorCliente(clienteId) : await svc.listarGrupos()
    return envelope({ total: list.length, grupos: list })
  })

  fastify.get('/api/gestao-financeira/grupos/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const g = await svc.obterGrupo(id)
    if (!g) {
      reply.code(404)
      return err('grupo não encontrado', 'NOT_FOUND')
    }
    return envelope({ grupo: g })
  })

  fastify.post('/api/gestao-financeira/grupos', async (req, reply) => {
    const body = req.body as any
    if (!body?.clienteId || !body?.nomeGrupo) {
      reply.code(400)
      return err('clienteId e nomeGrupo obrigatórios', 'BAD_REQUEST')
    }
    const g = await svc.criarGrupo({
      clienteId: body.clienteId,
      nomeGrupo: body.nomeGrupo,
      dataBase: body.dataBase ?? new Date().toISOString().slice(0, 10),
      historico: body.historico,
      observacoes: body.observacoes,
    })
    reply.code(201)
    return envelope({ grupo: g })
  })

  fastify.patch('/api/gestao-financeira/grupos/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    const patch: any = {}
    if (body?.nomeGrupo !== undefined) patch.nomeGrupo = body.nomeGrupo
    if (body?.dataBase) patch.dataBase = String(body.dataBase).slice(0, 10)
    if (body?.historico !== undefined) patch.historico = body.historico
    if (body?.observacoes !== undefined) patch.observacoes = body.observacoes
    const g = await svc.atualizarGrupo(id, patch)
    if (!g) {
      reply.code(404)
      return err('grupo não encontrado', 'NOT_FOUND')
    }
    return envelope({ grupo: g })
  })

  fastify.delete('/api/gestao-financeira/grupos/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const confirm = (req.query as any)?.confirm
    if (confirm !== 'YES') {
      reply.code(400)
      return err('Adicione ?confirm=YES para confirmar', 'CONFIRM_REQUIRED')
    }
    await svc.deletarGrupo(id)
    return envelope({ ok: true })
  })

  // ── Membros ─────────────────────────────────────────────
  fastify.get('/api/gestao-financeira/grupos/:id/membros', async (req) => {
    const { id } = req.params as { id: string }
    const list = await svc.listarMembros(id)
    return envelope({ total: list.length, membros: list })
  })

  fastify.post('/api/gestao-financeira/grupos/:id/membros', async (req) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    const m = await svc.upsertMembro({ ...body, grupoId: id })
    return envelope({ membro: m })
  })

  fastify.patch('/api/gestao-financeira/membros/:memId', async (req) => {
    const { memId } = req.params as { memId: string }
    const body = req.body as any
    const m = await svc.upsertMembro({ ...body, id: memId })
    return envelope({ membro: m })
  })

  fastify.delete('/api/gestao-financeira/membros/:memId', async (req) => {
    const { memId } = req.params as { memId: string }
    await svc.deletarMembro(memId)
    return envelope({ ok: true })
  })

  // ── Culturas / Safras ───────────────────────────────────
  fastify.get('/api/gestao-financeira/grupos/:id/culturas', async (req) => {
    const { id } = req.params as { id: string }
    const list = await svc.listarCulturas(id)
    return envelope({ total: list.length, culturas: list })
  })

  fastify.post('/api/gestao-financeira/grupos/:id/culturas', async (req) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    const c = await svc.upsertCultura({ ...body, grupoId: id })
    return envelope({ cultura: c })
  })

  fastify.patch('/api/gestao-financeira/culturas/:csId', async (req) => {
    const { csId } = req.params as { csId: string }
    const body = req.body as any
    const c = await svc.upsertCultura({ ...body, id: csId })
    return envelope({ cultura: c })
  })

  fastify.delete('/api/gestao-financeira/culturas/:csId', async (req) => {
    const { csId } = req.params as { csId: string }
    await svc.deletarCultura(csId)
    return envelope({ ok: true })
  })

  // ── Custos ──────────────────────────────────────────────
  fastify.get('/api/gestao-financeira/grupos/:id/custos', async (req) => {
    const { id } = req.params as { id: string }
    const list = await svc.listarCustos(id)
    return envelope({ total: list.length, custos: list })
  })

  fastify.post('/api/gestao-financeira/grupos/:id/custos', async (req) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    const c = await svc.upsertCusto({ ...body, grupoId: id })
    return envelope({ custo: c })
  })

  fastify.patch('/api/gestao-financeira/custos/:cuId', async (req) => {
    const { cuId } = req.params as { cuId: string }
    const body = req.body as any
    const c = await svc.upsertCusto({ ...body, id: cuId })
    return envelope({ custo: c })
  })

  fastify.delete('/api/gestao-financeira/custos/:cuId', async (req) => {
    const { cuId } = req.params as { cuId: string }
    await svc.deletarCusto(cuId)
    return envelope({ ok: true })
  })

  // ── Demandas ────────────────────────────────────────────
  fastify.get('/api/gestao-financeira/grupos/:id/demandas', async (req) => {
    const { id } = req.params as { id: string }
    const list = await svc.listarDemandas(id)
    return envelope({ total: list.length, demandas: list })
  })

  fastify.post('/api/gestao-financeira/grupos/:id/demandas', async (req) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    if (body?.data) body.data = String(body.data).slice(0, 10)
    if (body?.enviadoEm) body.enviadoEm = String(body.enviadoEm).slice(0, 10)
    if (body?.retornoEm) body.retornoEm = String(body.retornoEm).slice(0, 10)
    const d = await svc.upsertDemanda({ ...body, grupoId: id })
    return envelope({ demanda: d })
  })

  fastify.patch('/api/gestao-financeira/demandas/:demId', async (req) => {
    const { demId } = req.params as { demId: string }
    const body = req.body as any
    if (body?.data) body.data = String(body.data).slice(0, 10)
    if (body?.enviadoEm) body.enviadoEm = String(body.enviadoEm).slice(0, 10)
    if (body?.retornoEm) body.retornoEm = String(body.retornoEm).slice(0, 10)
    const d = await svc.upsertDemanda({ ...body, id: demId })
    return envelope({ demanda: d })
  })

  fastify.delete('/api/gestao-financeira/demandas/:demId', async (req) => {
    const { demId } = req.params as { demId: string }
    await svc.deletarDemanda(demId)
    return envelope({ ok: true })
  })

  // ── Contratos de dívida ─────────────────────────────────
  fastify.get('/api/gestao-financeira/grupos/:id/contratos', async (req) => {
    const { id } = req.params as { id: string }
    const list = await svc.listarContratos(id)
    return envelope({ total: list.length, contratos: list })
  })

  fastify.post('/api/gestao-financeira/grupos/:id/contratos', async (req) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    if (body?.dataContratacao) body.dataContratacao = String(body.dataContratacao).slice(0, 10)
    if (body?.primeiraParcela) body.primeiraParcela = String(body.primeiraParcela).slice(0, 10)
    if (body?.ultimaParcela) body.ultimaParcela = String(body.ultimaParcela).slice(0, 10)
    if (body?.ultimaAtualizacao) body.ultimaAtualizacao = String(body.ultimaAtualizacao).slice(0, 10)
    const c = await svc.upsertContrato({ ...body, grupoId: id })
    return envelope({ contrato: c })
  })

  fastify.patch('/api/gestao-financeira/contratos/:cId', async (req) => {
    const { cId } = req.params as { cId: string }
    const body = req.body as any
    if (body?.dataContratacao) body.dataContratacao = String(body.dataContratacao).slice(0, 10)
    if (body?.primeiraParcela) body.primeiraParcela = String(body.primeiraParcela).slice(0, 10)
    if (body?.ultimaParcela) body.ultimaParcela = String(body.ultimaParcela).slice(0, 10)
    if (body?.ultimaAtualizacao) body.ultimaAtualizacao = String(body.ultimaAtualizacao).slice(0, 10)
    const c = await svc.upsertContrato({ ...body, id: cId })
    return envelope({ contrato: c })
  })

  fastify.delete('/api/gestao-financeira/contratos/:cId', async (req) => {
    const { cId } = req.params as { cId: string }
    await svc.deletarContrato(cId)
    return envelope({ ok: true })
  })

  // ── Fazendas ────────────────────────────────────────────
  fastify.get('/api/gestao-financeira/grupos/:id/fazendas', async (req) => {
    const { id } = req.params as { id: string }
    const list = await svc.listarFazendas(id)
    return envelope({ total: list.length, fazendas: list })
  })

  fastify.post('/api/gestao-financeira/grupos/:id/fazendas', async (req) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    const f = await svc.upsertFazenda({ ...body, grupoId: id })
    return envelope({ fazenda: f })
  })

  fastify.patch('/api/gestao-financeira/fazendas/:fId', async (req) => {
    const { fId } = req.params as { fId: string }
    const body = req.body as any
    const f = await svc.upsertFazenda({ ...body, id: fId })
    return envelope({ fazenda: f })
  })

  fastify.delete('/api/gestao-financeira/fazendas/:fId', async (req) => {
    const { fId } = req.params as { fId: string }
    await svc.deletarFazenda(fId)
    return envelope({ ok: true })
  })

  // ── Cálculos ────────────────────────────────────────────
  fastify.get('/api/gestao-financeira/grupos/:id/safra-consolidada', async (req) => {
    const { id } = req.params as { id: string }
    const out = await svc.calcularSafraConsolidada(id)
    return envelope({ safras: out })
  })

  fastify.get('/api/gestao-financeira/grupos/:id/endividamento', async (req) => {
    const { id } = req.params as { id: string }
    const out = await svc.calcularEndividamento(id)
    return envelope(out)
  })

  fastify.get('/api/gestao-financeira/grupos/:id/dashboard', async (req, reply) => {
    const { id } = req.params as { id: string }
    const q = req.query as any
    try {
      const out = await svc.calcularDashboardCompleto(id, {
        taxaCustoFinanceiroAa: q?.txCusto ? parseFloat(q.txCusto) : undefined,
        taxaPoupancaAa: q?.txPoupanca ? parseFloat(q.txPoupanca) : undefined,
        anosProjecao: q?.anos ? parseInt(q.anos, 10) : undefined,
        persistir: q?.persistir === '1',
      })
      return envelope(out)
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro no cálculo', 'CALC_ERROR')
    }
  })

  // ╭───────────────────────────────────────────────────────╮
  // │ V2 — auto-import, dashboard 360°, bulk, insights      │
  // ╰───────────────────────────────────────────────────────╯

  // Auto-import do CRM — cria grupo pré-populado com 1 clique
  fastify.post('/api/gestao-financeira/auto-import-crm', async (req, reply) => {
    const body = req.body as any
    if (!body?.clienteId) {
      reply.code(400)
      return err('clienteId obrigatório', 'BAD_REQUEST')
    }
    try {
      const r = await svcV2.autoImportFromCRM(body.clienteId)
      reply.code(r.criado ? 201 : 200)
      return envelope(r)
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro auto-import', 'IMPORT_ERROR')
    }
  })

  // Dashboard 360° — TUDO calculado + insights persistidos
  fastify.get('/api/gestao-financeira/grupos/:id/dashboard-360', async (req, reply) => {
    const { id } = req.params as { id: string }
    const q = req.query as any
    try {
      const out = await svcV2.calcularDashboard360(id, {
        txCusto: q?.txCusto ? parseFloat(q.txCusto) : undefined,
        txPoupanca: q?.txPoupanca ? parseFloat(q.txPoupanca) : undefined,
        anos: q?.anos ? parseInt(q.anos, 10) : undefined,
        persistir: q?.persistir === '1',
      })
      return envelope(out)
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro dashboard 360', 'CALC_ERROR')
    }
  })

  // Bulk insert (paste do Excel — TSV/CSV → JSON array)
  fastify.post('/api/gestao-financeira/grupos/:id/culturas/bulk', async (req) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    const rows = Array.isArray(body?.rows) ? body.rows : []
    const r = await svcV2.bulkInsertCulturas(id, rows)
    return envelope(r)
  })
  fastify.post('/api/gestao-financeira/grupos/:id/contratos/bulk', async (req) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    const rows = Array.isArray(body?.rows) ? body.rows : []
    const r = await svcV2.bulkInsertContratos(id, rows)
    return envelope(r)
  })
  fastify.post('/api/gestao-financeira/grupos/:id/custos/bulk', async (req) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    const rows = Array.isArray(body?.rows) ? body.rows : []
    const r = await svcV2.bulkInsertCustos(id, rows)
    return envelope(r)
  })
  fastify.post('/api/gestao-financeira/grupos/:id/fazendas/bulk', async (req) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    const rows = Array.isArray(body?.rows) ? body.rows : []
    const r = await svcV2.bulkInsertFazendas(id, rows)
    return envelope(r)
  })

  // Ativos extras
  fastify.get('/api/gestao-financeira/grupos/:id/ativos-outros', async (req) => {
    const { id } = req.params as { id: string }
    return envelope({ items: await svcV2.listarAtivosOutros(id) })
  })
  fastify.post('/api/gestao-financeira/grupos/:id/ativos-outros', async (req) => {
    const { id } = req.params as { id: string }
    return envelope({ item: await svcV2.upsertAtivoOutro({ ...(req.body as any), grupoId: id }) })
  })
  fastify.patch('/api/gestao-financeira/ativos-outros/:itemId', async (req) => {
    const { itemId } = req.params as { itemId: string }
    return envelope({ item: await svcV2.upsertAtivoOutro({ ...(req.body as any), id: itemId }) })
  })
  fastify.delete('/api/gestao-financeira/ativos-outros/:itemId', async (req) => {
    const { itemId } = req.params as { itemId: string }
    await svcV2.deletarAtivoOutro(itemId)
    return envelope({ ok: true })
  })

  // Passivos extras
  fastify.get('/api/gestao-financeira/grupos/:id/passivos-outros', async (req) => {
    const { id } = req.params as { id: string }
    return envelope({ items: await svcV2.listarPassivosOutros(id) })
  })
  fastify.post('/api/gestao-financeira/grupos/:id/passivos-outros', async (req) => {
    const { id } = req.params as { id: string }
    return envelope({ item: await svcV2.upsertPassivoOutro({ ...(req.body as any), grupoId: id }) })
  })
  fastify.patch('/api/gestao-financeira/passivos-outros/:itemId', async (req) => {
    const { itemId } = req.params as { itemId: string }
    return envelope({ item: await svcV2.upsertPassivoOutro({ ...(req.body as any), id: itemId }) })
  })
  fastify.delete('/api/gestao-financeira/passivos-outros/:itemId', async (req) => {
    const { itemId } = req.params as { itemId: string }
    await svcV2.deletarPassivoOutro(itemId)
    return envelope({ ok: true })
  })

  // Garantias
  fastify.get('/api/gestao-financeira/grupos/:id/garantias', async (req) => {
    const { id } = req.params as { id: string }
    return envelope({ items: await svcV2.listarGarantias(id) })
  })
  fastify.post('/api/gestao-financeira/grupos/:id/garantias', async (req) => {
    const { id } = req.params as { id: string }
    return envelope({ item: await svcV2.upsertGarantia({ ...(req.body as any), grupoId: id }) })
  })
  fastify.patch('/api/gestao-financeira/garantias/:itemId', async (req) => {
    const { itemId } = req.params as { itemId: string }
    return envelope({ item: await svcV2.upsertGarantia({ ...(req.body as any), id: itemId }) })
  })
  fastify.delete('/api/gestao-financeira/garantias/:itemId', async (req) => {
    const { itemId } = req.params as { itemId: string }
    await svcV2.deletarGarantia(itemId)
    return envelope({ ok: true })
  })

  // Premissas
  fastify.get('/api/gestao-financeira/grupos/:id/premissas', async (req) => {
    const { id } = req.params as { id: string }
    return envelope({ items: await svcV2.listarPremissas(id) })
  })
  fastify.post('/api/gestao-financeira/grupos/:id/premissas', async (req) => {
    const { id } = req.params as { id: string }
    return envelope({ item: await svcV2.upsertPremissa({ ...(req.body as any), grupoId: id }) })
  })
  fastify.patch('/api/gestao-financeira/premissas/:itemId', async (req) => {
    const { itemId } = req.params as { itemId: string }
    return envelope({ item: await svcV2.upsertPremissa({ ...(req.body as any), id: itemId }) })
  })
  fastify.delete('/api/gestao-financeira/premissas/:itemId', async (req) => {
    const { itemId } = req.params as { itemId: string }
    await svcV2.deletarPremissa(itemId)
    return envelope({ ok: true })
  })

  // Simulador de renegociação (sem persistir)
  fastify.post('/api/gestao-financeira/grupos/:id/contratos/:cId/simular', async (req, reply) => {
    const { id, cId } = req.params as { id: string; cId: string }
    const body = req.body as any
    try {
      const contratos = await svc.listarContratos(id)
      const c = contratos.find((x) => x.id === cId)
      if (!c) {
        reply.code(404)
        return err(`Contrato ${cId} não encontrado`, 'NOT_FOUND')
      }
      const simulado: any = { ...c }
      if (body?.novaTaxaAa !== undefined) simulado.taxaNominalAa = String(body.novaTaxaAa)
      if (body?.novoPrazoParcelas !== undefined) simulado.prazoParcelas = body.novoPrazoParcelas
      if (body?.novoMetodo) simulado.metodoCalculo = String(body.novoMetodo).toUpperCase()
      const { gerarCronograma } = await import('../services/gestao-financeira/calculo/endividamento-calculator.js')
      const original = gerarCronograma(c)
      const novo = gerarCronograma(simulado)
      const totalJurosOrig = original.installments.reduce((a, x) => a + x.juro, 0)
      const totalJurosNovo = novo.installments.reduce((a, x) => a + x.juro, 0)
      const totalParcelaOrig = original.installments.reduce((a, x) => a + x.parcela, 0)
      const totalParcelaNovo = novo.installments.reduce((a, x) => a + x.parcela, 0)
      return envelope({
        ok: true,
        contratoId: c.id,
        credor: c.credor,
        original: {
          metodo: original.metodoCalculo,
          taxaPeriodo: original.taxaPeriodo,
          prazo: original.prazoParcelas,
          totalJuros: totalJurosOrig,
          totalParcelas: totalParcelaOrig,
        },
        simulado: {
          metodo: novo.metodoCalculo,
          taxaPeriodo: novo.taxaPeriodo,
          prazo: novo.prazoParcelas,
          totalJuros: totalJurosNovo,
          totalParcelas: totalParcelaNovo,
        },
        economiaJuros: totalJurosOrig - totalJurosNovo,
        diferencaTotal: totalParcelaOrig - totalParcelaNovo,
      })
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro simulação', 'SIM_ERROR')
    }
  })

  // Stress test em tempo real
  fastify.post('/api/gestao-financeira/grupos/:id/stress-test', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    try {
      const dPreco = (Number(body?.deltaPrecoPct ?? -20) / 100) + 1
      const dRend = (Number(body?.deltaRendimentoPct ?? -10) / 100) + 1
      const culturas = await svc.listarCulturas(id)
      const safrasOrig = await svc.calcularSafraConsolidada(id)
      const stressed = culturas.map((c: any) => ({
        ...c,
        precoMedioRs: c.precoMedioRs ? String(parseFloat(c.precoMedioRs) * dPreco) : null,
        rendimentoScHa: c.rendimentoScHa ? String(parseFloat(c.rendimentoScHa) * dRend) : null,
      }))
      const { consolidarSafra } = await import('../services/gestao-financeira/calculo/safra-calculator.js')
      const safrasStressed = consolidarSafra(stressed as any)
      const totalReceitaOrig = safrasOrig.reduce((a, s) => a + s.receitaTotal, 0)
      const totalReceitaStress = safrasStressed.reduce((a, s) => a + s.receitaTotal, 0)
      const totalEbitdaOrig = safrasOrig.reduce((a, s) => a + s.resultadoBruto, 0)
      const totalEbitdaStress = safrasStressed.reduce((a, s) => a + s.resultadoBruto, 0)
      return envelope({
        ok: true,
        deltaPrecoPct: Number(body?.deltaPrecoPct ?? -20),
        deltaRendimentoPct: Number(body?.deltaRendimentoPct ?? -10),
        original: { receitaTotal: totalReceitaOrig, ebitdaTotal: totalEbitdaOrig },
        stressed: { receitaTotal: totalReceitaStress, ebitdaTotal: totalEbitdaStress },
        impacto: {
          deltaReceita: totalReceitaStress - totalReceitaOrig,
          deltaEbitda: totalEbitdaStress - totalEbitdaOrig,
          pctImpactoReceita: totalReceitaOrig > 0 ? ((totalReceitaStress - totalReceitaOrig) / totalReceitaOrig) * 100 : 0,
          pctImpactoEbitda: totalEbitdaOrig > 0 ? ((totalEbitdaStress - totalEbitdaOrig) / totalEbitdaOrig) * 100 : 0,
        },
        porSafra: safrasStressed.map((s, i) => ({
          safra: s.safra,
          original: { receita: safrasOrig[i]?.receitaTotal ?? 0, ebitda: safrasOrig[i]?.resultadoBruto ?? 0 },
          stressed: { receita: s.receitaTotal, ebitda: s.resultadoBruto },
        })),
      })
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro stress test', 'STRESS_ERROR')
    }
  })

  // ── Wave H: Painel da carteira ───────────────────────────
  fastify.get('/api/gestao-financeira/carteira', async (req) => {
    const consultorId = (req.query as any)?.consultorId as string | undefined
    const { getCarteiraService } = await import('../services/gestao-financeira/CarteiraService.js')
    const out = await getCarteiraService().resumo(consultorId)
    return envelope(out)
  })

  // ── Wave H: Backup/Restore ───────────────────────────────
  fastify.get('/api/gestao-financeira/grupos/:id/backup', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      const { getBackupService } = await import('../services/gestao-financeira/BackupService.js')
      const bundle = await getBackupService().exportar(id)
      const filename = `gf_backup_${(bundle.grupo as any).nomeGrupo?.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30) ?? id}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`
      reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
      return reply.send(JSON.stringify(bundle, null, 2))
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro backup', 'BACKUP_ERROR')
    }
  })

  fastify.post('/api/gestao-financeira/restore', async (req, reply) => {
    const body = req.body as any
    if (!body?.bundle || !body?.clienteId) {
      reply.code(400)
      return err('bundle (BackupBundle) e clienteId obrigatórios', 'BAD_REQUEST')
    }
    try {
      const { getBackupService } = await import('../services/gestao-financeira/BackupService.js')
      const r = await getBackupService().importar(body.bundle, {
        clienteId: body.clienteId,
        novoNomeGrupo: body.novoNomeGrupo,
        aplicarEm: body.aplicarEm,
      })
      return envelope(r)
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro restore', 'RESTORE_ERROR')
    }
  })

  // ── Wave H: SSE de eventos do grupo (changelog/comentários/insights) ──
  fastify.get('/api/gestao-financeira/grupos/:id/events/stream', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { getGfEventBus } = await import('../services/gestao-financeira/GfEventBus.js')
    const bus = getGfEventBus()

    reply
      .raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.flushHeaders?.()

    // Heartbeat 25s
    const ka = setInterval(() => {
      try {
        reply.raw.write(': ka\n\n')
      } catch {}
    }, 25000)
    if (typeof (ka as any).unref === 'function') (ka as any).unref()

    // Hello
    reply.raw.write(`event: hello\ndata: {"grupoId":"${id}","ts":"${new Date().toISOString()}"}\n\n`)

    const handler = (event: any) => {
      if (event.grupoId !== id && event.grupoId !== '*') return
      try {
        reply.raw.write(`event: ${event.type}\n`)
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      } catch {}
    }
    bus.on('gf-event', handler)

    req.raw.on('close', () => {
      bus.off('gf-event', handler)
      clearInterval(ka)
    })

    // Mantém a conexão aberta — não retorna nada
    return reply
  })

  // ── Wave G: Cron diário (status + execução manual) ──────
  fastify.get('/api/gestao-financeira/cron/status', async () => {
    const { getCronStatus } = await import('../services/gestao-financeira/CronGestaoFinanceira.js')
    return envelope(getCronStatus())
  })

  fastify.post('/api/gestao-financeira/cron/executar', async () => {
    const { executarCron } = await import('../services/gestao-financeira/CronGestaoFinanceira.js')
    const r = await executarCron()
    return envelope(r)
  })

  // ── Wave G: Marketplace de templates ─────────────────────
  fastify.get('/api/gestao-financeira/marketplace/templates', async (req) => {
    const consultorId = (req.query as any)?.consultorId as string | undefined
    const { getMarketplaceService } = await import('../services/gestao-financeira/MarketplaceService.js')
    const list = await getMarketplaceService().listarTemplates(consultorId)
    return envelope({ total: list.length, templates: list })
  })

  fastify.post('/api/gestao-financeira/grupos/:id/marketplace/capturar', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    if (!body?.slug || !body?.rotulo || !body?.categoria) {
      reply.code(400)
      return err('slug, rotulo e categoria obrigatórios', 'BAD_REQUEST')
    }
    const { getMarketplaceService } = await import('../services/gestao-financeira/MarketplaceService.js')
    const tpl = await getMarketplaceService().capturarTemplate({
      grupoId: id,
      slug: String(body.slug),
      rotulo: String(body.rotulo),
      descricao: body.descricao,
      categoria: String(body.categoria),
      emoji: body.emoji,
      visibilidade: body.visibilidade ?? 'private',
      consultorId: body.consultorId,
      consultorNome: body.consultorNome,
    })
    reply.code(201)
    return envelope({ template: tpl })
  })

  fastify.post('/api/gestao-financeira/grupos/:id/marketplace/aplicar', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    if (!body?.templateSlug) {
      reply.code(400)
      return err('templateSlug obrigatório', 'BAD_REQUEST')
    }
    try {
      const { getMarketplaceService } = await import('../services/gestao-financeira/MarketplaceService.js')
      const r = await getMarketplaceService().aplicarTemplate({ grupoId: id, templateSlug: String(body.templateSlug) })
      return envelope(r)
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro', 'TEMPLATE_ERROR')
    }
  })

  fastify.delete('/api/gestao-financeira/marketplace/templates/:slug', async (req) => {
    const { slug } = req.params as { slug: string }
    const consultorId = (req.query as any)?.consultorId as string | undefined
    const { getMarketplaceService } = await import('../services/gestao-financeira/MarketplaceService.js')
    await getMarketplaceService().deletarTemplate(slug, consultorId)
    return envelope({ ok: true })
  })

  // ── Wave G: Changelog ────────────────────────────────────
  fastify.get('/api/gestao-financeira/grupos/:id/changelog', async (req) => {
    const { id } = req.params as { id: string }
    const { getChangelogService } = await import('../services/gestao-financeira/ChangelogService.js')
    const list = await getChangelogService().listarPorGrupo(id, 200)
    return envelope({ total: list.length, mudancas: list })
  })

  fastify.get('/api/gestao-financeira/grupos/:id/changelog/stats', async (req) => {
    const { id } = req.params as { id: string }
    const { getChangelogService } = await import('../services/gestao-financeira/ChangelogService.js')
    const stats = await getChangelogService().stats(id)
    return envelope(stats)
  })

  // ── Wave G: Comentários ──────────────────────────────────
  fastify.get('/api/gestao-financeira/grupos/:id/comentarios', async (req) => {
    const { id } = req.params as { id: string }
    const q = req.query as any
    const { getComentarioService } = await import('../services/gestao-financeira/ComentarioService.js')
    const threads = await getComentarioService().listarThreads(id, q?.entidade, q?.entidadeId)
    return envelope({ total: threads.length, threads })
  })

  fastify.post('/api/gestao-financeira/grupos/:id/comentarios', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    if (!body?.entidade || !body?.conteudo) {
      reply.code(400)
      return err('entidade e conteudo obrigatórios', 'BAD_REQUEST')
    }
    const { getComentarioService } = await import('../services/gestao-financeira/ComentarioService.js')
    const c = await getComentarioService().criar({ ...body, grupoId: id })
    reply.code(201)
    return envelope({ comentario: c })
  })

  fastify.patch('/api/gestao-financeira/comentarios/:cId', async (req) => {
    const { cId } = req.params as { cId: string }
    const body = req.body as any
    const { getComentarioService } = await import('../services/gestao-financeira/ComentarioService.js')
    const c = await getComentarioService().atualizar(cId, body)
    return envelope({ comentario: c })
  })

  fastify.delete('/api/gestao-financeira/comentarios/:cId', async (req) => {
    const { cId } = req.params as { cId: string }
    const { getComentarioService } = await import('../services/gestao-financeira/ComentarioService.js')
    await getComentarioService().deletar(cId)
    return envelope({ ok: true })
  })

  fastify.get('/api/gestao-financeira/grupos/:id/comentarios/count', async (req) => {
    const { id } = req.params as { id: string }
    const { getComentarioService } = await import('../services/gestao-financeira/ComentarioService.js')
    const naoResolvidos = await getComentarioService().contarNaoResolvidos(id)
    return envelope({ naoResolvidos })
  })

  // ── Wave F: Kanban SLA ───────────────────────────────────
  fastify.get('/api/gestao-financeira/grupos/:id/kanban-sla', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      const { getEtapaSlaService } = await import('../services/gestao-financeira/EtapaSlaService.js')
      const etapaSvc = getEtapaSlaService()
      // Auto-seed se não houver etapas ainda
      const list = await etapaSvc.listarEtapas(id)
      if (list.length === 0) await etapaSvc.semearEtapas(id)
      const out = await etapaSvc.getKanban(id)
      return envelope(out)
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro kanban', 'KANBAN_ERROR')
    }
  })

  fastify.patch('/api/gestao-financeira/etapas-sla/:etId', async (req) => {
    const { etId } = req.params as { etId: string }
    const body = req.body as any
    const { getEtapaSlaService } = await import('../services/gestao-financeira/EtapaSlaService.js')
    const etapaSvc = getEtapaSlaService()
    const updated = await etapaSvc.upsertEtapa({ ...body, id: etId, grupoId: body.grupoId ?? '' })
    return envelope({ etapa: updated })
  })

  fastify.delete('/api/gestao-financeira/etapas-sla/:etId', async (req) => {
    const { etId } = req.params as { etId: string }
    const { getEtapaSlaService } = await import('../services/gestao-financeira/EtapaSlaService.js')
    await getEtapaSlaService().deletarEtapa(etId)
    return envelope({ ok: true })
  })

  // ── Wave F: Benchmark ────────────────────────────────────
  fastify.get('/api/gestao-financeira/grupos/:id/benchmark', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      const { getBenchmarkService } = await import('../services/gestao-financeira/BenchmarkService.js')
      const out = await getBenchmarkService().calcular(id)
      return envelope(out)
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro benchmark', 'BENCHMARK_ERROR')
    }
  })

  // ── Wave F: Webhook NF-e ────────────────────────────────
  fastify.post('/api/gestao-financeira/webhooks/nfe', async (req, reply) => {
    try {
      // Aceita XML em body raw ou multipart
      const contentType = req.headers['content-type'] ?? ''
      let xml = ''
      if (contentType.includes('multipart')) {
        const data = await (req as any).file?.()
        if (!data) return err('arquivo NF-e obrigatório', 'BAD_REQUEST')
        const buf = await data.toBuffer()
        xml = buf.toString('utf-8')
      } else if (contentType.includes('xml') || contentType.includes('text/plain')) {
        xml = typeof req.body === 'string' ? req.body : String(req.body ?? '')
      } else if (req.body) {
        xml = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
      }
      if (!xml || xml.length < 50) {
        reply.code(400)
        return err('XML NF-e vazio ou muito pequeno', 'INVALID_XML')
      }

      const { parseNfe, resumirNfePorCultura, detectarCulturaProduto } = await import('../services/gestao-financeira/NfeImporter.js')
      const nfe = parseNfe(xml)
      const resumo = resumirNfePorCultura([nfe])
      const culturaPrincipal = resumo[0]?.cultura ?? null

      // Tenta match com grupo via CNPJ emitente → cliente.cpfCnpj → gf_grupo
      let grupoId: string | null = null
      if (nfe.emitente?.cnpj && isPgEnabled()) {
        const { getDb: getDbFn } = await import('../db/client.js')
        const { cliente, gfGrupo } = await import('../db/schema.js')
        const { eq } = await import('drizzle-orm')
        const db = getDbFn()
        const cliCpf = nfe.emitente.cnpj.replace(/\D/g, '')
        const cliRows = await db.select().from(cliente).where(eq(cliente.cpfCnpj, cliCpf)).limit(1)
        if (cliRows.length > 0) {
          const grupos = await db.select().from(gfGrupo).where(eq(gfGrupo.clienteId, cliRows[0].id)).limit(1)
          if (grupos.length > 0) grupoId = grupos[0].id
        }
      }

      // Persiste log
      let id: number | null = null
      if (isPgEnabled()) {
        const { getDb: getDbFn } = await import('../db/client.js')
        const { gfNfeRecebida } = await import('../db/schema.js')
        const db = getDbFn()
        const ins = await db.insert(gfNfeRecebida).values({
          grupoId,
          cnpjEmitente: nfe.emitente?.cnpj ?? null,
          numeroNfe: nfe.numeroNF ?? null,
          serie: nfe.serie ?? null,
          dataEmissao: nfe.dataEmissao ?? null,
          valorTotal: nfe.valorTotal ? String(nfe.valorTotal) as any : null,
          produtosCount: nfe.produtos.length,
          culturaPrincipal,
          payload: nfe as any,
          status: grupoId ? 'recebida' : 'recebida',
        }).returning({ id: gfNfeRecebida.id })
        id = ins[0]?.id ?? null
      }

      return envelope({
        recebida: true,
        id,
        grupoId,
        matched: !!grupoId,
        numeroNF: nfe.numeroNF,
        valorTotal: nfe.valorTotal,
        produtosCount: nfe.produtos.length,
        culturaPrincipal,
        warnings: nfe.warnings,
      })
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro webhook NF-e', 'WEBHOOK_ERROR')
    }
  })

  fastify.get('/api/gestao-financeira/nfe-recebidas', async (req) => {
    if (!isPgEnabled()) return envelope({ items: [] })
    const { gfNfeRecebida } = await import('../db/schema.js')
    const { desc } = await import('drizzle-orm')
    const rows = await getDb().select().from(gfNfeRecebida).orderBy(desc(gfNfeRecebida.recebidaEm)).limit(100)
    return envelope({ total: rows.length, items: rows })
  })

  // PPTX diagnóstico (R.OP.006)
  fastify.get('/api/gestao-financeira/grupos/:id/diagnostico-pptx', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      const { gerarPptxDiagnostico } = await import('../services/gestao-financeira/PptxRenderer.js')
      const out = await gerarPptxDiagnostico(id)
      reply
        .header('Content-Type', out.contentType)
        .header('Content-Disposition', `attachment; filename="${out.filename}"`)
        .header('X-GF-Slides', String(out.slides))
      return reply.send(out.buffer)
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro PPTX', 'PPTX_ERROR')
    }
  })

  // Narrativa LLM
  fastify.post('/api/gestao-financeira/grupos/:id/narrativa', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = (req.body ?? {}) as { estilo?: string; secoes?: string[] }
    try {
      const { gerarNarrativa } = await import('../services/gestao-financeira/NarrativaLLM.js')
      const out = await gerarNarrativa({
        grupoId: id,
        estilo: body.estilo as any,
        secoes: body.secoes,
      })
      return envelope(out)
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro narrativa', 'NARRATIVA_ERROR')
    }
  })

  // Anomaly detector — z-score por safra/cultura
  fastify.get('/api/gestao-financeira/grupos/:id/anomalias', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      const culturas = await svc.listarCulturas(id)
      const { detectarAnomalias } = await import('../services/gestao-financeira/calculo/anomaly-detector.js')
      const anomalias = detectarAnomalias(culturas)
      return envelope({
        total: anomalias.length,
        criticas: anomalias.filter((a) => a.severidade === 'critico').length,
        importantes: anomalias.filter((a) => a.severidade === 'importante').length,
        anomalias,
      })
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro anomaly', 'ANOMALY_ERROR')
    }
  })

  // Parser NF-e XML
  fastify.post('/api/gestao-financeira/parse-nfe', async (req, reply) => {
    try {
      const data = await (req as any).file?.()
      if (!data) {
        reply.code(400)
        return err('arquivo .xml obrigatório (multipart)', 'BAD_REQUEST')
      }
      const buffer = await data.toBuffer()
      const xml = buffer.toString('utf-8').replace(/^﻿/, '')
      const { parseNfe, resumirNfePorCultura } = await import('../services/gestao-financeira/NfeImporter.js')
      const nfe = parseNfe(xml)
      const resumo = resumirNfePorCultura([nfe])
      return envelope({
        ...nfe,
        resumoPorCultura: resumo,
      })
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro parse NF-e', 'NFE_ERROR')
    }
  })

  // Aplica NF-e como safra realizada (soma quantidade × preço)
  fastify.post('/api/gestao-financeira/grupos/:id/import-nfe', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    if (!Array.isArray(body?.culturas)) {
      reply.code(400)
      return err('Body deve ter "culturas: NfeResumoPorCultura[]"', 'BAD_REQUEST')
    }
    let inserted = 0
    const errors: string[] = []
    const safra = body.safra ?? '24/25'
    for (const cultura of body.culturas) {
      try {
        // Atualiza ou cria cultura no cenário 'realizado'
        const existentes = await svc.listarCulturas(id)
        const match = existentes.find((c: any) => c.cultura === cultura.cultura && c.safra === safra && c.cenario === 'realizado')
        if (match) {
          // Já existe — atualiza preço médio (média ponderada com nova venda)
          const areaTotal = parseFloat(match.areaPropriaHa ?? '0') + parseFloat(match.areaArrendadaHa ?? '0')
          const novoPreco = cultura.precoMedio
          await svc.upsertCultura({ id: match.id, grupoId: id, cultura: cultura.cultura, safra, cenario: 'realizado', precoMedioRs: String(novoPreco) as any })
        } else {
          await svc.upsertCultura({
            grupoId: id,
            cultura: cultura.cultura,
            safra,
            cenario: 'realizado',
            rendimentoScHa: String(cultura.quantidadeTotal / 100) as any, // estimativa: vai depender da área
            precoMedioRs: String(cultura.precoMedio) as any,
            unidade: cultura.unidade ?? 'sc',
          })
        }
        inserted++
      } catch (e: any) {
        errors.push(`${cultura.cultura}: ${e?.message ?? 'erro'}`)
      }
    }
    return envelope({ inserted, errors })
  })

  // Kit Banco PDF
  fastify.get('/api/gestao-financeira/grupos/:id/kit-banco-pdf', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      const { gerarKitBancoPdf } = await import('../services/gestao-financeira/KitBancoPdfRenderer.js')
      const out = await gerarKitBancoPdf(id)
      reply
        .header('Content-Type', out.contentType)
        .header('Content-Disposition', `attachment; filename="${out.filename}"`)
      return reply.send(out.buffer)
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro kit banco pdf', 'PDF_ERROR')
    }
  })

  // Import xlsm preenchido pelo cliente — popula sistema
  fastify.post('/api/gestao-financeira/grupos/:id/import-xlsm', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      const data = await (req as any).file?.()
      if (!data) {
        reply.code(400)
        return err('arquivo xlsm obrigatório (multipart)', 'BAD_REQUEST')
      }
      const buffer = await data.toBuffer()
      const versao = ((req.query as any)?.versao ?? 'v2') as 'v1' | 'v2'
      const { importarDeXlsm } = await import('../services/gestao-financeira/XlsmImporter.js')
      const r = await importarDeXlsm({ grupoId: id, buffer, versao })
      return envelope(r)
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro import xlsm', 'IMPORT_ERROR')
    }
  })

  // Import OFX — extrato bancário
  fastify.post('/api/gestao-financeira/parse-ofx', async (req, reply) => {
    try {
      const data = await (req as any).file?.()
      if (!data) {
        reply.code(400)
        return err('arquivo .ofx obrigatório (multipart)', 'BAD_REQUEST')
      }
      const buffer = await data.toBuffer()
      const content = buffer.toString('utf-8').replace(/^﻿/, '')
      const { parseOfx, resumirOfxPorCategoria, categorizarTransacao } = await import('../services/gestao-financeira/OfxImporter.js')
      const parsed = parseOfx(content)
      const resumo = resumirOfxPorCategoria(parsed)
      return envelope({
        banco: parsed.banco,
        conta: parsed.conta,
        agencia: parsed.agencia,
        saldoFinal: parsed.saldoFinal,
        saldoData: parsed.saldoData,
        totalCreditos: parsed.totalCreditos,
        totalDebitos: parsed.totalDebitos,
        transacoesCount: parsed.transacoes.length,
        warnings: parsed.warnings,
        resumoPorCategoria: resumo,
        // sample para preview
        amostra: parsed.transacoes.slice(0, 10).map((t) => ({
          ...t,
          categoria: categorizarTransacao(t).categoria,
        })),
      })
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro parse OFX', 'OFX_ERROR')
    }
  })

  // Apply OFX — popular gf_custo_safra a partir do resumo
  fastify.post('/api/gestao-financeira/grupos/:id/import-ofx', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    if (!Array.isArray(body?.categorias)) {
      reply.code(400)
      return err('Body deve ter "categorias: OfxResumoCategoria[]"', 'BAD_REQUEST')
    }
    let inserted = 0
    const errors: string[] = []
    for (const cat of body.categorias) {
      try {
        await svc.upsertCusto({
          grupoId: id,
          safra: body.safra ?? '24/25',
          tipo: cat.tipo ?? 'operacional',
          descricao: cat.categoria,
          valorAnual: String(cat.total) as any,
          valorMensal: String(cat.total / 12) as any,
        })
        inserted++
      } catch (e: any) {
        errors.push(`${cat.categoria}: ${e?.message ?? 'erro'}`)
      }
    }
    return envelope({ inserted, errors })
  })

  // Export para xlsm preenchido (R.OP.001 v1 ou v2 com VBA preservado)
  fastify.post('/api/gestao-financeira/grupos/:id/export-xlsm', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = (req.body ?? {}) as { versao?: 'v1' | 'v2' }
    try {
      const { exportarParaXlsm } = await import('../services/gestao-financeira/XlsmExporter.js')
      const out = await exportarParaXlsm({ grupoId: id, versao: body.versao ?? 'v2' })
      reply
        .header('Content-Type', out.contentType)
        .header('Content-Disposition', `attachment; filename="${out.filename}"`)
        .header('X-GF-Cells-Written', String(out.cellsWritten))
        .header('X-GF-Template', out.templateUsed)
      return reply.send(out.buffer)
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro export xlsm', 'EXPORT_ERROR')
    }
  })

  // Snapshots — listagem + criação etiquetada + diff
  fastify.get('/api/gestao-financeira/grupos/:id/snapshots', async (req) => {
    const { id } = req.params as { id: string }
    const { getDb, isPgEnabled } = await import('../db/client.js')
    const { gfSnapshotCalculo } = await import('../db/schema.js')
    if (!isPgEnabled()) return envelope({ snapshots: [] })
    const { eq, desc } = await import('drizzle-orm')
    const rows = await getDb()
      .select()
      .from(gfSnapshotCalculo)
      .where(eq(gfSnapshotCalculo.grupoId, id))
      .orderBy(desc(gfSnapshotCalculo.calculadoEm))
      .limit(50)
    return envelope({
      total: rows.length,
      snapshots: rows.map((r) => ({
        id: r.id,
        tipo: r.tipo,
        calculadoEm: r.calculadoEm,
        // resumo do payload sem expor tudo
        resumo: typeof r.payload === 'object' && r.payload !== null
          ? extrairResumo(r.tipo, r.payload as any)
          : null,
      })),
    })
  })

  fastify.post('/api/gestao-financeira/grupos/:id/snapshots', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    const label = body?.label ?? 'snapshot'
    try {
      const dash = await svcV2.calcularDashboard360(id, { persistir: true })
      // grava 4 snapshots (full, raio_x, dre, endividamento) com etiqueta
      const { getDb, isPgEnabled } = await import('../db/client.js')
      const { gfSnapshotCalculo } = await import('../db/schema.js')
      if (isPgEnabled()) {
        const now = new Date()
        await getDb().insert(gfSnapshotCalculo).values([
          { grupoId: id, tipo: `${label}::dashboard360`, payload: dash as any, calculadoEm: now },
        ])
      }
      return envelope({ ok: true, label, kpis: { ebitda: dash.raioX.indicadores.ebitdaTotal, divida: dash.endividamento.saldoTotalAtual } })
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro snapshot', 'SNAPSHOT_ERROR')
    }
  })

  fastify.get('/api/gestao-financeira/snapshots/:idA/diff/:idB', async (req, reply) => {
    const { idA, idB } = req.params as { idA: string; idB: string }
    const { getDb, isPgEnabled } = await import('../db/client.js')
    const { gfSnapshotCalculo } = await import('../db/schema.js')
    if (!isPgEnabled()) {
      reply.code(400)
      return err('PG desabilitado', 'PG_OFF')
    }
    const { inArray } = await import('drizzle-orm')
    const rows = await getDb()
      .select()
      .from(gfSnapshotCalculo)
      .where(inArray(gfSnapshotCalculo.id, [parseInt(idA, 10), parseInt(idB, 10)]))
    const a = rows.find((r: any) => r.id === parseInt(idA, 10))
    const b = rows.find((r: any) => r.id === parseInt(idB, 10))
    if (!a || !b) {
      reply.code(404)
      return err('snapshot não encontrado', 'NOT_FOUND')
    }
    const aP = a.payload as any
    const bP = b.payload as any
    const aRx = aP?.raioX?.indicadores ?? {}
    const bRx = bP?.raioX?.indicadores ?? {}
    return envelope({
      a: { id: a.id, tipo: a.tipo, calculadoEm: a.calculadoEm, kpis: aRx },
      b: { id: b.id, tipo: b.tipo, calculadoEm: b.calculadoEm, kpis: bRx },
      diff: {
        ebitda: (bRx.ebitdaTotal ?? 0) - (aRx.ebitdaTotal ?? 0),
        divida: (bP?.endividamento?.saldoTotalAtual ?? 0) - (aP?.endividamento?.saldoTotalAtual ?? 0),
        diviPorEbitda: (bRx.diviPorEbitda ?? 0) - (aRx.diviPorEbitda ?? 0),
        margemEbitda: (bRx.margemEbitda ?? 0) - (aRx.margemEbitda ?? 0),
        saldoFinal: (bRx.saldoFinalAcumulado ?? 0) - (aRx.saldoFinalAcumulado ?? 0),
      },
    })
  })

  // Templates de cliente — pré-popula grupo com perfil agro típico
  fastify.post('/api/gestao-financeira/grupos/:id/aplicar-template', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as any
    const tpl = String(body?.template ?? '').toLowerCase()
    try {
      const { aplicarTemplateCliente } = await import('../services/gestao-financeira/templates-cliente.js')
      const r = await aplicarTemplateCliente(id, tpl)
      return envelope(r)
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro aplicar template', 'TEMPLATE_ERROR')
    }
  })

  // Insights — listagem + recomputar
  fastify.get('/api/gestao-financeira/grupos/:id/insights', async (req) => {
    const { id } = req.params as { id: string }
    const list = await svcV2.listarInsights(id, 100)
    return envelope({ total: list.length, insights: list })
  })
  fastify.post('/api/gestao-financeira/grupos/:id/insights/recalcular', async (req) => {
    const { id } = req.params as { id: string }
    const dash = await svcV2.calcularDashboard360(id, { persistir: true })
    return envelope({ insights: dash.insights })
  })
}
