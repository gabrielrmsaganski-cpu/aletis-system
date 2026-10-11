import { chartTheme } from '../../components/ui/foundation'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
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

type DadoHistorico = {
  data: string
  label: string
  tempMedia: number | null
  precipMm: number | null
}

function ChartTooltip({
  active,
  payload,
  label,
}: TooltipProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-aletis-borda bg-card p-3 shadow-lg">
      <p className="mb-1 text-xs font-semibold text-foreground">
        {label}
      </p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>
          {p.name}: {p.value}
          {p.name === 'Temperatura' ? ' C' : ' mm'}
        </p>
      ))}
    </div>
  )
}

export default function HistoricoClimaChart({
  data,
}: {
  data: DadoHistorico[]
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.colors.grid} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: chartTheme.colors.tick }}
          interval={4}
        />
        <YAxis
          yAxisId="temp"
          orientation="left"
          tick={{ fontSize: 10, fill: '#cb9d52' }}
          label={{
            value: 'Temp (C)',
            angle: -90,
            position: 'insideLeft',
            style: { fontSize: 11, fill: '#cb9d52' },
          }}
          domain={[
            (dataMin: number) => Math.floor(dataMin - 2),
            (dataMax: number) => Math.ceil(dataMax + 2),
          ]}
          allowDecimals={false}
        />
        <YAxis
          yAxisId="precip"
          orientation="right"
          tick={{ fontSize: 10, fill: '#3B82F6' }}
          label={{
            value: 'Precip (mm)',
            angle: 90,
            position: 'insideRight',
            style: { fontSize: 11, fill: '#3B82F6' },
          }}
          domain={[0, 'auto']}
        />
        <Tooltip
          content={<ChartTooltip />}
          wrapperStyle={{ outline: 'none' }}
          cursor={{ fill: '#17251b', fillOpacity: 0.04 }}
        />
        <Legend
          verticalAlign="top"
          height={36}
          wrapperStyle={{ fontSize: 12, fontFamily: 'Inter' }}
        />
        <Area
          yAxisId="temp"
          type="monotone"
          dataKey="tempMedia"
          name="Temperatura"
          stroke={chartTheme.colors.accent}
          fill={chartTheme.colors.accent}
          fillOpacity={0.15}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, stroke: '#cb9d52', strokeWidth: 2, fill: '#fff' }}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Bar
          yAxisId="precip"
          dataKey="precipMm"
          name="Precipitação"
          fill="#3B82F6"
          fillOpacity={0.7}
          radius={[2, 2, 0, 0]}
          barSize={12}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
