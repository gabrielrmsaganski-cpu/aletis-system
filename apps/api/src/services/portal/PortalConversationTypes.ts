import { z } from 'zod'

export const portalConversationInputSchema = z.object({
  texto: z.string().trim().max(2000).default(''),
  uploadIds: z.array(z.string().min(1).max(180)).max(10).default([]),
  pendenciaId: z.string().min(1).max(180).optional(),
}).strict().refine(input => Boolean(input.texto || input.uploadIds.length), 'Escreva uma mensagem ou selecione um arquivo.')
export const portalReadMessagesSchema = z.object({ ids: z.array(z.string().min(1).max(180)).min(1).max(200) }).strict()
export const portalMessageKeySchema = z.string().min(8).max(200).regex(/^[A-Za-z0-9_.:-]+$/)
export interface PortalConversationAttachment { uploadId: string; nome: string; mime: string; tamanho: number; disponivel: boolean }
export interface PortalConversationMessage {
  id: string; de: 'cliente' | 'consultor' | 'sistema'; autorNome: string; texto: string; criadoEm: string; lidaEm?: string
  anexos?: PortalConversationAttachment[]; solicitacao?: { id: string; titulo: string }
}
export interface PortalConversationActor { de: 'cliente' | 'consultor'; actorId: string; autorNome: string }
export class PortalConversationError extends Error {
  constructor(message: string, readonly statusCode = 400, readonly code = 'PORTAL_CONVERSATION_INVALID') { super(message) }
}
