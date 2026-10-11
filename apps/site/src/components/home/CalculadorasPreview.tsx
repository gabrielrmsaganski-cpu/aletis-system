import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { BrandIcon } from '@/components/ui/BrandIcon'

const calcs = [
  {
    slug: 'reestruturacao',
    titulo: 'Simulador de Reestruturação',
    subtitulo: 'Teste prazo, parcela e folga de caixa',
    descricao:
      'Informe o saldo devedor, o perfil dos credores e o prazo desejado. Retornamos a economia estimada, o fluxo mensal e o DSCR do cenário.',
    destaque: 'Cenário indicativo',
    brandIcon: 3,
    cor: 'from-aletis-verde-escuro to-aletis-verde',
  },
  {
    slug: 'capacidade-safra',
    titulo: 'Capacidade de Pagamento Safra',
    subtitulo: 'Quanto de dívida sua próxima safra suporta',
    descricao:
      'Entra receita bruta projetada, custeio, CPR comprometida e despesas fixas. Sai a capacidade máxima de serviço da dívida e stress test de preço.',
    destaque: 'DSCR · stress de −15%',
    brandIcon: 8,
    cor: 'from-aletis-verde to-aletis-verde-medio',
  },
  {
    slug: 'abusividade',
    titulo: 'Detector de Abusividade',
    subtitulo: 'Sinaliza descaracterização de crédito rural',
    descricao:
      'Compara a taxa contratada com o PRONAF/PRONAMP da época, detecta capitalização mensal e sinaliza cláusulas revisáveis conforme súmulas STJ.',
    destaque: 'Base: Res. BCB 4.966/21',
    brandIcon: 13,
    cor: 'from-aletis-dourado-escuro to-aletis-dourado',
  },
]

export function CalculadorasPreview() {
  return (
    <Section tone="marfim">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <Eyebrow>Ferramentas online</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-6 display-lg text-aletis-grafite-escuro">
              Três calculadoras.{' '}
              <span className="italic text-aletis-verde-escuro">Zero cadastro.</span>
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-5 text-base text-aletis-grafite-medio md:text-lg">
              Ferramentas para uma primeira leitura. Rodam direto no navegador
              e ajudam a chegar à conversa com mais contexto.
            </p>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {calcs.map((c, i) => (
              <Reveal key={c.slug} delay={i * 100}>
                <Link
                  href={`/calculadoras/${c.slug}`}
                  className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-aletis-borda/70 bg-white transition-all duration-500 hover:-translate-y-1 hover:border-aletis-dourado/40 hover:shadow-premium"
                >
                  <div
                    className={`relative overflow-hidden bg-gradient-to-br ${c.cor} p-7 text-white`}
                  >
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 opacity-10 bg-grain"
                    />
                    <div className="relative flex items-center justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-aletis-dourado/40 bg-aletis-dourado/15">
                        <BrandIcon id={c.brandIcon} size={44} />
                      </div>
                      <span className="rounded-full border border-aletis-dourado/40 bg-aletis-dourado/10 px-3 py-1 text-[10px] font-display font-semibold uppercase tracking-wider text-aletis-dourado">
                        {c.destaque}
                      </span>
                    </div>
                    <h3 className="relative mt-7 font-display text-2xl font-semibold">
                      {c.titulo}
                    </h3>
                    <p className="relative mt-1 text-[12px] font-body uppercase tracking-widest2 text-white/60">
                      {c.subtitulo}
                    </p>
                  </div>
                  <div className="flex flex-1 flex-col justify-between px-7 pb-6 pt-5">
                    <p className="text-sm leading-relaxed text-aletis-grafite-medio">
                      {c.descricao}
                    </p>
                    <div className="mt-6 flex items-center gap-1.5 border-t border-aletis-borda/60 pt-4 font-display text-[12px] font-semibold uppercase tracking-wider text-aletis-verde-escuro transition group-hover:text-aletis-dourado-escuro">
                      Abrir calculadora
                      <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
                    </div>
                  </div>
                </Link>
              </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  )
}
