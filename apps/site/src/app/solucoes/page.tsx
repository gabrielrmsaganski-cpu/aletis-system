import type { Metadata } from 'next'
import Link from 'next/link'
import {
  RefreshCw,
  Scale,
  BarChart3,
  Users,
  Bot,
  FileCheck,
  ArrowRight,
  Check,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'

export const metadata: Metadata = {
  title: 'Soluções · Reestruturação, revisional, inteligência e tecnologia',
  description:
    'Catálogo completo das soluções ALETIS: reestruturação multi-credor, revisional, inteligência de mercado, contratos estratégicos, CRM e ALIX — IA aplicada.',
}

const solucoes = [
  {
    id: 'reestruturacao',
    icone: RefreshCw,
    tag: 'Serviço principal',
    titulo: 'Reestruturação de Dívida',
    resumo: 'Planos multi-credor com DSCR realista, garantias otimizadas e proteção patrimonial.',
    beneficios: [
      'Mesa única com 5+ credores simultâneos',
      'Memória de cálculo auditável para cada contrato',
      'Proteção patrimonial e manutenção da atividade',
      'Acompanhamento pós-acordo com DSCR mensal',
    ],
    quando: 'Produtor ou grupo com múltiplos credores e parcela comprometendo a safra.',
  },
  {
    id: 'revisional',
    icone: Scale,
    tag: 'Alta conversão',
    titulo: 'Revisional & Abusividade',
    resumo: 'Auditoria técnica para identificar anatocismo, capitalização indevida e descaracterização de crédito rural.',
    beneficios: [
      'Recálculo integral peça a peça',
      'Mapeamento de encargos indevidos',
      'Descaracterização de crédito rural (Res. BCB 4.966/21)',
      'Fundamento em Súmulas STJ 93, 296, 541',
    ],
    quando: 'Contratos rurais com taxa elevada, capitalização mensal ou encargos contestáveis.',
  },
  {
    id: 'mercado',
    icone: BarChart3,
    tag: 'Recorrente',
    titulo: 'Inteligência de Mercado',
    resumo: 'Brief diário com sazonalidade, basis regional, câmbio, clima e curva futura.',
    beneficios: [
      'Cobertura de commodities-chave',
      'Basis por microrregião',
      'Integração com clima e câmbio',
      'Recomendações de timing de comercialização',
    ],
    quando: 'Produtor ou cerealista que precisa decidir timing de venda com base em dado, não em achismo.',
  },
  {
    id: 'contratos',
    icone: FileCheck,
    tag: 'Jurídico',
    titulo: 'Contratos Estratégicos',
    resumo: 'Gerador proprietário com 7 tipos contratuais prontos para revisão e assinatura.',
    beneficios: [
      'CPR Financeira e Física',
      'Confissão de dívida e renegociação',
      'Acordo extrajudicial e transação excepcional',
      'Contrato de prestação de serviços ALETIS',
    ],
    quando: 'Sempre que há um acordo estruturado e a peça jurídica precisa estar pronta em horas, não semanas.',
  },
  {
    id: 'tecnologia',
    icone: Users,
    tag: 'Tecnologia',
    titulo: 'CRM & Workflow',
    resumo: 'Pipeline de reestruturação com histórico de negociação, garantias e portal do cliente.',
    beneficios: [
      'CRM de produtor rural sob medida',
      'Workflow de reestruturação com etapas auditáveis',
      'Controle de garantias e dação em pagamento',
      'Portal do cliente com documentos e DSCR',
    ],
    quando: 'Grupos, cooperativas e empresas do agro que precisam profissionalizar gestão financeira e jurídica.',
  },
  {
    id: 'alix',
    icone: Bot,
    tag: 'Inovação',
    titulo: 'ALIX · IA Aplicada',
    resumo: 'IA treinada em legislação, jurisprudência e metodologia ALETIS — pensa junto com o consultor sênior.',
    beneficios: [
      'Triagem de contratos em minutos',
      'Geração de peças jurídicas iniciais',
      'Resposta consultiva ao cliente 24/7',
      'Aprende com cada caso da mesa ALETIS',
    ],
    quando: 'Quando velocidade na triagem faz diferença entre caso viável e caso perdido.',
  },
]

export default function SolucoesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Soluções"
        titulo={
          <>
            Um portfólio desenhado para o{' '}
            <span className="italic text-aletis-dourado">ciclo inteiro</span> do produtor.
          </>
        }
        subtitulo="Seis frentes integradas. Não compete, complementa. Cada solução pode entrar sozinha ou compor um plano estratégico multi-credor com contratos prontos e acompanhamento."
        breadcrumbs={[
          { label: 'Início', href: '/' },
          { label: 'Soluções' },
        ]}
      />

      <Section tone="marfim">
        <Container>
          <div className="space-y-6">
            {solucoes.map((s, i) => {
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
                          <span className="rounded-full border border-aletis-borda bg-aletis-bege px-3 py-1 text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-grafite-medio">
                            {s.tag}
                          </span>
                        </div>
                        <h2 className="mt-6 font-display text-3xl font-semibold text-aletis-grafite-escuro md:text-[34px]">
                          {s.titulo}
                        </h2>
                        <p className="mt-4 text-[17px] leading-relaxed text-aletis-grafite-medio">
                          {s.resumo}
                        </p>
                        <p className="mt-6 rounded-xl border-l-2 border-aletis-dourado bg-aletis-bege/70 px-4 py-3 text-[13px] italic text-aletis-grafite-medio">
                          <strong className="not-italic font-display uppercase tracking-widest2 text-[10px] text-aletis-dourado-escuro">Quando faz sentido</strong>
                          <br />
                          {s.quando}
                        </p>
                      </div>

                      <div className={inverted ? 'lg:col-start-1 lg:row-start-1' : ''}>
                        <div className="relative overflow-hidden rounded-2xl border border-aletis-borda/70 bg-gradient-to-br from-aletis-bege to-aletis-marfim p-7">
                          <p className="text-[11px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado-escuro">
                            Entregáveis
                          </p>
                          <ul className="mt-4 space-y-3">
                            {s.beneficios.map((b) => (
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
                            Solicitar esta solução
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
        </Container>
      </Section>
    </>
  )
}
