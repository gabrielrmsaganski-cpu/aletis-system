// ============================================================
// SnapshotDiffModal — comparação A/B de 2 snapshots lado-a-lado
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { ArrowRight, GitCompareArrows, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import AppDialog from '../ui/AppDialog'

interface Snapshot {
  id: number
  tipo: string
  calculadoEm: string
  resumo?: any
}

interface DiffResult {
  a: { id: number; tipo: string; calculadoEm: string; kpis: any }
  b: { id: number; tipo: string; calculadoEm: string; kpis: any }
  diff: {
    ebitda: number
    divida: number
    diviPorEbitda: number
    margemEbitda: number
    saldoFinal: number
  }
}

interface Props {
  grupoId: string
  onClose: () => void
}

export default function SnapshotDiffModal({ grupoId, onClose }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null)
  const [a, setA] = useState<number | null>(null)
  const [b, setB] = useState<number | null>(null)
  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ snapshots: Snapshot[] }>(`/gestao-financeira/grupos/${grupoId}/snapshots`)
      setSnapshots(r.snapshots)
      if (r.snapshots.length >= 2) {
        setA(r.snapshots[1].id) // mais antigo
        setB(r.snapshots[0].id) // mais recente
      } else if (r.snapshots.length === 1) {
        setA(r.snapshots[0].id)
      }
    } catch (e: any) {
      setError(String(e?.message ?? e))
    }
  }, [grupoId])

  useEffect(() => { load() }, [load])

  async function comparar() {
    if (!a || !b) return
    setLoading(true)
    setError(null)
    try {
      const r = await apiFetch<DiffResult>(`/gestao-financeira/snapshots/${a}/diff/${b}`)
      setDiff(r)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppDialog
      title="Comparar snapshots"
      eyebrow="Diff A/B"
      subtitle="Compare duas fotos do diagnóstico lado a lado e veja a variação dos KPIs principais."
      icon={<GitCompareArrows className="h-5 w-5" />}
      onClose={onClose}
      size="xl"
      bodyClassName="space-y-4"
    >
          {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">{error}</div>}

          {!snapshots && <div className="text-xs text-muted-foreground">Carregando…</div>}

          {snapshots && snapshots.length < 2 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              Você precisa de pelo menos 2 snapshots para comparar. Crie snapshots com etiquetas (ex: "pre-renegociacao", "proposta-banco-X") na toolbar.
            </div>
          )}

          {snapshots && snapshots.length >= 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <SnapshotPicker label="Snapshot A (referência)" snapshots={snapshots} value={a} onChange={setA} />
              <SnapshotPicker label="Snapshot B (atual)" snapshots={snapshots} value={b} onChange={setB} />
            </div>
          )}

          {snapshots && snapshots.length >= 2 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={comparar}
                disabled={!a || !b || a === b || loading}
                className="px-4 py-1.5 rounded-lg bg-aletis-verde text-white text-xs font-body font-semibold hover:bg-aletis-verde-escuro disabled:opacity-50"
              >
                {loading ? '⏳' : '📊'} Comparar
              </button>
            </div>
          )}

          {diff && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SnapshotCard label="A" snap={diff.a} tone="warn" />
                <SnapshotCard label="B" snap={diff.b} tone="good" />
              </div>

              <div className="card-premium p-4">
                <h4 className="text-xs font-display font-semibold text-foreground mb-3">📈 Variação A → B</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <DiffRow label="EBITDA total" valueA={diff.a.kpis.ebitdaTotal ?? 0} valueB={diff.b.kpis.ebitdaTotal ?? 0} fmt={fmtBRL} positiveIsGood />
                  <DiffRow label="Margem EBITDA" valueA={diff.a.kpis.margemEbitda ?? 0} valueB={diff.b.kpis.margemEbitda ?? 0} fmt={(v) => `${(v * 100).toFixed(1)}%`} positiveIsGood />
                  <DiffRow label="Dívida total" valueA={diff.a.kpis.dividaTotal ?? 0} valueB={diff.b.kpis.dividaTotal ?? 0} fmt={fmtBRL} positiveIsGood={false} />
                  <DiffRow label="Dívida/EBITDA" valueA={diff.a.kpis.diviPorEbitda ?? 0} valueB={diff.b.kpis.diviPorEbitda ?? 0} fmt={(v) => `${v.toFixed(2)}x`} positiveIsGood={false} />
                  <DiffRow label="Saldo final acum" valueA={diff.a.kpis.saldoFinalAcumulado ?? 0} valueB={diff.b.kpis.saldoFinalAcumulado ?? 0} fmt={fmtBRL} positiveIsGood />
                </div>
              </div>

              <div className="card-premium p-3 bg-aletis-cream/30">
                <p className="text-xs font-body text-foreground">
                  <strong>Resumo:</strong>{' '}
                  EBITDA {fmtDelta(diff.diff.ebitda, fmtBRL)} ·
                  Dívida {fmtDelta(diff.diff.divida, fmtBRL, true)} ·
                  D/E {fmtDelta(diff.diff.diviPorEbitda, (v) => v.toFixed(2) + 'x', true)} ·
                  Saldo final {fmtDelta(diff.diff.saldoFinal, fmtBRL)}
                </p>
              </div>
            </div>
          )}
    </AppDialog>
  )
}

function SnapshotPicker({ label, snapshots, value, onChange }: { label: string; snapshots: Snapshot[]; value: number | null; onChange: (id: number) => void }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full mt-1 px-3 py-2 rounded-lg border border-aletis-grafite-claro/20 text-sm font-body"
      >
        <option value="">selecione…</option>
        {snapshots.map((s) => (
          <option key={s.id} value={s.id}>
            #{s.id} · {s.tipo} · {new Date(s.calculadoEm).toLocaleString('pt-BR')}
          </option>
        ))}
      </select>
    </div>
  )
}

function SnapshotCard({ label, snap, tone }: { label: string; snap: any; tone: 'good' | 'warn' }) {
  const cls = tone === 'good' ? 'border-l-aletis-verde bg-aletis-verde/5' : 'border-l-amber-500 bg-amber-50/30'
  return (
    <div className={`card-premium p-3 border-l-4 ${cls}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2 py-0.5 rounded-full bg-card text-[11px] font-bold uppercase">{label}</span>
        <span className="text-xs font-body font-semibold">#{snap.id}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">{snap.tipo}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{new Date(snap.calculadoEm).toLocaleString('pt-BR')}</p>
      <div className="mt-2 space-y-1 text-[11px] tabular-nums">
        <div>EBITDA: <strong>{fmtBRL(snap.kpis.ebitdaTotal ?? 0)}</strong></div>
        <div>Dívida: <strong>{fmtBRL(snap.kpis.dividaTotal ?? 0)}</strong></div>
        <div>D/EBITDA: <strong>{(snap.kpis.diviPorEbitda ?? 0).toFixed(2)}x</strong></div>
      </div>
    </div>
  )
}

function DiffRow({ label, valueA, valueB, fmt, positiveIsGood }: { label: string; valueA: number; valueB: number; fmt: (v: number) => string; positiveIsGood: boolean }) {
  const delta = valueB - valueA
  const isUp = delta > 0
  const isGood = positiveIsGood ? isUp : !isUp
  const Icon = delta === 0 ? Minus : isUp ? TrendingUp : TrendingDown
  const cls = delta === 0 ? 'text-muted-foreground' : isGood ? 'text-foreground' : 'text-red-600'
  return (
    <div className="flex items-center gap-2 text-xs font-body p-2 rounded bg-aletis-cream/30">
      <span className="text-[11px] uppercase text-muted-foreground min-w-[110px]">{label}</span>
      <span className="tabular-nums">{fmt(valueA)}</span>
      <ArrowRight className="w-3 h-3 text-muted-foreground" />
      <span className="tabular-nums font-semibold">{fmt(valueB)}</span>
      <span className={`ml-auto inline-flex items-center gap-1 tabular-nums ${cls}`}>
        <Icon className="w-3 h-3" />
        {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${fmt(delta)}`}
      </span>
    </div>
  )
}

function fmtDelta(v: number, fmt: (n: number) => string, invertColor = false): string {
  if (v === 0) return `0 (sem mudança)`
  const sign = v > 0 ? '+' : ''
  return `${sign}${fmt(v)}`
}

function fmtBRL(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
