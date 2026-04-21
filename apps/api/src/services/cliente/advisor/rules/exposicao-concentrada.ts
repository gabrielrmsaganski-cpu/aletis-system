import type { AdvisorRule } from '../types.js'

/**
 * Área produtiva 100% em uma cultura única — alta volatilidade de
 * commodities amplifica risco. Regra só dispara se já tivermos exposição
 * cadastrada (evita ruído quando o campo ainda está vazio).
 */
export const rule: AdvisorRule = {
  id: 'exposicao-concentrada',
  titulo: 'Monocultura — avaliar diversificação da área',
  categoria: 'estrategia',
  prioridade: 'p3',
  evaluate: ({ cliente }) => {
    const exp = cliente.exposicaoCommodity ?? []
    if (exp.length !== 1) return null
    const areaExp = exp[0].areaHa
    const areaTotal = cliente.areaTotalHa ?? areaExp
    if (areaExp < areaTotal * 0.85) return null // Só alerta se >= 85% em uma cultura

    return {
      id: 'exposicao-concentrada',
      titulo: 'Monocultura — avaliar diversificação da área',
      categoria: 'estrategia',
      prioridade: 'p3',
      acao: `Sugerir rotação (ex.: segunda safra de milho ou crotalária) ou hedge de ${exp[0].commodity} para próxima safra`,
      justificativa: `100% da área explorada em ${exp[0].commodity} (${exp[0].areaHa} ha). Queda de preço ou quebra de safra na commodity tem impacto total na receita.`,
      impactoEstimado: 'Rotação + hedge reduzem variância da receita em 30-50%',
    }
  },
}
