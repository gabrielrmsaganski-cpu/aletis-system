import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Bot, CalendarDays, ChevronRight, FileText, HelpCircle, Home, Landmark, ListChecks, KeyRound, LogOut, Menu, MessageCircle, Wallet, X } from 'lucide-react'
import BrandMark from '../../components/ui/BrandMark'
import type { ClienteMe } from './types'
import { PORTAL_VIEW_LABEL, type PortalView } from './PortalExperienceModel'

const items: { view: PortalView; icon: typeof Home }[] = [{ view: 'painel', icon: Home }, { view: 'documentos', icon: FileText }, { view: 'mensagens', icon: MessageCircle }, { view: 'alix', icon: Bot }, { view: 'assuntos', icon: ListChecks }, { view: 'historico', icon: CalendarDays }, { view: 'fiscal', icon: Landmark }, { view: 'financeiro', icon: Wallet }, { view: 'ajuda', icon: HelpCircle }]
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aletis-gold focus-visible:ring-offset-2'

export function PortalNavigation({ cliente, view, pendingCount, unreadCount, onNavigate, onPassword, onLogout }: { cliente: ClienteMe; view: PortalView; pendingCount: number; unreadCount: number; onNavigate: (view: PortalView) => void; onPassword: () => void; onLogout: () => void }) {
  const [moreOpen, setMoreOpen] = useState(false)
  useEffect(() => setMoreOpen(false), [view])
  const badge = (id: PortalView) => id === 'documentos' ? pendingCount : id === 'mensagens' ? unreadCount : 0
  const badgeContent = (value: number) => value > 0 ? <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-aletis-gold px-1.5 py-0.5 text-[10px] font-bold leading-none text-foreground">{value > 99 ? '99+' : value}</span> : null
  return <>
    <a href="#portal-content" className={`sr-only fixed left-4 top-3 z-[120] rounded-xl bg-aletis-verde px-4 py-3 font-semibold text-white focus:not-sr-only ${focus}`}>Pular para o conteúdo</a>
    <header className="sticky top-0 z-30 border-b border-aletis-cream-escuro bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <button type="button" onClick={() => onNavigate('painel')} aria-label="ALETIS — início do portal" className={`flex shrink-0 items-center gap-3 rounded-lg py-2 ${focus}`}><BrandMark variant="wordmark" tone="verde" size={34} /><span className="hidden border-l border-aletis-cream-escuro pl-3 text-left text-xs text-muted-foreground sm:block">Portal do<br />cliente</span></button>
        <div className="min-w-0 text-right"><p className="truncate text-sm font-semibold text-foreground">{cliente.nome}</p><p className="hidden text-xs text-muted-foreground sm:block">{cliente.consultor ? `Sua equipe: ${cliente.consultor}` : 'Atendimento ALETIS'}</p></div>
        <button type="button" onClick={() => setMoreOpen(true)} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-aletis-cream-escuro text-foreground ${focus}`} aria-label="Opções da conta e ajuda"><Menu size={20} /></button>
      </div>
      <nav aria-label="Navegação principal do portal" className="mx-auto hidden max-w-7xl flex-wrap gap-1 px-4 pb-2 lg:flex">
        {items.map(({ view: id, icon: Icon }) => <button key={id} type="button" onClick={() => onNavigate(id)} aria-current={view === id ? 'page' : undefined} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold ${focus} ${view === id ? 'bg-aletis-verde text-white' : 'text-foreground hover:bg-aletis-cream'}`}><Icon size={17} />{PORTAL_VIEW_LABEL[id]}{badgeContent(badge(id))}</button>)}
      </nav>
    </header>
    <nav aria-label="Navegação móvel do portal" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-aletis-cream-escuro bg-white/95 px-1 pt-1 shadow-[0_-4px_18px_rgba(23,37,27,0.08)] backdrop-blur-xl lg:hidden" style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}>
      {items.slice(0, 4).map(({ view: id, icon: Icon }) => <button key={id} type="button" onClick={() => onNavigate(id)} aria-current={view === id ? 'page' : undefined} className={`relative flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold ${focus} ${view === id ? 'bg-aletis-sage/20 text-foreground' : 'text-muted-foreground'}`}><span className="relative"><Icon size={21} />{badge(id) > 0 && <span className="absolute -right-4 -top-1">{badgeContent(badge(id))}</span>}</span><span>{PORTAL_VIEW_LABEL[id]}</span></button>)}
      <button type="button" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen} className={`flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold ${focus} ${['ajuda', 'historico', 'financeiro', 'assuntos', 'fiscal'].includes(view) ? 'bg-aletis-sage/20 text-foreground' : 'text-muted-foreground'}`}><Menu size={21} /><span>Mais</span></button>
    </nav>
    <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[80] bg-black/45" /><Dialog.Content className="fixed bottom-0 left-1/2 z-[81] max-h-[90dvh] w-full max-w-lg -translate-x-1/2 overflow-auto rounded-t-3xl bg-card p-5 pb-8 shadow-xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
      <div className="flex items-start justify-between gap-3"><div><Dialog.Title className="text-xl font-bold text-foreground">Seu portal</Dialog.Title><Dialog.Description className="mt-1 break-words text-sm text-muted-foreground">{cliente.nome}</Dialog.Description></div><Dialog.Close aria-label="Fechar opções" className={`flex h-11 w-11 items-center justify-center rounded-xl text-foreground hover:bg-aletis-cream ${focus}`}><X size={20} /></Dialog.Close></div>
      <div className="mt-5 space-y-1">{items.slice(4).map(({ view: id, icon: Icon }) => <button key={id} type="button" onClick={() => { onNavigate(id); setMoreOpen(false) }} className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-foreground hover:bg-aletis-cream ${focus}`}><Icon size={20} /><span className="flex-1">{PORTAL_VIEW_LABEL[id]}</span><ChevronRight size={16} /></button>)}</div>
      <div className="mt-4 border-t border-aletis-cream-escuro pt-3"><button type="button" onClick={() => { setMoreOpen(false); onPassword() }} className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-foreground hover:bg-aletis-cream ${focus}`}><KeyRound size={19} />Trocar senha</button><button type="button" onClick={() => { setMoreOpen(false); onLogout() }} className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-red-800 hover:bg-red-50 ${focus}`}><LogOut size={19} />Sair da conta</button></div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </>
}
