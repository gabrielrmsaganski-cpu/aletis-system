import type { AdvisorRule } from '../types.js'

/**
 * CNPJ inapto/suspenso/baixado na Receita — bloqueia emissão de NF, CND e
 * qualquer linha de crédito. Regularização vem antes de qualquer outra
 * ação de reestruturação.
 */
export const rule: AdvisorRule = {
  id: 'cnpj-irregular',
  titulo: 'Situação cadastral CNPJ irregular — regularizar primeiro',
  categoria: 'compliance',
  prioridade: 'p1',
  evaluate: ({ cliente }) => {
    const sit = cliente.cnpjInfo?.situacaoCadastral?.toUpperCase() || ''
    if (!sit) return null
    if (sit === 'ATIVA') return null
    return {
      id: 'cnpj-irregular',
      titulo: 'Situação cadastral CNPJ irregular — regularizar primeiro',
      categoria: 'compliance',
      prioridade: 'p1',
      acao: 'Acionar contabilidade: regularizar pendências na Receita antes de qualquer proposta financeira',
      justificativa: `CNPJ com situação "${sit}". Sem CNPJ ativo o cliente fica fora de linhas de crédito, emissão de NF e CNDs.`,
      impactoEstimado: 'Destrava qualquer operação financeira subsequente',
    }
  },
}
