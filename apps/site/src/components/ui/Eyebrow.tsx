import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

export function Eyebrow({
  children,
  light,
  className,
}: {
  children: ReactNode
  light?: boolean
  className?: string
}) {
  return (
    <span className={cn('eyebrow', light && 'eyebrow--light', className)}>
      <span className="gold-hairline" aria-hidden="true" />
      {children}
    </span>
  )
}
