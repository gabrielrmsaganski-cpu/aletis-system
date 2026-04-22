/**
 * Sidebar (Barra Lateral) — v2.
 *
 * Lê todos os itens do toolCatalog e os agrupa pelas categorias
 * definidas lá. Cada item tem tooltip flutuante (titulo + descrição
 * curta) no hover, funciona colapsado ou expandido, e mostra um
 * hint "⌘K" abaixo do logo incentivando a descoberta.
 */
import { useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, LogOut, Command } from 'lucide-react'
import Tooltip from '../ui/Tooltip'
import {
  CATEGORIES,
  TOOL_CATALOG,
  type ToolEntry,
} from '../../navigation/toolCatalog'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  mobileOpen?: boolean
  onMobileClose?: () => void
  onOpenPalette?: () => void
}

export default function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
  onOpenPalette,
}: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const grouped = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      category: cat,
      items: TOOL_CATALOG.filter(
        (t) => t.category === cat.id && t.showInSidebar !== false
      ),
    })).filter((g) => g.items.length > 0)
  }, [])

  const isActive = (route: string) => {
    if (route === '/dashboard') return location.pathname === route
    return location.pathname === route || location.pathname.startsWith(route + '/')
  }

  const handleLogout = () => {
    localStorage.clear()
    sessionStorage.clear()
    navigate('/')
  }

  const sidebarContent = (
    <div
      className={`
        flex flex-col h-full
        bg-gradient-to-b from-aletis-verde to-aletis-verde-escuro
        transition-[width] duration-300 ease-out
        ${collapsed ? 'w-16' : 'w-[272px]'}
      `}
    >
      {/* Logo area */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-4 border-b border-white/10">
        <Link to="/dashboard" className="flex-shrink-0 w-8 h-8 rounded-lg bg-aletis-dourado/20 flex items-center justify-center hover:bg-aletis-dourado/30 transition-colors" aria-label="Ir para Dashboard">
          <span className="text-aletis-dourado font-display font-bold text-sm">A</span>
        </Link>
        {!collapsed && (
          <div className="overflow-hidden flex-1">
            <h1 className="font-display text-aletis-dourado text-xl font-bold leading-tight tracking-wide">
              ALETIS
            </h1>
            <p className="text-white/60 text-[10px] tracking-widest uppercase leading-tight">
              Consultoria agro-financeira
            </p>
          </div>
        )}
      </div>

      {/* Command palette trigger */}
      {onOpenPalette && (
        <div className={`px-3 pt-3 pb-1 ${collapsed ? 'flex justify-center' : ''}`}>
          <Tooltip
            label="Busca global"
            description="⌘K ou Ctrl+K para abrir a paleta de comandos"
            placement="right"
            disabled={!collapsed}
          >
            <button
              type="button"
              onClick={onOpenPalette}
              className={`
                group flex items-center gap-2 rounded-xl
                bg-white/5 hover:bg-white/10 border border-white/10 hover:border-aletis-dourado/40
                transition-all duration-200
                ${collapsed ? 'w-9 h-9 justify-center' : 'w-full px-3 py-2'}
              `}
              aria-label="Abrir busca global"
            >
              <Command size={14} className="text-aletis-dourado/80 group-hover:text-aletis-dourado flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="text-[12px] text-white/50 group-hover:text-white/70 flex-1 text-left">
                    Buscar qualquer coisa…
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-white/40 group-hover:text-white/60 px-1.5 py-0.5 rounded border border-white/10">
                    ⌘K
                  </span>
                </>
              )}
            </button>
          </Tooltip>
        </div>
      )}

      {/* Navigation */}
      <nav
        className="flex-1 overflow-y-auto custom-scrollbar py-3 px-2 space-y-5"
        role="navigation"
        aria-label="Menu principal"
      >
        {grouped.map(({ category, items }) => (
          <div key={category.id}>
            {!collapsed && (
              <div className="flex items-center gap-2 px-3 mb-2">
                <p className="text-[10px] font-semibold tracking-[0.2em] text-white/40 uppercase">
                  {category.label}
                </p>
                <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
              </div>
            )}
            {collapsed && <div className="mb-1 mx-auto w-6 border-t border-white/10" aria-hidden="true" />}
            <ul className="space-y-0.5">
              {items.map((item) => (
                <SidebarItem
                  key={item.id}
                  tool={item}
                  collapsed={collapsed}
                  active={isActive(item.route)}
                  onClick={onMobileClose}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* User area */}
      <div className="border-t border-white/10 p-3">
        <div
          className={`
            flex items-center gap-3 rounded-xl p-2
            hover:bg-white/8 transition-colors duration-200
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <div
            className="flex-shrink-0 w-9 h-9 rounded-full bg-aletis-dourado/25 border border-aletis-dourado/40 flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="text-aletis-dourado text-xs font-semibold">CK</span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">Christian Kohler</p>
              <p className="text-white/50 text-[11px] truncate">Consultor sênior</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="text-white/40 hover:text-white/70 transition-colors p-1"
              aria-label="Sair"
              title="Sair"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <div className="border-t border-white/10 p-2">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-all duration-200"
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span className="text-xs">Recolher</span>}
        </button>
      </div>
    </div>
  )

  return (
    <>
      <aside
        className="hidden lg:flex fixed top-0 left-0 h-screen z-40"
        aria-label="Barra lateral"
      >
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-screen z-50 lg:hidden
          transform transition-transform duration-300 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        aria-label="Barra lateral"
      >
        {sidebarContent}
      </aside>
    </>
  )
}

interface SidebarItemProps {
  tool: ToolEntry
  collapsed: boolean
  active: boolean
  onClick?: () => void
}

function SidebarItem({ tool, collapsed, active, onClick }: SidebarItemProps) {
  const Icon = tool.icon
  const badge = tool.badge
  const link = (
    <Link
      to={tool.route}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`
        group relative flex items-center gap-3 rounded-xl
        text-sm font-medium transition-all duration-200
        ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}
        ${
          active
            ? 'bg-white/15 text-white shadow-inner'
            : 'text-white/60 hover:text-white hover:bg-white/8'
        }
      `}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-aletis-dourado"
          aria-hidden="true"
        />
      )}
      <Icon
        size={19}
        className={`flex-shrink-0 transition-colors duration-200 ${
          active ? 'text-aletis-dourado' : 'text-white/55 group-hover:text-white/85'
        }`}
        aria-hidden="true"
      />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{tool.title}</span>
          {badge === 'novo' && (
            <span className="text-[8px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full bg-aletis-dourado text-aletis-verde-escuro">
              novo
            </span>
          )}
          {badge === 'ia' && (
            <span className="text-[8px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full bg-aletis-dourado/80 text-aletis-verde-escuro">
              IA
            </span>
          )}
          {badge === 'beta' && (
            <span className="text-[8px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full bg-white/15 text-white/80">
              beta
            </span>
          )}
        </>
      )}
    </Link>
  )

  return (
    <li>
      <Tooltip label={tool.title} description={tool.tagline} placement="right" disabled={!collapsed}>
        {link}
      </Tooltip>
    </li>
  )
}
