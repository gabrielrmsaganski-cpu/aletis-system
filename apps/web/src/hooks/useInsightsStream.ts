// ============================================================
// useInsightsStream — assina SSE de /api/alix/insights/stream
// (Wave B5) e dispara callback para cada novo insight recebido.
// ============================================================
// Uso típico no Layout root:
//   useInsightsStream((insight) => {
//     showToast(`${insight.titulo}`, mapUrgencia(insight.urgencia))
//   })
//
// Reconecta automaticamente em backoff exponencial (1s → 30s).
// Pausa quando aba está em background para economizar conexão.
// ============================================================
import { useEffect, useRef } from 'react'

export interface ProactiveInsight {
  id: string
  ts: string
  tipo: string
  urgencia: 'info' | 'importante' | 'critico'
  titulo: string
  detalhes: string
  payload?: Record<string, unknown>
}

export type InsightHandler = (insight: ProactiveInsight) => void

const SSE_PATH = '/api/alix/insights/stream'

export function useInsightsStream(onInsight: InsightHandler, opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled !== false
  const handlerRef = useRef(onInsight)
  handlerRef.current = onInsight

  useEffect(() => {
    if (!enabled) return
    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let backoff = 1000
    let cancelled = false

    const connect = () => {
      if (cancelled) return
      try {
        es = new EventSource(SSE_PATH)
      } catch (err) {
        console.warn('[useInsightsStream] EventSource construct falhou:', err)
        scheduleReconnect()
        return
      }

      es.addEventListener('connected', () => {
        // reseta backoff ao conectar com sucesso
        backoff = 1000
      })

      es.addEventListener('insight', (ev: MessageEvent) => {
        try {
          const insight = JSON.parse(ev.data) as ProactiveInsight
          handlerRef.current(insight)
        } catch (err) {
          console.warn('[useInsightsStream] parse insight falhou:', err)
        }
      })

      es.onerror = () => {
        // EventSource auto-reconecta por default, mas se readyState=CLOSED
        // (servidor caiu de vez), refazemos manualmente com backoff.
        if (es?.readyState === EventSource.CLOSED) {
          scheduleReconnect()
        }
      }
    }

    const scheduleReconnect = () => {
      if (cancelled) return
      try { es?.close() } catch {/* ignore */}
      es = null
      reconnectTimer = setTimeout(() => {
        connect()
        backoff = Math.min(backoff * 2, 30_000)
      }, backoff)
    }

    connect()

    // pausa SSE quando aba está em background (economiza recursos)
    const onVisibility = () => {
      if (document.hidden) {
        try { es?.close() } catch {/* ignore */}
        es = null
      } else if (!es) {
        backoff = 1000
        connect()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      try { es?.close() } catch {/* ignore */}
    }
  }, [enabled])
}
