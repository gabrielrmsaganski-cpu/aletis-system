// ============================================================
// StressTestModal — slider live de delta preço × rendimento
// com recálculo em tempo real (debounced).
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { X, Thermometer } from 'lucide-react'

interface StressResult {
  deltaPrecoPct: number
  deltaRendimentoPct: number
  original: { receitaTotal: number; ebitdaTotal: number }
  stressed: { receitaTotal: number; ebitdaTotal: number }
  impacto: { deltaReceita: number; deltaEbitda: number; pctImpactoReceita: number; pctImpactoEbitda: number }
  porSafra: Array<{ safra: string; original: { receita: number; ebitda: number }; stressed: { receita: number; ebitda: number } }>
}

interface Props {
  grupoId: string
  onClose: () => void
}

export default function StressTestModal({ grupoId, onClose }: Props) {
  const [deltaPreco, setDeltaPreco] = useState(-20)
  const [deltaRend, setDeltaRend] = useState(-10)
  const [result, setResult] = useState<StressResult | null>(null)
  const [loading, setLoading] = useState(false)

  const run = useCallback(async (dp: number, dr: number) => {
    setLoading(true)
    try {
      const r = await apiFetch<StressResult>(`/gestao-financeira/grupos/${grupoId}/stress-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deltaPrecoPct: dp, deltaRendimentoPct: dr }),
      })
      setResult(r)
    } finally {
      setLoading(false)
    }
  }, [grupoId])

  useEffect(() => {
    const t = setTimeout(() => run(deltaPreco, deltaRend), 350)
    return () => clearTimeout(t)
  }, [deltaPreco, deltaRend, run])

  const chartData = result?.porSafra.map((s) => ({
    safra: s.safra,
    Receita_Original: s.original.receita,
    Receita_Stress: s.stressed.receita,
    EBITDA_Original: s.original.ebitda,
    EBITDA_Stress: s.stressed.ebitda,
  })) ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <header className="px-5 py-4 border-b border-aletis-grafite-claro/15 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Thermometer className="w-5 h-5 text-amber-600" />
            <div>
              <h2 className="text-base font-display font-semibold text-aletis-grafite-escuro">Stress Test</h2>
              <p className="text-[11px] text-aletis-grafite-claro">Simule queda de preço × rendimento e veja impacto na receita/EBITDA</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-aletis-grafite-escuro/5 flex items-center justify-center">
            <X className="w-5 h-5 text-aletis-grafite-claro" />
          </button>
        </header>

        <div className="p-4 space-y-4">
          {/* Sliders */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-aletis-cream/30 rounded-lg">
            <SliderField label="Delta de preço" value={deltaPreco} onChange={setDeltaPreco} min={-50} max={50} step={1} />
            <SliderField label="Delta de rendimento" value={deltaRend} onChange={setDeltaRend} min={-50} max={50} step={1} />
          </div>

          {/* KPIs */}
          {result && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Receita original" value={fmtBRL(result.original.receitaTotal)} />
              <Kpi label="Receita stressed" value={fmtBRL(result.stressed.receitaTotal)} tone={result.stressed.receitaTotal < result.original.receitaTotal ? 'bad' : 'good'} />
              <Kpi label="EBITDA original" value={fmtBRL(result.original.ebitdaTotal)} />
              <Kpi label="EBITDA stressed" value={fmtBRL(result.stressed.ebitdaTotal)} tone={result.stressed.ebitdaTotal < result.original.ebitdaTotal ? 'bad' : 'good'} />
              <Kpi label="Δ Receita" value={`${result.impacto.pctImpactoReceita.toFixed(1)}%`} tone={result.impacto.pctImpactoReceita < 0 ? 'bad' : 'good'} />
              <Kpi label="Δ EBITDA" value={`${result.impacto.pctImpactoEbitda.toFixed(1)}%`} tone={result.impacto.pctImpactoEbitda < 0 ? 'bad' : 'good'} />
              <Kpi label="Δ R$ Receita" value={fmtBRL(result.impacto.deltaReceita)} tone={result.impacto.deltaReceita < 0 ? 'bad' : 'good'} />
              <Kpi label="Δ R$ EBITDA" value={fmtBRL(result.impacto.deltaEbitda)} tone={result.impacto.deltaEbitda < 0 ? 'bad' : 'good'} />
            </div>
          )}

          {/* Chart por safra */}
          {chartData.length > 0 && (
            <div className="card-premium p-3">
              <h4 className="text-xs font-display font-semibold text-aletis-grafite-escuro mb-2">📊 Comparação por safra</h4>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <XAxis dataKey="safra" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => fmtBRL(v as number)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Receita_Original" fill="#0F4C35" />
                  <Bar dataKey="Receita_Stress" fill="#A0392F" />
                  <Bar dataKey="EBITDA_Original" fill="#D4A574" />
                  <Bar dataKey="EBITDA_Stress" fill="#7B5B30" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {loading && <p className="text-[11px] text-aletis-grafite-claro text-center">⏳ recalculando…</p>}
        </div>
      </div>
    </div>
  )
}

function SliderField({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-[11px] uppercase tracking-wider text-aletis-grafite-claro font-semibold">{label}</label>
        <span className={`text-sm font-display font-bold tabular-nums ${value < 0 ? 'text-red-600' : value > 0 ? 'text-aletis-verde' : ''}`}>
          {value > 0 ? '+' : ''}{value}%
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full mt-1"
      />
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const cls = tone === 'good' ? 'border-l-aletis-verde' : tone === 'bad' ? 'border-l-red-500' : 'border-l-aletis-grafite-claro/30'
  return (
    <div className={`card-premium p-2 border-l-4 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-claro">{label}</p>
      <p className="text-sm font-display font-bold tabular-nums">{value}</p>
    </div>
  )
}

function fmtBRL(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
