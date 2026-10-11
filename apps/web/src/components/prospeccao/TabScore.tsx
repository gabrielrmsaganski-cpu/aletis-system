/**
 * TabScore — aba "Score ALETIS" do drawer de lead em Prospecção.
 *
 * Extraída de pages/Prospeccao.tsx (Onda B). Exibe breakdown do
 * score em barras + honorários estimados. Componente puro.
 */
import { DollarSign, Gavel, Calendar, Wheat, Tractor, Zap, MapPin, Archive, AlertTriangle } from 'lucide-react'
import type { LeadFull } from '../../pages/Prospeccao'
import { fmtBRL, CLASSIF_STYLE } from '../../pages/Prospeccao'

export function TabScore({ lead }: { lead: LeadFull }) {
  const b = lead.score.breakdown
  const m = lead.score.motivos
  const items: Array<{ label: string; value: number; max: number; icon: any; hint?: string }> = [
    { label: 'Tamanho da dívida', value: b.divida, max: 30, icon: DollarSign },
    { label: 'Ajuizamento (urgência)', value: b.ajuizamento, max: 15, icon: Gavel },
    { label: 'Recência da inscrição', value: b.recencia, max: 10, icon: Calendar },
    { label: 'Qualidade do sinal agro', value: b.agroMatch, max: 10, icon: Wheat },
    { label: 'Área estimada', value: b.hectares, max: 10, icon: Tractor },
    { label: 'Velocity do passivo', value: b.velocity ?? 0, max: 10, icon: Zap, hint: m?.velocity },
    { label: 'Fit regional ALETIS', value: b.fitRegional ?? 0, max: 15, icon: MapPin, hint: m?.fitRegional },
    { label: 'Cross-source', value: b.multiSource ?? 0, max: 5, icon: Archive, hint: m?.multiSource },
    { label: 'Crise pública (DOU)', value: b.douCrise ?? 0, max: 5, icon: AlertTriangle, hint: m?.douCrise },
  ]
  return (
    <>
      <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-4 bg-gradient-to-br from-aletis-verde/5 to-transparent">
        <p className="text-[11px] uppercase tracking-wider text-[var(--text-soft)] dark:text-white/50 mb-1">
          Score ALETIS
        </p>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-5xl font-bold text-foreground">{lead.score.total}</span>
          <span className="text-sm text-[var(--text-soft)] dark:text-white/50">/ 100</span>
          <span className="ml-auto text-sm font-semibold text-foreground dark:text-white">
            {CLASSIF_STYLE[lead.score.classificacao].label}
          </span>
        </div>
        <p className="text-xs text-[var(--text-soft)] dark:text-white/50 mt-1">
          Honorários estimados (1% dívida): <b className="text-aletis-dourado">{fmtBRL(lead.score.honorariosEstimados)}</b>
        </p>
      </div>

      <div className="space-y-2">
        {items.map((it) => {
          const Icon = it.icon
          const pct = it.max > 0 ? (it.value / it.max) * 100 : 0
          return (
            <div key={it.label}>
              <div className="flex items-center justify-between mb-1 text-xs">
                <span className="flex items-center gap-1.5 text-foreground dark:text-white">
                  <Icon size={12} /> {it.label}
                </span>
                <span className="font-mono text-[var(--text-soft)] dark:text-white/60">
                  {it.value} / {it.max}
                </span>
              </div>
              <div className="h-2 bg-aletis-bege dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-aletis-verde to-aletis-verde-medio rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {it.hint && (
                <p className="mt-0.5 text-[11px] italic text-[var(--text-soft)] dark:text-white/40">
                  {it.hint}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
