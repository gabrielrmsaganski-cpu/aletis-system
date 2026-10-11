/** Barra de contexto compacta; cotações reais disponíveis sob demanda. */
import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import * as Popover from '@radix-ui/react-popover'
import { Search, ListTodo, Moon, Sun, Menu, ChevronDown, ChevronRight, User, LogOut, Settings, Star, TrendingUp, MoreHorizontal } from 'lucide-react'
import { useDSTheme } from '../../hooks/useDSTheme'
import { apiFetch } from '../../hooks/useApi'
import { useAuth } from '../../contexts/AuthContext'
import { commodityTickerChange } from './tickerData'
import { CATEGORIES, getToolByRoute } from '../../navigation/toolCatalog'
import { useNavigationPreferences } from '../../hooks/useNavigationPreferences'

interface TickerItem {
  label: string
  value: string
  change: string
  positive: boolean
  changeUnavailable?: boolean
}

function formatTickerValue(val: number): string {
  if (val >= 1000)
    return `R$${val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  return `R$${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function useTickerData(): { items: TickerItem[]; loading: boolean } {
  const [items, setItems] = useState<TickerItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      apiFetch<any[]>('/mercado/precos', { signal: controller.signal }).catch(() => null),
      apiFetch<any[]>('/mercado/indicadores', { signal: controller.signal }).catch(() => null),
    ]).then(([precos, indicadores]) => {
      if (controller.signal.aborted) return
      const result: TickerItem[] = []
      if (Array.isArray(precos)) {
        for (const c of precos.filter((item) => Number.isFinite(item.precoAtual)).slice(0, 4)) {
          result.push({
            label: c.cultura,
            value: formatTickerValue(c.precoAtual),
            ...commodityTickerChange(c),
          })
        }
      }
      if (Array.isArray(indicadores)) {
        const dolar = indicadores.find(
          (i: any) =>
            i.sigla === 'PTAX' ||
            i.sigla === 'USD/BRL' ||
            i.nome?.includes('Dolar'),
        )
        const selic = indicadores.find(
          (i: any) => i.sigla === 'SELIC' || i.nome?.includes('Selic'),
        )
        if (dolar && Number.isFinite(dolar.valor)) {
          const ch = typeof dolar.variacao === 'number' && Number.isFinite(dolar.variacao) ? dolar.variacao : null
          result.push({
            label: 'Dólar',
            value: `R$${dolar.valor.toFixed(2).replace('.', ',')}`,
            change: ch == null ? '' : `${ch > 0 ? '+' : ''}${ch.toFixed(1).replace('.', ',')}%`,
            positive: ch != null && ch >= 0,
          })
        }
        if (selic && Number.isFinite(selic.valor)) {
          result.push({
            label: 'Selic',
            value: `${selic.valor.toFixed(2).replace('.', ',')}%`,
            change: '',
            positive: true,
          })
        }
      }
      setItems(result)
      setLoading(false)
    })
    return () => controller.abort()
  }, [])

  return { items, loading }
}


interface HeaderProps { onMobileMenuToggle: () => void; onOpenPalette: () => void }

export default function Header({ onMobileMenuToggle, onOpenPalette }: HeaderProps) {
  const { mode, toggle } = useDSTheme()
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { favorites, toggleFavorite } = useNavigationPreferences()
  const currentTool = getToolByRoute(location.pathname)
  const category = CATEGORIES.find(item => item.id === currentTool?.category)
  const { items, loading } = useTickerData()
  const [userOpen, setUserOpen] = useState(false)
  useEffect(() => setUserOpen(false), [location.pathname, location.search])
  const shortcut = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform) ? '⌘ K' : 'Ctrl K'
  return <header className="app-topbar">
    <button id="mobile-nav-trigger" type="button" onClick={onMobileMenuToggle} className="ui-icon-button lg:hidden" aria-label="Abrir menu"><Menu size={20} /></button>
    <nav className="app-breadcrumb" aria-label="Localização atual">
      <span className="hidden xl:inline">{category?.label ?? 'Aletis'}</span>
      <ChevronRight size={13} className="hidden xl:inline" aria-hidden="true" />
      <strong>{location.pathname.startsWith('/clientes/') ? 'Área do cliente' : currentTool?.title ?? 'Aletis'}</strong>
    </nav>
    <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
      <button type="button" onClick={onOpenPalette} className="topbar-search hidden lg:flex" aria-label="Abrir paleta de comandos"><Search size={15} /><span className="flex-1">Buscar no Aletis</span><kbd className="rounded border border-[var(--border-default)] px-1.5 py-0.5 text-[11px]">{shortcut}</kbd></button>
      <button type="button" onClick={onOpenPalette} className="ui-icon-button lg:hidden" aria-label="Abrir paleta de comandos"><Search size={18} /></button>
      <Popover.Root>
        <Popover.Trigger asChild><button type="button" className="ui-icon-button" aria-label="Cotações do mercado" title="Cotações do mercado"><TrendingUp size={18} /></button></Popover.Trigger>
        <Popover.Portal><Popover.Content align="end" sideOffset={12} className="ui-popover w-80" aria-label="Cotações do mercado">
          <div className="px-3 py-3"><h2 className="text-sm font-semibold">Mercado em perspectiva</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Últimas cotações disponíveis nas fontes.</p></div>
          {items.map(item => <div key={item.label} className="flex items-center gap-3 border-t border-[var(--border-default)] px-3 py-3 text-xs"><span className="flex-1 font-medium">{item.label}</span><span className="font-semibold tabular-nums">{item.value}</span>{item.change && <span className={item.positive ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>{item.change}</span>}{item.changeUnavailable && <span className="text-[11px] text-[var(--text-muted)]">var. indisponível</span>}</div>)}
          {!items.length && <p role="status" className="px-3 py-5 text-sm text-[var(--text-muted)]">{loading ? 'Consultando mercado…' : 'Cotações indisponíveis neste momento'}</p>}
          <Popover.Close asChild><Link to="/mercado" className="ui-menu-link border-t border-[var(--border-default)] font-medium">Abrir inteligência de mercado<ChevronRight size={15} className="ml-auto" /></Link></Popover.Close>
        </Popover.Content></Popover.Portal>
      </Popover.Root>
      <Popover.Root>
        <Popover.Trigger asChild><button type="button" aria-label="Opções da página" className="ui-icon-button"><MoreHorizontal size={19} /></button></Popover.Trigger>
        <Popover.Portal><Popover.Content align="end" sideOffset={10} className="ui-popover w-64" aria-label="Opções da página">
          <Popover.Close asChild><button type="button" onClick={() => navigate('/ia?view=operations')} className="ui-menu-link"><ListTodo size={16} /> Operações da ALIX</button></Popover.Close>
          {currentTool && <button type="button" onClick={() => toggleFavorite(currentTool.id)} aria-pressed={favorites.includes(currentTool.id)} className="ui-menu-link"><Star size={16} /> {favorites.includes(currentTool.id) ? 'Remover dos favoritos' : 'Fixar nos favoritos'}</button>}
          <button type="button" onClick={toggle} className="ui-menu-link">{mode === 'operational' ? <Sun size={16} /> : <Moon size={16} />}{mode === 'operational' ? 'Usar tema claro' : 'Usar tema escuro'}</button>
        </Popover.Content></Popover.Portal>
      </Popover.Root>
      <span className="mx-1 hidden h-6 w-px bg-[var(--border-default)] sm:block" />
      <Popover.Root open={userOpen} onOpenChange={setUserOpen}>
        <Popover.Trigger asChild><button type="button" aria-label="Menu do usuário" className="flex items-center gap-2 rounded-lg p-1 hover:bg-[var(--bg-surface-soft)]"><span className="app-avatar">{user.iniciais}</span><span className="hidden max-w-24 truncate text-xs font-medium xl:block">{user.primeiroNome}</span><ChevronDown size={13} className="hidden sm:block" /></button></Popover.Trigger>
        <Popover.Portal><Popover.Content align="end" sideOffset={12} className="ui-popover w-64" aria-label="Minha conta">
          <div className="mb-1 border-b border-[var(--border-default)] px-3 py-3"><p className="text-sm font-semibold">{user.nome}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{user.cargo}</p></div>
          <Link to="/configuracoes?tab=perfil" className="ui-menu-link"><User size={16} />Meu perfil</Link>
          <Link to="/configuracoes" className="ui-menu-link"><Settings size={16} />Configurações</Link>
          <button type="button" onClick={async () => { await logout(); navigate('/login', { replace: true }) }} className="ui-menu-link text-[var(--danger)]"><LogOut size={16} />Sair</button>
        </Popover.Content></Popover.Portal>
      </Popover.Root>
    </div>
  </header>
}
