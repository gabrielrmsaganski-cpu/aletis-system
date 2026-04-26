import { Container } from '@/components/ui/Container'
import { Reveal } from '@/components/ui/Reveal'

const stats = [
  { valor: 'R$ 280M+', label: 'em dívida analisada' },
  { valor: '62%', label: 'de redução média em reestruturações' },
  { valor: '72h', label: 'para diagnóstico inicial' },
  { valor: '14', label: 'classes de credor cobertas' },
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
              className="px-5 text-center first:pl-0 last:pr-0 md:px-8"
            >
              <p className="font-display text-[36px] md:text-[52px] font-bold leading-none tabular-nums tracking-tight text-aletis-verde">
                {s.valor}
              </p>
              <p className="mt-3 font-display text-[10.5px] uppercase tracking-widest2 text-aletis-verde-medio">
                {s.label}
              </p>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  )
}
