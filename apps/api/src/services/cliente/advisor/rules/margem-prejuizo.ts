import type { AdvisorRule } from '../types.js'

/**
 * Margem do cliente no Financeiro virou negativa ou prejuízo — o escopo
 * do contrato está inviável e precisa ser revisto antes que vire
 * inadimplência interna da ALETIS.
 */
export const rule: AdvisorRule = {
  id: 'margem-prejuizo',
  titulo: 'Cliente em prejuízo — revisar honorários ou escopo',
  categoria: 'estrategia',
  prioridade: 'p1',
  evaluate: ({ analise }) => {
    const m = analise.margemCliente
    if (!m) return null
    if (m.classificacao !== 'prejuizo') return null
    return {
      id: 'margem-prejuizo',
      titulo: 'Cliente em prejuízo — revisar honorários ou escopo',
      categoria: 'estrategia',
      prioridade: 'p1',
      acao: 'Revisar o contrato: reajustar honorários, reduzir escopo de despesas atribuíveis ou encerrar caso em 60 dias',
      justificativa: `Margem R$ ${m.margem.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} (${m.margemPct.toFixed(1)}%). Despesas atribuídas > receita vinculada — consultoria está subsidiando o cliente.`,
      impactoEstimado: m.margem < 0 ? `Estanca perda mensal de R$ ${Math.abs(m.margem / 12).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : undefined,
    }
  },
}
