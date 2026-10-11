// ============================================================
// CarteiraPanel — visão consolidada da carteira do consultor
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { Briefcase, Trophy, AlertTriangle, TrendingUp, RotateCw } from 'lucide-react'
import { Skeleton as UISkeleton, SkeletonKpiGrid } from '../ui'

interface Grupo {
  grupoId: string
  nomeGrupo: string
  clienteId: string
  receitaProjetada: number
  ebitdaTotal: number
  margemEbitda: number
  dividaTotal: number
  diviPorEbitda: number
  ltvMedio: number
  insightsCriticos: number
  status: 'saudavel' | 'atencao' | 'critico'
  ultimaAtualizacao: string
}

interface CarteiraData {
  consultorId?: string | null
  totalGrupos: number
  agregado: {
    receitaTotal: number
    ebitdaTotal: number
    dividaTotal: number
    margemEbitdaMedia: number
    diviPorEbitdaMedia: number
    insightsCriticosTotal: number
  }
  rankings: {
    melhorMargem: Grupo | null
    piorMargem: Grupo | null
    maisAlavancado: Grupo | null
    maiorReceita: Grupo | null
    maisCritico: Grupo | null
  }
  distribuicao: {
    saudavel: number
    atencao: number
    critico: number
  }
  grupos: Grupo[]
}

interface Props {
  consultorId?: string
  onSelectGrupo?: (clienteId: string, grupoId: string) => void
}

export default function CarteiraPanel({ consultorId, onSelectGrupo }: Props) {
  const [data, setData] = useState<CarteiraData | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = consultorId
        ? `/gestao-financeira/carteira?consultorId=${encodeURIComponent(consultorId)}`
        : '/gestao-financeira/carteira'
      const r = await apiFetch<CarteiraData>(url)
      setData(r)
    } finally {
      setLoading(false)
    }
  }, [consultorId])

  useEffect(() => { load() }, [load])

  if (!data) return <Skeleton />

  const total = data.totalGrupos
  return (
    <div className="space-y-4">
      <div className="card-premium p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-foreground" />
            <div>
              <h3 className="text-sm font-display font-semibold text-foreground">Carteira do consultor</h3>
              <p className="text-[11px] text-muted-foreground">
                {total} grupos · {data.agregado.insightsCriticosTotal} insights críticos
              </p>
            </div>
          </div>
          <button onClick={load} disabled={loading} className="px-2 py-1 rounded-lg text-muted-foreground hover:bg-aletis-grafite-escuro/5">
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* KPIs agregados */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Kpi label="Receita total" value={fmtBRL(data.agregado.receitaTotal)} sub={`${total} grupos`} />
          <Kpi label="EBITDA total" value={fmtBRL(data.agregado.ebitdaTotal)} sub={`margem média ${(data.agregado.margemEbitdaMedia * 100).toFixed(1)}%`} tone={data.agregado.margemEbitdaMedia > 0.25 ? 'good' : data.agregado.margemEbitdaMedia > 0.15 ? 'warn' : 'bad'} />
          <Kpi label="Dívida total" value={fmtBRL(data.agregado.dividaTotal)} sub={`D/E médio ${data.agregado.diviPorEbitdaMedia.toFixed(2)}x`} />
        </div>

        {/* Distribuição saudável/atenção/crítico */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <DistCard label="Saudável" count={data.distribuicao.saudavel} total={total} cor="bg-aletis-verde" />
          <DistCard label="Atenção" count={data.distribuicao.atencao} total={total} cor="bg-amber-500" />
          <DistCard label="Crítico" count={data.distribuicao.critico} total={total} cor="bg-red-500" />
        </div>
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <RankingCard label="🏆 Melhor margem" grupo={data.rankings.melhorMargem} metrica={(g) => `${(g.margemEbitda * 100).toFixed(1)}%`} tone="good" onClick={onSelectGrupo} />
        <RankingCard label="⚠ Pior margem" grupo={data.rankings.piorMargem} metrica={(g) => `${(g.margemEbitda * 100).toFixed(1)}%`} tone="bad" onClick={onSelectGrupo} />
        <RankingCard label="📈 Mais alavancado" grupo={data.rankings.maisAlavancado} metrica={(g) => `${g.diviPorEbitda.toFixed(2)}x`} tone="warn" onClick={onSelectGrupo} />
        <RankingCard label="💰 Maior receita" grupo={data.rankings.maiorReceita} metrica={(g) => fmtBRL(g.receitaProjetada)} tone="good" onClick={onSelectGrupo} />
      </div>

      {/* Lista de todos os grupos */}
      <section className="card-premium p-4">
        <h4 className="text-xs font-display font-semibold text-foreground mb-2">📋 Todos os grupos ({total})</h4>
        <div className="overflow-x-auto">
          <table className="ui-table w-full text-xs font-body">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-aletis-grafite-claro/15">
                <th className="text-left py-2 px-2">Grupo</th>
                <th className="text-right py-2 px-2">Receita</th>
                <th className="text-right py-2 px-2">EBITDA</th>
                <th className="text-right py-2 px-2">Margem</th>
                <th className="text-right py-2 px-2">Dívida</th>
                <th className="text-right py-2 px-2">D/EBITDA</th>
                <th className="text-right py-2 px-2">LTV</th>
                <th className="text-center py-2 px-2">Status</th>
                <th className="text-right py-2 px-2">Críticos</th>
              </tr>
            </thead>
            <tbody>
              {data.grupos.map((g) => (
                <tr
                  key={g.grupoId}
                  className="border-b border-aletis-grafite-claro/10 hover:bg-aletis-cream/20 cursor-pointer"
                  onClick={() => onSelectGrupo?.(g.clienteId, g.grupoId)}
                >
                  <td className="py-1.5 px-2">
                    <p className="font-semibold">{g.nomeGrupo}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{g.grupoId.slice(-12)}</p>
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{fmtBRL(g.receitaProjetada)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{fmtBRL(g.ebitdaTotal)}</td>
                  <td className={`py-1.5 px-2 text-right tabular-nums ${g.margemEbitda < 0.15 ? 'text-red-600' : g.margemEbitda > 0.25 ? 'text-foreground font-semibold' : ''}`}>
                    {(g.margemEbitda * 100).toFixed(1)}%
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{fmtBRL(g.dividaTotal)}</td>
                  <td className={`py-1.5 px-2 text-right tabular-nums ${g.diviPorEbitda > 5 ? 'text-red-600 font-semibold' : g.diviPorEbitda > 3 ? 'text-amber-600' : ''}`}>
                    {g.diviPorEbitda.toFixed(2)}x
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{(g.ltvMedio * 100).toFixed(0)}%</td>
                  <td className="py-1.5 px-2 text-center">
                    <StatusBadge status={g.status} />
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {g.insightsCriticos > 0 ? (
                      <span className="text-red-600 font-bold">{g.insightsCriticos}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const cls = tone === 'good' ? 'border-l-aletis-verde' : tone === 'warn' ? 'border-l-amber-500' : tone === 'bad' ? 'border-l-red-500' : 'border-l-aletis-grafite-claro/30'
  return (
    <div className={`card-premium p-2 border-l-4 ${cls}`}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-base font-display font-semibold text-foreground tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function DistCard({ label, count, total, cor }: { label: string; count: number; total: number; cor: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="card-premium p-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
        <span className="text-base font-display font-semibold tabular-nums">{count}</span>
      </div>
      <div className="h-1 mt-1 bg-aletis-grafite-claro/15 rounded-full overflow-hidden">
        <div className={`h-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{pct.toFixed(0)}%</p>
    </div>
  )
}

function RankingCard({ label, grupo, metrica, tone, onClick }: { label: string; grupo: Grupo | null; metrica: (g: Grupo) => string; tone: 'good' | 'warn' | 'bad'; onClick?: (cId: string, gId: string) => void }) {
  if (!grupo) {
    return (
      <div className="card-premium p-3 opacity-50">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground mt-1">—</p>
      </div>
    )
  }
  const cls = tone === 'good' ? 'border-l-aletis-verde' : tone === 'warn' ? 'border-l-amber-500' : 'border-l-red-500'
  return (
    <button
      type="button"
      onClick={() => onClick?.(grupo.clienteId, grupo.grupoId)}
      className={`card-premium p-3 border-l-4 ${cls} text-left w-full hover:shadow-md transition-shadow`}
    >
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-sm font-display font-semibold text-foreground mt-0.5">{grupo.nomeGrupo}</p>
      <p className="text-base font-display font-semibold tabular-nums">{metrica(grupo)}</p>
    </button>
  )
}

// StatusBadge canônico (components/ui/StatusBadge) — wrapper para mapear
// 'saudavel'/'atencao'/'critico' → tone good/warn/bad com prefix.
import UIStatusBadge from '../ui/StatusBadge'

function StatusBadge({ status }: { status: 'saudavel' | 'atencao' | 'critico' }) {
  const map = {
    saudavel: { label: 'saudável', tone: 'good' as const, prefix: '✓' },
    atencao: { label: 'atenção', tone: 'warn' as const, prefix: '⚠' },
    critico: { label: 'crítico', tone: 'bad' as const, prefix: '🔴' },
  }[status]
  return <UIStatusBadge label={map.label} tone={map.tone} prefix={map.prefix} />
}

function fmtBRL(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <UISkeleton className="h-40 rounded-xl" />
      <SkeletonKpiGrid count={4} />
      <UISkeleton className="h-64 rounded-xl" />
    </div>
  )
}
