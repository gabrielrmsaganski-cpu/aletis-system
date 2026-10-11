import type { ReactNode } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'

/** Contêiner de filtros: preserva os controles e a consulta de cada módulo. */
export default function FilterBar({ children, activeCount = 0, onClear, className = '', label = 'Filtros' }: {
  children: ReactNode
  activeCount?: number
  onClear?: () => void
  className?: string
  label?: string
}) {
  return <section aria-label={label} className={`ui-panel p-4 ${className}`}>
    <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
      <SlidersHorizontal size={14} aria-hidden="true" /><span className="font-medium">{label}</span>
      {activeCount > 0 && <span className="rounded bg-[var(--selected-bg)] px-2 py-0.5 text-[var(--selected-fg)]">{activeCount} ativo{activeCount === 1 ? '' : 's'}</span>}
      {activeCount > 0 && onClear && <button type="button" onClick={onClear} className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-muted"><X size={12} />Limpar filtros</button>}
    </div>
    {children}
  </section>
}
