/**
 * AlixConfirmationBatch — Card de batch de pending confirmations HITL
 *
 * Consome SSE /api/alix/confirmations/stream para atualizar em tempo real
 * quando pending é criado, batch é aplicado ou cancelado.
 * Permite aprovar tudo / aprovar itens específicos / cancelar.
 */
import React, { useEffect, useState, useCallback } from 'react'
import { CheckCircle2, XCircle, Clock, Loader2, AlertCircle, ChevronRight } from 'lucide-react'
import { apiFetch } from '../../hooks/useApi'

export interface PendingConfirmation {
  id: string
  toolName: string
  description: string
  createdAt: string
  expiresAt: string
  batchId?: string
  dependsOn?: string[]
  status?: 'pending' | 'applying' | 'applied' | 'failed' | 'skipped'
  error?: string
}

export interface ConfirmationBatch {
  batchId: string
  sessionId: string
  title: string
  status: 'pending' | 'applying' | 'partial_applied' | 'all_applied' | 'cancelled' | 'failed'
  pendings: PendingConfirmation[]
  createdAt: string
  updatedAt: string
}

interface StoreEvent {
  type: 'hello' | 'pending:created' | 'batch:created' | 'batch:progress' | 'batch:done'
  batch?: ConfirmationBatch
  batchId?: string
  confirmationId?: string
  status?: PendingConfirmation['status']
  detail?: unknown
  confirmation?: PendingConfirmation
}

/**
 * Hook que escuta o stream SSE de confirmations e mantém batches/pendings em estado.
 */
export function useConfirmationStream() {
  const [batches, setBatches] = useState<ConfirmationBatch[]>([])
  const [singles, setSingles] = useState<PendingConfirmation[]>([])

  const refreshFromApi = useCallback(async () => {
    try {
      const [bList, sList] = await Promise.all([
        apiFetch<{ success: boolean; data: ConfirmationBatch[] }>('/alix/confirmations/batches'),
        apiFetch<{ success: boolean; data: PendingConfirmation[] }>('/alix/confirmations'),
      ])
      if (bList.success) setBatches(bList.data ?? [])
      if (sList.success) {
        // Filtra pendings que não pertencem a batch
        const individuals = (sList.data ?? []).filter((p) => !p.batchId)
        setSingles(individuals)
      }
    } catch (err) {
      console.warn('[AlixConfirmationBatch] refresh falhou:', err)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    // Fetch inicial
    refreshFromApi()

    // Abre stream
    const base = (import.meta as any).env?.VITE_API_BASE_URL || ''
    const url = `${base}/api/alix/confirmations/stream`
    const ctrl = new AbortController()

    ;(async () => {
      try {
        const resp = await fetch(url, { signal: ctrl.signal })
        if (!resp.ok || !resp.body) return
        const reader = resp.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (!cancelled) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          // SSE messages separados por \n\n
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''
          for (const block of parts) {
            const data = block.split('\n').find((l) => l.startsWith('data:'))?.slice(5).trim()
            if (!data) continue
            try {
              const ev = JSON.parse(data) as StoreEvent
              handleEvent(ev)
            } catch {
              /* keepalive ou malformado */
            }
          }
        }
      } catch (err) {
        if (!cancelled) console.warn('[AlixConfirmationBatch] stream error:', err)
      }
    })()

    function handleEvent(ev: StoreEvent) {
      if (ev.type === 'batch:created' && ev.batch) {
        setBatches((prev) => [ev.batch!, ...prev.filter((b) => b.batchId !== ev.batch!.batchId)])
      } else if (ev.type === 'batch:done' && ev.batch) {
        setBatches((prev) =>
          prev.map((b) => (b.batchId === ev.batch!.batchId ? ev.batch! : b)),
        )
      } else if (ev.type === 'batch:progress' && ev.batchId && ev.confirmationId) {
        setBatches((prev) =>
          prev.map((b) => {
            if (b.batchId !== ev.batchId) return b
            return {
              ...b,
              pendings: b.pendings.map((p) =>
                p.id === ev.confirmationId ? { ...p, status: ev.status, error: typeof ev.detail === 'string' ? ev.detail : undefined } : p,
              ),
            }
          }),
        )
      } else if (ev.type === 'pending:created' && ev.confirmation) {
        // Pode ser um pending avulso ou de batch; batch:created também virá
        setTimeout(() => refreshFromApi(), 300)
      }
    }

    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [refreshFromApi])

  return { batches, singles, refresh: refreshFromApi }
}

// ─────────────────────────────────────────────────────────

const TOOL_LABEL: Record<string, string> = {
  criar_cliente: 'Criar cliente',
  promover_lead_para_cliente: 'Promover lead → cliente',
  criar_proposta_inteligente: 'Criar proposta inteligente',
  atualizar_proposta: 'Atualizar proposta',
  atualizar_dossie_dividas: 'Atualizar dívidas do dossiê',
  anexar_documento_cliente: 'Anexar documento',
  criar_plano_custeio: 'Criar plano de custeio',
  agendar_reuniao: 'Agendar reunião',
  enviar_mensagem_whatsapp_intent: 'Enviar WhatsApp',
  criar_evento_cliente: 'Criar evento',
  criar_tarefa: 'Criar tarefa',
}

function formatToolName(name: string): string {
  return TOOL_LABEL[name] ?? name
}

// ─────────────────────────────────────────────────────────

interface AlixConfirmationBatchProps {
  batch: ConfirmationBatch
  onApplied?: (batchId: string) => void
  onCancelled?: (batchId: string) => void
}

export function AlixConfirmationBatchCard({ batch, onApplied, onCancelled }: AlixConfirmationBatchProps) {
  const [applying, setApplying] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isTerminal = batch.status === 'all_applied' || batch.status === 'cancelled'

  const applyAll = async () => {
    setApplying(true)
    setError(null)
    try {
      const r = await apiFetch<{ success: boolean; data: { applied: unknown[]; failed: unknown[]; skipped: unknown[] }; error?: string }>(
        `/alix/confirmations/batch/${batch.batchId}/apply`,
        { method: 'POST', body: JSON.stringify({}), headers: { 'content-type': 'application/json' } },
      )
      if (!r.success) throw new Error(r.error || 'Falha')
      onApplied?.(batch.batchId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setApplying(false)
    }
  }

  const cancelAll = async () => {
    setCancelling(true)
    setError(null)
    try {
      const r = await apiFetch<{ success: boolean; error?: string }>(
        `/alix/confirmations/batch/${batch.batchId}/cancel`,
        { method: 'POST' },
      )
      if (!r.success) throw new Error(r.error || 'Falha')
      onCancelled?.(batch.batchId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCancelling(false)
    }
  }

  const statusColor =
    batch.status === 'all_applied' ? 'text-emerald-400 border-emerald-800 bg-emerald-950/40' :
    batch.status === 'cancelled' ? 'text-zinc-500 border-zinc-800 bg-zinc-950/40' :
    batch.status === 'failed' ? 'text-red-400 border-red-800 bg-red-950/40' :
    batch.status === 'partial_applied' ? 'text-amber-400 border-amber-800 bg-amber-950/40' :
    'text-blue-300 border-blue-800 bg-blue-950/40'

  const statusText =
    batch.status === 'all_applied' ? 'Aplicado' :
    batch.status === 'cancelled' ? 'Cancelado' :
    batch.status === 'failed' ? 'Falhou' :
    batch.status === 'partial_applied' ? 'Aplicado parcial' :
    batch.status === 'applying' ? 'Aplicando…' :
    'Aguardando'

  return (
    <div className={`rounded-xl border p-4 my-3 ${statusColor}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{batch.title}</div>
            <div className="text-xs opacity-70">Batch {batch.batchId.slice(0, 16)} · {batch.pendings.length} ações · {statusText}</div>
          </div>
        </div>
      </div>

      <div className="space-y-2 mb-3">
        {batch.pendings.map((p, idx) => (
          <div key={p.id} className="flex items-start gap-2 text-sm">
            <PendingStatusIcon status={p.status} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-mono opacity-50">{idx + 1}.</span>
                <span className="font-medium">{formatToolName(p.toolName)}</span>
              </div>
              <div className="text-xs opacity-70 truncate">{p.description}</div>
              {p.error && <div className="text-xs text-red-400 mt-0.5">⚠ {p.error}</div>}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="text-xs text-red-400 flex items-center gap-1 mb-2">
          <AlertCircle className="w-3 h-3" /> {error}
        </div>
      )}

      {!isTerminal && batch.status !== 'applying' && (
        <div className="flex items-center gap-2">
          <button
            onClick={applyAll}
            disabled={applying || cancelling}
            className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium flex items-center justify-center gap-2 transition"
          >
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Aplicar tudo
          </button>
          <button
            onClick={cancelAll}
            disabled={applying || cancelling}
            className="px-3 py-2 rounded-lg border border-zinc-700 hover:border-zinc-600 disabled:opacity-40 text-sm flex items-center gap-1 transition"
          >
            {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

function PendingStatusIcon({ status }: { status?: PendingConfirmation['status'] }) {
  if (status === 'applying') return <Loader2 className="w-4 h-4 text-blue-400 animate-spin mt-0.5 flex-shrink-0" />
  if (status === 'applied') return <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
  if (status === 'failed') return <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
  if (status === 'skipped') return <ChevronRight className="w-4 h-4 text-zinc-500 mt-0.5 flex-shrink-0" />
  return <Clock className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
}

// ─────────────────────────────────────────────────────────
// Componente individual para pending sem batch (backward compat Wave 6)
// ─────────────────────────────────────────────────────────

interface AlixConfirmationSingleProps {
  pending: PendingConfirmation
  onApplied?: (id: string) => void
  onRejected?: (id: string) => void
}

export function AlixConfirmationSingleCard({ pending, onApplied, onRejected }: AlixConfirmationSingleProps) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const approve = async () => {
    setBusy('approve')
    setError(null)
    try {
      const r = await apiFetch<{ success: boolean; error?: string }>(
        `/alix/confirmations/${pending.id}/approve`,
        { method: 'POST' },
      )
      if (!r.success) throw new Error(r.error || 'Falha')
      onApplied?.(pending.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const reject = async () => {
    setBusy('reject')
    setError(null)
    try {
      await apiFetch(`/alix/confirmations/${pending.id}/reject`, { method: 'POST' })
      onRejected?.(pending.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl border border-blue-800 bg-blue-950/40 p-4 my-3">
      <div className="flex items-start gap-2 mb-3">
        <Clock className="w-4 h-4 text-blue-300 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-blue-100">{formatToolName(pending.toolName)}</div>
          <div className="text-xs text-blue-200/80">{pending.description}</div>
          <div className="text-xs text-blue-200/50 mt-1 font-mono">{pending.id}</div>
        </div>
      </div>
      {error && (
        <div className="text-xs text-red-400 mb-2 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={approve}
          disabled={busy !== null}
          className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium flex items-center justify-center gap-2 transition"
        >
          {busy === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Aprovar
        </button>
        <button
          onClick={reject}
          disabled={busy !== null}
          className="px-3 py-2 rounded-lg border border-zinc-700 hover:border-zinc-600 disabled:opacity-40 text-sm flex items-center gap-1 transition"
        >
          {busy === 'reject' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
          Rejeitar
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Painel consolidado (pode ser usado no topo da página Alix)
// ─────────────────────────────────────────────────────────

export function AlixConfirmationsPanel() {
  const { batches, singles, refresh } = useConfirmationStream()
  const activeBatches = batches.filter((b) => b.status !== 'cancelled' && b.status !== 'all_applied')
  const recentFinished = batches.filter((b) => b.status === 'all_applied' || b.status === 'partial_applied').slice(0, 2)

  if (activeBatches.length === 0 && singles.length === 0 && recentFinished.length === 0) return null

  return (
    <div className="space-y-2">
      {activeBatches.map((b) => (
        <AlixConfirmationBatchCard
          key={b.batchId}
          batch={b}
          onApplied={() => refresh()}
          onCancelled={() => refresh()}
        />
      ))}
      {singles.map((p) => (
        <AlixConfirmationSingleCard
          key={p.id}
          pending={p}
          onApplied={() => refresh()}
          onRejected={() => refresh()}
        />
      ))}
      {recentFinished.length > 0 && (
        <div className="text-xs text-zinc-500 mt-2">
          {recentFinished.length} batch{recentFinished.length > 1 ? 'es' : ''} concluíd{recentFinished.length > 1 ? 'os' : 'o'} recentemente.
        </div>
      )}
    </div>
  )
}
