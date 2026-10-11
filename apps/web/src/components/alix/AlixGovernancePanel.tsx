import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Loader2,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  XCircle,
} from 'lucide-react'

import { apiFetch } from '../../hooks/useApi'

interface GovernanceDashboard {
  generatedAt?: string
  releases: { total: number; active: number; blocked: number }
  evaluations: { total: number; cases?: number; passed?: number }
  goldenSet: { total: number; approved: number; baseline: number; candidate: number; dataset_version?: number }
  extraction: { reviewed: number; confirmed: number; contested: number; precision: number | null }
  approvals: { total: number; executed: number; rejected?: number; double_approved?: number }
  automations: { pending: number; awaiting_confirmation: number; auto_executed: number; executed?: number; failed?: number }
  safeguards: Record<string, boolean>
}

interface GovernanceRelease {
  id: string
  component: string
  changeType: string
  candidateVersion: string
  status: string
  evaluationPassed: boolean
  metrics: { sampleSize?: number; passRate?: number; evidenceRate?: number; criticalFailures?: number }
  reviewedBy?: string
}

interface AutomationSuggestion {
  id: string
  clienteId?: string
  suggestionType: string
  title: string
  description: string
  severity: 'info' | 'important' | 'critical'
  riskLevel: 'read' | 'internal' | 'write' | 'external' | 'critical'
  status: string
  confirmationId?: string
  lastSeenAt?: string
  proposedAction?: { toolName?: string; label?: string; operationalItemId?: string }
}

const safeguardLabels: Record<string, string> = {
  responseEvidenceGuard: 'Evidência em respostas materiais',
  documentWriteGuard: 'Bloqueio de escrita documental sem lastro',
  singleConfirmation: 'Confirmação humana em mutações',
  doubleConfirmationHighImpact: 'Confirmação dupla em alto impacto',
  automaticExternalWrites: 'Escritas externas automáticas',
}

function pct(value: number | null | undefined): string {
  return value == null ? '—' : `${Math.round(value * 100)}%`
}

function severityClass(severity: AutomationSuggestion['severity']): string {
  if (severity === 'critical') return 'border-red-500/30 bg-red-500/10 text-red-100'
  if (severity === 'important') return 'border-amber-500/30 bg-amber-500/10 text-amber-100'
  return 'border-aletis-sage/15 bg-aletis-cream/[0.04] text-aletis-cream'
}

export default function AlixGovernancePanel() {
  const [dashboard, setDashboard] = useState<GovernanceDashboard | null>(null)
  const [releases, setReleases] = useState<GovernanceRelease[]>([])
  const [suggestions, setSuggestions] = useState<AutomationSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [dash, releaseData, suggestionData] = await Promise.all([
        apiFetch<GovernanceDashboard>('/alix/governance/dashboard'),
        apiFetch<{ releases: GovernanceRelease[] }>('/alix/governance/releases?limit=50'),
        apiFetch<{ suggestions: AutomationSuggestion[] }>('/alix/governance/suggestions?limit=100'),
      ])
      setDashboard(dash)
      setReleases(releaseData.releases || [])
      setSuggestions(suggestionData.suggestions || [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const actionable = useMemo(
    () => suggestions.filter((item) => ['pending_review', 'failed', 'awaiting_confirmation'].includes(item.status)),
    [suggestions],
  )

  const scan = async () => {
    setBusy('scan')
    setNotice(null)
    try {
      await apiFetch('/alix/governance/suggestions/scan', { method: 'POST' })
      setNotice('Varredura concluída. A fila foi deduplicada e atualizada.')
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const prepare = async (id: string) => {
    setBusy(id)
    setNotice(null)
    try {
      const item = await apiFetch<AutomationSuggestion>(`/alix/governance/suggestions/${id}/prepare`, { method: 'POST' })
      setNotice(item.confirmationId
        ? 'A ação foi enviada para a fila de confirmações. Nada foi executado ainda.'
        : 'Leitura reconhecida. A pendência continua na fila até a conferência da fonte e a execução do próximo passo.')
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const dismiss = async (id: string) => {
    setBusy(`dismiss:${id}`)
    try {
      await apiFetch(`/alix/governance/suggestions/${id}/dismiss`, { method: 'POST' })
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const reviewRelease = async (release: GovernanceRelease, decision: 'approve' | 'reject') => {
    setBusy(release.id)
    try {
      await apiFetch(`/alix/governance/releases/${release.id}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const activateRelease = async (release: GovernanceRelease) => {
    setBusy(release.id)
    try {
      await apiFetch(`/alix/governance/releases/${release.id}/activate`, { method: 'POST' })
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (loading && !dashboard) {
    return <div className="flex min-h-[280px] items-center justify-center text-aletis-sage"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando governança…</div>
  }

  return (
    <div className="space-y-4 text-aletis-cream">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-aletis-sage/15 bg-aletis-cream/[0.04] px-3 py-2">
        <div>
          <p className="text-xs font-semibold">Controle operacional da IA</p>
          <p className="text-[11px] text-aletis-sage">Evals, promoção de versões, evidências e automações supervisionadas.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void scan()} disabled={busy === 'scan'} className="inline-flex items-center gap-1.5 rounded-lg border border-aletis-gold/30 bg-aletis-gold/10 px-2.5 py-1.5 text-xs text-aletis-gold-claro hover:bg-aletis-gold/20 disabled:opacity-50">
            {busy === 'scan' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}Varrer
          </button>
          <button onClick={() => void load()} disabled={loading} className="rounded-lg border border-aletis-sage/20 p-1.5 text-aletis-sage hover:bg-white/5" aria-label="Atualizar governança">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">{notice}</div>}

      {dashboard && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Golden set" value={String(dashboard.goldenSet.total)} detail={`${dashboard.goldenSet.approved + dashboard.goldenSet.baseline} revisados`} />
            <Metric label="Precisão extração" value={pct(dashboard.extraction.precision)} detail={`${dashboard.extraction.reviewed} campos revisados`} />
            <Metric label="Releases ativas" value={String(dashboard.releases.active)} detail={`${dashboard.releases.blocked} bloqueadas pelos evals`} />
            <Metric label="Ações executadas" value={String(dashboard.approvals.executed)} detail={`${dashboard.approvals.double_approved || 0} com confirmação dupla`} />
          </div>

          <section className="rounded-xl border border-aletis-sage/15 bg-black/10 p-3">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold"><ShieldCheck className="h-4 w-4 text-emerald-300" />Barreiras ativas</h3>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {Object.entries(dashboard.safeguards || {}).map(([key, enabled]) => {
                const safe = key === 'automaticExternalWrites' ? !enabled : enabled
                return (
                  <div key={key} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.025] px-2.5 py-2 text-[11px]">
                    {safe ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />}
                    <span>{safeguardLabels[key] || key}</span>
                    <span className="ml-auto text-aletis-sage">{key === 'automaticExternalWrites' ? (enabled ? 'permitidas' : 'bloqueadas') : (enabled ? 'ativa' : 'inativa')}</span>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}

      <section className="rounded-xl border border-aletis-sage/15 bg-black/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-xs font-bold"><Bot className="h-4 w-4 text-aletis-gold" />Sugestões proativas</h3>
          <span className="text-[10px] text-aletis-sage">{actionable.length} acionáveis</span>
        </div>
        {actionable.length === 0 ? (
          <p className="rounded-lg border border-white/5 bg-white/[0.025] px-3 py-4 text-center text-xs text-aletis-sage">Nenhuma sugestão pendente.</p>
        ) : (
          <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
            {actionable.slice(0, 40).map((item) => (
              <article key={item.id} className={`rounded-xl border p-3 ${severityClass(item.severity)}`}>
                <div className="flex items-start gap-2">
                  {item.severity === 'critical' ? <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" /> : <ChevronRight className="mt-0.5 h-4 w-4 flex-none" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">{item.title}</p>
                    <p className="mt-1 text-[11px] opacity-75">{item.description}</p>
                    <p className="mt-1.5 text-[10px] opacity-60">{item.suggestionType} · risco {item.riskLevel}{item.clienteId ? ` · ${item.clienteId}` : ''}</p>
                  </div>
                </div>
                {item.status === 'awaiting_confirmation' ? (
                  <div className="mt-2 rounded-lg border border-blue-400/20 bg-blue-500/10 px-2.5 py-2 text-[11px] text-blue-100">
                    Na fila de confirmação: {item.confirmationId || 'aguardando card'}
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.proposedAction?.operationalItemId && item.clienteId && <Link to={`/ia?view=operations&clienteId=${encodeURIComponent(item.clienteId)}`} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500">Abrir trabalho no Meu dia</Link>}
                    <button onClick={() => void prepare(item.id)} disabled={busy === item.id} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                      {busy === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      {item.proposedAction?.toolName ? 'Preparar confirmação' : 'Reconhecer'}
                    </button>
                    <button onClick={() => void dismiss(item.id)} disabled={busy === `dismiss:${item.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] hover:bg-white/5 disabled:opacity-50">
                      <XCircle className="h-3 w-3" />Descartar
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-aletis-sage/15 bg-black/10 p-3">
        <h3 className="mb-2 flex items-center gap-2 text-xs font-bold"><ShieldCheck className="h-4 w-4 text-blue-300" />Releases de IA</h3>
        <div className="space-y-2">
          {releases.slice(0, 20).map((release) => (
            <div key={release.id} className="rounded-lg border border-white/5 bg-white/[0.025] px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{release.component} · {release.candidateVersion}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${release.status === 'active' ? 'bg-emerald-500/15 text-emerald-200' : release.evaluationPassed ? 'bg-blue-500/15 text-blue-200' : 'bg-amber-500/15 text-amber-200'}`}>{release.status}</span>
              </div>
              <p className="mt-1 text-[10px] text-aletis-sage">{release.metrics.sampleSize || 0} casos · acerto {pct(release.metrics.passRate)} · evidência {pct(release.metrics.evidenceRate)}</p>
              {release.status === 'evaluated' && release.evaluationPassed && (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => void reviewRelease(release, 'approve')} disabled={busy === release.id} className="rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white">Aprovar</button>
                  <button onClick={() => void reviewRelease(release, 'reject')} disabled={busy === release.id} className="rounded-md border border-white/15 px-2 py-1 text-[10px]">Rejeitar</button>
                </div>
              )}
              {release.status === 'approved' && (
                <button onClick={() => void activateRelease(release)} disabled={busy === release.id} className="mt-2 rounded-md bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white">Ativar versão aprovada</button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-aletis-sage/15 bg-aletis-cream/[0.04] p-3">
      <p className="text-[10px] uppercase tracking-wider text-aletis-sage">{label}</p>
      <p className="mt-1 font-display text-xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[10px] text-aletis-sage">{detail}</p>
    </div>
  )
}
