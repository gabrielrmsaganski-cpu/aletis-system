import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { uiAction } from "./foundation"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 ease-glide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aletis-gold/50 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: uiAction.primary,
        destructive: uiAction.danger,
        outline:
          "border border-aletis-verde/25 bg-transparent text-foreground hover:border-aletis-verde/45 hover:bg-aletis-verde/5",
        secondary: uiAction.secondary,
        ghost: uiAction.ghost,
        link:
          "rounded-none px-0 text-aletis-gold underline-offset-4 hover:underline",
        gold:
          "bg-aletis-gold text-foreground shadow-brand-gold hover:bg-aletis-gold-escuro hover:text-aletis-cream",
        glass:
          "border border-white/40 bg-white/70 text-foreground shadow-soft backdrop-blur-lg hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-aletis-cream",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-5 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
