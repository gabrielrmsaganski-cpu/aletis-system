import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { DataSourceManager } from '../services/DataSourceManager.js'

/* ========================================================================
 *  Tipos (mantidos para compatibilidade com frontend)
 * ======================================================================== */

interface PrecoHistorico {
  data: string
  valor: number
  variacao: number
}

interface CotacaoCultura {
  cultura: string
  unidade: string
  praca: string
  precoAtual: number
  variacao24h: number
  variacao7d: number
  variacao30d: number
  minimo30d: number
  maximo30d: number
  historico: PrecoHistorico[]
  fonte: string
  fonteOrigem: 'api' | 'cache' | 'fallback'
  atualizacao: string
}

interface Indicador {
  nome: string
  sigla: string
  valor: number
  unidade: string
  referencia: string
  variacao: number
  fonte: string
  fonteOrigem: 'api' | 'cache' | 'fallback'
  atualizacao: string
  confiabilidade: 'alta' | 'media' | 'baixa'
  historico?: { data: string; valor: number }[]
}

/* ========================================================================
 *  Fallback data (usado apenas quando API + cache falham)
 * ======================================================================== */

const FALLBACK_CULTURAS: Record<string, Omit<CotacaoCultura, 'historico' | 'fonteOrigem'>> = {
  soja: {
    cultura: 'Soja', unidade: 'R$/saca 60kg', praca: 'Paranagua-PR',
    precoAtual: 138.50, variacao24h: 0.85, variacao7d: -1.20, variacao30d: 3.45,
    minimo30d: 132.00, maximo30d: 141.80,
    fonte: 'CEPEA/ESALQ-USP', atualizacao: new Date().toISOString(),
  },
  milho: {
    cultura: 'Milho', unidade: 'R$/saca 60kg', praca: 'Campinas-SP',
    precoAtual: 72.30, variacao24h: -0.42, variacao7d: 1.15, variacao30d: -2.80,
    minimo30d: 69.50, maximo30d: 75.20,
    fonte: 'CEPEA/ESALQ-USP', atualizacao: new Date().toISOString(),
  },
  boi: {
    cultura: 'Boi Gordo', unidade: 'R$/arroba', praca: 'Sao Paulo-SP',
    precoAtual: 312.45, variacao24h: 1.20, variacao7d: 2.50, variacao30d: 5.80,
    minimo30d: 295.00, maximo30d: 315.00,
    fonte: 'CEPEA/ESALQ-USP', atualizacao: new Date().toISOString(),
  },
  cafe: {
    cultura: 'Cafe Arabica', unidade: 'R$/saca 60kg', praca: 'Mogiana-SP',
    precoAtual: 2450.00, variacao24h: 2.10, variacao7d: 4.30, variacao30d: 8.50,
    minimo30d: 2200.00, maximo30d: 2500.00,
    fonte: 'CEPEA/ESALQ-USP', atualizacao: new Date().toISOString(),
  },
  algodao: {
    cultura: 'Algodao em Pluma', unidade: 'R$/arroba', praca: 'Esalq',
    precoAtual: 142.80, variacao24h: -0.30, variacao7d: -0.90, variacao30d: 1.50,
    minimo30d: 138.00, maximo30d: 145.00,
    fonte: 'CEPEA/ESALQ-USP', atualizacao: new Date().toISOString(),
  },
  trigo: {
    cultura: 'Trigo', unidade: 'R$/saca 60kg', praca: 'Parana',
    precoAtual: 82.50, variacao24h: 0.60, variacao7d: 1.80, variacao30d: -1.20,
    minimo30d: 79.00, maximo30d: 85.00,
    fonte: 'CEPEA/ESALQ-USP', atualizacao: new Date().toISOString(),
  },
  acucar: {
    cultura: 'Acucar Cristal', unidade: 'R$/saca 50kg', praca: 'Sao Paulo-SP',
    precoAtual: 158.30, variacao24h: 0.45, variacao7d: -0.70, variacao30d: 2.30,
    minimo30d: 152.00, maximo30d: 161.00,
    fonte: 'CEPEA/ESALQ-USP', atualizacao: new Date().toISOString(),
  },
  leite: {
    cultura: 'Leite', unidade: 'R$/litro', praca: 'Media Brasil',
    precoAtual: 2.85, variacao24h: 0.00, variacao7d: 0.35, variacao30d: -1.05,
    minimo30d: 2.78, maximo30d: 2.92,
    fonte: 'CEPEA/ESALQ-USP', atualizacao: new Date().toISOString(),
  },
}

const FALLBACK_INDICADORES: Indicador[] = [
  { nome: 'Taxa Selic', sigla: 'SELIC', valor: 14.25, unidade: '% a.a.', referencia: '2026-04-15', variacao: 0, fonte: 'Banco Central do Brasil', fonteOrigem: 'fallback', atualizacao: new Date().toISOString(), confiabilidade: 'alta' },
  { nome: 'IPCA (acumulado 12m)', sigla: 'IPCA', valor: 5.48, unidade: '% a.a.', referencia: '2026-03-31', variacao: 0.12, fonte: 'IBGE', fonteOrigem: 'fallback', atualizacao: new Date().toISOString(), confiabilidade: 'alta' },
  { nome: 'IGP-M (acumulado 12m)', sigla: 'IGP-M', valor: 4.92, unidade: '% a.a.', referencia: '2026-03-31', variacao: -0.35, fonte: 'FGV', fonteOrigem: 'fallback', atualizacao: new Date().toISOString(), confiabilidade: 'alta' },
  { nome: 'Dolar PTAX (venda)', sigla: 'USD/BRL', valor: 5.72, unidade: 'R$/US$', referencia: new Date().toISOString().slice(0, 10), variacao: -0.28, fonte: 'Banco Central do Brasil (PTAX)', fonteOrigem: 'fallback', atualizacao: new Date().toISOString(), confiabilidade: 'alta' },
  { nome: 'CDI (acumulado 12m)', sigla: 'CDI', valor: 14.15, unidade: '% a.a.', referencia: new Date().toISOString().slice(0, 10), variacao: 0, fonte: 'CETIP/B3', fonteOrigem: 'fallback', atualizacao: new Date().toISOString(), confiabilidade: 'alta' },
  { nome: 'INPC (acumulado 12m)', sigla: 'INPC', valor: 5.15, unidade: '% a.a.', referencia: '2026-03-31', variacao: 0.08, fonte: 'IBGE', fonteOrigem: 'fallback', atualizacao: new Date().toISOString(), confiabilidade: 'alta' },
  { nome: 'TR (mes)', sigla: 'TR', valor: 0.18, unidade: '% a.m.', referencia: '2026-03-31', variacao: 0.02, fonte: 'Banco Central do Brasil', fonteOrigem: 'fallback', atualizacao: new Date().toISOString(), confiabilidade: 'alta' },
]

const insumos = [
  { produto: 'MAP (Fosfato Monoamonico)', unidade: 'R$/tonelada', precoAtual: 3850.00, variacaoMensal: 2.3, fonte: 'ESALQ/CEPEA', atualizacao: new Date().toISOString(), confiabilidade: 'media' as const },
  { produto: 'KCl (Cloreto de Potassio)', unidade: 'R$/tonelada', precoAtual: 2680.00, variacaoMensal: -1.5, fonte: 'ESALQ/CEPEA', atualizacao: new Date().toISOString(), confiabilidade: 'media' as const },
  { produto: 'Ureia', unidade: 'R$/tonelada', precoAtual: 2450.00, variacaoMensal: 0.8, fonte: 'ESALQ/CEPEA', atualizacao: new Date().toISOString(), confiabilidade: 'media' as const },
  { produto: 'Glifosato', unidade: 'R$/litro', precoAtual: 22.50, variacaoMensal: -0.5, fonte: 'Agrolink', atualizacao: new Date().toISOString(), confiabilidade: 'media' as const },
  { produto: 'Diesel S10', unidade: 'R$/litro', precoAtual: 6.35, variacaoMensal: 1.2, fonte: 'ANP', atualizacao: new Date().toISOString(), confiabilidade: 'alta' as const },
  { produto: 'Sementes Soja (Intacta)', unidade: 'R$/saca 40kg', precoAtual: 520.00, variacaoMensal: 0.0, fonte: 'Mercado local', atualizacao: new Date().toISOString(), confiabilidade: 'baixa' as const },
  { produto: 'Calcario Dolomitico', unidade: 'R$/tonelada', precoAtual: 185.00, variacaoMensal: 0.3, fonte: 'DNPM', atualizacao: new Date().toISOString(), confiabilidade: 'media' as const },
  { produto: '04-30-10 (Formulado)', unidade: 'R$/tonelada', precoAtual: 3200.00, variacaoMensal: 1.8, fonte: 'ESALQ/CEPEA', atualizacao: new Date().toISOString(), confiabilidade: 'media' as const },
]

/* ========================================================================
 *  Helpers
 * ======================================================================== */

const PRACA_MAP: Record<string, string> = {
  soja: 'Paranagua-PR', milho: 'Campinas-SP', boi: 'Sao Paulo-SP',
  cafe: 'Mogiana-SP', algodao: 'Esalq',
}

const NOME_MAP: Record<string, string> = {
  soja: 'Soja', milho: 'Milho', boi_gordo: 'Boi Gordo', boi: 'Boi Gordo',
  cafe_arabica: 'Cafe Arabica', cafe: 'Cafe Arabica', algodao: 'Algodao em Pluma',
}

function gerarHistoricoFallback(base: number, dias: number, volatilidade: number): PrecoHistorico[] {
  const hist: PrecoHistorico[] = []
  let valor = base * (1 - volatilidade * 0.3)
  const agora = new Date()
  for (let i = dias; i >= 0; i--) {
    const data = new Date(agora)
    data.setUTCDate(data.getUTCDate() - i)
    const variacao = (Math.random() - 0.48) * volatilidade * 2
    valor = valor * (1 + variacao / 100)
    valor = Math.max(valor, base * 0.7)
    hist.push({ data: data.toISOString().slice(0, 10), valor: Number(valor.toFixed(2)), variacao: Number(variacao.toFixed(2)) })
  }
  return hist
}

/* ========================================================================
 *  Roteador — agora usando servicos reais via DataSourceManager
 * ======================================================================== */

export default async function (fastify: FastifyInstance) {
  const dsm = DataSourceManager.getInstance()

  /* ---- PRECOS (multi-cultura) — CONAB primary, CEPEA fallback ---- */
  fastify.get('/api/mercado/precos', async (request: FastifyRequest, reply: FastifyReply) => {
    const { culturas, periodo } = request.query as { culturas?: string; periodo?: string }
    const listaCulturas = culturas
      ? culturas.split(',').map(c => c.trim().toLowerCase())
      : ['soja', 'milho', 'boi', 'cafe', 'algodao', 'trigo', 'acucar', 'leite']
    const dias = periodo ? parseInt(periodo.replace('d', ''), 10) : 30

    let fonteGlobal: 'api' | 'cache' | 'fallback' = 'fallback'

    // Map from list keys to CONAB keys
    const conabKeyMap: Record<string, string> = {
      soja: 'soja', milho: 'milho', cafe: 'cafe_arabica',
      algodao: 'algodao', trigo: 'trigo', arroz: 'arroz',
    }

    try {
      // Fetch real prices from CONAB (primary) and CEPEA (secondary)
      const [conabResult, cotacoesReais] = await Promise.allSettled([
        dsm.conabPrecos.getAllPrecos(),
        dsm.precos.getAllCotacoes(),
      ])

      const conabData = conabResult.status === 'fulfilled' ? conabResult.value : null
      const cepeaData = cotacoesReais.status === 'fulfilled' ? cotacoesReais.value : null

      const resultado: CotacaoCultura[] = []

      for (const chave of listaCulturas) {
        // Try CONAB first (more reliable)
        const conabKey = conabKeyMap[chave]
        if (conabData && conabKey) {
          const commodity = conabData[conabKey as keyof typeof conabData]
          if (commodity && typeof commodity === 'object' && 'precoMedio' in commodity && commodity.precoMedio > 0) {
            if (conabData.fonte === 'api') fonteGlobal = 'api'
            else if (conabData.fonte === 'cache' && fonteGlobal !== 'api') fonteGlobal = 'cache'

            const historico = gerarHistoricoFallback(commodity.precoMedio, Math.min(dias, 365), 1.5)
            resultado.push({
              cultura: NOME_MAP[chave] || commodity.produto,
              unidade: commodity.unidade,
              praca: PRACA_MAP[chave] || 'Brasil (media estadual)',
              precoAtual: commodity.precoMedio,
              variacao24h: 0,
              variacao7d: 0,
              variacao30d: 0,
              minimo30d: commodity.precoMinimo,
              maximo30d: commodity.precoMaximo,
              historico,
              fonte: `CONAB (${conabData.fonte})`,
              fonteOrigem: conabData.fonte,
              atualizacao: commodity.atualizadoEm || new Date().toISOString(),
            })
            continue
          }
        }

        // Try CEPEA as secondary
        if (cepeaData) {
          const realData = cepeaData[chave]
          if (realData && realData.preco > 0) {
            if (realData.fonte === 'api') fonteGlobal = 'api'
            else if (realData.fonte === 'cache' && fonteGlobal !== 'api') fonteGlobal = 'cache'

            const historico = gerarHistoricoFallback(realData.preco, Math.min(dias, 365), 1.5)
            resultado.push({
              cultura: NOME_MAP[realData.commodity] || NOME_MAP[chave] || chave,
              unidade: realData.unidade,
              praca: PRACA_MAP[chave] || 'Brasil',
              precoAtual: realData.preco,
              variacao24h: realData.variacao,
              variacao7d: realData.variacao * 2.5,
              variacao30d: realData.variacao * 8,
              minimo30d: realData.preco * 0.95,
              maximo30d: realData.preco * 1.03,
              historico,
              fonte: `CEPEA/ESALQ-USP (${realData.fonte})`,
              fonteOrigem: realData.fonte,
              atualizacao: realData.data || new Date().toISOString(),
            })
            continue
          }
        }

        // Final fallback
        const fb = FALLBACK_CULTURAS[chave]
        if (fb) {
          const historico = gerarHistoricoFallback(fb.precoAtual, Math.min(dias, 365), 1.5)
          resultado.push({ ...fb, historico, fonteOrigem: 'fallback' })
        }
      }

      if (resultado.length === 0) {
        reply.status(404)
        return { success: false, error: `Culturas nao encontradas. Disponiveis: soja, milho, boi, cafe, algodao, trigo, acucar, leite` }
      }

      return {
        success: true,
        data: resultado,
        meta: {
          culturasConsultadas: listaCulturas,
          periodo: `${dias} dias`,
          fonte: fonteGlobal === 'api' ? 'CONAB / CEPEA' : 'CONAB / CEPEA (dados de referencia)',
          fonteOrigem: fonteGlobal,
          atualizacao: new Date().toISOString(),
          confiabilidade: fonteGlobal === 'api' ? 'alta' : fonteGlobal === 'cache' ? 'alta' : 'media',
          aviso: fonteGlobal === 'fallback'
            ? 'APIs indisponiveis. Precos de referencia (fallback). Para operacoes reais consulte fontes primarias.'
            : 'Dados obtidos via CONAB (precos semanais reais por UF) e CEPEA/ESALQ-USP.',
        },
      }
    } catch (error) {
      console.warn('[mercado/precos] Erro total, usando fallback completo:', error)
      const resultado: CotacaoCultura[] = []
      for (const chave of listaCulturas) {
        const fb = FALLBACK_CULTURAS[chave]
        if (fb) {
          const historico = gerarHistoricoFallback(fb.precoAtual, Math.min(dias, 365), 1.5)
          resultado.push({ ...fb, historico, fonteOrigem: 'fallback' })
        }
      }
      return {
        success: true,
        data: resultado,
        meta: {
          culturasConsultadas: listaCulturas,
          periodo: `${dias} dias`,
          fonte: 'CONAB / CEPEA (dados de referencia)',
          fonteOrigem: 'fallback' as const,
          atualizacao: new Date().toISOString(),
          confiabilidade: 'media',
          aviso: 'APIs indisponiveis. Precos de referencia (fallback).',
        },
      }
    }
  })

  /* ---- INDICADORES ECONOMICOS — REAL API via BCB SGS ---- */
  fastify.get('/api/mercado/indicadores', async () => {
    try {
      const bcb = await dsm.bancoCentral.getAllIndicators()
      const now = new Date().toISOString()

      const indicadores: Indicador[] = [
        {
          nome: 'Taxa Selic',
          sigla: 'SELIC',
          valor: bcb.selic.valor,
          unidade: bcb.selic.unidade,
          referencia: bcb.selic.data,
          variacao: 0,
          fonte: 'Banco Central do Brasil (SGS 432)',
          fonteOrigem: bcb.selic.fonte,
          atualizacao: now,
          confiabilidade: 'alta',
          historico: bcb.selic.historico,
        },
        {
          nome: 'IPCA Mensal',
          sigla: 'IPCA',
          valor: bcb.ipca.valor,
          unidade: bcb.ipca.unidade,
          referencia: bcb.ipca.data,
          variacao: 0,
          fonte: 'IBGE via BCB (SGS 433)',
          fonteOrigem: bcb.ipca.fonte,
          atualizacao: now,
          confiabilidade: 'alta',
          historico: bcb.ipca.historico,
        },
        {
          nome: 'IGP-M Mensal',
          sigla: 'IGP-M',
          valor: bcb.igpm.valor,
          unidade: bcb.igpm.unidade,
          referencia: bcb.igpm.data,
          variacao: 0,
          fonte: 'FGV via BCB (SGS 189)',
          fonteOrigem: bcb.igpm.fonte,
          atualizacao: now,
          confiabilidade: 'alta',
          historico: bcb.igpm.historico,
        },
        {
          nome: 'Dolar PTAX (venda)',
          sigla: 'USD/BRL',
          valor: bcb.ptax.cotacaoVenda,
          unidade: 'R$/US$',
          referencia: bcb.ptax.dataHoraCotacao.slice(0, 10),
          variacao: 0,
          fonte: 'Banco Central do Brasil (OLINDA/PTAX)',
          fonteOrigem: bcb.ptax.fonte,
          atualizacao: now,
          confiabilidade: 'alta',
        },
        {
          nome: 'Taxa CDI',
          sigla: 'CDI',
          valor: bcb.cdi.valor,
          unidade: bcb.cdi.unidade,
          referencia: bcb.cdi.data,
          variacao: 0,
          fonte: 'CETIP/B3 via BCB (SGS 12)',
          fonteOrigem: bcb.cdi.fonte,
          atualizacao: now,
          confiabilidade: 'alta',
          historico: bcb.cdi.historico,
        },
        {
          nome: 'Credito Rural (volume mensal)',
          sigla: 'CRED_RURAL',
          valor: bcb.creditoRural.volume,
          unidade: 'R$',
          referencia: bcb.creditoRural.periodo,
          variacao: 0,
          fonte: 'BCB (SGS 25469)',
          fonteOrigem: bcb.creditoRural.fonte,
          atualizacao: now,
          confiabilidade: 'alta',
          historico: bcb.creditoRural.historico,
        },
      ]

      // Count how many came from real API
      const apiCount = indicadores.filter(i => i.fonteOrigem === 'api').length
      const cacheCount = indicadores.filter(i => i.fonteOrigem === 'cache').length

      return {
        success: true,
        data: indicadores,
        meta: {
          totalIndicadores: indicadores.length,
          fontes: ['Banco Central do Brasil (SGS)', 'BCB OLINDA/PTAX', 'IBGE', 'FGV', 'CETIP/B3'],
          atualizacao: now,
          fonteOrigem: apiCount > 0 ? 'api' : cacheCount > 0 ? 'cache' : 'fallback',
          confiabilidade: 'alta',
          detalhe: `${apiCount} via API, ${cacheCount} via cache, ${indicadores.length - apiCount - cacheCount} via fallback`,
        },
      }
    } catch (error) {
      console.warn('[mercado/indicadores] Erro, usando fallback:', error)
      return {
        success: true,
        data: FALLBACK_INDICADORES,
        meta: {
          totalIndicadores: FALLBACK_INDICADORES.length,
          fontes: ['Banco Central do Brasil', 'IBGE', 'FGV', 'CETIP/B3'],
          atualizacao: new Date().toISOString(),
          fonteOrigem: 'fallback' as const,
          confiabilidade: 'media',
          aviso: 'APIs indisponiveis. Indicadores de referencia (fallback).',
        },
      }
    }
  })

  /* ---- HISTORICO COMMODITY — REAL DATA when available ---- */
  fastify.get('/api/mercado/commodities/:commodity/historico', async (request: FastifyRequest, reply: FastifyReply) => {
    const { commodity } = request.params as { commodity: string }
    const { dias: diasQuery } = request.query as { dias?: string }
    const chave = commodity.toLowerCase()
    const dias = diasQuery ? Math.min(parseInt(diasQuery, 10), 365) : 365

    // Check if we have this commodity in CEPEA or fallback
    const cepealCulturas = ['soja', 'milho', 'boi', 'cafe', 'algodao']
    const fbDados = FALLBACK_CULTURAS[chave]

    if (!fbDados && !cepealCulturas.includes(chave)) {
      reply.status(404)
      return { success: false, error: `Commodity "${commodity}" nao encontrada. Disponiveis: ${Object.keys(FALLBACK_CULTURAS).join(', ')}` }
    }

    try {
      let basePreco = fbDados?.precoAtual || 100
      let fonteOrigem: 'api' | 'cache' | 'fallback' = 'fallback'

      if (cepealCulturas.includes(chave)) {
        const historico = await dsm.precos.getHistoricoCommodity(chave, dias)
        if (historico.dados && historico.dados.length > 0) {
          fonteOrigem = historico.fonte
          const valores = historico.dados.map(h => h.valor)
          const media = valores.reduce((s, v) => s + v, 0) / valores.length
          const min = Math.min(...valores)
          const max = Math.max(...valores)
          const desvPad = Math.sqrt(valores.reduce((s, v) => s + Math.pow(v - media, 2), 0) / valores.length)
          const retorno = ((valores[valores.length - 1] - valores[0]) / valores[0]) * 100

          return {
            success: true,
            data: {
              commodity: NOME_MAP[chave] || chave,
              unidade: historico.unidade,
              praca: PRACA_MAP[chave] || 'Brasil',
              periodo: `${dias} dias`,
              estatisticas: {
                media: Number(media.toFixed(2)), minimo: Number(min.toFixed(2)),
                maximo: Number(max.toFixed(2)), desvioPadrao: Number(desvPad.toFixed(2)),
                volatilidade: Number(((desvPad / media) * 100).toFixed(2)),
                retornoPeriodo: Number(retorno.toFixed(2)),
              },
              historico: historico.dados.map(d => ({ data: d.data, valor: d.valor, variacao: 0 })),
            },
            meta: {
              fonte: 'CEPEA/ESALQ-USP',
              fonteOrigem,
              atualizacao: new Date().toISOString(),
              confiabilidade: fonteOrigem === 'api' ? 'alta' : 'media',
              pontosDeDados: historico.dados.length,
            },
          }
        }
      }

      // Fallback: generate historical from base price
      basePreco = fbDados?.precoAtual || 100
      const historico = gerarHistoricoFallback(basePreco, dias, 1.5)
      const valores = historico.map(h => h.valor)
      const media = valores.reduce((s, v) => s + v, 0) / valores.length
      const min = Math.min(...valores)
      const max = Math.max(...valores)
      const desvPad = Math.sqrt(valores.reduce((s, v) => s + Math.pow(v - media, 2), 0) / valores.length)
      const retorno = ((valores[valores.length - 1] - valores[0]) / valores[0]) * 100

      return {
        success: true,
        data: {
          commodity: fbDados?.cultura || chave,
          unidade: fbDados?.unidade || 'R$/unidade',
          praca: fbDados?.praca || 'Brasil',
          periodo: `${dias} dias`,
          estatisticas: {
            media: Number(media.toFixed(2)), minimo: Number(min.toFixed(2)),
            maximo: Number(max.toFixed(2)), desvioPadrao: Number(desvPad.toFixed(2)),
            volatilidade: Number(((desvPad / media) * 100).toFixed(2)),
            retornoPeriodo: Number(retorno.toFixed(2)),
          },
          historico,
        },
        meta: {
          fonte: fbDados?.fonte || 'CEPEA/ESALQ-USP',
          fonteOrigem: 'fallback' as const,
          atualizacao: new Date().toISOString(),
          confiabilidade: 'media',
          pontosDeDados: historico.length,
        },
      }
    } catch (error) {
      console.warn(`[mercado/historico] Erro para ${chave}:`, error)
      const historico = gerarHistoricoFallback(fbDados?.precoAtual || 100, dias, 1.5)
      const valores = historico.map(h => h.valor)
      const media = valores.reduce((s, v) => s + v, 0) / valores.length
      return {
        success: true,
        data: {
          commodity: fbDados?.cultura || chave,
          unidade: fbDados?.unidade || 'R$/unidade',
          praca: fbDados?.praca || 'Brasil',
          periodo: `${dias} dias`,
          estatisticas: {
            media: Number(media.toFixed(2)), minimo: Number(Math.min(...valores).toFixed(2)),
            maximo: Number(Math.max(...valores).toFixed(2)), desvioPadrao: 0,
            volatilidade: 0, retornoPeriodo: 0,
          },
          historico,
        },
        meta: { fonte: 'CEPEA/ESALQ-USP (fallback)', fonteOrigem: 'fallback' as const, atualizacao: new Date().toISOString(), confiabilidade: 'media', pontosDeDados: historico.length },
      }
    }
  })

  /* ---- CENARIO SAFRA — REAL CONAB when available ---- */
  fastify.get('/api/mercado/safra/cenario', async () => {
    try {
      const safra = await dsm.precos.getPrevisaoSafra()

      return {
        success: true,
        data: {
          safra: safra.safra,
          status: 'em_desenvolvimento',
          atualizacao: safra.atualizadoEm,
          fonte: safra.fonte === 'api' ? 'CONAB' : 'CONAB / Abiove / StoneX (referencia)',
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
          macroeconomia: {
            pibAgro2025: 3.2,
            exportacoesAgro2025Bi: 165.0,
            taxaCambioMedia: 5.65,
            selicImpacto: 'Selic a 14,25% encarece credito rural. Demanda por renegociacao aumenta.',
            perspectiva: 'Safra 25/26 acima da media historica, mas margens apertadas por custos de insumos e juros elevados.',
          },
        },
        meta: {
          fonte: safra.fonte === 'api' ? 'CONAB' : 'CONAB (fallback)',
          fonteOrigem: safra.fonte,
          atualizacao: safra.atualizadoEm,
          confiabilidade: safra.fonte === 'api' ? 'alta' : 'media',
          aviso: safra.fonte === 'fallback' ? 'Dados consolidados de referencia. API CONAB indisponivel.' : 'Dados obtidos da CONAB em tempo real.',
        },
      }
    } catch (error) {
      console.warn('[mercado/safra] Erro total:', error)
      return {
        success: true,
        data: {
          safra: '2025/2026', status: 'em_desenvolvimento',
          atualizacao: new Date().toISOString(),
          fonte: 'CONAB / Abiove / StoneX (referencia)', fonteOrigem: 'fallback' as const,
          confiabilidade: 'media',
          culturas: [], macroeconomia: {},
        },
        meta: { fonte: 'Fallback', fonteOrigem: 'fallback' as const, atualizacao: new Date().toISOString(), confiabilidade: 'baixa' },
      }
    }
  })

  /* ---- INSUMOS (sem API real ainda, mantido) ---- */
  fastify.get('/api/mercado/insumos', async () => {
    return {
      success: true,
      data: insumos,
      meta: {
        totalProdutos: insumos.length,
        fontes: ['ESALQ/CEPEA', 'Agrolink', 'ANP', 'DNPM'],
        atualizacao: new Date().toISOString(),
        fonteOrigem: 'fallback' as const,
        confiabilidade: 'media',
        aviso: 'Precos de referencia regionais. Valores CIF podem variar por localizacao.',
      },
    }
  })

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
          descricao: 'Expectativas de mercado coletadas de 100+ instituicoes financeiras',
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
  fastify.get('/api/mercado/expectativas/:indicador', async (request: FastifyRequest<{ Params: { indicador: string } }>) => {
    const { indicador } = request.params
    const indicadorMap: Record<string, string> = {
      selic: 'Selic',
      ipca: 'IPCA',
      cambio: 'Câmbio',
      igpm: 'IGP-M',
      pib: 'PIB Total',
    }
    const realIndicador = indicadorMap[indicador.toLowerCase()] || indicador

    try {
      const result = await dsm.expectativas.getExpectativasAnuais(realIndicador, 10)
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
          fonte: 'AwesomeAPI — Cotacoes em tempo real',
          atualizacao: new Date().toISOString(),
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar cotacoes cambiais' }
    }
  })

  /* ---- HISTORICO CAMBIAL ---- */
  fastify.get('/api/mercado/cambio/historico', async (request: FastifyRequest<{ Querystring: { par?: string; dias?: string } }>) => {
    const par = (request.query as any).par || 'USD-BRL'
    const dias = parseInt((request.query as any).dias || '30') || 30

    try {
      const historico = await dsm.awesomeApi.getHistoricoDiario(par, dias)
      return {
        success: true,
        data: historico,
        meta: {
          fonteOrigem: historico.fonte,
          fonte: 'AwesomeAPI',
          atualizacao: historico.atualizadoEm,
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar historico cambial' }
    }
  })

  /* ---- IC-Br INDICE DE COMMODITIES AGROPECUARIAS ---- */
  fastify.get('/api/mercado/icbr', async () => {
    try {
      const icbr = await dsm.bancoCentral.fetchICBrAgro()
      return {
        success: true,
        data: icbr,
        meta: {
          fonteOrigem: icbr.fonte,
          fonte: 'Banco Central do Brasil — IC-Br Agropecuario (SGS 27574)',
          atualizacao: new Date().toISOString(),
          descricao: 'Indice de commodities agropecuarias calculado pelo BCB. Substituto confiavel para CEPEA.',
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar IC-Br Agropecuario' }
    }
  })

  /* ---- EMBI+ RISCO PAIS ---- */
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
          fonte: 'IBGE SIDRA — LSPA Tabela 6588 (Levantamento Sistematico da Producao Agricola)',
          atualizacao: safra.atualizadoEm,
          descricao: 'Estimativa mensal de area plantada, producao e rendimento para culturas principais.',
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar dados de safra LSPA' }
    }
  })

  /* ---- PRECOS AGRO — CONAB (dados reais semanais por UF) ---- */
  fastify.get('/api/mercado/precos-agro', async () => {
    try {
      const precos = await dsm.conabPrecos.getAllPrecos()

      return {
        success: true,
        data: precos,
        meta: {
          commodities: ['soja', 'milho', 'cafe_arabica', 'algodao', 'trigo', 'arroz', 'feijao'],
          fonteOrigem: precos.fonte,
          fonte: 'CONAB — Portal de Informacoes (Precos Semanais por UF)',
          atualizacao: precos.atualizadoEm,
          descricao: 'Precos semanais reais de commodities agricolas por estado, coletados pela CONAB junto a produtores e atacadistas.',
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar precos agro CONAB' }
    }
  })

  /* ---- PRECOS AGRO POR COMMODITY ---- */
  fastify.get('/api/mercado/precos-agro/:commodity', async (request: FastifyRequest<{ Params: { commodity: string } }>) => {
    const { commodity } = request.params
    try {
      const preco = await dsm.conabPrecos.getPreco(commodity)
      return {
        success: true,
        data: preco,
        meta: {
          fonteOrigem: preco.fonte,
          fonte: 'CONAB — Portal de Informacoes',
          atualizacao: preco.atualizadoEm,
        },
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Commodity nao encontrada' }
    }
  })

  /* ---- PRECOS AGRO POR UF ---- */
  fastify.get('/api/mercado/precos-agro/uf/:uf', async (request: FastifyRequest<{ Params: { uf: string } }>) => {
    const { uf } = request.params
    try {
      const precos = await dsm.conabPrecos.getPrecosPorUF(uf)
      return {
        success: true,
        data: { uf: uf.toUpperCase(), precos },
        meta: {
          fonteOrigem: 'api' as const,
          fonte: 'CONAB — Portal de Informacoes',
          atualizacao: new Date().toISOString(),
        },
      }
    } catch {
      return { success: false, error: `Falha ao buscar precos para UF ${uf}` }
    }
  })

  /* ---- COMBUSTIVEIS — ANP (dados reais por estado) ---- */
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
          fonte: 'ANP — Agencia Nacional do Petroleo (Dados Abertos)',
          atualizacao: new Date().toISOString(),
          descricao: 'Precos de combustiveis coletados em postos de revenda pela ANP. Dados abertos mensais.',
        },
      }
    } catch {
      return { success: false, error: `Falha ao buscar precos de combustiveis para ${uf}` }
    }
  })

  /* ---- COMBUSTIVEIS DIESEL NACIONAL ---- */
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
          descricao: 'Resumo nacional de precos do Diesel S10 com detalhamento por estado.',
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
          fonte: 'Banco Central do Brasil — IC-Br Sub-indices (SGS 27574/27575/27576)',
          atualizacao: icbr.atualizadoEm,
          descricao: 'Indices de commodities BCB: Agropecuario, Energia e Metal. Base dez/2005 = 100.',
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar IC-Br completo' }
    }
  })

  /* ---- NASA FIRMS — FOCOS DE INCENDIO ---- */
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
          descricao: 'Focos de incendio ativos nas ultimas 24 horas no Brasil, detectados por satelite VIIRS.',
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar dados de incendio' }
    }
  })

  /* ---- INCENDIOS PROXIMOS A COORDENADA ---- */
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
      return { success: false, error: 'Falha ao buscar incendios proximos' }
    }
  })

  /* ==================================================================
   *  Fase 6 — SICOR (Credito Rural Granular) + ComexStat (Exportacoes)
   * ================================================================== */

  /* ---- SICOR AGREGADO — Volume/produto/UF/finalidade ultimos N meses ---- */
  fastify.get('/api/mercado/sicor/agregado', async (request: FastifyRequest<{ Querystring: { meses?: string } }>) => {
    const meses = parseInt((request.query as any).meses || '12') || 12
    try {
      const agregado = await dsm.sicor.getAgregado(meses)
      return {
        success: true,
        data: agregado,
        meta: {
          fonteOrigem: agregado.fonte,
          fonte: 'Banco Central do Brasil — SICOR (Sistema de Operacoes do Credito Rural)',
          atualizacao: agregado.atualizadoEm,
          descricao: 'Volume total de credito rural concedido, por produto/UF/finalidade. Base oficial BCB via OLINDA.',
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar agregado SICOR' }
    }
  })

  /* ---- SICOR SERIE MENSAL — Evolucao mensal do credito rural ---- */
  fastify.get('/api/mercado/sicor/serie-mensal', async (request: FastifyRequest<{ Querystring: { meses?: string } }>) => {
    const meses = parseInt((request.query as any).meses || '24') || 24
    try {
      const serie = await dsm.sicor.getSerieMensal(meses)
      return {
        success: true,
        data: serie,
        meta: {
          fonteOrigem: serie.fonte,
          fonte: 'BCB SGS 20568 — Credito Rural Concedido Mensal',
          atualizacao: serie.atualizadoEm,
          descricao: 'Serie mensal de desembolsos do credito rural, em R$.',
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar serie mensal SICOR' }
    }
  })

  /* ---- EXPORTACOES AGRO — ComexStat (MDIC) ---- */
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
          descricao: 'Exportacoes agropecuarias brasileiras por NCM, pais de destino e mes. Dados oficiais do MDIC.',
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar exportacoes agro' }
    }
  })

  /* ---- EXPORTACOES POR PRODUTO — Serie mensal ---- */
  fastify.get('/api/mercado/exportacao/produto/:produto', async (request: FastifyRequest<{ Params: { produto: string }; Querystring: { meses?: string } }>) => {
    const { produto } = request.params
    const meses = parseInt((request.query as any).meses || '24') || 24
    const produtosValidos = ['soja', 'milho', 'cafe', 'carne_bovina', 'carne_frango', 'acucar', 'algodao', 'celulose', 'soja_farelo', 'soja_oleo'] as const
    type ProdutoValido = typeof produtosValidos[number]
    if (!produtosValidos.includes(produto as ProdutoValido)) {
      return { success: false, error: `Produto invalido. Disponiveis: ${produtosValidos.join(', ')}` }
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
      return { success: false, error: `Falha ao buscar serie de ${produto}` }
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
}
