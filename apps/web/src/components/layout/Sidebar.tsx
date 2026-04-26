/**
 * Sidebar (Barra Lateral) — v3 — Identidade Visual oficial ALETIS.
 *
 * Fundo verde-dark (#17251b) com padrão repetidor sutil em soft-light.
 * Tipografia Chakra Petch para rótulos e seções, Verdana para itens.
 * Logo oficial via <BrandMark/>.
 */
import { useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, LogOut, Command } from 'lucide-react'
import Tooltip from '../ui/Tooltip'
import BrandMark from '../ui/BrandMark'
import BrandWatermark from '../ui/BrandWatermark'
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
        relative flex flex-col h-full
        bg-aletis-verde
        transition-[width] duration-300 ease-out
        ${collapsed ? 'w-16' : 'w-[272px]'}
      `}
      style={{
        backgroundImage:
          'linear-gradient(180deg, rgba(13,22,17,0.92) 0%, rgba(23,37,27,0.96) 50%, rgba(13,22,17,0.98) 100%), url(/brand/pattern/repetidor.png)',
        backgroundSize: 'auto, 320px',
        backgroundBlendMode: 'normal, soft-light',
        backgroundRepeat: 'no-repeat, repeat',
      }}
    >
      {/* Faixa dourada vertical à direita — assinatura sutil da marca */}
      <span
        aria-hidden="true"
        className="absolute top-0 right-0 h-full w-px bg-gradient-to-b from-transparent via-aletis-gold/30 to-transparent"
      />

      {/* Watermark do símbolo bracket-A no rodapé — selo de marca */}
      {!collapsed && (
        <BrandWatermark
          size={340}
          tone="cream"
          opacity={0.05}
          className="absolute -right-16 -bottom-10 z-0"
        />
      )}
      {collapsed && (
        <BrandWatermark
          size={120}
          tone="cream"
          opacity={0.07}
          className="absolute -right-3 bottom-24 z-0"
        />
      )}

      {/* Logo area */}
      <div className="flex items-center px-4 pt-5 pb-5 border-b border-aletis-sage/15">
        <Link
          to="/dashboard"
          className="flex items-center gap-3 group"
          aria-label="Ir para Dashboard"
        >
          {collapsed ? (
            <BrandMark variant="symbol" tone="cream" size={32} />
          ) : (
            <BrandMark variant="full" tone="cream" size={34} />
          )}
        </Link>
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
                bg-aletis-cream/[0.04] hover:bg-aletis-cream/[0.10]
                border border-aletis-sage/15 hover:border-aletis-gold/45
                transition-all duration-200
                ${collapsed ? 'w-9 h-9 justify-center' : 'w-full px-3 py-2'}
              `}
              aria-label="Abrir busca global"
            >
              <Command
                size={14}
                className="text-aletis-gold/80 group-hover:text-aletis-gold flex-shrink-0"
              />
              {!collapsed && (
                <>
                  <span className="text-[12px] font-body text-aletis-cream/55 group-hover:text-aletis-cream/85 flex-1 text-left">
                    Buscar qualquer coisa…
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-aletis-cream/45 group-hover:text-aletis-cream/70 px-1.5 py-0.5 rounded border border-aletis-sage/20">
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
                <p className="text-[10px] font-display font-semibold tracking-[0.22em] text-aletis-sage/75 uppercase">
                  {category.label}
                </p>
                <span className="h-px flex-1 bg-aletis-sage/15" aria-hidden="true" />
              </div>
            )}
            {collapsed && (
              <div
                className="mb-1 mx-auto w-6 border-t border-aletis-sage/15"
                aria-hidden="true"
              />
            )}
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
      <div className="border-t border-aletis-sage/15 p-3">
        <div
          className={`
            flex items-center gap-3 rounded-xl p-2
            hover:bg-aletis-cream/5 transition-colors duration-200
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <div
            className="flex-shrink-0 w-9 h-9 rounded-full bg-aletis-gold/20 border border-aletis-gold/45 flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="text-aletis-gold font-display text-xs font-semibold tracking-wide">
              CK
            </span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="font-body text-aletis-cream text-sm font-bold truncate">
                Christian Kohler
              </p>
              <p className="font-body text-aletis-sage/80 text-[11px] truncate">
                Consultor sênior
              </p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="text-aletis-cream/45 hover:text-aletis-cream transition-colors p-1"
              aria-label="Sair"
              title="Sair"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <div className="border-t border-aletis-sage/15 p-2">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-aletis-cream/50 hover:text-aletis-cream hover:bg-aletis-cream/5 transition-all duration-200"
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && (
            <span className="font-display text-[11px] uppercase tracking-[0.18em]">
              Recolher
            </span>
          )}
        </button>
      </div>
    </div>
  )

  return (
    <>
      <aside
        className="hidden lg:flex fixed top-0 left-0 h-screen z-40 shadow-brand-lg"
        aria-label="Barra lateral"
      >
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-aletis-verde-escuro/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-screen z-50 lg:hidden
          shadow-brand-lg
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
        text-[13px] font-body transition-all duration-200
        ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}
        ${
          active
            ? 'bg-aletis-sage/15 text-aletis-cream'
            : 'text-aletis-cream/65 hover:text-aletis-cream hover:bg-aletis-cream/[0.06]'
        }
      `}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-aletis-gold"
          aria-hidden="true"
        />
      )}
      <Icon
        size={18}
        className={`flex-shrink-0 transition-colors duration-200 ${
          active
            ? 'text-aletis-gold'
            : 'text-aletis-sage group-hover:text-aletis-cream'
        }`}
        aria-hidden="true"
      />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{tool.title}</span>
          {badge === 'novo' && (
            <span className="text-[8.5px] font-display font-bold tracking-[0.14em] uppercase px-1.5 py-0.5 rounded-full bg-aletis-gold text-aletis-verde">
              novo
            </span>
          )}
          {badge === 'ia' && (
            <span className="text-[8.5px] font-display font-bold tracking-[0.14em] uppercase px-1.5 py-0.5 rounded-full bg-aletis-gold/80 text-aletis-verde">
              IA
            </span>
          )}
          {badge === 'beta' && (
            <span className="text-[8.5px] font-display font-bold tracking-[0.14em] uppercase px-1.5 py-0.5 rounded-full bg-aletis-sage/30 text-aletis-cream">
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
