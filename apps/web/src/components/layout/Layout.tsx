/**
 * Layout (Estrutura Principal) — v3.
 *
 * Envolve todas as páginas autenticadas com sidebar lateral (colapsável
 * no desktop, drawer animado no mobile), header superior com auto-hide,
 * e hospeda a paleta de comandos global (⌘K / Ctrl+K).
 *
 * Integra AnimatedRoutes para transições suaves entre páginas.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import CommandPalette from '../ui/CommandPalette'
import BrandFooter from '../ui/BrandFooter'
import { ToastContainer } from '../Toast'
import { useToast } from '../../hooks/useToast'
import { useInsightsStream, type ProactiveInsight } from '../../hooks/useInsightsStream'
import AnimatedRoutes from '../../motion/AnimatedRoutes'
import { WorkspaceFocusContext } from '../../contexts/WorkspaceFocusContext'
import { rememberToolVisit } from '../../hooks/useNavigationPreferences'

interface LayoutProps {
  children: React.ReactNode
}

const SIDEBAR_KEY = 'aletis:sidebar:collapsed'

function loadSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const [focused, setFocused] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(loadSidebarCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const alixPage = location.pathname === '/ia'
  const alixFocus = focused && alixPage
  const effectiveSidebarCollapsed = focused || sidebarCollapsed

  useEffect(() => { setFocused(false) }, [location.pathname])
  useEffect(() => { rememberToolVisit(location.pathname, location.search) }, [location.pathname, location.search])

  // ── Wave B5: toast em tempo real para novos insights da ALIX ──
  const toastApi = useToast(7000)
  const seenIdsRef = useRef<Set<string>>(new Set())
  useInsightsStream((insight: ProactiveInsight) => {
    if (seenIdsRef.current.has(insight.id)) return
    seenIdsRef.current.add(insight.id)
    if (insight.urgencia === 'critico') {
      toastApi.show(`Crítico: ${insight.titulo}`, 'error')
    } else if (insight.urgencia === 'importante') {
      toastApi.show(`Importante: ${insight.titulo}`, 'warning')
    }
  })

  const toggleSidebar = useCallback(() => {
    if (focused) { setFocused(false); return }
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
      } catch {
        /* ignore quota/private mode */
      }
      return next
    })
  }, [focused])

  const toggleMobileMenu = useCallback(() => {
    setMobileOpen((prev) => !prev)
  }, [])

  const closeMobileMenu = useCallback(() => {
    setMobileOpen(false)
  }, [])

  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const closePalette = useCallback(() => setPaletteOpen(false), [])

  // Global ⌘K / Ctrl+K listener + custom event
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isTrigger =
        (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey
      if (isTrigger) {
        e.preventDefault()
        setPaletteOpen((prev) => !prev)
      }
    }
    const onCustom = () => setPaletteOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('aletis:palette:open', onCustom as EventListener)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('aletis:palette:open', onCustom as EventListener)
    }
  }, [])

  return (
    <WorkspaceFocusContext.Provider value={{ focused, setFocused }}>
    <div className="app-shell" data-collapsed={effectiveSidebarCollapsed} data-focus={alixFocus}>
      <a href="#main-content" className="sr-only z-[120] rounded-lg bg-aletis-verde px-4 py-3 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Ir para o conteúdo</a>
      {!alixFocus && <Sidebar
        collapsed={effectiveSidebarCollapsed}
        onToggle={toggleSidebar}
        mobileOpen={mobileOpen}
        onMobileClose={closeMobileMenu}
        onOpenPalette={openPalette}
      />}

      <div className="app-frame">
        {!alixFocus && <Header
          onMobileMenuToggle={toggleMobileMenu}
          onOpenPalette={openPalette}
        />}

        <main
          className={`app-main ${alixPage ? 'app-main--alix' : ''}`}
          role="main"
          id="main-content"
        >
          <div className={alixPage ? 'w-full min-w-0' : 'app-content'}>
            <AnimatedRoutes>
              {children}
            </AnimatedRoutes>
          </div>
        </main>

        {/* Rodapé global de marca */}
        {!focused && !alixPage && <BrandFooter />}
      </div>

      <CommandPalette open={paletteOpen} onClose={closePalette} />
      <ToastContainer toasts={toastApi.toasts} onDismiss={toastApi.dismiss} />
    </div>
    </WorkspaceFocusContext.Provider>
  )
}
