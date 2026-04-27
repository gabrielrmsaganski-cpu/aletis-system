// ============================================================
// AlixContextHint — banner contextual no topo da página de cliente
// (Wave B4). Pré-computa "o que mudou" desde a última visita.
// ============================================================
import { useEffect, useState } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { Sparkles, AlertTriangle, AlertCircle } from 'lucide-react'

interface ContextHintData {
  clienteId: string
  pendentes: number
  criticos: number
  importantes: number
  insights: Array<{
    id: string
    tipo: string
    urgencia: 'info' | 'importante' | 'critico'
    titulo: string
  }>
  regrasAtivas: Array<{ id: string; tipo: string; simbolo: string; regra: string }>
  sugestao: string | null
}

interface Props {
  clienteId: string
  tela?: string
}

export default function AlixContextHint({ clienteId, tela = 'cliente-detalhes' }: Props) {
  const [data, setData] = useState<ContextHintData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError(null)
    apiFetch<ContextHintData>('/api/alix/context-hint', {
      method: 'POST',
      body: JSON.stringify({ clienteId, tela }),
    })
      .then((d) => { if (!cancelled) setData(d) })
      .catch((err: any) => { if (!cancelled) setError(String(err?.message || err)) })
    return () => { cancelled = true }
  }, [clienteId, tela])

  if (dismissed || error) return null
  if (!data) return null
  if (data.pendentes === 0 && data.regrasAtivas.length === 0) return null

  const isCritico = data.criticos > 0
  const Icon = isCritico ? AlertCircle : data.importantes > 0 ? AlertTriangle : Sparkles
  const bgClass = isCritico
    ? 'bg-gradient-to-r from-red-900/90 to-red-800/80 border-red-500/40'
    : data.importantes > 0
    ? 'bg-gradient-to-r from-amber-900/80 to-aletis-grafite-escuro/80 border-amber-500/40'
    : 'bg-gradient-to-r from-aletis-grafite-escuro/90 to-aletis-verde/60 border-aletis-dourado/30'

  return (
    <div className={`relative mb-4 rounded-xl border p-4 text-white shadow-lg ${bgClass} animate-fade-in`}>
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-3 text-white/60 hover:text-white text-xs"
        aria-label="Dispensar"
      >
        ✕
      </button>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isCritico ? 'text-red-300' : 'text-aletis-dourado'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70 mb-1">
            ALIX · novidades sobre este cliente
          </p>
          {data.pendentes > 0 && (
            <p className="text-sm font-medium">
              {data.criticos > 0 && <span className="text-red-300">{data.criticos} crítico{data.criticos > 1 ? 's' : ''}</span>}
              {data.criticos > 0 && data.importantes > 0 && <span className="text-white/50"> · </span>}
              {data.importantes > 0 && <span className="text-amber-200">{data.importantes} importante{data.importantes > 1 ? 's' : ''}</span>}
              <span className="text-white/70"> aguardando ação</span>
            </p>
          )}
          {data.sugestao && (
            <p className="text-sm mt-1.5 text-white/85 italic">{data.sugestao}</p>
          )}
          {data.insights.length > 0 && (
            <ul className="mt-2 space-y-1">
              {data.insights.slice(0, 3).map((i) => (
                <li key={i.id} className="text-xs text-white/75 flex items-baseline gap-2">
                  <span className={i.urgencia === 'critico' ? 'text-red-300' : 'text-amber-200'}>•</span>
                  <span className="truncate">{i.titulo}</span>
                </li>
              ))}
            </ul>
          )}
          {data.regrasAtivas.length > 0 && (
            <p className="text-xs mt-2 text-white/60">
              {data.regrasAtivas.length} alerta{data.regrasAtivas.length > 1 ? 's' : ''} de mercado ativo{data.regrasAtivas.length > 1 ? 's' : ''}: {data.regrasAtivas.map((r) => r.regra).join(', ')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
