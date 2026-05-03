// ============================================================
// types/cliente — tipos canônicos do domínio Cliente.
//
// Antes desta consolidação, "interface Cliente" estava definido em 6
// lugares (CRM, Negociacoes, ContratosOficiais, ALIX, useClienteData,
// ClienteDetalhes legacy) com shapes ligeiramente divergentes — risco
// de drift e refatoração custosa. Agora cada arquivo importa daqui.
// ============================================================

/** Estágios canônicos do funil ALETIS (vocabulário do CRM e backend). */
export type Estagio =
  | 'lead'
  | 'qualificacao'
  | 'analise'
  | 'proposta'
  | 'negociacao'
  | 'acordo'
  | 'acompanhamento'
  | 'concluido'
  | 'prospeccao'
  | 'encerrado'

/**
 * Mínimo absoluto para referenciar um cliente em listas curtas
 * (ex: dropdowns do ALIX, seletor de cliente em Contratos/Negociações).
 */
export interface ClienteSummary {
  id: string
  nome: string
}

/**
 * Linha de tabela / card de cliente — adiciona localização e contato
 * básico. Usado em Contratos Oficiais, Carteira do Consultor.
 */
export interface ClienteListItem extends ClienteSummary {
  cidade?: string
  uf?: string
  cpfCnpj?: string
  estagio?: Estagio | string
  consultor?: string
  telefone?: string
  email?: string
  saudeFinanceira?: number
}

/**
 * Próxima ação do consultor (CRUD inline em vários lugares).
 */
export interface ProximaAcao {
  data: string
  descricao: string
  criadoEm?: string
}

/**
 * Card de CRM — Lista/Kanban exibe esses campos.
 */
export interface ClienteCard extends ClienteListItem {
  credor?: string
  valorDivida?: number
  tags?: string[]
  proximaAcao?: ProximaAcao | null
  estagioDesde?: string
  ultimaAtualizacao?: string
  culturas?: string[]
  areaTotalHa?: number
}

/**
 * O tipo full está em `components/cliente/workspace/useClienteData.ts`
 * (devolve com dívidas, exposição, visitas etc). Re-export aqui para
 * referência centralizada — qualquer consumidor que precise do payload
 * completo deve importar daqui.
 */
export type { Cliente, DividaResumo, SraiResult, AbsResult } from '../components/cliente/workspace/useClienteData'
