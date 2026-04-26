/**
 * BrandWatermark — símbolo bracket-A em ornamento de fundo.
 *
 * Usado para "selar" áreas grandes (hero, sidebar, login, splash) com
 * a marca em opacidade reduzida — sem competir com o conteúdo. Sempre
 * `pointer-events-none` e `aria-hidden`.
 *
 * Exemplos:
 *   <BrandWatermark size={520} tone="cream" opacity={0.05} className="absolute -right-24 -bottom-24" />
 */
import { BrandSymbol } from './BrandMark'

interface BrandWatermarkProps {
  size?: number
  tone?: 'cream' | 'verde' | 'gold'
  opacity?: number
  className?: string
  rotate?: number
}

export default function BrandWatermark({
  size = 360,
  tone = 'cream',
  opacity = 0.06,
  className = '',
  rotate = 0,
}: BrandWatermarkProps) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none select-none ${className}`}
      style={{ opacity, transform: rotate ? `rotate(${rotate}deg)` : undefined }}
    >
      <BrandSymbol tone={tone} size={size} strokeWidth={2.4} />
    </span>
  )
}
