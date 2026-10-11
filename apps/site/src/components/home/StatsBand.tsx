import { Container } from '@/components/ui/Container'
import { Reveal } from '@/components/ui/Reveal'
import Link from 'next/link'

const stats = [
  {
    valor: '4',
    label: 'frentes integradas',
    detalhe: 'Agro, Corporate, Fomento e Gestão no mesmo método de decisão',
  },
  {
    valor: '72h',
    label: 'para a primeira leitura',
    detalhe: 'Prazo típico após recebimento dos documentos essenciais',
  },
  {
    valor: '3',
    label: 'cenários de decisão',
    detalhe: 'Central, conservador e stress para testar o fluxo de safra',
  },
  {
    valor: '1',
    label: 'dossiê executivo',
    detalhe: 'Contratos, garantias, credores, capacidade de pagamento e próximos passos',
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
        <div className="border-t border-aletis-cream-escuro/60 py-4 text-center">
          <p className="text-[11px] font-body text-aletis-verde-medio/80">
            Indicadores de metodologia, não promessa de resultado. Cada caso depende dos contratos e documentos recebidos.{' '}
            <Link
              href="/documentos-necessarios"
              className="underline decoration-aletis-gold/40 underline-offset-2 hover:decoration-aletis-gold/80"
            >
              ver documentos necessários
            </Link>
          </p>
        </div>
      </Container>
    </section>
  )
}
