import React, { useEffect, useState } from 'react'
import { ChevronDown, Cpu, Loader2, RefreshCw, Sparkles } from 'lucide-react'

export interface AlixModelOption { id: string; label: string; available: boolean; detail?: string }

export default function AlixModelSelector({ value, options, loading, error, disabled, onChange, onRefresh }: { value: string; options: AlixModelOption[]; loading: boolean; error: string | null; disabled: boolean; onChange: (value: string) => void; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const selected = options.find(option => option.id === value)
  const available = options.filter(option => option.available)
  const unavailableSelection = value !== 'auto' && !available.some(option => option.id === value)
  useEffect(() => {
    if (!expanded) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [expanded])
  return (
    <div className="relative min-w-0 rounded-xl border border-aletis-borda bg-card dark:border-white/10 dark:bg-white/5">
      <button type="button" onClick={() => setExpanded(open => !open)} aria-expanded={expanded} aria-label="Escolher modelo da ALIX" className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-xs"><Sparkles size={15} className="shrink-0 text-aletis-gold-escuro" /><span className="min-w-0 flex-1 truncate font-semibold text-foreground dark:text-white">{value === 'auto' ? 'Automático' : selected?.label || 'Modelo escolhido'}</span>{loading ? <Loader2 size={13} className="shrink-0 animate-spin text-muted-foreground" /> : <ChevronDown size={13} className={`shrink-0 text-muted-foreground ${expanded ? 'rotate-180' : ''}`} />}</button>
      {expanded && <div className="fixed inset-x-3 bottom-24 z-[80] max-h-[55dvh] overflow-y-auto rounded-xl border border-aletis-borda bg-card p-4 shadow-elevation-4 dark:border-white/15 dark:bg-aletis-verde sm:absolute sm:inset-x-auto sm:bottom-full sm:left-0 sm:mb-2 sm:w-80"><p className="text-xs leading-relaxed text-[var(--text-soft)] dark:text-stone-300">No automático, a ALIX escolhe a IA conforme o pedido. O modelo efetivamente usado aparece na resposta.</p><label className="mt-3 block"><span className="mb-1 block text-[11px] font-semibold text-[var(--text-soft)]">Escolha avançada</span><select value={value} disabled={disabled || loading} onChange={event => { onChange(event.target.value); setExpanded(false) }} aria-label="Modelo de inteligência artificial" className="min-h-10 w-full min-w-0 rounded-lg border border-aletis-borda bg-card px-2 text-xs text-foreground disabled:opacity-60 dark:bg-aletis-verde dark:text-white"><option value="auto">Automático · recomendado</option>{unavailableSelection && <option value={value} disabled>{selected?.label || value} · indisponível</option>}{available.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>{loading ? <p role="status" className="mt-2 text-[11px] text-[var(--text-soft)]">Consultando modelos disponíveis…</p> : error ? <div className="mt-2 text-[11px] leading-relaxed text-amber-800"><p>{error}</p><button type="button" onClick={onRefresh} disabled={disabled} className="mt-1 inline-flex min-h-8 items-center gap-1 font-semibold"><RefreshCw size={12} /> Consultar novamente</button></div> : <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--text-soft)]"><Cpu size={12} />{available.length > 0 ? `${available.length} modelos disponíveis no catálogo consultado.` : 'Nenhum modelo disponível informado pelo servidor.'}</p>}{selected?.detail && value !== 'auto' && <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-soft)]">{selected.detail}</p>}<button type="button" onClick={() => setExpanded(false)} className="mt-3 min-h-9 text-xs font-semibold text-foreground dark:text-white">Fechar opções de IA</button></div>}
    </div>
  )
}
