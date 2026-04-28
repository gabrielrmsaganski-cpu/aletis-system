// ============================================================
// useDSTheme — alternância entre os 2 modos do Design System OS
// ============================================================
//   - "operational": denso, escuro, foco em comando/análise
//   - "documental":  claro, espaçado, foco em leitura/contratos
// Persiste em localStorage. Aplica .dark no <html>.
// ============================================================
import { useEffect, useState, useCallback } from 'react'

export type DSMode = 'operational' | 'documental'

const STORAGE_KEY = 'aletis:ds:mode'
const DEFAULT_MODE: DSMode = 'documental'

function readPersisted(): DSMode {
  if (typeof window === 'undefined') return DEFAULT_MODE
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'operational' || raw === 'documental') return raw
  } catch {/* private mode */}
  return DEFAULT_MODE
}

function applyMode(mode: DSMode) {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  if (mode === 'operational') {
    html.classList.add('dark')
    html.dataset.dsMode = 'operational'
  } else {
    html.classList.remove('dark')
    html.dataset.dsMode = 'documental'
  }
}

export function useDSTheme(): {
  mode: DSMode
  setMode: (m: DSMode) => void
  toggle: () => void
} {
  const [mode, setModeState] = useState<DSMode>(readPersisted)

  useEffect(() => {
    applyMode(mode)
    try { localStorage.setItem(STORAGE_KEY, mode) } catch {/* skip */}
  }, [mode])

  const setMode = useCallback((m: DSMode) => setModeState(m), [])
  const toggle = useCallback(
    () => setModeState((prev) => (prev === 'operational' ? 'documental' : 'operational')),
    [],
  )

  return { mode, setMode, toggle }
}
