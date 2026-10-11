import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Calendar, Clock } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import { insights, categoriasLabel } from '@/lib/insights'
import { fmtDate } from '@/lib/formatters'

export const metadata: Metadata = {
  title: 'Insights · Teses técnicas, mercado e reestruturação',
  description:
    'Editorial da ALETIS: teses revisionais, inteligência de mercado, DSCR aplicado ao agro, tecnologia ALIX e negociação com múltiplos credores.',
  alternates: { canonical: '/insights' },
}

const ordenado = [...insights].sort((a, b) => b.publicadoEm.localeCompare(a.publicadoEm))
const destaque = ordenado[0]
const demais = ordenado.slice(1)

export default function InsightsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Insights"
        titulo={
          <>
            Teses para decidir melhor{' '}
            <span className="italic text-aletis-dourado">antes da negociação</span>.
          </>
        }
        subtitulo="Reflexões técnicas sobre reestruturação de dívida, revisão de crédito rural, inteligência de mercado e tecnologia aplicada — com linguagem direta e foco no que muda a decisão."
        breadcrumbs={[
          { label: 'Início', href: '/' },
          { label: 'Insights' },
        ]}
      />

      <Section tone="marfim">
        <Container>
          {/* Destaque */}
          <Reveal>
            <Link
              href={`/insights/${destaque.slug}`}
              className="group block overflow-hidden rounded-3xl border border-aletis-borda/70 bg-gradient-to-br from-aletis-verde-escuro to-aletis-verde-profundo p-8 text-white shadow-premium transition-all duration-500 hover:-translate-y-0.5 hover:shadow-premium md:p-12"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-[0.06] bg-grain mix-blend-overlay"
              />
              <div className="relative grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-end">
                <div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado">
                    <span className="rounded-full border border-aletis-dourado/40 bg-aletis-dourado/10 px-3 py-1">
                      {categoriasLabel[destaque.categoria]}
                    </span>
                    <span className="flex items-center gap-1.5 text-white/70">
                      <Calendar className="h-3 w-3" /> {fmtDate(destaque.publicadoEm)}
                    </span>
                    <span className="flex items-center gap-1.5 text-white/70">
                      <Clock className="h-3 w-3" /> {destaque.leituraMin} min de leitura
                    </span>
                  </div>
                  <h2 className="mt-5 font-display text-3xl font-semibold leading-tight md:text-[40px] md:leading-[1.15]">
                    {destaque.titulo}
                  </h2>
                  <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-white/75">
                    {destaque.resumo}
                  </p>
                </div>
                <div className="flex flex-col gap-4 lg:items-end">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest2 text-aletis-dourado">
                      Por
                    </p>
                    <p className="mt-1 font-display text-lg font-semibold">{destaque.autor}</p>
                    <p className="text-[12px] text-white/60">{destaque.autorRole}</p>
                  </div>
                  <span className="group/link inline-flex items-center gap-2 font-display text-[12px] font-semibold uppercase tracking-wider2 text-aletis-dourado">
                    Ler artigo completo
                    <ArrowRight className="h-4 w-4 transition group-hover/link:translate-x-1 group-hover:translate-x-1" />
                  </span>
                </div>
              </div>
            </Link>
          </Reveal>

          {/* Grid de demais */}
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {demais.map((a, i) => (
              <Reveal key={a.slug} delay={i * 60}>
                <Link
                  href={`/insights/${a.slug}`}
                  className="group flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-aletis-borda/70 bg-white p-7 transition-all duration-500 hover:-translate-y-1 hover:border-aletis-dourado/40 hover:shadow-premium-sm"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-display font-semibold uppercase tracking-widest2">
                      <span className="rounded-full border border-aletis-dourado/40 bg-aletis-dourado/10 px-2.5 py-1 text-aletis-dourado-escuro">
                        {categoriasLabel[a.categoria]}
                      </span>
                      <span className="text-aletis-grafite-claro">
                        {fmtDate(a.publicadoEm)}
                      </span>
                    </div>
                    <h3 className="mt-5 font-display text-xl font-semibold leading-snug text-aletis-grafite-escuro transition group-hover:text-aletis-verde-escuro">
                      {a.titulo}
                    </h3>
                    <p className="mt-3 text-[14px] leading-relaxed text-aletis-grafite-medio">
                      {a.resumo}
                    </p>
                  </div>
                  <div className="mt-6 flex items-center justify-between border-t border-aletis-borda/60 pt-4 text-[12px]">
                    <div>
                      <p className="font-display font-semibold text-aletis-grafite-escuro">
                        {a.autor}
                      </p>
                      <p className="text-aletis-grafite-claro">
                        {a.leituraMin} min · {a.autorRole}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-aletis-dourado-escuro transition group-hover:translate-x-1" />
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>
    </>
  )
}
