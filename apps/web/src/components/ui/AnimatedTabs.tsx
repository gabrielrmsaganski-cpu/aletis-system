/**
 * AnimatedTabs — sistema de abas unificado com indicador dourado animado.
 *
 * Usa layoutId do Framer Motion para o indicador deslizar suavemente
 * entre as abas. Substitui todas as implementações manuais de tabs
 * espalhadas pelo sistema.
 *
 * Uso:
 *   <AnimatedTabs
 *     tabs={[
 *       { id: 'orcamento', label: 'Orçamento', icon: Calculator },
 *       { id: 'cronograma', label: 'Cronograma' },
 *     ]}
 *     active={activeTab}
 *     onChange={setActiveTab}
 *   />
 */
import { motion } from 'framer-motion'
import { useId, type ElementType, type ReactNode } from 'react'

export interface TabDef {
  id: string
  label: string
  icon?: ElementType
  badge?: ReactNode
  disabled?: boolean
}

interface AnimatedTabsProps {
  tabs: TabDef[]
  active: string
  onChange: (id: string) => void
  /** Variante visual: 'default' (fundo + indicador) | 'pills' (botões) | 'underline' (linha sutil) */
  variant?: 'default' | 'pills' | 'underline'
  /** Tamanho das abas */
  size?: 'sm' | 'md'
  className?: string
  /** Conteúdo extra à direita das abas */
  trailing?: ReactNode
}

export default function AnimatedTabs({
  tabs,
  active,
  onChange,
  variant = 'underline',
  size = 'md',
  className = '',
  trailing,
}: AnimatedTabsProps) {
  const instanceId = useId()
  const sizeCls =
    size === 'sm'
      ? 'text-xs px-3 py-2 gap-1'
      : 'text-[13px] px-4 py-2.5 gap-2'

  const variantWrapper = {
    default:
      'inline-flex items-center gap-1 p-1 rounded-xl bg-aletis-cream dark:bg-white/[0.04] border border-aletis-borda/60 dark:border-white/5',
    pills: 'inline-flex items-center gap-1.5',
    underline: 'inline-flex items-center gap-0 border-b border-aletis-borda dark:border-white/10',
  }[variant]

  return (
    <div className={`flex min-w-0 max-w-full items-center gap-3 ${className}`}>
      <div className="min-w-0 flex-1 overflow-x-auto custom-scrollbar scroll-smooth snap-x snap-mandatory">
        <div className={`${variantWrapper} min-w-max`} role="tablist">
          {tabs.map((tab) => {
            const isActive = tab.id === active
            const Icon = tab.icon

            const baseCls =
              variant === 'default'
                ? `relative inline-flex items-center justify-center rounded-lg font-display font-medium transition-colors ${sizeCls} ${
                    isActive
                      ? 'text-foreground dark:text-aletis-cream'
                      : 'text-muted-foreground dark:text-white/50 hover:text-aletis-verde dark:hover:text-white/70'
                  }`
                : variant === 'pills'
                  ? `relative inline-flex items-center justify-center rounded-full font-display font-medium tracking-wide transition-colors ${sizeCls} ${
                      isActive
                        ? 'text-foreground dark:text-aletis-cream bg-aletis-gold/15 dark:bg-aletis-gold/20'
                        : 'text-muted-foreground dark:text-white/50 hover:bg-aletis-cream dark:hover:bg-white/5'
                    }`
                  : `relative inline-flex items-center justify-center font-display font-medium tracking-wide transition-colors ${sizeCls} ${
                      isActive
                        ? 'text-foreground dark:text-aletis-cream'
                        : 'text-muted-foreground dark:text-white/50 hover:text-aletis-verde dark:hover:text-white/70'
                    }`

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                tabIndex={isActive ? 0 : -1}
                aria-selected={isActive}
                aria-disabled={tab.disabled}
                disabled={tab.disabled}
                onClick={() => !tab.disabled && onChange(tab.id)}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                  event.preventDefault()
                  const enabled = tabs.filter(item => !item.disabled)
                  const index = enabled.findIndex(item => item.id === tab.id)
                  const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length
                  const next = enabled[nextIndex]
                  if (!next) return
                  onChange(next.id)
                  const buttons = event.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')
                  buttons?.[nextIndex]?.focus()
                }}
                className={`${baseCls} disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0 snap-start`}
              >
                {/* Indicador animado — só na variante default */}
                {variant === 'default' && isActive && (
                  <motion.div
                    layoutId={`${instanceId}-indicator`}
                    className="absolute inset-0 rounded-lg bg-card dark:bg-white/[0.08] shadow-sm border border-aletis-borda/40 dark:border-white/5"
                    transition={{ duration: .18 }}
                    style={{ zIndex: 0 }}
                  />
                )}

                {/* Indicador underline — variante underline */}
                {variant === 'underline' && isActive && (
                  <motion.div
                    layoutId={`${instanceId}-underline`}
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-aletis-gold rounded-full"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}

                <span className="relative z-10 inline-flex items-center gap-1.5">
                  {Icon && <Icon size={size === 'sm' ? 13 : 15} />}
                  {tab.label}
                  {tab.badge}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {trailing && <div className="flex-shrink-0">{trailing}</div>}
    </div>
  )
}
