import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { BrandIcon } from '@/components/ui/BrandIcon'

const solucoes = [
  {
    icone: 2,
    titulo: 'Diagnóstico Financeiro',
    sub: 'Primeira leitura · 72h',
    descricao:
      'Organiza contratos, extratos, garantias e vencimentos para mostrar onde a pressão está e quais caminhos fazem sentido.',
    tag: 'Entrada',
    href: '/solucoes#diagnostico',
  },
  {
    icone: 7,
    titulo: 'Reestruturação de Dívida',
    sub: 'Credores · fluxo de safra',
    descricao:
      'Desenha uma proposta negociável por credor, com prazos, garantias e capacidade de pagamento conectados à realidade da operação.',
    tag: 'Principal',
    href: '/solucoes#reestruturacao',
  },
  {
    icone: 12,
    titulo: 'Revisional & Abusividade',
    sub: 'Anatocismo · Crédito rural',
    descricao:
      'Revisa CCBs, CPRs e cédulas rurais para separar cobrança legítima de encargos e cláusulas que pedem contestação técnica.',
    tag: 'Revisão',
    href: '/solucoes#revisional',
  },
  {
    icone: 17,
    titulo: 'Estruturação Financeira',
    sub: 'Prevenção · profissionalização',
    descricao:
      'Cria visibilidade de caixa, DRE por unidade, política de endividamento e governança de garantias para reduzir surpresa.',
    tag: 'Preventivo',
    href: '/solucoes#estruturacao',
  },
  {
    icone: 21,
    titulo: 'Inteligência de Mercado',
    sub: 'Commodities · Basis · Timing',
    descricao:
      'Apoio para comercialização, trava, basis, câmbio e cenário de safra com uma leitura que conversa com o caixa.',
    tag: 'Recorrente',
    href: '/solucoes#mercado',
  },
  {
    icone: 24,
    titulo: 'Gestão de Crise',
    sub: 'Turn-around · urgência',
    descricao:
      'Para protesto, execução, perda de prazo ou risco patrimonial: prioriza o que precisa ser estabilizado antes da negociação longa.',
    tag: 'Urgência',
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
              Seis frentes para{' '}
              <span className="italic text-aletis-verde-escuro">organizar decisões difíceis</span>.
            </h2>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-aletis-grafite-medio">
              Do primeiro diagnóstico ao acompanhamento posterior ao acordo,
              a entrega fica concentrada em documentos, números e próximos passos.
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
          {solucoes.map((s, i) => (
              <Reveal key={s.titulo} delay={(i % 3) * 80}>
                <Link
                  href={s.href}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-aletis-borda/70 bg-white p-6 transition-all duration-500 hover:-translate-y-1 hover:border-aletis-dourado/50 hover:shadow-premium-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-aletis-dourado/40 bg-aletis-dourado/10 text-aletis-verde-escuro transition group-hover:bg-aletis-dourado/20">
                      <BrandIcon id={s.icone} size={44} />
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
          ))}
        </div>
      </Container>
    </Section>
  )
}
