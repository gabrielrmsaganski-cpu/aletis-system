export type PortalMatterStatus = 'nao_iniciado' | 'em_andamento' | 'aguardando_cliente' | 'aguardando_terceiro' | 'concluido' | 'cancelado'
export type PortalMilestoneStatus = 'pendente' | 'em_andamento' | 'concluido' | 'cancelado'
export interface PortalMilestone {
  id: string
  titulo: string
  status: PortalMilestoneStatus
  prazo?: string
  concluidoEm?: string
  descricao?: string
}
export interface PortalMatter {
  id: string
  clienteId: string
  demandaId?: string
  titulo: string
  resumo: string
  status: PortalMatterStatus
  responsavel?: string
  proximoPasso?: string
  dependeDe: 'equipe' | 'cliente' | 'terceiro' | 'nenhum'
  prazo?: string
  visibilidade: 'rascunho' | 'publicado'
  marcos: PortalMilestone[]
  criadoEm: string
  atualizadoEm: string
  publicadoEm?: string
  progresso?: { concluidos: number; total: number; percentual: number | null }
  atrasado?: boolean
}
export interface PortalMatterEvent {
  id: string
  assuntoId: string
  titulo: string
  descricao: string
  data: string
  tipo: 'publicacao' | 'atualizacao' | 'marco_concluido' | 'conclusao'
  versao: number
  marcoId?: string
}
export interface PortalMattersData {
  assuntos: PortalMatter[]
  eventos: PortalMatterEvent[]
  resumo: unknown
  atualizadoEm: string | null
  paginacaoEventos?: { proximoCursor: string | null }
}
export const MATTER_STATUS_LABEL: Record<PortalMatterStatus, string> = {
  nao_iniciado: 'A iniciar', em_andamento: 'Em andamento', aguardando_cliente: 'Precisa de você',
  aguardando_terceiro: 'Aguardando terceiro', concluido: 'Concluído', cancelado: 'Cancelado',
}
export const MILESTONE_STATUS_LABEL: Record<PortalMilestoneStatus, string> = {
  pendente: 'A fazer', em_andamento: 'Em andamento', concluido: 'Concluída', cancelado: 'Cancelada',
}
export const MATTER_DEPENDENCY_LABEL: Record<PortalMatter['dependeDe'], string> = {
  equipe: 'Com a equipe', cliente: 'Com você', terceiro: 'Com terceiro', nenhum: 'Sem ação pendente',
}
export const MATTER_STATUS_COLOR: Record<PortalMatterStatus, string> = {
  nao_iniciado: '#6B7280', em_andamento: '#2B6650', aguardando_cliente: '#9F620B',
  aguardando_terceiro: '#6D648B', concluido: '#183D2D', cancelado: '#9CA3AF',
}
export type PortalMatterFilter = 'todos' | 'ativos' | 'cliente' | 'concluidos'
const active = (item: PortalMatter) => item.status !== 'concluido' && item.status !== 'cancelado'
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')

/** O percentual se refere apenas às etapas do plano; não estima resultado ou prazo. */
export function matterProgress(matter: Pick<PortalMatter, 'marcos'>) {
  const included = matter.marcos.filter(item => item.status !== 'cancelado')
  const concluidos = included.filter(item => item.status === 'concluido').length
  const emAndamento = included.filter(item => item.status === 'em_andamento').length
  return { total: included.length, concluidos, emAndamento, pendentes: included.length - concluidos - emAndamento, cancelados: matter.marcos.length - included.length, percentual: included.length ? Math.round(concluidos / included.length * 100) : null }
}

export function summarizeMatters(items: PortalMatter[]) {
  const published = items.filter(item => item.visibilidade === 'publicado')
  return {
    total: published.length,
    ativos: published.filter(active).length,
    cliente: published.filter(item => active(item) && item.dependeDe === 'cliente').length,
    concluidos: published.filter(item => item.status === 'concluido').length,
    marcosConcluidos: published.filter(item => item.status !== 'cancelado').reduce((total, item) => total + matterProgress(item).concluidos, 0),
  }
}

export function filterMatters(items: PortalMatter[], filter: PortalMatterFilter, search: string) {
  const needle = normalized(search.trim())
  const rank = (item: PortalMatter) => !active(item) ? 3 : item.dependeDe === 'cliente' ? 0 : item.atrasado ? 1 : 2
  return items.filter(item => item.visibilidade === 'publicado'
    && (filter === 'todos' || filter === 'ativos' && active(item) || filter === 'cliente' && active(item) && item.dependeDe === 'cliente' || filter === 'concluidos' && item.status === 'concluido')
    && (!needle || normalized(`${item.titulo} ${item.resumo} ${item.responsavel || ''} ${item.proximoPasso || ''}`).includes(needle)))
    .sort((a, b) => rank(a) - rank(b) || b.atualizadoEm.localeCompare(a.atualizadoEm) || a.id.localeCompare(b.id))
}

export function matterChartData(items: PortalMatter[]) {
  const published = items.filter(item => item.visibilidade === 'publicado')
  return {
    situacoes: (Object.keys(MATTER_STATUS_LABEL) as PortalMatterStatus[]).map(status => ({ status, nome: MATTER_STATUS_LABEL[status], quantidade: published.filter(item => item.status === status).length, cor: MATTER_STATUS_COLOR[status] })),
    etapas: published.filter(item => item.status !== 'cancelado').map(item => ({ id: item.id, nome: item.titulo, ...matterProgress(item) })),
  }
}

export function mergeMatterEvents(current: PortalMatterEvent[], incoming: PortalMatterEvent[]) {
  return [...new Map([...current, ...incoming].map(item => [item.id, item])).values()]
    .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id))
}

export function matterDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Sem data definida'
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}
