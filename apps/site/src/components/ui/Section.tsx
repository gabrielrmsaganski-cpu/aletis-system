import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

interface SectionProps {
  id?: string
  children: ReactNode
  className?: string
  tone?: 'marfim' | 'bege' | 'escuro' | 'profundo' | 'cream'
  compact?: boolean
}

const toneClasses: Record<NonNullable<SectionProps['tone']>, string> = {
  marfim: 'bg-aletis-cream-marfim text-aletis-verde',
  cream: 'bg-aletis-cream text-aletis-verde',
  bege: 'bg-aletis-cream-papel text-aletis-verde',
  escuro: 'bg-aletis-hero text-aletis-cream',
  profundo: 'bg-aletis-hero text-aletis-cream',
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
