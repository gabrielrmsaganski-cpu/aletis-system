/**
 * Header (Barra Superior) — v3 — Identidade Visual oficial ALETIS.
 *
 * Topo cream/papel sobre branco com tipografia Chakra Petch + Verdana.
 * Ticker de cotações em fundo verde-dark com texto cream.
 * Avatar e botões secundários respeitam paleta sage/gold.
 */
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Bell,
  Moon,
  Sun,
  Menu,
  ChevronDown,
  User,
  LogOut,
  Settings,
} from 'lucide-react'
import { useDSTheme } from '../../hooks/useDSTheme'

interface TickerItem {
  label: string
  value: string
  change: string
  positive: boolean
}

const FALLBACK_TICKER: TickerItem[] = [
  { label: 'Soja', value: 'R$128,50', change: '+1.2%', positive: true },
  { label: 'Milho', value: 'R$58,20', change: '-0.8%', positive: false },
  { label: 'Boi', value: 'R$295,00', change: '+0.5%', positive: true },
  { label: 'Café', value: 'R$1.420', change: '+2.1%', positive: true },
  { label: 'Dólar', value: 'R$5,78', change: '-0.3%', positive: false },
  { label: 'Selic', value: '14,75%', change: '', positive: true },
]

function formatTickerValue(val: number): string {
  if (val >= 1000)
    return `R$${val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  return `R$${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function useTickerData(): TickerItem[] {
  const [items, setItems] = useState<TickerItem[]>(FALLBACK_TICKER)

  useEffect(() => {
    Promise.all([
      fetch('/api/mercado/precos').then((r) => r.json()).catch(() => null),
      fetch('/api/mercado/indicadores').then((r) => r.json()).catch(() => null),
    ]).then(([precosRes, indRes]) => {
      const result: TickerItem[] = []
      if (precosRes?.success && Array.isArray(precosRes.data)) {
        for (const c of precosRes.data.slice(0, 4)) {
          const change = c.variacao24h ?? 0
          result.push({
            label: c.cultura,
            value: formatTickerValue(c.precoAtual),
            change: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
            positive: change >= 0,
          })
        }
      }
      if (indRes?.success && Array.isArray(indRes.data)) {
        const dolar = indRes.data.find(
          (i: any) => i.sigla === 'PTAX' || i.sigla === 'USD/BRL' || i.nome?.includes('Dolar')
        )
        const selic = indRes.data.find(
          (i: any) => i.sigla === 'SELIC' || i.nome?.includes('Selic')
        )
        if (dolar) {
          const ch = dolar.variacao ?? 0
          result.push({
            label: 'Dólar',
            value: `R$${dolar.valor.toFixed(2).replace('.', ',')}`,
            change: ch ? `${ch >= 0 ? '+' : ''}${ch.toFixed(1)}%` : '',
            positive: ch >= 0,
          })
        }
        if (selic) {
          result.push({
            label: 'Selic',
            value: `${selic.valor.toFixed(2).replace('.', ',')}%`,
            change: '',
            positive: true,
          })
        }
      }
      if (result.length >= 4) setItems(result)
    })
  }, [])

  return items
}

function TickerBadge({ item }: { item: TickerItem }) {
  const arrow = item.change ? (item.positive ? '▲' : '▼') : ''
  return (
    <span className="inline-flex items-center gap-2 px-5 whitespace-nowrap text-[11.5px]">
      <span className="font-display font-semibold tracking-[0.08em] uppercase text-aletis-cream">
        {item.label}
      </span>
      <span className="font-body text-aletis-sage">{item.value}</span>
      {item.change && (
        <span
          className={`font-display font-semibold ${
            item.positive ? 'text-aletis-sage-claro' : 'text-aletis-gold'
          }`}
        >
          {arrow}
          {item.change}
        </span>
      )}
    </span>
  )
}

interface HeaderProps {
  onMobileMenuToggle: () => void
  onOpenPalette: () => void
}

export default function Header({ onMobileMenuToggle, onOpenPalette }: HeaderProps) {
  const { mode, toggle: toggleDS } = useDSTheme()
  const darkMode = mode === 'operational'
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const tickerData = useTickerData()
  const navigate = useNavigate()

  const goTo = (path: string) => {
    setUserMenuOpen(false)
    navigate(path)
  }

  const handleLogout = () => {
    setUserMenuOpen(false)
    const ok = window.confirm('Deseja realmente sair do sistema ALETIS?')
    if (!ok) return
    try {
      localStorage.removeItem('aletis:session')
      localStorage.removeItem('aletis:user')
      sessionStorage.clear()
    } catch {
      /* ignore */
    }
    navigate('/portal-cliente')
  }

  const toggleDarkMode = () => {
    // Delegado ao useDSTheme (persiste em localStorage + aplica .dark
    // no <html>). Modos: "operational" (escuro/denso) | "documental"
    // (claro/leitura).
    toggleDS()
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const shortcutHint =
    typeof navigator !== 'undefined' && /mac/i.test(navigator.platform) ? '⌘K' : 'Ctrl K'

  return (
    <header className="sticky top-0 z-30">
      {/* Market ticker bar — verde dark com texto cream */}
      <div
        className="bg-aletis-verde border-b border-aletis-sage/15 overflow-hidden"
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgba(13,22,17,0.95) 0%, rgba(23,37,27,0.95) 100%), url(/brand/pattern/repetidor.png)',
          backgroundSize: 'auto, 280px',
          backgroundBlendMode: 'normal, soft-light',
          backgroundRepeat: 'no-repeat, repeat',
        }}
      >
        <div className="ticker-wrapper h-8 flex items-center">
          <div className="ticker-content" aria-label="Cotações do mercado">
            {[...tickerData, ...tickerData].map((item, idx) => (
              <TickerBadge key={`${item.label}-${idx}`} item={item} />
            ))}
          </div>
        </div>
      </div>

      {/* Main header bar */}
      <div className="bg-white dark:bg-aletis-verde-escuro border-b border-aletis-borda dark:border-aletis-sage/15 px-4 lg:px-6 h-14 flex items-center gap-3">
        {/* Mobile menu button */}
        <button
          onClick={onMobileMenuToggle}
          className="lg:hidden p-2 -ml-2 rounded-lg text-aletis-verde-medio hover:bg-aletis-cream dark:hover:bg-aletis-cream/10 transition-colors"
          aria-label="Abrir menu"
        >
          <Menu size={22} />
        </button>

        {/* Palette trigger */}
        <button
          type="button"
          onClick={onOpenPalette}
          className="
            group flex-1 max-w-md inline-flex items-center gap-3
            px-3 py-2 rounded-xl
            bg-aletis-cream dark:bg-aletis-cream/5
            border border-transparent hover:border-aletis-gold/45
            hover:bg-aletis-cream-papel dark:hover:bg-aletis-cream/10
            text-left transition-all duration-200
          "
          aria-label="Abrir paleta de comandos"
        >
          <Search
            size={16}
            className="text-aletis-verde-medio dark:text-aletis-sage group-hover:text-aletis-gold-escuro flex-shrink-0"
            aria-hidden="true"
          />
          <span className="flex-1 font-body text-sm text-aletis-verde-medio dark:text-aletis-sage truncate">
            Buscar ferramentas, clientes, relatórios…
          </span>
          <span className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono text-aletis-verde-medio dark:text-aletis-sage px-1.5 py-0.5 rounded border border-aletis-borda dark:border-aletis-sage/20">
            {shortcutHint}
          </span>
        </button>

        {/* Right-side actions */}
        <div className="flex items-center gap-1">
          <button
            className="relative p-2 rounded-lg text-aletis-verde-medio dark:text-aletis-sage hover:bg-aletis-cream dark:hover:bg-aletis-cream/10 transition-colors"
            aria-label="Notificações"
            title="Notificações"
          >
            <Bell size={20} />
            <span
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-aletis-gold ring-2 ring-white dark:ring-aletis-verde"
              aria-label="Novas notificações"
            />
          </button>

          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg text-aletis-verde-medio dark:text-aletis-sage hover:bg-aletis-cream dark:hover:bg-aletis-cream/10 transition-colors"
            aria-label={darkMode ? 'Modo documental (claro)' : 'Modo operacional (escuro)'}
            title={darkMode ? 'Trocar para modo documental — leitura/contratos' : 'Trocar para modo operacional — comando/análise'}
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          <div className="hidden sm:block w-px h-6 bg-aletis-borda dark:bg-aletis-sage/20 mx-2" />

          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-aletis-cream dark:hover:bg-aletis-cream/10 transition-colors"
              aria-expanded={userMenuOpen}
              aria-haspopup="true"
              aria-label="Menu do usuário"
            >
              <div className="w-8 h-8 rounded-full bg-aletis-sage/30 dark:bg-aletis-gold/25 border border-aletis-sage/50 dark:border-aletis-gold/40 flex items-center justify-center">
                <span className="text-aletis-verde dark:text-aletis-gold text-xs font-display font-semibold tracking-wide">
                  CK
                </span>
              </div>
              <span className="hidden sm:block font-body text-sm font-bold text-aletis-verde dark:text-aletis-cream max-w-[120px] truncate">
                Christian
              </span>
              <ChevronDown
                size={14}
                className={`hidden sm:block text-aletis-verde-medio transition-transform duration-200 ${
                  userMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {userMenuOpen && (
              <div
                className="
                  absolute right-0 top-full mt-2 w-56
                  bg-white dark:bg-aletis-verde
                  border border-aletis-borda dark:border-aletis-sage/20
                  rounded-xl shadow-brand-lg py-1.5
                  animate-fade-in z-50
                "
                role="menu"
                aria-orientation="vertical"
              >
                <div className="px-4 py-3 border-b border-aletis-borda dark:border-aletis-sage/15">
                  <p className="font-display text-sm font-bold tracking-wide text-aletis-verde dark:text-aletis-cream">
                    Christian Kohler
                  </p>
                  <p className="font-body text-xs text-aletis-verde-medio dark:text-aletis-sage">
                    Consultor sênior
                  </p>
                </div>
                <button
                  onClick={() => goTo('/configuracoes?tab=perfil')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-body text-aletis-verde-medio dark:text-aletis-sage hover:bg-aletis-cream dark:hover:bg-aletis-cream/5 transition-colors"
                  role="menuitem"
                >
                  <User size={16} />
                  Meu perfil
                </button>
                <button
                  onClick={() => goTo('/configuracoes')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-body text-aletis-verde-medio dark:text-aletis-sage hover:bg-aletis-cream dark:hover:bg-aletis-cream/5 transition-colors"
                  role="menuitem"
                >
                  <Settings size={16} />
                  Configurações
                </button>
                <div className="border-t border-aletis-borda dark:border-aletis-sage/15 mt-1 pt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-body text-alerta hover:bg-alerta/5 transition-colors"
                    role="menuitem"
                  >
                    <LogOut size={16} />
                    Sair
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
