/**
 * Formação de Preço de Venda 3.0.
 *
 * Reimplementa em TS o fluxo da planilha
 * `Formação--do--Preço--de--Venda--3.0.xlsx` (sheet
 * "Cálculo do Preço de Venda 3.0", 1003×28).
 *
 * Modelos suportados:
 *  - Mark-up divisor (cost-plus tradicional brasileiro)
 *  - Mark-up multiplicador
 *  - Preço meta por margem de contribuição
 *  - Preço meta por margem líquida
 */

export interface FormacaoPrecoInput {
  // Custos diretos (por unidade)
  custoUnitario: number
  qtd?: number // padrão 1

  // Custos variáveis sobre venda (% sobre preço)
  impostosSobreVenda: number // ICMS+PIS+COFINS+ISS, em decimal (0.18 = 18%)
  comissoes: number
  fretesEDespesasVendaVar: number
  outrosImpostosVar?: number

  // Custos fixos rateados (R$/unidade)
  despesasFixasUnit: number

  // Margem alvo
  margemAlvo: number // decimal — 0.20 = 20%
  modelo?: 'markup-divisor' | 'markup-multiplicador' | 'margem-contribuicao' | 'margem-liquida'

  // Adicional opcional (para preço de tabela)
  outrosAdicionais?: number
}

export interface FormacaoPrecoResult {
  custoTotalUnitario: number
  somaPercentuaisVariaveis: number // (impostos + comissoes + frete + outros) em decimal
  precoVenda: number
  markup: number // em decimal — útil para comparar
  markupPct: number // em %
  margemBrutaUnit: number
  margemContribuicaoUnit: number
  margemLiquidaUnit: number
  pontoEquilibrioUnitMonet: number // R$ de receita
  pontoEquilibrioUnitQtd: number // unidades
  detalhamento: {
    custoDireto: number
    impostosSobreVenda: number
    comissoes: number
    frete: number
    outrosImpostos: number
    despesasFixas: number
    lucroAlvo: number
  }
}

const pct = (n: number | undefined): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0)

export function calcularPrecoVenda(input: FormacaoPrecoInput): FormacaoPrecoResult {
  const qtd = input.qtd ?? 1
  const custoTotalUnitario = input.custoUnitario * qtd

  const somaPercentuaisVariaveis =
    pct(input.impostosSobreVenda) +
    pct(input.comissoes) +
    pct(input.fretesEDespesasVendaVar) +
    pct(input.outrosImpostosVar)

  const margemAlvo = pct(input.margemAlvo)
  const despesasFixasUnit = pct(input.despesasFixasUnit)

  const modelo = input.modelo ?? 'markup-divisor'

  let precoVenda = 0

  if (modelo === 'markup-divisor') {
    // PV = (Custo + DespFixas) / (1 - %var - margem)
    const denom = 1 - somaPercentuaisVariaveis - margemAlvo
    if (denom <= 0) {
      throw new Error(
        `Mark-up divisor inviável: ${(somaPercentuaisVariaveis + margemAlvo) * 100}% ≥ 100%`,
      )
    }
    precoVenda = (custoTotalUnitario + despesasFixasUnit) / denom
  } else if (modelo === 'markup-multiplicador') {
    // PV = Custo × (1 + markup) onde markup é taxa de aumento sobre o custo
    const markupTaxa = margemAlvo
    precoVenda = (custoTotalUnitario + despesasFixasUnit) * (1 + markupTaxa)
  } else if (modelo === 'margem-contribuicao') {
    // PV onde MC unitária = margemAlvo × PV  →  PV − Custo − %var × PV = margemAlvo × PV
    const denom = 1 - somaPercentuaisVariaveis - margemAlvo
    if (denom <= 0) throw new Error('Margem de contribuição alvo inviável')
    precoVenda = custoTotalUnitario / denom
  } else {
    // margem-liquida: lucro líquido = margemAlvo × PV
    // PV − Custo − %var × PV − DespFixas = margemAlvo × PV
    const denom = 1 - somaPercentuaisVariaveis - margemAlvo
    if (denom <= 0) throw new Error('Margem líquida alvo inviável')
    precoVenda = (custoTotalUnitario + despesasFixasUnit) / denom
  }

  precoVenda += pct(input.outrosAdicionais)

  const impostosSobreVenda = precoVenda * pct(input.impostosSobreVenda)
  const comissoes = precoVenda * pct(input.comissoes)
  const frete = precoVenda * pct(input.fretesEDespesasVendaVar)
  const outrosImpostos = precoVenda * pct(input.outrosImpostosVar)

  const margemBrutaUnit = precoVenda - custoTotalUnitario
  const margemContribuicaoUnit =
    precoVenda - custoTotalUnitario - impostosSobreVenda - comissoes - frete - outrosImpostos
  const margemLiquidaUnit = margemContribuicaoUnit - despesasFixasUnit

  // Mark-up "tradicional" (divisor) — preço sobre custo
  const markup = custoTotalUnitario > 0 ? precoVenda / custoTotalUnitario - 1 : 0

  // Ponto de equilíbrio em unidades (assumindo despFixasUnit como aproximação ÷ MCunit)
  const pontoEquilibrioUnitQtd =
    margemContribuicaoUnit > 0 ? despesasFixasUnit / margemContribuicaoUnit : 0
  const pontoEquilibrioUnitMonet = pontoEquilibrioUnitQtd * precoVenda

  return {
    custoTotalUnitario,
    somaPercentuaisVariaveis,
    precoVenda,
    markup,
    markupPct: markup * 100,
    margemBrutaUnit,
    margemContribuicaoUnit,
    margemLiquidaUnit,
    pontoEquilibrioUnitMonet,
    pontoEquilibrioUnitQtd,
    detalhamento: {
      custoDireto: custoTotalUnitario,
      impostosSobreVenda,
      comissoes,
      frete,
      outrosImpostos,
      despesasFixas: despesasFixasUnit,
      lucroAlvo: precoVenda * margemAlvo,
    },
  }
}
