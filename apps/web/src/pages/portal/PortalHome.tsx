import { PortalMatterOverview } from './PortalMatterOverview'
import { useMemo, useState } from 'react'
import { ArrowRight, Bell, Bot, CalendarDays, CheckCircle2, Clock, FileText, HelpCircle, MessageCircle, ShieldCheck, X } from 'lucide-react'
import type { ClienteMe, MensagemDTO, PendenciaDTO, PulseDTO, TimelineEventoDTO, UploadDTO } from './types'
import { formatDateTime } from './utils'
import { latestSharedUpdate, portalNextActions, portalWaitingState, type PortalDestination } from './PortalExperienceModel'

const actionButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aletis-gold focus-visible:ring-offset-2'

export function PortalHome({ token, cliente, requests, uploads, messages, timeline, pulse, documentsReady, seenTimelineAt, onNavigate, onAskAlix }: { token: string; cliente: ClienteMe; requests: PendenciaDTO[]; uploads: UploadDTO[]; messages: MensagemDTO[]; timeline: TimelineEventoDTO[]; pulse: PulseDTO | null; documentsReady: boolean; seenTimelineAt: string | null; onNavigate: (destination: PortalDestination) => void; onAskAlix: (prompt: string) => void }) {
  const actions = useMemo(() => portalNextActions(requests, messages, timeline, seenTimelineAt), [requests, messages, timeline, seenTimelineAt])
  const waiting = portalWaitingState(requests, documentsReady)
  const latest = latestSharedUpdate(timeline)
  const review = requests.filter(request => request.status === 'enviado').length
  const approved = requests.filter(request => request.status === 'aprovado').length
  const activeRequests = requests.filter(request => request.status !== 'cancelado').length
  const step = pulse?.estagioAtual.label || 'Em acompanhamento'
  return <div className="space-y-5">
    <section aria-labelledby="portal-home-title" className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
      <div className="min-w-0 rounded-3xl border border-aletis-cream-escuro bg-card p-5 shadow-brand-sm sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-widest text-aletis-gold-escuro">Seu atendimento</p>
        <h1 id="portal-home-title" className="mt-2 font-display text-2xl font-bold leading-tight text-foreground sm:text-3xl">Olá, {cliente.nome.split(' ')[0]}. {waiting.title}.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{waiting.description}</p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-aletis-cream px-3 py-2 text-foreground"><CalendarDays size={14} />Etapa: {step}</span>
          {review > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-aletis-sage/20 px-3 py-2 text-foreground"><Clock size={14} />{review} em conferência</span>}
        </div>
      </div>
      <aside className="hidden min-w-0 rounded-3xl bg-aletis-verde p-5 text-white sm:p-6 lg:block" aria-label="Ajuda da ALIX">
        <div className="flex items-center gap-2 text-aletis-gold"><Bot size={22} /><h2 className="font-display text-base font-bold text-white">ALIX, sua assistente</h2></div>
        <p className="mt-3 text-sm leading-relaxed text-white/85">Entenda uma solicitação, tire dúvidas sobre seus arquivos e descubra o próximo passo do atendimento.</p>
        <button type="button" onClick={() => onAskAlix('O que preciso fazer agora? Explique as próximas ações e o que a equipe está conferindo.')} className={`${actionButton} mt-4 w-full bg-aletis-gold text-foreground hover:bg-aletis-gold-claro`}>Me ajude com o próximo passo <ArrowRight size={16} /></button>
        <p className="mt-3 text-xs leading-relaxed text-white/70">As orientações se baseiam nas informações disponíveis no seu portal.</p>
      </aside>
    </section>

    <section aria-labelledby="portal-next-title" className="overflow-hidden rounded-3xl border border-aletis-cream-escuro bg-card shadow-brand-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-aletis-cream-escuro px-5 py-4 sm:px-6"><div><h2 id="portal-next-title" className="font-display text-lg font-bold text-foreground">O que precisa da sua atenção</h2><p className="mt-1 text-sm text-muted-foreground">As ações mais importantes aparecem primeiro.</p></div>{actions.length > 0 && <span className="rounded-full bg-aletis-cream px-3 py-1.5 text-xs font-semibold text-foreground">{actions.length} {actions.length === 1 ? 'ação' : 'ações'}</span>}</div>
      {!documentsReady ? <p role="status" className="p-6 text-sm text-muted-foreground">Carregando seus pedidos…</p> : actions.length === 0 ? <div className="flex items-start gap-3 p-5 sm:p-6"><CheckCircle2 className="mt-0.5 shrink-0 text-muted-foreground" size={23} /><div><p className="font-semibold text-foreground">Você está em dia com as ações do portal</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{review ? 'Seus arquivos estão com a equipe. Novos pedidos e respostas aparecerão aqui.' : 'Consulte os andamentos ou fale com a equipe quando precisar.'}</p></div></div> : <ol className="divide-y divide-aletis-cream-escuro">{actions.slice(0, 5).map((action, index) => {
        const Icon = action.kind === 'documento' ? FileText : action.kind === 'mensagem' ? MessageCircle : Bell
        return <li key={action.id} className={`flex min-w-0 flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6 ${action.urgent && index === 0 ? 'bg-amber-50/70' : ''}`}>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${action.urgent ? 'bg-amber-100 text-amber-900' : 'bg-aletis-cream text-foreground'}`}><Icon size={19} /></div>
          <div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap gap-2 text-xs font-semibold"><span className={action.urgent ? 'text-amber-900' : 'text-muted-foreground'}>{action.kind === 'documento' ? action.urgent ? 'Atenção ao envio' : 'Documento solicitado' : action.kind === 'mensagem' ? 'Resposta da equipe' : 'Novo andamento'}</span>{action.deadline && <span className={action.urgent ? 'text-amber-900' : 'text-muted-foreground'}>· {action.deadline}</span>}</div><h3 className="break-words font-semibold text-foreground">{action.title}</h3><p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{action.detail}</p></div>
          <button type="button" onClick={() => onNavigate(action.destination)} className={`${actionButton} shrink-0 ${index === 0 ? 'bg-aletis-verde text-white hover:bg-aletis-verde-medio' : 'border border-aletis-cream-escuro text-foreground hover:bg-aletis-cream'}`}>{action.label}<ArrowRight size={15} /></button>
        </li>
      })}</ol>}
      {actions.length > 5 && <button type="button" onClick={() => onNavigate({ view: 'documentos' })} className={`${actionButton} m-4 border border-aletis-cream-escuro text-foreground`}>Ver todos os pedidos <ArrowRight size={15} /></button>}
    </section>

    <PortalMatterOverview key={token} token={token} onNavigate={onNavigate} />
    <div className="grid min-w-0 gap-5 lg:grid-cols-2">
      <section className="rounded-3xl border border-aletis-cream-escuro bg-card p-5 sm:p-6"><div className="flex items-center gap-2"><CalendarDays size={19} className="text-aletis-gold-escuro" /><h2 className="font-display text-lg font-bold text-foreground">Última atualização da equipe</h2></div>{latest ? <><p className="mt-4 text-xs text-muted-foreground">{formatDateTime(latest.data)}</p><h3 className="mt-1 break-words font-semibold text-foreground">{latest.descricao}</h3>{latest.detalhes && <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{latest.detalhes}</p>}</> : <p className="mt-4 text-sm leading-relaxed text-muted-foreground">A equipe ainda não publicou um andamento aqui. Solicitações e arquivos enviados já podem ser acompanhados nos documentos.</p>}<button type="button" onClick={() => onNavigate({ view: 'historico' })} className={`${actionButton} mt-4 border border-aletis-cream-escuro text-foreground`}>Ver todos os andamentos <ArrowRight size={15} /></button></section>
      <section className="rounded-3xl border border-aletis-cream-escuro bg-card p-5 sm:p-6"><div className="flex items-center gap-2"><ShieldCheck size={19} className="text-aletis-gold-escuro" /><h2 className="font-display text-lg font-bold text-foreground">Seus documentos, acompanhados</h2></div><dl className="mt-5 grid grid-cols-3 gap-3"><div><dt className="text-xs text-muted-foreground">Arquivos recebidos</dt><dd className="mt-1 text-2xl font-bold text-foreground">{uploads.length}</dd></div><div><dt className="text-xs text-muted-foreground">Pedidos em conferência</dt><dd className="mt-1 text-2xl font-bold text-foreground">{review}</dd></div><div><dt className="text-xs text-muted-foreground">Pedidos conferidos</dt><dd className="mt-1 text-2xl font-bold text-foreground">{approved}<span className="text-sm font-normal">/{activeRequests}</span></dd></div></dl><p className="mt-4 text-xs leading-relaxed text-muted-foreground">Receber o arquivo, fazer a leitura e conferir o pedido são etapas diferentes. Os comprovantes e estados ficam nos documentos.</p><button type="button" onClick={() => onNavigate({ view: 'documentos' })} className={`${actionButton} mt-4 border border-aletis-cream-escuro text-foreground`}>Acompanhar arquivos <ArrowRight size={15} /></button></section>
    </div>
    <PortalGuide key={cliente.id} clienteId={cliente.id} onNavigate={onNavigate} />
  </div>
}

export function PortalGuide({ clienteId, onNavigate }: { clienteId: string; onNavigate: (destination: PortalDestination) => void }) {
  const key = `aletis.portal.guia.v1:${clienteId}`
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(key) === 'dismissed' } catch { return false } })
  if (dismissed) return null
  const steps = [{ icon: FileText, title: '1. Confira os pedidos', detail: 'Cada pedido explica o arquivo e o prazo para enviar.', view: 'documentos' }, { icon: MessageCircle, title: '2. Converse com a equipe', detail: 'Tire dúvidas e acompanhe as respostas do consultor.', view: 'mensagens' }, { icon: HelpCircle, title: '3. Mantenha seus dados em dia', detail: 'Peça atualizações e acompanhe suas solicitações.', view: 'ajuda' }] as const
  return <section aria-labelledby="portal-guide-title" className="rounded-3xl border border-aletis-sage/40 bg-aletis-sage/10 p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><h2 id="portal-guide-title" className="font-display text-lg font-bold text-foreground">Seu portal em três passos</h2><p className="mt-1 text-sm text-muted-foreground">Um guia rápido para facilitar seu atendimento.</p></div><button type="button" onClick={() => { setDismissed(true); try { localStorage.setItem(key, 'dismissed') } catch { /* A preferência continua válida nesta visita. */ } }} aria-label="Dispensar guia do portal" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-foreground hover:bg-white focus-visible:ring-2 focus-visible:ring-aletis-gold"><X size={18} /></button></div><ol className="mt-4 grid min-w-0 gap-3 md:grid-cols-3">{steps.map(({ icon: Icon, title, detail, view }) => <li key={view}><button type="button" onClick={() => onNavigate({ view })} className="h-full w-full rounded-2xl border border-aletis-cream-escuro bg-card p-4 text-left focus-visible:ring-2 focus-visible:ring-aletis-gold"><Icon size={20} className="text-aletis-gold-escuro" /><p className="mt-3 text-sm font-semibold text-foreground">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p></button></li>)}</ol></section>
}
