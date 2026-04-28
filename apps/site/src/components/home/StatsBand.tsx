import { Container } from '@/components/ui/Container'
import { Reveal } from '@/components/ui/Reveal'
import Link from 'next/link'

/**
 * Números de mesa — auditados internamente pela equipe ALETIS.
 * Nota metodológica explícita logo abaixo (transparência total).
 *
 * Atualizar trimestralmente conforme dossiê interno.
 * Última revisão: Q1 2026.
 */
const stats = [
  {
    valor: 'R$ 280M+',
    label: 'em passivo analisado',
    detalhe: 'Carteira agregada das mesas Agro + Corporate desde 2022',
  },
  {
    valor: '62%',
    label: 'redução média em reestruturações',
    detalhe: 'Mediana sobre acordos finalizados (não a média do hero)',
  },
  {
    valor: '72h',
    label: 'para diagnóstico inicial',
    detalhe: 'Mesa pré-acordo entrega laudo + 3 cenários',
  },
  {
    valor: '14',
    label: 'classes de credor cobertas',
    detalhe: 'BB, BR, Sicredi, Sicoob, BNDES, FCO, FNO, FNE, cooperativas, fundos, revendas, traders, factorings, instituições não-bancárias',
  },
]

export function StatsBand() {
  return (
    <section className="relative border-b border-aletis-borda/60 bg-aletis-cream-marfim">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-aletis-gold/45 to-transparent"
      />
      <Container>
        <div className="grid grid-cols-2 divide-x divide-aletis-cream-escuro/60 py-14 md:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal
              key={s.label}
              delay={i * 80}
              className="group relative px-5 text-center first:pl-0 last:pr-0 md:px-8"
            >
              <p className="font-display text-[36px] md:text-[52px] font-bold leading-none tabular-nums tracking-tight text-aletis-verde">
                {s.valor}
              </p>
              <p className="mt-3 font-display text-[10.5px] uppercase tracking-widest2 text-aletis-verde-medio">
                {s.label}
              </p>
              {/* Tooltip com nota metodológica */}
              <span
                role="tooltip"
                className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-[220px] -translate-x-1/2 rounded-lg border border-aletis-borda bg-white px-3 py-2 text-[11px] leading-snug text-aletis-verde-medio opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100"
              >
                {s.detalhe}
              </span>
            </Reveal>
          ))}
        </div>
        {/* Nota metodológica: transparência sobre origem dos números */}
        <div className="border-t border-aletis-cream-escuro/60 py-4 text-center">
          <p className="text-[11px] font-body text-aletis-verde-medio/80">
            Números auditados pela mesa ALETIS · Dados consolidados Q1 2026 ·{' '}
            <Link
              href="/cases"
              className="underline decoration-aletis-gold/40 underline-offset-2 hover:decoration-aletis-gold/80"
            >
              ver cases reais (anônimos)
            </Link>
          </p>
        </div>
      </Container>
    </section>
  )
}
