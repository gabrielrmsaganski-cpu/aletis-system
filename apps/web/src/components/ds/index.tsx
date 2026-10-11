/**
 * Design System — ALETIS OS
 * ──────────────────────────────────────────────────────────────
 * Dual mode: "operational" (escuro, denso) + "documental" (claro,
 * leitura). Dark é classe `theme-operational` no <html>. Os
 * componentes daqui usam tokens ALETIS oficiais — nunca cor literal.
 */
import type { ReactNode, ButtonHTMLAttributes } from 'react'
import { uiAction } from '../ui/foundation'

// ─────────────── DSCard ───────────────
export function DSCard({
  children,
  className = '',
  dense = false,
}: {
  children: ReactNode
  className?: string
  dense?: boolean
}) {
  return (
    <div
      className={`
        ui-panel
        ${dense ? 'p-3' : 'p-5'}
        ${className}
      `}
    >
      {children}
    </div>
  )
}

// ─────────────── DSStatCard (KPI) ───────────────
export function DSStatCard({
  label,
  value,
  hint,
  trend,
  icon,
  tone = 'neutral',
  onClick,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  trend?: { value: number; label?: string }
  icon?: ReactNode
  tone?: 'neutral' | 'positive' | 'warning' | 'negative' | 'gold' | 'info'
  onClick?: () => void
}) {
  const toneRing: Record<string, string> = {
    neutral: 'border-aletis-borda',
    positive: 'border-positivo/30',
    warning: 'border-ambar/40',
    negative: 'border-red-300',
    gold: 'border-aletis-dourado/40',
    info: 'border-aletis-verde/30',
  }
  const toneIcon: Record<string, string> = {
    neutral: 'text-[var(--text-soft)]',
    positive: 'text-positivo',
    warning: 'text-ambar',
    negative: 'text-red-600',
    gold: 'text-aletis-dourado',
    info: 'text-foreground',
  }
  const interactive = onClick
    ? 'cursor-pointer ui-panel-interactive'
    : ''
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      className={`
        ui-panel ui-metric ${toneRing[tone]}
        ${interactive}
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="ui-metric-label">
          {label}
        </p>
        {icon && <span className={toneIcon[tone]}>{icon}</span>}
      </div>
      <p className="ui-metric-value">
        {value}
      </p>
      {(hint || trend) && (
        <div className="mt-1.5 flex items-center gap-2 text-[11px] font-body">
          {hint && <span className="text-[var(--text-soft)] dark:text-white/60">{hint}</span>}
          {trend && (
            <span
              className={
                trend.value >= 0
                  ? 'text-positivo font-semibold'
                  : 'text-red-600 font-semibold'
              }
            >
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value).toFixed(1)}%
              {trend.label && <span className="ml-0.5 text-[var(--text-soft)]">{trend.label}</span>}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────── DSEmpty ───────────────
export function DSEmpty({
  icon,
  title,
  description,
  cta,
}: {
  icon?: ReactNode
  title: string
  description?: ReactNode
  cta?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && (
        <div className="w-12 h-12 rounded-xl bg-aletis-borda/40 dark:bg-white/5 flex items-center justify-center mb-3 text-[var(--text-soft)] dark:text-white/40">
          {icon}
        </div>
      )}
      <p className="text-sm font-display font-semibold text-foreground dark:text-white">{title}</p>
      {description && (
        <p className="text-xs font-body text-muted-foreground dark:text-white/60 mt-1 max-w-sm">
          {description}
        </p>
      )}
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  )
}

// ─────────────── DSTable ───────────────
export interface DSTableColumn<T> {
  key: string
  label: string
  width?: string
  align?: 'left' | 'right' | 'center'
  render?: (row: T) => ReactNode
}

export function DSTable<T>({
  columns,
  rows,
  emptyState,
  onRowClick,
  rowKey,
  dense = false,
}: {
  columns: DSTableColumn<T>[]
  rows: T[]
  emptyState?: ReactNode
  onRowClick?: (row: T) => void
  rowKey?: (row: T) => string
  dense?: boolean
}) {
  if (rows.length === 0) {
    return <>{emptyState ?? <DSEmpty title="Nenhum registro encontrado" description="Ajuste os filtros para ampliar sua consulta." />}</>
  }
  const padCell = dense ? 'px-3 py-2' : 'px-4 py-3.5'
  const alignClass = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  } as const
  return (
    <div className="ui-table-wrap">
      <table className={`ui-table ${dense ? 'ui-table--dense' : ''}`}>
        <thead className="text-[var(--text-muted)]">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`${padCell} ${alignClass[c.align ?? 'left']} font-semibold whitespace-nowrap`}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-aletis-borda dark:divide-white/5">
          {rows.map((row, i) => {
            const key = rowKey ? rowKey(row) : String((row as any)?.id ?? i)
            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(row)}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={(event) => { if (onRowClick && event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onRowClick(row) } }}
                className={`${onRowClick ? 'cursor-pointer hover:bg-aletis-bege/30 dark:hover:bg-white/5' : ''}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`${padCell} ${alignClass[c.align ?? 'left']} text-foreground dark:text-white/90`}>
                    {c.render ? c.render(row) : (row as any)[c.key] ?? '—'}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────── DSBadge ───────────────
export function DSBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'positive' | 'warning' | 'negative' | 'gold' | 'info'
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-aletis-borda/60 text-foreground dark:bg-white/10 dark:text-white/80',
    positive: 'bg-positivo/15 text-positivo dark:bg-positivo/20',
    warning: 'bg-ambar/15 text-ambar-dark dark:text-ambar dark:bg-ambar/20',
    negative: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    gold: 'bg-aletis-dourado/15 text-foreground dark:text-aletis-dourado',
    info: 'bg-aletis-verde/10 text-foreground dark:bg-aletis-verde/20',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-body font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

// ─────────────── DSButton ───────────────
export function DSButton({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizes: Record<string, string> = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3.5 py-2 text-sm',
    lg: 'px-5 py-3 text-base',
  }
  const variants: Record<string, string> = {
    primary: uiAction.primary,
    secondary: uiAction.secondary,
    ghost: uiAction.ghost,
    danger: uiAction.danger,
  }
  return (
    <button
      className={`font-body ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
