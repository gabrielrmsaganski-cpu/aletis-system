/**
 * PwaUpdater — escuta o service worker registrado pelo vite-plugin-pwa,
 * detecta atualização disponível e oferece "Atualizar agora" para o
 * consultor (sem reload forçado em meio à edição).
 *
 * Também mostra um indicador discreto quando o navegador entra em
 * offline — útil para consultor em campo agro.
 */
import { useEffect, useState } from 'react'

interface PwaState {
  needRefresh: boolean
  offlineReady: boolean
  isOffline: boolean
}

export default function PwaUpdater() {
  const [state, setState] = useState<PwaState>({
    needRefresh: false,
    offlineReady: false,
    isOffline: typeof navigator !== 'undefined' && !navigator.onLine,
  })
  const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    // SW só é gerado em build de prod; em dev (`pnpm dev`), o módulo
    // `virtual:pwa-register` retorna no-ops, então não há nada a fazer.
    if (typeof window === 'undefined') return
    let cancelled = false
    void (async () => {
      try {
        // @ts-expect-error virtual module fornecido pelo vite-plugin-pwa
        const { registerSW } = await import('virtual:pwa-register')
        const update = registerSW({
          onNeedRefresh() {
            if (!cancelled) setState((s) => ({ ...s, needRefresh: true }))
          },
          onOfflineReady() {
            if (!cancelled) setState((s) => ({ ...s, offlineReady: true }))
          },
        })
        setUpdateSW(() => update)
      } catch {
        // virtual:pwa-register não disponível em dev — silencia
      }
    })()

    const onOnline = () => setState((s) => ({ ...s, isOffline: false }))
    const onOffline = () => setState((s) => ({ ...s, isOffline: true }))
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Indicador offline: badge fixo bottom-right, discreto.
  // Atualização: toast no canto superior direito com botão "Atualizar".
  return (
    <>
      {state.isOffline && (
        <div
          className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-1.5 text-xs font-medium text-amber-800 shadow-md backdrop-blur"
          role="status"
          aria-live="polite"
        >
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          Modo offline — usando cache
        </div>
      )}
      {state.needRefresh && updateSW && (
        <div
          className="fixed top-4 right-4 z-50 max-w-sm rounded-xl border border-aletis-borda bg-white p-4 shadow-xl"
          role="alertdialog"
          aria-labelledby="pwa-update-title"
        >
          <p id="pwa-update-title" className="text-sm font-semibold text-aletis-grafite-escuro">
            Nova versão disponível
          </p>
          <p className="mt-1 text-xs text-aletis-grafite-medio">
            Recarregar para ativar as últimas atualizações?
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void updateSW(true)}
              className="px-3 py-1.5 rounded-lg bg-aletis-verde text-white text-xs font-semibold hover:bg-aletis-verde-claro transition"
            >
              Atualizar agora
            </button>
            <button
              onClick={() => setState((s) => ({ ...s, needRefresh: false }))}
              className="px-3 py-1.5 rounded-lg border border-aletis-borda text-xs text-aletis-grafite-medio hover:bg-aletis-bege transition"
            >
              Mais tarde
            </button>
          </div>
        </div>
      )}
    </>
  )
}
