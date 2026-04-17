import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  FileText,
  TrendingUp,
  Cloud,
  CreditCard,
  MessageCircle,
  Bot,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Target,
} from 'lucide-react'

interface NavItem {
  label: string
  path: string
  icon: React.ElementType
}

interface NavSection {
  header: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    header: 'PRINCIPAL',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
      { label: 'Prospeccao', path: '/prospeccao', icon: Target },
      { label: 'CRM', path: '/crm', icon: Users },
      { label: 'Propostas', path: '/propostas', icon: FileText },
    ],
  },
  {
    header: 'INTELIGENCIA',
    items: [
      { label: 'Mercado', path: '/mercado', icon: TrendingUp },
      { label: 'Clima', path: '/clima', icon: Cloud },
      { label: 'Credito', path: '/credito', icon: CreditCard },
    ],
  },
  {
    header: 'COMUNICACAO',
    items: [
      { label: 'WhatsApp', path: '/whatsapp', icon: MessageCircle },
      { label: 'ALIX IA', path: '/ia', icon: Bot },
    ],
  },
  {
    header: 'GESTAO',
    items: [
      { label: 'Relatorios', path: '/relatorios', icon: BarChart3 },
      { label: 'Configuracoes', path: '/configuracoes', icon: Settings },
    ],
  },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export default function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const isActive = (path: string) => location.pathname === path

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
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-16' : 'w-[280px]'}
      `}
    >
      {/* Logo area */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-4 border-b border-white/10">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-aletis-dourado/20 flex items-center justify-center">
          <span className="text-aletis-dourado font-display font-bold text-sm">A</span>
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="font-display text-aletis-dourado text-xl font-bold leading-tight tracking-wide">
              ALETIS
            </h1>
            <p className="text-white/60 text-[10px] tracking-widest uppercase leading-tight">
              Financas Estrategicas
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav
        className="flex-1 overflow-y-auto custom-scrollbar py-4 px-2 space-y-6"
        role="navigation"
        aria-label="Menu principal"
      >
        {navSections.map((section) => (
          <div key={section.header}>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-semibold tracking-[0.2em] text-white/40 uppercase">
                {section.header}
              </p>
            )}
            {collapsed && <div className="mb-1 mx-auto w-6 border-t border-white/10" />}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.path)
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      onClick={onMobileClose}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                      className={`
                        group relative flex items-center gap-3 rounded-xl
                        text-sm font-medium transition-all duration-200
                        ${collapsed ? 'justify-center px-2 py-3' : 'px-3 py-2.5'}
                        ${
                          active
                            ? 'bg-white/15 text-white shadow-inner'
                            : 'text-white/60 hover:text-white hover:bg-white/8'
                        }
                      `}
                    >
                      {/* Gold accent bar on active item */}
                      {active && (
                        <span
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-aletis-dourado"
                          aria-hidden="true"
                        />
                      )}
                      <Icon
                        size={20}
                        className={`flex-shrink-0 transition-colors duration-200 ${
                          active ? 'text-aletis-dourado' : 'text-white/50 group-hover:text-white/80'
                        }`}
                        aria-hidden="true"
                      />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User area */}
      <div className="border-t border-white/10 p-3">
        <div
          className={`
            flex items-center gap-3 rounded-xl p-2
            hover:bg-white/8 transition-colors duration-200 cursor-pointer
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
              <p className="text-white/50 text-[11px] truncate">Consultor Senior</p>
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
      {/* Desktop sidebar (fixed) */}
      <aside
        className="hidden lg:flex fixed top-0 left-0 h-screen z-40"
        aria-label="Barra lateral"
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
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
