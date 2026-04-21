'use client'

import { cn } from '@/lib/cn'

export function CampoMoeda({
  label,
  value,
  onChange,
  hint,
  prefix = 'R$',
  suffix,
  placeholder,
  step,
  min,
  max,
  className,
  required,
}: {
  label: string
  value: number | ''
  onChange: (n: number | '') => void
  hint?: string
  prefix?: string
  suffix?: string
  placeholder?: string
  step?: number
  min?: number
  max?: number
  className?: string
  required?: boolean
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 flex items-center justify-between text-[11px] font-display font-semibold uppercase tracking-widest2 text-aletis-grafite-medio">
        <span>
          {label}
          {required && <span className="text-aletis-dourado-escuro ml-1">*</span>}
        </span>
        {hint && <span className="text-[10px] font-body normal-case tracking-normal text-aletis-grafite-claro">{hint}</span>}
      </label>
      <div
        className={cn(
          'group relative flex items-center rounded-xl border border-aletis-borda bg-white px-3 transition focus-within:border-aletis-dourado focus-within:shadow-[0_0_0_4px_rgba(201,168,76,0.12)]',
        )}
      >
        {prefix && (
          <span className="flex-shrink-0 font-display text-sm font-semibold text-aletis-grafite-claro">
            {prefix}
          </span>
        )}
        <input
          type="number"
          inputMode="decimal"
          step={step ?? 'any'}
          min={min}
          max={max}
          value={value === '' ? '' : value}
          onChange={(e) => {
            const v = e.target.value
            if (v === '') onChange('')
            else onChange(Number(v))
          }}
          placeholder={placeholder}
          required={required}
          className="w-full bg-transparent px-3 py-3 font-display text-lg font-semibold text-aletis-grafite-escuro placeholder:font-body placeholder:text-sm placeholder:font-normal placeholder:text-aletis-grafite-claro focus:outline-none"
        />
        {suffix && (
          <span className="flex-shrink-0 font-display text-xs font-semibold uppercase tracking-wider text-aletis-grafite-claro">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}
