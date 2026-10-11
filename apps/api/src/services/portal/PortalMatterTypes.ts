import { z } from 'zod'

export const portalMatterStatuses = ['nao_iniciado', 'em_andamento', 'aguardando_cliente', 'aguardando_terceiro', 'concluido', 'cancelado'] as const
export const portalMilestoneStatuses = ['pendente', 'em_andamento', 'concluido', 'cancelado'] as const
export const portalMatterIdSchema = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/)
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe uma data no formato ano-mês-dia.').refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Informe uma data existente no calendário.')
const optionalText = (max: number) => z.string().trim().max(max).transform(value => value || undefined).optional()

export const portalMilestoneSchema = z.object({
  id: portalMatterIdSchema,
  titulo: z.string().trim().min(3).max(160),
  status: z.enum(portalMilestoneStatuses),
  prazo: daySchema.optional(),
  concluidoEm: z.string().datetime({ offset: true }).optional(),
  descricao: optionalText(1000),
}).strict()

const planSchema = z.object({
  demandaId: portalMatterIdSchema.optional(),
  titulo: z.string().trim().min(3).max(160),
  resumo: z.string().trim().min(3).max(3000),
  status: z.enum(portalMatterStatuses),
  responsavel: optionalText(160),
  proximoPasso: optionalText(1000),
  dependeDe: z.enum(['equipe', 'cliente', 'terceiro', 'nenhum']),
  prazo: daySchema.optional(),
  visibilidade: z.enum(['rascunho', 'publicado']),
  marcos: z.array(portalMilestoneSchema).max(100).default([]),
}).strict()

function refinePlan(value: z.infer<typeof planSchema>, ctx: z.RefinementCtx) {
  if (new Set(value.marcos.map(item => item.id)).size !== value.marcos.length) ctx.addIssue({ code: 'custom', path: ['marcos'], message: 'Cada etapa precisa de uma identificação diferente.' })
  const ended = ['concluido', 'cancelado'].includes(value.status)
  if (value.visibilidade === 'publicado' && !ended && (value.proximoPasso?.length || 0) < 3) ctx.addIssue({ code: 'custom', path: ['proximoPasso'], message: 'Informe o próximo passo antes de publicar um assunto em aberto.' })
  if (value.status === 'aguardando_cliente' && value.dependeDe !== 'cliente') ctx.addIssue({ code: 'custom', path: ['dependeDe'], message: 'Este assunto aguarda uma ação do cliente.' })
  if (value.status === 'aguardando_terceiro' && value.dependeDe !== 'terceiro') ctx.addIssue({ code: 'custom', path: ['dependeDe'], message: 'Este assunto aguarda uma ação de terceiro.' })
  if (ended && value.dependeDe !== 'nenhum') ctx.addIssue({ code: 'custom', path: ['dependeDe'], message: 'Um assunto encerrado não pode ter uma ação aguardada.' })
  if (value.status === 'concluido' && value.marcos.some(item => !['concluido', 'cancelado'].includes(item.status))) ctx.addIssue({ code: 'custom', path: ['marcos'], message: 'Conclua ou cancele as etapas abertas antes de concluir o assunto.' })
  for (const [index, item] of value.marcos.entries()) {
    if (item.status === 'concluido' && !item.concluidoEm) ctx.addIssue({ code: 'custom', path: ['marcos', index, 'concluidoEm'], message: 'Informe quando a etapa foi realmente concluída.' })
    if (item.status !== 'concluido' && item.concluidoEm) ctx.addIssue({ code: 'custom', path: ['marcos', index, 'concluidoEm'], message: 'Somente uma etapa concluída pode ter uma data de conclusão.' })
  }
}

export const portalMatterCreateSchema = planSchema.superRefine(refinePlan)
export const portalMatterUpdateSchema = planSchema.extend({ expectedUpdatedAt: z.string().datetime({ offset: true }) }).superRefine(refinePlan)
export type PortalMatterPlan = z.infer<typeof portalMatterCreateSchema>
export type PortalMilestone = z.infer<typeof portalMilestoneSchema>
export interface PortalMatter extends PortalMatterPlan {
  id: string
  clienteId: string
  criadoEm: string
  atualizadoEm: string
  publicadoEm?: string
  progresso: { concluidos: number; total: number; percentual: number | null }
  atrasado: boolean
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
export interface PortalMatterSummary {
  total: number
  naoIniciados: number
  emAndamento: number
  aguardandoCliente: number
  aguardandoTerceiro: number
  concluidos: number
  cancelados: number
  atrasados: number
  marcosConcluidos: number
  marcosAtivos: number
  progressoPercentual: number | null
}
export interface PortalMatterList {
  assuntos: PortalMatter[]
  eventos: PortalMatterEvent[]
  resumo: PortalMatterSummary
  atualizadoEm: string | null
  paginacaoEventos: { proximoCursor: string | null }
}
export interface PortalMatterHistory {
  eventos: PortalMatterEvent[]
  proximoCursor: string | null
}
export interface PortalMatterRevisionPage {
  versoes: { versao: number; data: string; assunto: PortalMatter }[]
  proximoCursor: string | null
}
