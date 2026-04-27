/**
 * Design-system primitives ALETIS — componentes visuais reutilizáveis.
 *
 * Importados por páginas para manter consistência de spacing/tipografia/cor
 * sem cada tela redesenhar do zero.
 */
import React from 'react'
import { Loader2 } from 'lucide-react'
import BrandWatermark from './BrandWatermark'

// ────────────────────────────────────────────────────────────
// Formatters (pt-BR, tabular-friendly)
// ────────────────────────────────────────────────────────────
export const fmtBRL = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const fmtBRLShort = (v: number): string => {
  const f = (x: number) =>
    x.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  if (v >= 1e12) return `R$ ${f(v / 1e12)} tri`
  if (v >= 1e9) return `R$ ${f(v / 1e9)} bi`
  if (v >= 1e6) return `R$ ${f(v / 1e6)} mi`
  if (v >= 1e3) return `R$ ${f(v / 1e3)} mil`
  return `R$ ${v.toFixed(0)}`
}

export const fmtNum = (n: number): string => n.toLocaleString('pt-BR')

export const fmtHa = (ha: number): string =>
  ha >= 1000 ? `${(ha / 1000).toFixed(ha >= 10000 ? 0 : 1)} mil ha` : `${ha.toLocaleString('pt-BR')} ha`

// ────────────────────────────────────────────────────────────
// Chip — pílula padronizada para badges de status/atributo.
// ────────────────────────────────────────────────────────────
export type ChipTone = 'emerald' | 'red' | 'sky' | 'amber' | 'slate' | 'gold' | 'violet'

const CHIP_CLS: Record<ChipTone, string> = {
  emerald:
    'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
  red: 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900',
  sky: 'bg-sky-100 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-900',
  amber:
    'bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900',
  slate:
    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  gold: 'bg-aletis-dourado/10 text-aletis-dourado border-aletis-dourado/30',
  violet:
    'bg-violet-100 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-900',
}

export function Chip({
  tone,
  icon: Icon,
  label,
  size = 'sm',
}: {
  tone: ChipTone
  icon?: React.ElementType
  label: React.ReactNode
  size?: 'xs' | 'sm' | 'md'
}) {
  const sz = {
    xs: 'px-1.5 py-0.5 text-[10px] gap-1',
    sm: 'px-2 py-0.5 text-[11px] gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
  }[size]
  const iconSize = size === 'md' ? 12 : 10
  return (
    <span className={`inline-flex items-center rounded-full border font-semibold ${sz} ${CHIP_CLS[tone]}`}>
      {Icon && <Icon size={iconSize} />}
      {label}
    </span>
  )
}

// ────────────────────────────────────────────────────────────
// Metric — label uppercase + value mono, alinhado à direita ou centro.
// ────────────────────────────────────────────────────────────
export function Metric({
  label,
  value,
  valueClass,
  align = 'right',
}: {
  label: string
  value: React.ReactNode
  valueClass?: string
  align?: 'left' | 'right' | 'center'
}) {
  const alignCls = { left: 'text-left', right: 'text-right', center: 'text-center' }[align]
  return (
    <div className={alignCls}>
      <p className="text-[9.5px] uppercase tracking-[0.14em] text-aletis-grafite-medio dark:text-white/40 font-medium">
        {label}
      </p>
      <p
        className={`font-mono text-sm font-semibold mt-0.5 tabular-nums ${
          valueClass ?? 'text-aletis-grafite-escuro dark:text-white'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// KpiTile — cartão de KPI com ícone, valor, label e subtítulo.
// Usado em heros escuros (Prospecção, CRM) e em painéis brancos.
// ────────────────────────────────────────────────────────────
export type KpiAccent = 'dourado' | 'vermelho' | 'ambar' | 'verde' | 'sky' | 'violet'

const KPI_ACCENT: Record<KpiAccent, string> = {
  dourado: 'text-aletis-dourado bg-aletis-dourado/10',
  vermelho: 'text-red-300 bg-red-500/15',
  ambar: 'text-amber-300 bg-amber-500/15',
  verde: 'text-emerald-300 bg-emerald-500/15',
  sky: 'text-sky-300 bg-sky-500/15',
  violet: 'text-violet-300 bg-violet-500/15',
}

const KPI_ACCENT_LIGHT: Record<KpiAccent, string> = {
  dourado: 'text-aletis-dourado bg-aletis-dourado/15',
  vermelho: 'text-red-600 bg-red-100 dark:text-red-300 dark:bg-red-500/15',
  ambar: 'text-amber-600 bg-amber-100 dark:text-amber-300 dark:bg-amber-500/15',
  verde: 'text-emerald-600 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/15',
  sky: 'text-sky-600 bg-sky-100 dark:text-sky-300 dark:bg-sky-500/15',
  violet: 'text-violet-600 bg-violet-100 dark:text-violet-300 dark:bg-violet-500/15',
}

export function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  loading,
  variant = 'dark',
  onClick,
  tooltip,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  accent: KpiAccent
  loading?: boolean
  variant?: 'dark' | 'light'
  onClick?: () => void
  /** Texto descritivo (hover) explicando o cálculo do KPI. */
  tooltip?: string
}) {
  const isDark = variant === 'dark'
  const bgCls = isDark
    ? 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08] hover:border-white/15'
    : 'bg-white dark:bg-aletis-grafite-escuro border-aletis-borda dark:border-white/5 hover:border-aletis-verde/40'
  const labelCls = isDark ? 'text-white/55' : 'text-aletis-grafite-medio dark:text-white/55'
  const valueCls = isDark ? 'text-white' : 'text-aletis-grafite-escuro dark:text-white'
  const subCls = isDark ? 'text-white/45' : 'text-aletis-grafite-medio dark:text-white/45'
  const accentCls = isDark ? KPI_ACCENT[accent] : KPI_ACCENT_LIGHT[accent]
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      title={tooltip}
      aria-label={tooltip ? `${label}: ${tooltip}` : undefined}
      className={`group h-[128px] rounded-2xl border p-3.5 flex flex-col gap-2 transition text-left ${bgCls} ${
        onClick ? 'cursor-pointer' : ''
      } ${tooltip ? 'cursor-help' : ''}`}
    >
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${accentCls}`}>
          <Icon size={16} />
        </div>
        <p
          className={`text-[10.5px] uppercase tracking-[0.12em] font-medium leading-tight line-clamp-2 ${labelCls}`}
        >
          {label}
        </p>
      </div>
      <div className="flex-1 flex flex-col justify-end min-h-0">
        {loading ? (
          <div className={`h-7 w-20 rounded animate-pulse ${isDark ? 'bg-white/10' : 'bg-slate-200 dark:bg-white/10'}`} />
        ) : (
          <p className={`font-display text-[26px] leading-none font-bold tabular-nums tracking-tight truncate ${valueCls}`} title={typeof value === 'string' ? value : undefined}>
            {value}
          </p>
        )}
        {sub && (
          <p className={`text-[10.5px] mt-1 truncate ${subCls}`}>
            {sub}
          </p>
        )}
      </div>
    </Tag>
  )
}

// ────────────────────────────────────────────────────────────
// AlertChip — alerta compacto (hot-lead, reengajar, judicial, etc).
// ────────────────────────────────────────────────────────────
export function AlertChip({
  icon: Icon,
  tone,
  value,
  suffix,
  onClick,
}: {
  icon: React.ElementType
  tone: 'red' | 'amber' | 'gold' | 'sky' | 'emerald'
  value: number | string
  suffix: string
  onClick?: () => void
}) {
  const toneCls = {
    red: 'bg-red-500/15 border-red-400/30 text-red-200',
    amber: 'bg-amber-500/15 border-amber-400/30 text-amber-200',
    gold: 'bg-aletis-dourado/15 border-aletis-dourado/40 text-aletis-dourado',
    sky: 'bg-sky-500/15 border-sky-400/30 text-sky-200',
    emerald: 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200',
  }[tone]
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11.5px] ${toneCls} ${
        onClick ? 'hover:brightness-110 cursor-pointer' : ''
      }`}
    >
      <Icon size={12} />
      <b className="font-semibold tabular-nums">
        {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
      </b>
      <span className="opacity-90">{suffix}</span>
    </Tag>
  )
}

// ────────────────────────────────────────────────────────────
// FilterToggle — checkbox + ícone + label coerente.
// ────────────────────────────────────────────────────────────
export function FilterToggle({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon?: React.ElementType
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-aletis-grafite-escuro dark:text-white/75 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-aletis-verde w-3.5 h-3.5"
      />
      {Icon && <Icon size={12} className="text-aletis-grafite-medio dark:text-white/45" />}
      <span>{label}</span>
    </label>
  )
}

// ────────────────────────────────────────────────────────────
// CardSection — contêiner padrão branco com header + body + footer.
// Usado em painéis de listagem, filtros, tabelas de detalhe, etc.
// ────────────────────────────────────────────────────────────
export function CardSection({
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
  footer,
  className,
  padded = true,
  tone = 'neutral',
}: {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  icon?: React.ElementType
  actions?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  padded?: boolean
  tone?: 'neutral' | 'verde' | 'dourado'
}) {
  const toneBorder =
    tone === 'verde'
      ? 'border-aletis-verde/30'
      : tone === 'dourado'
        ? 'border-aletis-dourado/30'
        : 'border-aletis-borda dark:border-white/5'
  return (
    <section
      className={`bg-white dark:bg-aletis-grafite-escuro rounded-2xl border ${toneBorder} shadow-sm overflow-hidden ${
        className || ''
      }`}
    >
      {(title || actions) && (
        <header className="px-5 lg:px-6 py-4 border-b border-aletis-borda/70 dark:border-white/5 flex items-center gap-3 flex-wrap">
          {Icon && <Icon size={16} className="text-aletis-verde" />}
          <div className="min-w-0 flex-1">
            {title && (
              <h3 className="font-semibold text-sm text-aletis-grafite-escuro dark:text-white leading-tight">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-[11px] text-aletis-grafite-medio dark:text-white/45 mt-0.5">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'px-5 lg:px-6 py-5' : ''}>{children}</div>
      {footer && (
        <footer className="px-5 lg:px-6 py-3 border-t border-aletis-borda/70 dark:border-white/5 bg-aletis-bege/30 dark:bg-white/[0.02]">
          {footer}
        </footer>
      )}
    </section>
  )
}

// ────────────────────────────────────────────────────────────
// PageHero — hero escuro compartilhado (Prospecção inspira).
// ────────────────────────────────────────────────────────────
export function PageHero({
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  title,
  description,
  meta,
  sidebar,
  children,
}: {
  eyebrow?: string
  eyebrowIcon?: React.ElementType
  title: React.ReactNode
  description?: React.ReactNode
  meta?: React.ReactNode
  sidebar?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-aletis-verde via-aletis-verde-escuro to-[#1d3024] text-aletis-cream shadow-brand-lg">
      <div
        className="absolute inset-0 opacity-[0.16] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 12% 20%, #cb9d52 0%, transparent 45%), radial-gradient(circle at 92% 85%, #b2bda1 0%, transparent 45%), url(/brand/pattern/repetidor.png)',
          backgroundSize: 'auto, auto, 360px',
          backgroundBlendMode: 'normal, normal, soft-light',
          backgroundRepeat: 'no-repeat, no-repeat, repeat',
        }}
      />
      {/* Watermark do símbolo bracket-A — assinatura ornamental do hero */}
      <BrandWatermark
        size={520}
        tone="cream"
        opacity={0.06}
        className="absolute -right-24 -bottom-32 hidden md:block"
        rotate={-8}
      />
      <BrandWatermark
        size={180}
        tone="gold"
        opacity={0.09}
        className="absolute right-10 -top-6 hidden lg:block"
      />
      <div className="relative px-6 py-7 lg:px-10 lg:py-9 space-y-7">
        <header className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-6 items-start">
          <div className="min-w-0">
            {eyebrow && (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-aletis-gold/18 border border-aletis-gold/40 text-aletis-gold text-[10.5px] font-display font-semibold uppercase tracking-[0.18em]">
                {EyebrowIcon && <EyebrowIcon size={12} />}
                {eyebrow}
              </span>
            )}
            <h1 className="mt-3 font-display text-[28px] lg:text-[38px] font-bold leading-[1.05] tracking-[0.005em] text-aletis-cream">
              {title}
            </h1>
            {description && (
              <p className="mt-2 font-body text-aletis-sage-claro/85 text-sm lg:text-[13.5px] max-w-2xl leading-relaxed">
                {description}
              </p>
            )}
            {meta && <div className="mt-4">{meta}</div>}
          </div>
          {sidebar && (
            <div className="flex flex-col items-start lg:items-end gap-2 min-w-0">{sidebar}</div>
          )}
        </header>
        {children}
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────
// InlineButton — botões padrão do design-system.
// ────────────────────────────────────────────────────────────
export function InlineButton({
  variant = 'primary',
  icon: Icon,
  loading,
  disabled,
  onClick,
  children,
  size = 'sm',
  type = 'button',
  className,
}: {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'gold'
  icon?: React.ElementType
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  children: React.ReactNode
  size?: 'sm' | 'md'
  type?: 'button' | 'submit'
  className?: string
}) {
  const sizeCls = size === 'md' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs'
  const vcls = {
    primary: 'bg-aletis-verde text-white hover:bg-aletis-verde-escuro disabled:opacity-50 font-semibold',
    secondary:
      'bg-aletis-bege dark:bg-white/5 text-aletis-grafite-escuro dark:text-white hover:bg-aletis-verde/10 font-medium',
    outline:
      'border border-aletis-verde/30 text-aletis-verde hover:bg-aletis-verde/10 font-medium',
    gold:
      'bg-aletis-gold text-aletis-verde hover:bg-aletis-gold-escuro hover:text-aletis-cream font-semibold shadow-brand-gold',
    ghost: 'text-aletis-grafite-medio dark:text-white/60 hover:bg-aletis-bege/60 dark:hover:bg-white/5',
    danger:
      'border border-red-300/60 dark:border-red-700/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 font-medium',
  }[variant]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center gap-1.5 rounded-lg transition disabled:opacity-50 ${sizeCls} ${vcls} ${
        className || ''
      }`}
    >
      {loading ? <Loader2 size={size === 'md' ? 14 : 12} className="animate-spin" /> : Icon && <Icon size={size === 'md' ? 14 : 12} />}
      {children}
    </button>
  )
}
