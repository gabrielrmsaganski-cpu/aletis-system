import { chartTheme } from '../../components/ui/foundation'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import type {
  ValueType,
  NameType,
} from 'recharts/types/component/DefaultTooltipContent'

const CHART_PALETTE = chartTheme.palette

const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    v,
  )

const fmtNum = (v: number, decimals = 2): string =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v)

function PriceTooltip({
  active,
  payload,
  label,
}: TooltipProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-white/10 bg-aletis-grafite-escuro px-4 py-3 text-white shadow-xl">
      <p className="mb-1 text-xs text-white/60 font-body">{label}</p>
      <p className="text-base font-display font-semibold text-aletis-dourado-suave">
        {fmtBRL(Number(payload[0].value ?? 0))}
      </p>
    </div>
  )
}

export function SparklineChart({
  data,
  color,
}: {
  data: { v: number }[]
  color: string
}) {
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 2, right: 0, left: 0, bottom: 2 }}
        >
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

export function CommodityPriceHistoryChart({
  data,
}: {
  data: { date: string; price: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
      >
        <defs>
          <linearGradient id="gradientCommodity" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#17251b" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#17251b" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={chartTheme.colors.grid}
          vertical={false}
        />
        <XAxis
          dataKey="date"
          axisLine={false}
          tickLine={false}
          tick={{ fill: chartTheme.colors.tick, fontSize: 10, fontFamily: 'Inter' }}
          interval={30}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: chartTheme.colors.tick, fontSize: 11, fontFamily: 'Inter' }}
          tickFormatter={(v) => `R$${fmtNum(Number(v), 0)}`}
          width={75}
          domain={['auto', 'auto']}
        />
        <Tooltip
          content={<PriceTooltip />}
          wrapperStyle={{ outline: 'none' }}
          cursor={{ stroke: '#cb9d52', strokeWidth: 1, strokeDasharray: '3 3' }}
        />
        <Area
          type="monotone"
          dataKey="price"
          stroke={chartTheme.colors.accent}
          strokeWidth={2}
          fill="url(#gradientCommodity)"
          animationDuration={1500}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function SazonalidadeBarChart({
  data,
  mesAtual,
}: {
  data: { mes: string; indice: number; destacar: boolean }[]
  mesAtual: number
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.colors.grid} />
        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
        <YAxis domain={[90, 115]} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) => `${v} (base 100)`} />
        <Bar dataKey="indice" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={
                i === mesAtual
                  ? '#cb9d52'
                  : i < mesAtual
                    ? '#d1d5db'
                    : '#17251b'
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function GraosComparisonChart({
  data,
  periodo,
  selecionadas,
  commodities,
}: {
  data: Record<string, any>[]
  periodo: number
  selecionadas: string[]
  commodities: any[]
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={chartTheme.colors.grid}
          vertical={false}
        />
        <XAxis
          dataKey="date"
          axisLine={false}
          tickLine={false}
          tick={{ fill: chartTheme.colors.tick, fontSize: 10 }}
          interval={Math.max(1, Math.floor(periodo / 8))}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: chartTheme.colors.tick, fontSize: 11 }}
          tickFormatter={(v) => `${v}`}
          domain={['auto', 'auto']}
          width={50}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#FFF',
            border: '1px solid #E2DDD5',
            borderRadius: 8,
            fontSize: 11,
          }}
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
  )
}

export function MacroHistoricoChart({
  data,
}: {
  data: { data: string; valor: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
      >
        <defs>
          <linearGradient id="gradientMacro" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#17251b" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#17251b" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={chartTheme.colors.grid}
          vertical={false}
        />
        <XAxis
          dataKey="data"
          axisLine={false}
          tickLine={false}
          tick={{ fill: chartTheme.colors.tick, fontSize: 10 }}
          interval={Math.max(1, Math.floor(data.length / 6))}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: chartTheme.colors.tick, fontSize: 11 }}
          tickFormatter={(v) => `${fmtNum(Number(v), 2)}`}
          width={50}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#FFF',
            border: '1px solid #E2DDD5',
            borderRadius: 8,
            fontSize: 11,
          }}
        />
        <Area
          type="monotone"
          dataKey="valor"
          stroke={chartTheme.colors.primary}
          strokeWidth={2}
          fill="url(#gradientMacro)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function SicorVolumeChart({
  data,
}: {
  data: { mes: string; valor: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
      >
        <defs>
          <linearGradient id="gradientSicor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#17251b" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#17251b" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={chartTheme.colors.grid}
          vertical={false}
        />
        <XAxis
          dataKey="mes"
          axisLine={false}
          tickLine={false}
          tick={{ fill: chartTheme.colors.tick, fontSize: 10 }}
          interval={Math.max(1, Math.floor(data.length / 8))}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: chartTheme.colors.tick, fontSize: 10 }}
          tickFormatter={(v) => `${(Number(v) / 1e9).toFixed(1)}B`}
          width={50}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#FFF',
            border: '1px solid #E2DDD5',
            borderRadius: 8,
            fontSize: 11,
          }}
          formatter={(v: any) => [fmtBRL(Number(v)), 'Desembolso']}
        />
        <Area
          type="monotone"
          dataKey="valor"
          stroke={chartTheme.colors.primary}
          strokeWidth={2}
          fill="url(#gradientSicor)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function ExportDestinosChart({ data }: { data: any[] }) {
  const sliced = data.slice(0, 7)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={sliced}
          dataKey="valorUSD"
          nameKey="pais"
          cx="50%"
          cy="50%"
          outerRadius={85}
          innerRadius={50}
          paddingAngle={2}
          label={(entry: any) =>
            `${entry.pais.slice(0, 10)} ${entry.participacao.toFixed(0)}%`
          }
          labelLine={false}
        >
          {sliced.map((_, idx) => (
            <Cell key={idx} fill={CHART_PALETTE[idx % CHART_PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: any) => [`US$ ${(Number(v) / 1e9).toFixed(2)} bi`, '']}
          contentStyle={{ fontSize: 11 }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function ExportSerieChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={chartTheme.colors.grid}
          vertical={false}
        />
        <XAxis
          dataKey="mes"
          axisLine={false}
          tickLine={false}
          tick={{ fill: chartTheme.colors.tick, fontSize: 10 }}
          interval={Math.max(1, Math.floor(data.length / 8))}
        />
        <YAxis
          yAxisId="usd"
          axisLine={false}
          tickLine={false}
          tick={{ fill: chartTheme.colors.tick, fontSize: 10 }}
          tickFormatter={(v) => `${(Number(v) / 1e9).toFixed(0)}bi`}
          width={45}
        />
        <YAxis
          yAxisId="ton"
          orientation="right"
          axisLine={false}
          tickLine={false}
          tick={{ fill: chartTheme.colors.tick, fontSize: 10 }}
          tickFormatter={(v) => `${(Number(v) / 1e6).toFixed(0)}Mt`}
          width={45}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#FFF',
            border: '1px solid #E2DDD5',
            borderRadius: 8,
            fontSize: 11,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Bar
          yAxisId="ton"
          dataKey="toneladas"
          name="Toneladas"
          fill={chartTheme.colors.accent}
          opacity={0.6}
        />
        <Line
          yAxisId="usd"
          type="monotone"
          dataKey="valorUSD"
          name="Valor US$"
          stroke={chartTheme.colors.primary}
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function CambioHistoricoChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
      >
        <defs>
          <linearGradient id="gradientCambio" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#cb9d52" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#cb9d52" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={chartTheme.colors.grid}
          vertical={false}
        />
        <XAxis
          dataKey="data"
          axisLine={false}
          tickLine={false}
          tick={{ fill: chartTheme.colors.tick, fontSize: 10 }}
          interval={Math.max(1, Math.floor(data.length / 8))}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: chartTheme.colors.tick, fontSize: 11 }}
          domain={['auto', 'auto']}
          tickFormatter={(v) => Number(v).toFixed(2)}
          width={45}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#FFF',
            border: '1px solid #E2DDD5',
            borderRadius: 8,
            fontSize: 11,
          }}
          formatter={(v: any) => [Number(v).toFixed(4), 'Cotação']}
        />
        <Area
          type="monotone"
          dataKey="bid"
          stroke={chartTheme.colors.accent}
          strokeWidth={2}
          fill="url(#gradientCambio)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
