// ============================================================
// Dashboard360 — visualização completa do dashboard 360°
// (KPIs, charts, insights, passivos, LTV, cenários DRE)
// ============================================================
import { useEffect, useState, useCallback, useMemo } from 'react'
import { apiFetch } from '../../hooks/useApi'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { Skeleton as UISkeleton, SkeletonKpiGrid } from '../ui'
import {
  AlertTriangle, AlertCircle, Info, TrendingUp, TrendingDown,
  RefreshCw, Loader2, CheckCircle2, ChevronDown, ChevronRight,
} from 'lucide-react'

interface Props {
  grupoId: string
}

interface Dashboard360Data {
  grupo: any
  premissas: any[]
  safras: any[]
  endividamento: any
  raioX: any
  rateio: any[]
  ebitdaMensal: any[]
  passivos: any
  ltv: any
  dre: any
  insights: any[]
  contadores: any
}

const COLORS = ['#17251b', '#e3bd80', '#a83232', '#5A8A6E', '#7B5B30', '#94A3B8', '#FBBF24', '#3B82F6']

export default function Dashboard360({ grupoId }: Props) {
  const [data, setData] = useState<Dashboard360Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [cenarioFiltro, setCenarioFiltro] = useState<'todos' | 'planejado' | 'realizado' | 'proposta'>('todos')
  const [drillContrato, setDrillContrato] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await apiFetch<Dashboard360Data>(
        `/gestao-financeira/grupos/${encodeURIComponent(grupoId)}/dashboard-360?persistir=1`,
      )
      setData(r)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [grupoId])

  useEffect(() => {
    load()
  }, [load])

  async function recalcular() {
    setRecalculating(true)
    try {
      await apiFetch(`/gestao-financeira/grupos/${encodeURIComponent(grupoId)}/insights/recalcular`, {
        method: 'POST',
      })
      await load()
    } finally {
      setRecalculating(false)
    }
  }

  if (loading || !data) return <Skeleton />
  if (error) return <div className="text-xs text-red-600 p-4">{error}</div>

  const i = data.raioX.indicadores
  const cenBase = data.dre.cenarios.find((c: any) => c.cenario === 'base')

  // Filtra safras por cenário (toggle)
  const safrasFiltradas = cenarioFiltro === 'todos'
    ? data.safras
    : data.safras.filter((s) => s.cenario === cenarioFiltro)

  // Dados para charts
  const safrasChart = safrasFiltradas.map((s) => ({
    nome: `${s.safra} ${s.cenario === 'planejado' ? 'P' : s.cenario === 'realizado' ? 'R' : s.cenario[0]}`,
    receita: s.receitaTotal,
    custo: s.custoInsumosTotal + s.custoArrendamento,
    resultado: s.resultadoBruto,
  }))

  const credoresChart = data.endividamento.porCredor.slice(0, 6).map((c: any, idx: number) => ({
    name: c.credor,
    value: c.saldo,
    pct: c.pctTotal * 100,
    color: COLORS[idx % COLORS.length],
  }))

  const cenariosChart = data.dre.comparativo.map((c: any) => ({
    ano: c.ano,
    pessimista: c.pessimista,
    base: c.base,
    otimista: c.otimista,
  }))

  const passivosChart = data.passivos.porCategoria.map((c: any) => ({
    name: c.rotulo,
    value: c.totalAtual,
    color: c.cor,
  }))

  return (
    <div className="space-y-4">
      {/* Header com filtros + ação recalcular */}
      <div className="flex flex-col gap-3 rounded-lg border border-aletis-borda bg-card p-4 shadow-none lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-sm font-display font-semibold text-foreground">
            Dashboard 360 - Diagnóstico completo
          </h3>
          <p className="text-[11px] font-body text-muted-foreground">
            {data.contadores.culturas} culturas · {data.contadores.contratos} contratos · {data.contadores.fazendas} fazendas · {data.contadores.garantias} garantias · {data.contadores.premissas} premissas · {data.insights.length} insights
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle de cenário */}
          <div className="inline-flex overflow-hidden rounded-xl border border-aletis-borda bg-card text-[11px] font-body">
            {(['todos', 'planejado', 'realizado', 'proposta'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCenarioFiltro(c)}
                className={`h-8 px-2.5 transition-colors ${
                  cenarioFiltro === c
                    ? 'bg-aletis-verde text-white'
                    : 'bg-card text-foreground hover:bg-aletis-bege/55'
                }`}
              >
                {c === 'todos' ? 'Todos' : c[0].toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={recalcular}
            disabled={recalculating}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-aletis-verde px-3 text-xs font-body font-semibold text-white hover:bg-aletis-verde-escuro disabled:opacity-50"
          >
            {recalculating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Recalcular
          </button>
        </div>
      </div>

      {/* INSIGHTS no topo (críticos primeiro) */}
      {data.insights.length > 0 && (
        <section className="space-y-2">
          {data.insights.slice(0, 5).map((ins, idx) => (
            <InsightCard key={idx} insight={ins} />
          ))}
        </section>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Receita projetada"
          value={fmtBRL(i.receitaTotal)}
          sub={`${data.raioX.anos.length} anos`}
          tone="neutral"
        />
        <KpiCard
          label="EBITDA total"
          value={fmtBRL(i.ebitdaTotal)}
          sub={`margem ${(i.margemEbitda * 100).toFixed(1)}%`}
          tone={i.margemEbitda > 0.25 ? 'good' : i.margemEbitda > 0.15 ? 'warn' : 'bad'}
        />
        <KpiCard
          label="Dívida total"
          value={fmtBRL(data.endividamento.saldoTotalAtual)}
          sub={`${data.endividamento.totalContratos} contratos`}
          tone="neutral"
        />
        <KpiCard
          label="Dívida / EBITDA"
          value={`${i.diviPorEbitda.toFixed(2)}x`}
          sub={i.diviPorEbitda < 3 ? 'saudável' : i.diviPorEbitda < 5 ? 'atenção' : 'crítico'}
          tone={i.diviPorEbitda < 3 ? 'good' : i.diviPorEbitda < 5 ? 'warn' : 'bad'}
        />
        <KpiCard
          label="LTV médio"
          value={`${(data.ltv.ltvMercadoMedio * 100).toFixed(0)}%`}
          sub={data.ltv.ltvMercadoMedio < 0.5 ? 'liberada' : data.ltv.ltvMercadoMedio < 0.8 ? 'comprometida' : 'stress'}
          tone={data.ltv.ltvMercadoMedio < 0.5 ? 'good' : data.ltv.ltvMercadoMedio < 0.8 ? 'warn' : 'bad'}
        />
        <KpiCard
          label="Passivos totais"
          value={fmtBRL(data.passivos.total)}
          sub={`vencido R$ ${fmtN(data.passivos.totalVencido)}`}
          tone={data.passivos.totalVencido > 0 ? 'bad' : 'neutral'}
        />
        <KpiCard
          label="FCL base 10a"
          value={fmtBRL(cenBase?.totais.fclTotal ?? 0)}
          sub={`pess. ${fmtN(data.dre.cenarios[0]?.totais.fclTotal ?? 0)} / otim. ${fmtN(data.dre.cenarios[2]?.totais.fclTotal ?? 0)}`}
          tone={(cenBase?.totais.fclTotal ?? 0) > 0 ? 'good' : 'bad'}
        />
        <KpiCard
          label="Saldo final acum"
          value={fmtBRL(i.saldoFinalAcumulado)}
          sub={`em ${data.raioX.anos.length} anos`}
          tone={i.saldoFinalAcumulado > 0 ? 'good' : 'bad'}
        />
      </div>

      {/* CHARTS — grid 2 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Receita por safra */}
        <ChartCard title="Receita x custo por safra">
          {safrasChart.length === 0 ? <Empty msg="Sem safras cadastradas" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={safrasChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => fmtBRL(v as number)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="receita" fill="#17251b" name="Receita" />
                <Bar dataKey="custo" fill="#a83232" name="Custo" />
                <Bar dataKey="resultado" fill="#e3bd80" name="Resultado" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Endividamento por credor */}
        <ChartCard title="Endividamento por credor">
          {credoresChart.length === 0 ? <Empty msg="Sem contratos cadastrados" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={credoresChart} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                  {credoresChart.map((c: { color: string }, idx: number) => <Cell key={idx} fill={c.color} />)}
                </Pie>
                <Tooltip formatter={(v: any, n: any) => [fmtBRL(v as number), n]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Cenários DRE FCL */}
        <ChartCard title="FCL - cenários pessimista, base e otimista" full>
          {cenariosChart.length === 0 ? <Empty msg="Sem cenários" /> : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={cenariosChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <XAxis dataKey="ano" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => fmtBRL(v as number)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke="#94A3B8" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="pessimista" stroke="#a83232" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="base" stroke="#17251b" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="otimista" stroke="#e3bd80" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Passivos por categoria */}
        <ChartCard title="Passivos consolidados">
          {passivosChart.length === 0 ? <Empty msg="Sem passivos cadastrados" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={passivosChart} layout="vertical" margin={{ top: 5, right: 10, left: 60, bottom: 5 }}>
                <XAxis type="number" tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={(v: any) => fmtBRL(v as number)} />
                <Bar dataKey="value">
                  {passivosChart.map((p: { color: string }, idx: number) => <Cell key={idx} fill={p.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* EBITDA mensal (primeira safra) */}
        {data.ebitdaMensal[0] && (
          <ChartCard title={`EBITDA mensal - safra ${data.ebitdaMensal[0].safra}`} full>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.ebitdaMensal[0].meses}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => fmtBRL(v as number)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke="#94A3B8" strokeDasharray="3 3" />
                <Area type="monotone" dataKey="receita" stackId="1" stroke="#17251b" fill="#17251b" fillOpacity={0.4} />
                <Area type="monotone" dataKey="custoTotal" stackId="2" stroke="#a83232" fill="#a83232" fillOpacity={0.3} />
                <Line type="monotone" dataKey="saldoAcumulado" stroke="#e3bd80" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Raio X 10 anos */}
        <ChartCard title="Raio X - saldo acumulado" full>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.raioX.anos}>
              <XAxis dataKey="ano" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: any) => fmtBRL(v as number)} />
              <ReferenceLine y={0} stroke="#94A3B8" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="saldoAcumulado" stroke="#17251b" fill="#17251b" fillOpacity={0.3} name="Saldo acumulado" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Cronograma de Amortização — drill-down mensal por contrato */}
      {data.endividamento.contratos.length > 0 && (
        <section className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-display font-semibold text-foreground">
              Cronograma de amortização
            </h3>
            <span className="text-[11px] text-muted-foreground">
              Clique no contrato para expandir parcela a parcela
            </span>
          </div>
          <div className="space-y-2">
            {data.endividamento.contratos.map((c: any) => (
              <CronogramaContrato
                key={c.contratoId}
                contrato={c}
                expanded={drillContrato === c.contratoId}
                onToggle={() => setDrillContrato(drillContrato === c.contratoId ? null : c.contratoId)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function CronogramaContrato({ contrato, expanded, onToggle }: { contrato: any; expanded: boolean; onToggle: () => void }) {
  const [vista, setVista] = useState<'anual' | 'mensal'>('anual')

  return (
    <div className="overflow-hidden rounded-xl border border-aletis-borda bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center justify-between gap-3 bg-aletis-bege/25 px-3 py-2 text-xs font-body hover:bg-aletis-bege/45"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          <strong>{contrato.credor}</strong>
          <span className="text-muted-foreground">·</span>
          <span>{contrato.metodoCalculo}</span>
          <span className="text-muted-foreground">·</span>
          <span>{contrato.prazoParcelas}m</span>
          <span className="text-muted-foreground">·</span>
          <span>taxa período {(contrato.taxaPeriodo * 100).toFixed(4)}%</span>
        </div>
        <div className="flex shrink-0 items-center gap-3 tabular-nums">
          <span>saldo {fmtBRL(contrato.saldoAtual)}</span>
        </div>
      </button>
      {expanded && (
        <div className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-muted-foreground">Visualização:</span>
            <div className="inline-flex rounded-md border border-aletis-grafite-claro/20 overflow-hidden text-[11px]">
              <button
                type="button"
                onClick={() => setVista('anual')}
                className={`px-2 py-0.5 ${vista === 'anual' ? 'bg-aletis-verde text-white' : 'bg-card'}`}
              >
                Anual
              </button>
              <button
                type="button"
                onClick={() => setVista('mensal')}
                className={`px-2 py-0.5 ${vista === 'mensal' ? 'bg-aletis-verde text-white' : 'bg-card'}`}
              >
                Mensal ({contrato.installments?.length ?? 0})
              </button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="ui-table w-full text-[11px] font-body">
              <thead className="text-[11px] uppercase text-muted-foreground sticky top-0 bg-card">
                {vista === 'anual' ? (
                  <tr>
                    <th className="text-left p-1">Ano</th>
                    <th className="text-right p-1">Capital</th>
                    <th className="text-right p-1">Juros</th>
                    <th className="text-right p-1">Parcela</th>
                    <th className="text-right p-1">Saldo fim</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="text-left p-1">#</th>
                    <th className="text-left p-1">Data</th>
                    <th className="text-right p-1">Capital</th>
                    <th className="text-right p-1">Juros</th>
                    <th className="text-right p-1">Parcela</th>
                    <th className="text-right p-1">Saldo</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {vista === 'anual'
                  ? contrato.porAno?.map((y: any, j: number) => (
                      <tr key={j} className="border-t border-aletis-grafite-claro/10">
                        <td className="p-1 font-mono font-semibold">{y.ano || '—'}</td>
                        <td className="p-1 text-right tabular-nums">{fmtBRL(y.capitalPago)}</td>
                        <td className="p-1 text-right tabular-nums">{fmtBRL(y.juroPago)}</td>
                        <td className="p-1 text-right tabular-nums font-semibold">{fmtBRL(y.parcelaPaga)}</td>
                        <td className="p-1 text-right tabular-nums">{fmtBRL(y.saldoFinalAno)}</td>
                      </tr>
                    ))
                  : contrato.installments?.map((p: any) => (
                      <tr key={p.k} className={`border-t border-aletis-grafite-claro/10 ${p.k <= contrato.parcelasPagas ? 'opacity-60 bg-aletis-cream/20' : ''}`}>
                        <td className="p-1 font-mono">{p.k}</td>
                        <td className="p-1 font-mono">{p.dataPlaneada ? new Date(p.dataPlaneada).toLocaleDateString('pt-BR') : '—'}</td>
                        <td className="p-1 text-right tabular-nums">{fmtBRL(p.capital)}</td>
                        <td className="p-1 text-right tabular-nums">{fmtBRL(p.juro)}</td>
                        <td className="p-1 text-right tabular-nums font-semibold">{fmtBRL(p.parcela)}</td>
                        <td className="p-1 text-right tabular-nums">{fmtBRL(p.saldoAposPagamento)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const toneCls = {
    good: 'border-l-aletis-verde',
    warn: 'border-l-amber-500',
    bad: 'border-l-red-500',
    neutral: 'border-l-aletis-grafite-claro/30',
  }[tone]
  const subCls = {
    good: 'text-foreground',
    warn: 'text-amber-600',
    bad: 'text-red-600',
    neutral: 'text-muted-foreground',
  }[tone]
  return (
    <div className={`rounded-lg border border-aletis-borda bg-card p-3 shadow-none border-l-4 ${toneCls}`}>
      <p className="text-[11px] font-body uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-base font-display font-semibold text-foreground tabular-nums leading-tight mt-0.5">
        {value}
      </p>
      {sub && <p className={`text-[11px] font-body mt-0.5 ${subCls}`}>{sub}</p>}
    </div>
  )
}

function ChartCard({ title, children, full }: { title: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`rounded-lg border border-aletis-borda bg-card p-4 shadow-none ${full ? 'lg:col-span-2' : ''}`}>
      <h4 className="text-xs font-display font-semibold text-foreground mb-2">{title}</h4>
      {children}
    </div>
  )
}

function InsightCard({ insight }: { insight: any }) {
  const Icon = insight.severidade === 'critico' ? AlertTriangle : insight.severidade === 'importante' ? AlertCircle : Info
  const cls = insight.severidade === 'critico'
    ? 'bg-red-50 border-red-300 text-red-900'
    : insight.severidade === 'importante'
    ? 'bg-amber-50 border-amber-300 text-amber-900'
    : 'bg-blue-50 border-blue-300 text-blue-900'
  const iconCls = insight.severidade === 'critico'
    ? 'text-red-600'
    : insight.severidade === 'importante'
    ? 'text-amber-600'
    : 'text-blue-600'
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconCls}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono uppercase font-semibold tracking-wider">
              [{insight.categoria}]
            </span>
            <p className="text-xs font-body font-semibold leading-tight">{insight.titulo}</p>
          </div>
          <p className="text-[11px] font-body mt-1 leading-relaxed">{insight.mensagem}</p>
          {insight.recomendacao && (
            <p className="text-[11px] font-body mt-1.5 italic opacity-80">→ {insight.recomendacao}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">
      {msg}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <UISkeleton className="h-12 rounded-lg" />
      <SkeletonKpiGrid count={8} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <UISkeleton key={i} className="h-64 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

function fmtBRL(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
function fmtN(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}
