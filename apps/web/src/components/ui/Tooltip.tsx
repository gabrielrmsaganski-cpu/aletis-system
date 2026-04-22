/**
 * Tooltip — popover leve, CSS-only no posicionamento,
 * mas com delay em JS para evitar piscar ao mover o mouse.
 *
 * Uso:
 *   <Tooltip label="Texto curto" description="Parágrafo opcional" placement="right">
 *     <button>...</button>
 *   </Tooltip>
 */
import { cloneElement, isValidElement, useEffect, useRef, useState } from 'react'

interface TooltipProps {
  label: string
  description?: string
  placement?: 'right' | 'top' | 'bottom' | 'left'
  delay?: number
  children: React.ReactElement
  disabled?: boolean
}

const PLACEMENT_CLASSES: Record<NonNullable<TooltipProps['placement']>, string> = {
  right: 'left-full top-1/2 -translate-y-1/2 ml-3',
  left: 'right-full top-1/2 -translate-y-1/2 mr-3',
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
}

export default function Tooltip({
  label,
  description,
  placement = 'right',
  delay = 180,
  children,
  disabled,
}: TooltipProps) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  const show = () => {
    if (disabled) return
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(true), delay)
  }
  const hide = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    setOpen(false)
  }

  if (!isValidElement(children)) return children

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={`
            pointer-events-none absolute z-[60]
            ${PLACEMENT_CLASSES[placement]}
            rounded-xl border border-aletis-borda dark:border-white/10
            bg-white dark:bg-aletis-grafite-escuro
            shadow-[0_20px_50px_-20px_rgba(15,76,53,0.35)]
            px-3.5 py-2.5 min-w-[180px] max-w-[280px]
            animate-fade-in
          `}
        >
          <span className="block text-[13px] font-semibold text-aletis-grafite-escuro dark:text-white leading-tight">
            {label}
          </span>
          {description && (
            <span className="mt-1 block text-[11px] leading-relaxed text-aletis-grafite-medio dark:text-white/60">
              {description}
            </span>
          )}
        </span>
      )}
    </span>
  )
}
