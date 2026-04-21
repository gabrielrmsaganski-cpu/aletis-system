import Link from 'next/link'
import {
  RefreshCw,
  Scale,
  BarChart3,
  Users,
  Bot,
  FileCheck,
  ArrowUpRight,
} from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'

const solucoes = [
  {
    icone: RefreshCw,
    titulo: 'Reestruturação de Dívida',
    sub: 'Multi-credor · DSCR realista',
    descricao:
      'Projetamos o plano financeiro do produtor nos próximos 60–120 meses e sentamos à mesa com todos os credores ao mesmo tempo — banco, cooperativa, revenda, PJ rural.',
    tag: 'Serviço principal',
    href: '/solucoes#reestruturacao',
  },
  {
    icone: Scale,
    titulo: 'Revisional & Abusividade',
    sub: 'Anatocismo · Crédito rural',
    descricao:
      'Auditoria técnica de CCBs, CPRs e cédulas rurais para identificar abusividade, capitalização indevida e descaracterização.',
    tag: 'Alta conversão',
    href: '/solucoes#revisional',
  },
  {
    icone: BarChart3,
    titulo: 'Inteligência de Mercado',
    sub: 'Commodities · Basis · Clima',
    descricao:
      'Brief diário com sazonalidade, basis regional, câmbio, clima e curva futura — insumo direto para decisões de comercialização.',
    tag: 'Recorrente',
    href: '/solucoes#mercado',
  },
  {
    icone: FileCheck,
    titulo: 'Contratos Estratégicos',
    sub: 'CPR · Confissão · Acordos',
    descricao:
      'Gerador proprietário de CPR-F, CPR-Física, confissão de dívida, termo de renegociação, acordo extrajudicial e transação excepcional.',
    tag: 'Jurídico',
    href: '/solucoes#contratos',
  },
  {
    icone: Users,
    titulo: 'CRM & Workflow',
    sub: 'Pipeline · Atendimento',
    descricao:
      'CRM de produtor rural com workflow de reestruturação, histórico de negociação, controle de garantias e portal do cliente.',
    tag: 'Tecnologia',
    href: '/solucoes#tecnologia',
  },
  {
    icone: Bot,
    titulo: 'ALIX · IA Aplicada',
    sub: 'Assistente consultivo',
    descricao:
      'IA treinada em legislação, jurisprudência e metodologia ALETIS. Apoia triagem, geração de peças e atendimento ao cliente.',
    tag: 'Inovação',
    href: '/solucoes#alix',
  },
]

export function Solucoes() {
  return (
    <Section tone="bege" id="solucoes-preview">
      <Container>
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
          <Reveal>
            <Eyebrow>Soluções</Eyebrow>
            <h2 className="mt-6 display-lg max-w-2xl text-aletis-grafite-escuro">
              Um portfólio construído para o ciclo{' '}
              <span className="italic text-aletis-verde-escuro">inteiro</span> do produtor.
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <Link href="/solucoes" className="btn-secondary">
              Ver catálogo completo
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {solucoes.map((s, i) => {
            const Icon = s.icone
            return (
              <Reveal key={s.titulo} delay={(i % 3) * 80}>
                <Link
                  href={s.href}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-aletis-borda/70 bg-white p-6 transition-all duration-500 hover:-translate-y-1 hover:border-aletis-dourado/50 hover:shadow-premium-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-aletis-dourado/40 bg-aletis-dourado/10 text-aletis-verde-escuro transition group-hover:bg-aletis-dourado/20">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full border border-aletis-borda bg-aletis-marfim px-2.5 py-1 text-[10px] font-display font-semibold uppercase tracking-wider text-aletis-grafite-medio">
                      {s.tag}
                    </span>
                  </div>
                  <h3 className="mt-5 font-display text-xl font-semibold text-aletis-grafite-escuro">
                    {s.titulo}
                  </h3>
                  <p className="mt-1 text-[11px] font-body uppercase tracking-widest2 text-aletis-dourado-escuro">
                    {s.sub}
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-aletis-grafite-medio">
                    {s.descricao}
                  </p>
                  <div className="mt-6 flex items-center gap-1.5 pt-4 border-t border-aletis-borda/60 text-[12px] font-display font-semibold uppercase tracking-wider text-aletis-verde-escuro">
                    Explorar
                    <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                </Link>
              </Reveal>
            )
          })}
        </div>
      </Container>
    </Section>
  )
}
