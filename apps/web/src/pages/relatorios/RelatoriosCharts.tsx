import { chartTheme } from '../../components/ui/foundation'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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

type RelatorioChartProps = {
  type:
    | 'clientesEstado'
    | 'clientesEstagio'
    | 'rentabilidade'
    | 'propostasStatus'
    | 'tempoResposta'
    | 'commodities'
    | 'fluxo'
  data: any[]
}

const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    v,
  )

const fmtBRLCompact = (v: number): string => {
  if (v >= 1_000_000)
    return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`
  return fmtBRL(v)
}

function CustomTooltip({
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
        <p key={i} className="text-xs" style={{ color: p.color || p.fill }}>
          {p.name}:{' '}
          {typeof p.value === 'number' && p.value > 1000
            ? fmtBRLCompact(p.value)
            : p.value}
        </p>
      ))}
    </div>
  )
}

function PieTooltip({ active, payload }: TooltipProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="rounded-xl border border-aletis-borda bg-card p-3 shadow-lg">
      <p className="text-xs font-semibold" style={{ color: d.payload.color }}>
        {d.name}
      </p>
      <p className="text-xs text-[var(--text-soft)]">{d.value} clientes</p>
    </div>
  )
}

export default function RelatorioChart({ type, data }: RelatorioChartProps) {
  if (type === 'clientesEstado') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.colors.grid} />
          <XAxis dataKey="estado" tick={{ fontSize: 11, fill: chartTheme.colors.tick }} />
          <YAxis tick={{ fontSize: 11, fill: chartTheme.colors.tick }} />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="clientes"
            name="Clientes"
            fill={chartTheme.colors.primary}
            radius={[4, 4, 0, 0]}
            barSize={36}
          />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (type === 'clientesEstagio' || type === 'propostasStatus') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={90}
            innerRadius={type === 'propostasStatus' ? 50 : 45}
            paddingAngle={type === 'propostasStatus' ? 3 : 2}
            dataKey="value"
            label={({ name, value }) => `${name} (${value})`}
            labelLine={
              type === 'clientesEstagio'
                ? { stroke: '#6B6B6B', strokeWidth: 0.5 }
                : undefined
            }
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<PieTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (type === 'rentabilidade') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.colors.grid} />
          <XAxis dataKey="mes" tick={{ fontSize: 11, fill: chartTheme.colors.tick }} />
          <YAxis
            tick={{ fontSize: 10, fill: chartTheme.colors.tick }}
            tickFormatter={(v) => fmtBRLCompact(Number(v))}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="receita"
            name="Receita"
            fill={chartTheme.colors.primary}
            radius={[4, 4, 0, 0]}
            barSize={24}
          />
          <Bar
            dataKey="custo"
            name="Custo"
            fill="#C0392B"
            radius={[4, 4, 0, 0]}
            barSize={24}
          />
          <Bar
            dataKey="lucro"
            name="Lucro"
            fill="#27AE60"
            radius={[4, 4, 0, 0]}
            barSize={24}
          />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (type === 'tempoResposta') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.colors.grid} />
          <XAxis dataKey="faixa" tick={{ fontSize: 11, fill: chartTheme.colors.tick }} />
          <YAxis tick={{ fontSize: 11, fill: chartTheme.colors.tick }} />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="qtd"
            name="Propostas"
            fill={chartTheme.colors.accent}
            radius={[4, 4, 0, 0]}
            barSize={30}
          />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (type === 'commodities') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.colors.grid} />
          <XAxis dataKey="mes" tick={{ fontSize: 11, fill: chartTheme.colors.tick }} />
          <YAxis
            tick={{ fontSize: 10, fill: chartTheme.colors.tick }}
            tickFormatter={(v) => `R$${v}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="soja"
            name="Soja"
            fill={chartTheme.colors.accent}
            radius={[4, 4, 0, 0]}
            barSize={20}
          />
          <Bar
            dataKey="milho"
            name="Milho"
            fill="#27AE60"
            radius={[4, 4, 0, 0]}
            barSize={20}
          />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.colors.grid} />
        <XAxis dataKey="mes" tick={{ fontSize: 11, fill: chartTheme.colors.tick }} />
        <YAxis
          tick={{ fontSize: 10, fill: chartTheme.colors.tick }}
          tickFormatter={(v) => fmtBRLCompact(Number(v))}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          dataKey="entrada"
          name="Entradas"
          fill="#27AE60"
          radius={[4, 4, 0, 0]}
          barSize={24}
        />
        <Bar
          dataKey="saida"
          name="Saídas"
          fill="#C0392B"
          radius={[4, 4, 0, 0]}
          barSize={24}
        />
        <Bar
          dataKey="saldo"
          name="Saldo"
          fill={chartTheme.colors.accent}
          radius={[4, 4, 0, 0]}
          barSize={24}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
