import { healthColor } from './utils'

export default function HealthGauge({ value, size = 80 }: { value: number; size?: number }) {
  const strokeWidth = Math.max(4, Math.round(size * 0.075))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (value / 100) * circumference
  const color = healthColor(value)
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E2DDD5" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-[1.5s] ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-semibold tabular-nums" style={{ color, fontSize: size * 0.26 }}>
          {value}
        </span>
        <span className="text-muted-foreground -mt-0.5" style={{ fontSize: size * 0.13 }}>saúde</span>
      </div>
    </div>
  )
}
