/**
 * BrandMark — assinatura visual oficial da ALETIS (site institucional).
 *
 * Renderiza o símbolo bracket-A SVG inline + wordmark "ALETIS" em
 * Chakra Petch + slogan oficial. Variantes:
 *  - "full"      símbolo + ALETIS + slogan, horizontal
 *  - "stacked"   símbolo no topo, ALETIS centrado, slogan abaixo
 *  - "wordmark"  símbolo + ALETIS, sem slogan
 *  - "symbol"    apenas o quadrado-bracket
 *
 * Tons: "cream" (fundos verdes), "verde" (fundos cream), "gold" (acento).
 */
import { memo } from 'react'

type Tone = 'cream' | 'verde' | 'gold'
type Variant = 'full' | 'stacked' | 'wordmark' | 'symbol'

interface BrandMarkProps {
  variant?: Variant
  tone?: Tone
  size?: number
  withSlogan?: boolean
  className?: string
  ariaLabel?: string
}

function fgFor(tone: Tone): string {
  if (tone === 'cream') return '#ede9d9'
  if (tone === 'gold') return '#cb9d52'
  return '#17251b'
}

export function BrandSymbol({
  tone,
  size,
  strokeWidth = 4,
}: {
  tone: Tone
  size: number
  strokeWidth?: number
}) {
  const fg = fgFor(tone)
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <rect
        x="6"
        y="6"
        width="52"
        height="52"
        rx="2"
        fill="none"
        stroke={fg}
        strokeWidth={strokeWidth}
      />
      <path
        d="M19 50 L32 16 L45 50 Z"
        fill="none"
        stroke={fg}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
      <rect x="24" y="36" width="16" height="3.6" fill={fg} />
    </svg>
  )
}

function BrandMarkInner({
  variant = 'full',
  tone = 'verde',
  size = 36,
  withSlogan,
  className = '',
  ariaLabel = 'ALETIS — Finanças Estratégicas & Agrobusiness',
}: BrandMarkProps) {
  const fg = fgFor(tone)
  const slogan = 'Finanças Estratégicas & Agrobusiness'
  const wordSize = size * 0.66
  const sloganSize = Math.max(9, size * 0.22)

  if (variant === 'symbol') {
    return (
      <span className={`inline-flex ${className}`} aria-label={ariaLabel}>
        <BrandSymbol tone={tone} size={size} />
      </span>
    )
  }

  if (variant === 'stacked') {
    return (
      <span
        className={`inline-flex flex-col items-center gap-2 ${className}`}
        aria-label={ariaLabel}
      >
        <BrandSymbol tone={tone} size={size} />
        <span
          className="font-display font-bold tracking-[0.08em] leading-none"
          style={{ color: fg, fontSize: wordSize }}
        >
          ALETIS
        </span>
        {(withSlogan ?? true) && (
          <span
            className="font-body tracking-wide leading-none text-center"
            style={{ color: fg, fontSize: sloganSize, opacity: 0.78 }}
          >
            {slogan}
          </span>
        )}
      </span>
    )
  }

  const showSlogan = withSlogan ?? variant === 'full'

  return (
    <span
      className={`inline-flex items-center gap-3 ${className}`}
      aria-label={ariaLabel}
    >
      <BrandSymbol tone={tone} size={size} />
      <span className="flex flex-col leading-none">
        <span
          className="font-display font-bold tracking-[0.06em]"
          style={{ color: fg, fontSize: wordSize }}
        >
          ALETIS
        </span>
        {showSlogan && (
          <span
            className="mt-1 font-body tracking-wide"
            style={{ color: fg, fontSize: sloganSize, opacity: 0.78 }}
          >
            {slogan}
          </span>
        )}
      </span>
    </span>
  )
}

const BrandMark = memo(BrandMarkInner)
export default BrandMark
