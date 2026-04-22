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
import { useState, useCallback, useEffect } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import CommandPalette from '../ui/CommandPalette'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev)
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
    <div className="min-h-screen bg-aletis-bege dark:bg-[#141416]">
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
      </div>

      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </div>
  )
}
