import Link from 'next/link'
import { ArrowRight, PlayCircle, ShieldCheck, Scale, Handshake } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-br from-aletis-verde-profundo via-aletis-verde-escuro to-aletis-verde-profundo text-white">
      {/* ambient glow */}
      <div aria-hidden="true" className="absolute inset-0 bg-hero-radial" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07] bg-grain mix-blend-overlay"
      />
      {/* frame dourada nas pontas */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-8 top-28 hidden h-[260px] w-px bg-gradient-to-b from-aletis-dourado/60 via-aletis-dourado/20 to-transparent lg:block"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-8 bottom-32 hidden h-[260px] w-px bg-gradient-to-t from-aletis-dourado/60 via-aletis-dourado/20 to-transparent lg:block"
      />

      <Container className="relative py-28 md:py-36 lg:py-44">
        <div className="grid items-center gap-14 lg:grid-cols-[1.15fr_1fr]">
          {/* Left — texto */}
          <div>
            <Reveal>
              <Eyebrow light>Finanças Estratégicas · Agronegócio</Eyebrow>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-8 font-display text-[44px] font-semibold leading-[1.02] tracking-tight md:text-[60px] lg:text-[72px]">
                A mesa que{' '}
                <span className="relative inline-block">
                  <span className="text-gold-gradient italic">reorganiza</span>
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-2 left-0 h-px w-full bg-gradient-to-r from-aletis-dourado/0 via-aletis-dourado to-aletis-dourado/0"
                  />
                </span>
                <br className="hidden md:block" />
                a dívida do agro.
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/75 md:text-[19px]">
                Diagnóstico financeiro auditável, revisão contratual fundamentada e
                negociação multi-credor — em uma única mesa técnica independente, do lado do
                produtor.
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
                  className="group inline-flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider2 text-white/80 hover:text-aletis-dourado transition"
                >
                  <PlayCircle className="h-5 w-5 text-aletis-dourado" />
                  Simular meu cenário
                </Link>
              </div>
            </Reveal>

            {/* chips de confiança */}
            <Reveal delay={320}>
              <div className="mt-14 flex flex-wrap items-center gap-5 border-t border-white/10 pt-6 text-[12px] text-white/55">
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-aletis-dourado" />
                  Memória de cálculo auditável
                </span>
                <span className="inline-flex items-center gap-2">
                  <Scale className="h-3.5 w-3.5 text-aletis-dourado" />
                  Lei 14.181/21 · Res. BCB 4.966/21
                </span>
                <span className="inline-flex items-center gap-2">
                  <Handshake className="h-3.5 w-3.5 text-aletis-dourado" />
                  Mesa multi-credor simultânea
                </span>
              </div>
            </Reveal>
          </div>

          {/* Right — card dashboard hero */}
          <Reveal delay={320}>
            <div className="relative">
              {/* floating card simulando o sistema */}
              <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-6 shadow-premium backdrop-blur-xl">
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-[11px] font-display font-semibold uppercase tracking-wider text-white/60">
                      Diagnóstico auditável
                    </span>
                  </div>
                  <span className="font-display text-xs text-aletis-dourado">Memória de cálculo</span>
                </div>

                <div className="mt-5 space-y-4">
                  <StatRow label="Saldo devedor atualizado" valor="R$ 4.820.000" />
                  <StatRow label="Abusividade detectada" valor="+ R$ 612.430" positivo />
                  <StatRow
                    label="Proposta ALETIS · 72 meses"
                    valor="R$ 3.890.000"
                    barPercent={81}
                  />

                  <div className="mt-5 rounded-xl border border-aletis-dourado/25 bg-aletis-dourado/5 px-4 py-3">
                    <p className="font-display text-xs uppercase tracking-wider text-aletis-dourado">
                      Economia estimada
                    </p>
                    <p className="mt-1 font-display text-3xl font-semibold text-white">
                      R$ 1.342.000
                    </p>
                    <p className="mt-1 text-[11px] text-white/50">
                      Em 5 credores · considerando deságio + revisão de anatocismo
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-3">
                    {['Crédito Rural', 'CPR', 'Bancário'].map((t) => (
                      <div
                        key={t}
                        className="rounded-lg border border-white/5 bg-white/[0.02] px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-white/60"
                      >
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* pequenos badges flutuantes */}
              <div className="absolute -right-3 -top-3 hidden rounded-full border border-aletis-dourado/40 bg-aletis-verde-profundo px-3 py-1.5 text-[10px] font-display font-semibold uppercase tracking-wider text-aletis-dourado md:block">
                Mesa ALETIS
              </div>
              <div className="absolute -bottom-4 left-8 hidden rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-display font-semibold uppercase tracking-wider text-emerald-300 md:block">
                DSCR &gt; 1.25 ✓
              </div>
            </div>
          </Reveal>
        </div>
      </Container>

      {/* divider dourado ultra fino */}
      <div
        aria-hidden="true"
        className="relative h-px w-full bg-gradient-to-r from-transparent via-aletis-dourado/40 to-transparent"
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
        <span className="text-xs text-white/55">{label}</span>
        <span
          className={`font-display text-sm font-semibold ${
            positivo ? 'text-emerald-300' : 'text-white'
          }`}
        >
          {valor}
        </span>
      </div>
      {typeof barPercent === 'number' && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-aletis-dourado/70 to-aletis-dourado"
            style={{ width: `${barPercent}%` }}
          />
        </div>
      )}
    </div>
  )
}
