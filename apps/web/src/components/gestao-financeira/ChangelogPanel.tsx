// ============================================================
// ChangelogPanel — timeline de mudanças do grupo
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { Plus, Edit3, Trash2, History, RotateCw } from 'lucide-react'

interface Changelog {
  id: number
  grupoId: string
  entidade: string
  entidadeId?: string | null
  acao: 'create' | 'update' | 'delete'
  diff?: Record<string, { antes: any; depois: any }>
  ator?: string | null
  atorNome?: string | null
  origem?: string | null
  traceId?: string | null
  criadoEm: string
}

interface Stats {
  total: number
  porEntidade: Record<string, number>
  porAcao: Record<string, number>
  ultimaAlteracao?: string
}

interface Props {
  grupoId: string
}

export default function ChangelogPanel({ grupoId }: Props) {
  const [list, setList] = useState<Changelog[] | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [filtroEntidade, setFiltroEntidade] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r1, r2] = await Promise.all([
        apiFetch<{ mudancas: Changelog[] }>(`/gestao-financeira/grupos/${grupoId}/changelog`),
        apiFetch<Stats>(`/gestao-financeira/grupos/${grupoId}/changelog/stats`),
      ])
      setList(r1.mudancas)
      setStats(r2)
    } finally {
      setLoading(false)
    }
  }, [grupoId])

  useEffect(() => { load() }, [load])

  // SSE para tempo real
  useEffect(() => {
    const es = new EventSource(`/api/gestao-financeira/grupos/${grupoId}/events/stream`)
    es.addEventListener('changelog', () => {
      load()
    })
    return () => es.close()
  }, [grupoId, load])

  if (!list || !stats) return <Skeleton />

  const filtered = filtroEntidade ? list.filter((c) => c.entidade === filtroEntidade) : list

  return (
    <div className="space-y-4">
      <div className="card-premium p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-aletis-verde" />
            <div>
              <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">Changelog</h3>
              <p className="text-[10px] text-aletis-grafite-claro">
                {stats.total} mudanças · última {stats.ultimaAlteracao ? new Date(stats.ultimaAlteracao).toLocaleString('pt-BR') : '—'}
              </p>
            </div>
          </div>
          <button onClick={load} disabled={loading} className="px-2 py-1 rounded-lg text-aletis-grafite-claro hover:bg-aletis-grafite-escuro/5">
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterChip label="Todos" count={stats.total} active={!filtroEntidade} onClick={() => setFiltroEntidade(null)} />
          {Object.entries(stats.porEntidade).map(([e, c]) => (
            <FilterChip key={e} label={e} count={c} active={filtroEntidade === e} onClick={() => setFiltroEntidade(e)} />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-aletis-grafite-claro/30 p-8 text-center bg-aletis-cream/20">
            <History className="w-6 h-6 text-aletis-grafite-claro/40 mx-auto mb-2" />
            <p className="text-xs text-aletis-grafite-claro">
              {filtroEntidade ? `Nenhuma mudança em "${filtroEntidade}".` : 'Nenhuma mudança registrada ainda.'}
            </p>
          </div>
        ) : (
          filtered.map((c) => <ChangelogItem key={c.id} change={c} />)
        )}
      </div>
    </div>
  )
}

function FilterChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full text-[10px] font-body font-medium inline-flex items-center gap-1 transition-colors ${
        active ? 'bg-aletis-verde text-white' : 'bg-aletis-grafite-claro/10 text-aletis-grafite-escuro hover:bg-aletis-grafite-claro/20'
      }`}
    >
      {label} <span className={active ? 'text-white/80' : 'text-aletis-grafite-claro'}>{count}</span>
    </button>
  )
}

function ChangelogItem({ change }: { change: Changelog }) {
  const Icon = change.acao === 'create' ? Plus : change.acao === 'delete' ? Trash2 : Edit3
  const cor = change.acao === 'create' ? 'text-aletis-verde bg-aletis-verde/10'
    : change.acao === 'delete' ? 'text-red-600 bg-red-50'
    : 'text-blue-600 bg-blue-50'

  const diffEntries = change.diff ? Object.entries(change.diff) : []

  return (
    <div className="card-premium p-3">
      <div className="flex items-start gap-2">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${cor}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xs font-body font-semibold capitalize">{change.acao}</span>
            <span className="text-xs font-mono text-aletis-grafite-claro">{change.entidade}</span>
            {change.entidadeId && <span className="text-[10px] font-mono text-aletis-grafite-claro/70">#{change.entidadeId.slice(-8)}</span>}
            <span className="text-[10px] text-aletis-grafite-claro ml-auto">
              {new Date(change.criadoEm).toLocaleString('pt-BR')}
            </span>
          </div>
          <p className="text-[11px] text-aletis-grafite-claro mt-0.5">
            por <strong>{change.atorNome ?? change.ator ?? 'sistema'}</strong>
            {change.origem && <span> · via {change.origem}</span>}
          </p>
          {diffEntries.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {diffEntries.slice(0, 5).map(([campo, valores]) => (
                <div key={campo} className="text-[11px] font-body bg-aletis-cream/30 rounded px-2 py-1 flex items-baseline gap-2">
                  <span className="font-mono text-aletis-grafite-claro min-w-[120px]">{campo}:</span>
                  <span className="text-red-700 line-through font-mono opacity-70">
                    {valores.antes != null ? String(valores.antes).slice(0, 40) : '∅'}
                  </span>
                  <span className="text-aletis-grafite-claro">→</span>
                  <span className="text-aletis-verde font-mono">
                    {valores.depois != null ? String(valores.depois).slice(0, 40) : '∅'}
                  </span>
                </div>
              ))}
              {diffEntries.length > 5 && (
                <p className="text-[10px] text-aletis-grafite-claro pl-2">
                  + {diffEntries.length - 5} campos
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="h-20 rounded-xl bg-gray-100 animate-pulse" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
      ))}
    </div>
  )
}
