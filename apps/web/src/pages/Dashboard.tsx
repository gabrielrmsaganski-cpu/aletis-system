import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi, useApiFull } from '../hooks/useApi'
import { DataSourceBadge } from '../components/DataSourceBadge'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  Users,
  TrendingUp,
  DollarSign,
  Target,
  Calendar,
  AlertTriangle,
  BarChart3,
  Clock,
  ArrowUpRight,
  ChevronRight,
  Wheat,
  CloudRain,
  CheckCircle2,
  FileText,
  Handshake,
  UserPlus,
  Send,
} from 'lucide-react'

// ────────────────────────────────────────────────────────────
// Currency Formatter
// ────────────────────────────────────────────────────────────
const formatBRL = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatBRLCompact = (value: number): string => {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`
  return formatBRL(value)
}

// ────────────────────────────────────────────────────────────
// Animated Counter Hook
// ────────────────────────────────────────────────────────────
function useAnimatedValue(
  target: number,
  duration = 1800,
  delay = 0,
  decimals = 0
): number {
  const [value, setValue] = useState(0)
  const startTime = useRef<number | null>(null)
  const rafId = useRef<number>(0)

  useEffect(() => {
    const timeout = setTimeout(() => {
      const animate = (timestamp: number) => {
        if (startTime.current === null) startTime.current = timestamp
        const elapsed = timestamp - startTime.current
        const progress = Math.min(elapsed / duration, 1)
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3)
        const current = eased * target
        setValue(Number(current.toFixed(decimals)))
        if (progress < 1) {
          rafId.current = requestAnimationFrame(animate)
        }
      }
      rafId.current = requestAnimationFrame(animate)
    }, delay)

    return () => {
      clearTimeout(timeout)
      cancelAnimationFrame(rafId.current)
    }
  }, [target, duration, delay, decimals])

  return value
}

// ────────────────────────────────────────────────────────────
// Staggered Mount Animation Hook
// ────────────────────────────────────────────────────────────
function useStaggeredMount(count: number, stagger = 120): boolean[] {
  const [visible, setVisible] = useState<boolean[]>(Array(count).fill(false))

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = []
    for (let i = 0; i < count; i++) {
      timeouts.push(
        setTimeout(() => {
          setVisible(prev => {
            const next = [...prev]
            next[i] = true
            return next
          })
        }, i * stagger)
      )
    }
    return () => timeouts.forEach(clearTimeout)
  }, [count, stagger])

  return visible
}

// ────────────────────────────────────────────────────────────
// Circular Progress Component
// ────────────────────────────────────────────────────────────
function CircularProgress({
  percentage,
  size = 56,
  strokeWidth = 5,
  color = '#0F4C35',
}: {
  percentage: number
  size?: number
  strokeWidth?: number
  color?: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const [offset, setOffset] = useState(circumference)

  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(circumference - (percentage / 100) * circumference)
    }, 300)
    return () => clearTimeout(timer)
  }, [percentage, circumference])

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#E2DDD5"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-[1.5s] ease-out"
      />
    </svg>
  )
}

// ────────────────────────────────────────────────────────────
// Static Data
// ────────────────────────────────────────────────────────────
const portfolioData = [
  { mes: 'Jan', valor: 850000 },
  { mes: 'Fev', valor: 1200000 },
  { mes: 'Mar', valor: 980000 },
  { mes: 'Abr', valor: 1450000 },
  { mes: 'Mai', valor: 1680000 },
  { mes: 'Jun', valor: 1320000 },
  { mes: 'Jul', valor: 1550000 },
  { mes: 'Ago', valor: 1890000 },
  { mes: 'Set', valor: 2100000 },
  { mes: 'Out', valor: 1750000 },
  { mes: 'Nov', valor: 2350000 },
  { mes: 'Dez', valor: 2380000 },
]

const stageData = [
  { name: 'Lead', value: 8, color: '#0A3526' },
  { name: 'Qualificacao', value: 5, color: '#0F4C35' },
  { name: 'Analise', value: 4, color: '#1B6B4A' },
  { name: 'Proposta', value: 6, color: '#2A8F64' },
  { name: 'Negociacao', value: 3, color: '#27AE60' },
  { name: 'Acordo', value: 4, color: '#C9A84C' },
  { name: 'Concluido', value: 12, color: '#A68A3A' },
]

const recentActivity = [
  {
    id: 1,
    type: 'proposta' as const,
    icon: Send,
    description: 'Proposta enviada para Ailton Caeiro',
    detail: 'R$ 1,2M em dívidas analisadas',
    time: '2h atrás',
    color: 'bg-aletis-dourado',
  },
  {
    id: 2,
    type: 'acordo' as const,
    icon: Handshake,
    description: 'Acordo fechado: Maria Santos',
    detail: 'Economia de R$ 450K para o cliente',
    time: '5h atrás',
    color: 'bg-positivo',
  },
  {
    id: 3,
    type: 'lead' as const,
    icon: UserPlus,
    description: 'Novo lead: João Silva — Uberaba/MG',
    detail: 'Indicação via parceiro Sicoob',
    time: 'ontem',
    color: 'bg-blue-500',
  },
  {
    id: 4,
    type: 'documento' as const,
    icon: FileText,
    description: 'Documentos recebidos: Fazenda Boa Vista',
    detail: '12 contratos para análise',
    time: 'ontem',
    color: 'bg-blue-500',
  },
  {
    id: 5,
    type: 'acordo' as const,
    icon: CheckCircle2,
    description: 'Pagamento confirmado: Roberto Almeida',
    detail: 'Parcela 3/12 — R$ 85K',
    time: '2 dias',
    color: 'bg-positivo',
  },
  {
    id: 6,
    type: 'proposta' as const,
    icon: Send,
    description: 'Proposta gerada: Carlos Mendes',
    detail: 'Revisão pendente — R$ 780K',
    time: '3 dias',
    color: 'bg-aletis-dourado',
  },
]

const pipelineData = {
  analise: {
    label: 'Análise',
    count: 4,
    items: [
      { nome: 'Pedro Henrique', valor: 320000 },
      { nome: 'Fazenda Sol Nascente', valor: 890000 },
      { nome: 'Coop. Agrícola MT', valor: 1200000 },
    ],
  },
  proposta: {
    label: 'Proposta',
    count: 6,
    items: [
      { nome: 'Ailton Caeiro', valor: 1200000 },
      { nome: 'Carlos Mendes', valor: 780000 },
      { nome: 'Agro Triângulo Ltda.', valor: 560000 },
    ],
  },
  negociacao: {
    label: 'Negociação',
    count: 3,
    items: [
      { nome: 'Maria Santos', valor: 450000 },
      { nome: 'Granja Esperança', valor: 670000 },
    ],
  },
  acordo: {
    label: 'Acordo',
    count: 4,
    items: [
      { nome: 'Roberto Almeida', valor: 1020000 },
      { nome: 'Faz. Três Irmãos', valor: 340000 },
      { nome: 'José Moreira', valor: 510000 },
    ],
  },
}

const proximosVencimentos = [
  { cliente: 'Roberto Almeida', valor: 85000, dias: 3, data: '19/04/2026' },
  { cliente: 'Maria Santos', valor: 62000, dias: 12, data: '28/04/2026' },
  { cliente: 'Faz. Três Irmãos', valor: 45000, dias: 25, data: '11/05/2026' },
  { cliente: 'José Moreira', valor: 120000, dias: 38, data: '24/05/2026' },
]

// alertasMercado will be dynamically computed inside the component using real indicator values

const metasMes = [
  { label: 'Propostas Enviadas', atual: 8, meta: 10 },
  { label: 'Acordos Fechados', atual: 4, meta: 6 },
  { label: 'Volume Negociado', atual: 2100000, meta: 3000000, isCurrency: true },
]

// ────────────────────────────────────────────────────────────
// Custom Tooltip for Area Chart
// ────────────────────────────────────────────────────────────
function PortfolioTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-aletis-grafite-escuro text-white px-4 py-3 rounded-xl shadow-xl border border-white/10">
      <p className="text-xs text-white/60 font-body mb-1">{label}</p>
      <p className="text-base font-display font-semibold text-aletis-dourado-suave">
        {formatBRL(payload[0].value)}
      </p>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Custom Tooltip for Pie Chart
// ────────────────────────────────────────────────────────────
function StageTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-aletis-grafite-escuro text-white px-4 py-3 rounded-xl shadow-xl border border-white/10">
      <p className="text-xs text-white/60 font-body mb-1">{payload[0].name}</p>
      <p className="text-base font-display font-semibold">
        {payload[0].value} clientes
      </p>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// MAIN DASHBOARD COMPONENT
// ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()

  // API connection status
  const { data: healthData, error: healthError } = useApi<{ status: string }>('/health', { status: 'unknown' })
  const { data: clientesData } = useApi<any[]>('/clientes', [])

  // Real market indicators from BCB
  interface IndicadorApi { nome: string; sigla: string; valor: number; unidade: string; fonteOrigem?: string; historico?: { data: string; valor: number }[] }
  interface IndicadoresMeta { fonteOrigem?: string; detalhe?: string; atualizacao?: string }
  const { data: indicadoresResp } = useApiFull<{ data: IndicadorApi[]; meta: IndicadoresMeta }>(
    '/mercado/indicadores', { data: [], meta: {} }
  )
  const indicadores = indicadoresResp?.data || []
  const indicadoresMeta = indicadoresResp?.meta || {}

  // Fire hotspots and fuel prices for alerts
  const { data: incendiosResp } = useApiFull<{ data: { totalFocos: number; porEstado: Record<string, number>; fonte: string } }>('/mercado/incendios', { data: { totalFocos: 0, porEstado: {}, fonte: '' } })
  const incendios = incendiosResp?.data
  const { data: combustiveisResp } = useApiFull<{ data: { diesel: { precoMedio: number; fonte: string } } }>('/mercado/combustiveis/diesel', { data: { diesel: { precoMedio: 0, fonte: '' } } })
  const dieselNacional = combustiveisResp?.data?.diesel

  const apiOnline = !healthError && healthData?.status === 'ok'
  const dataFonteOrigem: 'api' | 'cache' | 'fallback' =
    (indicadoresMeta.fonteOrigem as any) === 'api' ? 'api' :
    (indicadoresMeta.fonteOrigem as any) === 'cache' ? 'cache' :
    apiOnline ? 'cache' : 'fallback'

  // Extract key indicators for display
  const selicValor = indicadores.find(i => i.sigla === 'SELIC')?.valor
  const ptaxValor = indicadores.find(i => i.sigla === 'USD/BRL')?.valor
  const ipcaValor = indicadores.find(i => i.sigla === 'IPCA')?.valor

  // Derive KPI values from API when available
  const kpiValues = useMemo(() => {
    if (clientesData.length > 0) {
      const totalClientes = clientesData.length
      const totalDivida = clientesData.reduce((s: number, c: any) => s + (c.valorTotalDivida || 0), 0)
      const totalPago = clientesData.reduce((s: number, c: any) => s + (c.valorTotalPago || 0), 0)
      const emProgresso = clientesData.filter((c: any) => ['acordo', 'concluido', 'acompanhamento', 'proposta', 'negociacao'].includes(c.estagio)).length
      return {
        clientes: totalClientes,
        volume: totalDivida,
        economia: totalPago > totalDivida ? totalPago - totalDivida : totalDivida * 0.22,
        conversao: totalClientes > 0 ? (emProgresso / totalClientes) * 100 : 76.3,
      }
    }
    return { clientes: 23, volume: 18500000, economia: 4200000, conversao: 76.3 }
  }, [clientesData])

  // Dynamic market alerts using real indicator values
  const alertasMercado = useMemo(() => {
    const alerts: { icon: React.ElementType; titulo: string; descricao: string; tipo: 'positivo' | 'ambar' | 'alerta' }[] = [
      {
        icon: TrendingUp,
        titulo: selicValor ? `Selic em ${selicValor.toFixed(2).replace('.', ',')}% a.a.` : 'Selic em 14,75%',
        descricao: selicValor && selicValor > 14
          ? `Taxa elevada encarece credito rural. Demanda por renegociacao em alta. ${ipcaValor ? `IPCA mensal: ${ipcaValor.toFixed(2).replace('.', ',')}%.` : ''}`
          : 'COPOM pode iniciar ciclo de corte. Monitorar impacto nos recalculos de dividas rurais.',
        tipo: 'ambar' as const,
      },
      {
        icon: Wheat,
        titulo: ptaxValor ? `Dolar PTAX a R$ ${ptaxValor.toFixed(2).replace('.', ',')}` : 'Soja CBOT em alta',
        descricao: ptaxValor
          ? `Exportadores favorecidos. Oportunidade para hedge de clientes com colheita proxima.`
          : '+3,2% na semana. Oportunidade para hedge de clientes com colheita proxima.',
        tipo: 'positivo' as const,
      },
    ]

    // Dynamic fire alert
    if (incendios && incendios.totalFocos > 0) {
      const topEstados = Object.entries(incendios.porEstado)
        .filter(([k]) => k !== 'Outro')
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([uf]) => uf)
        .join(', ')
      const tipo = incendios.totalFocos > 500 ? 'alerta' as const : 'ambar' as const
      alerts.push({
        icon: AlertTriangle,
        titulo: `${incendios.totalFocos.toLocaleString('pt-BR')} focos de incendio (24h)`,
        descricao: `Satelite NASA VIIRS detectou focos ativos. Maiores concentracoes: ${topEstados}. Monitorar propriedades de clientes nessas regioes.`,
        tipo,
      })
    }

    // Dynamic fuel alert
    if (dieselNacional && dieselNacional.precoMedio > 0) {
      alerts.push({
        icon: DollarSign,
        titulo: `Diesel S10: R$ ${dieselNacional.precoMedio.toFixed(2).replace('.', ',')}/L`,
        descricao: `Preco medio nacional do diesel (ANP). Custos de frete e operacao impactam margem dos produtores rurais.`,
        tipo: dieselNacional.precoMedio > 7 ? 'ambar' as const : 'positivo' as const,
      })
    }

    return alerts
  }, [selicValor, ptaxValor, ipcaValor, incendios, dieselNacional])

  // Animated KPI values
  const clientesAtivos = useAnimatedValue(kpiValues.clientes, 1600, 200)
  const volumeNegociado = useAnimatedValue(kpiValues.volume, 2000, 400)
  const economiaGerada = useAnimatedValue(kpiValues.economia, 2000, 600)
  const taxaConversao = useAnimatedValue(kpiValues.conversao, 1800, 800, 1)

  // Staggered card animations
  const kpiVisible = useStaggeredMount(4, 150)
  const sectionVisible = useStaggeredMount(6, 200)

  // Greeting based on time of day
  const getGreeting = useCallback(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Bom dia'
    if (hour < 18) return 'Boa tarde'
    return 'Boa noite'
  }, [])

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="min-h-screen bg-aletis-bege">
      {/* ── Page Header ─────────────────────────────────────── */}
      <header className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h1 className="text-3xl lg:text-4xl font-display font-bold text-aletis-grafite-escuro tracking-tight">
              {getGreeting()}, Christian
            </h1>
            <p className="text-aletis-grafite-claro font-body mt-1 text-sm capitalize">
              {today}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DataSourceBadge
              fonteOrigem={dataFonteOrigem}
              fonte={indicadoresMeta.detalhe}
              atualizacao={indicadoresMeta.atualizacao}
            />
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════
           SECTION 1 — KPI CARDS
           ═══════════════════════════════════════════════════════ */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {/* Clientes Ativos */}
        <div
          className={`card-premium p-6 group cursor-default transition-all duration-500 ${
            kpiVisible[0] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-positivo/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <Users className="w-6 h-6 text-positivo" />
            </div>
            <span className="badge-verde text-[11px]">
              <ArrowUpRight className="w-3 h-3 mr-1" />
              +3 este mes
            </span>
          </div>
          <p className="text-4xl font-display font-bold text-aletis-grafite-escuro leading-none">
            {clientesAtivos}
          </p>
          <p className="text-sm font-body text-aletis-grafite-claro mt-2">
            Clientes Ativos
          </p>
        </div>

        {/* Volume Negociado */}
        <div
          className={`card-premium p-6 group cursor-default transition-all duration-500 ${
            kpiVisible[1] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-aletis-dourado/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <TrendingUp className="w-6 h-6 text-aletis-dourado" />
            </div>
            <span className="badge-dourado text-[11px]">
              <ArrowUpRight className="w-3 h-3 mr-1" />
              +12% vs mês anterior
            </span>
          </div>
          <p className="text-4xl font-display font-bold text-aletis-grafite-escuro leading-none">
            {formatBRLCompact(volumeNegociado)}
          </p>
          <p className="text-sm font-body text-aletis-grafite-claro mt-2">
            Volume Negociado
          </p>
        </div>

        {/* Economia Gerada */}
        <div
          className={`card-premium p-6 group cursor-default transition-all duration-500 ${
            kpiVisible[2] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-positivo/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <DollarSign className="w-6 h-6 text-positivo" />
            </div>
            <span className="badge-verde text-[11px]">
              <ArrowUpRight className="w-3 h-3 mr-1" />
              +8% vs mês anterior
            </span>
          </div>
          <p className="text-4xl font-display font-bold text-aletis-grafite-escuro leading-none">
            {formatBRLCompact(economiaGerada)}
          </p>
          <p className="text-sm font-body text-aletis-grafite-claro mt-2">
            Economia Gerada
          </p>
        </div>

        {/* Taxa de Conversão */}
        <div
          className={`card-premium p-6 group cursor-default transition-all duration-500 ${
            kpiVisible[3] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="relative w-14 h-14 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <CircularProgress percentage={taxaConversao} size={56} color="#0F4C35" />
              <Target className="w-5 h-5 text-aletis-verde absolute" />
            </div>
            <span className="badge-verde text-[11px]">
              <ArrowUpRight className="w-3 h-3 mr-1" />
              +2,1 p.p.
            </span>
          </div>
          <p className="text-4xl font-display font-bold text-aletis-grafite-escuro leading-none">
            {taxaConversao.toFixed(1).replace('.', ',')}%
          </p>
          <p className="text-sm font-body text-aletis-grafite-claro mt-2">
            Taxa de Conversao
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
           SECTION 2 — CHARTS ROW
           ═══════════════════════════════════════════════════════ */}
      <section
        className={`grid grid-cols-1 lg:grid-cols-5 gap-5 mb-8 transition-all duration-700 ${
          sectionVisible[0] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        {/* Area Chart — Portfolio Evolution */}
        <div className="card-premium p-6 lg:col-span-3">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
                Evolucao do Portfolio
              </h2>
              <p className="text-xs font-body text-aletis-grafite-claro mt-0.5">
                Volume negociado mensal — ultimos 12 meses
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-body text-aletis-grafite-claro">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded bg-aletis-dourado inline-block" />
                Volume
              </span>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={portfolioData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradientVerde" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0F4C35" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0F4C35" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD5" vertical={false} />
                <XAxis
                  dataKey="mes"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6B6B6B', fontSize: 12, fontFamily: 'Inter' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6B6B6B', fontSize: 11, fontFamily: 'Inter' }}
                  tickFormatter={(v) => formatBRLCompact(v)}
                  width={70}
                />
                <Tooltip content={<PortfolioTooltip />} />
                <Area
                  type="monotone"
                  dataKey="valor"
                  stroke="#C9A84C"
                  strokeWidth={2.5}
                  fill="url(#gradientVerde)"
                  animationDuration={2000}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut Chart — Distribution by Stage */}
        <div className="card-premium p-6 lg:col-span-2">
          <div className="mb-6">
            <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
              Distribuicao por Estagio
            </h2>
            <p className="text-xs font-body text-aletis-grafite-claro mt-0.5">
              Clientes por fase do funil
            </p>
          </div>
          <div className="h-52 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stageData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  animationDuration={1500}
                  animationEasing="ease-out"
                  stroke="none"
                >
                  {stageData.map((entry, i) => (
                    <Cell key={`cell-${i}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<StageTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-4">
            {stageData.map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-xs font-body">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-aletis-grafite-claro truncate">{s.name}</span>
                <span className="ml-auto font-semibold text-aletis-grafite-escuro">
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
           SECTION 3 — ACTIVITY + PIPELINE
           ═══════════════════════════════════════════════════════ */}
      <section
        className={`grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8 transition-all duration-700 ${
          sectionVisible[1] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        {/* Recent Activity Timeline */}
        <div className="card-premium p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
                Atividade Recente
              </h2>
              <p className="text-xs font-body text-aletis-grafite-claro mt-0.5">
                Ultimos eventos do sistema
              </p>
            </div>
            <button onClick={() => navigate('/crm')} className="text-xs font-body text-aletis-verde hover:text-aletis-verde-claro transition-colors flex items-center gap-1">
              Ver tudo <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-0">
            {recentActivity.map((event, i) => {
              const Icon = event.icon
              return (
                <div
                  key={event.id}
                  className="flex items-start gap-4 py-3.5 group hover:bg-aletis-bege/50 -mx-3 px-3 rounded-xl transition-colors duration-200"
                >
                  {/* Timeline dot + line */}
                  <div className="relative flex flex-col items-center">
                    <div
                      className={`w-9 h-9 rounded-lg ${event.color} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-200`}
                    >
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    {i < recentActivity.length - 1 && (
                      <div className="w-px h-full bg-aletis-borda absolute top-10 left-1/2 -translate-x-1/2" />
                    )}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-body font-medium text-aletis-grafite-escuro leading-tight">
                      {event.description}
                    </p>
                    <p className="text-xs font-body text-aletis-grafite-claro mt-0.5 truncate">
                      {event.detail}
                    </p>
                  </div>
                  {/* Time */}
                  <span className="text-[11px] font-body text-aletis-grafite-claro whitespace-nowrap flex-shrink-0 mt-0.5">
                    <Clock className="w-3 h-3 inline mr-1 -mt-px" />
                    {event.time}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Pipeline Mini Kanban */}
        <div className="card-premium p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
                Pipeline de Negociacao
              </h2>
              <p className="text-xs font-body text-aletis-grafite-claro mt-0.5">
                Visao geral do funil ativo
              </p>
            </div>
            <button onClick={() => navigate('/crm')} className="text-xs font-body text-aletis-verde hover:text-aletis-verde-claro transition-colors flex items-center gap-1">
              Abrir CRM <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(pipelineData).map(([key, stage]) => (
              <div key={key} className="space-y-2">
                {/* Column header */}
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider">
                    {stage.label}
                  </h3>
                  <span className="w-5 h-5 rounded-md bg-aletis-verde/10 text-aletis-verde text-[10px] font-bold flex items-center justify-center">
                    {stage.count}
                  </span>
                </div>
                {/* Cards */}
                <div className="space-y-1.5">
                  {stage.items.map((item, i) => (
                    <div
                      key={i}
                      className="bg-white border border-aletis-borda rounded-lg p-2.5 hover:border-aletis-verde/40 hover:shadow-sm transition-all duration-200 cursor-pointer group/card"
                    >
                      <p className="text-xs font-body font-medium text-aletis-grafite-escuro leading-tight truncate group-hover/card:text-aletis-verde transition-colors">
                        {item.nome}
                      </p>
                      <p className="text-[11px] font-body text-aletis-grafite-claro mt-0.5">
                        {formatBRLCompact(item.valor)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
           SECTION 4 — QUICK ACCESS CARDS
           ═══════════════════════════════════════════════════════ */}
      <section
        className={`grid grid-cols-1 md:grid-cols-3 gap-5 transition-all duration-700 ${
          sectionVisible[2] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        {/* Proximos Vencimentos */}
        <div className="card-premium p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-alerta/10 flex items-center justify-center">
                <Calendar className="w-4.5 h-4.5 text-alerta" />
              </div>
              <h2 className="text-base font-display font-semibold text-aletis-grafite-escuro">
                Proximos Vencimentos
              </h2>
            </div>
          </div>

          <div className="space-y-3">
            {proximosVencimentos.map((v, i) => {
              const urgency =
                v.dias <= 7 ? 'alerta' : v.dias <= 30 ? 'ambar' : 'normal'
              return (
                <div
                  key={i}
                  className="flex items-center justify-between py-2.5 px-3 -mx-1 rounded-xl hover:bg-aletis-bege/50 transition-colors duration-200 group cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-body font-medium text-aletis-grafite-escuro truncate group-hover:text-aletis-verde transition-colors">
                      {v.cliente}
                    </p>
                    <p className="text-xs font-body text-aletis-grafite-claro mt-0.5">
                      {formatBRL(v.valor)} — {v.data}
                    </p>
                  </div>
                  <span
                    className={`badge text-[11px] flex-shrink-0 ml-2 ${
                      urgency === 'alerta'
                        ? 'bg-alerta/10 text-alerta'
                        : urgency === 'ambar'
                        ? 'bg-ambar/10 text-ambar'
                        : 'bg-aletis-verde/10 text-aletis-verde'
                    }`}
                  >
                    {v.dias}d
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Alertas de Mercado */}
        <div className="card-premium p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-ambar/10 flex items-center justify-center">
                <AlertTriangle className="w-4.5 h-4.5 text-ambar" />
              </div>
              <h2 className="text-base font-display font-semibold text-aletis-grafite-escuro">
                Alertas de Mercado
              </h2>
            </div>
          </div>

          <div className="space-y-4">
            {alertasMercado.map((alerta, i) => {
              const Icon = alerta.icon
              const borderColor =
                alerta.tipo === 'positivo'
                  ? 'border-l-positivo'
                  : alerta.tipo === 'ambar'
                  ? 'border-l-ambar'
                  : 'border-l-alerta'
              return (
                <div
                  key={i}
                  className={`border-l-[3px] ${borderColor} pl-3 py-1 hover:bg-aletis-bege/50 -mx-1 px-4 rounded-r-lg transition-colors duration-200 cursor-pointer`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-3.5 h-3.5 text-aletis-grafite-medio flex-shrink-0" />
                    <p className="text-sm font-body font-semibold text-aletis-grafite-escuro">
                      {alerta.titulo}
                    </p>
                  </div>
                  <p className="text-xs font-body text-aletis-grafite-claro leading-relaxed">
                    {alerta.descricao}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Metas do Mes */}
        <div className="card-premium p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-aletis-verde/10 flex items-center justify-center">
                <BarChart3 className="w-4.5 h-4.5 text-aletis-verde" />
              </div>
              <h2 className="text-base font-display font-semibold text-aletis-grafite-escuro">
                Metas do Mes
              </h2>
            </div>
            <span className="text-xs font-body text-aletis-grafite-claro">Abril 2026</span>
          </div>

          <div className="space-y-5">
            {metasMes.map((m, i) => {
              const pct = Math.min((m.atual / m.meta) * 100, 100)
              const barColor = pct >= 80 ? 'bg-positivo' : pct >= 50 ? 'bg-aletis-dourado' : 'bg-ambar'
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-body font-medium text-aletis-grafite-escuro">
                      {m.label}
                    </p>
                    <p className="text-xs font-body text-aletis-grafite-claro">
                      {m.isCurrency
                        ? `${formatBRLCompact(m.atual)} / ${formatBRLCompact(m.meta)}`
                        : `${m.atual} / ${m.meta}`}
                    </p>
                  </div>
                  <div className="w-full h-2.5 bg-aletis-borda/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${barColor} transition-all duration-[1.5s] ease-out`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[11px] font-body text-aletis-grafite-claro mt-1 text-right">
                    {pct.toFixed(0)}%
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Bottom spacer */}
      <div className="h-8" />
    </div>
  )
}
