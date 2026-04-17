/**
 * Layout (Estrutura Principal)
 *
 * Envolve todas as paginas autenticadas do sistema ALETIS com
 * sidebar lateral (colapsavel no desktop, drawer no mobile) e
 * header superior. Controla o estado de recolhimento da sidebar
 * e a abertura do menu mobile, ajustando a margem do conteudo
 * principal conforme o estado.
 */
import { useState, useCallback } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev)
  }, [])

  const toggleMobileMenu = useCallback(() => {
    setMobileOpen((prev) => !prev)
  }, [])

  const closeMobileMenu = useCallback(() => {
    setMobileOpen(false)
  }, [])

  return (
    <div className="min-h-screen bg-aletis-bege dark:bg-[#141416]">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        mobileOpen={mobileOpen}
        onMobileClose={closeMobileMenu}
      />

      {/* Main content area */}
      <div
        className={`
          flex flex-col min-h-screen
          transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-[280px]'}
        `}
      >
        {/* Header */}
        <Header onMobileMenuToggle={toggleMobileMenu} />

        {/* Page content */}
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
    </div>
  )
}
