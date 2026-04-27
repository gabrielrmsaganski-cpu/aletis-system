import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, ArrowLeft, Calendar, Clock, Tag, Quote } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import {
  getInsightBySlug,
  getAllSlugs,
  getRelatedInsights,
  categoriasLabel,
  type InsightBlock,
} from '@/lib/insights'
import { fmtDate } from '@/lib/formatters'
import { siteConfig } from '@/lib/siteConfig'

type Props = { params: { slug: string } }

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const insight = getInsightBySlug(params.slug)
  if (!insight) return { title: 'Insight não encontrado' }
  return {
    title: insight.titulo,
    description: insight.resumo,
    alternates: {
      canonical: `/insights/${insight.slug}`,
    },
    openGraph: {
      title: insight.titulo,
      description: insight.resumo,
      type: 'article',
      url: `${siteConfig.url}/insights/${insight.slug}`,
      publishedTime: insight.publicadoEm,
      authors: [insight.autor],
      tags: [...insight.tags],
    },
    twitter: {
      card: 'summary_large_image',
      title: insight.titulo,
      description: insight.resumo,
    },
  }
}

function Block({ block }: { block: InsightBlock }) {
  switch (block.type) {
    case 'h2':
      return (
        <h2 className="mt-12 font-display text-2xl font-semibold text-aletis-grafite-escuro md:text-[28px]">
          {block.content as string}
        </h2>
      )
    case 'h3':
      return (
        <h3 className="mt-8 font-display text-xl font-semibold text-aletis-grafite-escuro">
          {block.content as string}
        </h3>
      )
    case 'paragrafo':
      return (
        <p className="mt-5 text-[17px] leading-[1.75] text-aletis-grafite-medio">
          {block.content as string}
        </p>
      )
    case 'lista':
      return (
        <ul className="mt-6 space-y-3 text-[16px] leading-relaxed text-aletis-grafite-medio">
          {(block.content as string[]).map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-aletis-dourado" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )
    case 'citacao':
      return (
        <blockquote className="relative mt-10 rounded-2xl border-l-2 border-aletis-dourado bg-aletis-bege/60 px-8 py-7">
          <Quote
            className="absolute -top-3 left-6 h-8 w-8 text-aletis-dourado opacity-60"
            aria-hidden="true"
          />
          <p className="font-display text-[19px] italic leading-[1.6] text-aletis-grafite-escuro">
            {block.content as string}
          </p>
        </blockquote>
      )
    case 'destaque':
      return (
        <div className="mt-10 rounded-2xl border border-aletis-dourado/40 bg-gradient-to-br from-aletis-verde-escuro to-aletis-verde-profundo p-7 text-white">
          <p className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado">
            Princípio da mesa
          </p>
          <p className="mt-3 text-[16px] leading-relaxed">
            {block.content as string}
          </p>
        </div>
      )
    default:
      return null
  }
}

export default function InsightDetail({ params }: Props) {
  const insight = getInsightBySlug(params.slug)
  if (!insight) notFound()

  const relacionados = getRelatedInsights(params.slug, 3)

  // JSON-LD Article — schema.org/Article + BreadcrumbList.
  // Schema.org Article eleva o snippet do Google e enriquece prévia
  // do LinkedIn. BreadcrumbList expõe a navegação Home→Insights→Artigo.
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: insight.titulo,
    description: insight.resumo,
    image: `${siteConfig.url}/opengraph-image`,
    datePublished: insight.publicadoEm,
    dateModified: insight.publicadoEm,
    author: {
      '@type': 'Person',
      name: insight.autor,
      jobTitle: insight.autorRole,
      affiliation: { '@type': 'Organization', name: siteConfig.name },
    },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.name,
      logo: {
        '@type': 'ImageObject',
        url: `${siteConfig.url}/brand/logos/aletis-principal-cream.png`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${siteConfig.url}/insights/${insight.slug}`,
    },
    keywords: insight.tags.join(', '),
    articleSection: categoriasLabel[insight.categoria],
    inLanguage: 'pt-BR',
    timeRequired: `PT${insight.leituraMin}M`,
  }
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: siteConfig.url },
      { '@type': 'ListItem', position: 2, name: 'Insights', item: `${siteConfig.url}/insights` },
      { '@type': 'ListItem', position: 3, name: insight.titulo, item: `${siteConfig.url}/insights/${insight.slug}` },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {/* Hero dedicado */}
      <section className="relative overflow-hidden bg-gradient-to-b from-aletis-verde-profundo via-aletis-verde-escuro to-aletis-verde-escuro pb-20 pt-32 text-white md:pb-28 md:pt-40">
        <div aria-hidden="true" className="absolute inset-0 bg-hero-radial opacity-80" />
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.06] bg-grain mix-blend-overlay" />

        <Container className="relative">
          <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-[12px] text-white/60">
            <Link href="/" className="hover:text-aletis-dourado">Início</Link>
            <span>/</span>
            <Link href="/insights" className="hover:text-aletis-dourado">Insights</Link>
            <span>/</span>
            <span className="text-white/80">{categoriasLabel[insight.categoria]}</span>
          </nav>

          <div className="max-w-3xl">
            <span className="inline-flex items-center rounded-full border border-aletis-dourado/40 bg-aletis-dourado/10 px-3 py-1 text-[11px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado">
              {categoriasLabel[insight.categoria]}
            </span>
            <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.1] md:text-[52px]">
              {insight.titulo}
            </h1>
            <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-white/75">
              {insight.resumo}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px] text-white/70">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-aletis-dourado/40 bg-aletis-dourado/10 font-display text-xs font-bold text-aletis-dourado">
                  {insight.autor
                    .split(' ')
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join('')}
                </span>
                <div>
                  <p className="font-display text-[13px] font-semibold text-white">
                    {insight.autor}
                  </p>
                  <p className="text-[11px]">{insight.autorRole}</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-aletis-dourado" />
                {fmtDate(insight.publicadoEm)}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-aletis-dourado" />
                {insight.leituraMin} min de leitura
              </span>
            </div>
          </div>
        </Container>
      </section>

      {/* Corpo */}
      <Section tone="marfim">
        <Container>
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_260px]">
            <article className="min-w-0">
              {insight.corpo.map((block, i) => (
                <Block key={i} block={block} />
              ))}

              {/* Tags */}
              <div className="mt-14 flex flex-wrap items-center gap-2 border-t border-aletis-borda/70 pt-8">
                <Tag className="h-4 w-4 text-aletis-dourado-escuro" aria-hidden="true" />
                {insight.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-aletis-borda bg-white px-3 py-1 text-[11px] font-display uppercase tracking-widest2 text-aletis-grafite-medio"
                  >
                    {t}
                  </span>
                ))}
              </div>

              {/* CTA inline */}
              <div className="mt-12 overflow-hidden rounded-2xl border border-aletis-dourado/30 bg-gradient-to-br from-aletis-bege to-aletis-marfim p-8 md:p-10">
                <p className="eyebrow">
                  <span className="gold-hairline" aria-hidden="true" />
                  Essa tese se aplica ao seu caso?
                </p>
                <h3 className="mt-3 font-display text-2xl font-semibold text-aletis-grafite-escuro md:text-[28px]">
                  Toda conversa começa com um diagnóstico. Gratuito. Em 72h.
                </h3>
                <p className="mt-2 max-w-xl text-[14px] text-aletis-grafite-medio">
                  Se algum contrato seu se parece com o que foi descrito aqui, faz sentido sentarmos.
                </p>
                <Link
                  href="/contato"
                  className="btn-primary mt-6 inline-flex"
                >
                  Solicitar diagnóstico
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <Link
                href="/insights"
                className="mt-12 inline-flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider2 text-aletis-verde-escuro hover:text-aletis-dourado-escuro"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar para todos os insights
              </Link>
            </article>

            {/* Sidebar sticky */}
            <aside className="hidden lg:block">
              <div className="sticky top-24 space-y-6">
                <div className="rounded-2xl border border-aletis-borda/70 bg-white p-5">
                  <p className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado-escuro">
                    Sobre este artigo
                  </p>
                  <p className="mt-3 text-[12px] text-aletis-grafite-medio">
                    Produzido pela mesa técnica ALETIS com base em casos reais, metodologia proprietária e revisão editorial sênior.
                  </p>
                </div>

                <div className="rounded-2xl border border-aletis-borda/70 bg-aletis-bege/60 p-5">
                  <p className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado-escuro">
                    Compartilhar
                  </p>
                  <div className="mt-3 grid gap-2 text-[12px]">
                    <a
                      href={`https://www.linkedin.com/sharing/share-offsite/?url=https://aletis.com.br/insights/${insight.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-aletis-borda bg-white px-3 py-2 font-display font-semibold text-aletis-grafite-escuro hover:border-aletis-dourado hover:text-aletis-verde-escuro"
                    >
                      LinkedIn
                    </a>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `${insight.titulo} — https://aletis.com.br/insights/${insight.slug}`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-aletis-borda bg-white px-3 py-2 font-display font-semibold text-aletis-grafite-escuro hover:border-aletis-dourado hover:text-aletis-verde-escuro"
                    >
                      WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </Container>
      </Section>

      {/* Relacionados */}
      {relacionados.length > 0 && (
        <Section tone="bege" compact>
          <Container>
            <Reveal>
              <p className="eyebrow">
                <span className="gold-hairline" aria-hidden="true" />
                Continuar lendo
              </p>
              <h2 className="mt-4 font-display text-2xl font-semibold text-aletis-grafite-escuro md:text-3xl">
                Outras teses da mesa.
              </h2>
            </Reveal>

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {relacionados.map((r, i) => (
                <Reveal key={r.slug} delay={i * 60}>
                  <Link
                    href={`/insights/${r.slug}`}
                    className="group flex h-full flex-col justify-between rounded-2xl border border-aletis-borda/70 bg-white p-6 transition hover:-translate-y-0.5 hover:border-aletis-dourado/40 hover:shadow-premium-sm"
                  >
                    <div>
                      <span className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado-escuro">
                        {categoriasLabel[r.categoria]}
                      </span>
                      <h3 className="mt-3 font-display text-lg font-semibold leading-snug text-aletis-grafite-escuro group-hover:text-aletis-verde-escuro">
                        {r.titulo}
                      </h3>
                      <p className="mt-3 text-[13px] leading-relaxed text-aletis-grafite-medio">
                        {r.resumo}
                      </p>
                    </div>
                    <span className="mt-5 inline-flex items-center gap-1.5 font-display text-[11px] font-semibold uppercase tracking-wider2 text-aletis-verde-escuro group-hover:text-aletis-dourado-escuro">
                      Ler artigo
                      <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </Reveal>
              ))}
            </div>
          </Container>
        </Section>
      )}
    </>
  )
}
