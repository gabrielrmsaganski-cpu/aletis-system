import { CheckCircle2 } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'

const items = [
  {
    titulo: 'O produtor entende a conta',
    texto:
      'A dívida deixa de ser uma pilha de cobranças soltas. O cliente enxerga credor, contrato, garantia, vencimento e capacidade de pagamento no mesmo mapa.',
    detalhe: 'Dossiê financeiro e resumo executivo',
  },
  {
    titulo: 'A conversa com o credor muda de nível',
    texto:
      'A proposta chega com racional, documentação e cenário de fluxo. Isso reduz improviso e deixa claro o que é possível negociar.',
    detalhe: 'Plano por credor e por safra',
  },
  {
    titulo: 'O acordo não fica solto no tempo',
    texto:
      'Depois da assinatura, a operação precisa continuar cabendo no caixa. Por isso acompanhamos vencimentos, gatilhos e desvios de rota.',
    detalhe: 'Acompanhamento posterior ao acordo',
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
              O valor aparece quando a operação{' '}
              <span className="italic text-aletis-verde-escuro">fica legível</span>.
            </h2>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {items.map((d, i) => (
            <Reveal key={d.titulo} delay={i * 100}>
              <article className="relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-aletis-borda/70 bg-white p-7 transition hover:-translate-y-1 hover:border-aletis-dourado/40 hover:shadow-premium-sm">
                <CheckCircle2 className="h-7 w-7 text-aletis-dourado" />
                <div>
                  <h3 className="mt-5 font-display text-xl font-semibold text-aletis-grafite-escuro">
                    {d.titulo}
                  </h3>
                  <p className="mt-3 text-[14px] leading-relaxed text-aletis-grafite-medio">
                    {d.texto}
                  </p>
                </div>
                <footer className="mt-8 pt-5 border-t border-aletis-borda/60">
                  <p className="mt-1 text-[11px] uppercase tracking-widest2 text-aletis-grafite-claro">
                    {d.detalhe}
                  </p>
                </footer>
              </article>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  )
}
