/**
 * AlixConfirmationBatch — Card de batch de pending confirmations HITL
 *
 * Consome SSE /api/alix/confirmations/stream para atualizar em tempo real
 * quando pending é criado, batch é aplicado ou cancelado.
 * Permite aprovar tudo / aprovar itens específicos / cancelar.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { CheckCircle2, XCircle, Clock, Loader2, AlertCircle, ChevronRight } from 'lucide-react'
import { apiFetch } from '../../hooks/useApi'
import { actionMatchesScope, actionReceiptLabel, type AlixActionReceipt, type AlixActionScope } from './alixActionPresentation'

export interface PendingConfirmation {
  id: string
  toolName: string
  description: string
  createdAt: string
  expiresAt: string
  sessionId?: string
  clienteId?: string | null
  contextClienteId?: string | null
  batchId?: string
  dependsOn?: string[]
  status?: 'pending' | 'applying' | 'applied' | 'failed' | 'skipped'
  error?: string
  riskLevel?: 'standard' | 'high' | 'critical'
  approvalsRequired?: 1 | 2
  approvalStep?: 0 | 1
}

export interface ConfirmationBatch {
  batchId: string
  sessionId: string
  title: string
  status: 'pending' | 'applying' | 'partial_applied' | 'all_applied' | 'cancelled' | 'failed'
  pendings: PendingConfirmation[]
  createdAt: string
  updatedAt: string
  approvalStep?: 0 | 1
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
export function useConfirmationStream(scope: AlixActionScope = {}) {
  const [batches, setBatches] = useState<ConfirmationBatch[]>([])
  const [singles, setSingles] = useState<PendingConfirmation[]>([])
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const sessionId = scope.sessionId || null
  const clienteId = scope.clienteId || null
  const accepts = useCallback((action: PendingConfirmation) => actionMatchesScope(action, { sessionId, clienteId }), [sessionId, clienteId])
  const acceptsBatch = useCallback((batch: ConfirmationBatch) => batch.sessionId === sessionId && batch.pendings.every(pending => accepts({ ...pending, sessionId: pending.sessionId || batch.sessionId })), [sessionId, accepts])

  const refreshFromApi = useCallback(async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    if (!sessionId) { setBatches([]); setSingles([]); return }
    setError(null)
    try {
      const [bList, sList] = await Promise.all([
        apiFetch<ConfirmationBatch[]>('/alix/confirmations/batches', { signal: controller.signal }),
        apiFetch<PendingConfirmation[]>('/alix/confirmations', { signal: controller.signal }),
      ])
      if (controller.signal.aborted || requestRef.current !== controller) return
      setBatches((Array.isArray(bList) ? bList : []).filter(acceptsBatch))
      setSingles((Array.isArray(sList) ? sList : []).filter(pending => !pending.batchId && accepts(pending)))
    } catch {
      if (!controller.signal.aborted && requestRef.current === controller) setError('Não foi possível atualizar as ações desta conversa.')
    }
  }, [sessionId, accepts, acceptsBatch])

  useEffect(() => {
    let cancelled = false

    setBatches([])
    setSingles([])
    void refreshFromApi()
    if (!sessionId) return () => { requestRef.current?.abort() }

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
      if (cancelled) return
      if (ev.type === 'batch:created' && ev.batch && acceptsBatch(ev.batch)) {
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
        // Update incremental: se o pending pertence a batch, deixa o
        // batch:created cuidar; se for avulso, adiciona em `singles`
        // sem disparar refresh full (evita loop SSE→refresh→SSE).
        const conf = ev.confirmation
        if (!conf.batchId && accepts(conf)) {
          setSingles((prev) =>
            prev.some((p) => p.id === conf.id) ? prev : [conf, ...prev],
          )
        }
      }
    }

    return () => {
      cancelled = true
      ctrl.abort()
      requestRef.current?.abort()
    }
  }, [refreshFromApi, sessionId, accepts, acceptsBatch])

  return { batches, singles, error, refresh: refreshFromApi }
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
  scope?: AlixActionScope
  onReceipt?: (receipt: AlixActionReceipt) => void
}

export function AlixConfirmationBatchCard({ batch, onApplied, onCancelled, scope, onReceipt }: AlixConfirmationBatchProps) {
  const actionRef = useRef(false)
  const [applying, setApplying] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secondChallenge, setSecondChallenge] = useState<string | null>(null)
  const pendings = Array.isArray(batch.pendings) ? batch.pendings : []
  // Seleção por item para aprovação parcial. Padrão: todos os pendings
  // marcados (preserva semântica "Aplicar tudo" ao primeiro clique).
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(pendings.filter((p) => !p.status || p.status === 'pending').map((p) => p.id)),
  )

  const isTerminal = batch.status === 'all_applied' || batch.status === 'cancelled'
  const pendingItems = pendings.filter((p) => !p.status || p.status === 'pending')
  const allSelected = pendingItems.length > 0 && pendingItems.every((p) => selected.has(p.id))
  const noneSelected = selected.size === 0
  const pendingSelectionKey = pendingItems.map((p) => p.id).join('|')

  useEffect(() => {
    setSelected(new Set(pendingSelectionKey ? pendingSelectionKey.split('|') : []))
  }, [batch.batchId, batch.updatedAt, pendingSelectionKey])

  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(pendingItems.map((p) => p.id)))
  }

  const applySelected = async (only?: string[]) => {
    if (actionRef.current) return
    actionRef.current = true
    setApplying(true)
    setError(null)
    try {
      const body = {
        sessionId: scope?.sessionId,
        clienteId: scope?.clienteId,
        ...(only && only.length ? { only } : {}),
        ...(secondChallenge ? { challenge: secondChallenge } : {}),
      }
      const result = await apiFetch<{
        status?: string
        challenge?: string
        applied?: Array<AlixActionReceipt & { confirmationId?: string }>
        failed?: unknown[]
        skipped?: unknown[]
      }>(
        `/alix/confirmations/batch/${batch.batchId}/apply`,
        { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } },
      )
      if (result.status === 'awaiting_second_approval' && result.challenge) {
        setSecondChallenge(result.challenge)
        return
      }
      setSecondChallenge(null)
      result.applied?.forEach(receipt => {
        const id = receipt.id || receipt.confirmationId
        if (id) onReceipt?.({ ...receipt, id, toolName: receipt.toolName || pendings.find(pending => pending.id === id)?.toolName })
      })
      if (result.failed?.length) setError(`${result.failed.length} ação(ões) não foram concluídas. Consulte o resultado de cada item.`)
      onApplied?.(batch.batchId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      actionRef.current = false
      setApplying(false)
    }
  }
  const applyAll = () => applySelected()
  const applyOnlySelected = () => applySelected(Array.from(selected))

  const cancelAll = async () => {
    if (actionRef.current) return
    actionRef.current = true
    setCancelling(true)
    setError(null)
    try {
      await apiFetch<{ batchId: string; status: ConfirmationBatch['status'] }>(
        `/alix/confirmations/batch/${batch.batchId}/cancel`,
        { method: 'POST' },
      )
      onCancelled?.(batch.batchId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      actionRef.current = false
      setCancelling(false)
    }
  }

  const statusColor =
    batch.status === 'all_applied' ? 'text-emerald-400 border-emerald-800 bg-emerald-950/40' :
    batch.status === 'cancelled' ? 'text-zinc-500 border-zinc-800 bg-zinc-950/40' :
    batch.status === 'failed' ? 'text-red-400 border-red-800 bg-red-950/40' :
    batch.status === 'partial_applied' ? 'text-amber-400 border-amber-800 bg-amber-950/40' :
    'text-foreground border-aletis-verde/20 bg-aletis-bege/40'

  const statusText =
    batch.status === 'all_applied' ? 'Processado' :
    batch.status === 'cancelled' ? 'Cancelado' :
    batch.status === 'failed' ? 'Falhou' :
    batch.status === 'partial_applied' ? 'Processado parcialmente' :
    batch.status === 'applying' ? 'Aplicando…' :
    'Aguardando'

  return (
    <div className={`rounded-xl border p-4 my-3 ${statusColor}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{batch.title}</div>
            <div className="text-xs opacity-70">{pendings.length} ações · {statusText}</div>
          </div>
        </div>
      </div>

      {/* Toolbar de seleção — visível apenas quando há ações pendentes */}
      {!isTerminal && pendingItems.length > 1 && batch.status !== 'applying' && (
        <div className="flex items-center justify-between gap-2 mb-2 pl-6 pr-1">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-soft)]">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="accent-emerald-500"
              aria-label={allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
            />
            <span>{selected.size}/{pendingItems.length} selecionados</span>
          </label>
        </div>
      )}

      <div className="space-y-2 mb-3">
        {pendings.map((p, idx) => {
          const isPending = !p.status || p.status === 'pending'
          const checked = selected.has(p.id)
          return (
            <label
              key={p.id}
              className={`flex items-start gap-2 text-sm rounded-lg p-1.5 -m-1.5 ${
                isTerminal || !isPending ? '' : 'cursor-pointer hover:bg-white/[0.04]'
              }`}
            >
              {/* Checkbox de seleção (só pra itens pendentes em batches não-terminais) */}
              {!isTerminal && isPending ? (
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleItem(p.id)}
                  disabled={applying || cancelling}
                  className="mt-0.5 accent-emerald-500"
                  aria-label={`Selecionar ${formatToolName(p.toolName)}`}
                />
              ) : (
                <span className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
              )}
              <PendingStatusIcon status={p.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-mono opacity-50">{idx + 1}.</span>
                  <span className="font-medium">{formatToolName(p.toolName)}</span>
                </div>
                <div className="text-xs opacity-70 truncate">{p.description}</div>
                {p.error && <div className="text-xs text-red-400 mt-0.5">⚠ {p.error}</div>}
              </div>
            </label>
          )
        })}
      </div>

      {pendings.some((pending) => pending.approvalsRequired === 2) && !isTerminal && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
          {secondChallenge
            ? 'Primeira aprovação registrada. Revise o conjunto e confirme novamente para executar.'
            : 'Este conjunto contém ação de alto impacto e exige duas confirmações explícitas.'}
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 flex items-center gap-1 mb-2">
          <AlertCircle className="w-3 h-3" /> {error}
        </div>
      )}

      {!isTerminal && batch.status !== 'applying' && (
        <div className="flex items-center gap-2 flex-wrap">
          {pendingItems.length > 1 && !allSelected && !noneSelected && (
            <button
              onClick={applyOnlySelected}
              disabled={applying || cancelling}
              className="flex-1 min-w-[140px] px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium flex items-center justify-center gap-2 transition"
            >
              {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {secondChallenge ? 'Confirmar novamente' : `Aplicar selecionados (${selected.size})`}
            </button>
          )}
          <button
            onClick={applyAll}
            disabled={applying || cancelling}
            className="flex-1 min-w-[120px] px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium flex items-center justify-center gap-2 transition"
          >
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {secondChallenge ? 'Confirmar novamente' : 'Aplicar tudo'}
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
  scope?: AlixActionScope
  onReceipt?: (receipt: AlixActionReceipt) => void
}

export function AlixConfirmationSingleCard({ pending, onApplied, onRejected, scope, onReceipt }: AlixConfirmationSingleProps) {
  const actionRef = useRef(false)
  const [receipt, setReceipt] = useState<AlixActionReceipt | null>(null)
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [secondChallenge, setSecondChallenge] = useState<string | null>(null)
  const callbacksRef = useRef({ onApplied, onReceipt })
  callbacksRef.current = { onApplied, onReceipt }

  useEffect(() => {
    if (receipt?.executionStatus !== 'running') return
    const controller = new AbortController()
    const expiresAt = Date.now() + 5 * 60_000
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const result = await apiFetch<AlixActionReceipt & PendingConfirmation>(`/alix/confirmations/${encodeURIComponent(pending.id)}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        if (scope?.sessionId && !actionMatchesScope(result, scope)) throw new Error('O recibo não corresponde ao contexto deste trabalho.')
        if (result.executionStatus && result.executionStatus !== 'running') {
          const completed = { ...result, id: pending.id, toolName: result.toolName || pending.toolName }
          setReceipt(completed)
          setError(null)
          callbacksRef.current.onReceipt?.(completed)
          callbacksRef.current.onApplied?.(pending.id)
          return
        }
      } catch {
        if (controller.signal.aborted) return
        setError('A execução continua sem confirmação final. A consulta do recibo será repetida; a ação não será reenviada.')
      }
      if (Date.now() >= expiresAt) {
        const unknown: AlixActionReceipt = { id: pending.id, toolName: pending.toolName, executionStatus: 'unknown', outcome: 'unknown' }
        setReceipt(unknown)
        callbacksRef.current.onReceipt?.(unknown)
        setError('O resultado ainda não pôde ser confirmado. Consulte a execução antes de solicitar outra ação.')
        return
      }
      timer = setTimeout(() => void poll(), 3000)
    }
    timer = setTimeout(() => void poll(), 1500)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [receipt?.executionStatus, pending.id, pending.toolName, scope?.sessionId, scope?.clienteId])

  const approve = async () => {
    if (actionRef.current || receipt?.executionStatus === 'running') return
    actionRef.current = true
    setBusy('approve')
    setError(null)
    try {
      const result = await apiFetch<AlixActionReceipt & { status: string; challenge?: string }>(
        `/alix/confirmations/${pending.id}/approve`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: scope?.sessionId, clienteId: scope?.clienteId, ...(secondChallenge ? { challenge: secondChallenge } : {}) }),
        },
      )
      if (result.status === 'awaiting_second_approval' && result.challenge) {
        setSecondChallenge(result.challenge)
        return
      }
      setSecondChallenge(null)
      const receipt = { ...result, id: result.id || pending.id, toolName: result.toolName || pending.toolName }
      setReceipt(receipt)
      onReceipt?.(receipt)
      if (result.executionStatus !== 'running') onApplied?.(pending.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      actionRef.current = false
      setBusy(null)
    }
  }

  const reject = async () => {
    if (actionRef.current || receipt?.executionStatus === 'running') return
    actionRef.current = true
    setBusy('reject')
    setError(null)
    try {
      await apiFetch(`/alix/confirmations/${pending.id}/reject`, { method: 'POST' })
      onRejected?.(pending.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      actionRef.current = false
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl border border-aletis-verde/20 bg-aletis-bege/40 p-4 my-3">
      <div className="flex items-start gap-2 mb-3">
        <Clock className="w-4 h-4 text-foreground mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">{formatToolName(pending.toolName)}</div>
          <div className="text-xs text-[var(--text-soft)]">{pending.description}</div>
          <div className="text-xs text-muted-foreground mt-1 font-mono">{pending.id}</div>
        </div>
      </div>
      {error && (
        <div className="text-xs text-red-400 mb-2 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {error}
        </div>
      )}
      {receipt && <p role="status" className="mb-3 rounded-lg border border-aletis-borda bg-aletis-bege/40 px-3 py-2 text-xs font-semibold text-foreground">{actionReceiptLabel(receipt)}</p>}
      {pending.approvalsRequired === 2 && (
        <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
          {secondChallenge
            ? 'Primeira aprovação registrada. Revise o impacto e confirme novamente.'
            : 'Ação de alto impacto: serão necessárias duas confirmações.'}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={approve}
          disabled={busy !== null || receipt?.executionStatus === 'running'}
          className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium flex items-center justify-center gap-2 transition"
        >
          {busy === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {secondChallenge ? 'Confirmar novamente' : 'Aprovar'}
        </button>
        <button
          onClick={reject}
          disabled={busy !== null || receipt?.executionStatus === 'running'}
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

export function AlixConfirmationsPanel(scope: AlixActionScope = {}) {
  const { batches, singles, error, refresh } = useConfirmationStream(scope)
  const [receipts, setReceipts] = useState<AlixActionReceipt[]>([])
  const onReceipt = (receipt: AlixActionReceipt) => setReceipts(previous => [receipt, ...previous.filter(item => item.id !== receipt.id)])
  const activeBatches = batches.filter(batch => batch.status !== 'cancelled' && batch.status !== 'all_applied')
  const recentFinished = batches.filter(batch => batch.status === 'all_applied').slice(0, 2)
  useEffect(() => setReceipts([]), [scope.sessionId, scope.clienteId])

  if (!scope.sessionId) return null
  if (!error && activeBatches.length === 0 && singles.length === 0 && receipts.length === 0 && recentFinished.length === 0) return null
  return <section className="space-y-2" aria-label="Ações desta conversa">
    {error && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}<button type="button" onClick={() => void refresh()} className="ml-2 font-semibold underline">Atualizar</button></p>}
    {activeBatches.map(batch => <AlixConfirmationBatchCard key={batch.batchId} batch={batch} scope={scope} onReceipt={onReceipt} onApplied={() => void refresh()} onCancelled={() => void refresh()} />)}
    {singles.map(pending => <AlixConfirmationSingleCard key={pending.id} pending={pending} scope={scope} onReceipt={onReceipt} onApplied={() => void refresh()} onRejected={() => void refresh()} />)}
    {receipts.filter(receipt => !singles.some(pending => pending.id === receipt.id)).map(receipt => <div key={receipt.id} role="status" className="rounded-xl border border-aletis-borda bg-card p-3 text-xs"><p className="font-semibold text-foreground">{actionReceiptLabel(receipt)}</p><p className="mt-1 text-[var(--text-soft)]">{formatToolName(receipt.toolName || 'Ação solicitada')}</p></div>)}
    {recentFinished.length > 0 && <p className="text-xs text-[var(--text-soft)]">{recentFinished.length} conjunto(s) processado(s) nesta conversa.</p>}
  </section>
}
