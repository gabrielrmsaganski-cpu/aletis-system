export type WhatsAppProvider = 'evolution' | 'meta'

export type NormalizedMessageType =
  | 'text'
  | 'audio'
  | 'image'
  | 'document'
  | 'video'
  | 'status'
  | 'event'
  | 'unsupported'

export interface NormalizedEvolutionMessage {
  instanceName: string
  eventType: string
  providerMessageId?: string
  remoteJid?: string
  fromNumber: string
  toNumber?: string
  contactName?: string
  fromMe: boolean
  timestamp: Date
  type: NormalizedMessageType
  text?: string
  mediaId?: string
  mediaUrl?: string
  mediaBase64?: string
  mediaMime?: string
  mediaFilename?: string
  caption?: string
  status?: string
  raw: Record<string, unknown>
}

export interface NormalizedWebhookEvent {
  id: string
  instanceName: string
  eventType: string
  providerMessageId?: string
  messages: NormalizedEvolutionMessage[]
  raw: Record<string, unknown>
}

export interface ConversationSummary {
  id: string
  clienteId?: string | null
  leadId?: string | null
  telefone: string
  waJid?: string | null
  nomeContato?: string | null
  instanceName: string
  atendimentoModo: 'ia' | 'humano' | string
  status: string
  etapa: string
  elegibilidadeStatus: string
  crmStatus?: string | null
  currentState?: string | null
  aiEnabled?: boolean
  assignedUserId?: string | null
  takeoverReason?: string | null
  takeoverAt?: string | null
  releasedAt?: string | null
  eligibilityScore?: number
  prioridade: string
  tags?: string[] | null
  resumo?: string | null
  ultimaMensagemEm?: string | null
  criadoEm?: string | null
  atualizadoEm?: string | null
  totalMensagens?: number
  documentosPendentes?: number
  ultimaMensagem?: string | null
}

export interface ConversationMessage {
  id: string
  conversationId: string
  instanceName: string
  providerMessageId?: string | null
  direction: 'inbound' | 'outbound' | 'system' | string
  type: string
  status: string
  text?: string | null
  transcription?: string | null
  mediaUrl?: string | null
  mediaMime?: string | null
  mediaFilename?: string | null
  mediaStorageKey?: string | null
  fromNumber?: string | null
  toNumber?: string | null
  timestamp: string
  criadoEm?: string | null
}

export interface ConversationDocument {
  id: string
  conversationId: string
  clienteId?: string | null
  messageId?: string | null
  filename: string
  mimeType?: string | null
  storageProvider: string
  storageKey: string
  sha256?: string | null
  categoria: string
  status: string
  resumoIa?: string | null
  criadoEm?: string | null
}
