// ============================================================
// MacroShiftService — snapshot diário + detecção de shift macro
// ============================================================
// Wave B2 — captura snapshot do mercado todo dia (Selic, USD, IPCA,
// commodities) e compara com t-1 e t-7. Quando |Δ| > threshold por
// indicador, dispara insight `macro-shift` (push se crítico).
//
// Storage: storage/macro-history.jsonl (append-only, 1 linha por dia).
// Janela de comparação:
//   - Δ24h: hoje vs último snapshot
//   - Δ7d:  hoje vs snapshot mais próximo de 7 dias atrás
//
// Thresholds default (configuráveis via env):
//   - Selic:       50 bp (0.5%)  → crítico se >100 bp
//   - USD/BRL:      3% em 24h    → crítico se >5%
//   - IPCA 12m:    50 bp em 7d
//   - Commodity:    5% em 7d     → crítico se >10%
// ============================================================

import { mkdirSync, existsSync, readFileSync } from 'fs'
import { appendFile } from 'fs/promises'
import { join } from 'path'
import type { MarketBrief, MoverItem } from '../MarketBriefService.js'

export interface MacroSnapshot {
  data: string  // YYYY-MM-DD
  ts: string    // ISO completo
  selic: number | null
  ipca12m: number | null
  cdi: number | null
  igpm12m: number | null
  usd: number | null
  eur: number | null
  commodities: Record<string, number>  // simbolo→preco
}

export interface MacroShift {
  indicador: string
  valorAtual: number
  valorReferencia: number
  delta: number
  deltaPct: number | null
  janela: '24h' | '7d'
  urgencia: 'info' | 'importante' | 'critico'
  descricao: string
}

export class MacroShiftService {
  private readonly file: string
  private readonly storageDir: string

  constructor(storageDir: string) {
    this.storageDir = storageDir
    this.file = join(storageDir, 'macro-history.jsonl')
    if (!existsSync(storageDir)) mkdirSync(storageDir, { recursive: true })
  }

  /** Lê todos os snapshots (jsonl). Cap em 365 linhas para não estourar memória. */
  loadHistory(): MacroSnapshot[] {
    if (!existsSync(this.file)) return []
    try {
      const raw = readFileSync(this.file, 'utf-8').trim()
      if (!raw) return []
      const lines = raw.split('\n').slice(-365)
      return lines.map(l => JSON.parse(l)).filter(Boolean)
    } catch (err) {
      console.warn('[MacroShift] falha lendo history:', (err as Error).message)
      return []
    }
  }

  /** Persiste snapshot do dia se ainda não existe. Idempotente por data. */
  async snapshotIfNeeded(brief: MarketBrief): Promise<MacroSnapshot | null> {
    const hoje = brief.data
    const history = this.loadHistory()
    if (history.some(h => h.data === hoje)) return null

    const commoditiesMap: Record<string, number> = {}
    for (const c of brief.commodities) commoditiesMap[c.simbolo.toLowerCase()] = c.preco

    const snap: MacroSnapshot = {
      data: hoje,
      ts: new Date().toISOString(),
      selic: brief.macro.selic,
      ipca12m: brief.macro.ipca12m,
      cdi: brief.macro.cdi,
      igpm12m: brief.macro.igpm12m,
      usd: brief.cambio.usd,
      eur: brief.cambio.eur,
      commodities: commoditiesMap,
    }
    await appendFile(this.file, JSON.stringify(snap) + '\n')
    return snap
  }

  /**
   * Detecta shifts comparando o snapshot atual com t-1 e t-7.
   * Não persiste — só retorna o diff. ProactiveService decide se emite insight.
   */
  detectShifts(currentBrief: MarketBrief, history: MacroSnapshot[]): MacroShift[] {
    const shifts: MacroShift[] = []
    if (history.length === 0) return shifts

    const ordered = [...history].sort((a, b) => a.data.localeCompare(b.data))
    const t1 = ordered[ordered.length - 1] // último snapshot anterior
    const targetT7 = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)
    const t7 = ordered.reverse().find(h => h.data <= targetT7) || null

    // Thresholds via env (com defaults sensatos)
    const TH_SELIC_BP = Number(process.env.MACRO_TH_SELIC_BP) || 50
    const TH_USD_PCT = Number(process.env.MACRO_TH_USD_PCT) || 3
    const TH_IPCA_BP = Number(process.env.MACRO_TH_IPCA_BP) || 50
    const TH_COMM_PCT = Number(process.env.MACRO_TH_COMMODITY_PCT) || 5

    // ── Selic (24h)
    if (currentBrief.macro.selic != null && t1?.selic != null) {
      const delta = (currentBrief.macro.selic - t1.selic) * 100  // em bp
      if (Math.abs(delta) >= TH_SELIC_BP) {
        shifts.push({
          indicador: 'Selic',
          valorAtual: currentBrief.macro.selic,
          valorReferencia: t1.selic,
          delta,
          deltaPct: t1.selic !== 0 ? ((currentBrief.macro.selic - t1.selic) / t1.selic) * 100 : null,
          janela: '24h',
          urgencia: Math.abs(delta) >= TH_SELIC_BP * 2 ? 'critico' : 'importante',
          descricao: `Selic ${delta >= 0 ? 'sobe' : 'cai'} ${Math.abs(delta).toFixed(0)}bp (${t1.selic.toFixed(2)}% → ${currentBrief.macro.selic.toFixed(2)}%) desde ${t1.data}.`,
        })
      }
    }

    // ── Dólar (24h)
    if (currentBrief.cambio.usd != null && t1?.usd != null && t1.usd > 0) {
      const deltaPct = ((currentBrief.cambio.usd - t1.usd) / t1.usd) * 100
      if (Math.abs(deltaPct) >= TH_USD_PCT) {
        shifts.push({
          indicador: 'USD/BRL',
          valorAtual: currentBrief.cambio.usd,
          valorReferencia: t1.usd,
          delta: currentBrief.cambio.usd - t1.usd,
          deltaPct,
          janela: '24h',
          urgencia: Math.abs(deltaPct) >= TH_USD_PCT * 1.7 ? 'critico' : 'importante',
          descricao: `Dólar ${deltaPct >= 0 ? 'sobe' : 'cai'} ${Math.abs(deltaPct).toFixed(2)}% (R$${t1.usd.toFixed(2)} → R$${currentBrief.cambio.usd.toFixed(2)}) desde ${t1.data}.`,
        })
      }
    }

    // ── IPCA 12m (7d)
    if (t7?.ipca12m != null && currentBrief.macro.ipca12m != null) {
      const delta = (currentBrief.macro.ipca12m - t7.ipca12m) * 100  // bp
      if (Math.abs(delta) >= TH_IPCA_BP) {
        shifts.push({
          indicador: 'IPCA 12m',
          valorAtual: currentBrief.macro.ipca12m,
          valorReferencia: t7.ipca12m,
          delta,
          deltaPct: t7.ipca12m !== 0 ? ((currentBrief.macro.ipca12m - t7.ipca12m) / t7.ipca12m) * 100 : null,
          janela: '7d',
          urgencia: Math.abs(delta) >= TH_IPCA_BP * 1.5 ? 'critico' : 'importante',
          descricao: `IPCA 12m ${delta >= 0 ? 'subiu' : 'caiu'} ${Math.abs(delta).toFixed(0)}bp em 7 dias (${t7.ipca12m.toFixed(2)}% → ${currentBrief.macro.ipca12m.toFixed(2)}%).`,
        })
      }
    }

    // ── Commodities (7d preferencial; 24h fallback)
    const ref = t7 || t1
    if (ref) {
      for (const c of currentBrief.commodities) {
        const sim = c.simbolo.toLowerCase()
        const refPreco = ref.commodities?.[sim]
        if (refPreco == null || refPreco <= 0) continue
        const deltaPct = ((c.preco - refPreco) / refPreco) * 100
        if (Math.abs(deltaPct) >= TH_COMM_PCT) {
          shifts.push({
            indicador: c.nome,
            valorAtual: c.preco,
            valorReferencia: refPreco,
            delta: c.preco - refPreco,
            deltaPct,
            janela: ref === t7 ? '7d' : '24h',
            urgencia: Math.abs(deltaPct) >= TH_COMM_PCT * 2 ? 'critico' : 'importante',
            descricao: `${c.nome} ${deltaPct >= 0 ? 'subiu' : 'caiu'} ${Math.abs(deltaPct).toFixed(2)}% (R$${refPreco.toFixed(2)} → R$${c.preco.toFixed(2)}) ${c.unidade.replace('R$/', '/')}.`,
          })
        }
      }
    }

    return shifts
  }
}

let _instance: MacroShiftService | null = null
export function getMacroShiftService(storageDir?: string): MacroShiftService {
  if (!_instance) {
    const dir = storageDir || process.env.ALIX_STORAGE_DIR || join(process.cwd(), 'storage')
    _instance = new MacroShiftService(dir)
  }
  return _instance
}
