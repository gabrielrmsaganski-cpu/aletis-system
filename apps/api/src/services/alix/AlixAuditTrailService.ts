// ============================================================
// AlixAuditTrailService — registra cada tool call do Orchestrator
// com source + confidence + latência para auditoria externa.
// ============================================================
// Toda resposta de chat ALIX devolve um `audit` no payload,
// permitindo a UI mostrar "ⓘ Fontes & ferramentas usadas".
//
// In-memory com TTL (1h) + append-only JSONL em
// storage/alix-audit/YYYY-MM-DD.jsonl para histórico.
// ============================================================
import { mkdirSync, existsSync } from 'fs'
import { appendFile } from 'fs/promises'
import { join } from 'path'

export interface ToolAuditEntry {
  toolName: string
  params: Record<string, unknown>
  /** Resultado serializado (truncado para 2KB) */
  resultSummary: string
  /** Indicador de sucesso baseado em result.ok ou ausência de erro */
  ok: boolean
  /** Quem alimentou esse dado (DB, API externa, regra, LLM, etc.) */
  source: string
  /** 0..1 — confiança no dado retornado */
  confidence: number
  /** Tempo de execução do handler */
  latencyMs: number
  ts: string
}

export interface AuditTrail {
  messageId: string
  sessionId: string
  toolCalls: ToolAuditEntry[]
  totalLatencyMs: number
  startedAt: string
  finishedAt: string
}

/**
 * Mapeia tool → { source canônica, confiança default }.
 * Tools determinísticas (queries, cálculos) ganham 0.95+.
 * Tools com web/scraping/LLM ganham 0.7-0.85.
 */
const TOOL_PROVENANCE: Record<string, { source: string; confidence: number }> = {
  // CRM
  buscar_cliente: { source: 'CRM (in-memory + PG)', confidence: 0.99 },
  listar_clientes: { source: 'CRM (in-memory + PG)', confidence: 0.99 },
  // Prospecção (PGFN local)
  buscar_lead: { source: 'PGFN local snapshot', confidence: 0.92 },
  listar_leads: { source: 'PGFN local snapshot', confidence: 0.92 },
  enrich_lead: { source: 'BrasilAPI + SICAR + scoring engine', confidence: 0.85 },
  // SICAR/CAR (live scraping)
  consultar_car: { source: 'SICAR oficial (scraping)', confidence: 0.78 },
  buscar_imovel_sicar: { source: 'SICAR live', confidence: 0.78 },
  // INCRA / SIGEF
  consultar_sigef: { source: 'INCRA SIGEF', confidence: 0.85 },
  // Calculators (deterministic)
  calc_dscr: { source: 'Engine financeiro local', confidence: 0.99 },
  calc_consorcio: { source: 'Engine financeiro local', confidence: 0.99 },
  calc_juros: { source: 'Engine financeiro local', confidence: 0.99 },
  calc_safra: { source: 'Engine financeiro local', confidence: 0.99 },
  // Mercado / clima
  cotacoes_hoje: { source: 'CONAB + BCB SGS + AwesomeAPI', confidence: 0.93 },
  briefing_cliente: { source: 'Snapshot diário ALIX', confidence: 0.9 },
  agenda_casos: { source: 'CRM + insights ALIX', confidence: 0.95 },
  memoria_cliente: { source: 'Memória markdown por cliente', confidence: 0.95 },
  clima_atual: { source: 'NASA POWER + INMET', confidence: 0.9 },
  clima_historico: { source: 'NASA POWER', confidence: 0.92 },
  zarc_cliente: { source: 'MAPA ZARC', confidence: 0.9 },
  // News / web
  buscar_noticias: { source: 'Tavily web search', confidence: 0.7 },
  // TJ / processos
  consultar_processos_tj: { source: 'DataJud (CNJ)', confidence: 0.9 },
  // Custeio / DSCR / Reestruturação (power tools)
  criar_plano_custeio: { source: 'CusteioService (PG)', confidence: 0.99 },
  simular_dscr: { source: 'Engine DSCR', confidence: 0.99 },
  simular_reestruturacao: { source: 'Engine reestruturação', confidence: 0.99 },
  // Portal / docs
  enviar_magic_link: { source: 'PortalTokenService + Resend/WA', confidence: 0.95 },
  criar_pendencia_documento: { source: 'PortalStore', confidence: 0.99 },
  // Inventário
  listar_inventario_cliente: { source: 'InventarioService', confidence: 0.97 },
  resumo_inventario_cliente: { source: 'InventarioService', confidence: 0.97 },
  // Insights / proativa
  listar_insights_pendentes: { source: 'ProactiveService (alix-insights/*.jsonl)', confidence: 0.96 },
  responder_insight: { source: 'Local journal alix-insights/responses.jsonl', confidence: 0.99 },
  // Alert rules
  definir_alerta_cliente: { source: 'AlertRulesService (alix-rules/*.json)', confidence: 0.99 },
  listar_alertas_cliente: { source: 'AlertRulesService', confidence: 0.99 },
  remover_alerta: { source: 'AlertRulesService', confidence: 0.99 },
  // Contratos oficiais
  listar_contratos_oficiais: { source: 'manifest dos templates', confidence: 0.99 },
  preview_contrato_oficial: { source: 'docxtemplater + manifest + cliente do CRM', confidence: 0.97 },
  gerar_contrato_oficial: { source: 'docxtemplater + manifest + cliente do CRM', confidence: 0.97 },
  // Aprendizado
  learnings_recentes: { source: 'FeedbackService (alix-feedback/*.jsonl)', confidence: 0.95 },
  // Deal Room Multi-Credor
  listar_negociacoes_cliente: { source: 'DealRoomService (PG)', confidence: 0.99 },
  resumo_negociacoes_cliente: { source: 'DealRoomService (PG agregado)', confidence: 0.99 },
  abrir_negociacao: { source: 'DealRoomService (PG insert)', confidence: 0.99 },
  atualizar_negociacao: { source: 'DealRoomService (PG update + histórico append)', confidence: 0.99 },
  adicionar_nota_negociacao: { source: 'DealRoomService (histórico append)', confidence: 0.99 },
}

function provenanceFor(toolName: string): { source: string; confidence: number } {
  return (
    TOOL_PROVENANCE[toolName] ?? {
      source: 'Tool customizada (sem provenance registrada)',
      confidence: 0.7,
    }
  )
}

function summarizeResult(result: unknown): { summary: string; ok: boolean } {
  if (result == null) return { summary: 'null', ok: false }
  if (typeof result === 'string') {
    return { summary: result.slice(0, 2000), ok: true }
  }
  try {
    const json = JSON.stringify(result)
    let ok = true
    if (typeof result === 'object' && result !== null) {
      const r = result as Record<string, unknown>
      if (r.ok === false || r.error) ok = false
    }
    return { summary: json.length > 2000 ? json.slice(0, 2000) + '…[truncado]' : json, ok }
  } catch {
    return { summary: String(result), ok: true }
  }
}

export class AlixAuditTrailService {
  private trails = new Map<string, AuditTrail>()
  private readonly storageDir: string

  constructor(storageDir: string) {
    this.storageDir = join(storageDir, 'alix-audit')
    if (!existsSync(this.storageDir)) {
      try { mkdirSync(this.storageDir, { recursive: true }) } catch {/* skip */}
    }
    // GC de trails antigos (TTL 1h)
    const gc = setInterval(() => this.pruneOld(), 5 * 60_000)
    if (gc.unref) gc.unref()
  }

  startTrail(messageId: string, sessionId: string): AuditTrail {
    const trail: AuditTrail = {
      messageId,
      sessionId,
      toolCalls: [],
      totalLatencyMs: 0,
      startedAt: new Date().toISOString(),
      finishedAt: '',
    }
    this.trails.set(messageId, trail)
    return trail
  }

  /** Registra uma execução de tool (chamado pelo onToolCall do Orchestrator). */
  recordToolCall(
    messageId: string,
    toolName: string,
    params: Record<string, unknown>,
    result: unknown,
    latencyMs: number,
  ): void {
    const trail = this.trails.get(messageId)
    if (!trail) return
    const { summary, ok } = summarizeResult(result)
    const prov = provenanceFor(toolName)
    trail.toolCalls.push({
      toolName,
      params,
      resultSummary: summary,
      ok,
      source: prov.source,
      confidence: prov.confidence,
      latencyMs,
      ts: new Date().toISOString(),
    })
  }

  finishTrail(messageId: string): AuditTrail | null {
    const trail = this.trails.get(messageId)
    if (!trail) return null
    trail.finishedAt = new Date().toISOString()
    trail.totalLatencyMs = trail.toolCalls.reduce((sum, t) => sum + t.latencyMs, 0)
    // persiste em jsonl best-effort
    const day = new Date().toISOString().slice(0, 10)
    appendFile(join(this.storageDir, `${day}.jsonl`), JSON.stringify(trail) + '\n').catch(() => {})
    return trail
  }

  getTrail(messageId: string): AuditTrail | null {
    return this.trails.get(messageId) ?? null
  }

  private pruneOld(): void {
    const cutoff = Date.now() - 60 * 60_000
    for (const [k, t] of this.trails.entries()) {
      const startedTs = new Date(t.startedAt).getTime()
      if (startedTs < cutoff) this.trails.delete(k)
    }
  }
}

let _instance: AlixAuditTrailService | null = null
export function getAlixAuditTrailService(storageDir?: string): AlixAuditTrailService {
  if (!_instance) {
    const dir = storageDir || process.env.ALIX_STORAGE_DIR || join(process.cwd(), 'storage')
    _instance = new AlixAuditTrailService(dir)
  }
  return _instance
}
