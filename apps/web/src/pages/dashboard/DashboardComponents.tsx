import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import {
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { chartTheme, uiAction, uiSurface, uiText } from '@/components/ui/foundation'

const GOLD = chartTheme.colors.accent
const GREEN = chartTheme.colors.success
const RED = chartTheme.colors.danger
const SLATE = chartTheme.colors.muted

export type Tone = 'risk' | 'warn' | 'good' | 'neutral' | string

function toneColor(tone?: Tone): string {
  if (tone === 'risk') return RED
  if (tone === 'warn') return GOLD
  if (tone === 'good') return GREEN
  return SLATE
}

function toneBadgeVariant(tone?: Tone) {
  if (tone === 'risk') return 'destructive'
  if (tone === 'warn') return 'gold'
  if (tone === 'good') return 'default'
  return 'secondary'
}

/* ═══════════════════════════════════════════════════════════
 *  CARD DASH — base ultra-premium, sombra sutil, borda refinada
 * ═══════════════════════════════════════════════════════════ */
function CardDash({
  children,
  className = '',
  accent = false,
  hoverLift = true,
}: {
  children: ReactNode
  className?: string
  accent?: boolean
  hoverLift?: boolean
}) {
  return (
    <div
      className={`
        relative overflow-hidden
        ${uiSurface.panel}
        ${hoverLift ? uiSurface.panelHover : ''}
        ${accent ? 'card-dash-accent' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
 *  EXECUTIVE KPI — card impactante com micro-gráfico opcional
 * ═══════════════════════════════════════════════════════════ */
export function ExecutiveKpi({
  icon: Icon,
  label,
  value,
  detail,
  tone,
  change,
}: {
  icon: any
  label: string
  value: string
  detail: string
  tone?: 'good' | 'warn' | 'risk'
  change?: { value: number; suffix?: string } // porcentagem de variação
}) {
  const color = toneColor(tone || 'neutral')
  const isRisk = tone === 'risk'
  const isGood = tone === 'good'

  return (
    <CardDash className="p-5" accent>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={`truncate ${uiText.eyebrow} text-stone-500 dark:text-aletis-sage`}>
            {label}
          </p>
          <p className="mt-2.5 stat-value text-[28px] text-foreground dark:text-aletis-cream">
            {value}
          </p>
        </div>
        <div
          className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg border transition-transform duration-300 hover:scale-105"
          style={{
            color,
            borderColor: `${color}18`,
            background: `${color}0A`,
          }}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isGood && <TrendingUp className="h-3 w-3 text-emerald-600" />}
          {isRisk && <TrendingDown className="h-3 w-3 text-red-500" />}
          <p className="text-[11px] leading-relaxed text-stone-500 dark:text-aletis-sage">{detail}</p>
        </div>
        {change && (
          <span
            className={`text-[11px] font-display font-semibold tabular-nums ${change.value >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
          >
            {change.value >= 0 ? '+' : ''}
            {change.value.toFixed(1).replace('.', ',')}%
            {change.suffix || ''}
          </span>
        )}
      </div>
    </CardDash>
  )
}

/* ═══════════════════════════════════════════════════════════
 *  FINANCE KPI CARD — indicador financeiro com variação
 * ═══════════════════════════════════════════════════════════ */
export function FinanceKpiCard({
  label,
  value,
  subtitle,
  icon: Icon,
  trend,
  color,
}: {
  label: string
  value: string
  subtitle: string
  icon: any
  trend?: 'up' | 'down'
  color: string
}) {
  return (
    <CardDash className="p-5" accent>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={`truncate ${uiText.eyebrow} text-stone-500 dark:text-aletis-sage`}>
            {label}
          </p>
          <p className="mt-2.5 stat-value text-[22px] text-foreground dark:text-aletis-cream">{value}</p>
        </div>
        <div
          className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg border"
          style={{
            color,
            borderColor: `${color}18`,
            background: `${color}0A`,
          }}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        {trend && (
          <span
            className={trend === 'up' ? 'text-emerald-600' : 'text-red-500'}
          >
            {trend === 'up' ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
          </span>
        )}
        <p className="text-[11px] text-stone-500 dark:text-aletis-sage">{subtitle}</p>
      </div>
    </CardDash>
  )
}

/* ═══════════════════════════════════════════════════════════
 *  PANEL — seção com header elegante e linha divisória
 * ═══════════════════════════════════════════════════════════ */
export function Panel({
  title,
  eyebrow,
  icon: Icon,
  children,
  rightAction,
  gradient = false,
}: {
  title: string
  eyebrow: string
  icon: any
  children: ReactNode
  rightAction?: ReactNode
  gradient?: boolean
}) {
  return (
    <CardDash className="p-5 lg:p-6" accent>
      {gradient && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-aletis-gold/70 to-transparent" />
      )}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="h-px w-5 rounded-full bg-aletis-gold/60" />
            <p className={uiText.eyebrow}>
              {eyebrow}
            </p>
          </div>
          <h2 className="mt-2 font-display text-base font-semibold text-foreground dark:text-aletis-cream">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {rightAction}
          <motion.div
            whileHover={{ scale: 1.08, rotate: 3 }}
            transition={{ type: 'spring', stiffness: 300 }}
            className="grid h-10 w-10 cursor-default place-items-center rounded-lg border border-aletis-gold/20 bg-aletis-gold/[0.06] text-aletis-gold-escuro"
          >
            <Icon className="h-[18px] w-[18px]" />
          </motion.div>
        </div>
      </div>
      {children}
    </CardDash>
  )
}

/* ═══════════════════════════════════════════════════════════
 *  ACTION LINK — botão de navegação rápida premium
 * ═══════════════════════════════════════════════════════════ */
export function ActionLink({
  to,
  icon: Icon,
  label,
  filled,
}: {
  to: string
  icon: any
  label: string
  filled?: boolean
}) {
  return (
    <Link
      to={to}
      className={`
        inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold
        transition-all duration-200 active:scale-[0.97]
        ${filled
          ? uiAction.primary
          : 'border border-stone-200 bg-card text-stone-600 shadow-sm hover:border-aletis-gold/35 hover:bg-stone-50 hover:text-aletis-verde'
        }
      `}
    >
      <motion.span
        whileHover={{ scale: 1.1, rotate: -3 }}
        transition={{ type: 'spring', stiffness: 300 }}
      >
        <Icon className="h-4 w-4" />
      </motion.span>
      {label}
    </Link>
  )
}

/* ═══════════════════════════════════════════════════════════
 *  ALERT ITEM — notificação informativa premium
 * ═══════════════════════════════════════════════════════════ */
export function AlertItem({
  icon: Icon,
  title,
  detail,
}: {
  icon: any
  title: string
  detail: string
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-stone-200/70 bg-stone-50/60 p-3.5 hover:border-aletis-gold/20 hover:bg-stone-50/90 transition-all duration-200">
      <div className="mt-0.5 grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-aletis-gold/10 text-aletis-gold-escuro">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground dark:text-aletis-cream">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-stone-500">{detail}</p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
 *  PRIORITY ITEM — item de prioridade com link
 * ═══════════════════════════════════════════════════════════ */
export function PriorityItem({
  icon: Icon,
  title,
  meta,
  detail,
  to,
  tone,
}: {
  icon: any
  title: string
  meta: string
  detail: string
  to: string
  tone: Tone
}) {
  const color = toneColor(tone)
  const badgeVariant = toneBadgeVariant(tone) as any

  return (
    <Link
      to={to}
      className="group flex items-start gap-3.5 rounded-xl border border-stone-200/70 bg-stone-50/30 p-3.5 transition-all duration-200 hover:border-aletis-gold/30 hover:bg-white hover:shadow-md"
    >
      <div
        className="mt-0.5 grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg border"
        style={{
          color,
          borderColor: `${color}18`,
          background: `${color}0A`,
        }}
      >
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate font-display text-sm font-semibold text-foreground transition-colors group-hover:text-aletis-gold-escuro dark:text-aletis-cream">
            {title}
          </p>
          <Badge variant={badgeVariant} size="sm">
            {meta}
          </Badge>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-500">
          {detail}
        </p>
      </div>
      <ArrowRight className="mt-2 h-4 w-4 flex-shrink-0 text-stone-400 transition-all group-hover:translate-x-0.5 group-hover:text-aletis-gold-escuro" />
    </Link>
  )
}

/* ═══════════════════════════════════════════════════════════
 *  SIGNAL CARD — pulso da operação com indicador animado
 * ═══════════════════════════════════════════════════════════ */
export function SignalCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone: Tone
}) {
  const color = toneColor(tone)
  const isRisk = tone === 'risk'

  return (
    <div className="group rounded-xl border border-stone-200/50 bg-white/70 backdrop-blur-sm p-4 hover:border-aletis-gold/25 hover:shadow-sm hover:bg-white transition-all duration-200">
      <p className="text-[11px] font-display font-semibold uppercase tracking-[0.16em] text-stone-400">
        {label}
      </p>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="stat-value text-[28px] text-foreground dark:text-aletis-cream">{value}</p>
        <div className="relative flex items-center justify-center mb-1.5">
          <motion.span
            animate={
              isRisk
                ? { scale: [1, 1.45, 1], opacity: [1, 0.4, 1] }
                : { scale: [1, 1.15, 1] }
            }
            transition={{
              duration: isRisk ? 1.6 : 3.0,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: color, boxShadow: `0 0 12px ${color}55` }}
          />
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-stone-500">{detail}</p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
 *  DASHBOARD ALERT — alerta com severidade colorida
 * ═══════════════════════════════════════════════════════════ */
export function DashboardAlert({
  severidade,
  titulo,
  detalhe,
}: {
  severidade: 'critico' | 'atencao' | 'info'
  titulo: string
  detalhe: string
}) {
  const cfg = {
    critico: {
      border: 'border-red-200/50',
      bg: 'bg-red-50/70',
      icon: AlertTriangle,
      iconColor: 'text-red-500',
      title: 'text-red-800',
      dot: 'bg-red-500',
    },
    atencao: {
      border: 'border-amber-200/50',
      bg: 'bg-amber-50/70',
      icon: AlertTriangle,
      iconColor: 'text-amber-500',
      title: 'text-amber-800',
      dot: 'bg-amber-500',
    },
    info: {
      border: 'border-sky-200/50',
      bg: 'bg-sky-50/70',
      icon: ClipboardCheck,
      iconColor: 'text-sky-500',
      title: 'text-sky-800',
      dot: 'bg-sky-500',
    },
  }
  const c = cfg[severidade]
  const Icon = c.icon
  return (
    <div
      className={`flex items-start gap-3.5 rounded-lg border ${c.border} ${c.bg} p-4 transition-all duration-200 hover:shadow-sm`}
    >
      <div className="relative mt-0.5">
        <Icon className={`h-5 w-5 shrink-0 ${c.iconColor}`} />
        <span
          className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${c.dot} ring-2 ring-white`}
        />
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${c.title}`}>{titulo}</p>
        <p className="mt-1 text-xs leading-relaxed text-stone-500">{detalhe}</p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
 *  RISK PILL — badge de saúde financeira premium
 * ═══════════════════════════════════════════════════════════ */
export function RiskPill({ score }: { score: number }) {
  const color = score < 45 ? RED : score < 65 ? GOLD : GREEN
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-display font-semibold tabular-nums"
      style={{
        color,
        borderColor: `${color}22`,
        background: `${color}0D`,
      }}
    >
      {score}/100
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════
 *  SECTION HEADER — divisor visual entre seções
 * ═══════════════════════════════════════════════════════════ */
export function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string
  title?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        {eyebrow && (
          <div className="flex items-center gap-2 mb-1">
            <div className="h-[3px] w-5 rounded-full bg-aletis-gold/50" />
            <span className="text-[11px] uppercase tracking-[0.2em] text-aletis-gold-escuro font-display font-semibold">
              {eyebrow}
            </span>
          </div>
        )}
        {title && (
          <h2 className="font-display text-lg font-semibold text-foreground dark:text-aletis-cream">
            {title}
          </h2>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
 *  PROGRESS STAT — barra de progresso com label
 * ═══════════════════════════════════════════════════════════ */
export function ProgressStat({
  label,
  value,
  max,
  color = GOLD,
  unit = '',
}: {
  label: string
  value: number
  max: number
  color?: string
  unit?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-stone-500">{label}</span>
        <span className="font-display font-semibold tabular-nums text-foreground dark:text-aletis-cream">
          {unit ? `${value}${unit}` : value}
        </span>
      </div>
      <div className="h-[5px] rounded-full bg-stone-200/60 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
 *  MINI STAT — estatística pequena horizontal
 * ═══════════════════════════════════════════════════════════ */
export function MiniStat({
  label,
  value,
  color = chartTheme.colors.primary,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-[0.14em] text-stone-500 font-display font-semibold">
        {label}
      </span>
      <span
        className="mt-1 text-[15px] font-display font-semibold tracking-tight tabular-nums"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
 *  INSIGHT CARD — insight contextual com ícone e destaque
 * ═══════════════════════════════════════════════════════════ */
export function InsightCard({
  icon: Icon,
  title,
  value,
  detail,
  tone = 'neutral',
}: {
  icon: any
  title: string
  value: string
  detail: string
  tone?: Tone
}) {
  const color = toneColor(tone)
  return (
    <div className="flex items-center gap-4 rounded-xl border border-stone-200/50 bg-white/70 backdrop-blur-sm p-4 hover:bg-white hover:border-aletis-gold/20 hover:shadow-sm transition-all duration-200">
      <div
        className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg border"
        style={{
          color,
          borderColor: `${color}18`,
          background: `${color}0A`,
        }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.16em] text-stone-400 font-display font-semibold">
          {title}
        </p>
        <p className="mt-0.5 font-display text-[18px] font-bold tabular-nums text-foreground dark:text-aletis-cream">
          {value}
        </p>
        <p className="text-[11px] text-stone-500">{detail}</p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
 *  QUICK STAT BAR — barra de estatísticas rápidas
 * ═══════════════════════════════════════════════════════════ */
export function QuickStatBar({
  items,
}: {
  items: Array<{
    label: string
    value: string
    tone?: Tone
  }>
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: toneColor(item.tone || 'neutral') }}
          />
          <span className="text-[11px] text-stone-500">
            {item.label}:{' '}
            <span className="font-display font-semibold tabular-nums text-foreground dark:text-aletis-cream">
              {item.value}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}
