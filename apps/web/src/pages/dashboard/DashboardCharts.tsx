import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  ReferenceLine,
  Line,
  ComposedChart,
} from 'recharts'
import { motion } from 'framer-motion'
import { chartTheme } from '@/components/ui/foundation'

const GOLD = chartTheme.colors.accent
const GREEN = chartTheme.colors.success
const RED = chartTheme.colors.danger
const EMERALD = '#059669'
const SLATE = chartTheme.colors.tick
const STONE = '#a8a29e'
const CREAM = '#f5f5f4'
const DARK = chartTheme.colors.primary

/* ── Gradientes SVG reutilizáveis (premium, alta saturação) ── */
function Gradients() {
  return (
    <defs>
      <linearGradient id="gradGold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={GOLD} stopOpacity={0.55} />
        <stop offset="55%" stopColor={GOLD} stopOpacity={0.18} />
        <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
      </linearGradient>
      <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={GREEN} stopOpacity={0.48} />
        <stop offset="55%" stopColor={GREEN} stopOpacity={0.15} />
        <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
      </linearGradient>
      <linearGradient id="gradBarGold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#e3bd80" />
        <stop offset="100%" stopColor={GOLD} />
      </linearGradient>
      <linearGradient id="gradBarGreen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3aa170" />
        <stop offset="100%" stopColor={GREEN} />
      </linearGradient>
      <linearGradient id="gradBarRed" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ef4444" />
        <stop offset="100%" stopColor="#b91c1c" />
      </linearGradient>
      <linearGradient id="gradBarEmerald" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#047857" />
      </linearGradient>
      <filter id="dropShadowGold" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={GOLD} floodOpacity="0.22" />
      </filter>
      <filter id="dropShadowGreen" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={GREEN} floodOpacity="0.22" />
      </filter>
    </defs>
  )
}

/* ══════════════════════════════════════════════════════════
   TOOLTIP PREMIUM — container reutilizado
   ══════════════════════════════════════════════════════════ */
function TooltipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200/80 bg-white/[0.98] px-4 py-3 shadow-sm backdrop-blur-lg">
      {children}
    </div>
  )
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full mr-2"
      style={{ backgroundColor: color }}
    />
  )
}

/* ══════════════════════════════════════════════════════════
   1. PORTFOLIO AREA CHART — evolução carteira vs negociação
   ══════════════════════════════════════════════════════════ */

type TimelinePoint = {
  mes: string
  carteira: number
  negociado: number
}

export function PortfolioAreaChart({
  data,
  fmtCompact,
}: {
  data: TimelinePoint[]
  fmtCompact: (value: number) => string
}) {
  return (
    <div className="h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ left: 8, right: 20, top: 20, bottom: 0 }}
        >
          <Gradients />
          <CartesianGrid
            {...chartTheme.grid}
          />
          <XAxis
            dataKey="mes"
            tick={chartTheme.axisTick}
            axisLine={false}
            tickLine={false}
            dy={10}
          />
          <YAxis
            tickFormatter={fmtCompact}
            tick={chartTheme.axisTick}
            axisLine={false}
            tickLine={false}
            width={72}
            dx={-4}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <TooltipBox>
                  <p className="text-[11px] font-semibold text-stone-500 mb-2 uppercase tracking-wider">
                    {label}
                  </p>
                  {payload.map((p: any) => (
                    <div
                      key={p.dataKey}
                      className="flex items-center justify-between gap-6 mt-1"
                    >
                      <span className="flex items-center text-xs text-stone-600">
                        <Dot color={p.color} />
                        {p.name}
                      </span>
                      <span className="text-xs font-display font-semibold text-foreground tabular-nums">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                          maximumFractionDigits: 0,
                        }).format(Number(p.value ?? 0))}
                      </span>
                    </div>
                  ))}
                </TooltipBox>
              )
            }}
          />
          <Area
            type="monotone"
            dataKey="carteira"
            stroke={GOLD}
            strokeWidth={3}
            fill="url(#gradGold)"
            name="Carteira mapeada"
            animationDuration={1400}
            animationEasing="ease-out"
            filter="url(#dropShadowGold)"
            dot={{ r: 0 }}
            activeDot={{ r: 6, fill: GOLD, stroke: '#fff', strokeWidth: 3 }}
          />
          <Area
            type="monotone"
            dataKey="negociado"
            stroke={GREEN}
            strokeWidth={3}
            fill="url(#gradGreen)"
            name="Em negociação"
            animationDuration={1400}
            animationEasing="ease-out"
            animationBegin={300}
            filter="url(#dropShadowGreen)"
            dot={{ r: 0 }}
            activeDot={{ r: 6, fill: GREEN, stroke: '#fff', strokeWidth: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   2. CASHFLOW COMBINED — barras + linha de resultado
   ══════════════════════════════════════════════════════════ */

type FluxoPoint = {
  mes: string
  receita: number
  despesa: number
  resultado: number
  acumulado: number
}

export function CashflowCombined({
  data,
  fmtBRL,
}: {
  data: FluxoPoint[]
  fmtBRL: (value: number) => string
}) {
  const formatMonth = (str: string) => {
    if (str.includes('/')) return str.split('/').slice(0, 2).join('/')
    if (str.includes('-')) {
      const parts = str.split('-')
      return `${parts[1]}/${parts[0].slice(2)}`
    }
    return str
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatMonth(d.mes),
  }))

  return (
    <div className="h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ left: 4, right: 4, top: 20, bottom: 4 }}
          barCategoryGap="18%"
          barGap={4}
        >
          <Gradients />
          <CartesianGrid
            stroke={chartTheme.colors.grid}
            vertical={false}
            strokeDasharray="3 6"
          />
          <XAxis
            dataKey="label"
            tick={chartTheme.axisTick}
            axisLine={false}
            tickLine={false}
            dy={8}
          />
          <YAxis
            tickFormatter={(v: number) => {
              if (Math.abs(v) >= 1_000_000)
                return `${(v / 1_000_000).toFixed(0)}M`
              if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`
              return String(v)
            }}
            tick={chartTheme.axisTick}
            axisLine={false}
            tickLine={false}
            width={48}
            dx={-4}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const item = payload[0]?.payload as FluxoPoint & { label: string }
              return (
                <TooltipBox>
                  <p className="text-[11px] font-semibold text-stone-500 mb-2 uppercase tracking-wider">
                    {item.mes || label}
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-8">
                      <span className="flex items-center text-xs text-stone-600">
                        <Dot color={EMERALD} /> Receita
                      </span>
                      <span className="text-xs font-display font-semibold text-foreground tabular-nums">
                        {fmtBRL(item.receita)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-8">
                      <span className="flex items-center text-xs text-stone-600">
                        <Dot color={RED} /> Despesa
                      </span>
                      <span className="text-xs font-display font-semibold text-foreground tabular-nums">
                        {fmtBRL(item.despesa)}
                      </span>
                    </div>
                    <div className="h-px bg-stone-200 my-1.5" />
                    <div className="flex items-center justify-between gap-8">
                      <span className="text-xs text-stone-500 font-medium">
                        Resultado
                      </span>
                      <span
                        className={`text-xs font-display font-semibold tabular-nums ${item.resultado >= 0 ? 'text-emerald-700' : 'text-red-600'}`}
                      >
                        {fmtBRL(item.resultado)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-8">
                      <span className="text-xs text-stone-500 font-medium">
                        Acumulado
                      </span>
                      <span className="text-xs font-display font-semibold text-foreground tabular-nums">
                        {fmtBRL(item.acumulado)}
                      </span>
                    </div>
                  </div>
                </TooltipBox>
              )
            }}
          />
          <ReferenceLine y={0} stroke={chartTheme.colors.grid} />
          <Bar
            dataKey="receita"
            name="Receita"
            fill="url(#gradBarEmerald)"
            radius={[6, 6, 0, 0]}
            animationDuration={1200}
            animationEasing="ease-out"
          />
          <Bar
            dataKey="despesa"
            name="Despesa"
            fill="url(#gradBarRed)"
            radius={[6, 6, 0, 0]}
            animationDuration={1200}
            animationEasing="ease-out"
            animationBegin={150}
          />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-6 mt-2 pt-2 border-t border-stone-100">
        <span className="flex items-center gap-2 text-[11px] text-stone-600 font-semibold">
          <span className="h-2.5 w-2.5 rounded bg-gradient-to-b from-emerald-400 to-emerald-700" />
          Receita
        </span>
        <span className="flex items-center gap-2 text-[11px] text-stone-600 font-semibold">
          <span className="h-2.5 w-2.5 rounded bg-gradient-to-b from-red-400 to-red-700" />
          Despesa
        </span>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   LEGACY: CASHFLOW BARS — fluxo de caixa 12M (barras simples)
   ══════════════════════════════════════════════════════════ */
export function CashflowBars({
  data,
  maxFluxo,
  fmtBRL,
}: {
  data: FluxoPoint[]
  maxFluxo: number
  fmtBRL: (value: number) => string
}) {
  const formatMonth = (str: string) => {
    if (str.includes('/')) return str.split('/').slice(0, 2).join('/')
    if (str.includes('-')) {
      const parts = str.split('-')
      return `${parts[1]}/${parts[0].slice(2)}`
    }
    return str
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatMonth(d.mes),
  }))

  return (
    <div className="h-[360px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ left: 4, right: 4, top: 10, bottom: 4 }}
          barCategoryGap="22%"
          barGap={3}
        >
          <CartesianGrid
            stroke={chartTheme.colors.grid}
            vertical={false}
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="label"
            tick={chartTheme.axisTick}
            axisLine={false}
            tickLine={false}
            dy={6}
          />
          <YAxis
            tickFormatter={(v: number) => {
              if (Math.abs(v) >= 1_000_000)
                return `${(v / 1_000_000).toFixed(0)}M`
              if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`
              return String(v)
            }}
            tick={chartTheme.axisTick}
            axisLine={false}
            tickLine={false}
            width={40}
            dx={-4}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const item = payload[0]?.payload as FluxoPoint & { label: string }
              return (
                <TooltipBox>
                  <p className="text-[11px] font-semibold text-stone-500 mb-2 uppercase tracking-wider">
                    {item.mes || label}
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-8">
                      <span className="flex items-center text-xs text-stone-600">
                        <Dot color={EMERALD} /> Receita
                      </span>
                      <span className="text-xs font-display font-semibold text-foreground tabular-nums">
                        {fmtBRL(item.receita)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-8">
                      <span className="flex items-center text-xs text-stone-600">
                        <Dot color={RED} /> Despesa
                      </span>
                      <span className="text-xs font-display font-semibold text-foreground tabular-nums">
                        {fmtBRL(item.despesa)}
                      </span>
                    </div>
                    <div className="h-px bg-stone-200 my-1.5" />
                    <div className="flex items-center justify-between gap-8">
                      <span className="text-xs text-stone-500 font-medium">
                        Resultado
                      </span>
                      <span
                        className={`text-xs font-display font-semibold tabular-nums ${item.resultado >= 0 ? 'text-emerald-700' : 'text-red-600'}`}
                      >
                        {fmtBRL(item.resultado)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-8">
                      <span className="text-xs text-stone-500 font-medium">
                        Acumulado
                      </span>
                      <span className="text-xs font-display font-semibold text-foreground tabular-nums">
                        {fmtBRL(item.acumulado)}
                      </span>
                    </div>
                  </div>
                </TooltipBox>
              )
            }}
          />
          <ReferenceLine y={0} stroke={chartTheme.colors.grid} />
          <Bar
            dataKey="receita"
            name="Receita"
            fill={EMERALD}
            radius={[4, 4, 0, 0]}
            animationDuration={1200}
            animationEasing="ease-out"
            opacity={0.82}
          />
          <Bar
            dataKey="despesa"
            name="Despesa"
            fill={RED}
            radius={[4, 4, 0, 0]}
            animationDuration={1200}
            animationEasing="ease-out"
            animationBegin={200}
            opacity={0.65}
          />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-6 mt-2 pt-2 border-t border-stone-100">
        <span className="flex items-center gap-2 text-[11px] text-stone-500 font-medium">
          <span className="h-2.5 w-2.5 rounded bg-emerald-600 opacity-80" />{' '}
          Receita
        </span>
        <span className="flex items-center gap-2 text-[11px] text-stone-500 font-medium">
          <span className="h-2.5 w-2.5 rounded bg-red-600 opacity-65" />{' '}
          Despesa
        </span>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   3. PIPELINE DONUT — distribuição do pipeline com label central
   ══════════════════════════════════════════════════════════ */

type PipelinePoint = {
  name: string
  value: number
  color: string
}

export function PipelineDonut({ data }: { data: PipelinePoint[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="flex flex-col items-center">
      <div className="h-[300px] w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              <filter id="donutShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor={DARK} floodOpacity="0.12" />
              </filter>
            </defs>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={78}
              outerRadius={118}
              paddingAngle={3}
              stroke="#fff"
              strokeWidth={3}
              cornerRadius={6}
              animationDuration={1200}
              animationEasing="ease-out"
              filter="url(#donutShadow)"
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0]
                const pct =
                  total > 0 ? ((p.value as number) / total) * 100 : 0
                return (
                  <TooltipBox>
                    <p className="text-xs font-semibold text-foreground">
                      {p.name}
                    </p>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      {p.value} cliente{p.value !== 1 ? 's' : ''} ·{' '}
                      {pct.toFixed(1)}%
                    </p>
                  </TooltipBox>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Label central */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[11px] text-stone-400 font-display font-semibold uppercase tracking-[0.2em]">Total</span>
          <span className="text-3xl font-display font-semibold text-foreground tabular-nums mt-1">
            {total}
          </span>
          <span className="text-[11px] text-stone-400 mt-0.5">clientes</span>
        </div>
      </div>

      {/* Legendas premium */}
      <div className="w-full grid grid-cols-2 gap-x-4 gap-y-2.5 mt-2">
        {data.map((s) => {
          const pct = total > 0 ? ((s.value / total) * 100).toFixed(1) : '0'
          return (
            <div
              key={s.name}
              className="flex items-center justify-between group"
            >
              <span className="inline-flex items-center gap-2 text-xs text-stone-600">
                <span
                  className="h-2.5 w-2.5 rounded-full ring-2 ring-white transition-transform group-hover:scale-110"
                  style={{ backgroundColor: s.color }}
                />
                <span className="truncate">{s.name}</span>
              </span>
              <span className="text-[11px] font-display font-semibold text-foreground tabular-nums ml-1">
                {s.value}
                <span className="text-stone-400 font-normal ml-0.5">
                  ({pct}%)
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   4. CREDITOR EXPOSURE CHART — barras horizontais premium
   ══════════════════════════════════════════════════════════ */

type CredorPoint = {
  credor: string
  valor: number
}

export function CreditorExposureChart({
  data,
  total,
  fmtCompact,
}: {
  data: CredorPoint[]
  total: number
  fmtCompact: (value: number) => string
}) {
  const top = data[0]
  const topPct = top && total > 0 ? (top.valor / total) * 100 : 0

  const chartData = data.map((d) => ({
    ...d,
    shortCredor:
      d.credor.length > 18 ? d.credor.slice(0, 16) + '…' : d.credor,
  }))

  return (
    <div className="flex flex-col h-full">
      {/* Card de destaque */}
      <div className="mb-4 rounded-xl border border-aletis-gold/15 bg-gradient-to-br from-aletis-gold/[0.05] to-aletis-gold/[0.01] p-4">
        <p className="text-[11px] font-display font-semibold uppercase tracking-[0.18em] text-aletis-gold-escuro">
          Maior concentração
        </p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <p className="truncate text-sm font-semibold text-foreground">
            {top?.credor || 'Não informado'}
          </p>
          <p className="font-display text-xl font-bold text-foreground tracking-tight tabular-nums">
            {topPct.toFixed(0)}%
          </p>
        </div>
        <p className="mt-1 text-[11px] text-stone-500">
          {top ? fmtCompact(top.valor) : 'Sem exposição registrada'}
        </p>
        <div className="mt-2.5 h-1.5 rounded-full bg-stone-200/60 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${topPct}%` }}
            transition={{
              duration: 0.9,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.15,
            }}
            className="h-full rounded-full"
            style={{
              background: 'linear-gradient(90deg, #cb9d52, #e3bd80)',
            }}
          />
        </div>
      </div>

      <div className="flex-1 min-h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 0, right: 24, top: 4, bottom: 4 }}
            barCategoryGap="16%"
          >
            <Gradients />
            <CartesianGrid
              stroke={chartTheme.colors.grid}
              horizontal={false}
              strokeDasharray="3 6"
            />
            <XAxis
              type="number"
              tickFormatter={fmtCompact}
              tick={chartTheme.axisTick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              dataKey="shortCredor"
              type="category"
              width={104}
              tick={chartTheme.axisTick}
              axisLine={false}
              tickLine={false}
              dx={-6}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0]
                const original = chartData.find(
                  (d) => d.shortCredor === p.payload.shortCredor,
                )
                return (
                  <TooltipBox>
                    <p className="text-xs font-semibold text-foreground">
                      {original?.credor || p.payload.credor}
                    </p>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      {fmtCompact(Number(p.value ?? 0))}
                    </p>
                  </TooltipBox>
                )
              }}
            />
            <Bar
              dataKey="valor"
              radius={[0, 10, 10, 0]}
              animationDuration={1200}
              animationEasing="ease-out"
              fill="url(#gradBarGold)"
              filter="url(#dropShadowGold)"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   5. HEALTH RADAR — mini área chart para saúde da carteira
   ══════════════════════════════════════════════════════════ */
type HealthPoint = {
  name: string
  score: number
}

export function HealthRadar({
  data,
}: {
  data: HealthPoint[]
}) {
  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ left: 0, right: 0, top: 16, bottom: 0 }}
        >
          <defs>
            <linearGradient id="gradHealth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GREEN} stopOpacity={0.55} />
              <stop offset="60%" stopColor={GREEN} stopOpacity={0.12} />
              <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
            </linearGradient>
            <filter id="dropShadowHealth" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={GREEN} floodOpacity="0.25" />
            </filter>
          </defs>
          <CartesianGrid
            stroke={chartTheme.colors.grid}
            vertical={false}
            strokeDasharray="3 6"
          />
          <XAxis
            dataKey="name"
            tick={chartTheme.axisTick}
            axisLine={false}
            tickLine={false}
            dy={6}
          />
          <YAxis
            domain={[0, 100]}
            hide
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const val = Number(payload[0].value ?? 0)
              const color = val < 45 ? RED : val < 65 ? GOLD : GREEN
              return (
                <TooltipBox>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs font-semibold text-foreground">
                      {label}
                    </span>
                    <span
                      className="text-xs font-display font-semibold tabular-nums ml-1"
                      style={{ color }}
                    >
                      {val}/100
                    </span>
                  </div>
                </TooltipBox>
              )
            }}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke={GREEN}
            strokeWidth={3}
            fill="url(#gradHealth)"
            animationDuration={1200}
            animationEasing="ease-out"
            filter="url(#dropShadowHealth)"
            dot={(props: any) => {
              const val = Number(props.value ?? 0)
              const color = val < 45 ? RED : val < 65 ? GOLD : GREEN
              return (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={5}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={2.5}
                />
              )
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
