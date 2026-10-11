/**
 * Fechamento por Embarque - matriz nativa da planilha
 * "Fechamento Geral 2024 Ari do Prado (2).xlsx".
 *
 * A planilha trabalha coluna a coluna por baia/embarque e fecha o resultado
 * ponderado pelo numero de animais. Este modulo preserva as formulas centrais
 * em TypeScript para que a tela possa editar premissas sem depender de Excel.
 */

export interface FechamentoEmbarqueInput {
  id: string
  rotulo: string
  dataEmbarque?: string
  numeroAnimais: number
  periodoEngordaDias: number
  pesoEntradaKg: number
  precoEntradaRsArroba: number
  rendimentoCarcacaEntradaPct: number
  pesoSaidaKg: number
  consumoMedioKgMs: number
  precoSaidaRsArroba: number
  rendimentoCarcacaAbatePct: number
  custoDietaRsKgMs: number
  custoOperacionalAnimalDia: number
  perdasAlimentosRsCab: number
  custoSanidadeRsCab: number
  freteRsCab: number
  taxasAbateRastreabilidadeRsCab: number
}

export interface FechamentoGeralEmbarqueInput {
  nome: string
  origemPlanilha?: string
  embarques: FechamentoEmbarqueInput[]
}

export interface FechamentoEmbarqueResultado extends FechamentoEmbarqueInput {
  precoEntradaRsCab: number
  gmdKgDia: number
  arrobasProduzidas: number
  gmdCarcacaKgDia: number
  eficienciaAlimentarKgPvKgMs: number
  conversaoBiologicaKgMsArroba: number
  consumoPctPesoVivo: number
  pesoAbateArroba: number
  precoVendaRsCab: number
  margemBrutaRsCab: number
  custoAlimentarRsCab: number
  custoOperacionalPeriodoRsCab: number
  custoOperacionalTotalRsCab: number
  custoTotalMaisAnimalRsCab: number
  custoArrobaProduzidaRs: number
  lucroLiquidoRsCab: number
  rentabilidadeMensalPct: number
  precoVendaTotalRs: number
  margemBrutaTotalRs: number
  lucroLiquidoTotalRs: number
}

export interface FechamentoGeralEmbarqueResultado {
  nome: string
  origemPlanilha?: string
  embarques: FechamentoEmbarqueResultado[]
  geral: {
    totalAnimais: number
    periodoEngordaDias: number
    pesoEntradaKg: number
    precoEntradaRsArroba: number
    rendimentoCarcacaEntradaPct: number
    precoEntradaRsCab: number
    pesoSaidaKg: number
    gmdKgDia: number
    arrobasProduzidas: number
    gmdCarcacaKgDia: number
    eficienciaAlimentarKgPvKgMs: number
    conversaoBiologicaKgMsArroba: number
    consumoMedioKgMs: number
    consumoPctPesoVivo: number
    pesoAbateArroba: number
    precoSaidaRsArroba: number
    rendimentoCarcacaAbatePct: number
    custoDietaRsKgMs: number
    custoOperacionalAnimalDia: number
    precoVendaRsCab: number
    margemBrutaRsCab: number
    custoAlimentarRsCab: number
    perdasAlimentosRsCab: number
    custoOperacionalPeriodoRsCab: number
    custoSanidadeRsCab: number
    freteRsCab: number
    taxasAbateRastreabilidadeRsCab: number
    custoOperacionalTotalRsCab: number
    custoTotalMaisAnimalRsCab: number
    custoArrobaProduzidaRs: number
    lucroLiquidoRsCab: number
    rentabilidadeMensalPct: number
    precoVendaTotalRs: number
    margemBrutaTotalRs: number
    lucroLiquidoTotalRs: number
  }
  rankingLucro: FechamentoEmbarqueResultado[]
  rankingRentabilidade: FechamentoEmbarqueResultado[]
  alertas: string[]
}

function n(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function div(a: number, b: number): number {
  return b === 0 ? 0 : a / b
}

function r(value: number, digits = 6): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function weighted(items: FechamentoEmbarqueResultado[], getter: (item: FechamentoEmbarqueResultado) => number): number {
  const totalAnimais = items.reduce((sum, item) => sum + Math.max(0, item.numeroAnimais), 0)
  if (totalAnimais <= 0) return 0
  return items.reduce((sum, item) => sum + getter(item) * Math.max(0, item.numeroAnimais), 0) / totalAnimais
}

export function calcularFechamentoEmbarque(item: FechamentoEmbarqueInput): FechamentoEmbarqueResultado {
  const numeroAnimais = Math.max(0, n(item.numeroAnimais))
  const periodoEngordaDias = Math.max(0, n(item.periodoEngordaDias))
  const pesoEntradaKg = Math.max(0, n(item.pesoEntradaKg))
  const precoEntradaRsArroba = Math.max(0, n(item.precoEntradaRsArroba))
  const rendimentoCarcacaEntradaPct = Math.max(0, n(item.rendimentoCarcacaEntradaPct))
  const pesoSaidaKg = Math.max(0, n(item.pesoSaidaKg))
  const consumoMedioKgMs = Math.max(0, n(item.consumoMedioKgMs))
  const precoSaidaRsArroba = Math.max(0, n(item.precoSaidaRsArroba))
  const rendimentoCarcacaAbatePct = Math.max(0, n(item.rendimentoCarcacaAbatePct))
  const custoDietaRsKgMs = Math.max(0, n(item.custoDietaRsKgMs))
  const custoOperacionalAnimalDia = Math.max(0, n(item.custoOperacionalAnimalDia))
  const perdasAlimentosRsCab = Math.max(0, n(item.perdasAlimentosRsCab))
  const custoSanidadeRsCab = Math.max(0, n(item.custoSanidadeRsCab))
  const freteRsCab = Math.max(0, n(item.freteRsCab))
  const taxasAbateRastreabilidadeRsCab = Math.max(0, n(item.taxasAbateRastreabilidadeRsCab))

  const precoEntradaRsCab = pesoEntradaKg * precoEntradaRsArroba * rendimentoCarcacaEntradaPct / 15
  const gmdKgDia = div(pesoSaidaKg - pesoEntradaKg, periodoEngordaDias)
  const arrobasProduzidas = ((pesoSaidaKg * rendimentoCarcacaAbatePct) - (pesoEntradaKg * rendimentoCarcacaEntradaPct)) / 15
  const gmdCarcacaKgDia = div(arrobasProduzidas * 15, periodoEngordaDias)
  const eficienciaAlimentarKgPvKgMs = div(gmdKgDia, consumoMedioKgMs)
  const conversaoBiologicaKgMsArroba = div(consumoMedioKgMs * periodoEngordaDias, arrobasProduzidas)
  const consumoPctPesoVivo = div(consumoMedioKgMs, (pesoSaidaKg + pesoEntradaKg) / 2)
  const pesoAbateArroba = pesoSaidaKg * rendimentoCarcacaAbatePct / 15
  const precoVendaRsCab = precoSaidaRsArroba * pesoAbateArroba
  const margemBrutaRsCab = precoVendaRsCab - precoEntradaRsCab
  const custoAlimentarRsCab = custoDietaRsKgMs * consumoMedioKgMs * periodoEngordaDias
  const custoOperacionalPeriodoRsCab = custoOperacionalAnimalDia * periodoEngordaDias
  const custoOperacionalTotalRsCab =
    custoAlimentarRsCab +
    perdasAlimentosRsCab +
    custoOperacionalPeriodoRsCab +
    custoSanidadeRsCab +
    freteRsCab +
    taxasAbateRastreabilidadeRsCab
  const custoTotalMaisAnimalRsCab = custoOperacionalTotalRsCab + precoEntradaRsCab
  const custoArrobaProduzidaRs = div(custoOperacionalTotalRsCab, arrobasProduzidas)
  const lucroLiquidoRsCab = precoVendaRsCab - precoEntradaRsCab - custoOperacionalTotalRsCab
  const rentabilidadeMensalPct = div(lucroLiquidoRsCab, custoTotalMaisAnimalRsCab) * div(365, 12) * div(1, periodoEngordaDias)

  return {
    ...item,
    numeroAnimais,
    periodoEngordaDias,
    pesoEntradaKg,
    precoEntradaRsArroba,
    rendimentoCarcacaEntradaPct,
    pesoSaidaKg,
    consumoMedioKgMs,
    precoSaidaRsArroba,
    rendimentoCarcacaAbatePct,
    custoDietaRsKgMs,
    custoOperacionalAnimalDia,
    perdasAlimentosRsCab,
    custoSanidadeRsCab,
    freteRsCab,
    taxasAbateRastreabilidadeRsCab,
    precoEntradaRsCab: r(precoEntradaRsCab),
    gmdKgDia: r(gmdKgDia),
    arrobasProduzidas: r(arrobasProduzidas),
    gmdCarcacaKgDia: r(gmdCarcacaKgDia),
    eficienciaAlimentarKgPvKgMs: r(eficienciaAlimentarKgPvKgMs),
    conversaoBiologicaKgMsArroba: r(conversaoBiologicaKgMsArroba),
    consumoPctPesoVivo: r(consumoPctPesoVivo),
    pesoAbateArroba: r(pesoAbateArroba),
    precoVendaRsCab: r(precoVendaRsCab),
    margemBrutaRsCab: r(margemBrutaRsCab),
    custoAlimentarRsCab: r(custoAlimentarRsCab),
    custoOperacionalPeriodoRsCab: r(custoOperacionalPeriodoRsCab),
    custoOperacionalTotalRsCab: r(custoOperacionalTotalRsCab),
    custoTotalMaisAnimalRsCab: r(custoTotalMaisAnimalRsCab),
    custoArrobaProduzidaRs: r(custoArrobaProduzidaRs),
    lucroLiquidoRsCab: r(lucroLiquidoRsCab),
    rentabilidadeMensalPct: r(rentabilidadeMensalPct),
    precoVendaTotalRs: r(precoVendaRsCab * numeroAnimais),
    margemBrutaTotalRs: r(margemBrutaRsCab * numeroAnimais),
    lucroLiquidoTotalRs: r(lucroLiquidoRsCab * numeroAnimais),
  }
}

export function calcularFechamentoGeralEmbarque(
  input: FechamentoGeralEmbarqueInput,
): FechamentoGeralEmbarqueResultado {
  const embarques = input.embarques.map(calcularFechamentoEmbarque)
  const totalAnimais = embarques.reduce((sum, item) => sum + item.numeroAnimais, 0)
  const precoVendaTotalRs = embarques.reduce((sum, item) => sum + item.precoVendaTotalRs, 0)
  const margemBrutaTotalRs = embarques.reduce((sum, item) => sum + item.margemBrutaTotalRs, 0)
  const lucroLiquidoTotalRs = embarques.reduce((sum, item) => sum + item.lucroLiquidoTotalRs, 0)
  const rankingLucro = [...embarques].sort((a, b) => b.lucroLiquidoRsCab - a.lucroLiquidoRsCab)
  const rankingRentabilidade = [...embarques].sort((a, b) => b.rentabilidadeMensalPct - a.rentabilidadeMensalPct)
  const alertas: string[] = []

  for (const item of embarques) {
    if (item.numeroAnimais <= 0) alertas.push(`${item.rotulo}: numero de animais zerado.`)
    if (item.lucroLiquidoRsCab < 0) alertas.push(`${item.rotulo}: lucro liquido negativo por cabeca.`)
    if (item.gmdKgDia > 0 && item.gmdKgDia < 1.2) alertas.push(`${item.rotulo}: GMD abaixo de 1,20 kg/dia.`)
    if (item.conversaoBiologicaKgMsArroba > 190) alertas.push(`${item.rotulo}: conversao biologica acima de 190 kg MS/@.`)
  }

  return {
    nome: input.nome,
    origemPlanilha: input.origemPlanilha,
    embarques,
    geral: {
      totalAnimais: r(totalAnimais, 0),
      periodoEngordaDias: r(weighted(embarques, (item) => item.periodoEngordaDias)),
      pesoEntradaKg: r(weighted(embarques, (item) => item.pesoEntradaKg)),
      precoEntradaRsArroba: r(weighted(embarques, (item) => item.precoEntradaRsArroba)),
      rendimentoCarcacaEntradaPct: r(weighted(embarques, (item) => item.rendimentoCarcacaEntradaPct)),
      precoEntradaRsCab: r(weighted(embarques, (item) => item.precoEntradaRsCab)),
      pesoSaidaKg: r(weighted(embarques, (item) => item.pesoSaidaKg)),
      gmdKgDia: r(weighted(embarques, (item) => item.gmdKgDia)),
      arrobasProduzidas: r(weighted(embarques, (item) => item.arrobasProduzidas)),
      gmdCarcacaKgDia: r(weighted(embarques, (item) => item.gmdCarcacaKgDia)),
      eficienciaAlimentarKgPvKgMs: r(weighted(embarques, (item) => item.eficienciaAlimentarKgPvKgMs)),
      conversaoBiologicaKgMsArroba: r(weighted(embarques, (item) => item.conversaoBiologicaKgMsArroba)),
      consumoMedioKgMs: r(weighted(embarques, (item) => item.consumoMedioKgMs)),
      consumoPctPesoVivo: r(weighted(embarques, (item) => item.consumoPctPesoVivo)),
      pesoAbateArroba: r(weighted(embarques, (item) => item.pesoAbateArroba)),
      precoSaidaRsArroba: r(weighted(embarques, (item) => item.precoSaidaRsArroba)),
      rendimentoCarcacaAbatePct: r(weighted(embarques, (item) => item.rendimentoCarcacaAbatePct)),
      custoDietaRsKgMs: r(weighted(embarques, (item) => item.custoDietaRsKgMs)),
      custoOperacionalAnimalDia: r(weighted(embarques, (item) => item.custoOperacionalAnimalDia)),
      precoVendaRsCab: r(weighted(embarques, (item) => item.precoVendaRsCab)),
      margemBrutaRsCab: r(weighted(embarques, (item) => item.margemBrutaRsCab)),
      custoAlimentarRsCab: r(weighted(embarques, (item) => item.custoAlimentarRsCab)),
      perdasAlimentosRsCab: r(weighted(embarques, (item) => item.perdasAlimentosRsCab)),
      custoOperacionalPeriodoRsCab: r(weighted(embarques, (item) => item.custoOperacionalPeriodoRsCab)),
      custoSanidadeRsCab: r(weighted(embarques, (item) => item.custoSanidadeRsCab)),
      freteRsCab: r(weighted(embarques, (item) => item.freteRsCab)),
      taxasAbateRastreabilidadeRsCab: r(weighted(embarques, (item) => item.taxasAbateRastreabilidadeRsCab)),
      custoOperacionalTotalRsCab: r(weighted(embarques, (item) => item.custoOperacionalTotalRsCab)),
      custoTotalMaisAnimalRsCab: r(weighted(embarques, (item) => item.custoTotalMaisAnimalRsCab)),
      custoArrobaProduzidaRs: r(weighted(embarques, (item) => item.custoArrobaProduzidaRs)),
      lucroLiquidoRsCab: r(weighted(embarques, (item) => item.lucroLiquidoRsCab)),
      rentabilidadeMensalPct: r(weighted(embarques, (item) => item.rentabilidadeMensalPct)),
      precoVendaTotalRs: r(precoVendaTotalRs),
      margemBrutaTotalRs: r(margemBrutaTotalRs),
      lucroLiquidoTotalRs: r(lucroLiquidoTotalRs),
    },
    rankingLucro,
    rankingRentabilidade,
    alertas,
  }
}

export const FECHAMENTO_ARI_PRADO_2024_INPUT: FechamentoGeralEmbarqueInput = {
  nome: 'Fechamento Geral 2024 - Ari do Prado',
  origemPlanilha: 'Fechamento Geral 2024 Ari do Prado (2).xlsx',
  embarques: [
    { id: 'embarque-01', rotulo: 'Baia 6', dataEmbarque: '24.01.24', numeroAnimais: 103, periodoEngordaDias: 117, pesoEntradaKg: 350.4, precoEntradaRsArroba: 215, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 543, consumoMedioKgMs: 9.71162227201062, precoSaidaRsArroba: 231.63, rendimentoCarcacaAbatePct: 0.562, custoDietaRsKgMs: 1, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-02', rotulo: 'Baia 2', dataEmbarque: '24 e 26.01.24', numeroAnimais: 125, periodoEngordaDias: 113, pesoEntradaKg: 311.5, precoEntradaRsArroba: 215, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 523.15, consumoMedioKgMs: 8.802877168141595, precoSaidaRsArroba: 235.59, rendimentoCarcacaAbatePct: 0.543, custoDietaRsKgMs: 1, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-03', rotulo: 'Baia 3', dataEmbarque: '24 e 26.01.24', numeroAnimais: 128, periodoEngordaDias: 114, pesoEntradaKg: 330.3, precoEntradaRsArroba: 215, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 517.43, consumoMedioKgMs: 9.04581757127193, precoSaidaRsArroba: 235.24, rendimentoCarcacaAbatePct: 0.5464, custoDietaRsKgMs: 1, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-04', rotulo: 'Baia 1', dataEmbarque: '2024-03-24', numeroAnimais: 141, periodoEngordaDias: 126, pesoEntradaKg: 382.88, precoEntradaRsArroba: 216, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 553.68, consumoMedioKgMs: 10.3, precoSaidaRsArroba: 236.24, rendimentoCarcacaAbatePct: 0.5485, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-05', rotulo: 'Baia 10', dataEmbarque: '2024-03-26', numeroAnimais: 121, periodoEngordaDias: 122, pesoEntradaKg: 404, precoEntradaRsArroba: 217, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 570.56, consumoMedioKgMs: 10.4, precoSaidaRsArroba: 237.24, rendimentoCarcacaAbatePct: 0.5439, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-06', rotulo: 'Baia 9', dataEmbarque: '2024-04-01', numeroAnimais: 107, periodoEngordaDias: 119, pesoEntradaKg: 402.36, precoEntradaRsArroba: 215, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 588.4, consumoMedioKgMs: 11, precoSaidaRsArroba: 217.43, rendimentoCarcacaAbatePct: 0.5353, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-07', rotulo: 'Baia 8', dataEmbarque: '2024-04-02', numeroAnimais: 131, periodoEngordaDias: 111, pesoEntradaKg: 387.92, precoEntradaRsArroba: 215, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 583.28, consumoMedioKgMs: 10.18, precoSaidaRsArroba: 215.89, rendimentoCarcacaAbatePct: 0.5371, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-08', rotulo: 'Baia 4', dataEmbarque: '17 e 22/04', numeroAnimais: 120, periodoEngordaDias: 119, pesoEntradaKg: 417, precoEntradaRsArroba: 215, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 586.07, consumoMedioKgMs: 11.4, precoSaidaRsArroba: 219.44, rendimentoCarcacaAbatePct: 0.5468, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-09', rotulo: 'Baia 7', dataEmbarque: '17 e 22/04', numeroAnimais: 117, periodoEngordaDias: 127, pesoEntradaKg: 417, precoEntradaRsArroba: 215, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 600.46, consumoMedioKgMs: 11.22, precoSaidaRsArroba: 215.47, rendimentoCarcacaAbatePct: 0.5485, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-10', rotulo: 'Baia 3', dataEmbarque: '2024-05-06', numeroAnimais: 118, periodoEngordaDias: 98, pesoEntradaKg: 461, precoEntradaRsArroba: 215, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 552.31, consumoMedioKgMs: 10.4, precoSaidaRsArroba: 216.21, rendimentoCarcacaAbatePct: 0.5503, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-11', rotulo: 'Baia 6', dataEmbarque: '17 e 21/05', numeroAnimais: 131, periodoEngordaDias: 115, pesoEntradaKg: 393, precoEntradaRsArroba: 220, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 535.8, consumoMedioKgMs: 9.63, precoSaidaRsArroba: 205.22, rendimentoCarcacaAbatePct: 0.5435, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-12', rotulo: 'Baia 2', dataEmbarque: '20 e 23/05', numeroAnimais: 134, periodoEngordaDias: 116, pesoEntradaKg: 395.3, precoEntradaRsArroba: 220, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 535.8, consumoMedioKgMs: 9.6, precoSaidaRsArroba: 212.66, rendimentoCarcacaAbatePct: 0.5405, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-13', rotulo: 'Baia 9', dataEmbarque: '30/06 e 01/07', numeroAnimais: 136, periodoEngordaDias: 87, pesoEntradaKg: 547.95, precoEntradaRsArroba: 192, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 650.83, consumoMedioKgMs: 10.9, precoSaidaRsArroba: 207.4, rendimentoCarcacaAbatePct: 0.5601, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-14', rotulo: 'Baia 10', dataEmbarque: '01 e 07/07', numeroAnimais: 70, periodoEngordaDias: 92, pesoEntradaKg: 491.58, precoEntradaRsArroba: 215, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 654.74, consumoMedioKgMs: 11.7, precoSaidaRsArroba: 208.06, rendimentoCarcacaAbatePct: 0.5475, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-15', rotulo: 'Baia 8', dataEmbarque: '2024-07-14', numeroAnimais: 165, periodoEngordaDias: 103, pesoEntradaKg: 401, precoEntradaRsArroba: 220, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 536, consumoMedioKgMs: 9.8, precoSaidaRsArroba: 215.17, rendimentoCarcacaAbatePct: 0.558, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-16', rotulo: 'Baia 1', dataEmbarque: '7, 11 e 28/08', numeroAnimais: 152, periodoEngordaDias: 86, pesoEntradaKg: 391.1, precoEntradaRsArroba: 220, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 535.78, consumoMedioKgMs: 10.59, precoSaidaRsArroba: 221.2, rendimentoCarcacaAbatePct: 0.547, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-17', rotulo: 'Baia 4', dataEmbarque: '2024-09-21', numeroAnimais: 102, periodoEngordaDias: 105, pesoEntradaKg: 475.9, precoEntradaRsArroba: 220, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 624, consumoMedioKgMs: 11.3, precoSaidaRsArroba: 243.9, rendimentoCarcacaAbatePct: 0.5561, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-18', rotulo: 'Baia 7', dataEmbarque: '2024-09-21', numeroAnimais: 114, periodoEngordaDias: 99, pesoEntradaKg: 465.4, precoEntradaRsArroba: 215, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 624, consumoMedioKgMs: 10.3, precoSaidaRsArroba: 243.9, rendimentoCarcacaAbatePct: 0.5561, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-19', rotulo: 'Baia 3', dataEmbarque: '21 e 30/09', numeroAnimais: 117, periodoEngordaDias: 117, pesoEntradaKg: 401.8, precoEntradaRsArroba: 220, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 610.63, consumoMedioKgMs: 9.83, precoSaidaRsArroba: 247.32, rendimentoCarcacaAbatePct: 0.559, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-20', rotulo: 'Baia 2', dataEmbarque: '2024-10-20', numeroAnimais: 104, periodoEngordaDias: 108, pesoEntradaKg: 402.7, precoEntradaRsArroba: 215, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 578, consumoMedioKgMs: 9.6, precoSaidaRsArroba: 255.67, rendimentoCarcacaAbatePct: 0.5646, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-21', rotulo: 'Baia 10', dataEmbarque: '20 e 28/10', numeroAnimais: 111, periodoEngordaDias: 99, pesoEntradaKg: 393, precoEntradaRsArroba: 220, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 557.68, consumoMedioKgMs: 10.4, precoSaidaRsArroba: 284.64, rendimentoCarcacaAbatePct: 0.546, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-22', rotulo: 'Baia 9', dataEmbarque: '2024-10-28', numeroAnimais: 155, periodoEngordaDias: 100, pesoEntradaKg: 388.54, precoEntradaRsArroba: 220, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 547.01, consumoMedioKgMs: 9.6, precoSaidaRsArroba: 292.85, rendimentoCarcacaAbatePct: 0.5498, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-23', rotulo: 'Baia 8', dataEmbarque: '2024-10-28', numeroAnimais: 82, periodoEngordaDias: 102, pesoEntradaKg: 376.7, precoEntradaRsArroba: 220, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 550.39, consumoMedioKgMs: 9.92, precoSaidaRsArroba: 288.68, rendimentoCarcacaAbatePct: 0.5574, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-24', rotulo: 'Baia 1', dataEmbarque: '2025-12-07', numeroAnimais: 151, periodoEngordaDias: 85, pesoEntradaKg: 390.2, precoEntradaRsArroba: 225, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 507, consumoMedioKgMs: 10.2, precoSaidaRsArroba: 316.52, rendimentoCarcacaAbatePct: 0.5379, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-25', rotulo: 'Baia 6', dataEmbarque: '7, 11 e 15/12', numeroAnimais: 149, periodoEngordaDias: 87, pesoEntradaKg: 387.5, precoEntradaRsArroba: 225, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 512, consumoMedioKgMs: 9.72, precoSaidaRsArroba: 305.88, rendimentoCarcacaAbatePct: 0.5445, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
    { id: 'embarque-26', rotulo: 'Baia 4', dataEmbarque: '2025-12-15', numeroAnimais: 64, periodoEngordaDias: 91, pesoEntradaKg: 374.9, precoEntradaRsArroba: 225, rendimentoCarcacaEntradaPct: 0.5, pesoSaidaKg: 505, consumoMedioKgMs: 10, precoSaidaRsArroba: 300.33, rendimentoCarcacaAbatePct: 0.5455, custoDietaRsKgMs: 0.84, custoOperacionalAnimalDia: 1.2, perdasAlimentosRsCab: 30, custoSanidadeRsCab: 0, freteRsCab: 0, taxasAbateRastreabilidadeRsCab: 130 },
  ],
}
