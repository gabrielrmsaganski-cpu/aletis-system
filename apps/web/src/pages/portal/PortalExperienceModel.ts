import type { MensagemDTO, PendenciaDTO, TimelineEventoDTO } from './types'
import { needsClientAction, portalDateOnly, requestIsOverdue, sortPortalRequests, localDateOnly } from './DocumentWorkflow'

export const PORTAL_VIEWS = ['painel', 'documentos', 'mensagens', 'alix', 'historico', 'financeiro', 'ajuda', 'assuntos', 'fiscal'] as const
export type PortalView = typeof PORTAL_VIEWS[number]
export interface PortalDestination { view: PortalView; requestId?: string; matterId?: string; draft?: string }
export const PORTAL_VIEW_LABEL: Record<PortalView, string> = { assuntos: 'Meus assuntos', fiscal: 'SEFAZ', painel: 'Início', documentos: 'Documentos', mensagens: 'Consultor', alix: 'ALIX', historico: 'Andamentos', financeiro: 'Financeiro', ajuda: 'Meus dados e ajuda' }

export function readPortalDestination(params: URLSearchParams): PortalDestination {
  const candidate = params.get('tab')
  const view: PortalView = PORTAL_VIEWS.includes(candidate as PortalView) ? candidate as PortalView : candidate === 'consultor' ? 'mensagens' : 'painel'
  const requestId = params.get('pedido')
  const matterId = params.get('assunto')
  return { view, ...(view === 'assuntos' && matterId && /^[\w-]{1,100}$/.test(matterId) ? { matterId } : {}), ...(view === 'documentos' && requestId && /^[\w-]{1,200}$/.test(requestId) ? { requestId } : {}) }
}

export function portalDestinationParams(current: URLSearchParams, destination: PortalDestination): URLSearchParams {
  const next = new URLSearchParams(current)
  next.set('tab', destination.view)
  next.delete('pedido')
  next.delete('assunto')
  if (destination.view === 'assuntos' && destination.matterId && /^[\w-]{1,100}$/.test(destination.matterId)) next.set('assunto', destination.matterId)
  if (destination.view === 'documentos' && destination.requestId && /^[\w-]{1,200}$/.test(destination.requestId)) next.set('pedido', destination.requestId)
  return next
}

export interface PortalNextAction {
  id: string
  kind: 'documento' | 'mensagem' | 'andamento'
  title: string
  detail: string
  label: string
  priority: number
  urgent: boolean
  destination: PortalDestination
  deadline?: string
}

export function portalNextActions(requests: PendenciaDTO[], messages: MensagemDTO[], timeline: TimelineEventoDTO[], seenTimelineAt?: string | null, now = new Date()): PortalNextAction[] {
  const actions: PortalNextAction[] = sortPortalRequests(requests).filter(needsClientAction).map(request => {
    const overdue = requestIsOverdue(request, localDateOnly(now))
    return {
      id: request.id, kind: 'documento', title: request.titulo,
      detail: request.status === 'rejeitado' ? request.observacao || 'A equipe pediu um novo envio. Confira a orientação antes de enviar.' : request.descricao || 'Confira o pedido e envie o documento solicitado.',
      label: request.status === 'rejeitado' ? 'Corrigir documento' : 'Ver pedido e enviar',
      priority: request.status === 'rejeitado' ? 0 : overdue ? 1 : request.prioridade === 'urgente' ? 2 : request.prioridade === 'alta' ? 4 : 5,
      urgent: request.status === 'rejeitado' || overdue || request.prioridade === 'urgente',
      destination: { view: 'documentos', requestId: request.id },
      ...(request.prazo ? { deadline: `${overdue ? 'Prazo passou em' : 'Enviar até'} ${portalDateOnly(request.prazo)}` } : {}),
    }
  })
  const unread = messages.filter(message => message.de === 'consultor' && !message.lidaEm)
  if (unread.length) actions.push({ id: 'mensagens', kind: 'mensagem', title: unread.length === 1 ? 'Você tem uma resposta da equipe' : `${unread.length} mensagens da equipe para ler`, detail: 'Abra a conversa para acompanhar a orientação do seu consultor.', label: 'Ler mensagens', priority: 3, urgent: false, destination: { view: 'mensagens' } })
  const latest = latestSharedUpdate(timeline)
  if (latest && (!seenTimelineAt || latest.data > seenTimelineAt)) actions.push({ id: 'andamento', kind: 'andamento', title: 'Há uma atualização no seu atendimento', detail: latest.descricao, label: 'Ver andamento', priority: 6, urgent: false, destination: { view: 'historico' } })
  return actions.sort((a, b) => a.priority - b.priority)
}

export function latestSharedUpdate(timeline: TimelineEventoDTO[]): TimelineEventoDTO | undefined {
  return timeline.filter(event => event.tipo === 'andamento').sort((a, b) => b.data.localeCompare(a.data))[0]
}

export function portalWaitingState(requests: PendenciaDTO[], ready = true): { title: string; description: string; awaiting: 'cliente' | 'equipe' | 'atualizacao' } {
  if (!ready) return { title: 'Atualizando suas próximas ações', description: 'Aguarde enquanto conferimos os pedidos deste atendimento.', awaiting: 'atualizacao' }
  const pending = requests.filter(needsClientAction).length
  const review = requests.filter(request => request.status === 'enviado').length
  if (pending) return { title: 'O próximo passo é seu', description: `${pending} ${pending === 1 ? 'pedido precisa' : 'pedidos precisam'} do seu envio ou correção.${review ? ` A equipe também está conferindo ${review} ${review === 1 ? 'pedido recebido' : 'pedidos recebidos'}.` : ''}`, awaiting: 'cliente' }
  if (review) return { title: 'Agora é com a equipe', description: `${review} ${review === 1 ? 'pedido recebido está' : 'pedidos recebidos estão'} em conferência. Você será orientado aqui se precisarmos de algum ajuste.`, awaiting: 'equipe' }
  return { title: 'Nenhum documento para enviar agora', description: 'Acompanhe as próximas atualizações. Se precisar de ajuda, sua equipe está na aba Consultor.', awaiting: 'atualizacao' }
}
