// ============================================================
// InsightsEngine — análise automática de saúde financeira do grupo
// ============================================================
// Gera alertas P0/P1/P2 baseados em thresholds clássicos:
//   - Dívida/EBITDA > 3x → atenção; > 5x → crítico
//   - LTV > 80% → stress; > 100% → subcoleterizado
//   - FCL negativo em ≥3 anos consecutivos → crítico
//   - Concentração de credor > 60% → atenção
//   - Margem EBITDA < 15% → atenção
//   - Saldo acumulado negativo no horizonte → crítico
// ============================================================
import type { EndividamentoConsolidado } from './endividamento-calculator.js'
import type { RaioXOutput } from './raio-x-calculator.js'
import type { GarantiaLtvConsolidado } from './garantia-ltv-calculator.js'
import type { PassivosConsolidado } from './passivos-calculator.js'
import type { DreFclOutput } from './dre-fcl-calculator.js'

export interface Insight {
  severidade: 'critico' | 'importante' | 'info'
  categoria: 'endividamento' | 'fluxo' | 'garantia' | 'concentracao' | 'rentabilidade' | 'cobertura'
  titulo: string
  mensagem: string
  metricas: Record<string, number | string>
  recomendacao?: string
}

export interface InsightsContext {
  endividamento: EndividamentoConsolidado
  raioX: RaioXOutput
  garantias?: GarantiaLtvConsolidado
  passivos?: PassivosConsolidado
  dre?: DreFclOutput
}

export function gerarInsights(ctx: InsightsContext): Insight[] {
  const out: Insight[] = []
  const e = ctx.endividamento
  const i = ctx.raioX.indicadores

  // ── Dívida/EBITDA ──
  if (i.diviPorEbitda >= 5) {
    out.push({
      severidade: 'critico',
      categoria: 'endividamento',
      titulo: `Alavancagem crítica — Dívida/EBITDA ${i.diviPorEbitda.toFixed(2)}x`,
      mensagem: `Dívida total de R$ ${fmt(e.saldoTotalAtual)} representa ${i.diviPorEbitda.toFixed(2)}x o EBITDA anual médio. Acima de 5x bancos rejeitam novas operações.`,
      metricas: { diviPorEbitda: i.diviPorEbitda, dividaTotal: e.saldoTotalAtual, ebitdaAnual: i.ebitdaTotal / Math.max(1, ctx.raioX.anos.length) },
      recomendacao: 'Iniciar negociação de alongamento ou conversão de dívidas curtas para longas. Considerar securitização ou venda de ativos não-operacionais.',
    })
  } else if (i.diviPorEbitda >= 3) {
    out.push({
      severidade: 'importante',
      categoria: 'endividamento',
      titulo: `Alavancagem em atenção — ${i.diviPorEbitda.toFixed(2)}x`,
      mensagem: `Dívida/EBITDA ${i.diviPorEbitda.toFixed(2)}x está acima do limite confortável (3x). Próximas operações exigirão garantia adicional.`,
      metricas: { diviPorEbitda: i.diviPorEbitda },
      recomendacao: 'Programar amortização extraordinária da safra atual antes de buscar novo crédito.',
    })
  }

  // ── Margem EBITDA ──
  if (i.margemEbitda < 0.15 && i.receitaTotal > 0) {
    out.push({
      severidade: i.margemEbitda < 0.05 ? 'critico' : 'importante',
      categoria: 'rentabilidade',
      titulo: `Margem EBITDA baixa — ${(i.margemEbitda * 100).toFixed(1)}%`,
      mensagem: `Margem operacional abaixo de 15% indica pressão de custos ou preços. Setor agro saudável opera 25-40%.`,
      metricas: { margemEbitda: i.margemEbitda, receitaTotal: i.receitaTotal, ebitdaTotal: i.ebitdaTotal },
      recomendacao: 'Revisar custos diretos por hectare e renegociar fornecedores principais. Avaliar mudança de mix de cultura.',
    })
  }

  // ── Concentração de credor ──
  const credorTop = e.porCredor[0]
  if (credorTop && credorTop.pctTotal > 0.6) {
    out.push({
      severidade: credorTop.pctTotal > 0.8 ? 'importante' : 'info',
      categoria: 'concentracao',
      titulo: `Concentração em ${credorTop.credor} — ${(credorTop.pctTotal * 100).toFixed(0)}%`,
      mensagem: `${(credorTop.pctTotal * 100).toFixed(0)}% da dívida está com ${credorTop.credor}. Risco de poder de barganha desfavorável em renegociação.`,
      metricas: { credor: credorTop.credor, pctTotal: credorTop.pctTotal, saldo: credorTop.saldo },
      recomendacao: 'Diversificar para 3+ instituições. Bancos cooperativos (Sicredi, Sicoob) costumam ter taxas competitivas para custeio.',
    })
  }

  // ── Saldo acumulado negativo ──
  if (i.saldoFinalAcumulado < 0) {
    out.push({
      severidade: 'critico',
      categoria: 'fluxo',
      titulo: `Projeção de fluxo negativa — déficit acumulado de R$ ${fmt(Math.abs(i.saldoFinalAcumulado))}`,
      mensagem: `No horizonte de ${ctx.raioX.anos.length} anos, o saldo acumulado fecha em -R$ ${fmt(Math.abs(i.saldoFinalAcumulado))}. Necessidade de funding adicional ou aumento de receita.`,
      metricas: { saldoFinal: i.saldoFinalAcumulado, anos: ctx.raioX.anos.length },
      recomendacao: 'Construir cenário de reestruturação com aporte de capital ou alongamento de prazo médio das dívidas para reduzir parcela anual.',
    })
  }

  // ── FCL negativo consecutivo ──
  let consecutivosNegativos = 0
  let maxConsec = 0
  for (const ano of ctx.raioX.anos) {
    if (ano.saldoNaoAcumulado < 0) {
      consecutivosNegativos += 1
      maxConsec = Math.max(maxConsec, consecutivosNegativos)
    } else {
      consecutivosNegativos = 0
    }
  }
  if (maxConsec >= 3) {
    out.push({
      severidade: maxConsec >= 5 ? 'critico' : 'importante',
      categoria: 'fluxo',
      titulo: `${maxConsec} anos consecutivos com gap de caixa`,
      mensagem: `Há ${maxConsec} anos seguidos com FCL negativo. Indica desbalanceamento estrutural entre geração operacional e serviço da dívida.`,
      metricas: { anosNegativos: maxConsec },
      recomendacao: 'Mapear janela exata do gap para programar pré-pagamentos com receita de safras boas.',
    })
  }

  // ── Garantias (se disponível) ──
  if (ctx.garantias) {
    const g = ctx.garantias
    if (g.ltvMercadoMedio > 0.8) {
      out.push({
        severidade: g.ltvMercadoMedio > 1.0 ? 'critico' : 'importante',
        categoria: 'garantia',
        titulo: `LTV médio ${(g.ltvMercadoMedio * 100).toFixed(0)}% — garantias em stress`,
        mensagem: `LTV (Loan-to-Value) médio acima de 80% indica saldo devedor próximo ou superior ao valor de mercado das garantias.`,
        metricas: { ltvMercado: g.ltvMercadoMedio, ltvForcado: g.ltvForcadoMedio, valorMercado: g.totalValorMercado },
        recomendacao: 'Buscar reforço de garantia (avalistas, novas matrículas) ou amortização para melhorar margem.',
      })
    }
    for (const a of g.alertas) {
      out.push({
        severidade: a.tipo === 'subcoleterizada' ? 'critico' : 'importante',
        categoria: 'garantia',
        titulo: `Garantia em risco — ${a.tipo}`,
        mensagem: a.mensagem,
        metricas: { garantiaId: a.garantiaId },
      })
    }
  }

  // ── Passivos não-bancários (se disponível) ──
  if (ctx.passivos && ctx.passivos.totalVencido > 0) {
    out.push({
      severidade: 'importante',
      categoria: 'endividamento',
      titulo: `Passivos vencidos: R$ ${fmt(ctx.passivos.totalVencido)}`,
      mensagem: `Existem R$ ${fmt(ctx.passivos.totalVencido)} em compromissos vencidos não-bancários. Risco de protesto, restrição cadastral.`,
      metricas: { totalVencido: ctx.passivos.totalVencido },
      recomendacao: 'Negociar parcelamento direto com fornecedores. Em caso fiscal, avaliar transação tributária (PGFN/RFB).',
    })
  }

  // ── Cenários DRE (se disponível) ──
  if (ctx.dre) {
    const pess = ctx.dre.cenarios.find((c) => c.cenario === 'pessimista')
    if (pess && pess.totais.fclTotal < 0) {
      out.push({
        severidade: 'importante',
        categoria: 'fluxo',
        titulo: `Cenário pessimista — FCL R$ ${fmt(pess.totais.fclTotal)}`,
        mensagem: `Com preços/produtividade -15% e custos +10%, FCL agregado fica negativo em R$ ${fmt(Math.abs(pess.totais.fclTotal))} no horizonte projetado.`,
        metricas: { fclPessimista: pess.totais.fclTotal, fclBase: ctx.dre.cenarios.find((c) => c.cenario === 'base')?.totais.fclTotal ?? 0 },
        recomendacao: 'Considerar contratação de hedge (NDF/futuros) e seguro Proagro para mitigar risco preço × clima.',
      })
    }
  }

  return out
}

function fmt(v: number): string {
  return Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
