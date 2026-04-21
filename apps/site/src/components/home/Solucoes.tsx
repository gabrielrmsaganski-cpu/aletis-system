import Link from 'next/link'
import {
  Stethoscope,
  RefreshCw,
  Scale,
  TrendingUp,
  BarChart3,
  LifeBuoy,
  ArrowUpRight,
} from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'

const solucoes = [
  {
    icone: Stethoscope,
    titulo: 'Diagnóstico Financeiro',
    sub: 'Porta de entrada · 72h',
    descricao:
      'Toda a dívida do produtor em uma única memória de cálculo auditável, com abusividade mapeada, DSCR dimensionado e plano priorizado.',
    tag: 'Gratuito',
    href: '/solucoes#diagnostico',
  },
  {
    icone: RefreshCw,
    titulo: 'Reestruturação de Dívida',
    sub: 'Multi-credor · DSCR realista',
    descricao:
      'Mesa técnica única com banco, cooperativa, revenda e cerealista simultaneamente. Plano executável em 60–120 meses com contratos prontos para assinar.',
    tag: 'Serviço principal',
    href: '/solucoes#reestruturacao',
  },
  {
    icone: Scale,
    titulo: 'Revisional & Abusividade',
    sub: 'Anatocismo · Crédito rural',
    descricao:
      'Auditoria técnica de CCBs, CPRs e cédulas rurais. Identifica anatocismo, capitalização indevida e descaracterização sob Res. BCB 4.966/21.',
    tag: 'Alta conversão',
    href: '/solucoes#revisional',
  },
  {
    icone: TrendingUp,
    titulo: 'Estruturação Financeira',
    sub: 'Prevenção · profissionalização',
    descricao:
      'Visibilidade de caixa, DRE por fazenda, política de endividamento e governança de garantias. Para grupos que cresceram sem área financeira.',
    tag: 'Preventivo',
    href: '/solucoes#estruturacao',
  },
  {
    icone: BarChart3,
    titulo: 'Inteligência de Mercado',
    sub: 'Commodities · Basis · Timing',
    descricao:
      'Quando vender, quanto travar, em que basis, com que hedge. Decisão de comercialização deixa de ser calendário e vira tese.',
    tag: 'Recorrente',
    href: '/solucoes#mercado',
  },
  {
    icone: LifeBuoy,
    titulo: 'Gestão de Crise',
    sub: 'Turn-around · urgência',
    descricao:
      'Para o produtor em estágio crítico: protesto, execução, risco patrimonial. Triagem em 24h e estabilização do perímetro antes da reestruturação formal.',
    tag: 'Emergência',
    href: '/solucoes#crise',
  },
]

export function Solucoes() {
  return (
    <Section tone="bege" id="solucoes-preview">
      <Container>
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
          <Reveal>
            <Eyebrow>Consultoria</Eyebrow>
            <h2 className="mt-6 display-lg max-w-2xl text-aletis-grafite-escuro">
              Seis frentes.{' '}
              <span className="italic text-aletis-verde-escuro">Uma única mesa.</span>
            </h2>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-aletis-grafite-medio">
              Consultoria financeira estratégica para o agro — do diagnóstico ao acompanhamento
              pós-acordo. Sem vender software, sem vender parecer. Entregando decisão.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <Link href="/solucoes" className="btn-secondary">
              Ver todas as frentes
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
                    <span className="rounded-full border border-aletis-borda bg-aletis-marfim px-2.5 py-1 text-[10px] font-display font-semibold uppercase tracking-wider text-aletis-grafite-escuro">
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
