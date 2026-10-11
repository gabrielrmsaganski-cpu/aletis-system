import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Target, Compass, ShieldCheck, Users2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Metodologia } from '@/components/home/Metodologia'

export const metadata: Metadata = {
  title: 'Sobre · Finanças estratégicas para o agro',
  description:
    'A ALETIS une método financeiro, vivência de agro e tecnologia proprietária para organizar dívida, caixa e negociação no agronegócio.',
  alternates: { canonical: '/sobre' },
}

const valores = [
  {
    icone: Target,
    titulo: 'Rigor técnico',
    desc: 'Nenhuma recomendação é feita sem contrato, evidência documental e racional financeiro explícito.',
  },
  {
    icone: Compass,
    titulo: 'Independência',
    desc: 'Não somos banco, não somos corretora, não somos escritório de advocacia. Estamos do lado do produtor.',
  },
  {
    icone: ShieldCheck,
    titulo: 'Sigilo integral',
    desc: 'NDA antes de qualquer acesso a contrato. LGPD aplicada em todo o fluxo, do diagnóstico à execução.',
  },
  {
    icone: Users2,
    titulo: 'Continuidade',
    desc: 'Acompanhamento pós-acordo com DSCR mensal e gatilhos de atenção — o plano não termina na assinatura.',
  },
]

export default function SobrePage() {
  return (
    <>
      <PageHeader
        eyebrow="Sobre a ALETIS"
        titulo={
          <>
            Uma{' '}
            <span className="italic text-aletis-dourado">estrutura financeira</span>{' '}
            para o agro que decide com dado.
          </>
        }
        subtitulo="Nascemos para dar ao produtor e às empresas do agro uma leitura financeira tão organizada quanto a cobrança que chega do outro lado. Unimos finanças, agro e tecnologia em uma entrega independente, clara e acompanhável."
        breadcrumbs={[
          { label: 'Início', href: '/' },
          { label: 'Sobre' },
        ]}
      />

      {/* Missão · Visão · Posicionamento */}
      <Section tone="marfim">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <Reveal>
              <Eyebrow>Posicionamento</Eyebrow>
              <h2 className="mt-6 display-lg text-aletis-grafite-escuro">
                Não vendemos{' '}
                <span className="italic text-aletis-verde-escuro">parecer</span>.
                Entregamos{' '}
                <span className="italic text-aletis-verde-escuro">decisão</span>.
              </h2>
            </Reveal>
            <Reveal delay={120} className="space-y-5 text-[17px] leading-relaxed text-aletis-grafite-medio">
              <p>
                O agro brasileiro é sofisticado na operação, mas muitas vezes negocia dívida com informação espalhada: contrato em um lugar, garantia em outro, fluxo de safra em planilhas que não conversam entre si.
              </p>
              <p>
                A ALETIS foi criada para fechar essa lacuna. Trabalhamos com produtores, grupos, cooperativas e empresas do agro para transformar documentação, números e credores em um plano financeiro defensável.
              </p>
              <p>
                Cada entrega passa por três filtros: <strong>rigor técnico</strong>, <strong>visão de agro</strong> e <strong>tecnologia proprietária</strong>. Se algum dos três falha, não entregamos.
              </p>
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* Valores */}
      <Section tone="bege" compact>
        <Container>
          <div className="max-w-2xl">
            <Reveal><Eyebrow>O que nos orienta</Eyebrow></Reveal>
            <Reveal delay={80}>
              <h2 className="mt-6 display-md text-aletis-grafite-escuro">
                Quatro princípios não-negociáveis.
              </h2>
            </Reveal>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {valores.map((v, i) => {
              const Icon = v.icone
              return (
                <Reveal key={v.titulo} delay={i * 80}>
                  <article className="group relative h-full overflow-hidden rounded-2xl border border-aletis-borda/70 bg-white p-6 transition hover:-translate-y-1 hover:border-aletis-dourado/40 hover:shadow-premium-sm">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-aletis-dourado/40 bg-aletis-dourado/10 text-aletis-verde-escuro">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-5 font-display text-lg font-semibold text-aletis-grafite-escuro">
                      {v.titulo}
                    </h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-aletis-grafite-medio">
                      {v.desc}
                    </p>
                  </article>
                </Reveal>
              )
            })}
          </div>
        </Container>
      </Section>

      {/* Metodologia reaproveitada */}
      <div id="metodologia">
        <Metodologia />
      </div>

      {/* Fundador / liderança */}
      <Section tone="marfim">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[1fr_1fr]">
            <Reveal>
              <Eyebrow>Liderança</Eyebrow>
              <h2 className="mt-6 display-md text-aletis-grafite-escuro">
                Conduzida por quem{' '}
                <span className="italic text-aletis-verde-escuro">viveu</span> o campo e a negociação financeira.
              </h2>
              <p className="mt-6 max-w-md text-base leading-relaxed text-aletis-grafite-medio">
                A direção técnica da ALETIS combina gestão financeira, crédito rural, reestruturações e construção de tecnologia. Isso permite ler a operação do produtor e também a lógica do credor.
              </p>
              <Link
                href="/contato"
                className="group mt-8 inline-flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider2 text-aletis-verde-escuro hover:text-aletis-dourado-escuro"
              >
                Agendar uma conversa
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
            </Reveal>
            <Reveal delay={120}>
              <div className="relative overflow-hidden rounded-2xl border border-aletis-borda/70 bg-gradient-to-br from-aletis-verde-escuro to-aletis-verde-profundo p-10 text-white shadow-premium">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.06] bg-grain mix-blend-overlay" />
                <div className="relative">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-aletis-dourado/40 bg-aletis-dourado/15 font-display text-2xl font-bold text-aletis-dourado">
                    CK
                  </div>
                  <p className="mt-6 font-display text-xl font-semibold">Christian Kohler</p>
                  <p className="mt-1 text-[12px] uppercase tracking-widest2 text-aletis-dourado">
                    Diretor-fundador · Consultor sênior
                  </p>
                  <p className="mt-6 text-[15px] leading-relaxed text-white/75">
                    &ldquo;Construí a ALETIS porque vi muitos produtores bons negociarem no escuro. O nosso trabalho é colocar ordem nos números, proteger o que precisa ser protegido e levar uma proposta séria para a conversa.&rdquo;
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </Container>
      </Section>
    </>
  )
}
