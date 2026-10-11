// ============================================================
// WeeklyReportService — relatório executivo semanal (Wave B3)
// ============================================================
// Compila um sumário executivo da semana:
//   1. KPIs CRM (clientes ativos por estágio, novos da semana)
//   2. Mercado: variação 7d soja/milho/boi/USD/Selic
//   3. Insights da semana (top 5 críticos + agregado por tipo)
//   4. Pendências em aberto (insights não-respondidos)
//   5. Sugestão de foco
//
// Disparo: cron seg 08:03 local. Push via AlixPushChannel.
// Endpoint manual: POST /api/alix/weekly-report/run, GET /preview.
// ============================================================
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getProspeccaoService } from '../../prospeccao/ProspeccaoService.js'
import { MarketBriefService } from '../../MarketBriefService.js'
import { DataSourceManager } from '../../DataSourceManager.js'
import { getProactiveService } from '../ProactiveService.js'
import { getAlixPushChannel, type PushResult } from './AlixPushChannel.js'
import { getMacroShiftService, observedPriceChange } from '../MacroShiftService.js'

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const s = v >= 0 ? '+' : ''
  return `${s}${v.toFixed(2).replace('.', ',')}%`
}

function fmtBRL2(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `R$${v.toFixed(2).replace('.', ',')}`
}

export class WeeklyReportService {
  constructor(private readonly storageDir: string) {}

  async buildReport(): Promise<string> {
    const hoje = new Date()
    const inicioSemana = new Date(hoje.getTime() - 7 * 86400_000)
    const periodo = `${inicioSemana.toLocaleDateString('pt-BR')} → ${hoje.toLocaleDateString('pt-BR')}`

    const partes: string[] = []
    partes.push('📈 *ALIX · Relatório Executivo Semanal*')
    partes.push(`_${periodo}_`)
    partes.push('')

    // ── 1. KPIs CRM ─────────────────────────────────────────
    try {
      const { alixGetClientes } = await import('../../AlixService.js')
      const clientes = alixGetClientes()
      const porEstagio: Record<string, number> = {}
      let novosNaSemana = 0
      for (const c of clientes) {
        const e = String(c.estagio || 'sem-estagio')
        porEstagio[e] = (porEstagio[e] ?? 0) + 1
        if (c.criadoEm) {
          const cdt = new Date(c.criadoEm)
          if (cdt >= inicioSemana) novosNaSemana++
        }
      }
      partes.push('👥 *CRM*')
      partes.push(`Total: ${clientes.length} · Novos na semana: ${novosNaSemana}`)
      const ordemEstagios = ['prospeccao', 'analise', 'negociacao', 'proposta', 'fechamento', 'acordo', 'encerrado', 'arquivado']
      const linhas = ordemEstagios
        .filter(e => porEstagio[e])
        .map(e => `• ${e}: ${porEstagio[e]}`)
      // adiciona estágios fora da ordem padrão
      for (const [e, n] of Object.entries(porEstagio)) {
        if (!ordemEstagios.includes(e)) linhas.push(`• ${e}: ${n}`)
      }
      partes.push(...linhas)
    } catch (err) {
      partes.push('👥 *CRM*\n_(indisponível)_')
    }
    partes.push('')

    // ── 2. Mercado da semana ────────────────────────────────
    try {
      const brief = await new MarketBriefService(DataSourceManager.getInstance()).generateBrief()
      partes.push('📊 *Mercado · variação 7d*')

      // Snapshot t-7 do macro-history para comparação real
      const macro = getMacroShiftService(this.storageDir)
      const history = macro.loadHistory()

      const linhas: string[] = []
      // Câmbio
      if (brief.cambio.usd != null) {
        const ref = macro.comparableReference(brief, history, 'usd', '7d')?.usd
        const variacao = ref ? observedPriceChange(brief.cambio.usd, ref)?.percent ?? null : null
        linhas.push(`• USD/BRL: ${fmtBRL2(brief.cambio.usd)} (${fmtPct(variacao)} 7d)`)
      }
      // Selic
      if (brief.macro.selic != null) {
        const ref = macro.comparableReference(brief, history, 'selic', '7d')?.selic
        const variacao = ref != null ? brief.macro.selic - ref : null
        linhas.push(`• Selic: ${brief.macro.selic.toFixed(2)}% ${variacao != null ? `(${variacao >= 0 ? '+' : ''}${variacao.toFixed(2)} p.p. 7d)` : ''}`)
      }
      // Commodities
      for (const c of brief.commodities) {
        const variacao = c.variacao7d
        const sinal = variacao == null ? 'variação indisponível' : variacao >= 0 ? '↑' : '↓'
        linhas.push(`• ${c.nome}: ${c.preco.toLocaleString('pt-BR')} ${c.unidade} ${sinal} ${fmtPct(variacao)}`)
      }
      partes.push(...linhas)
    } catch (err) {
      partes.push('📊 *Mercado · variação 7d*\n_(indisponível)_')
    }
    partes.push('')

    // ── 3. Insights da semana ───────────────────────────────
    try {
      const proactive = getProactiveService(getProspeccaoService(), this.storageDir)
      const insights = await proactive.getRecentInsights(7)
      const porTipo: Record<string, number> = {}
      for (const i of insights) porTipo[i.tipo] = (porTipo[i.tipo] ?? 0) + 1

      const ordenado = Object.entries(porTipo).sort((a, b) => b[1] - a[1])
      partes.push('🔔 *Insights da semana*')
      partes.push(`Total: ${insights.length}`)
      for (const [tipo, n] of ordenado.slice(0, 6)) {
        partes.push(`• ${tipo}: ${n}`)
      }

      const criticos = insights.filter(i => i.urgencia === 'critico').slice(0, 5)
      if (criticos.length) {
        partes.push('')
        partes.push('🔴 *Top críticos*')
        for (const i of criticos) {
          const dia = i.ts.slice(0, 10)
          partes.push(`• [${dia}] ${i.titulo}`)
        }
      }
    } catch (err) {
      partes.push('🔔 *Insights da semana*\n_(indisponível)_')
    }
    partes.push('')

    // ── 4. Pendências em aberto ─────────────────────────────
    try {
      const proactive = getProactiveService(getProspeccaoService(), this.storageDir)
      const all = await proactive.getRecentInsights(7)
      // carrega responses para descontar
      const respondidos = new Set<string>()
      const responsesFile = join(this.storageDir, 'alix-insights', 'responses.jsonl')
      if (existsSync(responsesFile)) {
        try {
          const raw = readFileSync(responsesFile, 'utf-8').trim()
          for (const line of raw.split('\n')) {
            if (!line) continue
            const r = JSON.parse(line)
            if (r?.insightId) respondidos.add(r.insightId)
          }
        } catch {/* skip */}
      }
      const pendentes = all.filter(i =>
        !respondidos.has(i.id) &&
        (i.urgencia === 'critico' || i.urgencia === 'importante')
      )
      partes.push('⏳ *Pendências em aberto*')
      partes.push(`${pendentes.length} insights aguardando ação (urgência ≥ importante)`)
      if (pendentes.length > 0) {
        partes.push('_Use "responder_insight" no chat para fechar o loop._')
      }
    } catch (err) {
      // silencioso
    }
    partes.push('')

    // ── 5. Sugestão de foco ─────────────────────────────────
    partes.push('🎯 *Foco sugerido para a semana*')
    partes.push('Pergunte à ALIX: "qual cliente da minha carteira tem maior risco essa semana e por quê?"')
    partes.push('— ela cruza shifts macro, deals stuck e insights pendentes para responder.')

    return partes.join('\n')
  }

  /**
   * Gera relatório e envia via push (force=true bypassa rate-limit/dedupe
   * porque é semanal e tem que chegar). Retorna PushResult para logs.
   */
  async sendWeeklyReport(): Promise<PushResult> {
    const texto = await this.buildReport()
    const channel = getAlixPushChannel(this.storageDir)
    return channel.send({ body: texto, opts: { tag: 'report:semanal', force: true } })
  }
}

let _instance: WeeklyReportService | null = null
export function getWeeklyReportService(storageDir?: string): WeeklyReportService {
  if (!_instance) {
    const dir = storageDir || process.env.ALIX_STORAGE_DIR || `${process.cwd()}/storage`
    _instance = new WeeklyReportService(dir)
  }
  return _instance
}
