// ============================================================
// KanbanSlaPanel — board kanban das 7 etapas R.OP.009 com SLAs
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { Clock, CheckCircle2, AlertTriangle, Pause, Play, RotateCw } from 'lucide-react'
import { Skeleton as UISkeleton } from '../ui'

interface Etapa {
  id: string
  grupoId: string
  etapaCodigo: string
  etapaOrdem: number
  tarefa: string
  prazoDias: number
  status: 'pendente' | 'em_andamento' | 'concluida' | 'bloqueada' | 'cancelada'
  responsavel?: string | null
  iniciadaEm?: string | null
  concluidaEm?: string | null
  observacoes?: string | null
  bloqueioMotivo?: string | null
  atrasoDias: number
  prazoLimite: string | null
  pctTempoConsumido: number
  diasRestantes: number | null
}

interface KanbanColuna {
  codigo: string
  rotulo: string
  cor: string
  ordem: number
  total: number
  concluidas: number
  emAndamento: number
  pendentes: number
  atrasadas: number
  bloqueadas: number
  etapas: Etapa[]
}

interface KanbanData {
  grupoId: string
  totalEtapas: number
  totalConcluidas: number
  totalAtrasadas: number
  totalBloqueadas: number
  pctConcluido: number
  proximaPendente: Etapa | null
  colunas: KanbanColuna[]
}

interface Props {
  grupoId: string
}

export default function KanbanSlaPanel({ grupoId }: Props) {
  const [data, setData] = useState<KanbanData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch<KanbanData>(`/gestao-financeira/grupos/${grupoId}/kanban-sla`)
      setData(r)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [grupoId])

  useEffect(() => { load() }, [load])

  async function patchEtapa(etapaId: string, patch: Partial<Etapa>) {
    await apiFetch(`/gestao-financeira/etapas-sla/${etapaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...patch, grupoId }),
    })
    await load()
  }

  if (error) return <div className="card-premium p-4 text-xs text-red-600">{error}</div>
  if (!data) return <Skeleton />

  return (
    <div className="space-y-4">
      {/* Hero header */}
      <div className="card-premium p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">
              ⏱️ Workflow R.OP.009 — Kanban SLA
            </h3>
            <p className="text-[10px] text-aletis-grafite-claro">
              7 etapas · {data.totalEtapas} tarefas · {data.totalConcluidas} concluídas · {data.totalAtrasadas} atrasadas
            </p>
          </div>
          <button onClick={load} disabled={loading} className="px-2 py-1 rounded-lg text-aletis-grafite-claro hover:bg-aletis-grafite-escuro/5">
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Progress bar global */}
        <div className="h-2 bg-aletis-grafite-claro/15 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-gradient-to-r from-aletis-verde to-aletis-dourado transition-all"
            style={{ width: `${data.pctConcluido}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-aletis-grafite-claro tabular-nums">
          <span>{data.totalConcluidas} de {data.totalEtapas}</span>
          <span className="font-semibold">{data.pctConcluido.toFixed(0)}%</span>
        </div>

        {/* Próxima ação */}
        {data.proximaPendente && (
          <div className="mt-3 rounded-lg bg-aletis-cream/40 border border-aletis-dourado/30 p-2">
            <p className="text-[10px] text-aletis-grafite-claro uppercase tracking-wider">Próxima ação:</p>
            <p className="text-sm font-display font-semibold text-aletis-grafite-escuro">{data.proximaPendente.tarefa}</p>
            <p className="text-[10px] text-aletis-grafite-claro mt-0.5">
              SLA: {data.proximaPendente.prazoDias} dias úteis
            </p>
          </div>
        )}
      </div>

      {/* Kanban colunas */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-2 overflow-x-auto">
        {data.colunas.map((col) => (
          <div key={col.codigo} className="rounded-xl border border-aletis-grafite-claro/15 bg-aletis-cream/20 overflow-hidden flex flex-col">
            <div
              className="px-2 py-1.5 border-b border-aletis-grafite-claro/15"
              style={{ borderTopColor: col.cor, borderTopWidth: '3px' }}
            >
              <p className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: col.cor }}>
                {col.rotulo}
              </p>
              <div className="flex items-center justify-between text-[9px] text-aletis-grafite-claro tabular-nums mt-0.5">
                <span>{col.concluidas}/{col.total}</span>
                {col.atrasadas > 0 && <span className="text-red-600 font-bold">⚠ {col.atrasadas}</span>}
              </div>
            </div>
            <div className="flex-1 p-1.5 space-y-1.5 min-h-[150px]">
              {col.etapas.map((e) => (
                <EtapaCard key={e.id} etapa={e} onPatch={(p) => patchEtapa(e.id, p)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EtapaCard({ etapa, onPatch }: { etapa: Etapa; onPatch: (p: Partial<Etapa>) => void }) {
  const [showActions, setShowActions] = useState(false)
  const isAtrasada = etapa.atrasoDias > 0 && etapa.status !== 'concluida'

  const cls =
    etapa.status === 'concluida' ? 'bg-aletis-verde/10 border-aletis-verde/30 text-aletis-verde'
    : etapa.status === 'em_andamento' ? isAtrasada ? 'bg-red-50 border-red-300' : 'bg-blue-50 border-blue-300'
    : etapa.status === 'bloqueada' ? 'bg-amber-50 border-amber-300'
    : 'bg-white border-aletis-grafite-claro/15'

  const icon =
    etapa.status === 'concluida' ? <CheckCircle2 className="w-3 h-3" />
    : etapa.status === 'em_andamento' ? <Play className="w-3 h-3" />
    : etapa.status === 'bloqueada' ? <Pause className="w-3 h-3" />
    : <Clock className="w-3 h-3" />

  return (
    <div className={`rounded-lg border p-2 cursor-pointer transition-all hover:shadow-sm ${cls}`} onClick={() => setShowActions(!showActions)}>
      <div className="flex items-start gap-1">
        <span className="mt-0.5">{icon}</span>
        <p className="text-[10px] font-body leading-tight flex-1">{etapa.tarefa}</p>
      </div>
      <div className="flex items-center justify-between text-[9px] text-aletis-grafite-claro mt-1 tabular-nums">
        <span>SLA: {etapa.prazoDias}d</span>
        {isAtrasada && <span className="text-red-600 font-bold">+{etapa.atrasoDias}d</span>}
        {etapa.status === 'em_andamento' && etapa.diasRestantes !== null && etapa.diasRestantes >= 0 && (
          <span>{etapa.diasRestantes}d rest.</span>
        )}
      </div>
      {etapa.status === 'em_andamento' && etapa.pctTempoConsumido > 0 && (
        <div className="h-1 bg-aletis-grafite-claro/15 rounded-full overflow-hidden mt-1">
          <div
            className={`h-full ${etapa.pctTempoConsumido > 100 ? 'bg-red-500' : etapa.pctTempoConsumido > 80 ? 'bg-amber-500' : 'bg-aletis-verde'}`}
            style={{ width: `${Math.min(100, etapa.pctTempoConsumido)}%` }}
          />
        </div>
      )}

      {showActions && (
        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-current/10" onClick={(e) => e.stopPropagation()}>
          {etapa.status !== 'em_andamento' && (
            <button
              onClick={() => onPatch({ status: 'em_andamento' })}
              className="px-1.5 py-0.5 text-[9px] rounded bg-blue-500 text-white"
            >
              ▶ Iniciar
            </button>
          )}
          {etapa.status !== 'concluida' && (
            <button
              onClick={() => onPatch({ status: 'concluida' })}
              className="px-1.5 py-0.5 text-[9px] rounded bg-aletis-verde text-white"
            >
              ✓ Concluir
            </button>
          )}
          {etapa.status !== 'bloqueada' && (
            <button
              onClick={() => {
                const motivo = prompt('Motivo do bloqueio:')
                if (motivo) onPatch({ status: 'bloqueada', bloqueioMotivo: motivo })
              }}
              className="px-1.5 py-0.5 text-[9px] rounded bg-amber-500 text-white"
            >
              ⏸ Bloquear
            </button>
          )}
          {etapa.status !== 'pendente' && (
            <button
              onClick={() => onPatch({ status: 'pendente', iniciadaEm: null, concluidaEm: null } as any)}
              className="px-1.5 py-0.5 text-[9px] rounded border border-aletis-grafite-claro/30"
            >
              ↻ Resetar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <UISkeleton className="h-20 rounded-xl" />
      <div className="grid grid-cols-7 gap-2">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <UISkeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
