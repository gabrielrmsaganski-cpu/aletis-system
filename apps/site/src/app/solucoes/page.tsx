import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Stethoscope,
  RefreshCw,
  Scale,
  TrendingUp,
  BarChart3,
  LifeBuoy,
  ArrowRight,
  Check,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'

export const metadata: Metadata = {
  title: 'Consultoria · Reestruturação, revisional e estruturação financeira do agro',
  description:
    'Consultoria financeira estratégica para o agronegócio: diagnóstico, reestruturação multi-credor, revisional, estruturação financeira, inteligência de mercado e gestão de crise. Sem vender software — entregando decisão.',
  alternates: { canonical: '/solucoes' },
}

const frentes = [
  {
    id: 'diagnostico',
    icone: Stethoscope,
    tag: 'Porta de entrada · gratuito',
    titulo: 'Diagnóstico Financeiro',
    resumo:
      'Em 72h colocamos toda a dívida do produtor em uma única memória de cálculo auditável — com abusividade mapeada, DSCR dimensionado e próximos passos recomendados.',
    entregaveis: [
      'Auditoria dos contratos rurais e comerciais',
      'Memória de cálculo peça por peça (sem planilha genérica)',
      'Score de abusividade por contrato com fundamento legal',
      'Plano priorizado de ação em 1 página executiva',
    ],
    quando:
      'Sempre que há mais de um credor, mais de uma safra comprometida ou dúvida real sobre a conta que está sendo cobrada.',
  },
  {
    id: 'reestruturacao',
    icone: RefreshCw,
    tag: 'Serviço principal',
    titulo: 'Reestruturação de Dívida',
    resumo:
      'Mesa técnica multi-credor: o produtor senta apenas uma vez e a ALETIS conduz banco, cooperativa, revenda e cerealista simultaneamente — com cenário único e plano executável.',
    entregaveis: [
      'Negociação com 5+ credores simultâneos na mesma mesa',
      'Plano de 60–120 meses com DSCR realista e cenário de stress',
      'Garantias otimizadas e proteção patrimonial',
      'Contratos de renegociação prontos para assinar',
    ],
    quando:
      'Produtor, grupo ou empresa do agro com exposição consolidada pressionando o fluxo de safra.',
  },
  {
    id: 'revisional',
    icone: Scale,
    tag: 'Alta conversão',
    titulo: 'Revisional & Abusividade',
    resumo:
      'Auditoria técnica que identifica anatocismo, capitalização indevida e descaracterização de crédito rural — devolvendo ao saldo devedor o que nunca deveria ter entrado nele.',
    entregaveis: [
      'Recálculo integral peça a peça com memória pública',
      'Mapeamento de encargos indevidos e tarifas contestáveis',
      'Fundamento em Súmulas STJ 93, 296 e 541',
      'Enquadramento sob Res. BCB 4.966/21 e Lei 14.181/21',
    ],
    quando:
      'Contratos rurais com taxa muito acima do PRONAMP da safra, capitalização mensal ou recursos com destinação desviada.',
  },
  {
    id: 'estruturacao',
    icone: TrendingUp,
    tag: 'Prevenção · profissionalização',
    titulo: 'Estruturação Financeira',
    resumo:
      'Profissionalização da gestão financeira do produtor e do grupo: visibilidade de caixa, DRE por fazenda, política de endividamento e disciplina de garantia. Evita a próxima crise antes dela acontecer.',
    entregaveis: [
      'Mapeamento consolidado da exposição por entidade e CAR',
      'Modelo de DRE e fluxo de caixa por fazenda',
      'Política de endividamento e limite por tipo de credor',
      'Governança de garantias e CPRs ativas',
    ],
    quando:
      'Grupos, holdings familiares e empresas do agro que cresceram sem área financeira e hoje não conseguem enxergar o próprio passivo.',
  },
  {
    id: 'mercado',
    icone: BarChart3,
    tag: 'Recorrente',
    titulo: 'Inteligência de Mercado',
    resumo:
      'Assessoria contínua de comercialização: quando vender, quanto travar, em que basis, com que hedge. Decisão de venda deixa de ser sentimento e vira tese.',
    entregaveis: [
      'Brief com sazonalidade, basis regional, câmbio e clima',
      'Recomendação de timing e percentual de trava por safra',
      'Suporte à decisão de CPR-F, CPR-Física e hedge',
      'Acompanhamento mensal com mesa dedicada',
    ],
    quando:
      'Produtor ou cerealista que decide comercialização por calendário — quando deveria decidir por cenário.',
  },
  {
    id: 'crise',
    icone: LifeBuoy,
    tag: 'Turn-around · urgência',
    titulo: 'Gestão de Crise',
    resumo:
      'Para casos em estágio crítico: protesto iminente, execução ajuizada, risco de perda patrimonial. Mesa de emergência que estabiliza o perímetro em dias e abre caminho para a reestruturação.',
    entregaveis: [
      'Triagem de emergência em 24–48h',
      'Comunicação imediata com credores prioritários',
      'Medidas protetivas e mapeamento de alternativas judiciais',
      'Ponte para reestruturação formal assim que o perímetro estabilizar',
    ],
    quando:
      'Quando o calendário vira semanas ou dias — e cada negociação adiada vira patrimônio perdido.',
  },
]

export default function SolucoesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Consultoria"
        titulo={
          <>
            Seis frentes de consultoria, uma{' '}
            <span className="italic text-aletis-dourado">única mesa</span>.
          </>
        }
        subtitulo="A ALETIS não vende software nem parecer. Entrega decisão financeira estratégica para o agro — do diagnóstico ao acompanhamento pós-acordo. Cada frente pode entrar sozinha ou compor um plano integrado."
        breadcrumbs={[
          { label: 'Início', href: '/' },
          { label: 'Consultoria' },
        ]}
      />

      <Section tone="marfim">
        <Container>
          <div className="space-y-6">
            {frentes.map((s, i) => {
              const Icon = s.icone
              const inverted = i % 2 === 1
              return (
                <Reveal key={s.id} delay={i * 60}>
                  <article
                    id={s.id}
                    className="group relative overflow-hidden rounded-3xl border border-aletis-borda/70 bg-white p-8 transition-all duration-500 hover:border-aletis-dourado/40 hover:shadow-premium md:p-12"
                  >
                    <div
                      className={`grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center ${
                        inverted ? 'lg:grid-flow-dense' : ''
                      }`}
                    >
                      <div className={inverted ? 'lg:col-start-2' : ''}>
                        <div className="flex items-center gap-3">
                          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-aletis-dourado/40 bg-aletis-dourado/10 text-aletis-verde-escuro">
                            <Icon className="h-6 w-6" />
                          </div>
                          <span className="rounded-full border border-aletis-borda bg-aletis-bege px-3 py-1 text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-grafite-escuro">
                            {s.tag}
                          </span>
                        </div>
                        <h2 className="mt-6 font-display text-3xl font-semibold text-aletis-grafite-escuro md:text-[34px]">
                          {s.titulo}
                        </h2>
                        <p className="mt-4 text-[17px] leading-relaxed text-aletis-grafite-medio">
                          {s.resumo}
                        </p>
                        <p className="mt-6 rounded-xl border-l-2 border-aletis-dourado bg-aletis-bege/70 px-4 py-3 text-[13px] italic text-aletis-grafite-escuro">
                          <strong className="not-italic font-display uppercase tracking-widest2 text-[10px] text-aletis-dourado-escuro">
                            Quando faz sentido
                          </strong>
                          <br />
                          {s.quando}
                        </p>
                      </div>

                      <div className={inverted ? 'lg:col-start-1 lg:row-start-1' : ''}>
                        <div className="relative overflow-hidden rounded-2xl border border-aletis-borda/70 bg-gradient-to-br from-aletis-bege to-aletis-marfim p-7">
                          <p className="text-[11px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado-escuro">
                            O que você recebe
                          </p>
                          <ul className="mt-4 space-y-3">
                            {s.entregaveis.map((b) => (
                              <li
                                key={b}
                                className="flex items-start gap-3 text-[14px] text-aletis-grafite-escuro"
                              >
                                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-aletis-dourado/40 bg-aletis-dourado/10">
                                  <Check className="h-3 w-3 text-aletis-dourado-escuro" />
                                </span>
                                <span>{b}</span>
                              </li>
                            ))}
                          </ul>
                          <Link
                            href="/contato"
                            className="group/link mt-7 inline-flex items-center gap-1.5 font-display text-[12px] font-semibold uppercase tracking-wider2 text-aletis-verde-escuro hover:text-aletis-dourado-escuro"
                          >
                            Solicitar esta consultoria
                            <ArrowRight className="h-3.5 w-3.5 transition group-hover/link:translate-x-0.5" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </article>
                </Reveal>
              )
            })}
          </div>

          {/* Banner: tecnologia como capacidade, não como SKU */}
          <Reveal delay={200}>
            <div className="mt-16 overflow-hidden rounded-3xl border border-aletis-borda/70 bg-gradient-to-br from-aletis-verde-escuro to-aletis-verde-profundo p-8 text-white md:p-12">
              <div className="grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-center md:gap-14">
                <div>
                  <p className="eyebrow eyebrow--light">
                    <span className="gold-hairline" aria-hidden="true" />
                    Como entregamos · tecnologia interna
                  </p>
                  <h3 className="mt-4 font-display text-2xl font-semibold md:text-3xl">
                    Tecnologia é nossa mesa de trabalho, não o nosso produto.
                  </h3>
                  <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/75">
                    O produtor não contrata software da ALETIS. Contrata consultoria.
                    Por trás de cada entrega, porém, há um sistema proprietário, pipelines de
                    dados de mercado e a <strong className="text-aletis-dourado">ALIX</strong> —
                    IA treinada na metodologia da casa. São infraestrutura para o consultor
                    sênior pensar melhor, mais rápido e com mais rigor. O que você vê no fim é a decisão.
                  </p>
                </div>
                <ul className="grid gap-3 text-[13px] text-white/80">
                  <li className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <span className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado">
                      Infra 01
                    </span>
                    <p className="mt-1 font-display font-semibold text-white">Mesa digital interna</p>
                    <p className="text-[12px] text-white/60">
                      CRM proprietário com pipeline de reestruturação, histórico de credor e controle de garantias.
                    </p>
                  </li>
                  <li className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <span className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado">
                      Infra 02
                    </span>
                    <p className="mt-1 font-display font-semibold text-white">ALIX · IA consultiva</p>
                    <p className="text-[12px] text-white/60">
                      Triagem de contratos em minutos, geração de peças iniciais, cruzamento automático com jurisprudência.
                    </p>
                  </li>
                  <li className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <span className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado">
                      Infra 03
                    </span>
                    <p className="mt-1 font-display font-semibold text-white">Biblioteca contratual</p>
                    <p className="text-[12px] text-white/60">
                      7 instrumentos jurídicos pré-estruturados e revisados pela casa — aceleram o fim do processo, não o começo.
                    </p>
                  </li>
                </ul>
              </div>
            </div>
          </Reveal>

          {/* CTA final */}
          <Reveal delay={260}>
            <div className="mt-10 flex flex-col items-start justify-between gap-5 rounded-2xl border border-aletis-dourado/30 bg-aletis-bege/70 p-8 md:flex-row md:items-center">
              <div>
                <p className="text-[11px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado-escuro">
                  Próximo passo
                </p>
                <h3 className="mt-2 font-display text-xl font-semibold text-aletis-grafite-escuro md:text-2xl">
                  Toda consultoria começa com diagnóstico. Gratuito. Em 72h.
                </h3>
              </div>
              <Link href="/contato" className="btn-primary flex-shrink-0">
                Solicitar diagnóstico
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </Container>
      </Section>
    </>
  )
}
