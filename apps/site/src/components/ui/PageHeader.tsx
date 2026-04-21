import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Reveal } from '@/components/ui/Reveal'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  eyebrow?: string
  titulo: React.ReactNode
  subtitulo?: React.ReactNode
  breadcrumbs?: BreadcrumbItem[]
  align?: 'left' | 'center'
}

export function PageHeader({
  eyebrow,
  titulo,
  subtitulo,
  breadcrumbs,
  align = 'left',
}: PageHeaderProps) {
  return (
    <header className="relative isolate overflow-hidden bg-gradient-to-br from-aletis-verde-profundo via-aletis-verde-escuro to-aletis-verde-profundo text-white">
      <div aria-hidden="true" className="absolute inset-0 bg-hero-radial" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06] bg-grain mix-blend-overlay"
      />
      <Container className="relative py-24 md:py-32">
        <div className={align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
          {breadcrumbs && breadcrumbs.length > 0 && (
            <Reveal>
              <nav
                aria-label="Breadcrumb"
                className={`mb-8 flex flex-wrap items-center gap-1.5 text-xs text-white/50 ${
                  align === 'center' ? 'justify-center' : ''
                }`}
              >
                {breadcrumbs.map((b, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    {b.href ? (
                      <Link
                        href={b.href}
                        className="transition hover:text-aletis-dourado"
                      >
                        {b.label}
                      </Link>
                    ) : (
                      <span className="text-white/80">{b.label}</span>
                    )}
                    {i < breadcrumbs.length - 1 && <ChevronRight className="h-3 w-3" />}
                  </span>
                ))}
              </nav>
            </Reveal>
          )}
          {eyebrow && (
            <Reveal delay={60}>
              <Eyebrow light>{eyebrow}</Eyebrow>
            </Reveal>
          )}
          <Reveal delay={120}>
            <h1 className="mt-6 font-display text-[40px] font-semibold leading-[1.05] tracking-tight md:text-[56px] lg:text-[64px]">
              {titulo}
            </h1>
          </Reveal>
          {subtitulo && (
            <Reveal delay={200}>
              <p className="mt-6 text-lg leading-relaxed text-white/70 md:text-xl">
                {subtitulo}
              </p>
            </Reveal>
          )}
        </div>
      </Container>
      <div
        aria-hidden="true"
        className="relative h-px w-full bg-gradient-to-r from-transparent via-aletis-dourado/40 to-transparent"
      />
    </header>
  )
}
