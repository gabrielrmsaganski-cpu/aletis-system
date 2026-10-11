import Link from 'next/link'
import { ArrowRight, Calculator, Handshake, Scale, ShieldCheck, TrendingUp } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Reveal } from '@/components/ui/Reveal'
import BrandMark from '@/components/ui/BrandMark'
import BrandWatermark from '@/components/ui/BrandWatermark'
import { BrandIcon } from '@/components/ui/BrandIcon'

const trustItems = [
  { label: 'Contratos lidos antes da proposta', icon: ShieldCheck },
  { label: 'Tese financeira com base documental', icon: Scale },
  { label: 'Negociação organizada por credor', icon: Handshake },
]

export function Hero() {
  return (
    <section
      className="relative isolate overflow-hidden text-aletis-cream"
      style={{
        backgroundImage:
          'linear-gradient(135deg, rgba(8,13,9,0.98) 0%, rgba(13,22,17,0.97) 48%, rgba(23,37,27,0.94) 100%), url(/brand/pattern/repetidor.png)',
        backgroundColor: '#080d09',
        backgroundSize: 'auto, 340px',
        backgroundBlendMode: 'normal, soft-light',
        backgroundRepeat: 'no-repeat, repeat',
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.11]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(237,233,217,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(237,233,217,0.12) 1px, transparent 1px)',
          backgroundSize: '96px 96px',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-aletis-gold/80 to-transparent"
      />

      <BrandWatermark
        size={720}
        tone="cream"
        opacity={0.04}
        className="absolute -right-44 -bottom-44 hidden lg:block"
        rotate={-6}
      />

      <Container className="relative py-20 md:py-24 lg:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.02fr)_minmax(420px,0.78fr)]">
          <div className="min-w-0">
            <Reveal>
              <BrandMark variant="full" tone="cream" size={52} className="max-w-full" />
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-8 display-3xl max-w-4xl">
                Dívida, caixa e negociação com{' '}
                <span className="text-gold-gradient italic">clareza técnica</span>.
              </h1>
            </Reveal>

            <Reveal delay={140}>
              <p className="mt-6 max-w-2xl font-display text-xl font-semibold leading-snug text-aletis-gold md:text-[28px]">
                Assessoria financeira para produtores, grupos e empresas do agro que precisam decidir com números confiáveis.
              </p>
            </Reveal>

            <Reveal delay={200}>
              <p className="mt-6 max-w-xl font-body text-[15px] leading-relaxed text-aletis-sage-claro/86 md:text-[16px]">
                A ALETIS organiza contratos, garantias, fluxo de safra e cenário de credores em um dossiê único. O resultado é um caminho negociável, documentado e possível de acompanhar.
              </p>
            </Reveal>

            <Reveal delay={260}>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/contato" className="btn-primary">
                  Solicitar diagnóstico
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/calculadoras" className="btn-ghost">
                  <Calculator className="h-4 w-4" />
                  Abrir calculadoras
                </Link>
              </div>
            </Reveal>

            <Reveal delay={320}>
              <div className="mt-10 grid gap-3 border-t border-aletis-sage/15 pt-6 sm:grid-cols-3">
                {trustItems.map(({ label, icon: Icon }) => (
                  <div key={label} className="flex items-center gap-2 text-[12px] leading-snug text-aletis-cream/62">
                    <Icon className="h-4 w-4 flex-shrink-0 text-aletis-gold" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal delay={280}>
            <div className="relative border border-aletis-gold/28 bg-aletis-verde-profundo/72 p-5 shadow-premium backdrop-blur-sm md:p-6" style={{ borderRadius: 8 }}>
              <div className="flex items-start justify-between gap-4 border-b border-aletis-sage/16 pb-4">
                <div className="flex items-center gap-3">
                  <BrandIcon id={1} size={44} className="opacity-95" />
                  <div>
                    <p className="font-display text-[12px] font-semibold text-aletis-gold">Dossiê ALETIS</p>
                    <p className="mt-1 text-[12px] text-aletis-cream/52">Leitura financeira preliminar</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 border border-aletis-gold/30 bg-aletis-gold/10 px-2.5 py-1 text-[11px] text-aletis-gold" style={{ borderRadius: 6 }}>
                  <TrendingUp className="h-3.5 w-3.5" />
                  DSCR
                </span>
              </div>

              <div className="mt-5 space-y-4">
                <StatRow label="Exposição consolidada" value="Contratos + CPRs + fiscal" />
                <StatRow label="Pontos que merecem revisão" value="Encargos, garantias e prazos" accent />
                <StatRow label="Cenário negociável" value="Fluxo de safra preservado" progress={81} />
              </div>

              <div className="mt-6 border-t border-aletis-sage/16 pt-5">
                <p className="text-[12px] text-aletis-cream/55">A decisão sai de um conjunto disperso de cobranças e vira</p>
                <p className="mt-1 font-display text-4xl font-bold leading-none text-aletis-cream md:text-[44px]">
                  3 cenários
                </p>
                <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[11px] text-aletis-cream/58">
                  <span className="border border-aletis-sage/14 px-2 py-2" style={{ borderRadius: 6 }}>
                    Central
                  </span>
                  <span className="border border-aletis-sage/14 px-2 py-2" style={{ borderRadius: 6 }}>
                    Conservador
                  </span>
                  <span className="border border-aletis-sage/14 px-2 py-2" style={{ borderRadius: 6 }}>
                    Stress
                  </span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </Container>

      <div aria-hidden="true" className="relative h-px w-full bg-gradient-to-r from-transparent via-aletis-gold/45 to-transparent" />
    </section>
  )
}

function StatRow({
  label,
  value,
  accent,
  progress,
}: {
  label: string
  value: string
  accent?: boolean
  progress?: number
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-[12px] text-aletis-cream/58">{label}</span>
        <span className={`font-display text-sm font-semibold tabular-nums ${accent ? 'text-aletis-gold' : 'text-aletis-cream'}`}>
          {value}
        </span>
      </div>
      {typeof progress === 'number' && (
        <div className="mt-2 h-1 overflow-hidden bg-aletis-cream/10" style={{ borderRadius: 999 }}>
          <div className="h-full bg-aletis-gold" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  )
}
