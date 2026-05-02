// ============================================================
// DreFclCalculator — replica "17 - DRE FCL" da v2.0 com
// MULTI-CENÁRIO (otimista / base / pessimista) lado a lado.
// ============================================================
// DRE projetada por ano:
//   Receita Bruta
//   (-) Custos Diretos (insumos+frete+colheita)
//   = Lucro Bruto
//   (-) Despesas Operacionais (rateadas)
//   (-) Despesas Familiares (pró-labore, dividendos)
//   (-) Arrendamentos
//   = EBITDA
//   (-) Serviço da dívida (parcelas bancárias)
//   = FCL após dívida
//   (+) Receita financeira sobre superávit
//   (-) Custo financeiro sobre déficit
//   = Saldo Caixa Final
// ============================================================
import type { SafraConsolidado } from './safra-calculator.js'
import type { EndividamentoConsolidado } from './endividamento-calculator.js'
import type { GfCustoSafra } from '../../../db/schema.js'

export interface DreLinhaAno {
  ano: number
  receitaBruta: number
  custoDireto: number
  lucroBruto: number
  despesaOperacional: number
  despesaFamiliar: number
  arrendamento: number
  ebitda: number
  margemEbitda: number
  servicoDivida: number
  fclPosDivida: number
  receitaFinanceira: number
  custoFinanceiro: number
  saldoCaixaFinal: number
}

export interface DreCenario {
  cenario: 'otimista' | 'base' | 'pessimista'
  fatorPreco: number       // 1.0 = base; 1.1 = +10%; 0.85 = -15%
  fatorRendimento: number  // idem
  fatorCusto: number       // 1.0 = base; 1.05 = +5% de custo
  linhas: DreLinhaAno[]
  totais: {
    receitaTotal: number
    ebitdaTotal: number
    fclTotal: number
    margemEbitdaMedia: number
    saldoFinalAcumulado: number
  }
}

export interface DreFclOutput {
  anos: number[]
  cenarios: DreCenario[]
  comparativo: Array<{
    ano: number
    pessimista: number
    base: number
    otimista: number
  }>
}

function n(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const x = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(x) ? x : 0
}

const CENARIOS_DEFAULT: Array<{
  cenario: DreCenario['cenario']
  fatorPreco: number
  fatorRendimento: number
  fatorCusto: number
}> = [
  { cenario: 'pessimista', fatorPreco: 0.85, fatorRendimento: 0.85, fatorCusto: 1.10 },
  { cenario: 'base', fatorPreco: 1.0, fatorRendimento: 1.0, fatorCusto: 1.0 },
  { cenario: 'otimista', fatorPreco: 1.10, fatorRendimento: 1.10, fatorCusto: 0.95 },
]

export function computeDreFcl(input: {
  safras: SafraConsolidado[]
  endividamento: EndividamentoConsolidado
  custos: GfCustoSafra[]
  anosProjecao?: number
  taxaCustoFinanceiroAa?: number
  taxaPoupancaAa?: number
}): DreFclOutput {
  const horizonte = input.anosProjecao ?? 10
  const txCusto = input.taxaCustoFinanceiroAa ?? 0.20
  const txPoupanca = input.taxaPoupancaAa ?? 0.12

  const safrasPlanejadas = input.safras.filter((s) => s.cenario === 'planejado' || s.cenario === 'realizado')
  const anoMin = Math.min(...safrasPlanejadas.map((s) => {
    const m = s.safra.match(/^(\d{2})\/(\d{2})$/)
    return m ? 2000 + parseInt(m[2], 10) : Infinity
  }))
  const anoBase = isFinite(anoMin) ? anoMin : new Date().getFullYear()
  const anos = Array.from({ length: horizonte }, (_, i) => anoBase + i)

  // mapeia safra → ano
  function receitaAno(ano: number, fatorPreco: number, fatorRend: number): number {
    let total = 0
    for (const s of safrasPlanejadas) {
      const m = s.safra.match(/^(\d{2})\/(\d{2})$/)
      if (!m) continue
      const yearEnd = 2000 + parseInt(m[2], 10)
      if (yearEnd === ano) total += s.receitaTotal * fatorPreco * fatorRend
    }
    return total
  }
  function custoDiretoAno(ano: number, fatorCusto: number): number {
    let total = 0
    for (const s of safrasPlanejadas) {
      const m = s.safra.match(/^(\d{2})\/(\d{2})$/)
      if (!m) continue
      const yearEnd = 2000 + parseInt(m[2], 10)
      if (yearEnd === ano) total += (s.custoInsumosTotal + s.custoArrendamento) * fatorCusto
    }
    return total
  }

  const despesaOpAnual = input.custos
    .filter((c) => c.tipo === 'operacional' && (!c.cultura || c.cultura.trim().length === 0))
    .reduce((a, c) => a + n(c.valorAnual), 0)
  const despesaFamAnual = input.custos
    .filter((c) => c.tipo === 'fixo')
    .reduce((a, c) => a + n(c.valorAnual), 0)
  const arrendAnual = input.custos
    .filter((c) => c.tipo === 'arrendamento')
    .reduce((a, c) => a + n(c.valorAnual), 0)

  const dividaPorAno = new Map<number, number>()
  for (const y of input.endividamento.evolucaoAnual) dividaPorAno.set(y.ano, y.parcelaAno)

  const cenarios: DreCenario[] = CENARIOS_DEFAULT.map((cen) => {
    const linhas: DreLinhaAno[] = []
    let saldoAcum = 0
    for (const ano of anos) {
      const receitaBruta = receitaAno(ano, cen.fatorPreco, cen.fatorRendimento)
      const custoDireto = custoDiretoAno(ano, cen.fatorCusto)
      const lucroBruto = receitaBruta - custoDireto
      const despesaOperacional = despesaOpAnual * cen.fatorCusto
      const despesaFamiliar = despesaFamAnual * cen.fatorCusto
      const arrendamento = arrendAnual * cen.fatorCusto
      const ebitda = lucroBruto - despesaOperacional - despesaFamiliar - arrendamento
      const margemEbitda = receitaBruta > 0 ? ebitda / receitaBruta : 0
      const servicoDivida = dividaPorAno.get(ano) ?? 0
      const fclPosDivida = ebitda - servicoDivida
      saldoAcum += fclPosDivida
      const receitaFinanceira = saldoAcum > 0 ? saldoAcum * txPoupanca : 0
      const custoFinanceiro = saldoAcum < 0 ? -saldoAcum * txCusto : 0
      const saldoCaixaFinal = saldoAcum + receitaFinanceira - custoFinanceiro
      linhas.push({
        ano,
        receitaBruta,
        custoDireto,
        lucroBruto,
        despesaOperacional,
        despesaFamiliar,
        arrendamento,
        ebitda,
        margemEbitda,
        servicoDivida,
        fclPosDivida,
        receitaFinanceira,
        custoFinanceiro,
        saldoCaixaFinal,
      })
    }
    const receitaTotal = linhas.reduce((a, l) => a + l.receitaBruta, 0)
    const ebitdaTotal = linhas.reduce((a, l) => a + l.ebitda, 0)
    const fclTotal = linhas.reduce((a, l) => a + l.fclPosDivida, 0)
    return {
      ...cen,
      linhas,
      totais: {
        receitaTotal,
        ebitdaTotal,
        fclTotal,
        margemEbitdaMedia: receitaTotal > 0 ? ebitdaTotal / receitaTotal : 0,
        saldoFinalAcumulado: linhas[linhas.length - 1]?.saldoCaixaFinal ?? 0,
      },
    }
  })

  const comparativo = anos.map((ano, i) => ({
    ano,
    pessimista: cenarios[0].linhas[i]?.fclPosDivida ?? 0,
    base: cenarios[1].linhas[i]?.fclPosDivida ?? 0,
    otimista: cenarios[2].linhas[i]?.fclPosDivida ?? 0,
  }))

  return { anos, cenarios, comparativo }
}
