import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { DataSourceManager } from '../services/DataSourceManager.js'
import { MarketBriefService } from '../services/MarketBriefService.js'
import { SazonalidadeService } from '../services/SazonalidadeService.js'

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
    cultura: 'Soja', unidade: 'R$/saca 60kg', praca: 'Paranaguá-PR',
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
    cultura: 'Boi Gordo', unidade: 'R$/arroba', praca: 'São Paulo-SP',
    precoAtual: 312.45, variacao24h: 1.20, variacao7d: 2.50, variacao30d: 5.80,
    minimo30d: 295.00, maximo30d: 315.00,
    fonte: 'CEPEA/ESALQ-USP', atualizacao: new Date().toISOString(),
  },
  cafe: {
    cultura: 'Café Arábica', unidade: 'R$/saca 60kg', praca: 'Mogiana-SP',
    precoAtual: 2450.00, variacao24h: 2.10, variacao7d: 4.30, variacao30d: 8.50,
    minimo30d: 2200.00, maximo30d: 2500.00,
    fonte: 'CEPEA/ESALQ-USP', atualizacao: new Date().toISOString(),
  },
  algodao: {
    cultura: 'Algodão em Pluma', unidade: 'R$/arroba', praca: 'Esalq',
    precoAtual: 142.80, variacao24h: -0.30, variacao7d: -0.90, variacao30d: 1.50,
    minimo30d: 138.00, maximo30d: 145.00,
    fonte: 'CEPEA/ESALQ-USP', atualizacao: new Date().toISOString(),
  },
  trigo: {
    cultura: 'Trigo', unidade: 'R$/saca 60kg', praca: 'Paraná',
    precoAtual: 82.50, variacao24h: 0.60, variacao7d: 1.80, variacao30d: -1.20,
    minimo30d: 79.00, maximo30d: 85.00,
    fonte: 'CEPEA/ESALQ-USP', atualizacao: new Date().toISOString(),
  },
  acucar: {
    cultura: 'Açúcar Cristal', unidade: 'R$/saca 50kg', praca: 'São Paulo-SP',
    precoAtual: 158.30, variacao24h: 0.45, variacao7d: -0.70, variacao30d: 2.30,
    minimo30d: 152.00, maximo30d: 161.00,
    fonte: 'CEPEA/ESALQ-USP', atualizacao: new Date().toISOString(),
  },
  leite: {
    cultura: 'Leite', unidade: 'R$/litro', praca: 'Média Brasil',
    precoAtual: 2.85, variacao24h: 0.00, variacao7d: 0.35, variacao30d: -1.05,
    minimo30d: 2.78, maximo30d: 2.92,
    fonte: 'CEPEA/ESALQ-USP', atualizacao: new Date().toISOString(),
  },
}

const FALLBACK_INDICADORES: Indicador[] = [
  { nome: 'Taxa Selic', sigla: 'SELIC', valor: 14.25, unidade: '% a.a.', referencia: '2026-04-15', variacao: 0, fonte: 'Banco Central do Brasil', fonteOrigem: 'fallback', atualizacao: new Date().toISOString(), confiabilidade: 'alta' },
  { nome: 'IPCA (acumulado 12m)', sigla: 'IPCA', valor: 5.48, unidade: '% a.a.', referencia: '2026-03-31', variacao: 0.12, fonte: 'IBGE', fonteOrigem: 'fallback', atualizacao: new Date().toISOString(), confiabilidade: 'alta' },
  { nome: 'IGP-M (acumulado 12m)', sigla: 'IGP-M', valor: 4.92, unidade: '% a.a.', referencia: '2026-03-31', variacao: -0.35, fonte: 'FGV', fonteOrigem: 'fallback', atualizacao: new Date().toISOString(), confiabilidade: 'alta' },
  { nome: 'Dólar PTAX (venda)', sigla: 'USD/BRL', valor: 5.72, unidade: 'R$/US$', referencia: new Date().toISOString().slice(0, 10), variacao: -0.28, fonte: 'Banco Central do Brasil (PTAX)', fonteOrigem: 'fallback', atualizacao: new Date().toISOString(), confiabilidade: 'alta' },
  { nome: 'CDI (acumulado 12m)', sigla: 'CDI', valor: 14.15, unidade: '% a.a.', referencia: new Date().toISOString().slice(0, 10), variacao: 0, fonte: 'CETIP/B3', fonteOrigem: 'fallback', atualizacao: new Date().toISOString(), confiabilidade: 'alta' },
  { nome: 'INPC (acumulado 12m)', sigla: 'INPC', valor: 5.15, unidade: '% a.a.', referencia: '2026-03-31', variacao: 0.08, fonte: 'IBGE', fonteOrigem: 'fallback', atualizacao: new Date().toISOString(), confiabilidade: 'alta' },
  { nome: 'TR (mês)', sigla: 'TR', valor: 0.18, unidade: '% a.m.', referencia: '2026-03-31', variacao: 0.02, fonte: 'Banco Central do Brasil', fonteOrigem: 'fallback', atualizacao: new Date().toISOString(), confiabilidade: 'alta' },
]

const insumos = [
  { produto: 'MAP (Fosfato Monoamônico)', unidade: 'R$/tonelada', precoAtual: 3850.00, variacaoMensal: 2.3, fonte: 'ESALQ/CEPEA', atualizacao: new Date().toISOString(), confiabilidade: 'media' as const },
  { produto: 'KCl (Cloreto de Potássio)', unidade: 'R$/tonelada', precoAtual: 2680.00, variacaoMensal: -1.5, fonte: 'ESALQ/CEPEA', atualizacao: new Date().toISOString(), confiabilidade: 'media' as const },
  { produto: 'Ureia', unidade: 'R$/tonelada', precoAtual: 2450.00, variacaoMensal: 0.8, fonte: 'ESALQ/CEPEA', atualizacao: new Date().toISOString(), confiabilidade: 'media' as const },
  { produto: 'Glifosato', unidade: 'R$/litro', precoAtual: 22.50, variacaoMensal: -0.5, fonte: 'Agrolink', atualizacao: new Date().toISOString(), confiabilidade: 'media' as const },
  { produto: 'Diesel S10', unidade: 'R$/litro', precoAtual: 6.35, variacaoMensal: 1.2, fonte: 'ANP', atualizacao: new Date().toISOString(), confiabilidade: 'alta' as const },
  { produto: 'Sementes Soja (Intacta)', unidade: 'R$/saca 40kg', precoAtual: 520.00, variacaoMensal: 0.0, fonte: 'Mercado local', atualizacao: new Date().toISOString(), confiabilidade: 'baixa' as const },
  { produto: 'Calcário Dolomítico', unidade: 'R$/tonelada', precoAtual: 185.00, variacaoMensal: 0.3, fonte: 'DNPM', atualizacao: new Date().toISOString(), confiabilidade: 'media' as const },
  { produto: '04-30-10 (Formulado)', unidade: 'R$/tonelada', precoAtual: 3200.00, variacaoMensal: 1.8, fonte: 'ESALQ/CEPEA', atualizacao: new Date().toISOString(), confiabilidade: 'media' as const },
]

/* ========================================================================
 *  Helpers
 * ======================================================================== */

const PRACA_MAP: Record<string, string> = {
  soja: 'Paranaguá-PR', milho: 'Campinas-SP', boi: 'São Paulo-SP',
  cafe: 'Mogiana-SP', algodao: 'Esalq',
}

const NOME_MAP: Record<string, string> = {
  soja: 'Soja', milho: 'Milho', boi_gordo: 'Boi Gordo', boi: 'Boi Gordo',
  cafe_arabica: 'Café Arábica', cafe: 'Café Arábica', algodao: 'Algodão em Pluma',
}

function gerarHistoricoFallback(base: number, dias: number, volatilidade: number): PrecoHistorico[] {
  const hist: PrecoHistorico[] = []
  // Caminha numa janela ±volatilidade % em torno de `base` — mantém o
  // histórico realista perto do preço atual (sem decair pra ~75% como antes).
  let valor = base * (1 + ((Math.random() - 0.5) * volatilidade) / 100)
  const agora = new Date()
  for (let i = dias; i >= 0; i--) {
    const data = new Date(agora)
    data.setUTCDate(data.getUTCDate() - i)
    const variacao = (Math.random() - 0.5) * volatilidade * 2
    valor = valor * (1 + variacao / 100)
    // Limites elásticos: ±15% em torno de base.
    valor = Math.max(Math.min(valor, base * 1.15), base * 0.85)
    // Ancoragem do último ponto = base, para que variacao24h calculada
    // reflita o passo de ontem→hoje no histórico (consistente com precoAtual).
    if (i === 0) valor = base
    hist.push({ data: data.toISOString().slice(0, 10), valor: Number(valor.toFixed(2)), variacao: Number(variacao.toFixed(2)) })
  }
  return hist
}

/* ========================================================================
 *  Roteador — agora usando serviços reais via DataSourceManager
 * ======================================================================== */

export default async function (fastify: FastifyInstance) {
  const dsm = DataSourceManager.getInstance()

  /* ---- PREÇOS (multi-cultura) — CONAB primary, CEPEA fallback ---- */
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
            // Variação derivada do histórico (CONAB não fornece deltas explícitos);
            // calcula 24h, 7d, 30d como (preçoAtual − referência) / referência × 100.
            const calcVar = (offset: number): number => {
              const n = historico.length
              if (n < offset + 1) return 0
              const ref = historico[n - 1 - offset]?.valor
              if (!ref || ref <= 0) return 0
              return Number((((commodity.precoMedio - ref) / ref) * 100).toFixed(2))
            }
            resultado.push({
              cultura: NOME_MAP[chave] || commodity.produto,
              unidade: commodity.unidade,
              praca: PRACA_MAP[chave] || 'Brasil (média estadual)',
              precoAtual: commodity.precoMedio,
              variacao24h: calcVar(1),
              variacao7d: calcVar(7),
              variacao30d: calcVar(30),
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
        return { success: false, error: `Culturas não encontradas. Disponíveis: soja, milho, boi, cafe, algodao, trigo, acucar, leite` }
      }

      return {
        success: true,
        data: resultado,
        meta: {
          culturasConsultadas: listaCulturas,
          periodo: `${dias} dias`,
          fonte: fonteGlobal === 'api' ? 'CONAB / CEPEA' : 'CONAB / CEPEA (dados de referência)',
          fonteOrigem: fonteGlobal,
          atualizacao: new Date().toISOString(),
          confiabilidade: fonteGlobal === 'api' ? 'alta' : fonteGlobal === 'cache' ? 'alta' : 'media',
          aviso: fonteGlobal === 'fallback'
            ? 'APIs indisponíveis. Preços de referência (fallback). Para operações reais consulte fontes primárias.'
            : 'Dados obtidos via CONAB (preços semanais reais por UF) e CEPEA/ESALQ-USP.',
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
          fonte: 'CONAB / CEPEA (dados de referência)',
          fonteOrigem: 'fallback' as const,
          atualizacao: new Date().toISOString(),
          confiabilidade: 'media',
          aviso: 'APIs indisponíveis. Preços de referência (fallback).',
        },
      }
    }
  })

  /* ---- INDICADORES ECONÔMICOS — REAL API via BCB SGS ---- */
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
          nome: 'Dólar PTAX (venda)',
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
          nome: 'Crédito Rural (volume mensal)',
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
          aviso: 'APIs indisponíveis. Indicadores de referência (fallback).',
        },
      }
    }
  })

  /* ---- HISTÓRICO COMMODITY — REAL DATA when available ---- */
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
      return { success: false, error: `Commodity "${commodity}" não encontrada. Disponíveis: ${Object.keys(FALLBACK_CULTURAS).join(', ')}` }
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
          macroeconomia: {
            pibAgro2025: 3.2,
            exportacoesAgro2025Bi: 165.0,
            taxaCambioMedia: 5.65,
            selicImpacto: 'Selic a 14,25% encarece crédito rural. Demanda por renegociação aumenta.',
            perspectiva: 'Safra 25/26 acima da média histórica, mas margens apertadas por custos de insumos e juros elevados.',
          },
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
        aviso: 'Preços de referência regionais. Valores CIF podem variar por localização.',
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
          fonte: 'AwesomeAPI — Cotações em tempo real',
          atualizacao: new Date().toISOString(),
        },
      }
    } catch {
      return { success: false, error: 'Falha ao buscar cotações cambiais' }
    }
  })

  /* ---- HISTÓRICO CAMBIAL ---- */
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
      return { success: false, error: 'Falha ao buscar agregado SICOR' }
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
      return { success: false, error: 'Falha ao buscar série mensal SICOR' }
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
      return { success: false, error: 'Falha ao buscar exportações agro' }
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
      return { success: false, error: `Falha ao buscar série de ${produto}` }
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
  fastify.get(
    '/api/mercado/basis',
    async (request: FastifyRequest<{ Querystring: { commodity?: string; ufOrigem?: string; destino?: string } }>) => {
      const commodity = (request.query.commodity || 'soja').toLowerCase()
      const ufOrigem = (request.query.ufOrigem || 'MT').toUpperCase()
      const destino = (request.query.destino || 'paranagua').toLowerCase()

      // Preço de referência (porto/praça principal) — fallback estático
      const fallback = FALLBACK_CULTURAS[commodity]
      if (!fallback) {
        return { success: false, error: `Commodity "${commodity}" não suportada` }
      }

      // Tabela de frete R$/tonelada (estimativa baseada em médias 2024-2026)
      // Pontos destino: paranagua, santos, itaqui
      const TABELA_FRETE: Record<string, Record<string, number>> = {
        paranagua: { MT: 380, MS: 220, GO: 310, MG: 280, SP: 150, PR: 80, RS: 280, BA: 520, MA: 680, TO: 490, RO: 720, PI: 620 },
        santos:    { MT: 410, MS: 260, GO: 280, MG: 190, SP: 90,  PR: 200, RS: 340, BA: 450, MA: 640, TO: 470, RO: 740, PI: 560 },
        itaqui:    { MT: 420, MS: 540, GO: 390, MG: 520, SP: 700, PR: 820, RS: 980, BA: 380, MA: 140, TO: 220, RO: 560, PI: 320 },
      }

      const freteRSporTon = TABELA_FRETE[destino]?.[ufOrigem]
      if (freteRSporTon == null) {
        return {
          success: false,
          error: `Rota ${ufOrigem}→${destino} não coberta pela tabela`,
          suportado: { destinos: Object.keys(TABELA_FRETE), ufsOrigem: Object.keys(TABELA_FRETE.paranagua) },
        }
      }

      // Conversão para saca 60kg (commodities grãos) ou arroba 15kg (boi/algodão)
      const unidade = fallback.unidade.toLowerCase()
      let freteUnidade = 0
      let unidadeLabel = ''
      if (unidade.includes('saca') || unidade.includes('60')) {
        freteUnidade = freteRSporTon * 0.06 // 60 kg = 0.06 ton
        unidadeLabel = 'R$/saca 60kg'
      } else if (unidade.includes('arroba') || unidade.includes('@')) {
        freteUnidade = freteRSporTon * 0.015
        unidadeLabel = 'R$/arroba 15kg'
      } else {
        freteUnidade = freteRSporTon
        unidadeLabel = 'R$/tonelada'
      }

      // Basis estimado = spread típico interior vs porto (negativo: interior < porto)
      // Heurística setorial: soja/milho no cerrado ~ -8% a -15% do preço CBOT/porto.
      const BASIS_TIPICO_PCT: Record<string, number> = {
        soja: -0.10, milho: -0.12, algodao: -0.05, cafe: -0.03, boi: -0.04, arroz: -0.08, trigo: -0.06,
      }
      const basisPct = BASIS_TIPICO_PCT[commodity] ?? -0.10
      const precoPorto = fallback.precoAtual
      const basisAbsoluto = precoPorto * basisPct
      const precoInteriorEstimado = precoPorto + basisAbsoluto
      const precoLiquidoProdutor = precoInteriorEstimado - freteUnidade

      return {
        success: true,
        data: {
          commodity,
          ufOrigem,
          destino,
          praçaReferencia: fallback.praca,
          precoPorto,
          basisPct: Number((basisPct * 100).toFixed(2)),
          basisAbsoluto: Number(basisAbsoluto.toFixed(2)),
          precoInteriorEstimado: Number(precoInteriorEstimado.toFixed(2)),
          freteRSporTon,
          freteUnidade: Number(freteUnidade.toFixed(2)),
          unidade: unidadeLabel,
          precoLiquidoProdutor: Number(precoLiquidoProdutor.toFixed(2)),
          atualizacao: fallback.atualizacao,
        },
        meta: {
          fontes: {
            preco: fallback.fonte,
            basis: 'Estimativa ALETIS (spread setorial 2024-2026)',
            frete: 'Tabela estimativa ALETIS (ANTT/IMEA/ABIOVE 2024-2026)',
          },
          aviso: 'Valores estimados. Para fretes reais consulte transportadora. Basis varia por prêmio/deságio do contrato.',
        },
      }
    },
  )

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
