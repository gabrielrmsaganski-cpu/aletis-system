import type { ClienteParaAnalise } from '../AutoCalcOrchestrator.js'
import type { AnaliseCliente } from '../types.js'

/**
 * SmartAdvisor — camada declarativa que traduz o snapshot (`AnaliseCliente`)
 * em recomendações acionáveis para o consultor. Cada regra vive em seu
 * próprio arquivo para facilitar revisão pelo domínio (consultor pode ler
 * `rules/juros-excessivos.ts` e entender o que dispara sem mergulhar em
 * código de infra).
 */
export interface AdvisorContext {
  cliente: ClienteParaAnalise
  analise: AnaliseCliente
}

/** Prioridade da recomendação — P1 é urgente, P3 é "de olho". */
export type Prioridade = 'p1' | 'p2' | 'p3'

/** Categorias usadas para agrupar o painel de recomendações na UI. */
export type Categoria =
  | 'recuperacao' // reestruturar dívida, negociação imediata
  | 'oportunidade' // AB+S, Plano Safra, incentivos
  | 'relacionamento' // contato esfriando, próxima ação
  | 'compliance' // CAR, fiscal, documentação
  | 'estrategia' // diversificação, escala, fluxo

export interface Recommendation {
  /** Id estável (batе com rule.id) — permite UI destacar "nova" vs "persiste". */
  id: string
  titulo: string
  categoria: Categoria
  prioridade: Prioridade
  /** Ação sugerida em imperativo curto (ex.: "Agendar revisão de portfólio"). */
  acao: string
  /** Porque a regra foi acionada — evidência do snapshot. */
  justificativa: string
  /** Estimativa qualitativa de impacto (ex.: "R$ 50K/ano" ou "↓ 15% juros"). */
  impactoEstimado?: string
}

export interface AdvisorRule {
  id: string
  titulo: string
  categoria: Categoria
  prioridade: Prioridade
  /** Retorna a recomendação se a condição bater; null caso contrário. */
  evaluate(ctx: AdvisorContext): Recommendation | null
}
