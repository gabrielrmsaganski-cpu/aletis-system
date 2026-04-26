/**
 * BrandMark — assinatura visual oficial da ALETIS.
 *
 * Renderiza o símbolo (bracket + monograma "A") + wordmark conforme o
 * Manual de Identidade Visual. Centraliza a aplicação da marca para
 * evitar variações ad-hoc em cada página.
 *
 * Variantes:
 *  - "full"      símbolo + ALETIS + slogan ("Finanças Estratégicas & Agrobusiness") horizontal
 *  - "stacked"   símbolo acima, ALETIS centrado, slogan abaixo (uso em hero/login)
 *  - "wordmark"  símbolo + ALETIS sem slogan
 *  - "symbol"    apenas o quadrado-bracket (ícone)
 *
 * Tons: "cream" (fundos verdes/dark) ou "verde" (fundos cream/branco).
 *
 * O símbolo é um SVG inline desenhado a partir do bracket-A do manual,
 * o que mantém nitidez em qualquer tamanho e permite recolorir via prop.
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

/**
 * Símbolo bracket-A: quadrado outline + monograma A geométrico interno.
 * Proporções calibradas com o material oficial (PDF página 14-15).
 */
function Symbol({ tone, size, strokeWidth = 4 }: { tone: Tone; size: number; strokeWidth?: number }) {
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
      {/* moldura do bracket */}
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
      {/* "A" geométrico interno */}
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
        <Symbol tone={tone} size={size} />
      </span>
    )
  }

  if (variant === 'stacked') {
    return (
      <span
        className={`inline-flex flex-col items-center gap-2 ${className}`}
        aria-label={ariaLabel}
      >
        <Symbol tone={tone} size={size} />
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
      <Symbol tone={tone} size={size} />
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

/**
 * Componente exportado também como Symbol nomeado para reuso em
 * BrandWatermark e demais decorações de fundo.
 */
export { Symbol as BrandSymbol }
