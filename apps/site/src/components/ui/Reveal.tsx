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
 * Fade-up por IntersectionObserver com fallback seguro.
 * Padrão SSR: visível. JS esconde apenas se o elemento estiver fora do
 * viewport na hidratação, evitando conteúdo bloqueado para crawlers,
 * reader-mode, ou usuários sem JS.
 */
export function Reveal({ children, className, delay = 0, as: Tag = 'div' }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null)
  const [state, setState] = useState<'idle' | 'hidden' | 'visible'>('idle')

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (typeof IntersectionObserver === 'undefined') {
      setState('visible')
      return
    }

    const rect = el.getBoundingClientRect()
    const viewportH = window.innerHeight || document.documentElement.clientHeight
    const alreadyVisible = rect.top < viewportH - 60

    if (alreadyVisible) {
      setState('visible')
      return
    }

    setState('hidden')
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setState('visible')
            obs.disconnect()
          }
        })
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const Component = Tag as any
  return (
    <Component
      ref={ref}
      className={cn(
        'reveal',
        state === 'hidden' && 'is-hidden',
        state === 'visible' && 'is-visible',
        className,
      )}
      style={{ ['--reveal-delay' as any]: `${delay}ms` }}
    >
      {children}
    </Component>
  )
}
