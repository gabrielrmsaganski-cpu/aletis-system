// ============================================================
// AlixAuditPanel — exibe o trail de uma resposta ALIX
// (tools usadas, source, confidence, latência) em um expander
// pequeno abaixo da mensagem.
// ============================================================
import { useState } from 'react'
import { Info, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react'

export interface ToolAuditEntry {
  toolName: string
  params: Record<string, unknown>
  resultSummary: string
  ok: boolean
  source: string
  confidence: number
  latencyMs: number
  ts: string
}

export interface AuditTrail {
  messageId: string
  sessionId: string
  toolCalls: ToolAuditEntry[]
  totalLatencyMs: number
  startedAt: string
  finishedAt: string
}

export default function AlixAuditPanel({ audit }: { audit: AuditTrail | null | undefined }) {
  const [open, setOpen] = useState(false)
  if (!audit || audit.toolCalls.length === 0) return null

  const avgConfidence =
    audit.toolCalls.reduce((sum, t) => sum + t.confidence, 0) / audit.toolCalls.length
  const minConfidence = Math.min(...audit.toolCalls.map((t) => t.confidence))
  const errors = audit.toolCalls.filter((t) => !t.ok).length

  const tone = errors > 0 ? 'red' : minConfidence < 0.8 ? 'amber' : 'green'

  return (
    <div className="mt-2 text-[11px] font-body">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${
          tone === 'red'
            ? 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300'
            : tone === 'amber'
            ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300'
            : 'bg-positivo/10 text-positivo hover:bg-positivo/20'
        }`}
      >
        <ShieldCheck className="w-3 h-3" />
        <span className="font-semibold">
          {audit.toolCalls.length} tool{audit.toolCalls.length !== 1 ? 's' : ''}
        </span>
        <span className="opacity-70">· conf. {(avgConfidence * 100).toFixed(0)}%</span>
        <span className="opacity-70">· {audit.totalLatencyMs}ms</span>
        {errors > 0 && <span className="font-bold">· {errors} erro{errors > 1 ? 's' : ''}</span>}
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-aletis-borda dark:border-white/10 bg-card dark:bg-card p-3 space-y-2">
          {audit.toolCalls.map((t, i) => (
            <div key={i} className="border-l-2 pl-2 py-0.5" style={{ borderColor: t.ok ? '#22c55e' : '#ef4444' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold text-foreground dark:text-white">
                  {t.toolName}
                </span>
                <span className="opacity-70">
                  conf. {(t.confidence * 100).toFixed(0)}% · {t.latencyMs}ms
                </span>
              </div>
              <p className="text-muted-foreground dark:text-white/60 italic mt-0.5">
                <Info className="inline w-2.5 h-2.5 mr-1" />
                {t.source}
              </p>
              {Object.keys(t.params).length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[var(--text-soft)] dark:text-white/50">
                    parâmetros
                  </summary>
                  <pre className="text-[10px] bg-aletis-bege/30 dark:bg-white/5 p-1.5 rounded mt-1 overflow-x-auto">
                    {JSON.stringify(t.params, null, 2)}
                  </pre>
                </details>
              )}
              <details className="mt-1">
                <summary className="cursor-pointer text-[var(--text-soft)] dark:text-white/50">
                  resultado{!t.ok && ' (erro)'}
                </summary>
                <pre className="text-[10px] bg-aletis-bege/30 dark:bg-white/5 p-1.5 rounded mt-1 overflow-x-auto whitespace-pre-wrap break-words">
                  {t.resultSummary}
                </pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
