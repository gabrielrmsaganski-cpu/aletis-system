/**
 * Calculadora de Viabilidade Agrícola FARMS v6 (cultura por cultura).
 *
 * Reimplementa em TS a lógica da planilha
 * `Calculadora de Viabilidade Agrícola FARMS v6.xlsm`, sheets
 * `Soja`, `Arroz`, `Milho`, `Trigo` (mesma estrutura, mudam constantes
 * por cultura).
 *
 * Padrão visto no inventário:
 *   AA5 = SUM(custos pelo cenário) + ROW()*0.0001  (sum + tiebreaker)
 *   AB5 = AA5 / $J$25                              (% sobre receita base)
 *   AD5 = AC5 * $J$25                              (cenário em R$)
 *   ranking via INDEX/MATCH/LARGE
 *
 * Exposição funcional:
 *   - calcularFarms(input) → resumo + análise de sensibilidade
 *   - rankearCenarios(cenarios) → ordena por margem
 */

export type Cultura = 'soja' | 'milho' | 'arroz' | 'trigo' | 'cafe' | 'algodao' | 'outra'

export interface FarmsCustoCategoria {
  sementes: number
  defensivos: number
  fertilizantes: number
  mecanizacao: number
  maoDeObra: number
  arrendamento?: number
  irrigacao?: number
  outros?: number
}

export interface FarmsInput {
  cultura: Cultura
  areaHa: number
  rendimentoScHa: number // produtividade média
  precoRSporSc: number // preço de venda esperado por saca
  custosPorHa: FarmsCustoCategoria // custo direto por ha
  custosFixosTotais?: number // R$ no total da safra (não /ha)
  taxaJurosSafraAA?: number // decimal — 0.10 = 10% a.a.
  duracaoSafraDias?: number // padrão 240 (8 meses)
  capitalProprioPct?: number // decimal — 0..1 (parcela financiada com próprio capital)
  custoCapitalProprioAA?: number // decimal — opcional, custo de oportunidade
}

export interface FarmsResult {
  cultura: Cultura
  area: number
  receitaBruta: number
  custoTotal: number
  custoTotalPorHa: number
  custoFinanceiro: number
  custoOportunidade: number
  margemBruta: number
  margemBrutaPorHa: number
  margemBrutaPct: number
  pontoEquilibrioScHa: number // sacas/ha para zerar margem
  pontoEquilibrioPrecoSc: number // R$/sc para zerar margem
  payback: { meses: number; viavel: boolean }
  sensibilidade: {
    precoMenos10: number
    precoMais10: number
    rendimentoMenos15: number
    rendimentoMais15: number
  }
  veredicto: 'viavel' | 'marginal' | 'inviavel'
}

export interface FarmsCenario {
  nome: string
  result: FarmsResult
}

const sumCustos = (c: FarmsCustoCategoria): number =>
  c.sementes +
  c.defensivos +
  c.fertilizantes +
  c.mecanizacao +
  c.maoDeObra +
  (c.arrendamento ?? 0) +
  (c.irrigacao ?? 0) +
  (c.outros ?? 0)

export function calcularFarms(input: FarmsInput): FarmsResult {
  const area = input.areaHa
  const custosVariaveisTotais = sumCustos(input.custosPorHa) * area
  const custosFixos = input.custosFixosTotais ?? 0

  const custoSemFinanceiro = custosVariaveisTotais + custosFixos

  // Custo financeiro: aplicado apenas sobre a parcela NÃO de capital próprio
  const capProprio = input.capitalProprioPct ?? 0
  const parcelaFinanciada = Math.max(0, 1 - capProprio)
  const taxaAA = input.taxaJurosSafraAA ?? 0
  const dias = input.duracaoSafraDias ?? 240
  const taxaPeriodo = Math.pow(1 + taxaAA, dias / 360) - 1
  const custoFinanceiro = custoSemFinanceiro * parcelaFinanciada * taxaPeriodo

  // Custo de oportunidade do capital próprio
  const custoCapPropAA = input.custoCapitalProprioAA ?? 0
  const taxaCapPropPeriodo = Math.pow(1 + custoCapPropAA, dias / 360) - 1
  const custoOportunidade = custoSemFinanceiro * capProprio * taxaCapPropPeriodo

  const custoTotal = custoSemFinanceiro + custoFinanceiro + custoOportunidade
  const custoTotalPorHa = custoTotal / Math.max(area, 1e-9)

  const receitaBruta = input.areaHa * input.rendimentoScHa * input.precoRSporSc

  const margemBruta = receitaBruta - custoTotal
  const margemBrutaPorHa = margemBruta / Math.max(area, 1e-9)
  const margemBrutaPct = receitaBruta > 0 ? margemBruta / receitaBruta : 0

  // Ponto de equilíbrio (mantendo preço): custoTotal / preçoSc / area
  const pontoEquilibrioScHa =
    input.precoRSporSc > 0 && area > 0
      ? custoTotal / input.precoRSporSc / area
      : Number.POSITIVE_INFINITY

  // Ponto de equilíbrio em preço (mantendo rendimento): custoTotal / (rend × area)
  const pontoEquilibrioPrecoSc =
    input.rendimentoScHa > 0 && area > 0
      ? custoTotal / (input.rendimentoScHa * area)
      : Number.POSITIVE_INFINITY

  // Sensibilidade
  const cenario = (precoMul: number, rendMul: number): number => {
    const rec = input.areaHa * (input.rendimentoScHa * rendMul) * (input.precoRSporSc * precoMul)
    return rec - custoTotal
  }

  const sensibilidade = {
    precoMenos10: cenario(0.9, 1),
    precoMais10: cenario(1.1, 1),
    rendimentoMenos15: cenario(1, 0.85),
    rendimentoMais15: cenario(1, 1.15),
  }

  // Veredito (heurística defensável)
  let veredicto: FarmsResult['veredicto'] = 'inviavel'
  if (margemBrutaPct >= 0.15) veredicto = 'viavel'
  else if (margemBrutaPct >= 0.05) veredicto = 'marginal'

  // Payback (em meses) — quando margem se paga em ciclos
  const payback = (() => {
    if (margemBruta <= 0) return { meses: Number.POSITIVE_INFINITY, viavel: false }
    const ciclosMeses = dias / 30
    return { meses: ciclosMeses, viavel: true }
  })()

  return {
    cultura: input.cultura,
    area,
    receitaBruta,
    custoTotal,
    custoTotalPorHa,
    custoFinanceiro,
    custoOportunidade,
    margemBruta,
    margemBrutaPorHa,
    margemBrutaPct,
    pontoEquilibrioScHa,
    pontoEquilibrioPrecoSc,
    payback,
    sensibilidade,
    veredicto,
  }
}

export function rankearCenarios(cenarios: FarmsCenario[]): FarmsCenario[] {
  return [...cenarios].sort((a, b) => b.result.margemBruta - a.result.margemBruta)
}
