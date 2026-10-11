import { memo } from 'react'
import { ALETIS_COLORS, ALETIS_SYMBOL } from '@aletis/brand'

type Tone = 'cream' | 'verde' | 'gold' | 'white'
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
  if (tone === 'cream') return ALETIS_COLORS.background
  if (tone === 'white') return '#ffffff'
  if (tone === 'gold') return ALETIS_COLORS.accent
  return ALETIS_COLORS.primary
}

/**
 * Quando o tone for 'white' usamos um filtro CSS sobre o PNG para
 * remover qualquer matiz e levar tudo a branco puro. Mantemos contraste
 * elevado para sidebars/headers em fundo escuro.
 */
const WHITE_FILTER = 'brightness(0) invert(1)'

/**
 * BrandSymbol — glifo oficial em SVG vetorial (escalavel) usado para
 * tamanhos pequenos (favicons, badges, chips) onde o PNG perderia
 * nitidez. Mantido para retrocompatibilidade.
 */
export function BrandSymbol({
  tone,
  size,
  strokeWidth = 4.4,
  plaque = true,
}: {
  tone: Tone
  size: number
  strokeWidth?: number
  plaque?: boolean
}) {
  const fg = fgFor(tone)
  const hairline = tone === 'verde' ? 'rgba(23, 37, 27, 0.18)' : 'rgba(237, 233, 217, 0.22)'
  const fill = tone === 'verde' ? 'rgba(23, 37, 27, 0.045)' : 'rgba(237, 233, 217, 0.055)'

  return (
    <svg
      viewBox={ALETIS_SYMBOL.viewBox}
      width={size}
      height={size}
      role="img"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      {plaque && <rect x="2.5" y="2.5" width="59" height="59" rx="6" fill={fill} stroke={hairline} strokeWidth="1" />}
      <rect
        x={ALETIS_SYMBOL.frame.x}
        y={ALETIS_SYMBOL.frame.y}
        width={ALETIS_SYMBOL.frame.width}
        height={ALETIS_SYMBOL.frame.height}
        rx={ALETIS_SYMBOL.frame.radius}
        fill="none"
        stroke={fg}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={ALETIS_SYMBOL.aPath}
        fill="none"
        stroke={fg}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={ALETIS_SYMBOL.crossbar.x}
        y={ALETIS_SYMBOL.crossbar.y}
        width={ALETIS_SYMBOL.crossbar.width}
        height={ALETIS_SYMBOL.crossbar.height}
        fill={fg}
      />
    </svg>
  )
}

/* ──────────────────────────────────────────────────────────────
   Logos oficiais (PNG) extraidos do Manual de Identidade Visual
   - principal: lockup horizontal "simbolo + ALETIS + slogan"
   - reduzido : versao compacta vertical (mais quadrada)
   ────────────────────────────────────────────────────────────── */
const LOGO_PATH = '/brand/logos'

function pngForTone(tone: Tone, kind: 'principal' | 'reduzido'): string {
  // 'white' usa o PNG cream com filtro brilho->branco; 'gold' usa dark
  // Os nomes identificam o FUNDO de uso: cream contém a marca verde,
  // dark contém a marca creme. Preserva os arquivos oficiais sem filtros de cor.
  const variant = tone === 'cream' || tone === 'white' ? 'dark' : 'cream'
  return `${LOGO_PATH}/aletis-${kind}-${variant}.png`
}

function BrandMarkInner({
  variant = 'full',
  tone = 'verde',
  size = 36,
  withSlogan,
  className = '',
  ariaLabel = 'ALETIS - Finanças Estratégicas & Agrobusiness',
}: BrandMarkProps) {
  const fg = fgFor(tone)

  // Symbol-only: SVG vetorial (otimo em tamanho pequeno)
  if (variant === 'symbol') {
    return (
      <span className={`inline-flex ${className}`} aria-label={ariaLabel}>
        <BrandSymbol tone={tone} size={size} />
      </span>
    )
  }

  // Wordmark-only: tipografia pura
  if (variant === 'wordmark') {
    const wordSize = Math.max(18, size * 0.66)
    return (
      <span className={`inline-flex items-center ${className}`} aria-label={ariaLabel}>
        <span
          className="font-display font-bold leading-none"
          style={{ color: fg, fontSize: wordSize, letterSpacing: '0.01em' }}
        >
          ALETIS
        </span>
      </span>
    )
  }

  // Stacked: lockup vertical com PNG reduzido oficial
  if (variant === 'stacked') {
    const hide = withSlogan === false
    const height = hide ? size * 1.8 : size * 2.4
    return (
      <span
        className={`inline-flex items-center justify-center ${className}`}
        aria-label={ariaLabel}
      >
        <img
          src={pngForTone(tone, 'reduzido')}
          alt={ariaLabel}
          style={{
            height,
            width: 'auto',
            display: 'block',
            filter: tone === 'white' ? WHITE_FILTER : undefined,
          }}
          draggable={false}
        />
      </span>
    )
  }

  // Full (default): lockup horizontal oficial com simbolo + ALETIS + slogan
  const showSlogan = withSlogan ?? true
  const height = showSlogan ? size * 1.6 : size * 1.05
  return (
    <span
      className={`inline-flex items-center ${className}`}
      aria-label={ariaLabel}
    >
      <img
        src={pngForTone(tone, showSlogan ? 'principal' : 'reduzido')}
        alt={ariaLabel}
        style={{
          height,
          width: 'auto',
          display: 'block',
          filter: tone === 'white' ? WHITE_FILTER : undefined,
        }}
        draggable={false}
      />
    </span>
  )
}

const BrandMark = memo(BrandMarkInner)
export default BrandMark
