import { Wheat, Building2, Sprout, ShieldCheck, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'

/**
 * Pilares — 4 verticais de serviço da ALETIS conforme Manual de
 * Identidade Visual: Agro, Corporate, Fomento e Gestão.
 * Cada pilar tem ícone temático, número, descrição e os 3 entregáveis
 * principais como chips. Hover revela rail dourado lateral.
 */
const ICONS = { Wheat, Building2, Sprout, ShieldCheck }

const itens = [
  {
    icone: 'Wheat' as const,
    numero: '01',
    titulo: 'ALETIS Agro',
    selo: 'Finanças Estratégicas & Agrobusiness',
    descricao:
      'A pilastra original — diagnóstico financeiro auditável, reestruturação multi-credor e revisional contratual para o produtor rural. Visão de safra, basis e clima junto à mesa.',
    detalhes: [
      'Reestruturação de dívida rural',
      'Revisional CPR / crédito rural',
      'Mesa multi-credor',
    ],
  },
  {
    icone: 'Building2' as const,
    numero: '02',
    titulo: 'ALETIS Corporate',
    selo: 'BPO & Gestão Financeira para Empresas',
    descricao:
      'BPO financeiro completo, fechamento mensal contábil-fiscal, planejamento orçamentário e relatórios DRE/DSCR para empresas que querem clareza sem manter departamento interno.',
    detalhes: [
      'BPO financeiro mensal',
      'Fechamento contábil-fiscal',
      'Painéis DRE / DSCR / fluxo',
    ],
  },
  {
    icone: 'Sprout' as const,
    numero: '03',
    titulo: 'ALETIS Fomento',
    selo: 'Crédito & Reestruturação',
    descricao:
      'Captação de crédito estruturado, originação de operações de FIDC, BNDES e linhas privadas, e desenho de garantias otimizadas — desde o pitch até o desembolso.',
    detalhes: [
      'Estruturação de crédito',
      'FIDC / BNDES / privados',
      'Otimização de garantias',
    ],
  },
  {
    icone: 'ShieldCheck' as const,
    numero: '04',
    titulo: 'ALETIS Gestão',
    selo: 'Governança & Controles',
    descricao:
      'Governança corporativa, controles internos, compliance fiscal e mapeamento de risco para grupos familiares e empresas que precisam profissionalizar a gestão sem burocratizar.',
    detalhes: [
      'Governança & conselhos',
      'Controles internos / SOX-lite',
      'Compliance fiscal e LGPD',
    ],
  },
]

export function Pilares() {
  return (
    <Section tone="marfim" id="pilares">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <Reveal className="lg:sticky lg:top-28 lg:self-start">
            <Eyebrow>Como pensamos</Eyebrow>
            <h2 className="mt-6 display-lg text-aletis-verde">
              Quatro pilares.{' '}
              <span className="italic text-gold-gradient">Uma única mesa.</span>
            </h2>
            <p className="mt-6 max-w-md font-body text-[14.5px] leading-relaxed text-aletis-verde-medio">
              A ALETIS é uma plataforma de finanças estratégicas com 4 verticais
              especializadas — agro, corporativo, fomento e gestão. Não somos
              escritório de advocacia, não somos corretora e não vendemos software.
              Somos uma mesa técnica independente que entrega resultado.
            </p>
            <Link
              href="/solucoes"
              className="group mt-8 inline-flex items-center gap-2 font-display text-[12.5px] font-semibold uppercase tracking-wider2 text-aletis-verde hover:text-aletis-gold-escuro"
            >
              Ver todas as soluções
              <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </Reveal>

          <div className="space-y-5">
            {itens.map((p, i) => {
              const Icon = ICONS[p.icone]
              return (
                <Reveal key={p.titulo} delay={i * 80}>
                  <article className="group relative overflow-hidden rounded-2xl border border-aletis-borda/70 bg-white p-7 transition-all duration-500 hover:-translate-y-1 hover:border-aletis-gold/45 hover:shadow-premium-sm">
                    <div className="flex items-start gap-5">
                      <div className="flex-shrink-0">
                        <div className="relative flex h-14 w-14 items-center justify-center rounded-xl border border-aletis-gold/40 bg-aletis-gold/10 text-aletis-verde transition group-hover:border-aletis-gold group-hover:bg-aletis-gold/20">
                          <Icon className="h-6 w-6" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-display text-[11px] font-semibold uppercase tracking-widest2 text-aletis-gold-escuro">
                            {p.numero} · {p.selo}
                          </span>
                          <ArrowUpRight className="h-4 w-4 opacity-0 transition group-hover:opacity-100 text-aletis-gold-escuro" />
                        </div>
                        <h3 className="mt-1 font-display text-2xl font-bold tracking-tight text-aletis-verde">
                          {p.titulo}
                        </h3>
                        <p className="mt-2 font-body text-[13.5px] leading-relaxed text-aletis-verde-medio">
                          {p.descricao}
                        </p>
                        <ul className="mt-4 flex flex-wrap gap-2">
                          {p.detalhes.map((d) => (
                            <li
                              key={d}
                              className="rounded-full border border-aletis-borda bg-aletis-cream px-3 py-1 font-body text-[11.5px] font-medium text-aletis-verde"
                            >
                              {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div
                      aria-hidden="true"
                      className="absolute left-0 top-0 h-full w-[2px] origin-top scale-y-0 bg-gradient-to-b from-aletis-gold to-aletis-gold/0 transition-transform duration-500 group-hover:scale-y-100"
                    />
                  </article>
                </Reveal>
              )
            })}
          </div>
        </div>
      </Container>
    </Section>
  )
}
