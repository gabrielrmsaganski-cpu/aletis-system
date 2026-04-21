import type { AdvisorRule } from '../types.js'

/**
 * Juros acumulados > 30% do principal sinalizam dívida que atravessou
 * múltiplos ciclos de safra sem renegociação — negociação é urgente antes
 * que o valor de execução supere o valor do bem.
 */
export const rule: AdvisorRule = {
  id: 'juros-excessivos',
  titulo: 'Juros > 30% do principal — negociar agora',
  categoria: 'recuperacao',
  prioridade: 'p2',
  evaluate: ({ analise }) => {
    const saldo = analise.saldoRecalculado
    if (!saldo || saldo.totalValorOriginal <= 0) return null
    const pctJuros = (saldo.totalJurosAcumulados / saldo.totalValorOriginal) * 100
    if (pctJuros < 30) return null

    return {
      id: 'juros-excessivos',
      titulo: 'Juros > 30% do principal — negociar agora',
      categoria: 'recuperacao',
      prioridade: 'p2',
      acao: 'Preparar memória de cálculo, notificar credor e propor acordo de alongamento com abatimento de encargos',
      justificativa: `Juros acumulados R$ ${saldo.totalJurosAcumulados.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} (${pctJuros.toFixed(0)}% do principal) em ${saldo.porDivida.length} contratos.`,
      impactoEstimado: `Descontos típicos de 20-40% nos encargos — potencial R$ ${(saldo.totalJurosAcumulados * 0.3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`,
    }
  },
}
