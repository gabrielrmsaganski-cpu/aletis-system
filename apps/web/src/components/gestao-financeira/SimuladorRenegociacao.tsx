// ============================================================
// SimuladorRenegociacao — modal que pega um contrato existente,
// permite alterar taxa/prazo/método e mostra impacto visual
// (gráfico antes×depois + economia em juros).
// ============================================================
import { useState, useEffect, useCallback, useMemo } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'
import { X, Loader2, TrendingDown, TrendingUp, DollarSign } from 'lucide-react'

interface Contrato {
  id: string
  credor: string
  contrato?: string | null
  valorFinanciado?: string | null
  prazoParcelas?: number | null
  taxaNominalAa?: string | null
  metodoCalculo: string
  periodicidade?: string | null
}

interface SimResult {
  ok: boolean
  contratoId: string
  credor: string
  original: { metodo: string; taxaPeriodo: number; prazo: number; totalJuros: number; totalParcelas: number }
  simulado: { metodo: string; taxaPeriodo: number; prazo: number; totalJuros: number; totalParcelas: number }
  economiaJuros: number
  diferencaTotal: number
}

interface Props {
  grupoId: string
  onClose: () => void
}

export default function SimuladorRenegociacao({ grupoId, onClose }: Props) {
  const [contratos, setContratos] = useState<Contrato[] | null>(null)
  const [contratoId, setContratoId] = useState<string | null>(null)
  const [novaTaxa, setNovaTaxa] = useState<number>(0)
  const [novoPrazo, setNovoPrazo] = useState<number>(0)
  const [novoMetodo, setNovoMetodo] = useState<string>('PRICE')
  const [resultado, setResultado] = useState<SimResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ contratos: Contrato[] }>(`/gestao-financeira/grupos/${grupoId}/contratos`)
      setContratos(r.contratos)
      if (r.contratos[0] && !contratoId) {
        setContratoId(r.contratos[0].id)
        setNovaTaxa(parseFloat(r.contratos[0].taxaNominalAa ?? '12'))
        setNovoPrazo(r.contratos[0].prazoParcelas ?? 60)
        setNovoMetodo(r.contratos[0].metodoCalculo)
      }
    } catch (e: any) {
      setError(String(e?.message ?? e))
    }
  }, [grupoId, contratoId])

  useEffect(() => {
    load()
  }, [load])

  const contratoAtual = useMemo(
    () => contratos?.find((c) => c.id === contratoId) ?? null,
    [contratos, contratoId],
  )

  // Quando trocar o contrato, atualiza defaults
  useEffect(() => {
    if (!contratoAtual) return
    setNovaTaxa(parseFloat(contratoAtual.taxaNominalAa ?? '12'))
    setNovoPrazo(contratoAtual.prazoParcelas ?? 60)
    setNovoMetodo(contratoAtual.metodoCalculo)
  }, [contratoId, contratoAtual])

  async function simular() {
    if (!contratoId) return
    setLoading(true)
    setError(null)
    try {
      // Usa endpoint do orchestrator? Não — usar tool diretamente via dashboard endpoint customizado.
      // Faremos chamada direta ao endpoint simular via tool ALIX (POST sem auth)
      const r = await apiFetch<SimResult>('/alix/run-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'simular_renegociacao_gf',
          input: {
            grupoId,
            contratoId,
            novaTaxaAa: novaTaxa,
            novoPrazoParcelas: novoPrazo,
            novoMetodo,
          },
        }),
      }).catch(async () => {
        // fallback: chamada direta ao service via endpoint dedicado (criar se não existe)
        const fallback = await apiFetch<SimResult>(`/gestao-financeira/grupos/${grupoId}/contratos/${contratoId}/simular`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ novaTaxaAa: novaTaxa, novoPrazoParcelas: novoPrazo, novoMetodo }),
        })
        return fallback
      })
      setResultado(r)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  if (error) {
    return (
      <ModalShell onClose={onClose} title="Simulador de Renegociação">
        <div className="text-xs text-red-600 p-4">{error}</div>
      </ModalShell>
    )
  }

  if (!contratos) {
    return (
      <ModalShell onClose={onClose} title="Simulador de Renegociação">
        <div className="text-xs text-aletis-grafite-claro p-4 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Carregando contratos…
        </div>
      </ModalShell>
    )
  }

  if (contratos.length === 0) {
    return (
      <ModalShell onClose={onClose} title="Simulador de Renegociação">
        <div className="text-xs text-aletis-grafite-claro p-4 text-center">
          Nenhum contrato cadastrado. Vá em Endividamento e adicione um contrato primeiro.
        </div>
      </ModalShell>
    )
  }

  // Dados para chart
  const chartData = resultado ? [
    { metric: 'Taxa período', original: resultado.original.taxaPeriodo * 100, simulado: resultado.simulado.taxaPeriodo * 100 },
    { metric: 'Prazo (m)', original: resultado.original.prazo, simulado: resultado.simulado.prazo },
    { metric: 'Total juros (mil)', original: resultado.original.totalJuros / 1000, simulado: resultado.simulado.totalJuros / 1000 },
    { metric: 'Total pago (mil)', original: resultado.original.totalParcelas / 1000, simulado: resultado.simulado.totalParcelas / 1000 },
  ] : []

  return (
    <ModalShell onClose={onClose} title="🔁 Simulador de Renegociação" subtitle="Compare antes × depois">
      <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Seleção de contrato */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-aletis-grafite-claro font-semibold">
            Contrato a renegociar
          </label>
          <select
            value={contratoId ?? ''}
            onChange={(e) => setContratoId(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg border border-aletis-grafite-claro/20 text-sm font-body"
          >
            {contratos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.credor} · {c.contrato ?? 'sem nº'} · R$ {parseFloat(c.valorFinanciado ?? '0').toLocaleString('pt-BR')} · {c.prazoParcelas}m {c.metodoCalculo}
              </option>
            ))}
          </select>
        </div>

        {contratoAtual && (
          <>
            {/* Sliders */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-aletis-cream/30 rounded-lg">
              <SliderField
                label="Nova taxa a.a."
                value={novaTaxa}
                onChange={setNovaTaxa}
                min={0}
                max={30}
                step={0.25}
                suffix="%"
                originalValue={parseFloat(contratoAtual.taxaNominalAa ?? '12')}
              />
              <SliderField
                label="Novo prazo (parcelas)"
                value={novoPrazo}
                onChange={setNovoPrazo}
                min={1}
                max={240}
                step={1}
                suffix="m"
                originalValue={contratoAtual.prazoParcelas ?? 60}
              />
              <div>
                <label className="text-[10px] uppercase tracking-wider text-aletis-grafite-claro font-semibold">
                  Novo método (atual: {contratoAtual.metodoCalculo})
                </label>
                <select
                  value={novoMetodo}
                  onChange={(e) => setNovoMetodo(e.target.value)}
                  className="w-full mt-1 px-2 py-1.5 rounded-lg border border-aletis-grafite-claro/20 text-sm"
                >
                  <option value="PRICE">PRICE (parcela fixa)</option>
                  <option value="SAC">SAC (capital fixo)</option>
                  <option value="BULLET">BULLET (juros + capital final)</option>
                </select>
              </div>
            </div>

            {/* Botão simular */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={simular}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-aletis-verde text-white text-sm font-body font-semibold hover:bg-aletis-verde-escuro inline-flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                Simular
              </button>
            </div>

            {/* Resultado */}
            {resultado && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <ResultCard
                    label="Economia em juros"
                    value={fmtBRL(resultado.economiaJuros)}
                    tone={resultado.economiaJuros > 0 ? 'good' : 'bad'}
                    icon={resultado.economiaJuros > 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                  />
                  <ResultCard
                    label="Diferença total pago"
                    value={fmtBRL(resultado.diferencaTotal)}
                    tone={resultado.diferencaTotal > 0 ? 'good' : 'bad'}
                  />
                  <ResultCard
                    label="Pct economia juros"
                    value={`${resultado.original.totalJuros > 0 ? ((resultado.economiaJuros / resultado.original.totalJuros) * 100).toFixed(1) : 0}%`}
                    tone={resultado.economiaJuros > 0 ? 'good' : 'bad'}
                  />
                </div>

                <div className="card-premium p-4">
                  <h4 className="text-xs font-display font-semibold text-aletis-grafite-escuro mb-2">
                    📊 Comparação visual
                  </h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData}>
                      <XAxis dataKey="metric" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="original" stroke="#A0392F" strokeWidth={2} name="Original" />
                      <Line type="monotone" dataKey="simulado" stroke="#0F4C35" strokeWidth={2.5} name="Simulado" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="card-premium p-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-red-700 font-semibold">📋 Original</p>
                    <p className="text-sm font-body mt-1">{resultado.original.metodo} · {resultado.original.prazo}m</p>
                    <p className="text-sm font-body">Total juros: {fmtBRL(resultado.original.totalJuros)}</p>
                    <p className="text-sm font-body">Total pago: {fmtBRL(resultado.original.totalParcelas)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-aletis-verde font-semibold">✨ Simulado</p>
                    <p className="text-sm font-body mt-1">{resultado.simulado.metodo} · {resultado.simulado.prazo}m</p>
                    <p className="text-sm font-body">Total juros: {fmtBRL(resultado.simulado.totalJuros)}</p>
                    <p className="text-sm font-body">Total pago: {fmtBRL(resultado.simulado.totalParcelas)}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ModalShell>
  )
}

function SliderField({
  label, value, onChange, min, max, step, suffix, originalValue,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  suffix: string
  originalValue: number
}) {
  const delta = value - originalValue
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-[10px] uppercase tracking-wider text-aletis-grafite-claro font-semibold">
          {label}
        </label>
        <span className="text-[10px] text-aletis-grafite-claro">orig: {originalValue}{suffix}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1"
        />
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          step={step}
          className="w-20 px-2 py-1 text-sm text-right tabular-nums rounded border border-aletis-grafite-claro/20"
        />
      </div>
      <div className="text-[10px] mt-0.5 tabular-nums">
        Δ: <span className={delta > 0 ? 'text-amber-600' : delta < 0 ? 'text-aletis-verde' : 'text-aletis-grafite-claro'}>
          {delta > 0 ? '+' : ''}{delta.toFixed(2)}{suffix}
        </span>
      </div>
    </div>
  )
}

function ResultCard({ label, value, tone, icon }: { label: string; value: string; tone: 'good' | 'bad' | 'neutral'; icon?: React.ReactNode }) {
  const cls = tone === 'good' ? 'border-l-aletis-verde bg-aletis-verde/5'
    : tone === 'bad' ? 'border-l-red-500 bg-red-50'
    : 'border-l-aletis-grafite-claro/30'
  return (
    <div className={`card-premium p-3 border-l-4 ${cls}`}>
      <div className="flex items-center gap-1.5">
        {icon && <span className={tone === 'good' ? 'text-aletis-verde' : tone === 'bad' ? 'text-red-600' : ''}>{icon}</span>}
        <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-claro font-semibold">{label}</p>
      </div>
      <p className="text-base font-display font-bold text-aletis-grafite-escuro tabular-nums mt-0.5">{value}</p>
    </div>
  )
}

function ModalShell({ onClose, title, subtitle, children }: { onClose: () => void; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl">
        <header className="px-5 py-4 border-b border-aletis-grafite-claro/15 flex items-center justify-between">
          <div>
            <h2 className="text-base font-display font-semibold text-aletis-grafite-escuro">{title}</h2>
            {subtitle && <p className="text-[11px] text-aletis-grafite-claro mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-aletis-grafite-escuro/5 flex items-center justify-center">
            <X className="w-5 h-5 text-aletis-grafite-claro" />
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

function fmtBRL(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
