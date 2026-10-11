import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import AppDialog from '../ui/AppDialog'

/** Uma região por vez no celular; painel adjacente quando há largura para ler a conversa. */
export default function AlixWorkspacePanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1280px)').matches)
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)')
    const update = () => setWide(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!wide) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current() }
    }
    const panel = panelRef.current
    panel?.addEventListener('keydown', close)
    return () => { panel?.removeEventListener('keydown', close); previous?.focus() }
  }, [wide])

  if (!wide) return <AppDialog title={title} eyebrow="ALIX" size="md" collapsible={false} onClose={onClose} bodyClassName="space-y-3 bg-aletis-bege/30">{children}</AppDialog>

  return (
    <aside ref={panelRef} tabIndex={-1} aria-label={title} className="flex h-full min-h-0 w-[340px] shrink-0 flex-col overflow-hidden rounded-2xl border border-aletis-borda bg-aletis-bege/30 outline-none 2xl:w-[380px]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-aletis-borda bg-card px-4 py-2.5"><h2 className="text-sm font-semibold text-foreground">{title}</h2><button type="button" onClick={onClose} aria-label={`Fechar ${title.toLowerCase()}`} className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-soft)] hover:bg-aletis-bege focus-visible:outline focus-visible:outline-2 focus-visible:outline-aletis-verde"><X size={17} /></button></div>
      <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3">{children}</div>
    </aside>
  )
}
