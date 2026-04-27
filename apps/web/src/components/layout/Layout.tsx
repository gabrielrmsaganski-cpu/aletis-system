/**
 * Layout (Estrutura Principal) — v2.
 *
 * Envolve todas as páginas autenticadas com sidebar lateral (colapsável
 * no desktop, drawer no mobile), header superior, e hospeda a paleta
 * de comandos global (⌘K / Ctrl+K).
 *
 * Dispatchers disponíveis para qualquer página abrir a paleta:
 *   - atalho global ⌘K / Ctrl+K
 *   - window.dispatchEvent(new Event('aletis:palette:open'))
 *   - botões/links internos podem chamar a callback via prop drilling futuro
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import CommandPalette from '../ui/CommandPalette'
import BrandFooter from '../ui/BrandFooter'
import { ToastContainer } from '../Toast'
import { useToast } from '../../hooks/useToast'
import { useInsightsStream, type ProactiveInsight } from '../../hooks/useInsightsStream'

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(loadSidebarCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // ── Wave B5: toast em tempo real para novos insights da ALIX ──
  const toastApi = useToast(7000)
  const seenIdsRef = useRef<Set<string>>(new Set())
  useInsightsStream((insight: ProactiveInsight) => {
    // dedupe por id (evita duplicar se SSE reconectar e re-emitir)
    if (seenIdsRef.current.has(insight.id)) return
    seenIdsRef.current.add(insight.id)
    // só mostra urgências altas — info ficaria barulhento
    if (insight.urgencia === 'critico') {
      toastApi.show(`🔴 ${insight.titulo}`, 'error')
    } else if (insight.urgencia === 'importante') {
      toastApi.show(`🟡 ${insight.titulo}`, 'warning')
    }
  })

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
      } catch {
        /* ignore quota/private mode */
      }
      return next
    })
  }, [])

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
    <div className="min-h-screen bg-aletis-cream dark:bg-aletis-verde-escuro">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        mobileOpen={mobileOpen}
        onMobileClose={closeMobileMenu}
        onOpenPalette={openPalette}
      />

      <div
        className={`
          flex flex-col min-h-screen
          transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-[272px]'}
        `}
      >
        <Header
          onMobileMenuToggle={toggleMobileMenu}
          onOpenPalette={openPalette}
        />

        <main
          className="flex-1 p-4 lg:p-6 xl:p-8 overflow-x-hidden"
          role="main"
          id="main-content"
        >
          <div className="max-w-[1600px] mx-auto animate-fade-in">
            {children}
          </div>
        </main>

        {/* Rodapé global de marca — assinatura ALETIS no fim de cada página */}
        <BrandFooter />
      </div>

      <CommandPalette open={paletteOpen} onClose={closePalette} />
      <ToastContainer toasts={toastApi.toasts} onDismiss={toastApi.dismiss} />
    </div>
  )
}
