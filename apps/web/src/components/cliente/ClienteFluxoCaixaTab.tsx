// ============================================================
// ClienteFluxoCaixaTab — projeção de caixa real do cliente.
// Substitui o placeholder "Em desenvolvimento".
// ============================================================
import { useEffect, useState, useMemo } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { DSCard, DSStatCard, DSEmpty, DSTable, DSBadge } from '../ds'
import { TrendingUp, TrendingDown, AlertTriangle, Wallet } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface Semana {
  inicio: string
  fim: string
  entradas: number
  saidas: number
  resultado: number
  saldoFinal: number
  alertaNegativo: boolean
}

interface ProjecaoData {
  diasHorizonte: number
  saldoInicial: number
  semanas: Semana[]
}

const fmtBRL = (v: number) => {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toFixed(2)}M`
  if (Math.abs(v) >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}k`
  return `R$ ${v.toFixed(0)}`
}

const fmtDateShort = (s: string) => {
  try {
    const d = new Date(s)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  } catch {
    return s
  }
}

interface Props {
  clienteId: string
}

export default function ClienteFluxoCaixaTab({ clienteId }: Props) {
  const [data, setData] = useState<ProjecaoData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [horizonte, setHorizonte] = useState(90)

  useEffect(() => {
    if (!clienteId) return
    setError(null)
    setData(null)
    apiFetch<ProjecaoData>(
      `/financeiro/projecao-caixa?clienteId=${encodeURIComponent(clienteId)}&dias=${horizonte}`,
    )
      .then((d) => setData(d ?? null))
      .catch((err) => setError(String(err?.message || err)))
  }, [clienteId, horizonte])

  const stats = useMemo(() => {
    if (!data) return null
    const totalEntradas = data.semanas.reduce((s, w) => s + (w.entradas || 0), 0)
    const totalSaidas = data.semanas.reduce((s, w) => s + (w.saidas || 0), 0)
    const resultado = totalEntradas - totalSaidas
    const semanaPior = data.semanas.reduce(
      (worst, w) => (w.saldoFinal < worst.saldoFinal ? w : worst),
      data.semanas[0],
    )
    const alertasNegativos = data.semanas.filter((w) => w.alertaNegativo).length
    return { totalEntradas, totalSaidas, resultado, semanaPior, alertasNegativos }
  }, [data])

  const chartData = useMemo(() => {
    if (!data) return []
    return data.semanas.map((w) => ({
      label: fmtDateShort(w.inicio),
      saldo: w.saldoFinal,
      entradas: w.entradas,
      saidas: -w.saidas, // negativo para visualização inverted
    }))
  }, [data])

  if (error) {
    return (
      <DSCard className="border-red-300 bg-red-50/30 dark:bg-red-900/20">
        <p className="text-sm text-red-700 dark:text-red-300">Erro carregando projeção: {error}</p>
      </DSCard>
    )
  }

  if (!data) {
    return (
      <DSCard>
        <div className="h-32 bg-aletis-borda/30 rounded animate-pulse" />
      </DSCard>
    )
  }

  const semSemanas = !data.semanas || data.semanas.length === 0
  const todasZero = data.semanas.every((w) => w.entradas === 0 && w.saidas === 0)

  if (semSemanas || todasZero) {
    return (
      <DSCard>
        <DSEmpty
          icon={<Wallet className="w-6 h-6" />}
          title="Sem movimentações financeiras projetadas"
          description="Cadastre receitas/despesas no módulo Financeiro deste cliente para ver a projeção de caixa."
        />
      </DSCard>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toggle horizonte */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground dark:text-white/60">Horizonte:</span>
        {[30, 60, 90, 180].map((dias) => (
          <button
            key={dias}
            type="button"
            onClick={() => setHorizonte(dias)}
            className={`px-2.5 py-1 rounded-full font-semibold transition-colors ${
              horizonte === dias
                ? 'bg-aletis-verde text-white'
                : 'bg-aletis-borda/60 text-foreground hover:bg-aletis-bege dark:bg-white/10 dark:text-white/80'
            }`}
          >
            {dias}d
          </button>
        ))}
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <DSStatCard
            label="Saldo inicial"
            value={fmtBRL(data.saldoInicial)}
            tone="neutral"
          />
          <DSStatCard
            label={`Entradas (${data.diasHorizonte}d)`}
            value={fmtBRL(stats.totalEntradas)}
            tone="positive"
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <DSStatCard
            label={`Saídas (${data.diasHorizonte}d)`}
            value={fmtBRL(stats.totalSaidas)}
            tone="negative"
            icon={<TrendingDown className="w-4 h-4" />}
          />
          <DSStatCard
            label="Resultado projetado"
            value={fmtBRL(stats.resultado)}
            tone={stats.resultado >= 0 ? 'positive' : 'negative'}
            hint={
              stats.alertasNegativos > 0
                ? `${stats.alertasNegativos} semana${stats.alertasNegativos > 1 ? 's' : ''} negativa${stats.alertasNegativos > 1 ? 's' : ''}`
                : undefined
            }
          />
        </div>
      )}

      {stats && stats.alertasNegativos > 0 && (
        <DSCard className="border-amber-300 bg-amber-50/40 dark:bg-amber-900/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-300 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-display font-semibold text-amber-800 dark:text-amber-200">
                Atenção — projeção entra no negativo
              </p>
              <p className="text-xs font-body text-amber-700 dark:text-amber-300 mt-0.5">
                Pior saldo previsto: <strong>{fmtBRL(stats.semanaPior.saldoFinal)}</strong> na semana
                de {fmtDateShort(stats.semanaPior.inicio)}.
              </p>
            </div>
          </div>
        </DSCard>
      )}

      {/* Chart */}
      <DSCard>
        <h3 className="text-sm font-display font-semibold text-foreground dark:text-white mb-3">
          Saldo projetado semanal
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="saldoFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#17251b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#17251b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmtBRL(v)} />
              <Tooltip
                formatter={(v: any) => fmtBRL(Number(v ?? 0))}
                labelClassName="text-xs"
              />
              <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="3 3" />
              <Area
                type="monotone"
                dataKey="saldo"
                stroke="#17251b"
                fill="url(#saldoFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </DSCard>

      {/* Tabela detalhada */}
      <DSCard className="!p-0 overflow-hidden">
        <DSTable<Semana>
          dense
          columns={[
            { key: 'periodo', label: 'Semana', render: (w) => `${fmtDateShort(w.inicio)} → ${fmtDateShort(w.fim)}` },
            { key: 'entradas', label: 'Entradas', align: 'right', render: (w) => <span className="font-mono text-positivo">{fmtBRL(w.entradas)}</span> },
            { key: 'saidas', label: 'Saídas', align: 'right', render: (w) => <span className="font-mono text-red-600">{fmtBRL(w.saidas)}</span> },
            { key: 'resultado', label: 'Resultado', align: 'right', render: (w) => <span className={`font-mono ${w.resultado >= 0 ? 'text-positivo' : 'text-red-600'}`}>{fmtBRL(w.resultado)}</span> },
            { key: 'saldo', label: 'Saldo final', align: 'right', render: (w) => <span className={`font-mono font-semibold ${w.saldoFinal >= 0 ? 'text-foreground dark:text-white' : 'text-red-600'}`}>{fmtBRL(w.saldoFinal)}</span> },
            { key: 'alerta', label: '', align: 'right', render: (w) => w.alertaNegativo ? <DSBadge tone="negative">⚠</DSBadge> : null },
          ]}
          rows={data.semanas}
          rowKey={(w) => w.inicio}
        />
      </DSCard>
    </div>
  )
}
