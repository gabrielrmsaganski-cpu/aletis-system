/**
 * TabDivida — aba "Dívida" do drawer de lead em Prospecção.
 *
 * Extraída de pages/Prospeccao.tsx (Onda B). Mostra agregação por
 * fonte (PGFN/RFB/FGTS), distribuição por situação jurídica,
 * principais tipos de crédito e tabela detalhada de inscrições.
 */
import { useMemo, useState } from 'react'
import { Gavel } from 'lucide-react'
import type { LeadFull } from '../../pages/Prospeccao'
import {
  fmtBRL,
  fmtBRLShort,
  FONTE_LABEL,
  shortTipoCredito,
  situacaoBucket,
  SITUACAO_STYLE,
  type SituacaoBucket,
} from '../../pages/Prospeccao'

export function TabDivida({ lead }: { lead: LeadFull }) {
  const [showAll, setShowAll] = useState(false)
  const groupedByFonte = useMemo(() => {
    const m = new Map<string, { count: number; total: number; ajuizadas: number }>()
    for (const d of lead.debts) {
      const e = m.get(d.fonte) || { count: 0, total: 0, ajuizadas: 0 }
      e.count++
      e.total += d.valor
      if (d.ajuizado) e.ajuizadas++
      m.set(d.fonte, e)
    }
    return Array.from(m.entries())
      .map(([fonte, v]) => ({ fonte, ...v }))
      .sort((a, b) => b.total - a.total)
  }, [lead.debts])

  const situacaoAgg = useMemo(() => {
    const m = new Map<SituacaoBucket, { count: number; total: number }>()
    for (const d of lead.debts) {
      const key = situacaoBucket(d.situacao)
      const e = m.get(key) || { count: 0, total: 0 }
      e.count++
      e.total += d.valor
      m.set(key, e)
    }
    return Array.from(m.entries())
      .map(([bucket, v]) => ({ bucket, ...v }))
      .sort((a, b) => b.total - a.total)
  }, [lead.debts])

  const tipoAgg = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>()
    for (const d of lead.debts) {
      const key = shortTipoCredito(d.tipoCredito || 'OUTROS') || 'OUTROS'
      const e = m.get(key) || { count: 0, total: 0 }
      e.count++
      e.total += d.valor
      m.set(key, e)
    }
    return Array.from(m.entries())
      .map(([tipo, v]) => ({ tipo, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
  }, [lead.debts])

  const sortedDebts = useMemo(
    () => [...lead.debts].sort((a, b) => b.valor - a.valor),
    [lead.debts],
  )
  const visibleDebts = showAll ? sortedDebts : sortedDebts.slice(0, 50)
  const ajuizadasTotal = lead.debts.filter((d) => d.ajuizado).length

  return (
    <div className="space-y-4">
      {/* Sub-totais por FONTE (FGTS / PREV / NÃO-PREV) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {groupedByFonte.map((g) => {
          const meta = FONTE_LABEL[g.fonte] || { label: g.fonte, desc: '' }
          return (
            <div key={g.fonte} className="bg-aletis-bege/50 dark:bg-white/5 rounded-lg p-3 border border-aletis-borda dark:border-white/10">
              <p className="text-[11px] uppercase tracking-wider text-[var(--text-soft)] dark:text-white/50">{meta.label}</p>
              <p className="font-display text-lg font-bold text-foreground dark:text-white">{fmtBRLShort(g.total)}</p>
              <p className="text-[11px] text-[var(--text-soft)] dark:text-white/50">
                {g.count} inscrições{g.ajuizadas > 0 ? ` · ${g.ajuizadas} ajuizadas` : ''}
              </p>
              {meta.desc && (
                <p className="text-[11px] text-[var(--text-soft)] dark:text-white/40 mt-1 leading-tight">{meta.desc}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Distribuição por SITUAÇÃO — leitura jurídica */}
      <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-3 bg-white/60 dark:bg-black/10">
        <p className="text-[11px] uppercase tracking-wider text-[var(--text-soft)] dark:text-white/50 mb-2">
          Situação das inscrições
        </p>
        <div className="flex flex-wrap gap-2">
          {situacaoAgg.map((s) => {
            const st = SITUACAO_STYLE[s.bucket]
            return (
              <span key={s.bucket} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${st.chip}`}>
                {st.label}
                <span className="opacity-70">· {s.count}</span>
                <span className="font-mono">· {fmtBRLShort(s.total)}</span>
              </span>
            )
          })}
          {ajuizadasTotal > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800">
              <Gavel size={10} /> Ajuizadas total · {ajuizadasTotal}
            </span>
          )}
        </div>
      </div>

      {/* Distribuição por tipo de crédito */}
      {tipoAgg.length > 0 && (
        <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-3">
          <p className="text-[11px] uppercase tracking-wider text-[var(--text-soft)] dark:text-white/50 mb-2">
            Principais tipos de crédito (top {tipoAgg.length})
          </p>
          <div className="space-y-1">
            {tipoAgg.map((t) => {
              const pct = Math.min(100, Math.round((t.total / Math.max(1, lead.totalDivida)) * 100))
              return (
                <div key={t.tipo} className="flex items-center gap-3 text-xs">
                  <span className="flex-1 min-w-0 truncate text-foreground dark:text-white" title={t.tipo}>{t.tipo}</span>
                  <span className="text-[var(--text-soft)] dark:text-white/50 text-[11px]">{t.count}×</span>
                  <span className="font-mono font-semibold text-foreground dark:text-white w-24 text-right">{fmtBRLShort(t.total)}</span>
                  <div className="w-16 h-1.5 rounded-full bg-aletis-borda/40 dark:bg-white/10 overflow-hidden">
                    <div className="h-full bg-aletis-verde" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tabela detalhada — cada inscrição com tipo de crédito legível */}
      <div className="overflow-x-auto rounded-lg border border-aletis-borda dark:border-white/10">
        <table className="ui-table w-full text-xs">
          <thead className="bg-aletis-bege/50 dark:bg-white/5 text-[var(--text-soft)] dark:text-white/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Fonte</th>
              <th className="text-left px-3 py-2 font-medium">Inscrição</th>
              <th className="text-left px-3 py-2 font-medium">Tipo de crédito</th>
              <th className="text-left px-3 py-2 font-medium">Situação</th>
              <th className="text-left px-3 py-2 font-medium">Data</th>
              <th className="text-center px-3 py-2 font-medium">Ajuiz.</th>
              <th className="text-right px-3 py-2 font-medium">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-aletis-borda dark:divide-white/5">
            {visibleDebts.map((d, i) => {
              const st = SITUACAO_STYLE[situacaoBucket(d.situacao)]
              const fonteLabel = FONTE_LABEL[d.fonte]?.label ?? d.fonte
              return (
                <tr key={`${d.fonte}-${d.inscricao}-${i}`} className="hover:bg-aletis-bege/30 dark:hover:bg-white/5">
                  <td className="px-3 py-2 whitespace-nowrap text-[11px] font-semibold text-foreground dark:text-white">{fonteLabel}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-[var(--text-soft)] dark:text-white/60">{d.inscricao}</td>
                  <td className="px-3 py-2 truncate max-w-[220px]" title={d.tipoCredito}>{shortTipoCredito(d.tipoCredito)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border ${st.chip}`} title={d.situacao}>
                      {st.label}
                    </span>
                    {d.tipoSituacao && (
                      <span className="ml-1 text-[11px] text-[var(--text-soft)] dark:text-white/40">· {d.tipoSituacao}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-[11px]">{d.dataInscricao}</td>
                  <td className="px-3 py-2 text-center">
                    {d.ajuizado ? (
                      <span className="text-red-600 dark:text-red-400" title="Ajuizada">●</span>
                    ) : (
                      <span className="text-[var(--text-soft)] dark:text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold whitespace-nowrap">{fmtBRL(d.valor)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-aletis-verde/5 border-t-2 border-aletis-verde">
            <tr>
              <td colSpan={6} className="px-3 py-2 text-right font-semibold text-foreground dark:text-white">Total</td>
              <td className="px-3 py-2 text-right font-mono font-bold text-foreground">{fmtBRL(lead.totalDivida)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {lead.debts.length > 50 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full text-[11px] text-foreground hover:underline py-1"
        >
          {showAll ? `Mostrar apenas as 50 maiores` : `Ver todas as ${lead.debts.length} inscrições`}
        </button>
      )}
    </div>
  )
}
