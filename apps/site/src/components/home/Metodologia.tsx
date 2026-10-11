import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'

const etapas = [
  {
    numero: '01',
    titulo: 'Diagnóstico',
    prazo: '72h',
    descricao:
      'Recebemos contratos, extratos, garantias e informações de safra. A primeira entrega separa fato, dúvida e prioridade.',
    pontos: ['Contratos e garantias organizados', 'Mapa de credores', 'Resumo executivo'],
  },
  {
    numero: '02',
    titulo: 'Estratégia',
    prazo: '1 semana',
    descricao:
      'Montamos o cenário alvo, testamos fluxo de caixa sob pressão e definimos a ordem de conversa com cada credor.',
    pontos: ['Cenário central e stress', 'Capacidade de pagamento', 'Ordem de negociação'],
  },
  {
    numero: '03',
    titulo: 'Negociação',
    prazo: '60–90d',
    descricao:
      'A proposta é apresentada com racional financeiro claro. Cada ajuste volta para o modelo antes de ir para contrato.',
    pontos: ['Acordos extrajudiciais', 'Termo de renegociação', 'Transação quando cabível'],
  },
  {
    numero: '04',
    titulo: 'Execução',
    prazo: 'Contínuo',
    descricao:
      'Depois do aceite, acompanhamos a formalização, os vencimentos e os sinais de atenção que podem exigir nova conversa.',
    pontos: ['Contratos revisados', 'Assinatura digital', 'Acompanhamento de caixa'],
  },
]

export function Metodologia() {
  return (
    <Section tone="profundo" id="metodologia">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <Eyebrow light>Metodologia ALETIS</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-6 display-lg text-white">
              Quatro etapas para sair do ruído e chegar a uma{' '}
              <span className="italic text-aletis-dourado">decisão executável</span>.
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-5 text-white/65 md:text-lg">
              Cada fase tem saída objetiva. O cliente sabe o que foi analisado,
              o que ainda falta e qual decisão está pronta para ser tomada.
            </p>
          </Reveal>
        </div>

        {/* timeline */}
        <div className="relative mt-20">
          {/* linha horizontal */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-0 right-0 top-[32px] hidden h-px bg-gradient-to-r from-aletis-dourado/0 via-aletis-dourado/40 to-aletis-dourado/0 lg:block"
          />
          <div className="grid gap-8 lg:grid-cols-4">
            {etapas.map((e, i) => (
              <Reveal key={e.numero} delay={i * 120} className="relative">
                {/* marker */}
                <div className="relative flex h-16 items-center justify-center lg:justify-start">
                  <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full border border-aletis-dourado/40 bg-aletis-verde-profundo font-display text-lg font-semibold text-aletis-dourado">
                    {e.numero}
                    <span
                      aria-hidden="true"
                      className="absolute inset-[-4px] -z-10 rounded-full border border-aletis-dourado/20"
                    />
                  </div>
                </div>

                <div className="mt-5 text-center lg:text-left">
                  <div className="flex items-baseline justify-center gap-2 lg:justify-start">
                    <h3 className="font-display text-2xl font-semibold text-white">{e.titulo}</h3>
                    <span className="rounded-full border border-aletis-dourado/30 bg-aletis-dourado/10 px-2 py-0.5 text-[10px] font-display font-semibold uppercase tracking-wider text-aletis-dourado">
                      {e.prazo}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-white/65">{e.descricao}</p>
                  <ul className="mt-4 space-y-1.5 text-[13px] text-white/70">
                    {e.pontos.map((p) => (
                      <li
                        key={p}
                        className="flex items-start gap-2 lg:justify-start justify-center"
                      >
                        <span className="mt-1.5 inline-block h-1 w-1 flex-shrink-0 rounded-full bg-aletis-dourado" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  )
}
