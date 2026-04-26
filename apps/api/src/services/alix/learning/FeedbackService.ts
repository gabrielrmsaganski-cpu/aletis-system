// ============================================================
// FeedbackService — aprendizado da ALIX a partir do Christian
// ============================================================
// Ciclo: após cada resposta do Alix, o Christian pode marcar:
//   - util            (funcionou, repetir o padrão)
//   - irrelevante     (perdi tempo, mas não é errado)
//   - incorreto       (dado/conclusão errada — CUIDADO)
//   - off-tom         (certo mas entregue de forma ruim)
//
// Campos: { msgId, sessionId, rating, notas?, agent?, tools?, ts }
// Persiste em storage/alix-feedback/YYYY-MM.jsonl (append-only).
//
// Consumo:
//   - OrchestratorService.buildSystemPrompt() injeta bloco
//     "LIÇÕES RECENTES" com os últimos 10 feedbacks negativos
//     → o LLM vê o que está sendo taxado como errado e evita.
//   - Tool learnings_recentes retorna o histórico para o LLM
//     inspecionar sob demanda.
//   - Futuro (Fase D): ranking de tools mais-úteis × menos-úteis
//     baseado em feedback agregado.
// ============================================================
import { promises as fs, existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'

export type FeedbackRating = 'util' | 'irrelevante' | 'incorreto' | 'off-tom'

export interface FeedbackEntry {
  ts: string
  msgId: string
  sessionId: string
  rating: FeedbackRating
  notas?: string
  agent?: string
  tools?: string[]
}

export interface Learning {
  rating: FeedbackRating
  resumo: string
  quando: string
}

export class FeedbackService {
  constructor(private readonly storageDir: string) {
    const dir = join(this.storageDir, 'alix-feedback')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }

  private fileFor(d: Date = new Date()): string {
    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    return join(this.storageDir, 'alix-feedback', `${m}.jsonl`)
  }

  record(entry: Omit<FeedbackEntry, 'ts'>): FeedbackEntry {
    const full: FeedbackEntry = { ts: new Date().toISOString(), ...entry }
    try {
      appendFileSync(this.fileFor(), JSON.stringify(full) + '\n')
    } catch (err) {
      console.warn('[FeedbackService] append falhou:', (err as Error).message)
    }

    // Wave-PG-17: dual-write best-effort no Postgres
    void (async () => {
      try {
        const repo = await import('../../../db/AlixConfirmationFeedbackRepository.js')
        await repo.appendFeedback(full as unknown as Parameters<typeof repo.appendFeedback>[0])
      } catch (err) {
        console.warn('[FeedbackService.record] dual-write PG falhou:', (err as Error).message)
      }
    })()

    return full
  }

  /** Últimos N feedbacks do mês atual + anterior (para janela mais realista). */
  async recent(limit = 50): Promise<FeedbackEntry[]> {
    const out: FeedbackEntry[] = []
    const now = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    for (const d of [prev, now]) {
      const file = this.fileFor(d)
      if (!existsSync(file)) continue
      const raw = await fs.readFile(file, 'utf-8')
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        try { out.push(JSON.parse(line)) } catch { /* skip */ }
      }
    }
    return out.sort((a, b) => a.ts.localeCompare(b.ts)).slice(-limit)
  }

  /** Lições curtas para injetar no system prompt — só os negativos recentes. */
  async recentLearnings(limit = 10): Promise<Learning[]> {
    const all = await this.recent(200)
    const negativos = all.filter((f) => f.rating === 'incorreto' || f.rating === 'irrelevante' || f.rating === 'off-tom')
    return negativos.slice(-limit).map((f) => ({
      rating: f.rating,
      resumo: (f.notas || `${f.rating} em msg ${f.msgId.slice(0, 8)}`).slice(0, 200),
      quando: f.ts.slice(0, 10),
    }))
  }

  /** Agregado de feedback por ferramenta — quais tools geram mais util vs incorreto. */
  async toolRanking(): Promise<Array<{ tool: string; util: number; incorreto: number; irrelevante: number; score: number }>> {
    const all = await this.recent(500)
    const agg = new Map<string, { util: number; incorreto: number; irrelevante: number; offTom: number }>()
    for (const f of all) {
      for (const tool of f.tools || []) {
        const e = agg.get(tool) || { util: 0, incorreto: 0, irrelevante: 0, offTom: 0 }
        if (f.rating === 'util') e.util++
        else if (f.rating === 'incorreto') e.incorreto++
        else if (f.rating === 'irrelevante') e.irrelevante++
        else if (f.rating === 'off-tom') e.offTom++
        agg.set(tool, e)
      }
    }
    return Array.from(agg.entries())
      .map(([tool, e]) => ({
        tool,
        util: e.util,
        incorreto: e.incorreto,
        irrelevante: e.irrelevante,
        // Score simples: útil - incorreto*2 - irrelevante*0.5 - off*0.3
        score: e.util - e.incorreto * 2 - e.irrelevante * 0.5 - e.offTom * 0.3,
      }))
      .sort((a, b) => b.score - a.score)
  }
}

// ── Singleton ─────────────────────────────────────────────────
let _instance: FeedbackService | null = null
export function getFeedbackService(storageDir?: string): FeedbackService {
  if (!_instance) {
    const dir = storageDir || process.env.ALIX_STORAGE_DIR || join(process.cwd(), 'storage')
    _instance = new FeedbackService(dir)
  }
  return _instance
}
