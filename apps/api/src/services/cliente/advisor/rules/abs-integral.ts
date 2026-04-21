import type { AdvisorRule } from '../types.js'

/**
 * Cliente com elegibilidade integral ao AB+S e dívida ativa relevante —
 * grande oportunidade de redução de custo financeiro via taxa reduzida do
 * programa. Regra prioriza imóveis com CAR OK que ainda estão pagando
 * juros de mercado.
 */
export const rule: AdvisorRule = {
  id: 'abs-integral-oportunidade',
  titulo: 'Elegível integral ao AB+S — propor migração do passivo',
  categoria: 'oportunidade',
  prioridade: 'p1',
  evaluate: ({ analise }) => {
    const abs = analise.abs
    const saldo = analise.saldoRecalculado
    if (!abs || abs.nivelElegibilidade !== 'integral') return null
    if (!saldo || saldo.totalSaldoRecalculado <= 0) return null

    const economiaAnualPct = Math.max(0, 12 - abs.taxasEstimadasPct.max) // vs ~12% a.a. taxa livre típica
    const economiaAprox = (saldo.totalSaldoRecalculado * economiaAnualPct) / 100

    return {
      id: 'abs-integral-oportunidade',
      titulo: 'Elegível integral ao AB+S — propor migração do passivo',
      categoria: 'oportunidade',
      prioridade: 'p1',
      acao: 'Preparar proposta de adesão ao AB+S (taxa ' + abs.taxasEstimadasPct.min + '–' + abs.taxasEstimadasPct.max + '% a.a.) e apresentar ao cliente',
      justificativa: `AB+S ${abs.scorePercentual}% com todos checkpoints OK. Saldo recalculado R$ ${saldo.totalSaldoRecalculado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} em juros de mercado é migração prioritária.`,
      impactoEstimado: economiaAprox > 0
        ? `Economia ≈ R$ ${economiaAprox.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}/ano em juros`
        : undefined,
    }
  },
}
