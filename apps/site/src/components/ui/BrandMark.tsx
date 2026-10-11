import { memo } from 'react'
import Image from 'next/image'
import { ALETIS_COLORS, ALETIS_SYMBOL } from '@aletis/brand'

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

const LOGOS = {
  full: {
    cream: { src: '/brand/logos/principal-04.png', width: 3211, height: 720 },
    verde: { src: '/brand/logos/principal-03.png', width: 3211, height: 721 },
    gold: { src: '/brand/logos/principal-04.png', width: 3211, height: 720 },
  },
  stacked: {
    cream: { src: '/brand/logos/reduzido-12.png', width: 3875, height: 1607 },
    verde: { src: '/brand/logos/reduzido-11.png', width: 3875, height: 1606 },
    gold: { src: '/brand/logos/reduzido-12.png', width: 3875, height: 1607 },
  },
} as const

function fgFor(tone: Tone): string {
  if (tone === 'cream') return ALETIS_COLORS.background
  if (tone === 'gold') return ALETIS_COLORS.accent
  return ALETIS_COLORS.primary
}

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

function BrandMarkInner({
  variant = 'full',
  tone = 'verde',
  size = 36,
  withSlogan,
  className = '',
  ariaLabel = 'ALETIS - Finanças Estratégicas & Agrobusiness',
}: BrandMarkProps) {
  if (variant === 'symbol') {
    return (
      <span className={`inline-flex ${className}`} aria-label={ariaLabel}>
        <BrandSymbol tone={tone} size={size} />
      </span>
    )
  }

  const logoKind = variant === 'stacked' ? 'stacked' : 'full'
  const asset = LOGOS[logoKind][tone]
  const ratio = asset.width / asset.height
  const renderedHeight = logoKind === 'stacked' ? Math.max(size, 84) : size
  const renderedWidth = Math.round(renderedHeight * ratio)

  return (
    <span
      className={`inline-block align-middle ${className}`}
      aria-label={ariaLabel}
      style={{ width: renderedWidth, height: renderedHeight }}
    >
      <Image
        src={asset.src}
        width={asset.width}
        height={asset.height}
        alt="ALETIS"
        priority
        sizes={`${renderedWidth}px`}
        className="block h-full w-full object-contain"
      />
    </span>
  )
}

const BrandMark = memo(BrandMarkInner)
export default BrandMark
