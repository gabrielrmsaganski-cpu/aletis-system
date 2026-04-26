import Link from 'next/link'
import { ArrowRight, PlayCircle, ShieldCheck, Scale, Handshake, TrendingUp } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Reveal } from '@/components/ui/Reveal'
import BrandWatermark from '@/components/ui/BrandWatermark'

export function Hero() {
  return (
    <section
      className="relative isolate overflow-hidden text-aletis-cream"
      style={{
        backgroundImage:
          'linear-gradient(140deg, rgba(8,13,9,0.97) 0%, rgba(13,22,17,0.94) 45%, rgba(36,58,44,0.92) 100%), url(/brand/pattern/repetidor.png)',
        backgroundColor: '#080d09',
        backgroundSize: 'auto, 360px',
        backgroundBlendMode: 'normal, soft-light',
        backgroundRepeat: 'no-repeat, repeat',
      }}
    >
      {/* Glow ambiente */}
      <div aria-hidden="true" className="absolute inset-0 bg-hero-radial" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07] bg-grain mix-blend-overlay"
      />

      {/* Watermark do bracket-A gigante */}
      <BrandWatermark
        size={780}
        tone="cream"
        opacity={0.045}
        className="absolute -right-40 -bottom-40 hidden lg:block"
        rotate={-8}
      />
      <BrandWatermark
        size={220}
        tone="gold"
        opacity={0.08}
        className="absolute right-16 top-32 hidden xl:block animate-float-slow"
      />

      {/* Frame dourado nas pontas */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-8 top-32 hidden h-[260px] w-px bg-gradient-to-b from-aletis-gold/65 via-aletis-gold/20 to-transparent lg:block"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-8 bottom-40 hidden h-[260px] w-px bg-gradient-to-t from-aletis-gold/65 via-aletis-gold/20 to-transparent lg:block"
      />

      <Container className="relative py-32 md:py-40 lg:py-48">
        <div className="grid items-center gap-14 lg:grid-cols-[1.15fr_1fr]">
          {/* Esquerda — texto */}
          <div>
            <Reveal>
              <div className="inline-flex items-center gap-2.5 rounded-full border border-aletis-gold/35 bg-aletis-gold/10 px-3.5 py-1.5 text-[10.5px] font-display font-semibold uppercase tracking-widest2 text-aletis-gold">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-aletis-gold opacity-65" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-aletis-gold" />
                </span>
                Finanças Estratégicas · Agrobusiness
              </div>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-8 display-3xl">
                A mesa que{' '}
                <span className="relative inline-block">
                  <span className="text-gold-gradient italic">reorganiza</span>
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-2 left-0 h-px w-full bg-gradient-to-r from-aletis-gold/0 via-aletis-gold to-aletis-gold/0"
                  />
                </span>
                <br className="hidden md:block" />
                a <span className="text-cream-gradient">dívida do agro.</span>
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mt-7 max-w-xl font-body text-[16px] md:text-[17px] leading-relaxed text-aletis-sage-claro/85">
                Diagnóstico financeiro auditável, revisão contratual fundamentada e
                negociação multi-credor — em uma única mesa técnica independente, do lado do
                produtor. Tecnologia ALETIS, metodologia proprietária, números à prova de
                contestação.
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link href="/contato" className="btn-primary">
                  Solicitar diagnóstico
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/calculadoras"
                  className="group inline-flex items-center gap-2.5 font-display text-[12.5px] font-semibold uppercase tracking-wider2 text-aletis-cream/85 hover:text-aletis-gold transition"
                >
                  <PlayCircle className="h-5 w-5 text-aletis-gold transition group-hover:scale-110" />
                  Simular meu cenário
                </Link>
              </div>
            </Reveal>

            {/* Chips de confiança */}
            <Reveal delay={320}>
              <div className="mt-14 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-aletis-sage/15 pt-6 font-body text-[12px] text-aletis-cream/55">
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-aletis-gold" />
                  Memória de cálculo auditável
                </span>
                <span className="inline-flex items-center gap-2">
                  <Scale className="h-3.5 w-3.5 text-aletis-gold" />
                  Lei 14.181/21 · Res. BCB 4.966/21
                </span>
                <span className="inline-flex items-center gap-2">
                  <Handshake className="h-3.5 w-3.5 text-aletis-gold" />
                  Mesa multi-credor simultânea
                </span>
              </div>
            </Reveal>
          </div>

          {/* Direita — Glass card de diagnóstico */}
          <Reveal delay={320}>
            <div className="relative">
              {/* Card principal */}
              <div className="card-glass relative p-7">
                <div className="flex items-center justify-between pb-4 border-b border-aletis-sage/15">
                  <div className="flex items-center gap-2.5">
                    <div className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-aletis-gold/70" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-aletis-gold" />
                    </div>
                    <span className="font-display text-[10.5px] font-semibold uppercase tracking-widest2 text-aletis-cream/65">
                      Diagnóstico ALETIS
                    </span>
                  </div>
                  <span className="font-display text-[10.5px] uppercase tracking-widest2 text-aletis-gold">
                    Memória de cálculo
                  </span>
                </div>

                <div className="mt-5 space-y-4">
                  <StatRow label="Saldo devedor atualizado" valor="R$ 4.820.000" />
                  <StatRow label="Abusividade detectada" valor="+ R$ 612.430" positivo />
                  <StatRow
                    label="Proposta ALETIS · 72 meses"
                    valor="R$ 3.890.000"
                    barPercent={81}
                  />

                  <div className="mt-5 rounded-xl border border-aletis-gold/30 bg-aletis-gold/8 px-4 py-4">
                    <p className="font-display text-[10.5px] uppercase tracking-widest2 text-aletis-gold">
                      Economia estimada
                    </p>
                    <p className="mt-1.5 font-display text-3xl md:text-[34px] font-bold tracking-tight text-aletis-cream">
                      R$ 1.342.000
                    </p>
                    <p className="mt-1 font-body text-[11.5px] text-aletis-cream/55">
                      Em 5 credores · considerando deságio + revisão de anatocismo
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-3">
                    {['Crédito Rural', 'CPR', 'Bancário'].map((t) => (
                      <div
                        key={t}
                        className="rounded-lg border border-aletis-sage/15 bg-aletis-cream/[0.03] px-2 py-2.5 text-center font-display text-[10px] font-semibold uppercase tracking-wider2 text-aletis-cream/65"
                      >
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Badges flutuantes */}
              <div className="absolute -right-3 -top-3 hidden rounded-full border border-aletis-gold/45 bg-aletis-verde-profundo px-3 py-1.5 font-display text-[10px] font-semibold uppercase tracking-widest2 text-aletis-gold md:block shadow-gold">
                Mesa ALETIS
              </div>
              <div className="absolute -bottom-4 left-8 hidden rounded-full border border-aletis-sage/40 bg-aletis-verde-escuro/95 px-3 py-1.5 font-display text-[10px] font-semibold uppercase tracking-widest2 text-aletis-sage-claro md:block shadow-premium">
                <TrendingUp className="mr-1.5 inline h-3 w-3" />
                DSCR &gt; 1.25 ✓
              </div>
            </div>
          </Reveal>
        </div>
      </Container>

      {/* Divider dourado */}
      <div
        aria-hidden="true"
        className="relative h-px w-full bg-gradient-to-r from-transparent via-aletis-gold/45 to-transparent"
      />
    </section>
  )
}

function StatRow({
  label,
  valor,
  positivo,
  barPercent,
}: {
  label: string
  valor: string
  positivo?: boolean
  barPercent?: number
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="font-body text-[12px] text-aletis-cream/60">{label}</span>
        <span
          className={`font-display text-sm font-semibold tabular-nums ${
            positivo ? 'text-aletis-sage-claro' : 'text-aletis-cream'
          }`}
        >
          {valor}
        </span>
      </div>
      {typeof barPercent === 'number' && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-aletis-cream/8">
          <div
            className="h-full rounded-full bg-gradient-to-r from-aletis-gold/75 to-aletis-gold"
            style={{ width: `${barPercent}%` }}
          />
        </div>
      )}
    </div>
  )
}
