/** Navegação principal: ferramentas fixadas, grupos e menu móvel independente. */
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronDown, ChevronLeft, ChevronRight, Search, Star, X } from 'lucide-react'
import Tooltip from '../ui/Tooltip'
import BrandMark from '../ui/BrandMark'
import { CATEGORIES, TOOL_CATALOG, getToolByRoute, searchTools, type ToolEntry } from '../../navigation/toolCatalog'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigationPreferences } from '../../hooks/useNavigationPreferences'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  mobileOpen?: boolean
  onMobileClose?: () => void
  onOpenPalette?: () => void
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose, onOpenPalette }: SidebarProps) {
  const location = useLocation()
  const { user } = useAuth()
  const { favorites, routeForTool } = useNavigationPreferences()
  const activeTool = getToolByRoute(location.pathname)
  const [query, setQuery] = useState('')
  const [openSection, setOpenSection] = useState(activeTool?.category ?? 'funil')
  const groups = useMemo(() => CATEGORIES.map((category) => ({
    category, items: TOOL_CATALOG.filter((tool) => tool.category === category.id && tool.showInSidebar !== false),
  })).filter((group) => group.items.length), [])
  const pinned = favorites.map((id) => TOOL_CATALOG.find((tool) => tool.id === id)).filter((tool): tool is ToolEntry => Boolean(tool))

  useEffect(() => {
    if (activeTool && activeTool.category !== 'principal') setOpenSection(activeTool.category)
    setQuery('')
  }, [activeTool?.category, location.pathname])
  useEffect(() => { onMobileClose?.() }, [location.pathname, location.search, onMobileClose])
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const close = () => { if (media.matches) onMobileClose?.() }
    media.addEventListener('change', close)
    return () => media.removeEventListener('change', close)
  }, [onMobileClose])

  function content(compact: boolean, mobile = false) {
    const link = (tool: ToolEntry, prefix: string) => <SidebarItem key={`${prefix}-${tool.id}`} tool={tool} to={routeForTool(tool.id, tool.route)} compact={compact} active={tool.id === activeTool?.id} onClick={onMobileClose} />
    return (
      <div className="sidebar-content" data-compact={compact}>
        <div className="sidebar-brand">
          <Link to="/dashboard" aria-label="Abrir visão geral" className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-aletis-gold">
            <span className="dark:hidden"><BrandMark variant={compact ? 'symbol' : 'full'} tone="verde" size={compact ? 30 : 30} /></span><span className="hidden dark:inline"><BrandMark variant={compact ? 'symbol' : 'full'} tone="cream" size={30} /></span>
          </Link>
          {mobile && <Dialog.Close className="ui-icon-button ml-auto" aria-label="Fechar menu"><X size={20} /></Dialog.Close>}
        </div>
        {compact ? <div className="px-3 py-3"><button type="button" onClick={onOpenPalette} aria-label="Buscar clientes, propostas e ferramentas" className="ui-icon-button"><Search size={18} /></button></div> : <div className="sidebar-filter"><Search size={14} /><input type="search" aria-label="Buscar no menu" placeholder="Buscar no menu…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="Limpar busca do menu" onClick={() => setQuery('')}><X size={13} /></button>}</div>}
        <nav aria-label={mobile ? 'Menu principal móvel' : 'Menu principal'} className="sidebar-nav custom-scrollbar">
          {!compact && query ? <section aria-label="Resultados do menu"><p className="sidebar-group-label">Resultados</p>{searchTools(query).map(tool => link(tool, 'search'))}{!searchTools(query).length && <p className="px-3 py-4 text-xs text-muted-foreground">Nenhum item encontrado.</p>}</section> : <>
          {pinned.length > 0 && <section className="sidebar-group" aria-label="Ferramentas favoritas">{!compact && <p className="sidebar-group-label"><Star size={11} /> Favoritos</p>}<div className="space-y-0.5">{pinned.map((tool) => link(tool, 'pinned'))}</div></section>}
          {groups.map(({ category, items }) => {
            const visible = items.filter((tool) => !favorites.includes(tool.id))
            if (!visible.length) return null
            const open = compact || category.id === 'principal' || openSection === category.id
            return <section key={category.id} className="sidebar-group">
              {category.id !== 'principal' && (compact ? <div className="mx-auto mb-2 h-px w-6 bg-[var(--border-default)]" /> : <button type="button" aria-expanded={open} data-active={category.id === activeTool?.category} aria-controls={`${mobile ? 'mobile' : 'desktop'}-nav-${category.id}`} onClick={() => setOpenSection(open ? 'principal' : category.id)} className="sidebar-group-trigger"><span className="flex-1">{category.label}</span><ChevronDown size={13} className={`transition-transform ${open ? '' : '-rotate-90'}`} /></button>)}
              {open && <div id={`${mobile ? 'mobile' : 'desktop'}-nav-${category.id}`} className="sidebar-section-items">{visible.map((tool) => link(tool, category.id))}</div>}
            </section>
          })}</>}
        </nav>
        <div className="sidebar-footer">
          <div className={`flex items-center ${compact ? 'justify-center' : 'gap-2.5 px-1 py-1'}`}>
            <Link to="/configuracoes?tab=perfil" aria-label="Abrir meu perfil" className="app-avatar">{user.iniciais}</Link>
            {!compact && <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[var(--text-strong)]">{user.nome}</p><p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{user.cargo}</p></div>}
          </div>
          {!mobile && <button type="button" onClick={onToggle} aria-label={compact ? 'Expandir menu' : 'Recolher menu'} className="ui-button ui-button--ghost mt-2 w-full">{compact ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span className="text-[11px]">Recolher menu</span></>}</button>}
        </div>
      </div>
    )
  }

  return <>
    <aside aria-label="Barra lateral" className="app-sidebar" data-collapsed={collapsed}>{content(collapsed)}</aside>
    <Dialog.Root open={Boolean(mobileOpen)} onOpenChange={(open) => { if (!open) onMobileClose?.() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden" />
        <Dialog.Content aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); document.getElementById('mobile-nav-trigger')?.focus() }} className="fixed inset-y-0 left-0 z-50 h-dvh w-[min(88vw,310px)] outline-none lg:hidden">
          <Dialog.Title className="sr-only">Navegação ALETIS</Dialog.Title>
          {content(false, true)}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>
}

function SidebarItem({ tool, to, compact, active, onClick }: { tool: ToolEntry; to: string; compact: boolean; active: boolean; onClick?: () => void }) {
  const Icon = tool.icon
  return <div className="[&>span]:flex"><Tooltip label={tool.title} description={tool.tagline} placement="right" disabled={!compact}>
    <Link to={to} onClick={onClick} aria-current={active ? 'page' : undefined} aria-label={compact ? tool.title : undefined} className="sidebar-link-v2">
      <Icon size={17} aria-hidden="true" className="shrink-0" />
      {!compact && <span className="min-w-0 flex-1 truncate">{tool.title}</span>}
    </Link>
  </Tooltip></div>
}
