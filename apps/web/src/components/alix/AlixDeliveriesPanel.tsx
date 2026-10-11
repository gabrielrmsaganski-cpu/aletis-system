import React from 'react'
import { ArrowUpRight, Download, FileText, FolderOpen } from 'lucide-react'
import type { AlixDelivery } from './alixWorkspacePresentation'

export default function AlixDeliveriesPanel({ deliveries, onOpenNotebooks, onPrepare }: { deliveries: AlixDelivery[]; onOpenNotebooks: () => void; onPrepare: () => void }) {
  return (
    <section aria-label="Entregas da conversa" className="rounded-xl border border-aletis-borda bg-card p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-foreground dark:text-white">Entregas</h2><span className="rounded-full bg-aletis-bege px-2 py-0.5 text-xs font-semibold text-foreground">{deliveries.length}</span></div>
      {deliveries.length > 0 ? <ul className="mt-3 space-y-2">{deliveries.map(delivery => <li key={delivery.id}><a href={delivery.downloadUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center gap-2.5 rounded-lg border border-aletis-borda p-3 hover:border-aletis-verde/30 hover:bg-aletis-bege/40 dark:border-white/10"><FileText size={18} className="shrink-0 text-foreground" /><span className="min-w-0 flex-1"><span className="block break-words text-xs font-semibold text-foreground dark:text-white">{delivery.filename}</span><span className="mt-1 block text-[11px] text-[var(--text-soft)]">Arquivo gerado{typeof delivery.sizeBytes === 'number' ? ` · ${delivery.sizeBytes < 1024 * 1024 ? `${Math.max(1, Math.round(delivery.sizeBytes / 1024))} KB` : `${(delivery.sizeBytes / (1024 * 1024)).toFixed(1)} MB`}` : ''}</span></span><Download size={15} className="shrink-0 text-foreground" /></a></li>)}</ul> : <div className="mt-3 rounded-lg border border-dashed border-aletis-borda p-4"><FolderOpen size={22} className="mb-2 text-muted-foreground" /><p className="text-xs leading-relaxed text-[var(--text-soft)]">Os arquivos gerados nesta conversa aparecem aqui, com acesso ao documento real.</p><button type="button" onClick={onPrepare} className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-foreground">Preparar uma entrega <ArrowUpRight size={14} /></button></div>}
      <button type="button" onClick={onOpenNotebooks} className="mt-3 flex min-h-10 w-full items-center justify-between rounded-lg bg-aletis-bege/60 px-3 text-xs font-semibold text-foreground hover:bg-aletis-bege"><span>Dossiês, versões e fontes</span><ArrowUpRight size={15} /></button>
    </section>
  )
}
