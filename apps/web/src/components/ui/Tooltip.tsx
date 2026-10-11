import type { ReactElement } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

interface TooltipProps {
  label: string
  description?: string
  placement?: 'right' | 'top' | 'bottom' | 'left'
  delay?: number
  children: ReactElement
  disabled?: boolean
}

/** Portal evita recorte na navegação com rolagem; Radix mantém foco e Escape. */
export default function Tooltip({ label, description, placement = 'right', delay = 180, children, disabled }: TooltipProps) {
  if (disabled) return children

  return (
    <TooltipPrimitive.Provider delayDuration={delay}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={placement}
            sideOffset={10}
            collisionPadding={12}
            className="z-[100] max-w-[280px] rounded-lg border border-border bg-popover px-3 py-2.5 text-popover-foreground shadow-lg animate-fade-in"
          >
            <span className="block text-[13px] font-semibold leading-tight">{label}</span>
            {description && <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
