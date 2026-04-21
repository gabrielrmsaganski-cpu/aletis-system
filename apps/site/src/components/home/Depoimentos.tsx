import { Quote } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'

const items = [
  {
    quote:
      'A ALETIS entrou na mesa quando o banco já tinha nos dado como caso perdido. Saímos de lá com 54% de redução no saldo e um cronograma que cabe na safra.',
    autor: 'Produtor · 3.800 ha · Oeste do Paraná',
    segmento: 'Soja · Milho · Trigo',
  },
  {
    quote:
      'O relatório técnico deles foi mais preciso que o parecer que tínhamos de um escritório grande. Memória de cálculo auditável, linha por linha.',
    autor: 'Diretor financeiro · Grupo agro',
    segmento: 'Cerealista · MT / GO',
  },
  {
    quote:
      'Não é consultoria e não é escritório. É uma mesa que pensa finanças, agro e jurídico junto. Nunca vi esse nível de integração antes.',
    autor: 'Presidente de cooperativa',
    segmento: 'Sul do Brasil',
  },
]

export function Depoimentos() {
  return (
    <Section tone="bege" compact>
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <Eyebrow>Provas concretas</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-6 display-md text-aletis-grafite-escuro">
              O que dizem quem senta{' '}
              <span className="italic text-aletis-verde-escuro">do nosso lado</span> da mesa.
            </h2>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {items.map((d, i) => (
            <Reveal key={d.autor} delay={i * 100}>
              <blockquote className="relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-aletis-borda/70 bg-white p-7 transition hover:-translate-y-1 hover:border-aletis-dourado/40 hover:shadow-premium-sm">
                <Quote
                  aria-hidden="true"
                  className="absolute right-5 top-5 h-10 w-10 text-aletis-dourado/15"
                />
                <p className="relative font-display text-[17px] font-medium leading-relaxed text-aletis-grafite-escuro">
                  &ldquo;{d.quote}&rdquo;
                </p>
                <footer className="mt-8 pt-5 border-t border-aletis-borda/60">
                  <p className="font-display text-sm font-semibold text-aletis-verde-escuro">
                    {d.autor}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-widest2 text-aletis-grafite-claro">
                    {d.segmento}
                  </p>
                </footer>
              </blockquote>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  )
}
