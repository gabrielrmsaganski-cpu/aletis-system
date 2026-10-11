import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border font-semibold font-display tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-aletis-verde text-white shadow-sm hover:bg-aletis-verde-medio",
        secondary:
          "border-transparent bg-aletis-sage/20 text-foreground hover:bg-aletis-sage/30",
        destructive:
          "border-transparent bg-red-50 text-red-700 hover:bg-red-100",
        outline: "text-foreground border-aletis-verde/20 hover:bg-aletis-sage/10",
        gold:
          "border-transparent bg-aletis-gold/10 text-aletis-gold-escuro hover:bg-aletis-gold/20",
        ghost:
          "border-transparent text-[var(--text-soft)] hover:bg-muted",
      },
      size: {
        default: "px-2.5 py-0.5 text-[11px]",
        sm: "px-2 py-0.5 text-[10px]",
        lg: "px-3 py-1 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
