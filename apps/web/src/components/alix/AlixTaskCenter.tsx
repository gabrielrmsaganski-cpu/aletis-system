import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Database,
  Loader2,
  PauseCircle,
  RefreshCw,
  RotateCcw,
  Square,
  Workflow,
} from 'lucide-react'

import { apiFetch } from '../../hooks/useApi'

export type AlixWorkMode = 'client_analysis' | 'documentary' | 'negotiation' | 'research' | 'document_generation' | 'due_diligence'

export interface AlixMission {
  id: string
  sessionId: string
  clienteId?: string
  title: string
  prompt: string
  workMode: AlixWorkMode
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  currentStep?: string
  costUsd: string
  metadata?: { costKnown?: boolean; provider?: string; [key: string]: unknown }
  error?: string
  cancellable: boolean
  createdAt: string
  updatedAt: string
  steps: Array<{
    id: string
    code: string
    title: string
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
    progress: number
    details?: string
  }>
  sources: Array<{ id: string; kind: string; sourceId?: string; label: string; url?: string }>
  result?: { conclusion: string; facts: string[]; risks: string[]; gaps: string[]; nextAction: string }
}

const MODE_LABELS: Record<AlixWorkMode, string> = {
  client_analysis: 'Análise de cliente',
  documentary: 'Documental',
  negotiation: 'Negociação',
  research: 'Pesquisa',
  document_generation: 'Geração documental',
  due_diligence: 'Due diligence',
}

function statusLabel(status: AlixMission['status']): string {
  return ({ queued: 'Na fila', running: 'Em andamento', completed: 'Concluída', failed: 'Falhou', cancelled: 'Cancelada' })[status]
}

function statusClasses(status: AlixMission['status']): string {
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'running') return 'border-aletis-verde/25 bg-aletis-verde/10 text-aletis-verde-escuro'
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-800'
  if (status === 'cancelled') return 'border-slate-200 bg-slate-100 text-slate-600'
  return 'border-amber-200 bg-amber-50 text-amber-800'
}

function StepIcon({ status }: { status: AlixMission['steps'][number]['status'] }) {
  if (status === 'completed') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
  if (status === 'running') return <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" />
  if (status === 'failed') return <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
  if (status === 'cancelled') return <PauseCircle className="h-3.5 w-3.5 text-slate-400" />
  return <Circle className="h-3.5 w-3.5 text-slate-300" />
}

export default function AlixTaskCenter({
  sessionId,
  clienteId,
  refreshKey = 0,
  onResume,
}: {
  sessionId?: string | null
  clienteId?: string | null
  refreshKey?: number
  onResume?: (mission: AlixMission) => void
}) {
  const [missions, setMissions] = useState<AlixMission[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const scopeKey = `${sessionId || ''}:${clienteId || ''}`
  const scopeRef = useRef(scopeKey)
  scopeRef.current = scopeKey
  const requestRef = useRef<AbortController | null>(null)
  const actionRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    if (actionRef.current && !actionRef.current.signal.aborted) return false
    requestRef.current?.abort()
    if (!sessionId && !clienteId) {
      setMissions([])
      setLoading(false)
      return false
    }
    const controller = new AbortController()
    requestRef.current = controller
    const query = new URLSearchParams({ limit: '20' })
    if (sessionId) query.set('sessionId', sessionId)
    if (clienteId) query.set('clienteId', clienteId)
    const current = () => !controller.signal.aborted && scopeRef.current === scopeKey && requestRef.current === controller
    setLoading(true)
    try {
      const data = await apiFetch<{ missions: AlixMission[] }>(`/alix/missions?${query}`, { signal: controller.signal })
      if (!current()) return false
      setMissions(data.missions || [])
      setError(null)
      return (data.missions || []).some(mission => ['queued', 'running'].includes(mission.status))
    } catch (err) {
      if (current()) setError((err as Error).message)
      return false
    } finally {
      if (current()) setLoading(false)
    }
  }, [sessionId, clienteId, scopeKey])

  useEffect(() => {
    setMissions([])
    setError(null)
    setExpanded(null)
    setActing(null)
    actionRef.current?.abort()
  }, [scopeKey])

  useEffect(() => {
    let disposed = false
    let generation = 0
    let timer: number | undefined
    const poll = async () => {
      if (disposed) return
      const currentGeneration = ++generation
      const active = document.visibilityState === 'hidden' ? false : await load()
      if (!disposed && currentGeneration === generation && (sessionId || clienteId)) timer = window.setTimeout(() => void poll(), active ? 5_000 : 30_000)
    }
    const visible = () => {
      if (document.visibilityState !== 'visible') return
      window.clearTimeout(timer)
      void poll()
    }
    void poll()
    document.addEventListener('visibilitychange', visible)
    return () => {
      disposed = true
      window.clearTimeout(timer)
      requestRef.current?.abort()
      document.removeEventListener('visibilitychange', visible)
    }
  }, [load, refreshKey])

  useEffect(() => () => actionRef.current?.abort(), [])

  const act = useCallback(async (mission: AlixMission, action: 'cancel' | 'resume') => {
    if (actionRef.current && !actionRef.current.signal.aborted) return
    const controller = new AbortController()
    actionRef.current = controller
    const current = () => !controller.signal.aborted && scopeRef.current === scopeKey
    requestRef.current?.abort()
    setActing(mission.id)
    try {
      const updated = await apiFetch<AlixMission>(`/alix/missions/${encodeURIComponent(mission.id)}/${action}`, { method: 'POST', signal: controller.signal })
      if (!current()) return
      setMissions((current) => current.map((item) => item.id === updated.id ? updated : item))
      if (action === 'resume') onResume?.(updated)
    } catch (err) {
      if (current()) setError((err as Error).message)
    } finally {
      if (current()) {
        setActing(null)
        setLoading(false)
      }
      if (actionRef.current === controller) actionRef.current = null
    }
  }, [onResume, scopeKey])

  const active = missions.filter((mission) => ['queued', 'running'].includes(mission.status)).length
  return (
    <section className="rounded-2xl border border-aletis-borda bg-card p-4 shadow-sm" aria-label="Central de tarefas da ALIX">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-foreground" />
            <h2 className="text-sm font-display font-bold text-foreground">Central de tarefas</h2>
            {active > 0 && <span className="rounded-full bg-aletis-verde px-1.5 py-0.5 text-[9px] font-bold text-white">{active}</span>}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Acompanhe fontes e resultados. Retomar prepara a solicitação para novo envio.</p>
        </div>
        <button type="button" onClick={() => void load()} className="rounded-lg p-1.5 text-muted-foreground hover:bg-aletis-bege" aria-label="Atualizar missões">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[10px] text-red-700">{error}</div>}
      {!sessionId && !clienteId ? (
        <div className="mt-3 rounded-xl border border-dashed border-aletis-borda p-3 text-center text-[11px] text-muted-foreground">Inicie uma conversa ou selecione um cliente.</div>
      ) : missions.length === 0 && !loading ? (
        <div className="mt-3 rounded-xl border border-dashed border-aletis-borda p-3 text-center text-[11px] text-muted-foreground">A próxima solicitação será registrada como missão estruturada.</div>
      ) : (
        <div className="mt-3 space-y-2">
          {missions.slice(0, 8).map((mission) => {
            const isOpen = expanded === mission.id
            const cost = mission.costUsd == null || mission.metadata?.costKnown === false || mission.metadata?.provider === 'foundry' ? null : Number(mission.costUsd)
            return (
              <article key={mission.id} className="overflow-hidden rounded-xl border border-aletis-borda bg-aletis-bege/20">
                <button type="button" onClick={() => setExpanded(isOpen ? null : mission.id)} className="w-full p-3 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                        <h3 className="truncate text-xs font-semibold text-foreground">{mission.title}</h3>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-5 text-[9px] text-muted-foreground">
                        <span>{MODE_LABELS[mission.workMode]}</span><span>•</span><span>{mission.sources.length} fonte(s)</span>{cost !== null && Number.isFinite(cost) && cost > 0 && <><span>•</span><span>US$ {cost.toFixed(4)}</span></>}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${statusClasses(mission.status)}`}>{statusLabel(mission.status)}</span>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-aletis-verde transition-all" style={{ width: `${Math.max(0, Math.min(100, mission.progress))}%` }} />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-aletis-borda bg-card px-3 pb-3 pt-2.5">
                    <div className="space-y-1.5">
                      {mission.steps.map((step) => (
                        <div key={step.id} className="flex items-start gap-2 text-[10px] text-[var(--text-soft)]">
                          <StepIcon status={step.status} />
                          <span className={step.status === 'running' ? 'font-semibold text-aletis-verde-escuro' : ''}>{step.title}</span>
                        </div>
                      ))}
                    </div>
                    {mission.sources.length > 0 && (
                      <div className="mt-3 border-t border-aletis-borda/60 pt-2">
                        <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground"><Database className="h-3 w-3" />Fontes</div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {mission.sources.slice(0, 8).map((source) => <span key={source.id} title={source.sourceId} className="max-w-full truncate rounded bg-aletis-bege px-1.5 py-1 text-[9px] text-[var(--text-soft)]">{source.label}</span>)}
                        </div>
                      </div>
                    )}
                    {mission.error && <div className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-[10px] text-red-700">{mission.error}</div>}
                    {mission.result?.nextAction && <div className="mt-2 rounded-lg border border-aletis-verde/15 bg-aletis-verde/5 px-2 py-1.5 text-[10px] text-aletis-verde-escuro"><strong>Próxima ação:</strong> {mission.result.nextAction}</div>}
                    <div className="mt-3 flex justify-end gap-2">
                      {mission.cancellable && ['queued', 'running'].includes(mission.status) && (
                        <button type="button" disabled={acting === mission.id} onClick={() => void act(mission, 'cancel')} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                          {acting === mission.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}Cancelar
                        </button>
                      )}
                      {onResume && ['failed', 'cancelled'].includes(mission.status) && (
                        <button type="button" disabled={acting === mission.id} onClick={() => void act(mission, 'resume')} className="inline-flex items-center gap-1 rounded-lg bg-aletis-verde px-2 py-1 text-[10px] font-semibold text-white hover:bg-aletis-verde-escuro disabled:opacity-50">
                          {acting === mission.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}Retomar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
      {loading && missions.length === 0 && <div className="mt-3 flex items-center justify-center gap-2 py-3 text-[10px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando missões…</div>}
    </section>
  )
}
