import { BrainCircuit, LineChart, Wheat, Handshake, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'

const ICONS = { BrainCircuit, LineChart, Wheat, Handshake }

const itens = [
  {
    icone: 'BrainCircuit' as const,
    numero: '01',
    titulo: 'Inteligência Financeira',
    descricao:
      'Diagnóstico auditável, memória de cálculo peça por peça e mapeamento de abusividade antes de qualquer conversa com credor.',
    detalhes: [
      'Recálculo de juros, CET e IOF',
      'Mapeamento de anatocismo',
      'Descaracterização de crédito rural',
    ],
  },
  {
    icone: 'LineChart' as const,
    numero: '02',
    titulo: 'Reestruturação Estratégica',
    descricao:
      'Planos multi-credor com DSCR realista, garantias otimizadas e proteção patrimonial ao produtor e ao grupo.',
    detalhes: [
      'Negociação com 5+ credores simultâneos',
      'Acordos extrajudiciais e judiciais',
      'Cenários com stress de safra',
    ],
  },
  {
    icone: 'Wheat' as const,
    numero: '03',
    titulo: 'Visão de Agro',
    descricao:
      'Safra, basis, clima, câmbio e CPR na mesma mesa — finanças que entendem o campo e o ciclo real do produtor.',
    detalhes: [
      'Brief diário de commodities',
      'Sazonalidade e basis regional',
      'Estruturação de CPR-F e CPR-Física',
    ],
  },
  {
    icone: 'Handshake' as const,
    numero: '04',
    titulo: 'Execução até o fim',
    descricao:
      'O plano não termina na assinatura. Acompanhamos DSCR mensal, pactos entre credores e gatilhos de atenção por toda a vigência do acordo.',
    detalhes: [
      'Monitoramento de DSCR mensal',
      'Alertas de descumprimento precoces',
      'Renegociação preventiva quando necessário',
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
            <h2 className="mt-6 display-lg text-aletis-grafite-escuro">
              Quatro disciplinas.{' '}
              <span className="italic text-aletis-verde-escuro">Uma única mesa.</span>
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-aletis-grafite-medio">
              A ALETIS não é escritório de advocacia, não é corretora e não vende software.
              Somos consultoria financeira estratégica para o agro — uma mesa técnica que une
              finanças, direito e vivência de campo em uma entrega integrada.
            </p>
            <Link
              href="/solucoes"
              className="group mt-8 inline-flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider2 text-aletis-verde-escuro hover:text-aletis-dourado-escuro"
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
                  <article className="group relative overflow-hidden rounded-2xl border border-aletis-borda/70 bg-white p-7 transition-all duration-500 hover:-translate-y-1 hover:border-aletis-dourado/40 hover:shadow-premium-sm">
                    <div className="flex items-start gap-5">
                      <div className="flex-shrink-0">
                        <div className="relative flex h-14 w-14 items-center justify-center rounded-xl border border-aletis-dourado/40 bg-aletis-dourado/10 text-aletis-verde-escuro transition group-hover:border-aletis-dourado group-hover:bg-aletis-dourado/20">
                          <Icon className="h-6 w-6" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-display text-[11px] font-semibold uppercase tracking-widest2 text-aletis-dourado-escuro">
                            {p.numero}
                          </span>
                          <ArrowUpRight className="h-4 w-4 opacity-0 transition group-hover:opacity-100 text-aletis-dourado-escuro" />
                        </div>
                        <h3 className="mt-1 font-display text-2xl font-semibold text-aletis-grafite-escuro">
                          {p.titulo}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-aletis-grafite-medio">
                          {p.descricao}
                        </p>
                        <ul className="mt-4 flex flex-wrap gap-2">
                          {p.detalhes.map((d) => (
                            <li
                              key={d}
                              className="rounded-full border border-aletis-borda bg-aletis-bege px-3 py-1 text-[11px] font-medium text-aletis-grafite-medio"
                            >
                              {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div
                      aria-hidden="true"
                      className="absolute left-0 top-0 h-full w-[2px] origin-top scale-y-0 bg-gradient-to-b from-aletis-dourado to-aletis-dourado/0 transition-transform duration-500 group-hover:scale-y-100"
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
