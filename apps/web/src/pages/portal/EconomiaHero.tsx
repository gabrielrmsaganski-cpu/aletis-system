// ============================================================
// Portal — Hero cinemático de economia.
// ============================================================
// Counter animado da economia total, barra comparativa SVG (dívida
// original vs reestruturada), progress ring de pagamentos e breakdown
// por credor com pct de redução.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, TrendingDown, ShieldCheck } from 'lucide-react'
import type { Contrato, BreakdownCredorDTO } from './types'
import { formatBRL, formatBRLShort } from './utils'

interface Props {
  contrato: Contrato | null
  breakdownCredor: BreakdownCredorDTO[]
}

/** easeOutCubic para counter natural — começa rápido e desacelera. */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function useAnimatedNumber(target: number, durationMs = 1500): number {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const fromRef = useRef(0)

  useEffect(() => {
    fromRef.current = value
    startRef.current = null
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const step = (now: number) => {
      if (startRef.current === null) startRef.current = now
      const elapsed = now - startRef.current
      const progress = Math.min(1, elapsed / durationMs)
      const eased = easeOut(progress)
      setValue(fromRef.current + (target - fromRef.current) * eased)
      if (progress < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs])

  return value
}

export function EconomiaHero({ contrato, breakdownCredor }: Props) {
  const economia = contrato?.economia ?? 0
  const valorOriginal = contrato?.valorTotalDivida ?? 0
  const valorAtual = Math.max(0, valorOriginal - economia)
  const valorPago = contrato?.valorTotalPago ?? 0
  const saldoEmAberto = Math.max(0, valorOriginal - valorPago)

  const economiaAnim = useAnimatedNumber(economia, 1600)
  const pctEconomia = valorOriginal > 0 ? (economia / valorOriginal) * 100 : 0
  const pctPago = valorOriginal > 0 ? (valorPago / valorOriginal) * 100 : 0

  // Top 4 credores para o breakdown visual
  const breakdownTop = useMemo(() => breakdownCredor.slice(0, 4), [breakdownCredor])

  return (
    <section className="relative overflow-hidden rounded-3xl border border-aletis-cream-escuro/70 bg-gradient-to-br from-aletis-verde-escuro via-aletis-verde to-aletis-verde-medio p-6 sm:p-8 shadow-brand-lg">
      {/* Padrão sutil */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage: 'url(/brand/pattern/repetidor.png)',
          backgroundSize: '320px',
        }}
      />
      {/* Glow dourado */}
      <div
        aria-hidden
        className="absolute -top-24 -right-24 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(203,157,82,0.25), transparent 70%)' }}
      />

      <div className="relative">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={14} className="text-aletis-gold" />
          <p className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-aletis-gold">
            Sua economia ALETIS
          </p>
        </div>
        <h2 className="font-display text-[44px] sm:text-[56px] leading-none font-bold text-white tabular-nums">
          {formatBRL(economiaAnim)}
        </h2>
        <p className="mt-2 font-body text-[14px] text-aletis-cream/85 max-w-xl leading-relaxed">
          {economia > 0 ? (
            <>
              Esse é o valor que você <strong>já não vai pagar</strong> graças à reestruturação ALETIS — uma redução de{' '}
              <span className="font-semibold text-aletis-gold">{pctEconomia.toFixed(1)}%</span> sobre o saldo original.
            </>
          ) : (
            'A negociação está em curso. Em breve você vê aqui o valor exato que conseguimos economizar.'
          )}
        </p>

        <div className="mt-7 grid gap-6 lg:grid-cols-[1.4fr_1fr] items-start">
          {/* Coluna 1: Comparativo + Breakdown */}
          <div className="space-y-5">
            {/* Bar comparativa */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-display text-[10px] uppercase tracking-widest text-aletis-cream/70">
                  Antes vs depois
                </span>
                <span className="font-body text-[11px] text-aletis-cream/60">
                  Original → Reestruturado
                </span>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-body text-[12px] text-aletis-cream/85">Dívida original</span>
                    <span className="font-display text-[13px] font-semibold text-white tabular-nums">
                      {formatBRLShort(valorOriginal)}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-white/15 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-500 transition-all duration-[1600ms] ease-out"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-body text-[12px] text-aletis-cream/85">Dívida reestruturada</span>
                    <span className="font-display text-[13px] font-semibold text-aletis-gold tabular-nums">
                      {formatBRLShort(valorAtual)}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-white/15 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-[1600ms] ease-out"
                      style={{ width: `${valorOriginal > 0 ? (valorAtual / valorOriginal) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Breakdown por credor */}
            {breakdownTop.length > 0 && (
              <div>
                <p className="font-display text-[10px] uppercase tracking-widest text-aletis-cream/70 mb-2">
                  Por credor (top {breakdownTop.length})
                </p>
                <ul className="space-y-1.5">
                  {breakdownTop.map((b) => (
                    <li
                      key={b.credor}
                      className="flex items-center gap-3 rounded-xl bg-white/8 border border-white/10 px-3 py-2"
                    >
                      <TrendingDown size={14} className="text-aletis-gold flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-[12.5px] font-semibold text-white truncate">{b.credor}</p>
                        <p className="font-body text-[10.5px] text-aletis-cream/70">
                          {formatBRLShort(b.original)} → {formatBRLShort(b.atual)}
                        </p>
                      </div>
                      <span className="font-display text-[11px] font-bold tabular-nums text-aletis-gold">
                        −{b.pct.toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Coluna 2: Ring de progresso + Saldo */}
          <div className="rounded-2xl bg-white/8 border border-white/15 p-5 backdrop-blur-sm">
            <div className="flex flex-col items-center">
              <ProgressRing pct={pctPago} size={140} stroke={10} />
              <p className="mt-3 font-display text-[10px] uppercase tracking-widest text-aletis-cream/70">
                Progresso de pagamento
              </p>
              <p className="font-display text-[15px] font-bold text-white tabular-nums mt-0.5">
                {formatBRLShort(valorPago)} <span className="text-aletis-cream/60 font-body font-normal text-[12px]">de {formatBRLShort(valorOriginal)}</span>
              </p>
            </div>
            <div className="mt-5 pt-4 border-t border-white/15 flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 text-aletis-gold flex-shrink-0" />
              <div>
                <p className="font-display text-[10px] uppercase tracking-widest text-aletis-cream/70">Saldo em aberto</p>
                <p className="font-display text-[16px] font-bold text-white tabular-nums">{formatBRL(saldoEmAberto)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/** SVG circular progress ring com gradiente dourado e label central. */
function ProgressRing({ pct, size, stroke }: { pct: number; size: number; stroke: number }) {
  const animated = useAnimatedNumber(Math.max(0, Math.min(100, pct)), 1500)
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const dash = (animated / 100) * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#cb9d52" />
          <stop offset="100%" stopColor="#e6c074" />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#ring-grad)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2}
        y={size / 2 - 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#fff"
        fontFamily="ChakraPetch, system-ui, sans-serif"
        fontWeight={700}
        fontSize={size * 0.22}
      >
        {animated.toFixed(0)}%
      </text>
      <text
        x={size / 2}
        y={size / 2 + size * 0.16}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="rgba(255,255,255,0.6)"
        fontFamily="ChakraPetch, system-ui, sans-serif"
        fontSize={size * 0.075}
        letterSpacing="0.2em"
      >
        QUITADO
      </text>
    </svg>
  )
}
