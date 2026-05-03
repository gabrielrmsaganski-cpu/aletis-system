// ============================================================
// BenchmarkPanel — comparação visual do grupo vs carteira + setor
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { Trophy, TrendingUp, TrendingDown, Target } from 'lucide-react'
import { Skeleton as UISkeleton, SkeletonList } from '../ui'

interface Kpi {
  metrica: string
  rotulo: string
  unidade: string
  valor: number
  mediaCarteira: number
  medianaCarteira: number
  setorReferencia: number
  setorRotulo: string
  ranking: number
  totalCarteira: number
  classificacao: 'top' | 'media' | 'abaixo'
}

interface BenchmarkData {
  grupoId: string
  grupoNome: string
  carteiraSize: number
  consultorId?: string | null
  kpis: Kpi[]
}

interface Props {
  grupoId: string
}

export default function BenchmarkPanel({ grupoId }: Props) {
  const [data, setData] = useState<BenchmarkData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await apiFetch<BenchmarkData>(`/gestao-financeira/grupos/${grupoId}/benchmark`)
      setData(r)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [grupoId])

  useEffect(() => { load() }, [load])

  if (loading || !data) return <Skeleton />
  if (error) return <div className="card-premium p-4 text-xs text-red-600">{error}</div>

  return (
    <div className="space-y-4">
      <div className="card-premium p-4">
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="w-5 h-5 text-aletis-dourado" />
          <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">
            Benchmark — {data.grupoNome} vs carteira
          </h3>
        </div>
        <p className="text-[11px] text-aletis-grafite-claro">
          Carteira do consultor: <strong>{data.carteiraSize}</strong> grupos · Comparação vs média/mediana e referência setorial agro
        </p>
      </div>

      <div className="space-y-2">
        {data.kpis.map((kpi) => (
          <KpiBenchmark key={kpi.metrica} kpi={kpi} />
        ))}
      </div>
    </div>
  )
}

function KpiBenchmark({ kpi }: { kpi: Kpi }) {
  const fmt = (v: number) => {
    if (kpi.unidade === '%') return `${(v * 100).toFixed(1)}%`
    if (kpi.unidade === 'x') return `${v.toFixed(2)}x`
    if (kpi.unidade === 'R$') return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    if (kpi.unidade === 'R$/ha') return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} R$/ha`
    return v.toString()
  }

  const classCls = {
    top: 'border-l-aletis-verde bg-aletis-verde/5',
    media: 'border-l-aletis-dourado bg-aletis-dourado/5',
    abaixo: 'border-l-red-500 bg-red-50',
  }[kpi.classificacao]

  const classIcon = {
    top: <TrendingUp className="w-3.5 h-3.5 text-aletis-verde" />,
    media: <Target className="w-3.5 h-3.5 text-aletis-dourado" />,
    abaixo: <TrendingDown className="w-3.5 h-3.5 text-red-600" />,
  }[kpi.classificacao]

  // Calcula posição relativa para barra
  const max = Math.max(Math.abs(kpi.valor), Math.abs(kpi.mediaCarteira), Math.abs(kpi.setorReferencia))
  const pctValor = max > 0 ? (Math.abs(kpi.valor) / max) * 100 : 0
  const pctMedia = max > 0 ? (Math.abs(kpi.mediaCarteira) / max) * 100 : 0
  const pctSetor = max > 0 ? (Math.abs(kpi.setorReferencia) / max) * 100 : 0

  return (
    <div className={`card-premium p-3 border-l-4 ${classCls}`}>
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {classIcon}
          <h4 className="text-sm font-display font-semibold text-aletis-grafite-escuro">{kpi.rotulo}</h4>
        </div>
        <div className="text-[10px] text-aletis-grafite-claro tabular-nums">
          ranking <span className="font-bold text-aletis-grafite-escuro">{kpi.ranking}/{kpi.totalCarteira}</span>
          {kpi.classificacao === 'top' && <span className="ml-1 text-aletis-verde">🏆</span>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div>
          <p className="uppercase tracking-wider text-aletis-grafite-claro">Este grupo</p>
          <p className="text-base font-display font-bold text-aletis-grafite-escuro tabular-nums">{fmt(kpi.valor)}</p>
        </div>
        <div>
          <p className="uppercase tracking-wider text-aletis-grafite-claro">Média carteira</p>
          <p className="text-base font-display font-bold text-aletis-grafite-claro tabular-nums">{fmt(kpi.mediaCarteira)}</p>
          <p className="text-[9px] text-aletis-grafite-claro">mediana {fmt(kpi.medianaCarteira)}</p>
        </div>
        <div>
          <p className="uppercase tracking-wider text-aletis-grafite-claro">Setor</p>
          <p className="text-base font-display font-bold text-aletis-grafite-claro tabular-nums">{fmt(kpi.setorReferencia)}</p>
          <p className="text-[9px] text-aletis-grafite-claro truncate" title={kpi.setorRotulo}>{kpi.setorRotulo}</p>
        </div>
      </div>

      {/* Barras comparativas */}
      <div className="mt-2 space-y-0.5">
        <Bar label="Você" pct={pctValor} cor="bg-aletis-verde" valor={fmt(kpi.valor)} />
        <Bar label="Carteira" pct={pctMedia} cor="bg-aletis-grafite-claro" valor={fmt(kpi.mediaCarteira)} />
        <Bar label="Setor" pct={pctSetor} cor="bg-aletis-dourado" valor={fmt(kpi.setorReferencia)} />
      </div>
    </div>
  )
}

function Bar({ label, pct, cor, valor }: { label: string; pct: number; cor: string; valor: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] uppercase text-aletis-grafite-claro w-14">{label}</span>
      <div className="flex-1 h-2 bg-aletis-grafite-claro/10 rounded overflow-hidden">
        <div className={`h-full ${cor} transition-all`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
      </div>
      <span className="text-[9px] tabular-nums text-aletis-grafite-escuro w-20 text-right font-semibold">{valor}</span>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <UISkeleton className="h-16 rounded-xl" />
      <SkeletonList count={4} itemHeight="h-32" />
    </div>
  )
}
