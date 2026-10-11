import React, { forwardRef, useState, type ReactNode } from 'react'
import { ArrowUp, ChevronDown, Paperclip, Sparkles, Square } from 'lucide-react'

interface Props {
  value: string
  disabled: boolean
  sendDisabled: boolean
  replying: boolean
  archived: boolean
  hasAttachments: boolean
  onChange: (value: string) => void
  onSend: () => void
  onCancel: () => void
  onAttach: () => void
  quickActions: ReactNode
  modelControl: ReactNode
}

const AlixWorkComposer = forwardRef<HTMLTextAreaElement, Props>(function AlixWorkComposer(props, ref) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  return (
    <section aria-label="Pedir um trabalho à ALIX" className="rounded-xl border border-aletis-verde/20 bg-card p-2.5 shadow-sm focus-within:border-aletis-verde/45 focus-within:shadow-elevation-2 dark:border-white/15 dark:bg-[#1b2a20] sm:px-3">
      <label htmlFor="alix-work-request" className="sr-only">Qual resultado precisamos entregar?</label>
      <textarea ref={ref} id="alix-work-request" value={props.value} onChange={event => props.onChange(event.target.value)} onKeyDown={event => { if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return; if (!event.ctrlKey && !event.metaKey && window.matchMedia('(pointer: coarse)').matches) return; event.preventDefault(); if (!props.disabled && !props.sendDisabled) props.onSend() }} rows={1} disabled={props.disabled} placeholder={props.archived ? 'Restaure esta conversa para continuar' : props.hasAttachments ? 'O que precisa extrair, comparar ou produzir com estes arquivos?' : 'Peça uma análise, uma pesquisa ou um documento…'} aria-label="Mensagem para ALIX" className="block min-h-10 max-h-28 w-full resize-none border-0 bg-transparent px-1 py-1 text-base leading-relaxed text-foreground outline-none placeholder:text-aletis-grafite-claro disabled:opacity-60 dark:text-white" />
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5"><button type="button" onClick={props.onAttach} disabled={props.disabled} aria-label="Anexar arquivo" title="Anexar documento, planilha ou imagem" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-[var(--text-soft)] hover:bg-aletis-bege disabled:opacity-50 dark:border-white/15 dark:text-stone-300"><Paperclip size={16} /></button><div className="min-w-0 max-w-[210px] flex-1">{props.modelControl}</div><button type="button" onClick={() => setShortcutsOpen(value => !value)} aria-expanded={shortcutsOpen} aria-controls="alix-quick-actions" aria-label="Pedidos rápidos" title="Preparar um pedido rápido" className="flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-[var(--text-soft)] hover:bg-aletis-bege"><Sparkles size={15} /><span className="hidden md:inline">Atalhos</span><ChevronDown size={12} className={shortcutsOpen ? 'rotate-180' : ''} /></button></div>
        {props.replying ? <button type="button" onClick={props.onCancel} aria-label="Cancelar missão em andamento" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700"><Square size={14} className="fill-current" /><span>Parar</span></button> : <button type="button" onClick={props.onSend} disabled={props.sendDisabled} aria-label="Enviar" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-aletis-verde px-3 text-xs font-semibold text-white hover:bg-aletis-verde-escuro disabled:opacity-40 sm:px-4"><span className="hidden sm:inline">Enviar</span><ArrowUp size={16} /></button>}
      </div>
      {shortcutsOpen && <div id="alix-quick-actions" className="mt-2 border-t border-aletis-borda/65 pt-2 dark:border-white/10">{props.quickActions}</div>}
    </section>
  )
})
export default AlixWorkComposer
