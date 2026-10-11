import { createHash } from 'node:crypto'
import { getConversationStateService } from './ConversationStateService.js'
import { getEvolutionClient } from './evolution/EvolutionClient.js'
import type { ConversationStateService } from './ConversationStateService.js'
import type { EvolutionClient } from './evolution/EvolutionClient.js'

export interface OutboxSendInput {
  conversationId?: string | null
  instanceName: string
  toNumber: string
  type?: 'text' | 'audio' | 'image' | 'document'
  text?: string
  mediaBase64?: string
  mediaMime?: string
  fileName?: string
  caption?: string
  idempotencyKey?: string
}

interface SendResult { outboxId: string; providerMessageId?: string; status: string; raw?: unknown }

export function classifySendFailure(error: unknown): 'before_send' | 'rejected' | 'uncertain' {
  const err = error as { code?: string; cause?: { code?: string }; status?: number }
  const code = err?.cause?.code || err?.code
  if (code && ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) return 'before_send'
  if (err?.status && err.status >= 400 && err.status < 500 && ![408, 409].includes(err.status)) return 'rejected'
  // Timeout, conexão interrompida e HTTP 5xx podem ocorrer após aceitação do envio.
  return 'uncertain'
}

export class WhatsAppOutboxService {
  private readonly inFlight = new Map<string, { fingerprint: string; result: Promise<SendResult> }>()

  constructor(
    private readonly state: ConversationStateService = getConversationStateService(),
    private readonly evolution: EvolutionClient = getEvolutionClient(),
    private readonly pause: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}

  async send(input: OutboxSendInput): Promise<SendResult> {
    const fingerprint = createHash('sha256').update(JSON.stringify({
      type: input.type || 'text', text: input.text || '', media: input.mediaBase64 || '',
      mediaMime: input.mediaMime || '', fileName: input.fileName || '', caption: input.caption || '',
    })).digest('hex')
    const id = input.idempotencyKey
      ? `wa_out_${createHash('sha256').update(`${input.instanceName}:${input.toNumber}:${input.idempotencyKey}`).digest('hex')}` : undefined
    const existing = id ? this.inFlight.get(id) : undefined
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error('A chave de envio já pertence a outro conteúdo')
      return existing.result
    }
    const sending = this.sendPersisted(input, id, fingerprint)
    if (id) this.inFlight.set(id, { fingerprint, result: sending })
    try { return await sending } finally { if (id) this.inFlight.delete(id) }
  }

  private async sendPersisted(input: OutboxSendInput, id: string | undefined, fingerprint: string): Promise<SendResult> {
    const type = input.type || 'text'
    const outboxId = await this.state.createOutbox({
      id, conversationId: input.conversationId ?? null, instanceName: input.instanceName,
      toNumber: input.toNumber, messageType: type, content: input.text,
      payload: { caption: input.caption, fileName: input.fileName, mediaMime: input.mediaMime, idempotencyKey: input.idempotencyKey, fingerprint },
    })
    let persisted = await this.state.getOutbox(outboxId)
    if (!persisted) throw new Error('Saída não foi persistida')
    if ((persisted.content || '') !== (input.text || '') || (persisted.message_type || persisted.messageType) !== type) {
      throw new Error('A chave de envio já pertence a outro conteúdo')
    }
    if ((persisted.payload?.fingerprint && persisted.payload.fingerprint !== fingerprint)
      || (type !== 'text' && !persisted.payload?.fingerprint)) {
      throw new Error('A chave de envio já pertence a outro conteúdo ou a uma mídia anterior sem identificação verificável')
    }
    const previousId = persisted.provider_message_id || persisted.providerMessageId
    if (['sent', 'dry_run', 'uncertain', 'cancelled'].includes(persisted.status)) {
      return { outboxId, providerMessageId: previousId, status: persisted.status }
    }
    if (persisted.status === 'sending') {
      await this.state.updateOutbox(outboxId, { status: 'uncertain', error: 'Envio interrompido sem resultado confirmado; não reenviar automaticamente.' })
      return { outboxId, status: 'uncertain' }
    }
    if (persisted.status === 'failed' && (!persisted.payload?.retryable || Number(persisted.attempt) >= 3)) return { outboxId, status: 'failed' }
    if (!this.evolution.isConfigured()) {
      await this.state.updateOutbox(outboxId, { status: 'dry_run', payload: { reason: 'Evolution API não configurada' } })
      return { outboxId, status: 'dry_run' }
    }

    while (Number(persisted.attempt || 0) < 3) {
      const retryAt = Date.parse(persisted.payload?.nextAttemptAt || '')
      if (Number.isFinite(retryAt) && retryAt > Date.now()) await this.pause(Math.min(2000, retryAt - Date.now()))
      if (!await this.state.claimOutboxForSend(outboxId)) {
        const current = await this.state.getOutbox(outboxId)
        return { outboxId, providerMessageId: current?.provider_message_id || current?.providerMessageId, status: current?.status === 'sent' ? 'sent' : 'uncertain' }
      }
      let raw: any
      try {
        if (type === 'audio') {
          if (!input.mediaBase64) throw Object.assign(new Error('Áudio sem conteúdo'), { status: 400 })
          raw = await this.evolution.sendWhatsAppAudio(input.toNumber, input.mediaBase64, input.instanceName)
        } else if (type === 'image' || type === 'document') {
          if (!input.mediaBase64) throw Object.assign(new Error('Mídia sem conteúdo'), { status: 400 })
          raw = await this.evolution.sendMedia(input.toNumber, {
            mediatype: type, mimetype: input.mediaMime || 'application/octet-stream', media: input.mediaBase64,
            fileName: input.fileName || `${type}.bin`, caption: input.caption || input.text,
          }, input.instanceName)
        } else {
          raw = await this.evolution.sendText(input.toNumber, input.text || '', { linkPreview: false }, input.instanceName)
        }
      } catch (error) {
        const failure = classifySendFailure(error)
        const attempt = Number(persisted.attempt || 0) + 1
        const retryable = failure === 'before_send' && attempt < 3
        const status = failure === 'uncertain' ? 'uncertain' : 'failed'
        await this.state.updateOutbox(outboxId, {
          status, error: (error as Error).message,
          payload: { failure, retryable, nextAttemptAt: retryable ? new Date(Date.now() + 500 * 2 ** (attempt - 1)).toISOString() : null },
        })
        if (!retryable) return { outboxId, status }
        persisted = (await this.state.getOutbox(outboxId))!
        continue
      }
      const providerMessageId = raw?.key?.id || raw?.messageId || raw?.id
      if (typeof providerMessageId !== 'string' || !providerMessageId) {
        await this.state.updateOutbox(outboxId, { status: 'uncertain', error: 'Provedor respondeu sem identificador de mensagem.', payload: { retryable: false } })
        return { outboxId, status: 'uncertain' }
      }
      // Falha na gravação após o envio propaga; uma recuperação encontrará sending e não repetirá o contato.
      await this.state.updateOutbox(outboxId, { status: 'sent', providerMessageId, payload: { retryable: false, providerResponse: raw } })
      return { outboxId, providerMessageId, status: 'sent', raw }
    }
    return { outboxId, status: 'failed' }
  }
}

let cached: WhatsAppOutboxService | null = null
export function getWhatsAppOutboxService(): WhatsAppOutboxService {
  if (!cached) cached = new WhatsAppOutboxService()
  return cached
}
