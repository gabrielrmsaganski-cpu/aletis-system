import type { AdvisorRule } from '../types.js'

/**
 * Capacidade de pagamento > 70% da margem bruta na safra = fluxo negativo
 * no pós-colheita. Sinaliza necessidade de alongamento OU renegociação
 * antes da safra virar.
 */
export const rule: AdvisorRule = {
  id: 'caixa-comprometido',
  titulo: 'Caixa comprometido na safra — alongar ou renegociar',
  categoria: 'recuperacao',
  prioridade: 'p2',
  evaluate: ({ analise }) => {
    const fluxo = analise.fluxoCaixaSafra
    if (!fluxo) return null
    if (fluxo.capacidadePagamento < 70) return null

    const severidade = fluxo.capacidadePagamento > 100 ? 'p1' : 'p2'
    return {
      id: 'caixa-comprometido',
      titulo: fluxo.capacidadePagamento > 100
        ? 'Safra não cobre dívidas — alongar antes do plantio'
        : 'Caixa comprometido na safra — alongar ou renegociar',
      categoria: 'recuperacao',
      prioridade: severidade,
      acao: fluxo.capacidadePagamento > 100
        ? 'Propor alongamento imediato de no mínimo 50% do passivo — safra atual é insuficiente'
        : 'Simular alongamento de parte do passivo e/ou antecipar venda de parte da produção (hedge)',
      justificativa: `Dívidas = ${fluxo.capacidadePagamento.toFixed(0)}% da margem bruta prevista da safra (R$ ${fluxo.saldoLivre.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} de saldo livre).`,
      impactoEstimado: fluxo.capacidadePagamento > 100
        ? 'Sem ação, déficit certo pós-colheita'
        : 'Preserva capital de giro para próxima safra',
    }
  },
}
