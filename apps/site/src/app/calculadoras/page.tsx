import type { Metadata } from 'next'
import Link from 'next/link'
import { Calculator, Sprout, Scale, ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'

export const metadata: Metadata = {
  title: 'Calculadoras · Simuladores financeiros agro',
  description:
    'Três simuladores ALETIS: reestruturação de dívida, capacidade de pagamento safra e detector de abusividade. Sem cadastro, resultado em tempo real.',
}

const calcs = [
  {
    slug: 'reestruturacao',
    icone: Calculator,
    titulo: 'Simulador de Reestruturação',
    subtitulo: 'Estime a economia real em um acordo ALETIS',
    descricao:
      'Saldo devedor, perfil de credores, prazo desejado. Retorna economia estimada, nova parcela e DSCR do cenário.',
    tempoMedio: '2 min',
    cor: 'from-aletis-verde-escuro to-aletis-verde',
  },
  {
    slug: 'capacidade-safra',
    icone: Sprout,
    titulo: 'Capacidade de Pagamento Safra',
    subtitulo: 'Quanto de dívida sua próxima safra suporta',
    descricao:
      'Receita bruta projetada, custos e serviço da dívida. Retorna DSCR, capacidade máxima e stress test de preço.',
    tempoMedio: '3 min',
    cor: 'from-aletis-verde to-aletis-verde-medio',
  },
  {
    slug: 'abusividade',
    icone: Scale,
    titulo: 'Detector de Abusividade',
    subtitulo: 'Sinaliza descaracterização e anatocismo',
    descricao:
      'Tipo de contrato, ano e taxa contratada. Compara com PRONAMP da época e identifica risco revisional.',
    tempoMedio: '2 min',
    cor: 'from-aletis-dourado-escuro to-aletis-dourado',
  },
]

export default function CalculadorasHub() {
  return (
    <>
      <PageHeader
        eyebrow="Ferramentas online"
        titulo={
          <>
            Simuladores técnicos.{' '}
            <span className="italic text-aletis-dourado">Sem cadastro.</span>
          </>
        }
        subtitulo="Três ferramentas construídas pelo time técnico da ALETIS. Rodam no navegador, resultado em tempo real, e você só deixa contato se quiser validar com um especialista."
        breadcrumbs={[
          { label: 'Início', href: '/' },
          { label: 'Calculadoras' },
        ]}
      />

      <Section tone="marfim">
        <Container>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {calcs.map((c, i) => {
              const Icon = c.icone
              return (
                <Reveal key={c.slug} delay={i * 100}>
                  <Link
                    href={`/calculadoras/${c.slug}`}
                    className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-aletis-borda/70 bg-white transition-all duration-500 hover:-translate-y-1 hover:border-aletis-dourado/40 hover:shadow-premium"
                  >
                    <div className={`relative overflow-hidden bg-gradient-to-br ${c.cor} p-8 text-white`}>
                      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-10 bg-grain" />
                      <div className="relative flex items-center justify-between">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-aletis-dourado/40 bg-aletis-dourado/15">
                          <Icon className="h-5 w-5 text-aletis-dourado" />
                        </div>
                        <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-display font-semibold uppercase tracking-wider text-white">
                          ~{c.tempoMedio}
                        </span>
                      </div>
                      <h3 className="relative mt-8 font-display text-2xl font-semibold">{c.titulo}</h3>
                      <p className="relative mt-1 text-[12px] font-body uppercase tracking-widest2 text-white/60">
                        {c.subtitulo}
                      </p>
                    </div>
                    <div className="flex flex-1 flex-col justify-between px-7 pb-6 pt-6">
                      <p className="text-sm leading-relaxed text-aletis-grafite-medio">{c.descricao}</p>
                      <div className="mt-6 flex items-center gap-1.5 border-t border-aletis-borda/60 pt-4 font-display text-[12px] font-semibold uppercase tracking-wider text-aletis-verde-escuro transition group-hover:text-aletis-dourado-escuro">
                        Abrir simulador
                        <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
                      </div>
                    </div>
                  </Link>
                </Reveal>
              )
            })}
          </div>

          <Reveal delay={360}>
            <div className="mt-14 rounded-2xl border border-aletis-borda/70 bg-aletis-bege p-8 md:p-10">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="eyebrow">
                    <span className="gold-hairline" aria-hidden="true" />
                    Precisa de análise real?
                  </p>
                  <h3 className="mt-3 font-display text-2xl font-semibold text-aletis-grafite-escuro md:text-3xl">
                    O diagnóstico oficial ALETIS é gratuito e sai em 72 horas.
                  </h3>
                  <p className="mt-2 max-w-xl text-sm text-aletis-grafite-medio">
                    Nossos simuladores usam heurísticas comerciais. O diagnóstico técnico é feito com os contratos e memória de cálculo auditável.
                  </p>
                </div>
                <Link href="/contato" className="btn-primary flex-shrink-0">
                  Solicitar diagnóstico
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Reveal>
        </Container>
      </Section>
    </>
  )
}
