import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { PageHeader } from '@/components/ui/PageHeader'
import { Reveal } from '@/components/ui/Reveal'
import { EduSidebar } from './EduSidebar'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'

interface EduLayoutProps {
  eyebrow?: string
  titulo: string
  subtitulo?: string
  breadcrumbs: { label: string; href?: string }[]
  prev?: { label: string; href: string }
  next?: { label: string; href: string }
  children: React.ReactNode
  fontes?: { label: string; href: string }[]
}

export function EduLayout({
  eyebrow = 'Educação ALETIS',
  titulo,
  subtitulo,
  breadcrumbs,
  prev,
  next,
  children,
  fontes,
}: EduLayoutProps) {
  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        titulo={titulo}
        subtitulo={subtitulo}
        breadcrumbs={breadcrumbs}
      />
      <Section tone="marfim">
        <Container>
          <div className="flex gap-10">
            <EduSidebar />
            <article className="flex-1 max-w-3xl">
              <Reveal>
                <div className="max-w-none">{children}</div>
              </Reveal>

              {fontes && fontes.length > 0 && (
                <Reveal>
                  <aside className="mt-12 rounded-lg border border-aletis-sage/30 bg-aletis-cream-papel p-6">
                    <p className="font-display text-[11px] font-semibold uppercase tracking-wider2 text-aletis-verde/60">
                      Fontes oficiais e referências
                    </p>
                    <ul className="mt-3 space-y-2 text-sm">
                      {fontes.map((f) => (
                        <li key={f.href}>
                          <a
                            href={f.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-aletis-verde underline decoration-aletis-gold/50 underline-offset-4 hover:text-aletis-gold"
                          >
                            {f.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-4 text-[11px] text-aletis-verde/60">
                      Conteúdo educacional. Não substitui análise jurídica ou financeira individual. Consulte sempre um profissional habilitado.
                    </p>
                  </aside>
                </Reveal>
              )}

              <nav
                aria-label="Navegação entre tópicos"
                className="mt-14 flex flex-col gap-3 border-t border-aletis-verde/10 pt-8 sm:flex-row sm:justify-between"
              >
                {prev ? (
                  <Link
                    href={prev.href}
                    className="group inline-flex items-center gap-3 rounded-lg border border-aletis-verde/15 px-5 py-3 text-sm transition hover:border-aletis-gold hover:bg-aletis-cream-papel"
                  >
                    <ArrowLeft className="h-4 w-4 text-aletis-verde/50 transition group-hover:-translate-x-0.5 group-hover:text-aletis-gold" />
                    <div className="text-left">
                      <span className="block text-[10px] uppercase tracking-wider2 text-aletis-verde/50">
                        Anterior
                      </span>
                      <span className="block font-display text-[13px] font-semibold text-aletis-verde">
                        {prev.label}
                      </span>
                    </div>
                  </Link>
                ) : (
                  <span />
                )}
                {next && (
                  <Link
                    href={next.href}
                    className="group inline-flex items-center gap-3 rounded-lg border border-aletis-verde/15 px-5 py-3 text-sm transition hover:border-aletis-gold hover:bg-aletis-cream-papel sm:text-right"
                  >
                    <div className="text-right">
                      <span className="block text-[10px] uppercase tracking-wider2 text-aletis-verde/50">
                        Próximo
                      </span>
                      <span className="block font-display text-[13px] font-semibold text-aletis-verde">
                        {next.label}
                      </span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-aletis-verde/50 transition group-hover:translate-x-0.5 group-hover:text-aletis-gold" />
                  </Link>
                )}
              </nav>
            </article>
          </div>
        </Container>
      </Section>
    </>
  )
}
