// ============================================================
// RateioCalculator — replica "7.1 - Rateio de Custos" da v2.0
// ============================================================
// Aloca custos fixos/operacionais entre culturas usando o peso
// ponderado (média) entre fração de área plantada e fração de
// faturamento. Formula original Excel:
//
//   pesoArea       = areaCultura / SUM(areaTodasCulturas)
//   pesoFaturament = receitaCultura / SUM(receitaTotal)
//   indiceMedio    = (pesoArea + pesoFaturamento) / 2
//   despesaRateada = indiceMedio × despesasRateadasTotal
//   custoHaRateado = despesaRateada / areaCultura
//   totalPadraoTex = insumos + despesaRateada
// ============================================================
import type { SafraConsolidado } from './safra-calculator.js'
import type { GfCustoSafra } from '../../../db/schema.js'

export interface RateioRow {
  cultura: string
  safra: string
  areaPlantadaHa: number
  receitaCultura: number
  pesoArea: number              // % do total de área
  pesoFaturamento: number       // % do total de receita
  indiceMedio: number           // (pesoArea + pesoFaturamento) / 2
  despesaRateada: number        // R$ alocados a essa cultura do bolo total
  custoHaRateado: number        // R$/ha do rateio
  custoInsumosCultura: number   // R$ insumos vindos de gf_custo_safra (filtrados por cultura)
  totalPadraoRs: number         // insumos + rateio
  totalPadraoPorHa: number      // total / area
}

export interface RateioConsolidado {
  safra: string
  cenario: string
  despesasRateadasTotal: number
  totalAreaHa: number
  totalReceita: number
  custoRateadoStdHa: number     // = despesasRateadasTotal / totalArea
  porCultura: RateioRow[]
}

function n(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const x = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(x) ? x : 0
}

/** Soma o "bolo" de despesas rateáveis (custos operacionais + fixos não atribuídos a cultura). */
function calcularDespesasRateaveis(custos: GfCustoSafra[], safra: string): number {
  const filtrados = custos.filter((c) => c.safra === safra)
  const culturaSpec = filtrados.filter((c) => c.cultura && c.cultura.trim().length > 0)
  const naoCulturaSpec = filtrados.filter((c) => !c.cultura || c.cultura.trim().length === 0)
  // o que NÃO é específico de cultura é rateado
  return naoCulturaSpec
    .filter((c) => c.tipo === 'operacional' || c.tipo === 'fixo')
    .reduce((acc, c) => acc + n(c.valorAnual), 0)
}

function custoInsumosPorCultura(custos: GfCustoSafra[], safra: string, cultura: string): number {
  return custos
    .filter((c) => c.safra === safra && c.cultura === cultura && (c.tipo === 'insumo' || c.tipo === 'frete' || c.tipo === 'colheita'))
    .reduce((acc, c) => acc + n(c.valorAnual), 0)
}

export function computeRateio(
  consolidados: SafraConsolidado[],
  custos: GfCustoSafra[],
): RateioConsolidado[] {
  const out: RateioConsolidado[] = []
  for (const cons of consolidados) {
    const despesasRateadasTotal = calcularDespesasRateaveis(custos, cons.safra)
    const totalArea = cons.totalAreaHa
    const totalReceita = cons.receitaTotal
    const custoRateadoStdHa = totalArea > 0 ? despesasRateadasTotal / totalArea : 0

    const rows: RateioRow[] = cons.porCultura.map((c) => {
      const pesoArea = totalArea > 0 ? c.areaPlantadaHa / totalArea : 0
      const pesoFaturamento = totalReceita > 0 ? c.receitaTotal / totalReceita : 0
      const indiceMedio = (pesoArea + pesoFaturamento) / 2
      const despesaRateada = indiceMedio * despesasRateadasTotal
      const custoHaRateado = c.areaPlantadaHa > 0 ? despesaRateada / c.areaPlantadaHa : 0
      const custoInsumosCultura = custoInsumosPorCultura(custos, cons.safra, c.cultura)
      const totalPadraoRs = custoInsumosCultura + despesaRateada
      const totalPadraoPorHa = c.areaPlantadaHa > 0 ? totalPadraoRs / c.areaPlantadaHa : 0
      return {
        cultura: c.cultura,
        safra: cons.safra,
        areaPlantadaHa: c.areaPlantadaHa,
        receitaCultura: c.receitaTotal,
        pesoArea,
        pesoFaturamento,
        indiceMedio,
        despesaRateada,
        custoHaRateado,
        custoInsumosCultura,
        totalPadraoRs,
        totalPadraoPorHa,
      }
    })
    out.push({
      safra: cons.safra,
      cenario: cons.cenario,
      despesasRateadasTotal,
      totalAreaHa: totalArea,
      totalReceita,
      custoRateadoStdHa,
      porCultura: rows,
    })
  }
  return out
}
