import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { DataSourceManager } from '../services/DataSourceManager.js'
import { MarketBriefService, collectMarketPrices } from '../services/MarketBriefService.js'
import { SazonalidadeService } from '../services/SazonalidadeService.js'

const cultures = ['soja', 'milho', 'boi', 'cafe', 'algodao', 'trigo', 'acucar', 'leite', 'arroz', 'feijao'] as const
const priceQuery = z.object({ culturas: z.string().optional(), periodo: z.string().regex(/^\d{1,3}d?$/).optional() })
const focusQuery = z.object({ top: z.coerce.number().int().min(1).max(100).default(10), ano: z.coerce.number().int().min(2000).max(2100).optional(), baseCalculo: z.coerce.number().int().min(0).max(1).optional() })

function unavailableMarketData(fonte: string, error: string) {
  return { success: false, data: null, error, meta: { estado: 'indisponivel', fonteOrigem: 'indisponivel', fonte, atualizacao: null, aviso: 'Sem observações verificadas para esta consulta. Nenhuma série artificial foi usada.' } }
}

export default async function (fastify: FastifyInstance) {
  const dsm = DataSourceManager.getInstance()

  fastify.get('/api/mercado/precos', async (request, reply) => {
    const parsed = priceQuery.safeParse(request.query)
    if (!parsed.success) return reply.status(400).send({ error: 'Período inválido; use de 1 a 365 dias.' })
    const keys = parsed.data.culturas?.split(',').map(c => c.trim().toLowerCase()) || cultures.slice(0, 8)
    const days = Number(parsed.data.periodo?.replace('d', '') || 30)
    if (days < 1 || days > 365 || keys.some(k => !cultures.includes(k as typeof cultures[number]))) return reply.status(400).send({ error: 'Culturas ou período inválidos.' })
    const data = await collectMarketPrices(dsm, keys, days)
    const missing = keys.filter(k => !data.some(c => c.chave === k))
    const source = data.length && data.every(c => c.fonteOrigem === 'api') ? 'api' : data.length ? 'cache' : 'fallback'
    return { success: true, data, meta: { culturasConsultadas: keys, periodo: `${days} dias`, fonteOrigem: source, fonte: 'CONAB / CEPEA', consultadoEm: new Date().toISOString(), atualizacao: data.map(c => c.atualizacao).sort().at(-1) || null, estado: !data.length ? 'indisponivel' : missing.length || data.some(c => c.estado === 'atrasado') ? 'parcial' : 'disponivel', indisponiveis: missing, aviso: 'Séries e variações usam somente observações da mesma fonte, praça e unidade. Lacunas permanecem indisponíveis.' } }
  })

  fastify.get('/api/mercado/indicadores', async () => {
    const bcb = await dsm.bancoCentral.getAllIndicators()
    const specifications = [
      ['SELIC', 'Taxa Selic', bcb.selic], ['IPCA', 'IPCA mensal', bcb.ipca],
      ['IGP-M', 'IGP-M mensal', bcb.igpm], ['CDI', 'CDI anualizado (252 dias úteis)', bcb.cdi],
    ] as const
    const data = specifications.filter(([, , value]) => value.fonte !== 'fallback').map(([sigla, nome, value]) => ({ nome: String(nome), sigla: String(sigla), valor: value.valor, unidade: value.unidade, referencia: value.data, variacao: null, fonte: `Banco Central do Brasil (SGS ${value.serie})`, fonteOrigem: value.fonte, atualizacao: value.data, estado: value.estado === 'atrasado' || Date.now() - Date.parse(value.data) > ([433, 189].includes(value.serie) ? 70 : 7) * 86400000 ? 'atrasado' : 'disponivel', historico: value.historico || [] }))
    if (bcb.ptax.fonte !== 'fallback') data.push({ nome: 'Dólar PTAX (venda)', sigla: 'USD/BRL', valor: bcb.ptax.cotacaoVenda, unidade: 'R$/US$', referencia: bcb.ptax.dataHoraCotacao, variacao: null, fonte: 'BCB PTAX', fonteOrigem: bcb.ptax.fonte, atualizacao: bcb.ptax.dataHoraCotacao, estado: bcb.ptax.estado === 'atrasado' || Date.now() - Date.parse(bcb.ptax.dataHoraCotacao) > 7 * 86400000 ? 'atrasado' : 'disponivel', historico: [] })
    return { success: true, data, meta: { fonteOrigem: data.length && data.every(v => v.fonteOrigem === 'api') ? 'api' : data.length ? 'cache' : 'fallback', estado: data.length === 5 && data.every(i => i.estado === 'disponivel') ? 'disponivel' : data.length ? 'parcial' : 'indisponivel', consultadoEm: new Date().toISOString(), atualizacao: data.map(v => v.atualizacao).sort().at(-1) || null, aviso: 'IPCA e IGP-M são taxas mensais. CDI é anualização da taxa diária em 252 dias úteis, não acumulado de 12 meses.' } }
  })

  fastify.get('/api/mercado/commodities/:commodity/historico', async (request, reply) => {
    const query = z.object({ dias: z.coerce.number().int().min(1).max(365).default(30) }).safeParse(request.query)
    const key = (request.params as { commodity: string }).commodity.toLowerCase()
    if (!query.success || !cultures.includes(key as typeof cultures[number])) return reply.status(400).send({ error: 'Commodity ou período inválido' })
    const price = (await collectMarketPrices(dsm, [key], query.data.dias))[0]
    const history = price?.historico || []
    return { success: true, data: { commodity: price?.cultura || key, unidade: price?.unidade || null, praca: price?.praca || null, periodo: `${query.data.dias} dias`, historico: history, estatisticas: null, fonteOrigem: history.length > 1 ? price.fonteOrigem : 'fallback' }, meta: { fonteOrigem: history.length > 1 ? price.fonteOrigem : 'fallback', estado: history.length > 1 ? price.estado : 'indisponivel', fonte: price?.fonte || null, atualizacao: history.at(-1)?.data || null, pontosDeDados: history.length, aviso: history.length > 1 ? null : 'Histórico insuficiente; nenhuma série sintética foi criada.' } }
  })

  /* ---- CENÁRIO SAFRA — REAL CONAB when available ---- */
  fastify.get('/api/mercado/safra/cenario', async () => {
    try {
      const safra = await dsm.precos.getPrevisaoSafra()

      return {
        success: true,
        data: {
          safra: safra.safra,
          status: 'em_desenvolvimento',
          atualizacao: safra.atualizadoEm,
          fonte: safra.fonte === 'api' ? 'CONAB' : 'CONAB / Abiove / StoneX (referência)',
          fonteOrigem: safra.fonte,
          confiabilidade: safra.fonte === 'api' ? 'alta' : 'media',
          culturas: safra.culturas.map(c => ({
            cultura: c.cultura,
            areaPlantadaMha: c.areaPlantada / 1000,
            variacaoArea: 0,
            produtividadeMedia: c.produtividade,
            unidade: 'kg/ha',
            producaoEstimadaMt: c.producao / 1000,
            variacaoProducao: c.variacaoProducao,
            clima: '',
            observacao: '',
          })),
          macroeconomia: {},
        },
        meta: {
          fonte: safra.fonte === 'api' ? 'CONAB' : 'CONAB (fallback)',
          fonteOrigem: safra.fonte,
          atualizacao: safra.atualizadoEm,
          confiabilidade: safra.fonte === 'api' ? 'alta' : 'media',
          aviso: safra.fonte === 'fallback' ? 'Dados consolidados de referência. API CONAB indisponível.' : 'Dados obtidos da CONAB em tempo real.',
        },
      }
    } catch (error) {
      console.warn('[mercado/safra] Erro total:', error)
      return {
        success: true,
        data: {
          safra: '2025/2026', status: 'em_desenvolvimento',
          atualizacao: new Date().toISOString(),
          fonte: 'CONAB / Abiove / StoneX (referência)', fonteOrigem: 'fallback' as const,
          confiabilidade: 'media',
          culturas: [], macroeconomia: {},
        },
        meta: { fonte: 'Fallback', fonteOrigem: 'fallback' as const, atualizacao: new Date().toISOString(), confiabilidade: 'baixa' },
      }
    }
  })

  // Sem fornecedor, data e região verificáveis, não há cotação de insumo.
  fastify.get('/api/mercado/insumos', async () => ({ success: true, data: [], meta: { totalProdutos: 0, fonteOrigem: 'fallback', estado: 'indisponivel', atualizacao: null, aviso: 'Cotações de insumos indisponíveis. Não há referências com origem, data e região verificadas.' } }))

  /* ---- STATUS DAS FONTES DE DADOS ---- */
  fastify.get('/api/mercado/fontes/status', async () => {
    const status = dsm.getDashboardStatus()
    return { success: true, data: status }
  })

  /* ==================================================================
   *  NEW ENDPOINTS — Wave 1 (Real-time APIs)
   * ================================================================== */

  /* ---- EXPECTATIVAS DE MERCADO (Boletim Focus) ---- */
  fastify.get('/api/mercado/expectativas', async () => {
    try {
      const expectativas = await dsm.expectativas.getAllExpectativas()

      // Determine overall fonteOrigem
      const fontes = Object.values(expectativas).map(e => e.fonte)
      const fonteOrigem = fontes.every(f => f === 'api') ? 'api' as const
        : fontes.some(f => f === 'api' || f === 'cache') ? 'cache' as const
        : 'fallback' as const

      return {
        success: true,
        data: expectativas,
        meta: {
          indicadores: Object.keys(expectativas),
          fonteOrigem,
          fonte: 'Banco Central do Brasil — Sistema de Expectativas (Boletim Focus)',
          atualizacao: new Date().toISOString(),
          descricao: 'Expectativas de mercado coletadas de 100+ instituições financeiras',
        },
      }
    } catch (error) {
      return {
        success: false,
        error: 'Falha ao buscar expectativas de mercado',
        data: null,
      }
    }
  })

  /* ---- EXPECTATIVAS POR INDICADOR ---- */
  fastify.get('/api/mercado/expectativas/:indicador', async (request: FastifyRequest<{ Params: { indicador: string } }>, reply) => {
    const { indicador } = request.params
    const query = focusQuery.safeParse(request.query)
    if (!query.success) return reply.status(400).send({ success: false, error: 'Consulta Focus inválida: top 1–100, ano 2000–2100 e baseCalculo 0 ou 1.' })
    const indicadorMap: Record<string, string> = {
      selic: 'Selic',
      ipca: 'IPCA',
      cambio: 'Câmbio',
      igpm: 'IGP-M',
      pib: 'PIB Total',
    }
    const realIndicador = indicadorMap[indicador.toLowerCase()] || indicador

    try {
      const result = await dsm.expectativas.getExpectativasAnuais(realIndicador, query.data.top, { anoReferencia: query.data.ano, baseCalculo: query.data.baseCalculo as 0 | 1 | undefined })
      return {
        success: true,
        data: result,
        meta: {
          fonteOrigem: result.fonte,
          fonte: 'BCB Expectativas (Boletim Focus)',
          atualizacao: result.atualizadoEm,
        },
      }
    } catch {
      return { success: false, error: `Falha ao buscar expectativas de ${indicador}` }
    }
  })

  /* ---- COTACOES CAMBIAIS REAL-TIME (AwesomeAPI) ---- */
  fastify.get('/api/mercado/cambio', async () => {
    try {
      const cotacoes = await dsm.awesomeApi.getCotacoesAtuais()
      const fonteOrigem = cotacoes[0]?.fonte || 'fallback'

      return {
        success: true,
        data: cotacoes,
        meta: {
          pares: cotacoes.map(c => c.moeda),
          fonteOrigem,
          fonte: [...new Set(cotacoes.map(c => c.provedor))].join(', '),
          atualizacao: cotacoes.map(c => c.createDate).filter(Boolean).sort().at(-1) || null,
          estado: cotacoes.some(c => c.estado === 'atrasado') ? 'atrasado' : cotacoes.length ? 'disponivel' : 'indisponivel',
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar cotações cambiais' }
    }
  })

  /* ---- HISTÓRICO CAMBIAL ---- */
  fastify.get('/api/mercado/cambio/historico', async (request, reply) => {
    const query = z.object({ par: z.string().regex(/^[A-Z]{3}-[A-Z]{3}$/).default('USD-BRL'), dias: z.coerce.number().int().min(1).max(365).default(30) }).safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: 'Par ou período inválido; use um par como USD-BRL e de 1 a 365 dias.' })
    const { par, dias } = query.data

    try {
      const historico = await dsm.awesomeApi.getHistoricoDiario(par, dias)
      return {
        success: true,
        data: historico,
        meta: {
          fonteOrigem: historico.fonte,
          fonte: historico.provedor,
          estado: historico.cotacoes.length >= 2 ? historico.estado || 'disponivel' : 'indisponivel',
          atualizacao: historico.atualizadoEm,
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar histórico cambial' }
    }
  })

  /* ---- IC-Br ÍNDICE DE COMMODITIES AGROPECUÁRIAS ---- */
  fastify.get('/api/mercado/icbr', async () => {
    try {
      const icbr = await dsm.bancoCentral.fetchICBrAgro()
      return {
        success: true,
        data: icbr,
        meta: {
          fonteOrigem: icbr.fonte,
          fonte: 'Banco Central do Brasil — IC-Br Agropecuário (SGS 27574)',
          atualizacao: new Date().toISOString(),
          descricao: 'Índice de commodities agropecuárias calculado pelo BCB. Substituto confiável para CEPEA.',
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar IC-Br Agropecuário' }
    }
  })

  /* ---- EMBI+ RISCO PAÍS ---- */
  fastify.get('/api/mercado/embi', async () => {
    try {
      const embi = await dsm.bancoCentral.fetchEMBI()
      return {
        success: true,
        data: embi,
        meta: {
          fonteOrigem: embi.fonte,
          fonte: 'J.P. Morgan / BCB SGS 21340',
          atualizacao: new Date().toISOString(),
          descricao: 'EMBI+ Brasil — spread soberano sobre treasuries dos EUA, em pontos-base.',
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar EMBI+' }
    }
  })

  /* ---- SAFRA LSPA (IBGE SIDRA Tabela 6588) ---- */
  fastify.get('/api/mercado/safra', async () => {
    try {
      const safra = await dsm.sidraLSPA.getSafraBrasil()
      return {
        success: true,
        data: safra,
        meta: {
          fonteOrigem: safra.fonte,
          fonte: 'IBGE SIDRA — LSPA Tabela 6588 (Levantamento Sistemático da Produção Agrícola)',
          atualizacao: safra.atualizadoEm,
          descricao: 'Estimativa mensal de área plantada, produção e rendimento para culturas principais.',
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar dados de safra LSPA' }
    }
  })

  /* ---- PREÇOS AGRO — CONAB (dados reais semanais por UF) ---- */
  fastify.get('/api/mercado/precos-agro', async () => {
    try {
      const precos = await dsm.conabPrecos.getAllPrecos()

      return {
        success: true,
        data: precos,
        meta: {
          commodities: ['soja', 'milho', 'cafe_arabica', 'algodao', 'trigo', 'arroz', 'feijao'],
          fonteOrigem: precos.fonte,
          fonte: 'CONAB — Portal de Informações (Preços Semanais por UF)',
          atualizacao: precos.atualizadoEm,
          descricao: 'Preços semanais reais de commodities agrícolas por estado, coletados pela CONAB junto a produtores e atacadistas.',
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar preços agro CONAB' }
    }
  })

  /* ---- PREÇOS AGRO POR COMMODITY ---- */
  fastify.get('/api/mercado/precos-agro/:commodity', async (request: FastifyRequest<{ Params: { commodity: string } }>) => {
    const { commodity } = request.params
    try {
      const preco = await dsm.conabPrecos.getPreco(commodity)
      return {
        success: true,
        data: preco,
        meta: {
          fonteOrigem: preco.fonte,
          fonte: 'CONAB — Portal de Informações',
          atualizacao: preco.atualizadoEm,
        },
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Commodity não encontrada' }
    }
  })

  /* ---- PREÇOS AGRO POR UF ---- */
  fastify.get('/api/mercado/precos-agro/uf/:uf', async (request: FastifyRequest<{ Params: { uf: string } }>) => {
    const { uf } = request.params
    try {
      const precos = await dsm.conabPrecos.getPrecosPorUF(uf)
      return {
        success: true,
        data: { uf: uf.toUpperCase(), precos },
        meta: {
          fonteOrigem: 'api' as const,
          fonte: 'CONAB — Portal de Informações',
          atualizacao: new Date().toISOString(),
        },
      }
    } catch {
      return { success: false, error: `Falha ao buscar preços para UF ${uf}` }
    }
  })

  /* ---- COMBUSTÍVEIS — ANP (dados reais por estado) ---- */
  fastify.get('/api/mercado/combustiveis', async (request: FastifyRequest<{ Querystring: { uf?: string } }>) => {
    const uf = ((request.query as any).uf || 'SP').toUpperCase()
    try {
      const precos = await dsm.anp.getPrecosCombustiveis(uf)
      return {
        success: true,
        data: precos,
        meta: {
          estado: uf,
          fonteOrigem: precos.diesel.fonte === 'api' || precos.etanol.fonte === 'api' ? 'api' as const : precos.diesel.fonte as 'cache' | 'fallback',
          fonte: 'ANP — Agência Nacional do Petróleo (Dados Abertos)',
          atualizacao: new Date().toISOString(),
          descricao: 'Preços de combustíveis coletados em postos de revenda pela ANP. Dados abertos mensais.',
        },
      }
    } catch {
      return { success: false, error: `Falha ao buscar preços de combustíveis para ${uf}` }
    }
  })

  /* ---- COMBUSTÍVEIS DIESEL NACIONAL ---- */
  fastify.get('/api/mercado/combustiveis/diesel', async () => {
    try {
      const resumo = await dsm.anp.getDieselNacional()
      return {
        success: true,
        data: resumo,
        meta: {
          fonteOrigem: resumo.fonte,
          fonte: 'ANP — Dados Abertos (CSV mensal)',
          atualizacao: resumo.atualizadoEm,
          estado: resumo.fonte === 'fallback' ? 'referencia' : 'parcial',
          indisponiveis: resumo.indisponiveis,
          aviso: 'Este resumo contém somente Diesel S10. Gasolina não foi coletada e permanece indisponível.',
          descricao: 'Resumo nacional de preços do Diesel S10 com detalhamento por estado.',
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar diesel nacional' }
    }
  })

  /* ---- IC-Br COMPLETO (Agro + Energia + Metal) ---- */
  fastify.get('/api/mercado/icbr/completo', async () => {
    try {
      const icbr = await dsm.bancoCentral.fetchICBrCompleto()
      return {
        success: true,
        data: icbr,
        meta: {
          fonteOrigem: icbr.fonte,
          fonte: 'Banco Central do Brasil — IC-Br Sub-índices (SGS 27574/27575/27576)',
          atualizacao: icbr.atualizadoEm,
          descricao: 'Índices de commodities BCB: Agropecuário, Energia e Metal. Base dez/2005 = 100.',
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar IC-Br completo' }
    }
  })

  /* ---- NASA FIRMS — FOCOS DE INCÊNDIO ---- */
  fastify.get('/api/mercado/incendios', async () => {
    try {
      const dados = await dsm.nasaFirms.getIncendiosBrasil()
      return {
        success: true,
        data: dados,
        meta: {
          fonteOrigem: dados.fonte,
          fonte: 'NASA FIRMS — VIIRS Suomi NPP (Near Real-Time)',
          atualizacao: dados.atualizadoEm,
          descricao: 'Focos de incêndio ativos nas últimas 24 horas no Brasil, detectados por satélite VIIRS.',
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar dados de incêndio' }
    }
  })

  /* ---- INCÊNDIOS PRÓXIMOS A COORDENADA ---- */
  fastify.get('/api/mercado/incendios/proximo', async (request: FastifyRequest<{ Querystring: { lat?: string; lon?: string; raio?: string } }>) => {
    const lat = parseFloat((request.query as any).lat || '-15.78')
    const lon = parseFloat((request.query as any).lon || '-47.93')
    const raio = parseInt((request.query as any).raio || '100')

    try {
      const dados = await dsm.nasaFirms.getIncendiosProximos(lat, lon, raio)
      return {
        success: true,
        data: dados,
        meta: {
          coordenadas: { lat, lon },
          raioKm: raio,
          fonteOrigem: dados.fonte,
          fonte: 'NASA FIRMS',
          atualizacao: new Date().toISOString(),
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar incêndios próximos' }
    }
  })

  /* ==================================================================
   *  Fase 6 — SICOR (Crédito Rural Granular) + ComexStat (Exportações)
   * ================================================================== */

  /* ---- SICOR AGREGADO — Volume/produto/UF/finalidade últimos N meses ---- */
  fastify.get('/api/mercado/sicor/agregado', async (request: FastifyRequest<{ Querystring: { meses?: string } }>) => {
    const meses = parseInt((request.query as any).meses || '12') || 12
    try {
      const agregado = await dsm.sicor.getAgregado(meses)
      return {
        success: true,
        data: agregado,
        meta: {
          fonteOrigem: agregado.fonte,
          fonte: 'Banco Central do Brasil — SICOR (Sistema de Operações do Crédito Rural)',
          atualizacao: agregado.atualizadoEm,
          descricao: 'Volume total de crédito rural concedido, por produto/UF/finalidade. Base oficial BCB via OLINDA.',
        },
      }
    } catch {
      return unavailableMarketData('BCB SICOR', 'Crédito rural SICOR indisponível: não há observações verificadas para esta consulta.')
    }
  })

  /* ---- SICOR SÉRIE MENSAL — Evolução mensal do crédito rural ---- */
  fastify.get('/api/mercado/sicor/serie-mensal', async (request: FastifyRequest<{ Querystring: { meses?: string } }>) => {
    const meses = parseInt((request.query as any).meses || '24') || 24
    try {
      const serie = await dsm.sicor.getSerieMensal(meses)
      return {
        success: true,
        data: serie,
        meta: {
          fonteOrigem: serie.fonte,
          fonte: 'BCB SGS 20568 — Crédito Rural Concedido Mensal',
          atualizacao: serie.atualizadoEm,
          descricao: 'Série mensal de desembolsos do crédito rural, em R$.',
        },
      }
    } catch {
      return unavailableMarketData('BCB SGS 20568', 'Série mensal do crédito rural indisponível: a fonte não forneceu observações verificadas.')
    }
  })

  /* ---- EXPORTAÇÕES AGRO — ComexStat (MDIC) ---- */
  fastify.get('/api/mercado/exportacao/agro', async (request: FastifyRequest<{ Querystring: { meses?: string } }>) => {
    const meses = parseInt((request.query as any).meses || '12') || 12
    try {
      const exp = await dsm.comexStat.getExportacoesAgro(meses)
      return {
        success: true,
        data: exp,
        meta: {
          fonteOrigem: exp.fonte,
          fonte: 'MDIC/Siscomex — ComexStat',
          atualizacao: exp.atualizadoEm,
          descricao: 'Exportações agropecuárias brasileiras por NCM, país de destino e mês. Dados oficiais do MDIC.',
        },
      }
    } catch {
      return unavailableMarketData('MDIC ComexStat', 'Exportações agro indisponíveis: não há observações verificadas para esta consulta.')
    }
  })

  /* ---- EXPORTAÇÕES POR PRODUTO — Série mensal ---- */
  fastify.get('/api/mercado/exportacao/produto/:produto', async (request: FastifyRequest<{ Params: { produto: string }; Querystring: { meses?: string } }>) => {
    const { produto } = request.params
    const meses = parseInt((request.query as any).meses || '24') || 24
    const produtosValidos = ['soja', 'milho', 'cafe', 'carne_bovina', 'carne_frango', 'acucar', 'algodao', 'celulose', 'soja_farelo', 'soja_oleo'] as const
    type ProdutoValido = typeof produtosValidos[number]
    if (!produtosValidos.includes(produto as ProdutoValido)) {
      return { success: false, error: `Produto inválido. Disponíveis: ${produtosValidos.join(', ')}` }
    }
    try {
      const serie = await dsm.comexStat.getSerieMensalProduto(produto as ProdutoValido, meses)
      return {
        success: true,
        data: serie,
        meta: {
          fonteOrigem: serie.fonte,
          fonte: 'MDIC/Siscomex — ComexStat',
          atualizacao: serie.atualizadoEm,
        },
      }
    } catch {
      return unavailableMarketData('MDIC ComexStat', `Série de exportações de ${produto} indisponível: a fonte não forneceu observações verificadas.`)
    }
  })

  /* ---- SAFRA POR ESTADO ---- */
  fastify.get('/api/mercado/safra/:uf', async (request: FastifyRequest<{ Params: { uf: string } }>) => {
    const ufMap: Record<string, string> = {
      PR: '41', MT: '51', MS: '50', GO: '52', MG: '31', SP: '35',
      RS: '43', BA: '29', MA: '21', TO: '17', PI: '22', RO: '11',
    }
    const ufCode = ufMap[request.params.uf.toUpperCase()] || request.params.uf

    try {
      const safra = await dsm.sidraLSPA.getSafraEstado(ufCode)
      return {
        success: true,
        data: safra,
        meta: {
          fonteOrigem: safra.fonte,
          fonte: 'IBGE SIDRA — LSPA Tabela 6588',
          atualizacao: safra.atualizadoEm,
        },
      }
    } catch {
      return { success: false, error: `Falha ao buscar safra para UF ${request.params.uf}` }
    }
  })

  /* ------------------------------------------------------------------
   *  BASIS REGIONAL + FRETE ESTIMADO
   * ------------------------------------------------------------------
   *  Calcula diferencial de preço (basis) entre praça de referência
   *  (porto/CEPEA) e preço no interior, descontando custo de frete
   *  estimado via tabela simplificada por UF de origem.
   *
   *  Uso típico: cliente em Sinop/MT querendo estimar preço líquido da
   *  saca de soja no campo após frete até Paranaguá.
   *
   *  Fonte basis: CEPEA (quando disponível) ou FALLBACK.
   *  Fonte frete: tabela estimativa ALETIS (R$/t por UF origem → destino),
   *  baseada em médias setoriais 2024-2026 (ANTT/IMEA/ABIOVE).
   * ------------------------------------------------------------------ */
  fastify.get('/api/mercado/basis', async () => ({ success: false, data: null, error: 'Basis indisponível: são necessárias cotações verificadas da mesma unidade no porto e no interior, além do frete da rota.' }))

  /* ------------------------------------------------------------------
   * GET /api/mercado/brief
   * Sintetiza o panorama do dia — commodities, macro, câmbio, alertas
   * e narrativa em texto (curta + executiva). Ideal pra Alix e ticker
   * de destaques.
   * ------------------------------------------------------------------ */
  const briefService = new MarketBriefService(dsm)
  fastify.get('/api/mercado/brief', async () => {
    const brief = await briefService.generateBrief()
    return { success: true, data: brief }
  })

  /* ------------------------------------------------------------------
   * GET /api/mercado/sazonalidade/:commodity
   * Perfil sazonal histórico + recomendação contextual do mês atual
   * (vender / segurar / neutro) com justificativa.
   * ------------------------------------------------------------------ */
  const sazonalService = new SazonalidadeService()
  fastify.get(
    '/api/mercado/sazonalidade/:commodity',
    async (request: FastifyRequest<{ Params: { commodity: string } }>) => {
      const { commodity } = request.params
      const perfil = sazonalService.getPerfil(commodity)
      if (!perfil) {
        return {
          success: false,
          error: `Sazonalidade não disponível para "${commodity}". Suportadas: soja, milho, boi, cafe, algodao, trigo.`,
        }
      }
      const recomendacao = sazonalService.recomendacaoMesAtual(commodity)
      return { success: true, data: { perfil, recomendacao } }
    },
  )

  /* ------------------------------------------------------------------
   * GET /api/mercado/sazonalidade
   * Listagem completa dos perfis sazonais disponíveis.
   * ------------------------------------------------------------------ */
  fastify.get('/api/mercado/sazonalidade', async () => {
    const todos = sazonalService.getTodos()
    return { success: true, data: todos, total: todos.length }
  })
}
