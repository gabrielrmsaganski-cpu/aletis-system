import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

export function Container({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  as?: keyof JSX.IntrinsicElements
}) {
  const Component = Tag as any
  return <Component className={cn('container-refined', className)}>{children}</Component>
}
