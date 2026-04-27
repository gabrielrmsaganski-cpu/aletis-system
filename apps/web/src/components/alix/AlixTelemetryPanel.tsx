/**
 * AlixTelemetryPanel — painel compacto de uso/custo da ALIX.
 *
 * Consome `/api/alix/telemetry-dashboard?period=day|month` e mostra:
 *   - Custo do dia + % do limite (semáforo verde/amarelo/vermelho)
 *   - Custo do mês + % do limite
 *   - Total de requests + tokens (input + output) + cache read
 *   - P50 / P95 / P99 de latência
 *   - Top 5 tools mais chamadas
 *   - Lista de alertas (warn/crit)
 *
 * Usa polling 60s (telemetria não muda em segundos).
 */
import { useEffect, useState, useMemo } from 'react'
import {
  Activity, AlertTriangle, Sparkles, Clock, DollarSign, Loader2, RefreshCw, X,
} from 'lucide-react'
import { apiFetch } from '../../hooks/useApi'

interface TelemetryDashboard {
  period: 'day' | 'month' | 'all'
  geradoEm: string
  totals: {
    requests: number
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    thinkingTokens: number
    costUsd: number
    avgLatencyMs: number
  }
  custoHoje: number
  custoMes: number
  limites: { mensal: number; diario: number }
  latencia: { p50: number; p95: number; p99: number }
  byModel: Record<string, { requests: number; costUsd: number; inputTokens: number; outputTokens: number }>
  topTools: Array<{ tool: string; count: number }>
  alerts: Array<{ level: 'info' | 'warn' | 'crit'; msg: string }>
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

function formatUSD(v: number): string {
  return `US$ ${v.toFixed(2)}`
}

function formatPct(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0%'
  return `${Math.round((numerator / denominator) * 100)}%`
}

function ringColor(used: number, limit: number): string {
  const pct = limit > 0 ? used / limit : 0
  if (pct >= 1) return 'text-red-500 stroke-red-500'
  if (pct >= 0.8) return 'text-aletis-gold-escuro stroke-aletis-gold'
  return 'text-aletis-verde-medio stroke-aletis-verde-medio'
}

function CostRing({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit > 0 ? Math.min(1, used / limit) : 0
  const dash = pct * 264 // 2π * 42
  const color = ringColor(used, limit)
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-[72px] h-[72px] flex-shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.06)" strokeWidth="6" fill="none" />
          <circle cx="50" cy="50" r="42" strokeWidth="6" fill="none" strokeLinecap="round" className={color} stroke="currentColor" strokeDasharray={`${dash} 999`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[10px] font-bold text-aletis-cream">
            {Math.round(pct * 100)}%
          </span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="font-display text-[9.5px] uppercase tracking-widest text-aletis-sage">{label}</p>
        <p className="font-display text-[15px] font-bold text-aletis-cream tabular-nums">{formatUSD(used)}</p>
        <p className="font-body text-[10.5px] text-aletis-sage">limite {formatUSD(limit)}</p>
      </div>
    </div>
  )
}

export default function AlixTelemetryPanel({ onClose }: { onClose?: () => void }) {
  const [data, setData] = useState<TelemetryDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [period, setPeriod] = useState<'day' | 'month'>('month')

  const fetchData = async () => {
    setLoading(true)
    setErro(null)
    try {
      const r = await apiFetch<{ success: boolean; data: TelemetryDashboard }>(`/alix/telemetry-dashboard?period=${period}`)
      setData(r.data)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const h = window.setInterval(fetchData, 60_000)
    return () => window.clearInterval(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  const top5 = useMemo(() => (data?.topTools ?? []).slice(0, 5), [data])
  const maxToolCount = top5[0]?.count ?? 1

  return (
    <div className="rounded-2xl border border-aletis-sage/15 bg-aletis-verde-escuro/95 backdrop-blur p-5 shadow-brand-lg text-aletis-cream max-w-2xl w-full">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-aletis-gold/15 border border-aletis-gold/40 flex items-center justify-center">
            <Activity className="w-4 h-4 text-aletis-gold" />
          </div>
          <div>
            <p className="font-display text-base font-bold tracking-wide">Uso & custo da ALIX</p>
            <p className="font-body text-[11.5px] text-aletis-sage">
              Atualizado {data ? new Date(data.geradoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPeriod((p) => (p === 'day' ? 'month' : 'day'))}
            className="px-2.5 py-1 rounded-full font-display text-[10px] font-semibold uppercase tracking-wider bg-aletis-cream/[0.06] hover:bg-aletis-cream/[0.12] border border-aletis-sage/20"
          >
            {period === 'day' ? 'Hoje' : 'Mês'}
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            aria-label="Atualizar"
            className="p-1.5 rounded-lg text-aletis-cream/70 hover:bg-aletis-cream/[0.06]"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Fechar painel de telemetria"
              className="p-1.5 rounded-lg text-aletis-cream/70 hover:bg-aletis-cream/[0.06]"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </header>

      {erro && (
        <div className="mb-3 p-2.5 rounded-lg bg-red-950/40 border border-red-800 text-[12px]">
          ⚠ {erro}
        </div>
      )}

      {data && (
        <>
          {/* Alertas no topo */}
          {data.alerts.length > 0 && (
            <ul className="mb-4 space-y-1.5">
              {data.alerts.map((a, i) => (
                <li
                  key={i}
                  className={`flex items-start gap-2 text-[12px] rounded-lg px-3 py-2 ${
                    a.level === 'crit'
                      ? 'bg-red-950/40 border border-red-800 text-red-200'
                      : a.level === 'warn'
                      ? 'bg-aletis-gold/10 border border-aletis-gold/30 text-aletis-gold-claro'
                      : 'bg-aletis-cream/[0.05] border border-aletis-sage/15 text-aletis-sage'
                  }`}
                >
                  <AlertTriangle size={12} className="mt-0.5" />
                  {a.msg}
                </li>
              ))}
            </ul>
          )}

          {/* Rings de custo */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <CostRing used={data.custoHoje} limit={data.limites.diario} label="Custo hoje" />
            <CostRing used={data.custoMes} limit={data.limites.mensal} label="Custo do mês" />
          </div>

          {/* KPIs lineares */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <Stat label="Requests" value={String(data.totals.requests)} icon={Sparkles} />
            <Stat label="Tokens IN" value={formatTokens(data.totals.inputTokens)} icon={DollarSign} />
            <Stat label="Tokens OUT" value={formatTokens(data.totals.outputTokens)} icon={DollarSign} />
            <Stat
              label="Cache hit"
              value={formatPct(data.totals.cacheReadTokens, Math.max(1, data.totals.inputTokens))}
              icon={Sparkles}
            />
          </div>

          {/* Latência */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Stat label="P50" value={`${data.latencia.p50}ms`} icon={Clock} accent="sage" />
            <Stat label="P95" value={`${data.latencia.p95}ms`} icon={Clock} accent="sage" />
            <Stat label="P99" value={`${data.latencia.p99}ms`} icon={Clock} accent="sage" />
          </div>

          {/* Top 5 tools */}
          {top5.length > 0 && (
            <div>
              <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-aletis-sage mb-2">
                Top 5 tools
              </p>
              <ul className="space-y-1.5">
                {top5.map((t) => (
                  <li key={t.tool}>
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="font-mono text-[11.5px] text-aletis-cream truncate flex-1">
                        {t.tool}
                      </span>
                      <span className="font-display text-[11.5px] font-bold tabular-nums text-aletis-gold">
                        {t.count}
                      </span>
                    </div>
                    <div className="h-1 bg-aletis-cream/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-aletis-gold/70 to-aletis-gold rounded-full"
                        style={{ width: `${(t.count / maxToolCount) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Stat({
  label, value, icon: Icon, accent,
}: { label: string; value: string; icon: React.ElementType; accent?: 'sage' }) {
  return (
    <div className="rounded-lg border border-aletis-sage/15 bg-aletis-cream/[0.04] px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Icon size={11} className={accent === 'sage' ? 'text-aletis-sage' : 'text-aletis-gold'} />
        <span className="font-display text-[9.5px] uppercase tracking-widest text-aletis-sage">{label}</span>
      </div>
      <p className="mt-0.5 font-display text-base font-bold tabular-nums text-aletis-cream">{value}</p>
    </div>
  )
}
