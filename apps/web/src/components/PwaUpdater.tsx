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
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState('')

  async function activateUpdate() {
    if (updating) return
    setUpdating(true)
    setUpdateError('')
    try {
      const registration = await navigator.serviceWorker.getRegistration('/')
      const waiting = registration?.waiting
      if (waiting) {
        await new Promise<void>((resolve, reject) => {
          const finish = (error?: Error) => {
            window.clearTimeout(timeout)
            waiting.removeEventListener('statechange', changed)
            if (error) reject(error)
            else resolve()
          }
          const changed = () => {
            if (waiting.state === 'activated') finish()
            else if (waiting.state === 'redundant') finish(new Error('A atualização foi substituída. Tente novamente.'))
          }
          const timeout = window.setTimeout(() => finish(new Error('Não foi possível concluir a atualização. Confira a conexão e tente novamente.')), 20000)
          waiting.addEventListener('statechange', changed)
          waiting.postMessage({ type: 'SKIP_WAITING' })
          changed()
        })
      }
      // Uma página aberta antes do primeiro SW não recebe "controlling".
      // Recarregamos após a ativação também nesse caso, somente após o clique.
      window.location.reload()
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : 'Não foi possível atualizar. Tente novamente.')
      setUpdating(false)
    }
  }

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
        if (!cancelled) setUpdateSW(() => update)
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
          Sem conexão. Reconecte para consultar ou salvar dados.
        </div>
      )}
      {state.needRefresh && updateSW && (
        <div
          className="fixed top-4 right-4 z-50 max-w-sm rounded-xl border border-aletis-borda bg-card p-4 shadow-xl"
          role="alertdialog"
          aria-labelledby="pwa-update-title"
        >
          <p id="pwa-update-title" className="text-sm font-semibold text-foreground">
            Nova versão disponível
          </p>
          <p className="mt-1 text-xs text-[var(--text-soft)]">
            Recarregar para ativar as últimas atualizações?
          </p>
          {updateError && <p role="alert" className="mt-2 text-xs text-red-700">{updateError}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void activateUpdate()}
              disabled={updating}
              className="px-3 py-1.5 rounded-lg bg-aletis-verde text-white text-xs font-semibold hover:bg-aletis-verde-claro transition disabled:opacity-50"
            >
              {updating ? 'Atualizando…' : 'Atualizar agora'}
            </button>
            <button
              onClick={() => setState((s) => ({ ...s, needRefresh: false }))}
              disabled={updating}
              className="px-3 py-1.5 rounded-lg border border-aletis-borda text-xs text-[var(--text-soft)] hover:bg-aletis-bege transition"
            >
              Mais tarde
            </button>
          </div>
        </div>
      )}
    </>
  )
}
