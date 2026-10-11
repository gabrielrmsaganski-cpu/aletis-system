import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileSearch, Loader2, RefreshCw, RotateCcw } from 'lucide-react'

import { apiFetch } from '../../hooks/useApi'

interface PipelineRun {
  id: string
  documentId: string
  status: 'queued' | 'running' | 'needs_review' | 'awaiting_registration' | 'registered' | 'cancelled' | 'failed'
  currentStage: 'receber' | 'validar' | 'extrair' | 'classificar' | 'cruzar' | 'revisar' | 'cadastrar'
  progress: number
  specializedType?: string
  error?: string
  stageHistory: Array<{ stage: string; status: string; at: string; detail?: string }>
  fields?: Array<{
    id: string
    fieldKey: string
    valueText: string
    confidence: number
    evidenceText: string
    evidenceSource: string
    page?: number
    sheet?: string
    status: 'extracted' | 'low_confidence' | 'confirmed' | 'contested' | 'rejected'
  }>
  findings?: Array<{ id?: string; kind: string; severity: string; title: string; description: string; status?: string }>
}

const STAGE_LABELS: Record<PipelineRun['currentStage'], string> = {
  receber: 'Receber', validar: 'Validar', extrair: 'Extrair', classificar: 'Classificar',
  cruzar: 'Cruzar', revisar: 'Revisar', cadastrar: 'Cadastrar',
}

function statusLabel(value: PipelineRun['status']): string {
  return ({
    queued: 'Na fila', running: 'Processando', needs_review: 'Revisão necessária',
    awaiting_registration: 'Pronto para cadastrar', registered: 'Cadastrado', cancelled: 'Cancelado', failed: 'Falhou',
  })[value]
}

export default function DocumentPipelinePanel({ sessionId, clienteId }: { sessionId?: string | null; clienteId?: string | null }) {
  const [runs, setRuns] = useState<PipelineRun[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, PipelineRun>>({})
  const [loading, setLoading] = useState(false)
  const [reviewingField, setReviewingField] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!sessionId && !clienteId) { setRuns([]); return }
    const query = new URLSearchParams({ limit: '20' })
    if (sessionId) query.set('sessionId', sessionId)
    else if (clienteId) query.set('clienteId', clienteId)
    setLoading(true)
    try {
      const response = await apiFetch<{ runs: PipelineRun[] }>(`/alix/document-pipeline?${query}`)
      setRuns(response.runs || [])
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally { setLoading(false) }
  }, [sessionId, clienteId])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 5_000)
    return () => window.clearInterval(timer)
  }, [load])

  const toggle = useCallback(async (run: PipelineRun) => {
    if (expanded === run.id) { setExpanded(null); return }
    setExpanded(run.id)
    if (details[run.id]) return
    try {
      const detail = await apiFetch<PipelineRun>(`/alix/document-pipeline/${encodeURIComponent(run.id)}`)
      setDetails((current) => ({ ...current, [run.id]: detail }))
    } catch (err) { setError((err as Error).message) }
  }, [expanded, details])

  const rerun = useCallback(async (run: PipelineRun) => {
    try {
      await apiFetch(`/alix/document-pipeline/${encodeURIComponent(run.id)}/rerun`, { method: 'POST' })
      await load()
    } catch (err) { setError((err as Error).message) }
  }, [load])

  const reviewField = useCallback(async (
    runId: string,
    fieldId: string,
    status: 'confirmed' | 'contested' | 'rejected',
  ) => {
    setReviewingField(fieldId)
    try {
      await apiFetch(`/alix/document-pipeline/fields/${encodeURIComponent(fieldId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      const detail = await apiFetch<PipelineRun>(`/alix/document-pipeline/${encodeURIComponent(runId)}`)
      setDetails((current) => ({ ...current, [runId]: detail }))
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setReviewingField(null)
    }
  }, [])

  if (!sessionId && !clienteId) return null
  return (
    <section className="rounded-2xl border border-aletis-borda bg-card p-4 shadow-sm" aria-label="Esteira documental especializada">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><FileSearch className="h-4 w-4 text-aletis-dourado" /><h2 className="text-sm font-display font-bold text-foreground">Esteira documental</h2></div>
          <p className="mt-1 text-[10px] text-muted-foreground">Validação, evidências, versões, divergências e validade.</p>
        </div>
        <button type="button" onClick={() => void load()} className="rounded-lg p-1.5 text-muted-foreground hover:bg-aletis-bege" aria-label="Atualizar esteira"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      {error && <div className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-[10px] text-red-700">{error}</div>}
      {runs.length === 0 && !loading ? <div className="mt-3 rounded-xl border border-dashed border-aletis-borda p-3 text-center text-[11px] text-muted-foreground">Nenhum documento processado neste contexto.</div> : (
        <div className="mt-3 space-y-2">
          {runs.slice(0, 6).map((run) => {
            const open = expanded === run.id
            const detail = details[run.id]
            const openFindings = detail?.findings?.filter((item) => item.status !== 'resolved' && item.status !== 'dismissed') || []
            return (
              <article key={run.id} className="overflow-hidden rounded-xl border border-aletis-borda bg-aletis-bege/20">
                <button type="button" onClick={() => void toggle(run)} className="w-full p-3 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-1.5">
                      {open ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                      <div className="min-w-0"><div className="truncate text-xs font-semibold text-foreground">{run.specializedType?.replace(/_/g, ' ') || 'Classificando documento'}</div><div className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">{run.documentId}</div></div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${run.status === 'failed' ? 'bg-red-50 text-red-700' : run.status === 'registered' ? 'bg-emerald-50 text-emerald-700' : run.status === 'needs_review' ? 'bg-amber-50 text-amber-700' : 'bg-aletis-verde/10 text-aletis-verde-escuro'}`}>{statusLabel(run.status)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-aletis-dourado" style={{ width: `${run.progress}%` }} /></div><span className="text-[9px] font-semibold text-muted-foreground">{STAGE_LABELS[run.currentStage]}</span></div>
                </button>
                {open && (
                  <div className="border-t border-aletis-borda bg-card p-3">
                    {!detail ? <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Carregando evidências…</div> : (
                      <>
                        <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-aletis-bege/50 p-2"><strong className="block text-sm text-foreground">{detail.fields?.length || 0}</strong><span className="text-[9px] text-muted-foreground">campos</span></div><div className="rounded-lg bg-aletis-bege/50 p-2"><strong className="block text-sm text-foreground">{openFindings.length}</strong><span className="text-[9px] text-muted-foreground">achados</span></div><div className="rounded-lg bg-aletis-bege/50 p-2"><strong className="block text-sm text-foreground">{detail.stageHistory.filter((item) => item.status === 'completed').length}</strong><span className="text-[9px] text-muted-foreground">etapas</span></div></div>
                        {(detail.fields?.length || 0) > 0 && (
                          <div className="mt-3 space-y-2">
                            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Revisão humana dos campos</div>
                            {detail.fields?.slice(0, 8).map((field) => {
                              const reviewed = ['confirmed', 'contested', 'rejected'].includes(field.status)
                              return (
                                <div key={field.id} className="rounded-lg border border-aletis-borda bg-aletis-bege/20 p-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="truncate text-[10px] font-bold text-foreground">{field.fieldKey.replace(/_/g, ' ')}</div>
                                      <div className="truncate text-[11px] text-[var(--text-soft)]">{field.valueText}</div>
                                    </div>
                                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold ${field.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : ['contested', 'rejected'].includes(field.status) ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                                      {field.status === 'confirmed' ? 'confirmado' : field.status === 'contested' ? 'divergente' : field.status === 'rejected' ? 'rejeitado' : `${Math.round(field.confidence * 100)}%`}
                                    </span>
                                  </div>
                                  <div className="mt-1 rounded bg-card px-1.5 py-1 text-[9px] text-muted-foreground" title={field.evidenceText}>“{field.evidenceText}” · {field.evidenceSource}{field.page ? ` · pág. ${field.page}` : ''}{field.sheet ? ` · aba ${field.sheet}` : ''}</div>
                                  {!reviewed && (
                                    <div className="mt-1.5 flex justify-end gap-1.5">
                                      <button type="button" disabled={reviewingField === field.id} onClick={() => void reviewField(run.id, field.id, 'contested')} className="rounded border border-red-200 px-2 py-1 text-[9px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Divergente</button>
                                      <button type="button" disabled={reviewingField === field.id} onClick={() => void reviewField(run.id, field.id, 'confirmed')} className="rounded bg-emerald-700 px-2 py-1 text-[9px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">Confirmar</button>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {openFindings.slice(0, 4).map((finding) => <div key={finding.id || finding.description} className={`mt-2 flex gap-1.5 rounded-lg px-2 py-1.5 text-[10px] ${['high', 'critical'].includes(finding.severity) ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /><span><strong>{finding.title}:</strong> {finding.description}</span></div>)}
                        {openFindings.length === 0 && <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1.5 text-[10px] text-emerald-800"><CheckCircle2 className="h-3 w-3" />Sem achados críticos abertos.</div>}
                      </>
                    )}
                    {['failed', 'needs_review'].includes(run.status) && <div className="mt-3 flex justify-end"><button type="button" onClick={() => void rerun(run)} className="inline-flex items-center gap-1 rounded-lg border border-aletis-borda px-2 py-1 text-[10px] font-semibold text-[var(--text-soft)] hover:bg-aletis-bege"><RotateCcw className="h-3 w-3" />Reprocessar</button></div>}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
