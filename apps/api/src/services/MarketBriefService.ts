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
import type { DataSourceManager } from './DataSourceManager.js'

export interface MarketPrice {
  cultura: string
  chave: string
  unidade: string
  praca: string
  precoAtual: number
  variacao24h: number | null
  variacao7d: number | null
  variacao30d: number | null
  minimo30d: number | null
  maximo30d: number | null
  historico: { data: string; valor: number; fonte: string; praca: string; unidade: string }[]
  fonte: string
  fonteOrigem: 'api' | 'cache' | 'fallback'
  atualizacao: string
  referencia: string
  frequencia: 'semanal' | 'diaria'
  estado: 'disponivel' | 'atrasado'
  idadeSegundos: number
}

// Mesma seleção e mesma semântica para ticker, gráficos, briefing e relatórios.
export async function collectMarketPrices(dsm: DataSourceManager, keys = ['soja', 'milho', 'boi', 'cafe', 'algodao', 'trigo', 'acucar', 'leite'], days = 30): Promise<MarketPrice[]> {
  const [conab, cepea] = await Promise.allSettled([dsm.conabPrecos.getAllPrecos(), dsm.precos.getAllCotacoes()]);
  const conabKeys: Record<string, string> = { soja: 'soja', milho: 'milho', cafe: 'cafe_arabica', algodao: 'algodao', trigo: 'trigo', arroz: 'arroz', feijao: 'feijao' };
  const names: Record<string, string> = { soja: 'Soja', milho: 'Milho', cafe: 'Café Arábica', algodao: 'Algodão em Pluma', boi: 'Boi Gordo', trigo: 'Trigo' };
  const result: MarketPrice[] = [];
  for (const key of keys) {
    const data = conab.status === 'fulfilled' ? conab.value : null;
    const candidate = data?.[conabKeys[key] as keyof typeof data];
    const c = candidate && typeof candidate === 'object' && 'precoMedio' in candidate && candidate.fonte !== 'fallback' && candidate.precoMedio > 0 ? candidate : null;
    const p = cepea.status === 'fulfilled' ? cepea.value[key] : null;
    if (!c && (!p || p.fonte === 'fallback' || p.preco <= 0)) continue;
    const current = c?.precoMedio ?? p!.preco;
    const date = c?.atualizadoEm ?? p!.data;
    if (!Number.isFinite(Date.parse(date))) continue;
    const unit = c?.unidade ?? p!.unidade;
    const place = c ? `Média das UFs: ${c.estados.map(e => e.uf).sort().join(', ')}` : (p!.descricao || 'Praça não informada pelo indicador');
    const provider = c ? 'CONAB' : 'CEPEA/ESALQ';
    const history = c ? (c.historico || []).map(h => ({ ...h, valor: Number(h.valor) })) : (await dsm.precos.getHistoricoCommodity(key, Math.max(days, 31))).dados.map(h => ({ ...h, fonte: provider, praca: place, unidade: unit }));
    const comparable = history.filter(h => h.praca === place && h.unidade === unit && h.fonte === provider && Number.isFinite(h.valor) && h.valor > 0 && h.data <= date).sort((a, b) => a.data.localeCompare(b.data));
    const change = (offset: number) => {
      const target = new Date(Date.parse(date) - offset * 86400000).toISOString().slice(0, 10);
      const ref = comparable.find(h => h.data === target);
      return ref ? Number(((current / ref.valor - 1) * 100).toFixed(2)) : null;
    };
    const in30d = comparable.filter(h => Date.parse(h.data) >= Date.parse(date) - 30 * 86400000);
    const complete30d = in30d.length >= 2 && change(30) != null;
    const age = Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 1000));
    result.push({ chave: key, cultura: names[key] || c?.produto || key, unidade: unit, praca: place, precoAtual: current,
      variacao24h: c ? null : change(1), variacao7d: change(7), variacao30d: change(30),
      minimo30d: complete30d ? Math.min(...in30d.map(h => h.valor)) : null, maximo30d: complete30d ? Math.max(...in30d.map(h => h.valor)) : null,
      historico: comparable.filter(h => Date.parse(h.data) >= Date.now() - days * 86400000), fonte: provider, fonteOrigem: c?.fonte ?? p!.fonte,
      atualizacao: date, referencia: c?.semana ?? date, frequencia: c ? 'semanal' : 'diaria', idadeSegundos: age,
      estado: (c?.estado ?? p?.estado) === 'atrasado' || age > (c ? 14 : 4) * 86400 ? 'atrasado' : 'disponivel' });
  }
  return result;
}

/** Acumulação composta de 12 meses consecutivos publicados, nunca da taxa mensal isolada. */
export function accumulated12Months(indicator: { fonte: string; historico?: { data: string; valor: number }[] } | null | undefined): number | null {
  if (!indicator || indicator.fonte === 'fallback') return null;
  const byMonth = new Map((indicator.historico || []).filter(p => Number.isFinite(p.valor)).map(p => [p.data.slice(0, 7), p.valor]));
  const months = [...byMonth.keys()].sort().slice(-12);
  if (months.length !== 12) return null;
  for (let i = 1; i < months.length; i++) {
    const expected = new Date(`${months[i - 1]}-01T00:00:00Z`);
    expected.setUTCMonth(expected.getUTCMonth() + 1);
    if (expected.toISOString().slice(0, 7) !== months[i]) return null;
  }
  return Number(((months.reduce((product, month) => product * (1 + byMonth.get(month)! / 100), 1) - 1) * 100).toFixed(4));
}

export interface MoverItem {
  simbolo: string
  nome: string
  preco: number
  variacao7d: number | null
  unidade: string
  fonte: string
  data?: string
  praca?: string
  estado?: 'disponivel' | 'atrasado'
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
  observacoesMacro: Record<string, { fonte: string; referencia: string; unidade: string; estado: string; idadeSegundos: number; base?: string }>
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
      collectMarketPrices(this.dsm),
      this.dsm.awesomeApi.getCotacoesAtuais().catch(() => null),
      this.dsm.expectativas.getExpectativasAnuais('IPCA', 1).catch(() => null),
      this.dsm.nasaFirms.getIncendiosBrasil().catch(() => null),
    ])

    const indicadoresData = indicadores.status === 'fulfilled' ? indicadores.value : null
    const cotacoesData = cotacoes.status === 'fulfilled' ? cotacoes.value : []
    const cambioArray = cambioAtual.status === 'fulfilled' ? cambioAtual.value : null
    const expectativasData = expectativas.status === 'fulfilled' ? expectativas.value : null
    const incendiosData = incendios.status === 'fulfilled' ? incendios.value : null

    // Cambio vem como array — indexar por moeda
    const cambioByMoeda = new Map<string, { bid: number; pctChange: number | null }>()
    if (cambioArray && Array.isArray(cambioArray)) {
      for (const c of cambioArray) {
        if (c && c.moeda && c.fonte !== 'fallback') cambioByMoeda.set(c.moeda.replace('-BRL', ''), { bid: c.bid, pctChange: c.periodoVariacao === '24h' ? c.pctChange : null })
      }
    }
    const usd = cambioByMoeda.get('USD') ?? null
    const eur = cambioByMoeda.get('EUR') ?? null
    const cny = cambioByMoeda.get('CNY') ?? null

    const macro: MacroSnapshot = {
      selic: indicadoresData?.selic?.fonte !== 'fallback' ? indicadoresData?.selic?.valor ?? null : null,
      ipca12m: accumulated12Months(indicadoresData?.ipca),
      cdi: indicadoresData?.cdi?.fonte !== 'fallback' ? indicadoresData?.cdi?.valor ?? null : null,
      igpm12m: accumulated12Months(indicadoresData?.igpm),
      dolar: usd?.bid ?? (indicadoresData?.ptax?.fonte !== 'fallback' ? indicadoresData?.ptax?.cotacaoVenda ?? null : null),
      euro: eur?.bid ?? null,
      dolarVariacao24h: usd?.pctChange ?? null,
    }

    const observacoesMacro: MarketBrief['observacoesMacro'] = {};
    for (const [key, indicator] of Object.entries(indicadoresData || {})) {
      if (indicator.fonte === 'fallback') continue;
      const value = indicator as { data?: string; dataHoraCotacao?: string; periodo?: string; unidade?: string; estado?: string };
      const reference = value.data || value.dataHoraCotacao || value.periodo || '';
      if (!Number.isFinite(Date.parse(reference))) continue;
      const age = Math.max(0, Math.floor((Date.now() - Date.parse(reference)) / 1000));
      const threshold = ['ipca', 'igpm', 'creditoRural'].includes(key) ? 70 : 7;
      observacoesMacro[key] = { fonte: 'Banco Central do Brasil', referencia: reference, unidade: value.unidade || 'R$/US$', estado: value.estado === 'atrasado' || age > threshold * 86400 ? 'atrasado' : 'disponivel', idadeSegundos: age };
    }
    // A base calculada acompanha o valor. Um IPCA acumulado não reutiliza
    // metadados de taxa mensal; séries históricas só se comparam na mesma base.
    for (const [key, base] of [['selic', 'bcb:432:meta-anual'], ['cdi', 'bcb:12:anualizado-252'], ['ipca', 'bcb:433:mensal'], ['igpm', 'bcb:189:mensal']] as const) {
      if (observacoesMacro[key]) observacoesMacro[key].base = base;
    }
    for (const [key, monthly, base] of [['ipca12m', 'ipca', 'bcb:433:acumulado-12m'], ['igpm12m', 'igpm', 'bcb:189:acumulado-12m']] as const) {
      if (macro[key] != null && observacoesMacro[monthly]) observacoesMacro[key] = { ...observacoesMacro[monthly], unidade: '% em 12 meses', base };
    }
    for (const currency of cambioArray || []) {
      if (currency.fonte === 'fallback' || !currency.provedor || !Number.isFinite(Date.parse(currency.createDate))) continue;
      const key = currency.moeda.replace('-BRL', '').toLowerCase();
      const age = Math.max(0, Math.floor((Date.now() - Date.parse(currency.createDate)) / 1000));
      observacoesMacro[key] = { fonte: currency.provedor, referencia: currency.createDate, unidade: `R$/${key.toUpperCase()}`, base: `cambio:${currency.moeda}:compra`, estado: currency.estado === 'atrasado' || age > 7 * 86400 ? 'atrasado' : 'disponivel', idadeSegundos: age };
    }
    if (!usd && macro.dolar != null && observacoesMacro.ptax) observacoesMacro.usd = { ...observacoesMacro.ptax, fonte: 'BCB PTAX', unidade: 'R$/USD', base: 'cambio:USD-BRL:venda' };
    const commodities: MoverItem[] = cotacoesData.map(c => ({ simbolo: c.chave.toUpperCase(), nome: c.cultura, preco: c.precoAtual, variacao7d: c.variacao7d, unidade: c.unidade, fonte: `${c.fonte} (${c.estado})`, data: c.atualizacao, praca: c.praca, estado: c.estado }));
    const sorted = commodities.filter(c => c.variacao7d != null).sort((a, b) => b.variacao7d! - a.variacao7d!);
    const topAltas = sorted.filter(c => c.variacao7d! > 0).slice(0, 3);
    const topBaixas = [...sorted].reverse().filter(c => c.variacao7d! < 0).slice(0, 3);

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
    if (expectativasData && expectativasData.fonte !== 'fallback') {
      const current = expectativasData.expectativas.find(e => e.dataReferencia === String(new Date().getFullYear()));
      if (current && Number.isFinite(current.mediana)) expectativaIPCA = current.mediana;
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
      if (c.variacao7d != null && Math.abs(c.variacao7d) >= 5) {
        alertas.push({
          tipo: 'commodity_stress',
          severidade: Math.abs(c.variacao7d) >= 10 ? 'critico' : 'atencao',
          titulo: `${c.nome}: ${describeVariacao(c.variacao7d)} (${fmtPct(c.variacao7d)} em 7d)`,
          detalhe: `Preço observado: ${c.preco.toLocaleString('pt-BR')} ${c.unidade}. Impacta capacidade de pagamento de operações indexadas a ${c.nome.toLowerCase()}.`,
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
    const narrativaCurta = partesCurta.length ? partesCurta.join(', ') + '.' : 'Dados de mercado indisponíveis. Nenhuma referência foi apresentada como cotação atual.'

    const linhas: string[] = []
    linhas.push(`**Panorama de mercado — ${new Date().toLocaleDateString('pt-BR')}**`)
    if (commodities.length) {
      linhas.push('')
      linhas.push('**Commodities (variação 7d):**')
      for (const c of commodities) {
        const sinal = c.variacao7d == null ? 'histórico 7d indisponível' : c.variacao7d >= 0 ? '↑' : '↓'
        linhas.push(`• ${c.nome}: ${c.preco.toLocaleString('pt-BR')} ${c.unidade} ${sinal} ${fmtPct(c.variacao7d)} · ${c.fonte}, ${c.data}, ${c.praca}`)
      }
    }
    linhas.push('')
    linhas.push('**Macro & câmbio:**')
    if (macro.selic != null) linhas.push(`• Selic: ${macro.selic.toFixed(2).replace('.', ',')}%`)
    if (macro.ipca12m != null) linhas.push(`• IPCA 12m: ${macro.ipca12m.toFixed(2).replace('.', ',')}%`)
    if (macro.cdi != null) linhas.push(`• CDI anualizado (252 dias úteis): ${macro.cdi.toFixed(2).replace('.', ',')}% a.a.`)
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
    for (const [key, observation] of Object.entries(observacoesMacro)) linhas.push(`_Referência ${key}: ${observation.referencia} · ${observation.unidade} · ${observation.estado}._`);
    linhas.push(`_Gerado em ${Date.now() - inicio}ms. Fontes: CEPEA/CONAB (commodities), BCB (macro), AwesomeAPI (câmbio), BCB Focus (expectativas), NASA FIRMS (incêndios)._`)
    const narrativaExecutiva = linhas.join('\n')

    const sources = [...cotacoesData.map(c => c.fonteOrigem), ...Object.values(indicadoresData || {}).map(v => v.fonte), ...(cambioArray || []).map(c => c.fonte)];
    const fonteOrigem: 'api' | 'cache' | 'mixed' = !sources.length || !cotacoesData.length || !cambioArray?.length || !indicadoresData || sources.includes('fallback') ? 'mixed' : sources.every(s => s === 'api') ? 'api' : sources.every(s => s === 'cache') ? 'cache' : 'mixed'

    return {
      data: new Date().toISOString().slice(0, 10),
      geradoEm: new Date().toISOString(),
      macro,
      observacoesMacro,
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
