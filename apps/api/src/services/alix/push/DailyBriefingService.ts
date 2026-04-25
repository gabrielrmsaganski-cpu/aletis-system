// ============================================================
// DailyBriefingService — resumo diário da ALIX (Fase A)
// ============================================================
// Compila em um texto WhatsApp-friendly:
//   1. Panorama de mercado (commodities, câmbio, macro)
//   2. Insights críticos/importantes recentes (48h)
//   3. Agenda: HITL pendentes, hot-leads, casos em andamento
//   4. Top 3 ações sugeridas
//
// Dispara via AlixPushChannel. Timing: cron 7h local (definido no
// ProactiveService). Evita fins de semana por default (env override).
// ============================================================
import { getProspeccaoService } from '../../prospeccao/ProspeccaoService.js'
import { MarketBriefService } from '../../MarketBriefService.js'
import { DataSourceManager } from '../../DataSourceManager.js'
import { getProactiveService } from '../ProactiveService.js'
import { getAlixConfirmationStore } from '../AlixConfirmationStore.js'
import { getAlixPushChannel, type PushResult } from './AlixPushChannel.js'

function fmtBRL(v: number): string {
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(1).replace('.', ',')} bi`
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1).replace('.', ',')} mi`
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)} mil`
  return `R$ ${v.toFixed(0)}`
}

function fmtVar(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const s = v >= 0 ? '+' : ''
  return `${s}${v.toFixed(2).replace('.', ',')}%`
}

export class DailyBriefingService {
  constructor(private readonly storageDir: string) {}

  /**
   * Monta o texto do briefing (WhatsApp-ready, 800-1600 chars típicos).
   * Erros em qualquer seção não derrubam o briefing todo — degrada.
   */
  async buildBriefing(): Promise<string> {
    const dia = new Date().toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    })

    const partes: string[] = []
    partes.push(`☀️ *ALIX · Briefing diário*`)
    partes.push(`_${dia.charAt(0).toUpperCase() + dia.slice(1)}_`)
    partes.push('')

    // ── 1. Mercado ──────────────────────────────────────────────
    try {
      const brief = await new MarketBriefService(DataSourceManager.getInstance()).generateBrief()
      partes.push('📊 *Mercado hoje*')
      const topAltas = brief.topAltas.slice(0, 3)
      const topBaixas = brief.topBaixas.slice(0, 2)
      if (topAltas.length) {
        partes.push(`🟢 ${topAltas.map((m) => `${m.simbolo} ${fmtVar(m.variacao7d)}`).join(' · ')}`)
      }
      if (topBaixas.length) {
        partes.push(`🔴 ${topBaixas.map((m) => `${m.simbolo} ${fmtVar(m.variacao7d)}`).join(' · ')}`)
      }
      const macro = brief.macro
      const macroBits: string[] = []
      if (macro.dolar != null) macroBits.push(`USD R$ ${macro.dolar.toFixed(2).replace('.', ',')}`)
      if (macro.selic != null) macroBits.push(`Selic ${macro.selic.toFixed(2).replace('.', ',')}%`)
      if (macro.ipca12m != null) macroBits.push(`IPCA12m ${macro.ipca12m.toFixed(2).replace('.', ',')}%`)
      if (macroBits.length) partes.push(macroBits.join(' · '))
      if (brief.narrativaCurta) partes.push(`_${brief.narrativaCurta}_`)
    } catch (err) {
      partes.push('📊 *Mercado hoje*\n_(briefing de mercado indisponível)_')
    }
    partes.push('')

    // ── 2. Agenda ──────────────────────────────────────────────
    try {
      const prospec = getProspeccaoService()
      const stats = prospec.stats()
      const pendings = (getAlixConfirmationStore() as any).list?.() ?? []
      const pendingsOpen = Array.isArray(pendings) ? pendings.length : 0
      partes.push('📂 *Sua agenda*')
      partes.push(
        `• ${stats.hotLeadsPendentes ?? 0} hot-leads aguardando contato`,
      )
      partes.push(
        `• ${stats.leadsParaReengajar ?? 0} para reengajar (>15d sem interação)`,
      )
      partes.push(`• ${pendingsOpen} confirmações HITL abertas`)
    } catch (err) {
      partes.push('📂 *Sua agenda*\n_(indisponível)_')
    }
    partes.push('')

    // ── 3. Insights recentes (48h) ─────────────────────────────
    try {
      const proactive = getProactiveService(getProspeccaoService(), this.storageDir)
      const insights = await proactive.getRecentInsights(2)
      const criticos = insights.filter((i) => i.urgencia === 'critico').slice(0, 3)
      const importantes = insights.filter((i) => i.urgencia === 'importante').slice(0, 2)
      if (criticos.length > 0 || importantes.length > 0) {
        partes.push('🚨 *Atenção (últimas 48h)*')
        for (const i of criticos) partes.push(`🔴 ${i.titulo}`)
        for (const i of importantes) partes.push(`🟡 ${i.titulo}`)
      } else {
        partes.push('🚨 *Atenção (últimas 48h)*')
        partes.push('_Nenhum sinal crítico novo — portfólio estável._')
      }
    } catch (err) {
      // silencioso
    }
    partes.push('')

    // ── 4. Sugestão de próxima ação ────────────────────────────
    partes.push('🎯 *Sugestão de foco hoje*')
    partes.push(
      'Abrir a ALIX e pedir: "estruturar proposta para o hot-lead de maior dívida" — ela cruza tudo e monta cenário com números.',
    )

    return partes.join('\n')
  }

  /**
   * Gera briefing e envia via push. Retorna o resultado para logs.
   * Pula automaticamente fins-de-semana quando ALIX_BRIEFING_SKIP_WEEKEND=true.
   */
  async sendDailyBriefing(): Promise<PushResult | { skipped: true; reason: string }> {
    const skipWeekend = (process.env.ALIX_BRIEFING_SKIP_WEEKEND || 'false').toLowerCase() === 'true'
    if (skipWeekend) {
      const dow = new Date().getDay() // 0=dom, 6=sab
      if (dow === 0 || dow === 6) {
        return { skipped: true, reason: 'weekend' }
      }
    }
    const texto = await this.buildBriefing()
    const channel = getAlixPushChannel(this.storageDir)
    return channel.sendBriefing(texto, { tag: 'briefing:diario' })
  }
}

// ── Singleton ─────────────────────────────────────────────────
let _instance: DailyBriefingService | null = null
export function getDailyBriefingService(storageDir?: string): DailyBriefingService {
  if (!_instance) {
    const dir = storageDir || process.env.ALIX_STORAGE_DIR || `${process.cwd()}/storage`
    _instance = new DailyBriefingService(dir)
  }
  return _instance
}
