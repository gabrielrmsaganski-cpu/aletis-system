import type { AdvisorRule } from '../types.js'

/**
 * SRAI crítico — score ≤ 30 sinaliza risco agudo. Consultor deve priorizar
 * reestruturação imediata antes que o caso piore para judicialização.
 */
export const rule: AdvisorRule = {
  id: 'srai-critico',
  titulo: 'Caso em risco agudo — reestruturar em até 30 dias',
  categoria: 'recuperacao',
  prioridade: 'p1',
  evaluate: ({ analise }) => {
    const srai = analise.srai
    if (!srai) return null
    if (srai.classificacao !== 'critico') return null
    return {
      id: 'srai-critico',
      titulo: 'Caso em risco agudo — reestruturar em até 30 dias',
      categoria: 'recuperacao',
      prioridade: 'p1',
      acao: 'Agendar reunião de urgência e montar plano de reestruturação com alongamento + proteção patrimonial',
      justificativa: `SRAI ${srai.scoreTotal} (crítico). Dívida/patrimônio, atraso máximo e vulnerabilidade climática combinados indicam risco iminente de execução.`,
      impactoEstimado: 'Evita ajuizamento e eventual perda de garantias — impacto de 20-40% do valor em disputa',
    }
  },
}
