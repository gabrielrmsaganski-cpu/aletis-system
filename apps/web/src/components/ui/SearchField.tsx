import { useId } from 'react'
import { Search, X } from 'lucide-react'

/** Busca local controlada: a página continua responsável pelo filtro e pelos dados. */
export default function SearchField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string
}) {
  const id = useId()
  return <div className="min-w-0 flex-1">
    <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
    <div className="relative">
      <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input id={id} type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="input-field w-full pl-10 pr-10 text-sm [&::-webkit-search-cancel-button]:appearance-none" />
      {value && <button type="button" aria-label={`Limpar ${label.toLocaleLowerCase('pt-BR')}`} onClick={() => { onChange(''); document.getElementById(id)?.focus() }} className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-muted-foreground hover:bg-muted"><X size={15} aria-hidden="true" /></button>}
    </div>
  </div>
}
