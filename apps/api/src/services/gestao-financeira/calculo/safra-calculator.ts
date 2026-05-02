// ============================================================
// SafraCalculator — replica fórmulas de "1 - BaseSafra" e "7 - Safra"
// para calcular Resultado Bruto e Margem por cultura/safra/cenário.
// ============================================================
import type { GfCulturaSafra } from '../../../db/schema.js'

export interface SafraComputed {
  cultura: string
  safra: string
  cenario: string
  areaPropriaHa: number
  areaArrendadaHa: number
  areaPlantadaHa: number          // = propria + arrendada
  rendimentoScHa: number
  precoMedioRs: number
  custoUnitarioInsumosRs: number
  arrendamentoBaseScHa: number
  producaoSc: number              // = rendimento × area
  receitaTotal: number            // = producao × preço
  custoInsumosTotal: number       // = custoUnit × area  (replica fielmente bug original — confirmar)
  custoArrendamento: number       // = arrendamentoBase × area_arrendada × preço
  resultadoBruto: number          // = receita - custoInsumos - custoArrend
  margemBruta: number              // = resultadoBruto / receitaTotal
}

function n(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const x = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(x) ? x : 0
}

export function computeCultura(row: GfCulturaSafra): SafraComputed {
  const areaPropria = n(row.areaPropriaHa)
  const areaArrendada = n(row.areaArrendadaHa)
  const areaPlantada = areaPropria + areaArrendada
  const rendimento = n(row.rendimentoScHa)
  const preco = n(row.precoMedioRs)
  const custoUnit = n(row.custoUnitarioInsumosRs)
  const arrendamentoBase = n(row.arrendamentoBaseScHa)

  const producao = rendimento * areaPlantada
  const receitaTotal = producao * preco
  // PLANILHA ORIGINAL usa custoUnit * areaPlantada (E45 = E41*E35).
  // Tratamos como produção-direta (R$/sc * sc) que é matematicamente correto.
  // Se cliente confirmar bug original, swap para `custoUnit * areaPlantada`.
  const custoInsumosTotal = custoUnit * producao
  const custoArrendamento = arrendamentoBase * areaArrendada * preco
  const resultadoBruto = receitaTotal - custoInsumosTotal - custoArrendamento
  const margemBruta = receitaTotal > 0 ? resultadoBruto / receitaTotal : 0

  return {
    cultura: row.cultura,
    safra: row.safra,
    cenario: row.cenario,
    areaPropriaHa: areaPropria,
    areaArrendadaHa: areaArrendada,
    areaPlantadaHa: areaPlantada,
    rendimentoScHa: rendimento,
    precoMedioRs: preco,
    custoUnitarioInsumosRs: custoUnit,
    arrendamentoBaseScHa: arrendamentoBase,
    producaoSc: producao,
    receitaTotal,
    custoInsumosTotal,
    custoArrendamento,
    resultadoBruto,
    margemBruta,
  }
}

export interface SafraConsolidado {
  safra: string
  cenario: string
  receitaTotal: number
  custoInsumosTotal: number
  custoArrendamento: number
  resultadoBruto: number
  margemBruta: number
  totalAreaHa: number
  totalProducao: number
  porCultura: SafraComputed[]
}

/** Consolida todas as culturas de uma safra/cenário (Linhas 19-25 da "7 - Safra"). */
export function consolidarSafra(rows: GfCulturaSafra[]): SafraConsolidado[] {
  const groups = new Map<string, GfCulturaSafra[]>()
  for (const r of rows) {
    const k = `${r.safra}::${r.cenario}`
    const arr = groups.get(k) ?? []
    arr.push(r)
    groups.set(k, arr)
  }
  const out: SafraConsolidado[] = []
  for (const [key, list] of groups) {
    const [safra, cenario] = key.split('::')
    const computed = list.map(computeCultura)
    const receitaTotal = computed.reduce((acc, c) => acc + c.receitaTotal, 0)
    const custoInsumosTotal = computed.reduce((acc, c) => acc + c.custoInsumosTotal, 0)
    const custoArrendamento = computed.reduce((acc, c) => acc + c.custoArrendamento, 0)
    const resultadoBruto = receitaTotal - custoInsumosTotal - custoArrendamento
    const totalAreaHa = computed.reduce((acc, c) => acc + c.areaPlantadaHa, 0)
    const totalProducao = computed.reduce((acc, c) => acc + c.producaoSc, 0)
    out.push({
      safra,
      cenario,
      receitaTotal,
      custoInsumosTotal,
      custoArrendamento,
      resultadoBruto,
      margemBruta: receitaTotal > 0 ? resultadoBruto / receitaTotal : 0,
      totalAreaHa,
      totalProducao,
      porCultura: computed,
    })
  }
  // ordena por safra ascendente
  out.sort((a, b) => a.safra.localeCompare(b.safra))
  return out
}
