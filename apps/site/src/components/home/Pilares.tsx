import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { BrandIcon } from '@/components/ui/BrandIcon'

/**
 * Pilares — 4 verticais de serviço da ALETIS conforme Manual de
 * Identidade Visual: Agro, Corporate, Fomento e Gestão.
 * Cada pilar usa ícone oficial do kit visual e os 3 entregáveis principais.
 */
const itens = [
  {
    icone: 1,
    numero: '01',
    titulo: 'ALETIS Agro',
    selo: 'Finanças Estratégicas & Agrobusiness',
    descricao:
      'Diagnóstico de dívida rural, revisão contratual e reorganização de fluxo para o produtor decidir antes que a safra vire urgência.',
    detalhes: [
      'Reestruturação de dívida rural',
      'Revisional CPR / crédito rural',
      'Cenário por credor',
    ],
  },
  {
    icone: 6,
    numero: '02',
    titulo: 'ALETIS Corporate',
    selo: 'BPO & Gestão Financeira para Empresas',
    descricao:
      'Rotina financeira, fechamento gerencial e leitura de caixa para empresas que precisam ganhar controle sem inflar estrutura.',
    detalhes: [
      'BPO financeiro mensal',
      'Fechamento contábil-fiscal',
      'Painéis DRE / DSCR / fluxo',
    ],
  },
  {
    icone: 11,
    numero: '03',
    titulo: 'ALETIS Fomento',
    selo: 'Crédito & Reestruturação',
    descricao:
      'Estruturação de crédito, garantias e narrativa financeira para operações que precisam chegar ao credor já bem montadas.',
    detalhes: [
      'Estruturação de crédito',
      'FIDC / BNDES / privados',
      'Otimização de garantias',
    ],
  },
  {
    icone: 16,
    numero: '04',
    titulo: 'ALETIS Gestão',
    selo: 'Governança & Controles',
    descricao:
      'Governança, controles e rituais de acompanhamento para grupos familiares e empresas profissionalizarem a gestão sem perder velocidade.',
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
              Quatro frentes.{' '}
              <span className="italic text-gold-gradient">Um método.</span>
            </h2>
            <p className="mt-6 max-w-md font-body text-[14.5px] leading-relaxed text-aletis-verde-medio">
              A marca nasce de quatro áreas complementares: agro, corporativo,
              fomento e gestão. O ponto comum é simples: transformar informação
              dispersa em decisão financeira clara, defensável e acompanhável.
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
              return (
                <Reveal key={p.titulo} delay={i * 80}>
                  <article className="group relative overflow-hidden rounded-2xl border border-aletis-borda/70 bg-white p-7 transition-all duration-500 hover:-translate-y-1 hover:border-aletis-gold/45 hover:shadow-premium-sm">
                    <div className="flex items-start gap-5">
                      <div className="flex-shrink-0">
                        <div className="relative flex h-14 w-14 items-center justify-center rounded-xl border border-aletis-gold/40 bg-aletis-gold/10 text-aletis-verde transition group-hover:border-aletis-gold group-hover:bg-aletis-gold/20">
                          <BrandIcon id={p.icone} size={50} />
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
