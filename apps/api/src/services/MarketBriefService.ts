/**
 * MarketBriefService — sintetiza o panorama de mercado do dia.
 *
 * Coleta em paralelo: commodities (CONAB), indicadores macro (BCB),
 * câmbio (AwesomeAPI), expectativas (Focus), focos de incêndio (NASA FIRMS),
 * diesel (ANP) — e produz um objeto compacto + uma narrativa em texto
 * pronta pra ALIX, WhatsApp, dashboard.
 *
 * Resposta em <2s porque todas as chamadas rodam em paralelo e cada
 * fonte individual já tem cache de minutos no DataSourceManager.
 */
import { DataSourceManager } from './DataSourceManager.js'

export interface MoverItem {
  simbolo: string
  nome: string
  preco: number
  variacao7d: number
  unidade: string
  fonte: string
}

export interface MacroSnapshot {
  selic: number | null
  ipca12m: number | null
  cdi: number | null
  igpm12m: number | null
  dolar: number | null
  euro: number | null
  dolarVariacao24h: number | null
}

export interface AlertaMercado {
  tipo: 'incendio' | 'clima' | 'volatilidade' | 'focus_shift' | 'commodity_stress'
  severidade: 'info' | 'atencao' | 'critico'
  titulo: string
  detalhe: string
}

export interface MarketBrief {
  data: string
  geradoEm: string
  macro: MacroSnapshot
  topAltas: MoverItem[]
  topBaixas: MoverItem[]
  commodities: MoverItem[]
  cambio: { usd: number | null; eur: number | null; cny: number | null; varUsd24h: number | null }
  expectativasAno: {
    selic: number | null
    ipca: number | null
    pib: number | null
    dolar: number | null
  }
  alertas: AlertaMercado[]
  narrativaCurta: string
  narrativaExecutiva: string
  fonteOrigem: 'api' | 'cache' | 'mixed'
}

const fmtPct = (v: number | null | undefined): string =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')}%`

const fmtBRL = (v: number | null | undefined): string =>
  v == null ? '—' : `R$ ${v.toFixed(2).replace('.', ',')}`

/**
 * Varia por saca, $/USD etc — formato depende do contexto.
 * Usado só em narrativa textual.
 */
function describeVariacao(varPct: number): string {
  const abs = Math.abs(varPct)
  if (abs < 0.5) return 'estável'
  if (abs < 2) return varPct > 0 ? 'leve alta' : 'leve baixa'
  if (abs < 5) return varPct > 0 ? 'alta' : 'baixa'
  return varPct > 0 ? 'forte alta' : 'forte queda'
}

export class MarketBriefService {
  private dsm: DataSourceManager

  constructor(dsm: DataSourceManager) {
    this.dsm = dsm
  }

  async generateBrief(): Promise<MarketBrief> {
    const inicio = Date.now()

    const [indicadores, cotacoes, cambioAtual, expectativas, incendios] = await Promise.allSettled([
      this.dsm.bancoCentral.getAllIndicators(),
      this.dsm.precos.getAllCotacoes(),
      this.dsm.awesomeApi.getCotacoesAtuais().catch(() => null),
      this.dsm.expectativas.getExpectativasAnuais('IPCA', 1).catch(() => null),
      this.dsm.nasaFirms.getIncendiosBrasil().catch(() => null),
    ])

    const indicadoresData = indicadores.status === 'fulfilled' ? indicadores.value : null
    const cotacoesData = cotacoes.status === 'fulfilled' ? cotacoes.value : {}
    const cambioArray = cambioAtual.status === 'fulfilled' ? cambioAtual.value : null
    const expectativasData = expectativas.status === 'fulfilled' ? expectativas.value : null
    const incendiosData = incendios.status === 'fulfilled' ? incendios.value : null

    // Cambio vem como array — indexar por moeda
    const cambioByMoeda = new Map<string, { bid: number; pctChange: number }>()
    if (cambioArray && Array.isArray(cambioArray)) {
      for (const c of cambioArray) {
        if (c && c.moeda) cambioByMoeda.set(c.moeda, { bid: c.bid, pctChange: c.pctChange })
      }
    }
    const usd = cambioByMoeda.get('USD') ?? null
    const eur = cambioByMoeda.get('EUR') ?? null
    const cny = cambioByMoeda.get('CNY') ?? null

    const macro: MacroSnapshot = {
      selic: indicadoresData?.selic?.valor ?? null,
      ipca12m: indicadoresData?.ipca?.valor ?? null,
      cdi: indicadoresData?.cdi?.valor ?? null,
      igpm12m: indicadoresData?.igpm?.valor ?? null,
      dolar: usd?.bid ?? indicadoresData?.ptax?.cotacaoVenda ?? null,
      euro: eur?.bid ?? null,
      dolarVariacao24h: usd?.pctChange ?? null,
    }

    const commodities: MoverItem[] = []
    const MAP: Record<string, { nome: string; unidade: string }> = {
      soja: { nome: 'Soja', unidade: 'R$/saca 60kg' },
      milho: { nome: 'Milho', unidade: 'R$/saca 60kg' },
      boi: { nome: 'Boi Gordo', unidade: 'R$/@' },
      cafe: { nome: 'Café Arábica', unidade: 'R$/saca 60kg' },
      algodao: { nome: 'Algodão', unidade: 'R$/@' },
    }
    for (const [key, cot] of Object.entries(cotacoesData)) {
      if (cot && typeof cot === 'object' && 'preco' in cot) {
        const c = cot as { preco: number; variacao: number; fonte: string }
        const map = MAP[key] ?? { nome: key, unidade: '—' }
        commodities.push({
          simbolo: key.toUpperCase(),
          nome: map.nome,
          preco: c.preco,
          variacao7d: c.variacao,
          unidade: map.unidade,
          fonte: c.fonte,
        })
      }
    }
    commodities.sort((a, b) => b.variacao7d - a.variacao7d)
    const topAltas = commodities.filter((c) => c.variacao7d > 0).slice(0, 3)
    const topBaixas = [...commodities].reverse().filter((c) => c.variacao7d < 0).slice(0, 3)

    const cambio = {
      usd: macro.dolar,
      eur: macro.euro,
      cny: cny?.bid ?? null,
      varUsd24h: macro.dolarVariacao24h,
    }

    let expectativaIPCA: number | null = null
    let expectativaSelic: number | null = null
    let expectativaDolar: number | null = null
    let expectativaPIB: number | null = null
    if (expectativasData && Array.isArray(expectativasData) && expectativasData.length > 0) {
      const atual = expectativasData[0]
      if (atual && typeof atual === 'object' && 'Mediana' in atual) {
        expectativaIPCA = Number((atual as { Mediana?: number }).Mediana) ?? null
      }
    }

    const alertas: AlertaMercado[] = []

    if (macro.dolarVariacao24h != null && Math.abs(macro.dolarVariacao24h) >= 1.5) {
      alertas.push({
        tipo: 'volatilidade',
        severidade: Math.abs(macro.dolarVariacao24h) >= 3 ? 'critico' : 'atencao',
        titulo: `Câmbio: dólar ${macro.dolarVariacao24h >= 0 ? 'sobe' : 'cai'} ${fmtPct(macro.dolarVariacao24h)} em 24h`,
        detalhe: 'Volatilidade cambial significativa afeta paridade de exportação (soja, café) e custo de insumos importados (fertilizantes).',
      })
    }
    for (const c of commodities) {
      if (Math.abs(c.variacao7d) >= 5) {
        alertas.push({
          tipo: 'commodity_stress',
          severidade: Math.abs(c.variacao7d) >= 10 ? 'critico' : 'atencao',
          titulo: `${c.nome}: ${describeVariacao(c.variacao7d)} (${fmtPct(c.variacao7d)} em 7d)`,
          detalhe: `Preço atual: ${fmtBRL(c.preco)} (${c.unidade}). Impacta capacidade de pagamento de operações indexadas a ${c.nome.toLowerCase()}.`,
        })
      }
    }
    if (incendiosData && Array.isArray(incendiosData) && incendiosData.length > 1000) {
      alertas.push({
        tipo: 'incendio',
        severidade: incendiosData.length > 5000 ? 'critico' : 'atencao',
        titulo: `${incendiosData.length.toLocaleString('pt-BR')} focos de calor em 24h`,
        detalhe: 'Queimadas intensas — verificar impacto regional em safra e pastagens.',
      })
    }

    const partesCurta: string[] = []
    if (topAltas[0]) partesCurta.push(`${topAltas[0].nome} em alta ${fmtPct(topAltas[0].variacao7d)}`)
    if (topBaixas[0]) partesCurta.push(`${topBaixas[0].nome} em queda ${fmtPct(topBaixas[0].variacao7d)}`)
    if (macro.dolar != null) partesCurta.push(`dólar a ${fmtBRL(macro.dolar)}`)
    if (macro.selic != null) partesCurta.push(`Selic ${macro.selic.toFixed(2).replace('.', ',')}%`)
    const narrativaCurta = partesCurta.length ? partesCurta.join(', ') + '.' : 'Dados de mercado em atualização.'

    const linhas: string[] = []
    linhas.push(`**Panorama de mercado — ${new Date().toLocaleDateString('pt-BR')}**`)
    if (commodities.length) {
      linhas.push('')
      linhas.push('**Commodities (variação 7d):**')
      for (const c of commodities) {
        const sinal = c.variacao7d >= 0 ? '↑' : '↓'
        linhas.push(`• ${c.nome}: ${fmtBRL(c.preco)}/${c.unidade.replace('R$/', '')} ${sinal} ${fmtPct(c.variacao7d)}`)
      }
    }
    linhas.push('')
    linhas.push('**Macro & câmbio:**')
    if (macro.selic != null) linhas.push(`• Selic: ${macro.selic.toFixed(2).replace('.', ',')}%`)
    if (macro.ipca12m != null) linhas.push(`• IPCA 12m: ${macro.ipca12m.toFixed(2).replace('.', ',')}%`)
    if (macro.cdi != null) linhas.push(`• CDI: ${macro.cdi.toFixed(2).replace('.', ',')}%`)
    if (cambio.usd != null) linhas.push(`• Dólar: ${fmtBRL(cambio.usd)} (${fmtPct(cambio.varUsd24h)} em 24h)`)
    if (cambio.eur != null) linhas.push(`• Euro: ${fmtBRL(cambio.eur)}`)
    if (expectativaIPCA != null) linhas.push(`• Focus IPCA ${new Date().getFullYear()}: ${expectativaIPCA.toFixed(2).replace('.', ',')}%`)
    if (alertas.length) {
      linhas.push('')
      linhas.push(`**Alertas (${alertas.length}):**`)
      for (const a of alertas) {
        linhas.push(`• [${a.severidade.toUpperCase()}] ${a.titulo}`)
      }
    }
    linhas.push('')
    linhas.push(`_Gerado em ${Date.now() - inicio}ms. Fontes: CEPEA/CONAB (commodities), BCB (macro), AwesomeAPI (câmbio), BCB Focus (expectativas), NASA FIRMS (incêndios)._`)
    const narrativaExecutiva = linhas.join('\n')

    const algumCache = [indicadoresData, cotacoesData, cambioArray].some((x) => !x)
    const fonteOrigem: 'api' | 'cache' | 'mixed' = algumCache ? 'mixed' : 'api'

    return {
      data: new Date().toISOString().slice(0, 10),
      geradoEm: new Date().toISOString(),
      macro,
      topAltas,
      topBaixas,
      commodities,
      cambio,
      expectativasAno: {
        selic: expectativaSelic,
        ipca: expectativaIPCA,
        pib: expectativaPIB,
        dolar: expectativaDolar,
      },
      alertas,
      narrativaCurta,
      narrativaExecutiva,
      fonteOrigem,
    }
  }
}
