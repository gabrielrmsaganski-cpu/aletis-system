import { createHash } from 'node:crypto'
import { z } from 'zod'
import { ConversationStateService } from './ConversationStateService.js'
import { WhatsAppIaService } from './WhatsAppIaService.js'
import { WhatsAppOutboxService } from './WhatsAppOutboxService.js'
import { getWhatsAppAutomationBlockReason, isEvolutionWebhookEnabled, isWhatsAppAutomationEnabled } from './AutomationSafety.js'
import type { NormalizedEvolutionMessage, NormalizedWebhookEvent } from './evolution/types.js'

const itemSchema = z.object({
  message: z.record(z.unknown()), phase: z.enum(['pending', 'processing', 'prepared', 'done']),
  conversationId: z.string().optional(), replies: z.array(z.string()).default([]),
  nextReply: z.number().int().nonnegative().default(0), handoffNotice: z.boolean().optional(),
})
const workSchema = z.object({
  version: z.literal(1), provider: z.enum(['evolution', 'meta']), receivedAt: z.string().datetime(),
  items: z.array(itemSchema), metaStarted: z.boolean().optional(), metaPayload: z.record(z.unknown()).optional(),
})
type Work = z.infer<typeof workSchema>

export class WhatsAppWebhookQueueService {
  private timer?: ReturnType<typeof setInterval>
  private running?: Promise<void>

  constructor(
    private readonly state: ConversationStateService,
    private readonly ai: Pick<WhatsAppIaService, 'handleInbound'>,
    private readonly outbox: Pick<WhatsAppOutboxService, 'send'>,
    private readonly options: {
      logger?: { error: (context: unknown, message: string) => void }
      metaHandler?: (payload: Record<string, unknown>) => Promise<void>
    } = {},
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => { void this.drain().catch((error) => this.options.logger?.error({ error }, 'Falha no processamento durável do WhatsApp')) }, 1500)
    this.timer.unref()
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    await this.running?.catch(() => undefined)
  }

  async acceptEvolution(event: NormalizedWebhookEvent): Promise<{ eventId: string; duplicate: boolean }> {
    const now = new Date()
    const eligible = event.eventType === 'MESSAGES_UPSERT' && isEvolutionWebhookEnabled()
      ? event.messages.filter((message) => !getWhatsAppAutomationBlockReason(message, process.env, now.getTime())) : []
    const work: Work = workSchema.parse({
      version: 1, provider: 'evolution', receivedAt: now.toISOString(),
      items: eligible.map((message) => ({ message: { ...message, timestamp: message.timestamp.toISOString() }, phase: 'pending', replies: [], nextReply: 0 })),
    })
    const saved = await this.state.recordWebhookEvent({
      id: event.id, instanceName: event.instanceName, eventType: event.eventType,
      providerMessageId: event.providerMessageId, payload: { ...event.raw, __aletisQueue: work },
    })
    if (saved.inserted && !eligible.length) await this.state.saveWebhookWork(event.id, work, 'ignored')
    return { eventId: event.id, duplicate: !saved.inserted }
  }

  async acceptMeta(input: unknown): Promise<{ eventId: string; duplicate: boolean }> {
    const payload = z.record(z.unknown()).parse(input)
    const canonical = (value: unknown): string => value && typeof value === 'object'
      ? Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`
      : JSON.stringify(value)
    const id = `meta:${createHash('sha256').update(canonical(payload)).digest('hex')}`
    const work: Work = { version: 1, provider: 'meta', receivedAt: new Date().toISOString(), items: [], metaPayload: payload }
    const saved = await this.state.recordWebhookEvent({ id, instanceName: 'meta', eventType: 'META_WEBHOOK', payload: { ...payload, __aletisQueue: work } })
    if (saved.inserted && !isWhatsAppAutomationEnabled()) await this.state.saveWebhookWork(id, work, 'ignored')
    return { eventId: id, duplicate: !saved.inserted }
  }

  async drain(): Promise<void> {
    if (this.running) return this.running
    if (!isWhatsAppAutomationEnabled()) return
    this.running = this.state.withWebhookWorkerLock(async () => {
      for (const event of await this.state.listPendingWebhookEvents()) {
        if (!isWhatsAppAutomationEnabled()) return
        await this.process(event)
      }
    })
    try { await this.running } finally { this.running = undefined }
  }

  private async review(eventId: string, work: Work, reason: string): Promise<void> {
    await this.state.saveWebhookWork(eventId, work, 'needs_review', reason)
  }

  private async process(event: Record<string, any>): Promise<void> {
    const parsed = workSchema.safeParse(event.payload?.__aletisQueue)
    if (!parsed.success) return
    const work = parsed.data
    if (work.provider === 'meta') {
      if (work.metaStarted) return this.review(event.id, work, 'Fluxo Meta interrompido; conferir efeitos antes de repetir.')
      work.metaStarted = true
      await this.state.saveWebhookWork(event.id, work, 'processing')
      try {
        if (!this.options.metaHandler || !work.metaPayload) throw new Error('Processador Meta indisponível')
        await this.options.metaHandler(work.metaPayload)
        await this.state.saveWebhookWork(event.id, work, 'processed')
      } catch (error) { await this.review(event.id, work, (error as Error).message) }
      return
    }
    if (!isEvolutionWebhookEnabled()) { await this.state.saveWebhookWork(event.id, work, 'ignored'); return }
    for (let index = 0; index < work.items.length; index++) {
      const item = work.items[index]
      if (item.phase === 'done') continue
      const message = { ...item.message, timestamp: new Date(String(item.message.timestamp)) } as unknown as NormalizedEvolutionMessage
      if (getWhatsAppAutomationBlockReason(message, process.env, Date.parse(work.receivedAt))) {
        item.phase = 'done'; await this.state.saveWebhookWork(event.id, work, 'prepared'); continue
      }
      if (item.phase === 'processing') return this.review(event.id, work, 'Decisão interrompida antes de salvar resposta. Mensagem preservada para continuidade assistida.')
      if (item.phase === 'pending') {
        item.phase = 'processing'
        await this.state.saveWebhookWork(event.id, work, 'processing')
        let result
        try { result = await this.ai.handleInbound(message) }
        catch (error) { await this.review(event.id, work, (error as Error).message); return }
        item.conversationId = result.conversation.id
        item.replies = result.replies.filter((text) => text.trim())
        item.handoffNotice = result.escalated === true
        item.phase = 'prepared'
        await this.state.saveWebhookWork(event.id, work, 'prepared')
      }
      for (; item.nextReply < item.replies.length; item.nextReply++) {
        const current = (await this.state.getConversationBundle(item.conversationId!)).conversation
        const humanMode = current?.atendimentoModo === 'humano' || current?.aiEnabled === false
        const takenOverNow = current?.takeoverAt && Date.parse(current.takeoverAt) >= Date.parse(work.receivedAt)
        if (!isWhatsAppAutomationEnabled() || (humanMode && (!item.handoffNotice || takenOverNow))) {
          return this.review(event.id, work, 'Resposta automática suspensa: atendimento assumido ou automação desativada.')
        }
        const text = item.replies[item.nextReply]
        const sent = await this.outbox.send({
          conversationId: item.conversationId, instanceName: message.instanceName, toNumber: message.fromNumber,
          type: 'text', text, idempotencyKey: `${event.id}:${message.providerMessageId || index}:${item.nextReply}`,
        })
        await this.state.recordMessage({
          conversationId: item.conversationId!, instanceName: message.instanceName,
          providerMessageId: sent.providerMessageId || `outbox:${sent.outboxId}`, direction: 'outbound',
          type: 'text', status: sent.status, text, toNumber: message.fromNumber, timestamp: new Date(), payload: { outboxId: sent.outboxId },
        })
        if (sent.status !== 'sent') return this.review(event.id, work, `Saída ${sent.outboxId} com status ${sent.status}; sem reenvio automático.`)
        // O outbox impede duplicação caso o processo pare antes do próximo checkpoint.
        await this.state.saveWebhookWork(event.id, { ...work, items: work.items.map((value, position) => position === index ? { ...value, nextReply: item.nextReply + 1 } : value) }, 'prepared')
      }
      item.phase = 'done'
      await this.state.saveWebhookWork(event.id, work, 'prepared')
    }
    await this.state.saveWebhookWork(event.id, work, 'processed')
  }
}
