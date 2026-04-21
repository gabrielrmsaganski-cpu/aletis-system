import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost'

interface BaseProps {
  variant?: Variant
  className?: string
  children: ReactNode
}

const variantMap: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
}

export function Button({
  variant = 'primary',
  className,
  children,
  ...rest
}: BaseProps & ComponentProps<'button'>) {
  return (
    <button className={cn(variantMap[variant], className)} {...rest}>
      {children}
    </button>
  )
}

export function ButtonLink({
  variant = 'primary',
  className,
  children,
  href,
  ...rest
}: BaseProps & ComponentProps<typeof Link>) {
  return (
    <Link href={href} className={cn(variantMap[variant], className)} {...rest}>
      {children}
    </Link>
  )
}
