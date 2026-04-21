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
    <section className="relative border-b border-aletis-borda/60 bg-aletis-marfim">
      <Container>
        <div className="grid grid-cols-2 divide-x divide-aletis-borda/60 py-10 md:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal
              key={s.label}
              delay={i * 80}
              className="px-5 text-center first:pl-0 last:pr-0 md:px-8"
            >
              <p className="font-display text-3xl font-semibold leading-none tracking-tight text-aletis-verde-escuro md:text-[40px]">
                {s.valor}
              </p>
              <p className="mt-3 text-[11px] font-body uppercase tracking-widest2 text-aletis-grafite-medio">
                {s.label}
              </p>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  )
}
