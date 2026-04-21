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
  title: 'Sobre · A mesa técnica do agro brasileiro',
  description:
    'A ALETIS une inteligência financeira, vivência de agro e tecnologia proprietária em uma mesa única — construída para reestruturar o passivo de produtores e grupos do agronegócio.',
}

const valores = [
  {
    icone: Target,
    titulo: 'Rigor técnico',
    desc: 'Nenhuma tese entra na mesa sem memória de cálculo auditável e fundamento legal explícito.',
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
            <span className="italic text-aletis-dourado">mesa técnica</span>{' '}
            construída para o agro que decide com dado.
          </>
        }
        subtitulo="Nascemos da convicção de que o produtor brasileiro merece uma interlocução financeira tão sofisticada quanto a que o outro lado da mesa já tem. Unimos finanças, agro e tecnologia em uma entrega integrada, independente e auditável."
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
                O agro brasileiro é o setor mais sofisticado da nossa economia — e, paradoxalmente, o menos bem servido por consultoria financeira independente. A maior parte do mercado vende parecer, planilha genérica ou litígio. Nenhum desses entrega decisão executável.
              </p>
              <p>
                A ALETIS foi projetada para fechar essa lacuna. Somos uma mesa técnica que senta com produtores, grupos, cooperativas e empresas do agro e devolve um plano: diagnóstico auditável, estratégia multi-credor e execução com contratos prontos para assinar.
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
                <span className="italic text-aletis-verde-escuro">viveu</span> o campo e a mesa bancária.
              </h2>
              <p className="mt-6 max-w-md text-base leading-relaxed text-aletis-grafite-medio">
                A direção técnica da ALETIS combina vivência de gestão financeira sênior, operação de crédito rural, assessoria em reestruturações e construção de tecnologia. A mesa que negocia com o seu credor entende ambos os lados — porque já sentou nos dois.
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
                    &ldquo;Construí a ALETIS porque vi muitos produtores bons perderem terra por falta de uma mesa que falasse a língua deles — e que falasse a língua do credor com a mesma autoridade. Hoje entregamos exatamente isso.&rdquo;
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
