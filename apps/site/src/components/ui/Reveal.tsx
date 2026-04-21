'use client'

import { useEffect, useRef, useState, type ReactNode, type ElementType } from 'react'
import { cn } from '@/lib/cn'

interface RevealProps {
  children: ReactNode
  className?: string
  delay?: number
  as?: ElementType
}

/**
 * Componente de entrada suave por IntersectionObserver.
 * Mantém o HTML acessível e funcional mesmo sem JS (css .reveal base cuida disso).
 */
export function Reveal({ children, className, delay = 0, as: Tag = 'div' }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || visible) return

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true)
            obs.disconnect()
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [visible])

  const Component = Tag as any
  return (
    <Component
      ref={ref}
      className={cn('reveal', visible && 'is-visible', className)}
      style={{ ['--reveal-delay' as any]: `${delay}ms` }}
    >
      {children}
    </Component>
  )
}
