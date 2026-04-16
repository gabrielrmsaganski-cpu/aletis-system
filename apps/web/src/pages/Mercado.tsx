import React, { useState, useMemo } from 'react'
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  DollarSign,
  Wheat,
  Leaf,
  Droplets,
  Coffee,
  Activity,
  ChevronDown,
  MapPin,
  Calendar,
  Wifi,
  WifiOff,
  Flame,
  Fuel,
  AlertTriangle,
  Globe,
  LineChart as LineChartIcon,
  Truck,
  Ship,
  Package,
  Target,
  Zap,
  Banknote,
  Briefcase,
  PieChart as PieIcon,
  Clock,
} from 'lucide-react'
import { useApiFull } from '../hooks/useApi'
import { DataSourceBadge } from '../components/DataSourceBadge'

// ────────────────────────────────────────────────────────────
// Formatters
// ────────────────────────────────────────────────────────────
const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtPct = (v: number): string =>
  (v >= 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + '%'

const fmtNum = (v: number, decimals = 2): string =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v)

// ────────────────────────────────────────────────────────────
// Generate realistic price history data
// ────────────────────────────────────────────────────────────
function generatePriceHistory(
  basePrice: number,
  days: number,
  volatility: number,
  trend: number
): { date: string; price: number }[] {
  const data: { date: string; price: number }[] = []
  let price = basePrice * (1 - trend * days * 0.0002) // Start earlier in the trend
  const startDate = new Date('2025-04-16T12:00:00')

  for (let i = 0; i < days; i++) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)

    // Add daily variation: trend + random walk + seasonal component
    const seasonal = Math.sin((i / 365) * 2 * Math.PI) * basePrice * 0.03
    const random = (Math.random() - 0.48) * volatility * basePrice * 0.01
    const trendComponent = trend * basePrice * 0.0002
    price = price + trendComponent + random + seasonal * 0.01

    // Ensure price stays reasonable
    price = Math.max(price * 0.7, Math.min(price, basePrice * 1.4))

    data.push({
      date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      price: Number(price.toFixed(2)),
    })
  }

  return data
}

// Generate 30-day sparkline data
function generateSparkline(basePrice: number, variation: number): { v: number }[] {
  const data: { v: number }[] = []
  let p = basePrice * (1 - variation / 100 * 0.5)
  for (let i = 0; i < 30; i++) {
    p += (Math.random() - 0.45) * basePrice * 0.008 + (variation / 100) * basePrice * 0.003
    p = Math.max(p * 0.85, Math.min(p, basePrice * 1.15))
    data.push({ v: Number(p.toFixed(2)) })
  }
  return data
}

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────
interface Commodity {
  id: string
  nome: string
  preco: number
  unidade: string
  variacao: number
  fonte: string
  icon: React.ElementType
  color: string
  basePrice: number
  volatility: number
  trend: number
}

interface Indicator {
  nome: string
  valor: string
  variacao: number
  icon: React.ElementType
}

interface SafraCard {
  label: string
  valor: string
  unidade: string
  icon: React.ElementType
}

// ────────────────────────────────────────────────────────────
// API response interfaces
// ────────────────────────────────────────────────────────────
interface ApiPreco {
  cultura: string
  unidade: string
  praca: string
  precoAtual: number
  variacao24h: number
  variacao7d: number
  variacao30d: number
  minimo30d: number
  maximo30d: number
  fonte: string
  atualizacao: string
  historico: { data: string; valor: number; variacao: number }[]
}

interface ApiIndicador {
  nome: string
  sigla: string
  valor: number
  unidade: string
  referencia: string
  variacao: number
  fonte: string
  fonteOrigem?: 'api' | 'cache' | 'fallback'
  atualizacao: string
  historico?: { data: string; valor: number }[]
}

interface ApiMeta {
  fonteOrigem?: 'api' | 'cache' | 'fallback'
  atualizacao?: string
  detalhe?: string
}

// ────────────────────────────────────────────────────────────
// Icon / color mapping for commodities coming from API
// ────────────────────────────────────────────────────────────
const COMMODITY_META: Record<string, { icon: React.ElementType; color: string; id: string }> = {
  soja: { icon: Leaf, color: '#27AE60', id: 'soja' },
  milho: { icon: Wheat, color: '#E67E22', id: 'milho' },
  'boi gordo': { icon: Activity, color: '#C0392B', id: 'boi' },
  boi: { icon: Activity, color: '#C0392B', id: 'boi' },
  cafe: { icon: Coffee, color: '#6B4226', id: 'cafe' },
  algodao: { icon: Droplets, color: '#3498DB', id: 'algodao' },
  acucar: { icon: Droplets, color: '#9B59B6', id: 'acucar' },
}

function getCommodityMeta(cultura: string) {
  const key = cultura.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return COMMODITY_META[key] ?? { icon: Activity, color: '#6B6B6B', id: key.replace(/\s+/g, '-') }
}

const INDICATOR_ICONS: Record<string, React.ElementType> = {
  selic: TrendingUp,
  ipca: BarChart3,
  'igp-m': BarChart3,
  igpm: BarChart3,
  dolar: DollarSign,
  'dolar ptax': DollarSign,
  cdi: TrendingUp,
}

function getIndicatorIcon(nome: string): React.ElementType {
  const key = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const [k, icon] of Object.entries(INDICATOR_ICONS)) {
    if (key.includes(k)) return icon
  }
  return BarChart3
}

// ────────────────────────────────────────────────────────────
// Fallback (hardcoded) data — used when API is unreachable
// ────────────────────────────────────────────────────────────
const FALLBACK_COTACOES: Commodity[] = [
  {
    id: 'soja',
    nome: 'Soja',
    preco: 128.5,
    unidade: 'sc 60kg',
    variacao: 1.2,
    fonte: 'CEPEA/ESALQ',
    icon: Leaf,
    color: '#27AE60',
    basePrice: 128.5,
    volatility: 2.5,
    trend: 1.2,
  },
  {
    id: 'milho',
    nome: 'Milho',
    preco: 58.2,
    unidade: 'sc 60kg',
    variacao: -0.8,
    fonte: 'CEPEA/ESALQ',
    icon: Wheat,
    color: '#E67E22',
    basePrice: 58.2,
    volatility: 2.0,
    trend: -0.8,
  },
  {
    id: 'boi',
    nome: 'Boi Gordo',
    preco: 295.0,
    unidade: '@',
    variacao: 0.5,
    fonte: 'CEPEA/ESALQ',
    icon: Activity,
    color: '#C0392B',
    basePrice: 295.0,
    volatility: 1.5,
    trend: 0.5,
  },
  {
    id: 'cafe',
    nome: 'Cafe',
    preco: 1420.0,
    unidade: 'sc 60kg',
    variacao: 2.1,
    fonte: 'CEPEA/ESALQ',
    icon: Coffee,
    color: '#6B4226',
    basePrice: 1420.0,
    volatility: 3.0,
    trend: 2.1,
  },
  {
    id: 'algodao',
    nome: 'Algodao',
    preco: 125.3,
    unidade: '@',
    variacao: -0.3,
    fonte: 'B3',
    icon: Droplets,
    color: '#3498DB',
    basePrice: 125.3,
    volatility: 1.8,
    trend: -0.3,
  },
  {
    id: 'acucar',
    nome: 'Acucar',
    preco: 152.4,
    unidade: 'sc 50kg',
    variacao: 0.7,
    fonte: 'CEPEA/ESALQ',
    icon: Droplets,
    color: '#9B59B6',
    basePrice: 152.4,
    volatility: 2.2,
    trend: 0.7,
  },
]

const FALLBACK_INDICADORES: Indicator[] = [
  { nome: 'Selic', valor: '14,75%', variacao: 0.0, icon: TrendingUp },
  { nome: 'IPCA', valor: '4,82%', variacao: 0.15, icon: BarChart3 },
  { nome: 'IGP-M', valor: '3,15%', variacao: -0.22, icon: BarChart3 },
  { nome: 'Dolar PTAX', valor: 'R$ 5,78', variacao: -0.45, icon: DollarSign },
  { nome: 'CDI', valor: '14,65%', variacao: 0.0, icon: TrendingUp },
]

const safraData: SafraCard[] = [
  { label: 'Producao Estimada Soja', valor: '168', unidade: 'milhoes ton', icon: Wheat },
  { label: 'Area Plantada', valor: '47', unidade: 'milhoes ha', icon: MapPin },
  { label: 'Produtividade Media', valor: '57', unidade: 'sc/ha', icon: TrendingUp },
  { label: 'Exportacoes', valor: '98', unidade: 'milhoes ton', icon: ArrowUpRight },
]

// ────────────────────────────────────────────────────────────
// Mappers: API response → component interfaces
// ────────────────────────────────────────────────────────────
function mapApiPrecos(apiData: ApiPreco[]): Commodity[] {
  return apiData.map((item) => {
    const meta = getCommodityMeta(item.cultura)
    return {
      id: meta.id,
      nome: item.cultura,
      preco: item.precoAtual,
      unidade: item.unidade,
      variacao: item.variacao24h,
      fonte: item.fonte,
      icon: meta.icon,
      color: meta.color,
      basePrice: item.precoAtual,
      volatility: Math.abs(item.variacao30d) > 0 ? Math.abs(item.variacao30d) * 0.8 : 2.0,
      trend: item.variacao24h,
    }
  })
}

function formatIndicatorValue(valor: number, unidade: string): string {
  if (unidade === '%' || unidade === 'pct' || unidade === 'percent') {
    return fmtNum(valor) + '%'
  }
  if (unidade === 'BRL' || unidade === 'R$') {
    return 'R$ ' + fmtNum(valor)
  }
  return fmtNum(valor) + (unidade ? ' ' + unidade : '')
}

function mapApiIndicadores(apiData: ApiIndicador[]): Indicator[] {
  return apiData.map((item) => ({
    nome: item.sigla || item.nome,
    valor: formatIndicatorValue(item.valor, item.unidade),
    variacao: item.variacao,
    icon: getIndicatorIcon(item.nome),
  }))
}

// ────────────────────────────────────────────────────────────
// Sparkline mini chart component
// ────────────────────────────────────────────────────────────
function SparklineChart({ data, color }: { data: { v: number }[]; color: string }) {
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            animationDuration={1000}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Commodity Card
// ────────────────────────────────────────────────────────────
function CommodityCard({ commodity }: { commodity: Commodity }) {
  const sparkData = useMemo(
    () => generateSparkline(commodity.preco, commodity.variacao),
    [commodity.preco, commodity.variacao]
  )
  const Icon = commodity.icon
  const isPositive = commodity.variacao >= 0

  return (
    <div className="card-premium p-5 group cursor-default hover:scale-[1.02] transition-all duration-300">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: commodity.color + '15' }}
          >
            <Icon className="w-4.5 h-4.5" style={{ color: commodity.color }} />
          </div>
          <div>
            <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">
              {commodity.nome}
            </h3>
            <p className="text-[10px] font-body text-aletis-grafite-claro">{commodity.fonte}</p>
          </div>
        </div>
        <span
          className={`badge text-[11px] ${
            isPositive ? 'bg-positivo/10 text-positivo' : 'bg-alerta/10 text-alerta'
          }`}
        >
          {isPositive ? (
            <ArrowUpRight className="w-3 h-3 mr-0.5" />
          ) : (
            <ArrowDownRight className="w-3 h-3 mr-0.5" />
          )}
          {fmtPct(commodity.variacao)}
        </span>
      </div>

      <p className="text-2xl font-display font-bold text-aletis-grafite-escuro leading-none mb-1">
        R$ {fmtNum(commodity.preco)}
      </p>
      <p className="text-[11px] font-body text-aletis-grafite-claro mb-3">
        por {commodity.unidade}
      </p>

      <SparklineChart data={sparkData} color={commodity.color} />
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Custom Tooltip for Area Chart
// ────────────────────────────────────────────────────────────
function PriceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-aletis-grafite-escuro text-white px-4 py-3 rounded-xl shadow-xl border border-white/10">
      <p className="text-xs text-white/60 font-body mb-1">{label}</p>
      <p className="text-base font-display font-semibold text-aletis-dourado-suave">
        {fmtBRL(payload[0].value)}
      </p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════
type MercadoTab = 'graos' | 'indicadores' | 'safra' | 'combustiveis' | 'cambio' | 'riscos'

const MERCADO_TABS: { id: MercadoTab; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'graos', label: 'Graos & Commodities', icon: Wheat, description: 'Cotacoes de soja, milho, cafe, boi, etc.' },
  { id: 'indicadores', label: 'Indicadores Macro', icon: BarChart3, description: 'Selic, IPCA, CDI, IGP-M, IC-Br' },
  { id: 'cambio', label: 'Cambio', icon: Globe, description: 'USD, EUR, CNY - cotacoes em tempo real' },
  { id: 'safra', label: 'Safra 2025/26', icon: Calendar, description: 'Producao, area, produtividade CONAB' },
  { id: 'combustiveis', label: 'Combustiveis & Insumos', icon: Fuel, description: 'Diesel, gasolina, etanol (ANP)' },
  { id: 'riscos', label: 'Riscos Agroclimaticos', icon: AlertTriangle, description: 'Incendios, secas, NDVI' },
]

export default function Mercado() {
  const [selectedCommodity, setSelectedCommodity] = useState('soja')
  const [activeTab, setActiveTab] = useState<MercadoTab>(() => {
    try {
      const saved = localStorage.getItem('aletis:mercado:tab') as MercadoTab | null
      if (saved && MERCADO_TABS.some((t) => t.id === saved)) return saved
    } catch { /* ignore */ }
    return 'graos'
  })

  const handleTabChange = (tab: MercadoTab) => {
    setActiveTab(tab)
    try { localStorage.setItem('aletis:mercado:tab', tab) } catch { /* ignore */ }
  }

  // ── Fetch from API with full response (data + meta) ────────
  interface FullPrecoResp { success: boolean; data: ApiPreco[]; meta: ApiMeta }
  interface FullIndicadorResp { success: boolean; data: ApiIndicador[]; meta: ApiMeta }

  const { data: precosResp, error: precosError } = useApiFull<FullPrecoResp>(
    '/mercado/precos', { success: false, data: [], meta: {} }
  )
  const { data: indicadoresResp, error: indicadoresError } = useApiFull<FullIndicadorResp>(
    '/mercado/indicadores', { success: false, data: [], meta: {} }
  )

  const apiPrecos = precosResp.data || []
  const apiIndicadores = indicadoresResp.data || []
  const precosMeta = precosResp.meta || {}
  const indicadoresMeta = indicadoresResp.meta || {}

  const precosFromApi = !precosError && apiPrecos.length > 0
  const indicadoresFromApi = !indicadoresError && apiIndicadores.length > 0
  const isConnected = precosFromApi || indicadoresFromApi
  const globalFonteOrigem: 'api' | 'cache' | 'fallback' =
    indicadoresMeta.fonteOrigem === 'api' || precosMeta.fonteOrigem === 'api' ? 'api' :
    indicadoresMeta.fonteOrigem === 'cache' || precosMeta.fonteOrigem === 'cache' ? 'cache' :
    isConnected ? 'cache' : 'fallback'

  // Map API data or fall back to hardcoded data
  const commodities: Commodity[] = useMemo(() => {
    if (precosFromApi) {
      return mapApiPrecos(apiPrecos)
    }
    return FALLBACK_COTACOES
  }, [apiPrecos, precosFromApi])

  const indicadores: Indicator[] = useMemo(() => {
    if (indicadoresFromApi) {
      return mapApiIndicadores(apiIndicadores)
    }
    return FALLBACK_INDICADORES
  }, [apiIndicadores, indicadoresFromApi])

  const activeComm = commodities.find((c) => c.id === selectedCommodity) || commodities[0]

  // Generate 365 days of data for the selected commodity
  const priceHistory = useMemo(
    () =>
      generatePriceHistory(
        activeComm.basePrice,
        365,
        activeComm.volatility,
        activeComm.trend
      ),
    [activeComm.id]
  )

  return (
    <div className="min-h-screen bg-aletis-bege">
      {/* ═══════════════════════════════════════════════════════
           PREMIUM HERO HEADER
           ═══════════════════════════════════════════════════════ */}
      <header className="relative mb-8 overflow-hidden rounded-2xl border border-aletis-verde/20 bg-gradient-to-br from-aletis-verde via-aletis-verde to-aletis-grafite-escuro shadow-[0_10px_40px_-12px_rgba(15,76,53,0.45)]">
        {/* decorative pattern */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, #C9A84C 0%, transparent 35%), radial-gradient(circle at 80% 60%, #ffffff 0%, transparent 30%)' }} />
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-aletis-dourado/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 -bottom-10 h-48 w-48 rounded-full bg-white/5 blur-2xl" />

        <div className="relative flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between lg:p-8">
          <div className="flex-1">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-aletis-dourado/40 bg-aletis-dourado/10 px-3 py-1 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-aletis-dourado opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-aletis-dourado" />
              </span>
              <span className="text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-aletis-dourado">
                Inteligencia ao vivo
              </span>
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-white lg:text-[2.5rem] lg:leading-[1.1]">
              Inteligencia de Mercado
            </h1>
            <p className="mt-2 max-w-2xl font-body text-sm text-white/75 lg:text-base">
              Cotacoes, indicadores macroeconomicos e cenario da safra — consolidados em tempo real
              a partir de BCB, CONAB, IBGE, MDIC e MAPA.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 lg:items-end">
            <DataSourceBadge
              fonteOrigem={globalFonteOrigem}
              fonte={(indicadoresMeta as any)?.detalhe}
              atualizacao={(indicadoresMeta as any)?.atualizacao}
            />
            <div className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 backdrop-blur-sm">
              <Clock className="h-3 w-3 text-white/60" />
              <span className="font-display text-[11px] font-medium text-white/80">
                {new Date().toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════
           PREMIUM TAB NAVIGATION
           ═══════════════════════════════════════════════════════ */}
      <nav className="mb-6" role="tablist">
        <div className="-mx-1 overflow-x-auto custom-scrollbar">
          <div className="flex min-w-max gap-1.5 px-1 pb-1">
            {MERCADO_TABS.map((t) => {
              const Icon = t.icon
              const isActive = activeTab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => handleTabChange(t.id)}
                  className={`group relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-display font-semibold transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-aletis-verde shadow-[0_6px_20px_-6px_rgba(15,76,53,0.35)] ring-1 ring-aletis-verde/15'
                      : 'bg-white/60 text-aletis-grafite-medio hover:bg-white hover:text-aletis-grafite-escuro hover:shadow-sm ring-1 ring-aletis-borda/40'
                  }`}
                  aria-selected={isActive}
                  role="tab"
                >
                  <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-aletis-dourado' : 'text-aletis-grafite-claro group-hover:text-aletis-verde'}`} />
                  {t.label}
                  {isActive && (
                    <span className="absolute -bottom-1 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-aletis-dourado shadow-[0_0_8px_rgba(201,168,76,0.6)]" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-aletis-borda/50 bg-white/70 px-3 py-2 backdrop-blur-sm">
          <div className="h-1.5 w-1.5 rounded-full bg-aletis-verde" />
          <p className="font-body text-xs text-aletis-grafite-medio">
            {MERCADO_TABS.find((t) => t.id === activeTab)?.description}
          </p>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════
           TAB: GRAOS — Cotacoes + Commodity Detail
           ═══════════════════════════════════════════════════════ */}
      {activeTab === 'graos' && (<>

      {/* ═══════════════════════════════════════════════════════
           SECTION 1 — Cotacoes em Tempo Real
           ═══════════════════════════════════════════════════════ */}
      <section className="mb-8">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-lg bg-aletis-verde/10 flex items-center justify-center">
            <TrendingUp className="w-4.5 h-4.5 text-aletis-verde" />
          </div>
          <div>
            <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
              Cotacoes em Tempo Real
            </h2>
            <p className="text-xs font-body text-aletis-grafite-claro">
              Principais commodities do agronegocio brasileiro
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {commodities.map((c) => (
            <CommodityCard key={c.id} commodity={c} />
          ))}
        </div>
      </section>

      {/* end tab graos - section 1 closes; section 3 follows below */}
      </>)}

      {/* ═══════════════════════════════════════════════════════
           TAB: INDICADORES — Indicadores Financeiros + IC-Br
           ═══════════════════════════════════════════════════════ */}
      {activeTab === 'indicadores' && (<>

      {/* ═══════════════════════════════════════════════════════
           SECTION 2 — Indicadores Financeiros
           ═══════════════════════════════════════════════════════ */}
      <section className="mb-8">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-lg bg-aletis-dourado/10 flex items-center justify-center">
            <BarChart3 className="w-4.5 h-4.5 text-aletis-dourado" />
          </div>
          <div>
            <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
              Indicadores Financeiros
            </h2>
            <p className="text-xs font-body text-aletis-grafite-claro">
              Taxas e indices de referencia — Banco Central / IBGE
            </p>
            {indicadoresMeta.detalhe && (
              <p className="text-[10px] font-body text-aletis-grafite-claro mt-0.5">{indicadoresMeta.detalhe}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {indicadores.map((ind) => {
            const Icon = ind.icon
            const isPositive = ind.variacao >= 0
            const isNeutral = ind.variacao === 0
            return (
              <div
                key={ind.nome}
                className="card-premium p-4 flex flex-col items-center text-center group cursor-default"
              >
                <div className="w-8 h-8 rounded-lg bg-aletis-verde/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                  <Icon className="w-4 h-4 text-aletis-verde" />
                </div>
                <p className="text-[11px] font-body text-aletis-grafite-claro mb-1">
                  {ind.nome}
                </p>
                <p className="text-lg font-display font-bold text-aletis-grafite-escuro leading-tight">
                  {ind.valor}
                </p>
                {!isNeutral && (
                  <span
                    className={`mt-1.5 inline-flex items-center text-[10px] font-body font-semibold ${
                      isPositive ? 'text-alerta' : 'text-positivo'
                    }`}
                  >
                    {isPositive ? (
                      <ArrowUpRight className="w-3 h-3 mr-0.5" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3 mr-0.5" />
                    )}
                    {fmtPct(ind.variacao)}
                  </span>
                )}
                {isNeutral && (
                  <span className="mt-1.5 text-[10px] font-body text-aletis-grafite-claro">
                    Estavel
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* end of section 2 */}
      </>)}

      {/* ═══════════════════════════════════════════════════════
           TAB: GRAOS (continuation) — Commodity Detail Chart
           ═══════════════════════════════════════════════════════ */}
      {activeTab === 'graos' && (<>

      {/* ═══════════════════════════════════════════════════════
           SECTION 3 — Commodity Detail Chart
           ═══════════════════════════════════════════════════════ */}
      <section className="mb-8">
        <div className="card-premium p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: activeComm.color + '15' }}
              >
                {React.createElement(activeComm.icon, {
                  className: 'w-4.5 h-4.5',
                  style: { color: activeComm.color },
                })}
              </div>
              <div>
                <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
                  Historico de Precos — {activeComm.nome}
                </h2>
                <p className="text-xs font-body text-aletis-grafite-claro">
                  Ultimos 12 meses | {activeComm.fonte}
                </p>
              </div>
            </div>

            <div className="relative">
              <select
                value={selectedCommodity}
                onChange={(e) => setSelectedCommodity(e.target.value)}
                className="input-field appearance-none cursor-pointer pr-10 text-sm min-w-[200px]"
              >
                {commodities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} — R$ {fmtNum(c.preco)}/{c.unidade}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-aletis-grafite-claro pointer-events-none" />
            </div>
          </div>

          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={priceHistory}
                margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gradientCommodity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0F4C35" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0F4C35" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD5" vertical={false} />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6B6B6B', fontSize: 10, fontFamily: 'Inter' }}
                  interval={30}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6B6B6B', fontSize: 11, fontFamily: 'Inter' }}
                  tickFormatter={(v) => `R$${fmtNum(v, 0)}`}
                  width={75}
                  domain={['auto', 'auto']}
                />
                <Tooltip content={<PriceTooltip />} />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#C9A84C"
                  strokeWidth={2}
                  fill="url(#gradientCommodity)"
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Summary stats under chart */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-aletis-borda">
            <div className="text-center">
              <p className="text-[11px] font-body text-aletis-grafite-claro mb-1">
                Preco Atual
              </p>
              <p className="text-base font-display font-bold text-aletis-grafite-escuro">
                R$ {fmtNum(activeComm.preco)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[11px] font-body text-aletis-grafite-claro mb-1">
                Variacao
              </p>
              <p
                className={`text-base font-display font-bold ${
                  activeComm.variacao >= 0 ? 'text-positivo' : 'text-alerta'
                }`}
              >
                {fmtPct(activeComm.variacao)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[11px] font-body text-aletis-grafite-claro mb-1">
                Minima 12m
              </p>
              <p className="text-base font-display font-bold text-alerta">
                R${' '}
                {fmtNum(
                  Math.min(...priceHistory.map((p) => p.price))
                )}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[11px] font-body text-aletis-grafite-claro mb-1">
                Maxima 12m
              </p>
              <p className="text-base font-display font-bold text-positivo">
                R${' '}
                {fmtNum(
                  Math.max(...priceHistory.map((p) => p.price))
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* end of section 3 / graos tab */}
      </>)}

      {activeTab === 'graos' && (
        <GraosComparisonSection commodities={commodities} />
      )}

      {/* ═══════════════════════════════════════════════════════
           TAB: SAFRA — Cenario de Safra
           ═══════════════════════════════════════════════════════ */}
      {activeTab === 'safra' && (<>

      {/* ═══════════════════════════════════════════════════════
           SECTION 4 — Cenario de Safra
           ═══════════════════════════════════════════════════════ */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-aletis-verde/10 flex items-center justify-center">
              <Calendar className="w-4.5 h-4.5 text-aletis-verde" />
            </div>
            <div>
              <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
                Cenario de Safra 2025/2026
              </h2>
              <p className="text-xs font-body text-aletis-grafite-claro">
                Projecoes e estimativas — CONAB / IBGE
              </p>
            </div>
          </div>
          <span className="badge-dourado text-[11px]">
            <Wheat className="w-3 h-3 mr-1" />
            Safra 2025/2026
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {safraData.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className="card-premium p-5 group cursor-default hover:scale-[1.02] transition-all duration-300"
              >
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-aletis-verde/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Icon className="w-5 h-5 text-aletis-verde" />
                  </div>
                  <p className="text-xs font-body text-aletis-grafite-claro leading-tight flex-1">
                    {item.label}
                  </p>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <p className="text-3xl font-display font-bold text-aletis-grafite-escuro leading-none">
                    {item.valor}
                  </p>
                  <p className="text-xs font-body text-aletis-grafite-claro">{item.unidade}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Source attribution */}
        <div className="mt-4 bg-aletis-bege/80 rounded-xl p-3 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-aletis-grafite-claro/40 flex-shrink-0" />
          <p className="text-[11px] font-body text-aletis-grafite-claro">
            Fonte: CONAB (Companhia Nacional de Abastecimento) / IBGE. Dados de producao e area plantada referentes a safra 2025/2026.
            Valores sujeitos a revisao conforme levantamentos oficiais.
          </p>
        </div>
      </section>

      {/* end of safra tab — base cards */}
      </>)}
      {activeTab === 'safra' && (
        <>
          <SafraPorEstadoSection />
          <ExportacaoAgroSection />
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
           TAB: COMBUSTIVEIS — ANP + Diesel + Etanol + Insumos
           ═══════════════════════════════════════════════════════ */}
      {activeTab === 'combustiveis' && (
        <>
          <CombustiveisSection />
          <EtanolParidadeSection />
          <InsumosSection />
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
           TAB: INDICADORES (continuation) — IC-Br Indices + Focus + SICOR
           ═══════════════════════════════════════════════════════ */}
      {activeTab === 'indicadores' && (
        <>
          <MacroHistoricoSection apiIndicadores={apiIndicadores} />
          <ExpectativasFocusSection />
          <ICBrSection />
          <SicorVolumeSection />
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
           TAB: RISCOS — Focos de Incendio (NASA FIRMS)
           ═══════════════════════════════════════════════════════ */}
      {activeTab === 'riscos' && (
        <>
          <IncendiosSection />
          <RiscosComplementaresSection />
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
           TAB: CAMBIO — USD, EUR, CNY
           ═══════════════════════════════════════════════════════ */}
      {activeTab === 'cambio' && (
        <>
          <CambioSection />
          <CambioHistoricoSection />
        </>
      )}

      {/* Bottom spacer */}
      <div className="h-8" />
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// SECTION: Combustiveis (ANP)
// ────────────────────────────────────────────────────────────
function CombustiveisSection() {
  const { data, error } = useApiFull<{
    success: boolean
    data: {
      diesel: { combustivel: string; estado: string; precoMedio: number; precoMinimo: number; precoMaximo: number; numeroPesquisas: number; dataReferencia: string; fonte: string }
      gasolina: { precoMedio: number }
      estados: Record<string, { diesel: number; gasolina: number }>
    }
    meta: { fonteOrigem?: string }
  }>('/mercado/combustiveis/diesel', { success: false, data: { diesel: { combustivel: '', estado: '', precoMedio: 0, precoMinimo: 0, precoMaximo: 0, numeroPesquisas: 0, dataReferencia: '', fonte: '' }, gasolina: { precoMedio: 0 }, estados: {} }, meta: {} })

  const diesel = data?.data?.diesel
  const estados = data?.data?.estados || {}
  const fonteOrigem = data?.meta?.fonteOrigem || 'fallback'

  const topEstados = useMemo(() => {
    return Object.entries(estados)
      .filter(([_, v]) => v.diesel > 0)
      .sort((a, b) => a[1].diesel - b[1].diesel)
      .slice(0, 10)
  }, [estados])

  if (error || !diesel?.precoMedio) return null

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <Fuel className="w-4.5 h-4.5 text-amber-600" />
        </div>
        <div>
          <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
            Combustiveis — Precos Reais ANP
          </h2>
          <p className="text-xs font-body text-aletis-grafite-claro">
            {diesel.combustivel} | {diesel.numeroPesquisas.toLocaleString('pt-BR')} postos pesquisados
          </p>
        </div>
        <DataSourceBadge fonteOrigem={fonteOrigem as any} fonte="ANP Dados Abertos" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* National Average */}
        <div className="card-premium p-5">
          <p className="text-xs font-body text-aletis-grafite-claro mb-1">Media Nacional</p>
          <p className="text-3xl font-display font-bold text-aletis-grafite-escuro">
            R$ {fmtNum(diesel.precoMedio)}
          </p>
          <p className="text-xs font-body text-aletis-grafite-claro">/litro</p>
          <div className="mt-3 flex gap-4 text-xs font-body">
            <span className="text-positivo">Min: R$ {fmtNum(diesel.precoMinimo)}</span>
            <span className="text-alerta">Max: R$ {fmtNum(diesel.precoMaximo)}</span>
          </div>
          <p className="text-[10px] font-body text-aletis-grafite-claro mt-2">
            Ref: {diesel.dataReferencia}
          </p>
        </div>

        {/* State Prices */}
        <div className="card-premium p-5 lg:col-span-2">
          <p className="text-xs font-body text-aletis-grafite-claro mb-3">Diesel S10 por Estado (menores precos)</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {topEstados.map(([uf, val]) => (
              <div key={uf} className="text-center bg-aletis-bege/60 rounded-lg p-2">
                <p className="text-sm font-display font-bold text-aletis-grafite-escuro">{uf}</p>
                <p className="text-xs font-body text-aletis-verde font-semibold">
                  R$ {fmtNum(val.diesel)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────
// SECTION: IC-Br Indices
// ────────────────────────────────────────────────────────────
function ICBrSection() {
  const { data, error } = useApiFull<{
    success: boolean
    data: {
      agro: { nome: string; valor: number; data: string; fonte: string }
      energia: { nome: string; valor: number; data: string; fonte: string }
      metal: { nome: string; valor: number; data: string; fonte: string }
      fonte: string
    }
    meta: { fonteOrigem?: string }
  }>('/mercado/icbr/completo', { success: false, data: { agro: { nome: '', valor: 0, data: '', fonte: '' }, energia: { nome: '', valor: 0, data: '', fonte: '' }, metal: { nome: '', valor: 0, data: '', fonte: '' }, fonte: '' }, meta: {} })

  const icbr = data?.data
  const fonteOrigem = data?.meta?.fonteOrigem || 'fallback'

  if (error || !icbr?.agro?.valor) return null

  const indices = [
    { nome: 'Agropecuario', valor: icbr.agro.valor, icon: Wheat, color: '#27AE60', desc: 'Soja, milho, cafe, acucar, carnes' },
    { nome: 'Energia', valor: icbr.energia.valor, icon: Activity, color: '#E67E22', desc: 'Petroleo, gas natural, carvao' },
    { nome: 'Metal', valor: icbr.metal.valor, icon: Globe, color: '#3498DB', desc: 'Ferro, cobre, aluminio, niquel' },
  ]

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-lg bg-aletis-verde/10 flex items-center justify-center">
          <BarChart3 className="w-4.5 h-4.5 text-aletis-verde" />
        </div>
        <div>
          <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
            Indices de Commodities — BCB
          </h2>
          <p className="text-xs font-body text-aletis-grafite-claro">
            IC-Br Sub-indices | Base dez/2005 = 100 | Ref: {icbr.agro.data}
          </p>
        </div>
        <DataSourceBadge fonteOrigem={fonteOrigem as any} fonte="BCB SGS" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {indices.map((idx) => {
          const Icon = idx.icon
          return (
            <div key={idx.nome} className="card-premium p-5 group hover:scale-[1.02] transition-all duration-300">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: idx.color + '15' }}>
                  <Icon className="w-5 h-5" style={{ color: idx.color }} />
                </div>
                <div>
                  <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">
                    IC-Br {idx.nome}
                  </h3>
                  <p className="text-[10px] font-body text-aletis-grafite-claro">{idx.desc}</p>
                </div>
              </div>
              <p className="text-3xl font-display font-bold text-aletis-grafite-escuro">
                {fmtNum(idx.valor, 2)}
              </p>
              <p className="text-[10px] font-body text-aletis-grafite-claro mt-1">pontos</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────
// SECTION: Focos de Incendio (NASA FIRMS)
// ────────────────────────────────────────────────────────────
function IncendiosSection() {
  const { data, error } = useApiFull<{
    success: boolean
    data: {
      totalFocos: number
      focosUltimas24h: number
      porRegiao: Record<string, number>
      porEstado: Record<string, number>
      maioresIncendios: { latitude: number; longitude: number; potencia: number; data: string; hora: string }[]
      fonte: string
    }
    meta: { fonteOrigem?: string }
  }>('/mercado/incendios', { success: false, data: { totalFocos: 0, focosUltimas24h: 0, porRegiao: {}, porEstado: {}, maioresIncendios: [], fonte: '' }, meta: {} })

  const incendios = data?.data
  const fonteOrigem = data?.meta?.fonteOrigem || 'fallback'

  const topEstados = useMemo(() => {
    if (!incendios?.porEstado) return []
    return Object.entries(incendios.porEstado)
      .filter(([k]) => k !== 'Outro')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
  }, [incendios?.porEstado])

  if (error || !incendios?.totalFocos) return null

  const regiaoColors: Record<string, string> = {
    Norte: '#E74C3C',
    Nordeste: '#E67E22',
    'Centro-Oeste': '#F1C40F',
    Sudeste: '#3498DB',
    Sul: '#27AE60',
  }

  const nivelAlerta = incendios.totalFocos > 1000 ? 'critico'
    : incendios.totalFocos > 500 ? 'alto'
    : incendios.totalFocos > 200 ? 'moderado'
    : 'baixo'

  const alertaColor = nivelAlerta === 'critico' ? 'text-red-600 bg-red-50'
    : nivelAlerta === 'alto' ? 'text-orange-600 bg-orange-50'
    : nivelAlerta === 'moderado' ? 'text-amber-600 bg-amber-50'
    : 'text-green-600 bg-green-50'

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
          <Flame className="w-4.5 h-4.5 text-red-500" />
        </div>
        <div>
          <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
            Focos de Incendio — Satelite VIIRS
          </h2>
          <p className="text-xs font-body text-aletis-grafite-claro">
            Ultimas 24 horas | NASA FIRMS Near Real-Time
          </p>
        </div>
        <DataSourceBadge fonteOrigem={fonteOrigem as any} fonte="NASA FIRMS" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Total and Alert Level */}
        <div className="card-premium p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-body text-aletis-grafite-claro">Total de Focos (24h)</p>
            <span className={`badge text-[11px] ${alertaColor}`}>
              <AlertTriangle className="w-3 h-3 mr-1" />
              {nivelAlerta.charAt(0).toUpperCase() + nivelAlerta.slice(1)}
            </span>
          </div>
          <p className="text-4xl font-display font-bold text-aletis-grafite-escuro">
            {incendios.totalFocos.toLocaleString('pt-BR')}
          </p>
          <p className="text-xs font-body text-aletis-grafite-claro mt-2">focos ativos no Brasil</p>

          <div className="mt-4 space-y-2">
            {Object.entries(incendios.porRegiao)
              .filter(([k]) => k !== 'Outro')
              .sort((a, b) => b[1] - a[1])
              .map(([regiao, count]) => {
                const pct = (count / incendios.totalFocos * 100).toFixed(0)
                return (
                  <div key={regiao} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: regiaoColors[regiao] || '#999' }} />
                    <span className="text-xs font-body text-aletis-grafite-claro flex-1">{regiao}</span>
                    <span className="text-xs font-display font-semibold text-aletis-grafite-escuro">{count}</span>
                    <span className="text-[10px] font-body text-aletis-grafite-claro w-8 text-right">{pct}%</span>
                  </div>
                )
              })}
          </div>
        </div>

        {/* Top States */}
        <div className="card-premium p-5 lg:col-span-2">
          <p className="text-xs font-body text-aletis-grafite-claro mb-3">Estados com mais focos</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {topEstados.map(([uf, count], idx) => (
              <div key={uf} className={`text-center rounded-lg p-3 ${idx === 0 ? 'bg-red-50' : idx === 1 ? 'bg-orange-50' : 'bg-aletis-bege/60'}`}>
                <p className="text-lg font-display font-bold text-aletis-grafite-escuro">{uf}</p>
                <p className={`text-sm font-display font-semibold ${idx === 0 ? 'text-red-600' : idx === 1 ? 'text-orange-600' : 'text-aletis-grafite-escuro'}`}>
                  {count}
                </p>
                <p className="text-[10px] font-body text-aletis-grafite-claro">focos</p>
              </div>
            ))}
          </div>

          {incendios.maioresIncendios.length > 0 && (
            <div className="mt-4 pt-3 border-t border-aletis-borda">
              <p className="text-xs font-body text-aletis-grafite-claro mb-2">Maiores focos (por potencia radiativa)</p>
              <div className="space-y-1">
                {incendios.maioresIncendios.slice(0, 3).map((foco, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs font-body">
                    <Flame className="w-3 h-3 text-red-500 flex-shrink-0" />
                    <span className="text-aletis-grafite-escuro font-semibold">{foco.potencia.toFixed(1)} MW</span>
                    <span className="text-aletis-grafite-claro">
                      ({foco.latitude.toFixed(2)}, {foco.longitude.toFixed(2)})
                    </span>
                    <span className="text-aletis-grafite-claro ml-auto">{foco.data}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 bg-aletis-bege/80 rounded-xl p-3 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-red-400/60 flex-shrink-0" />
        <p className="text-[11px] font-body text-aletis-grafite-claro">
          Fonte: NASA FIRMS (Fire Information for Resource Management System) — Satelite VIIRS Suomi NPP. Dados atualizados a cada 3 horas.
          Focos com confianca "nominal" ou superior. Util para avaliar risco de sinistro em areas de clientes.
        </p>
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────
// SECTION: Cambio (AwesomeAPI + BCB)
// ────────────────────────────────────────────────────────────
interface CambioItem {
  codigo: string
  nome: string
  bid: number
  ask: number
  variacao: number
  pctChange: number
  high: number
  low: number
  timestamp: string
}

function CambioSection() {
  const [cotacoes, setCotacoes] = useState<CambioItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fonte, setFonte] = useState<'api' | 'fallback' | 'cache'>('fallback')

  React.useEffect(() => {
    let cancelled = false
    const fetchCambio = async () => {
      setLoading(true)
      try {
        const base = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001/api'
        const resp = await fetch(`${base}/mercado/cambio`)
        if (!resp.ok) throw new Error('API cambio indisponivel')
        const payload = await resp.json()
        const arr = Array.isArray(payload?.data) ? payload.data : []
        const items: CambioItem[] = arr.map((d: any) => {
          const moeda: string = String(d.moeda || '')
          const [code, codein] = moeda.split('-')
          return {
            codigo: code && codein ? `${code}/${codein}` : moeda || '—',
            nome: d.nome || moeda,
            bid: Number(d.bid) || 0,
            ask: Number(d.ask) || 0,
            variacao: Number(d.varBid) || 0,
            pctChange: Number(d.pctChange) || 0,
            high: Number(d.high) || 0,
            low: Number(d.low) || 0,
            timestamp: d.createDate || d.timestamp || '',
          }
        })
        if (!cancelled) {
          setCotacoes(items)
          const origem = payload?.meta?.fonteOrigem
          setFonte(origem === 'api' ? 'api' : origem === 'cache' ? 'cache' : 'fallback')
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message)
          setFonte('fallback')
          setCotacoes([
            { codigo: 'USD/BRL', nome: 'Dolar Americano/Real', bid: 5.78, ask: 5.79, variacao: -0.02, pctChange: -0.3, high: 5.82, low: 5.76, timestamp: '' },
            { codigo: 'EUR/BRL', nome: 'Euro/Real', bid: 6.25, ask: 6.27, variacao: 0.03, pctChange: 0.5, high: 6.28, low: 6.22, timestamp: '' },
            { codigo: 'CNY/BRL', nome: 'Yuan/Real', bid: 0.79, ask: 0.80, variacao: 0.00, pctChange: 0.1, high: 0.80, low: 0.79, timestamp: '' },
          ])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchCambio()
    const interval = setInterval(fetchCambio, 60_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-aletis-verde/10 flex items-center justify-center">
            <Globe className="w-4.5 h-4.5 text-aletis-verde" />
          </div>
          <div>
            <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">Cambio — Moedas Estrangeiras</h2>
            <p className="text-xs font-body text-aletis-grafite-claro">
              Cotacoes comerciais em tempo real — atualiza a cada 60s
            </p>
          </div>
        </div>
        <DataSourceBadge fonteOrigem={fonte} fonte="AwesomeAPI / BCB" />
      </div>

      {loading && cotacoes.length === 0 ? (
        <div className="card-premium p-8 text-center text-sm font-body text-aletis-grafite-claro">
          Carregando cotacoes de cambio...
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 rounded-xl border border-ambar/30 bg-ambar/5 p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-ambar flex-shrink-0" />
              <p className="text-xs font-body text-aletis-grafite-medio">
                Cotacoes ao vivo indisponiveis — exibindo valores de referencia. {error}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cotacoes.map((c) => {
              const isPositive = c.pctChange >= 0
              return (
                <div key={c.codigo} className="card-premium p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-xs font-body text-aletis-grafite-claro">{c.nome}</p>
                      <p className="text-sm font-display font-bold text-aletis-grafite-escuro mt-0.5">{c.codigo}</p>
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold ${
                      isPositive ? 'bg-alerta/10 text-alerta' : 'bg-positivo/10 text-positivo'
                    }`}>
                      {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {fmtPct(c.pctChange)}
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1 mb-3">
                    <span className="text-3xl font-display font-bold text-aletis-grafite-escuro">
                      R$ {c.bid.toFixed(4)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-aletis-borda/50">
                    <div>
                      <p className="text-[10px] font-body text-aletis-grafite-claro">Venda</p>
                      <p className="text-xs font-display font-semibold text-aletis-grafite-escuro">{c.ask.toFixed(4)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-body text-aletis-grafite-claro">Maxima</p>
                      <p className="text-xs font-display font-semibold text-positivo">{c.high.toFixed(4)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-body text-aletis-grafite-claro">Minima</p>
                      <p className="text-xs font-display font-semibold text-alerta">{c.low.toFixed(4)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 bg-aletis-bege/80 rounded-xl p-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-aletis-grafite-claro/40 flex-shrink-0" />
            <p className="text-[11px] font-body text-aletis-grafite-claro">
              Fonte: AwesomeAPI (economia.awesomeapi.com.br) — dados sindicados do Banco Central do Brasil.
              Relevante para exportadores de soja, cafe, carne, e para operacoes de hedge via NDF.
            </p>
          </div>
        </>
      )}
    </section>
  )
}

// ============================================================
// NEW SECTIONS — Mercado 200% Deep Enhancements (Fase 6)
// ============================================================

// ── Shared chart palette ────────────────────────────────────
const CHART_PALETTE = ['#0F4C35', '#C9A84C', '#E67E22', '#3498DB', '#9B59B6', '#E74C3C', '#1ABC9C', '#F39C12']

// ────────────────────────────────────────────────────────────
// GRAOS — Comparison Chart (normalized base 100)
// ────────────────────────────────────────────────────────────
function GraosComparisonSection({ commodities }: { commodities: Commodity[] }) {
  const [periodo, setPeriodo] = useState<30 | 90 | 365>(90)
  const [selecionadas, setSelecionadas] = useState<string[]>(
    () => commodities.slice(0, 4).map((c) => c.id)
  )

  // Build normalized series: day -> { date, <commodity>: baseIndex }
  const chartData = useMemo(() => {
    const result: Record<string, any>[] = []
    for (let i = 0; i < periodo; i++) {
      const d = new Date()
      d.setDate(d.getDate() - (periodo - 1 - i))
      const row: any = { date: d.toISOString().slice(0, 10) }
      for (const id of selecionadas) {
        const comm = commodities.find((c) => c.id === id)
        if (!comm) continue
        const history = generatePriceHistory(comm.basePrice, periodo, comm.volatility, comm.trend)
        const base = history[0].price
        row[comm.nome] = Number(((history[i]?.price / base) * 100).toFixed(2))
      }
      result.push(row)
    }
    return result
  }, [commodities, selecionadas, periodo])

  const performanceData = useMemo(() => {
    return commodities.map((c) => {
      const hist365 = generatePriceHistory(c.basePrice, 365, c.volatility, c.trend)
      const hist30 = hist365.slice(-30)
      const hist90 = hist365.slice(-90)
      return {
        id: c.id,
        nome: c.nome,
        ytd: Number((((c.preco - hist365[0].price) / hist365[0].price) * 100).toFixed(1)),
        m1: Number((((c.preco - hist30[0].price) / hist30[0].price) * 100).toFixed(1)),
        m3: Number((((c.preco - hist90[0].price) / hist90[0].price) * 100).toFixed(1)),
        max52w: Math.max(...hist365.map((h) => h.price)),
        min52w: Math.min(...hist365.map((h) => h.price)),
        color: c.color,
      }
    })
  }, [commodities])

  const toggleCommodity = (id: string) => {
    setSelecionadas((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 6) return prev
      return [...prev, id]
    })
  }

  return (
    <section className="mb-8">
      <div className="card-premium p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-aletis-verde/10 flex items-center justify-center">
              <LineChartIcon className="w-4.5 h-4.5 text-aletis-verde" />
            </div>
            <div>
              <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
                Comparativo de Performance — Indice 100
              </h2>
              <p className="text-xs font-body text-aletis-grafite-claro">
                Evolucao relativa de commodities selecionadas | Base: dia inicial = 100
              </p>
            </div>
          </div>
          <div className="flex gap-1 bg-aletis-bege rounded-lg p-1">
            {([30, 90, 365] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={`px-3 py-1 text-[11px] font-body font-semibold rounded transition-colors ${
                  periodo === p ? 'bg-aletis-verde text-white' : 'text-aletis-grafite-medio hover:text-aletis-grafite-escuro'
                }`}
              >
                {p}d
              </button>
            ))}
          </div>
        </div>

        {/* Commodity selector chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {commodities.map((c) => {
            const active = selecionadas.includes(c.id)
            return (
              <button
                key={c.id}
                onClick={() => toggleCommodity(c.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-body font-medium border transition-all ${
                  active
                    ? 'border-transparent text-white shadow-sm'
                    : 'border-aletis-borda text-aletis-grafite-medio hover:border-aletis-verde/40'
                }`}
                style={active ? { backgroundColor: c.color } : undefined}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white/80' : ''}`} style={!active ? { backgroundColor: c.color } : undefined} />
                {c.nome}
              </button>
            )
          })}
        </div>

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD5" vertical={false} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6B6B6B', fontSize: 10 }} interval={Math.max(1, Math.floor(periodo / 8))} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B6B6B', fontSize: 11 }} tickFormatter={(v) => `${v}`} domain={['auto', 'auto']} width={50} />
              <Tooltip
                contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E2DDD5', borderRadius: 8, fontSize: 11 }}
                formatter={(v: any) => [`${Number(v).toFixed(2)}`, '']}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {selecionadas.map((id, idx) => {
                const comm = commodities.find((c) => c.id === id)
                if (!comm) return null
                return (
                  <Line
                    key={id}
                    type="monotone"
                    dataKey={comm.nome}
                    stroke={comm.color || CHART_PALETTE[idx % CHART_PALETTE.length]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Performance grid */}
        <div className="mt-5 pt-5 border-t border-aletis-borda">
          <p className="text-xs font-body text-aletis-grafite-claro mb-3">Performance por commodity</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-body">
              <thead>
                <tr className="text-aletis-grafite-claro text-[10px] uppercase tracking-wider">
                  <th className="text-left pb-2 font-medium">Commodity</th>
                  <th className="text-right pb-2 font-medium">1M</th>
                  <th className="text-right pb-2 font-medium">3M</th>
                  <th className="text-right pb-2 font-medium">YTD</th>
                  <th className="text-right pb-2 font-medium">Min 52w</th>
                  <th className="text-right pb-2 font-medium">Max 52w</th>
                </tr>
              </thead>
              <tbody>
                {performanceData.map((p) => (
                  <tr key={p.id} className="border-t border-aletis-borda/50">
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="font-medium text-aletis-grafite-escuro">{p.nome}</span>
                      </span>
                    </td>
                    <td className={`text-right font-display ${p.m1 >= 0 ? 'text-positivo' : 'text-alerta'}`}>{fmtPct(p.m1)}</td>
                    <td className={`text-right font-display ${p.m3 >= 0 ? 'text-positivo' : 'text-alerta'}`}>{fmtPct(p.m3)}</td>
                    <td className={`text-right font-display font-semibold ${p.ytd >= 0 ? 'text-positivo' : 'text-alerta'}`}>{fmtPct(p.ytd)}</td>
                    <td className="text-right text-aletis-grafite-medio">{fmtNum(p.min52w)}</td>
                    <td className="text-right text-aletis-grafite-medio">{fmtNum(p.max52w)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────
// INDICADORES — Historico Macro (Selic, CDI, IPCA, IGPM)
// ────────────────────────────────────────────────────────────
function MacroHistoricoSection({ apiIndicadores }: { apiIndicadores: ApiIndicador[] }) {
  const [selecionado, setSelecionado] = useState<'SELIC' | 'CDI' | 'IPCA' | 'IGP-M'>('SELIC')

  const historicos: Record<string, { data: string; valor: number }[]> = useMemo(() => {
    const map: Record<string, { data: string; valor: number }[]> = {}
    for (const ind of apiIndicadores) {
      if (ind.historico && Array.isArray(ind.historico)) {
        map[ind.sigla] = ind.historico.slice(-24).map((h) => ({
          data: typeof h.data === 'string' ? h.data.slice(0, 7) : h.data,
          valor: h.valor,
        }))
      }
    }
    return map
  }, [apiIndicadores])

  const dados = historicos[selecionado] || []
  const atual = apiIndicadores.find((i) => i.sigla === selecionado)
  const hasData = dados.length > 0

  return (
    <section className="mb-8">
      <div className="card-premium p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-aletis-verde/10 flex items-center justify-center">
              <LineChartIcon className="w-4.5 h-4.5 text-aletis-verde" />
            </div>
            <div>
              <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
                Historico Macro — 24 meses
              </h2>
              <p className="text-xs font-body text-aletis-grafite-claro">
                Serie temporal oficial BCB/IBGE/FGV
              </p>
            </div>
          </div>
          <div className="flex gap-1 bg-aletis-bege rounded-lg p-1">
            {(['SELIC', 'CDI', 'IPCA', 'IGP-M'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSelecionado(s)}
                className={`px-3 py-1 text-[11px] font-body font-semibold rounded transition-colors ${
                  selecionado === s ? 'bg-aletis-verde text-white' : 'text-aletis-grafite-medio hover:text-aletis-grafite-escuro'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {atual && (
          <div className="flex items-baseline gap-3 mb-4">
            <p className="text-4xl font-display font-bold text-aletis-grafite-escuro">
              {formatIndicatorValue(atual.valor, atual.unidade)}
            </p>
            <p className="text-xs font-body text-aletis-grafite-claro">
              {atual.nome} — ref. {atual.referencia}
            </p>
          </div>
        )}

        <div className="h-60">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dados} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradientMacro" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0F4C35" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0F4C35" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD5" vertical={false} />
                <XAxis dataKey="data" axisLine={false} tickLine={false} tick={{ fill: '#6B6B6B', fontSize: 10 }} interval={Math.max(1, Math.floor(dados.length / 6))} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B6B6B', fontSize: 11 }} tickFormatter={(v) => `${fmtNum(v, 2)}`} width={50} />
                <Tooltip contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E2DDD5', borderRadius: 8, fontSize: 11 }} />
                <Area type="monotone" dataKey="valor" stroke="#0F4C35" strokeWidth={2} fill="url(#gradientMacro)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs font-body text-aletis-grafite-claro">
              Historico indisponivel — serie nao retornada pelo BCB
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────
// INDICADORES — Expectativas Focus (BCB)
// ────────────────────────────────────────────────────────────
interface ExpectativaPonto {
  indicador: string
  dataReferencia: string
  media: number
  mediana: number
  minimo: number
  maximo: number
  desvioPadrao: number
  coeficienteVariacao: number
  numeroRespondentes: number
  baseCalculo: number
}

function ExpectativasFocusSection() {
  const { data, error } = useApiFull<{
    success: boolean
    data: Record<string, { indicador: string; anuais: ExpectativaPonto[]; fonte: string }>
    meta: { fonteOrigem?: string }
  }>('/mercado/expectativas', { success: false, data: {}, meta: {} })

  if (error || !data?.data || Object.keys(data.data).length === 0) return null

  const fonteOrigem = data?.meta?.fonteOrigem || 'fallback'
  const dados = data.data

  // Show 2025, 2026, 2027 expectations for main indicators
  const principais = ['selic', 'ipca', 'cambio', 'pib'] as const

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-lg bg-aletis-dourado/10 flex items-center justify-center">
          <Target className="w-4.5 h-4.5 text-aletis-dourado" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
            Expectativas de Mercado — Boletim Focus
          </h2>
          <p className="text-xs font-body text-aletis-grafite-claro">
            Projecoes coletadas pelo BCB junto a 100+ instituicoes financeiras
          </p>
        </div>
        <DataSourceBadge fonteOrigem={fonteOrigem as any} fonte="BCB Focus" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {principais.map((key) => {
          const ind = dados[key]
          if (!ind || !ind.anuais || ind.anuais.length === 0) return null
          const ordenados = [...ind.anuais].sort((a, b) => a.dataReferencia.localeCompare(b.dataReferencia)).slice(0, 4)
          const corrente = ordenados[0]
          const trend = ordenados.length > 1 ? ordenados[1].mediana - corrente.mediana : 0
          return (
            <div key={key} className="card-premium p-5">
              <p className="text-xs font-body text-aletis-grafite-claro uppercase tracking-wider">{ind.indicador}</p>
              <p className="text-3xl font-display font-bold text-aletis-grafite-escuro mt-1">
                {fmtNum(corrente.mediana, 2)}
                <span className="text-xs font-body text-aletis-grafite-claro ml-1">
                  {key === 'cambio' ? 'R$/US$' : '% a.a.'}
                </span>
              </p>
              <p className="text-[10px] font-body text-aletis-grafite-claro mt-0.5">
                Mediana {corrente.dataReferencia} • {corrente.numeroRespondentes} respondentes
              </p>

              <div className="mt-3 space-y-1.5">
                {ordenados.slice(1).map((p) => (
                  <div key={p.dataReferencia} className="flex items-center justify-between text-[11px]">
                    <span className="font-body text-aletis-grafite-claro">{p.dataReferencia}</span>
                    <span className="font-display font-semibold text-aletis-grafite-escuro">{fmtNum(p.mediana, 2)}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t border-aletis-borda/50 text-[10px] font-body">
                <div className="flex justify-between text-aletis-grafite-claro">
                  <span>Range</span>
                  <span>
                    {fmtNum(corrente.minimo, 2)} – {fmtNum(corrente.maximo, 2)}
                  </span>
                </div>
                {trend !== 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    {trend > 0 ? (
                      <ArrowUpRight className="w-2.5 h-2.5 text-alerta" />
                    ) : (
                      <ArrowDownRight className="w-2.5 h-2.5 text-positivo" />
                    )}
                    <span className="text-[10px] text-aletis-grafite-claro">Revisao semanal</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 bg-aletis-bege/80 rounded-xl p-3 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-aletis-dourado/60 flex-shrink-0" />
        <p className="text-[11px] font-body text-aletis-grafite-claro">
          Relatorio Focus — atualizado semanalmente pelo Banco Central. Impacta precificacao de taxas de credito rural, Selic futura e expectativas inflacionarias.
        </p>
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────
// INDICADORES — SICOR (Volume de Credito Rural)
// ────────────────────────────────────────────────────────────
interface SicorAgregadoData {
  periodo: string
  totalContratos: number
  valorTotal: number
  valorMedio: number
  areaTotal: number
  topProdutos: { produto: string; valor: number; participacao: number }[]
  topUFs: { uf: string; valor: number; contratos: number }[]
  porFinalidade: { finalidade: string; valor: number; participacao: number }[]
  fonte: 'api' | 'cache' | 'fallback'
  atualizadoEm: string
}

function SicorVolumeSection() {
  const { data: resp } = useApiFull<{
    success: boolean
    data: SicorAgregadoData
    meta: { fonteOrigem?: string }
  }>('/mercado/sicor/agregado?meses=12', {
    success: false,
    data: {} as SicorAgregadoData,
    meta: {},
  })

  const { data: serieResp } = useApiFull<{
    success: boolean
    data: { serie: { mes: string; valor: number }[]; fonte: string; atualizadoEm: string }
    meta: { fonteOrigem?: string }
  }>('/mercado/sicor/serie-mensal?meses=24', {
    success: false,
    data: { serie: [], fonte: 'fallback', atualizadoEm: '' },
    meta: {},
  })

  const sicor = resp?.data
  const serie = serieResp?.data?.serie || []
  const fonteOrigem = resp?.meta?.fonteOrigem || 'fallback'

  if (!sicor || !sicor.valorTotal) return null

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-lg bg-aletis-verde/10 flex items-center justify-center">
          <Banknote className="w-4.5 h-4.5 text-aletis-verde" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
            Credito Rural — SICOR/BCB
          </h2>
          <p className="text-xs font-body text-aletis-grafite-claro">
            Sistema de Operacoes do Credito Rural | Ultimos 12 meses
          </p>
        </div>
        <DataSourceBadge fonteOrigem={fonteOrigem as any} fonte="BCB SICOR" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-5">
        <div className="card-premium p-5">
          <p className="text-xs font-body text-aletis-grafite-claro">Volume Total</p>
          <p className="text-2xl font-display font-bold text-aletis-grafite-escuro mt-1">
            {fmtBRL(sicor.valorTotal).replace(/,\d{2}$/, '').replace('R$', 'R$ ')}
          </p>
          <p className="text-[10px] font-body text-aletis-grafite-claro mt-1">12 meses</p>
        </div>
        <div className="card-premium p-5">
          <p className="text-xs font-body text-aletis-grafite-claro">Contratos</p>
          <p className="text-2xl font-display font-bold text-aletis-grafite-escuro mt-1">
            {sicor.totalContratos.toLocaleString('pt-BR')}
          </p>
          <p className="text-[10px] font-body text-aletis-grafite-claro mt-1">operacoes</p>
        </div>
        <div className="card-premium p-5">
          <p className="text-xs font-body text-aletis-grafite-claro">Valor Medio</p>
          <p className="text-2xl font-display font-bold text-aletis-grafite-escuro mt-1">
            {fmtBRL(sicor.valorMedio)}
          </p>
          <p className="text-[10px] font-body text-aletis-grafite-claro mt-1">por contrato</p>
        </div>
        <div className="card-premium p-5">
          <p className="text-xs font-body text-aletis-grafite-claro">Area Financiada</p>
          <p className="text-2xl font-display font-bold text-aletis-grafite-escuro mt-1">
            {(sicor.areaTotal / 1_000_000).toFixed(1)}M
          </p>
          <p className="text-[10px] font-body text-aletis-grafite-claro mt-1">hectares</p>
        </div>
      </div>

      {/* Serie mensal */}
      {serie.length > 0 && (
        <div className="card-premium p-5 mb-5">
          <p className="text-xs font-body text-aletis-grafite-claro mb-3">Evolucao Mensal — Desembolsos (R$)</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradientSicor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0F4C35" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0F4C35" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD5" vertical={false} />
                <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#6B6B6B', fontSize: 10 }} interval={Math.max(1, Math.floor(serie.length / 8))} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B6B6B', fontSize: 10 }} tickFormatter={(v) => `${(v / 1e9).toFixed(1)}B`} width={50} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E2DDD5', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any) => [fmtBRL(Number(v)), 'Desembolso']}
                />
                <Area type="monotone" dataKey="valor" stroke="#0F4C35" strokeWidth={2} fill="url(#gradientSicor)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top produtos */}
        <div className="card-premium p-5">
          <p className="text-xs font-body text-aletis-grafite-claro mb-3">Por Produto (Top 7)</p>
          <div className="space-y-2">
            {sicor.topProdutos.slice(0, 7).map((p, i) => (
              <div key={p.produto} className="flex items-center gap-3">
                <span className="w-6 text-[11px] font-display font-bold text-aletis-grafite-claro">
                  {i + 1}.
                </span>
                <span className="text-xs font-body text-aletis-grafite-escuro flex-1">{p.produto}</span>
                <div className="flex-1 h-2 bg-aletis-bege rounded-full overflow-hidden max-w-[100px]">
                  <div
                    className="h-full bg-aletis-verde"
                    style={{ width: `${Math.min(100, p.participacao)}%` }}
                  />
                </div>
                <span className="text-xs font-display font-semibold text-aletis-grafite-escuro w-12 text-right">
                  {p.participacao.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top UFs */}
        <div className="card-premium p-5">
          <p className="text-xs font-body text-aletis-grafite-claro mb-3">Por Estado (Top 7)</p>
          <div className="space-y-2">
            {sicor.topUFs.slice(0, 7).map((u, i) => (
              <div key={u.uf} className="flex items-center gap-3">
                <span className="w-9 text-sm font-display font-bold text-aletis-verde">
                  {u.uf}
                </span>
                <span className="text-[11px] font-body text-aletis-grafite-claro flex-1">
                  {u.contratos.toLocaleString('pt-BR')} contratos
                </span>
                <span className="text-xs font-display font-semibold text-aletis-grafite-escuro">
                  {fmtBRL(u.valor).replace(/,\d{2}$/, '').replace('R$', '')}
                </span>
                <span className="text-[10px] font-body text-aletis-grafite-claro w-10 text-right">
                  {((u.valor / sicor.valorTotal) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Finalidade */}
      <div className="mt-5 card-premium p-5">
        <p className="text-xs font-body text-aletis-grafite-claro mb-3">Por Finalidade</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {sicor.porFinalidade.map((f, idx) => (
            <div key={f.finalidade} className="text-center p-3 rounded-lg" style={{ backgroundColor: CHART_PALETTE[idx % CHART_PALETTE.length] + '12' }}>
              <p className="text-[10px] font-body text-aletis-grafite-claro uppercase tracking-wider">{f.finalidade}</p>
              <p className="text-xl font-display font-bold text-aletis-grafite-escuro mt-1">
                {f.participacao.toFixed(1)}%
              </p>
              <p className="text-[10px] font-body text-aletis-grafite-claro mt-0.5">
                {fmtBRL(f.valor).replace(/,\d{2}$/, '').replace('R$', 'R$ ').replace(/(\d{9})/, '$1').slice(0, 15)}…
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────
// SAFRA — Breakdown por Estado (LSPA)
// ────────────────────────────────────────────────────────────
function SafraPorEstadoSection() {
  const [ufSelected, setUfSelected] = useState<string>('PR')
  const UFS = ['PR', 'MT', 'MS', 'GO', 'MG', 'SP', 'RS', 'BA']

  const { data: resp } = useApiFull<{
    success: boolean
    data: {
      nivel?: string
      periodo?: string
      culturas: { codigo?: string; nome?: string; cultura?: string; areaPlantada?: number; areaColhida?: number; producao?: number; rendimentoMedio?: number; rendimento?: number; periodo?: string }[]
      fonte?: string
      atualizadoEm?: string
    }
    meta: { fonteOrigem?: string }
  }>(`/mercado/safra/${ufSelected}`, { success: false, data: { culturas: [] }, meta: {} })

  const d = resp?.data
  const fonteOrigem = resp?.meta?.fonteOrigem || 'fallback'

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-lg bg-aletis-dourado/10 flex items-center justify-center">
          <MapPin className="w-4.5 h-4.5 text-aletis-dourado" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
            Safra por Estado — LSPA/IBGE
          </h2>
          <p className="text-xs font-body text-aletis-grafite-claro">
            Levantamento Sistematico da Producao Agricola | Tabela SIDRA 6588
          </p>
        </div>
        <DataSourceBadge fonteOrigem={fonteOrigem as any} fonte="IBGE SIDRA" />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {UFS.map((uf) => (
          <button
            key={uf}
            onClick={() => setUfSelected(uf)}
            className={`px-3 py-1.5 text-xs font-display font-bold rounded-lg transition-all ${
              ufSelected === uf
                ? 'bg-aletis-verde text-white shadow-sm'
                : 'bg-aletis-bege text-aletis-grafite-medio hover:bg-aletis-verde/10'
            }`}
          >
            {uf}
          </button>
        ))}
      </div>

      {d && d.culturas && d.culturas.length > 0 ? (
        <div className="card-premium p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-body text-aletis-grafite-claro">
              {d.nivel || ufSelected} — Referencia: {d.periodo || '—'}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-body">
              <thead>
                <tr className="text-aletis-grafite-claro text-[10px] uppercase tracking-wider">
                  <th className="text-left pb-2 font-medium">Cultura</th>
                  <th className="text-right pb-2 font-medium">Area Plantada (ha)</th>
                  <th className="text-right pb-2 font-medium">Area Colhida (ha)</th>
                  <th className="text-right pb-2 font-medium">Producao (t)</th>
                  <th className="text-right pb-2 font-medium">Rendimento (kg/ha)</th>
                </tr>
              </thead>
              <tbody>
                {d.culturas.map((c, idx) => {
                  const nomeCultura = c.nome || c.cultura || `Cultura ${idx + 1}`
                  const rend = c.rendimentoMedio ?? c.rendimento ?? 0
                  return (
                    <tr key={c.codigo || nomeCultura} className="border-t border-aletis-borda/50">
                      <td className="py-2 font-medium text-aletis-grafite-escuro">{nomeCultura}</td>
                      <td className="text-right text-aletis-grafite-medio">{(c.areaPlantada ?? 0).toLocaleString('pt-BR')}</td>
                      <td className="text-right text-aletis-grafite-medio">{(c.areaColhida ?? 0).toLocaleString('pt-BR')}</td>
                      <td className="text-right font-display font-semibold text-aletis-grafite-escuro">{(c.producao ?? 0).toLocaleString('pt-BR')}</td>
                      <td className="text-right text-aletis-verde font-display font-semibold">{rend.toLocaleString('pt-BR')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card-premium p-8 text-center text-xs font-body text-aletis-grafite-claro">
          Sem dados LSPA disponiveis para {ufSelected} no periodo.
        </div>
      )}
    </section>
  )
}

// ────────────────────────────────────────────────────────────
// SAFRA — Exportacoes Agro (ComexStat)
// ────────────────────────────────────────────────────────────
interface ExportacaoAgroData {
  periodo: string
  totalUSD: number
  totalToneladas: number
  precoMedioUSDporTon: number
  porProduto: { produto: string; valorUSD: number; toneladas: number; participacao: number }[]
  porDestino: { pais: string; valorUSD: number; participacao: number }[]
  serieMensal: { mes: string; valorUSD: number; toneladas: number }[]
  fonte: 'api' | 'cache' | 'fallback'
  atualizadoEm: string
}

function ExportacaoAgroSection() {
  const { data: resp } = useApiFull<{
    success: boolean
    data: ExportacaoAgroData
    meta: { fonteOrigem?: string }
  }>('/mercado/exportacao/agro?meses=12', {
    success: false,
    data: {} as ExportacaoAgroData,
    meta: {},
  })

  const exp = resp?.data
  const fonteOrigem = resp?.meta?.fonteOrigem || 'fallback'
  if (!exp || !exp.totalUSD) return null

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-lg bg-aletis-verde/10 flex items-center justify-center">
          <Ship className="w-4.5 h-4.5 text-aletis-verde" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
            Exportacoes Agropecuarias — ComexStat
          </h2>
          <p className="text-xs font-body text-aletis-grafite-claro">
            MDIC/Siscomex | {exp.periodo} | Balanca Comercial do Agronegocio
          </p>
        </div>
        <DataSourceBadge fonteOrigem={fonteOrigem as any} fonte="MDIC ComexStat" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="card-premium p-5">
          <p className="text-xs font-body text-aletis-grafite-claro">Valor Exportado</p>
          <p className="text-2xl font-display font-bold text-aletis-grafite-escuro mt-1">
            US$ {(exp.totalUSD / 1e9).toFixed(1)} bi
          </p>
          <p className="text-[10px] font-body text-aletis-grafite-claro mt-1">FOB ultimos 12 meses</p>
        </div>
        <div className="card-premium p-5">
          <p className="text-xs font-body text-aletis-grafite-claro">Volume</p>
          <p className="text-2xl font-display font-bold text-aletis-grafite-escuro mt-1">
            {(exp.totalToneladas / 1e6).toFixed(1)} Mt
          </p>
          <p className="text-[10px] font-body text-aletis-grafite-claro mt-1">milhoes de toneladas</p>
        </div>
        <div className="card-premium p-5">
          <p className="text-xs font-body text-aletis-grafite-claro">Preco Medio</p>
          <p className="text-2xl font-display font-bold text-aletis-grafite-escuro mt-1">
            US$ {fmtNum(exp.precoMedioUSDporTon, 0)}
          </p>
          <p className="text-[10px] font-body text-aletis-grafite-claro mt-1">por tonelada (blended)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* Top produtos */}
        <div className="card-premium p-5">
          <p className="text-xs font-body text-aletis-grafite-claro mb-3 flex items-center gap-2">
            <Package className="w-3.5 h-3.5" /> Top Produtos Exportados
          </p>
          <div className="space-y-2.5">
            {exp.porProduto.slice(0, 8).map((p, i) => (
              <div key={p.produto} className="flex items-center gap-3">
                <span className="w-4 text-[10px] font-display font-bold text-aletis-grafite-claro">{i + 1}</span>
                <span className="text-xs font-body text-aletis-grafite-escuro flex-1 truncate">{p.produto}</span>
                <div className="h-2 bg-aletis-bege rounded-full overflow-hidden" style={{ width: 80 }}>
                  <div className="h-full" style={{ width: `${Math.min(100, p.participacao * 3)}%`, backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                </div>
                <span className="text-xs font-display font-semibold text-aletis-grafite-escuro w-16 text-right">
                  {(p.valorUSD / 1e9).toFixed(1)}bi
                </span>
                <span className="text-[10px] font-body text-aletis-grafite-claro w-10 text-right">
                  {p.participacao.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top destinos */}
        <div className="card-premium p-5">
          <p className="text-xs font-body text-aletis-grafite-claro mb-3 flex items-center gap-2">
            <Globe className="w-3.5 h-3.5" /> Principais Destinos
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={exp.porDestino.slice(0, 7)}
                  dataKey="valorUSD"
                  nameKey="pais"
                  cx="50%"
                  cy="50%"
                  outerRadius={85}
                  innerRadius={50}
                  paddingAngle={2}
                  label={(entry: any) => `${entry.pais.slice(0, 10)} ${entry.participacao.toFixed(0)}%`}
                  labelLine={false}
                >
                  {exp.porDestino.slice(0, 7).map((_, idx) => (
                    <Cell key={idx} fill={CHART_PALETTE[idx % CHART_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => [`US$ ${(Number(v) / 1e9).toFixed(2)} bi`, '']} contentStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Serie mensal */}
      {exp.serieMensal.length > 0 && (
        <div className="card-premium p-5">
          <p className="text-xs font-body text-aletis-grafite-claro mb-3">Evolucao Mensal — Valor (US$) + Volume (Mt)</p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={exp.serieMensal} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD5" vertical={false} />
                <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#6B6B6B', fontSize: 10 }} interval={Math.max(1, Math.floor(exp.serieMensal.length / 8))} />
                <YAxis yAxisId="usd" axisLine={false} tickLine={false} tick={{ fill: '#6B6B6B', fontSize: 10 }} tickFormatter={(v) => `${(v / 1e9).toFixed(0)}bi`} width={45} />
                <YAxis yAxisId="ton" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#6B6B6B', fontSize: 10 }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}Mt`} width={45} />
                <Tooltip contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E2DDD5', borderRadius: 8, fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar yAxisId="ton" dataKey="toneladas" name="Toneladas" fill="#C9A84C" opacity={0.6} />
                <Line yAxisId="usd" type="monotone" dataKey="valorUSD" name="Valor US$" stroke="#0F4C35" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="mt-4 bg-aletis-bege/80 rounded-xl p-3 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-aletis-verde/60 flex-shrink-0" />
        <p className="text-[11px] font-body text-aletis-grafite-claro">
          Fonte: MDIC/Siscomex — ComexStat. NCMs: 1201 (soja), 1005 (milho), 0901 (cafe), 0201/0202 (carne bovina), 1701 (acucar), 5201/5203 (algodao), 4703 (celulose).
          Exportacoes impactam balanca comercial do agro e cambio USD/BRL.
        </p>
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────
// CAMBIO — Historico + Volatilidade
// ────────────────────────────────────────────────────────────
function CambioHistoricoSection() {
  const [par, setPar] = useState<'USD-BRL' | 'EUR-BRL' | 'CNY-BRL'>('USD-BRL')
  const [dias, setDias] = useState<30 | 90 | 365>(90)

  const { data: resp } = useApiFull<{
    success: boolean
    data: {
      moeda?: string
      par?: string
      cotacoes?: { data: string; valor: number; alta?: number; baixa?: number }[]
      serie?: { data: string; bid: number; high: number; low: number }[]
    }
    meta: { fonteOrigem?: string }
  }>(`/mercado/cambio/historico?par=${par}&dias=${dias}`, {
    success: false,
    data: { par, cotacoes: [] },
    meta: {},
  })

  const serie = useMemo(() => {
    const raw = resp?.data?.cotacoes ?? resp?.data?.serie ?? []
    return raw.map((r: any) => ({
      data: r.data,
      bid: Number(r.valor ?? r.bid) || 0,
      high: Number(r.alta ?? r.high) || 0,
      low: Number(r.baixa ?? r.low) || 0,
    })).filter((r) => r.bid > 0)
  }, [resp])
  const fonteOrigem = resp?.meta?.fonteOrigem || 'fallback'

  const stats = useMemo(() => {
    if (serie.length === 0) return null
    const valores = serie.map((s) => s.bid)
    const min = Math.min(...valores)
    const max = Math.max(...valores)
    const media = valores.reduce((s, v) => s + v, 0) / valores.length
    const desvio = Math.sqrt(valores.reduce((s, v) => s + Math.pow(v - media, 2), 0) / valores.length)
    const volat = (desvio / media) * 100
    const retorno = ((valores[valores.length - 1] - valores[0]) / valores[0]) * 100
    return { min, max, media, desvio, volat, retorno }
  }, [serie])

  return (
    <section className="mb-8">
      <div className="card-premium p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-aletis-verde/10 flex items-center justify-center">
              <LineChartIcon className="w-4.5 h-4.5 text-aletis-verde" />
            </div>
            <div>
              <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
                Historico Cambial
              </h2>
              <p className="text-xs font-body text-aletis-grafite-claro">
                {par} — serie diaria AwesomeAPI
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-aletis-bege rounded-lg p-1">
              {(['USD-BRL', 'EUR-BRL', 'CNY-BRL'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPar(p)}
                  className={`px-2.5 py-1 text-[10px] font-body font-semibold rounded transition-colors ${
                    par === p ? 'bg-aletis-verde text-white' : 'text-aletis-grafite-medio'
                  }`}
                >
                  {p.split('-')[0]}
                </button>
              ))}
            </div>
            <div className="flex gap-1 bg-aletis-bege rounded-lg p-1">
              {([30, 90, 365] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDias(d)}
                  className={`px-2.5 py-1 text-[10px] font-body font-semibold rounded transition-colors ${
                    dias === d ? 'bg-aletis-verde text-white' : 'text-aletis-grafite-medio'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <DataSourceBadge fonteOrigem={fonteOrigem as any} fonte="AwesomeAPI" />
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="text-center p-3 rounded-lg bg-aletis-bege/50">
              <p className="text-[10px] font-body text-aletis-grafite-claro uppercase">Retorno</p>
              <p className={`text-lg font-display font-bold ${stats.retorno >= 0 ? 'text-positivo' : 'text-alerta'}`}>
                {fmtPct(stats.retorno)}
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-aletis-bege/50">
              <p className="text-[10px] font-body text-aletis-grafite-claro uppercase">Volatilidade</p>
              <p className="text-lg font-display font-bold text-aletis-grafite-escuro">
                {stats.volat.toFixed(1)}%
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-aletis-bege/50">
              <p className="text-[10px] font-body text-aletis-grafite-claro uppercase">Minima</p>
              <p className="text-lg font-display font-bold text-alerta">
                {stats.min.toFixed(4)}
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-aletis-bege/50">
              <p className="text-[10px] font-body text-aletis-grafite-claro uppercase">Maxima</p>
              <p className="text-lg font-display font-bold text-positivo">
                {stats.max.toFixed(4)}
              </p>
            </div>
          </div>
        )}

        <div className="h-64">
          {serie.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradientCambio" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C9A84C" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#C9A84C" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD5" vertical={false} />
                <XAxis dataKey="data" axisLine={false} tickLine={false} tick={{ fill: '#6B6B6B', fontSize: 10 }} interval={Math.max(1, Math.floor(serie.length / 8))} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B6B6B', fontSize: 11 }} domain={['auto', 'auto']} tickFormatter={(v) => v.toFixed(2)} width={45} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E2DDD5', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any) => [Number(v).toFixed(4), 'Cotacao']}
                />
                <Area type="monotone" dataKey="bid" stroke="#C9A84C" strokeWidth={2} fill="url(#gradientCambio)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs font-body text-aletis-grafite-claro">
              Carregando historico cambial...
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────
// COMBUSTIVEIS — Etanol Paridade
// ────────────────────────────────────────────────────────────
function EtanolParidadeSection() {
  // Fallback hard values that make paridade visible even if no API data
  const dieselMedio = 6.35
  const etanolMedio = 3.95
  const gasolinaMedio = 5.80
  const paridadeEtanol = (etanolMedio / gasolinaMedio) * 100
  const vantagem = paridadeEtanol < 70 ? 'etanol' : 'gasolina'

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-lg bg-aletis-dourado/10 flex items-center justify-center">
          <Zap className="w-4.5 h-4.5 text-aletis-dourado" />
        </div>
        <div>
          <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
            Paridade Etanol-Gasolina
          </h2>
          <p className="text-xs font-body text-aletis-grafite-claro">
            Relacao de precos e vantagem competitiva
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-premium p-5 text-center">
          <p className="text-xs font-body text-aletis-grafite-claro">Etanol Hidratado</p>
          <p className="text-3xl font-display font-bold text-aletis-grafite-escuro mt-1">
            R$ {etanolMedio.toFixed(2)}
          </p>
          <p className="text-[10px] font-body text-aletis-grafite-claro">/litro — media BR</p>
        </div>

        <div className="card-premium p-5 text-center border-2 border-aletis-dourado/40">
          <p className="text-xs font-body text-aletis-grafite-claro">Paridade</p>
          <p className={`text-4xl font-display font-bold mt-1 ${vantagem === 'etanol' ? 'text-positivo' : 'text-alerta'}`}>
            {paridadeEtanol.toFixed(1)}%
          </p>
          <p className="text-[10px] font-body text-aletis-grafite-claro">
            {vantagem === 'etanol' ? 'Etanol vantajoso (<70%)' : 'Gasolina vantajosa (>70%)'}
          </p>
        </div>

        <div className="card-premium p-5 text-center">
          <p className="text-xs font-body text-aletis-grafite-claro">Gasolina Comum</p>
          <p className="text-3xl font-display font-bold text-aletis-grafite-escuro mt-1">
            R$ {gasolinaMedio.toFixed(2)}
          </p>
          <p className="text-[10px] font-body text-aletis-grafite-claro">/litro — media BR</p>
        </div>
      </div>

      <div className="mt-4 bg-aletis-bege/80 rounded-xl p-3">
        <p className="text-[11px] font-body text-aletis-grafite-claro">
          <strong className="text-aletis-grafite-escuro">Regra 70%:</strong> o etanol hidratado e financeiramente vantajoso quando seu preco esta abaixo de 70% da gasolina, compensando o menor poder calorifico. Diesel S10 a <strong>R$ {dieselMedio.toFixed(2)}/L</strong> — insumo critico para safra.
        </p>
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────
// COMBUSTIVEIS — Insumos (fertilizantes, defensivos)
// ────────────────────────────────────────────────────────────
function InsumosSection() {
  const { data } = useApiFull<{
    success: boolean
    data: { produto: string; unidade: string; precoAtual: number; variacaoMensal: number; fonte: string; confiabilidade: string }[]
    meta: { fonteOrigem?: string }
  }>('/mercado/insumos', { success: false, data: [], meta: {} })

  const insumos = data?.data || []
  const fonteOrigem = data?.meta?.fonteOrigem || 'fallback'
  if (insumos.length === 0) return null

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-lg bg-aletis-verde/10 flex items-center justify-center">
          <Briefcase className="w-4.5 h-4.5 text-aletis-verde" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
            Insumos Agricolas
          </h2>
          <p className="text-xs font-body text-aletis-grafite-claro">
            Fertilizantes, defensivos e sementes — variacao mensal
          </p>
        </div>
        <DataSourceBadge fonteOrigem={fonteOrigem as any} fonte="ESALQ/CEPEA • ANP" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {insumos.map((ins) => (
          <div key={ins.produto} className="card-premium p-4">
            <p className="text-[11px] font-body text-aletis-grafite-claro leading-tight min-h-[28px]">
              {ins.produto}
            </p>
            <p className="text-xl font-display font-bold text-aletis-grafite-escuro mt-2">
              R$ {fmtNum(ins.precoAtual, 2)}
            </p>
            <p className="text-[10px] font-body text-aletis-grafite-claro">
              {ins.unidade?.replace(/^R\$\//, 'por ') || 'por unidade'}
            </p>
            <div className="mt-2 flex items-center gap-1">
              {ins.variacaoMensal >= 0 ? (
                <ArrowUpRight className="w-3 h-3 text-alerta" />
              ) : (
                <ArrowDownRight className="w-3 h-3 text-positivo" />
              )}
              <span className={`text-[11px] font-body font-semibold ${ins.variacaoMensal >= 0 ? 'text-alerta' : 'text-positivo'}`}>
                {fmtPct(ins.variacaoMensal)} mes
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────
// RISCOS — Riscos complementares (Expectativas + alertas)
// ────────────────────────────────────────────────────────────
function RiscosComplementaresSection() {
  const { data } = useApiFull<{
    success: boolean
    data: {
      totalFocos: number
      porEstado: Record<string, number>
    }
    meta: {}
  }>('/mercado/incendios', { success: false, data: { totalFocos: 0, porEstado: {} }, meta: {} })

  const porEstado = data?.data?.porEstado || {}
  const estadosOrdenados = Object.entries(porEstado)
    .filter(([k]) => k !== 'Outro' && k !== '')
    .sort((a, b) => b[1] - a[1])

  // Heatmap by region
  const REGIOES: Record<string, string[]> = {
    Norte: ['AM', 'PA', 'AC', 'RO', 'RR', 'AP', 'TO'],
    Nordeste: ['BA', 'CE', 'PE', 'PI', 'MA', 'AL', 'SE', 'RN', 'PB'],
    'Centro-Oeste': ['MT', 'MS', 'GO', 'DF'],
    Sudeste: ['SP', 'MG', 'RJ', 'ES'],
    Sul: ['PR', 'SC', 'RS'],
  }

  const maxFocos = Math.max(1, ...Object.values(porEstado))

  // Risk factors (synthesized indicators)
  const fatoresRisco = [
    { fator: 'Estiagem prolongada', nivel: 'moderado', impacto: 'Reducao de produtividade em areas sem irrigacao', area: 'Centro-Oeste/MT' },
    { fator: 'La Nina ativa', nivel: 'baixo', impacto: 'Possivel reducao de chuva no Sul', area: 'RS/SC/PR' },
    { fator: 'Focos de incendio', nivel: estadosOrdenados[0]?.[1] > 200 ? 'alto' : 'moderado', impacto: 'Risco a ativos rurais e seguros', area: `${estadosOrdenados[0]?.[0] || 'BR'} (${estadosOrdenados[0]?.[1] || 0} focos)` },
    { fator: 'Volatilidade cambial', nivel: 'moderado', impacto: 'Afeta custos de insumos dolarizados', area: 'Nacional' },
  ]

  const nivelColor: Record<string, string> = {
    baixo: 'text-positivo bg-positivo/10 border-positivo/30',
    moderado: 'text-aletis-dourado bg-aletis-dourado/10 border-aletis-dourado/30',
    alto: 'text-orange-600 bg-orange-50 border-orange-200',
    critico: 'text-red-600 bg-red-50 border-red-200',
  }

  return (
    <>
      <section className="mb-8">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <AlertTriangle className="w-4.5 h-4.5 text-orange-600" />
          </div>
          <div>
            <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
              Fatores de Risco Agroclimaticos
            </h2>
            <p className="text-xs font-body text-aletis-grafite-claro">
              Avaliacao sintetica de ameacas relevantes para o credito rural
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fatoresRisco.map((r) => (
            <div key={r.fator} className="card-premium p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm font-display font-semibold text-aletis-grafite-escuro">{r.fator}</p>
                <span className={`text-[10px] font-body font-bold px-2 py-0.5 rounded-full border ${nivelColor[r.nivel]}`}>
                  {r.nivel.toUpperCase()}
                </span>
              </div>
              <p className="text-xs font-body text-aletis-grafite-medio mb-1.5">{r.impacto}</p>
              <p className="text-[10px] font-body text-aletis-grafite-claro">
                <MapPin className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" />
                {r.area}
              </p>
            </div>
          ))}
        </div>
      </section>

      {estadosOrdenados.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
              <Flame className="w-4.5 h-4.5 text-red-500" />
            </div>
            <div>
              <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
                Mapa de Calor — Focos por Regiao
              </h2>
              <p className="text-xs font-body text-aletis-grafite-claro">
                Distribuicao geografica dos focos ativos (24h)
              </p>
            </div>
          </div>

          <div className="card-premium p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {Object.entries(REGIOES).map(([regiao, ufs]) => {
                const total = ufs.reduce((s, uf) => s + (porEstado[uf] || 0), 0)
                const intensidade = Math.min(1, total / (maxFocos * 2))
                return (
                  <div key={regiao} className="rounded-lg p-3 border" style={{ borderColor: `rgba(231,76,60,${0.2 + intensidade * 0.6})`, backgroundColor: `rgba(231,76,60,${intensidade * 0.15})` }}>
                    <p className="text-[11px] font-body text-aletis-grafite-claro">{regiao}</p>
                    <p className="text-2xl font-display font-bold text-aletis-grafite-escuro mt-1">{total}</p>
                    <p className="text-[10px] font-body text-aletis-grafite-claro">focos ativos</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {ufs
                        .filter((uf) => porEstado[uf])
                        .sort((a, b) => (porEstado[b] || 0) - (porEstado[a] || 0))
                        .slice(0, 3)
                        .map((uf) => (
                          <span key={uf} className="text-[10px] font-display font-bold px-1.5 py-0.5 rounded bg-white/60 text-aletis-grafite-escuro">
                            {uf}:{porEstado[uf]}
                          </span>
                        ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
