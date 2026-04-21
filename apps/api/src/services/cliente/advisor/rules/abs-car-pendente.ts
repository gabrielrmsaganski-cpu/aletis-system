import type { AdvisorRule } from '../types.js'

/**
 * Inelegibilidade por CAR ausente/pendente — desbloqueio de CAR é o passo
 * 1 para qualquer oportunidade de AB+S/Pronaf/Pronamp. Vale acionar mesmo
 * em parcial.
 */
export const rule: AdvisorRule = {
  id: 'abs-car-pendente',
  titulo: 'Regularizar CAR para destravar AB+S',
  categoria: 'compliance',
  prioridade: 'p2',
  evaluate: ({ cliente, analise }) => {
    const abs = analise.abs
    if (!abs) return null
    if (abs.nivelElegibilidade === 'integral') return null
    const falhaCAR = abs.checkpoints.find(
      (c) => c.item.includes('car') && c.status === 'falha',
    )
    if (!falhaCAR && cliente.car) return null // CAR existe e passou nos checks
    return {
      id: 'abs-car-pendente',
      titulo: 'Regularizar CAR para destravar AB+S',
      categoria: 'compliance',
      prioridade: 'p2',
      acao: 'Consultar SICAR, emitir CAR ou corrigir pendências ambientais — prerequisito para financiamentos sustentáveis',
      justificativa: falhaCAR
        ? `${falhaCAR.descricao}: ${falhaCAR.detalhes}`
        : 'Imóvel não possui CAR localizado — sem ele, cliente fica fora do AB+S, Pronaf Verde e linhas de crédito sustentável.',
      impactoEstimado: 'Destrava taxas de 6-9% a.a. vs 12-18% nas linhas convencionais',
    }
  },
}
