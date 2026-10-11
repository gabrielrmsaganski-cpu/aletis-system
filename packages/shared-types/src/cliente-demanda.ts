export type ClienteDemandaStatus =
  | 'nova'
  | 'em_analise'
  | 'em_proposta'
  | 'negociacao'
  | 'aprovada'
  | 'concluida'
  | 'suspensa'
  | 'cancelada'

export type ClienteDemandaPrioridade = 'baixa' | 'normal' | 'alta' | 'urgente'

export type ClienteDemandaOrigem = 'manual' | 'proposta_existente' | 'cadastro_ia' | 'gestao_financeira'

export type ClienteDemandaCategoria =
  | 'credito'
  | 'renegociacao'
  | 'juridico'
  | 'tributario'
  | 'investimento'
  | 'operacional'
  | 'outro'

export type ClienteDemandaEventoTipo =
  | 'nota'
  | 'contato'
  | 'proposta'
  | 'documento'
  | 'status'
  | 'tarefa'
  | 'sistema'

export interface ClienteDemandaEvento {
  id: string
  tipo: ClienteDemandaEventoTipo
  titulo: string
  descricao?: string
  autor?: string
  criadoEm: string
}

export interface ClienteDemandaChecklistItem {
  id: string
  titulo: string
  concluido: boolean
  responsavel?: string
  prazo?: string
  concluidoEm?: string
  criadoEm: string
}

export interface ClienteDemanda {
  id: string
  clienteId: string
  numero: number
  titulo: string
  assunto: string
  descricao?: string
  categoria: ClienteDemandaCategoria
  status: ClienteDemandaStatus
  prioridade: ClienteDemandaPrioridade
  responsavel?: string
  credor?: string
  valorPretendido?: string
  prazoAlvo?: string
  proximaAcao?: string
  proximaAcaoEm?: string
  probabilidade: number
  resultadoEsperado?: string
  propostaPrincipalId?: string
  origem: ClienteDemandaOrigem
  propostaIds: string[]
  documentoIds: string[]
  eventos: ClienteDemandaEvento[]
  checklist: ClienteDemandaChecklistItem[]
  tags: string[]
  metadata: Record<string, unknown>
  criadoEm: string
  atualizadoEm: string
}
