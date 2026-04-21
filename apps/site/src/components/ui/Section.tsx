import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

interface SectionProps {
  id?: string
  children: ReactNode
  className?: string
  tone?: 'marfim' | 'bege' | 'escuro' | 'profundo'
  compact?: boolean
}

const toneClasses: Record<NonNullable<SectionProps['tone']>, string> = {
  marfim: 'bg-aletis-marfim text-aletis-grafite-escuro',
  bege: 'bg-aletis-bege text-aletis-grafite-escuro',
  escuro:
    'bg-gradient-to-b from-aletis-verde-escuro via-aletis-verde-escuro to-aletis-verde-profundo text-white',
  profundo:
    'bg-gradient-to-b from-aletis-verde-profundo via-[#04140F] to-aletis-verde-profundo text-white',
}

export function Section({ id, children, className, tone = 'marfim', compact }: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        'relative',
        toneClasses[tone],
        compact ? 'py-16 md:py-20' : 'py-24 md:py-32',
        className,
      )}
    >
      {(tone === 'escuro' || tone === 'profundo') && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.08] bg-grain mix-blend-overlay"
        />
      )}
      {children}
    </section>
  )
}
