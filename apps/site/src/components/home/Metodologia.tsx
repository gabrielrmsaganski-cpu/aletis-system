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
      'Coleta dos contratos, planilhas e extratos. Recálculo integral, mapeamento de abusividade e identificação de pontos revisionais.',
    pontos: ['Contratos analisados peça a peça', 'Memória de cálculo auditável', 'Relatório executivo'],
  },
  {
    numero: '02',
    titulo: 'Estratégia',
    prazo: '1 semana',
    descricao:
      'Construção do cenário alvo. Projetamos fluxo de caixa com stress de safra, definimos deságio justo e desenhamos ordem de negociação.',
    pontos: ['DSCR alvo ≥ 1.25', 'Stress de −15% no preço', 'Priorização por credor'],
  },
  {
    numero: '03',
    titulo: 'Negociação',
    prazo: '60–90d',
    descricao:
      'Vamos à mesa com os credores — um ou todos, simultaneamente. Apresentamos proposta com memória pública e empurramos até o acordo.',
    pontos: ['Acordos extrajudiciais', 'Termo de renegociação', 'Transação excepcional quando cabível'],
  },
  {
    numero: '04',
    titulo: 'Execução',
    prazo: 'Contínuo',
    descricao:
      'Minutas prontas, assinatura eletrônica e acompanhamento pós-acordo. Reportamos DSCR mensal e gatilhos de atenção ao cliente.',
    pontos: ['Contratos gerados e revisados', 'Assinatura digital ICP-Brasil', 'Monitoramento contínuo'],
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
              Quatro etapas, uma{' '}
              <span className="italic text-aletis-dourado">engenharia só</span>.
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-5 text-white/65 md:text-lg">
              Uma ordem clara, com entregáveis mensuráveis em cada estágio. O produtor
              sabe onde está, o que vem a seguir e quando espera fechar o acordo.
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
