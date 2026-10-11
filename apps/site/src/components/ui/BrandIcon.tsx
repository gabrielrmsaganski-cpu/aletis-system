import Image from 'next/image'
import { cn } from '@/lib/cn'

interface BrandIconProps {
  id: number
  size?: number
  className?: string
}

export function BrandIcon({ id, size = 56, className }: BrandIconProps) {
  const safeId = Math.min(25, Math.max(1, id))
  const file = `aletis-icon-${String(safeId).padStart(2, '0')}.png`

  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <Image
        src={`/brand/icons/${file}`}
        alt=""
        width={size}
        height={size}
        sizes={`${size}px`}
        className="h-full w-full object-contain"
      />
    </span>
  )
}
