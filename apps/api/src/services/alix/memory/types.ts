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

/** Dívida ativa resumida no briefing. */
export interface BriefingDivida {
  credor: string
  saldoBRL: number
  status: string
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
  dividasAtivas: BriefingDivida[]
  sugestaoPrimeiraAcao: string
  markdown: string
}
