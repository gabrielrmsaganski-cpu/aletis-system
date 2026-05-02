// ============================================================
// EbitdaMensalCalculator — replica "7.2 - EBITDA" da v2.0 com
// alocação MENSAL (12 meses) em vez de anual.
// ============================================================
// Distribui receita-custo da safra ao longo dos 12 meses de janela
// agrícola (default: jan-jul para soja, jul-jan para milho safrinha).
// Permite consultor ver onde EXATAMENTE o gap de caixa abre/fecha.
// ============================================================
import type { SafraConsolidado } from './safra-calculator.js'

export interface MesEbitda {
  ano: number
  mes: number                  // 1..12
  label: string                // 'jan/26', 'fev/26'...
  receita: number
  custoTotal: number
  ebitda: number
  margemEbitda: number
  saldoAcumulado: number       // running sum
}

export interface EbitdaMensalOutput {
  safra: string
  meses: MesEbitda[]
  ebitdaTotalSafra: number
  receitaSafra: number
  custoSafra: number
  margemSafra: number
}

/**
 * Janela padrão de safra agro brasileira:
 *   Soja           = nov..mar (5 meses pós custos, 1 mês receita maio)
 *   Milho safrinha = fev..jul (custos), receita ago
 *   Cana           = jul..ago (corte, receita distribuída em 12m)
 *   Pecuária       = receita/custo distribuídos uniformemente
 *
 * Default conservador: receita concentrada em meses 5-6 da safra,
 * custos distribuídos uniformemente.
 */
function defaultDistribuicao(meses: number = 12): { receita: number[]; custo: number[] } {
  const custo = Array(meses).fill(1 / meses) // uniforme
  // receita: 60% no mês 5, 30% no mês 6, 10% no mês 7 (pico de colheita)
  const receita = Array(meses).fill(0)
  const m1 = Math.floor(meses * 0.4)
  const m2 = m1 + 1
  const m3 = m2 + 1
  if (m1 < meses) receita[m1] = 0.6
  if (m2 < meses) receita[m2] = 0.3
  if (m3 < meses) receita[m3] = 0.1
  return { receita, custo }
}

export function computeEbitdaMensal(
  consolidados: SafraConsolidado[],
  inicioSafraMes = 7, // julho como início default da safra agro
): EbitdaMensalOutput[] {
  const out: EbitdaMensalOutput[] = []
  for (const cons of consolidados) {
    const m = cons.safra.match(/^(\d{2})\/(\d{2})$/)
    if (!m) continue
    const yearStart = 2000 + parseInt(m[1], 10)
    const dist = defaultDistribuicao(12)
    const meses: MesEbitda[] = []
    let saldoAcum = 0
    let mesGlobal = inicioSafraMes
    let anoCorrente = yearStart
    for (let i = 0; i < 12; i++) {
      if (mesGlobal > 12) {
        mesGlobal = 1
        anoCorrente += 1
      }
      const receita = cons.receitaTotal * dist.receita[i]
      const custoTotal = (cons.custoInsumosTotal + cons.custoArrendamento) * dist.custo[i]
      const ebitda = receita - custoTotal
      saldoAcum += ebitda
      const monthLabels = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
      meses.push({
        ano: anoCorrente,
        mes: mesGlobal,
        label: `${monthLabels[mesGlobal - 1]}/${String(anoCorrente).slice(2)}`,
        receita,
        custoTotal,
        ebitda,
        margemEbitda: receita > 0 ? ebitda / receita : 0,
        saldoAcumulado: saldoAcum,
      })
      mesGlobal += 1
    }
    out.push({
      safra: cons.safra,
      meses,
      ebitdaTotalSafra: cons.resultadoBruto,
      receitaSafra: cons.receitaTotal,
      custoSafra: cons.custoInsumosTotal + cons.custoArrendamento,
      margemSafra: cons.margemBruta,
    })
  }
  return out
}
