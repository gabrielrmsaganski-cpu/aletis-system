// ============================================================
// ALETIS — Alix Memory Types (Wave 9 — MEMORY)
// Tipos compartilhados entre AlixMemoryService e BriefingService.
// Memória é persistida como Markdown por clienteId em
//   apps/api/storage/alix-memory/{clienteId}.md
// ============================================================

/** Item de histórico com data ISO + texto livre. */
export interface MemoriaHistoricoItem {
  data: string
  texto: string
}

/**
 * Estrutura canônica da memória de um cliente. Campos em lista
 * são agregados por append no upsert (vide AlixMemoryService.upsert).
 */
export interface MemoriaCliente {
  clienteId: string
  clienteNome: string
  atualizadoEm: string
  perfil: string[]
  dividasAtivas: string[]
  decisoes: string[]
  proximasAcoes: string[]
  alertas: string[]
  historico: MemoriaHistoricoItem[]
}

/** Nome das seções listáveis que aceitam appendNota. */
export type SecaoNota =
  | 'proximas-acoes'
  | 'alertas'
  | 'historico'
  | 'decisoes'

/** Metadados retornados por list(). */
export interface MemoriaListItem {
  clienteId: string
  clienteNome: string
  atualizadoEm: string
  bytes: number
}

/** Severidade dos destaques do briefing. */
export type SeveridadeDestaque = 'info' | 'atencao' | 'critico'

/** Item de destaque do briefing diário. */
export interface BriefingDestaque {
  titulo: string
  detalhe: string
  severidade: SeveridadeDestaque
}

/** Status das perspectivas BSC no briefing. */
export type StatusPerspectivaBriefing = 'verde' | 'amarelo' | 'vermelho'

/** Resumo BSC por perspectiva no briefing. */
export interface BriefingKpiBsc {
  perspectiva: string
  status: StatusPerspectivaBriefing
  nota: string
}

/** Registro da análise; sua presença não comprova dívida ativa ou saldo atual. */
export interface BriefingDivida {
  credor: string
  /** Valor numérico explícito na fonte. Ausência nunca equivale a zero. */
  saldoBRL: number | null
  status: string
  origem: 'analise.saldoRecalculado.porDivida'
  naturezaSaldo: 'informado_na_analise' | 'nao_informado'
  situacaoAtual: 'nao_verificada'
}

/** Texto histórico/declarativo: não extrair dele saldo, situação ou titularidade. */
export interface BriefingReferenciaFinanceiraMemoria {
  texto: string
  origem: 'memoria'
  /** Data da memória, não data-base da posição financeira. */
  memoriaAtualizadaEm: string
  saldoAtualBRL: null
  situacaoAtual: 'nao_verificada'
}

export interface BriefingResumoFinanceiro {
  registrosNaAnalise: number
  registrosComSaldoInformado: number
  registrosSemSaldoInformado: number
  referenciasMemoriaNaoConciliadas: number
  coberturaSaldosNaAnalise: 'sem_registros' | 'nenhum_informado' | 'parcial' | 'todos_informados'
  /** Estas fontes não comprovam uma posição atual conciliada. */
  saldoAtualTotalBRL: null
  situacaoAtual: 'nao_verificada'
}

/**
 * Briefing proativo — produto do BriefingService.gerar().
 * Determinístico (sem LLM nesta fase).
 */
export interface Briefing {
  clienteId: string
  clienteNome: string
  geradoEm: string
  resumoExecutivo: string
  destaques: BriefingDestaque[]
  proximasAcoes: string[]
  kpisBscResumo?: BriefingKpiBsc[]
  /** Nome legado da API: contém apenas registros da análise, não dívidas confirmadas. */
  dividasAtivas: BriefingDivida[]
  referenciasFinanceirasMemoria: BriefingReferenciaFinanceiraMemoria[]
  resumoFinanceiro: BriefingResumoFinanceiro
  sugestaoPrimeiraAcao: string
  markdown: string
}
