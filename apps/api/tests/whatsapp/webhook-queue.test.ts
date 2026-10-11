import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../src/services/whatsapp/WhatsAppIaService.js', () => ({ WhatsAppIaService: class {} }))
import { ConversationStateService } from '../../src/services/whatsapp/ConversationStateService.js'
import { WhatsAppWebhookQueueService } from '../../src/services/whatsapp/WhatsAppWebhookQueueService.js'
import { WhatsAppOutboxService } from '../../src/services/whatsapp/WhatsAppOutboxService.js'
import type { NormalizedWebhookEvent } from '../../src/services/whatsapp/evolution/types.js'

const event = (id = 'evento-1'): NormalizedWebhookEvent => ({
  id, instanceName: 'teste', eventType: 'MESSAGES_UPSERT', providerMessageId: id, raw: { event: 'messages.upsert', id },
  messages: [{ instanceName: 'teste', eventType: 'MESSAGES_UPSERT', providerMessageId: id, fromNumber: '5599000000000', remoteJid: '5599000000000@s.whatsapp.net', fromMe: false, type: 'text', text: 'Quero conversar', timestamp: new Date(), raw: {} }],
})

describe('inbox durável WhatsApp', () => {
  let dir: string
  let state: ConversationStateService
  let ai: { handleInbound: ReturnType<typeof vi.fn> }
  let transport: { isConfigured: () => boolean; sendText: ReturnType<typeof vi.fn> }
  let outbox: WhatsAppOutboxService
  beforeEach(() => {
    vi.stubEnv('ALETIS_PG_ENABLED', '0'); vi.stubEnv('WHATSAPP_AUTOMATION_ENABLED', 'true'); vi.stubEnv('EVOLUTION_WEBHOOK_ENABLED', 'true'); vi.stubEnv('WHATSAPP_AUTOMATION_ALLOWED_NUMBERS', '5599000000000')
    dir = mkdtempSync(join(tmpdir(), 'wa-inbox-')); state = new ConversationStateService(join(dir, 'state.json'))
    ai = { handleInbound: vi.fn(async (message) => ({ conversation: await state.upsertConversation({ instanceName: 'teste', telefone: message.fromNumber }), replies: ['Resposta preparada'] })) }
    transport = { isConfigured: () => true, sendText: vi.fn(async () => ({ key: { id: 'provider-confirmado' } })) }
    outbox = new WhatsAppOutboxService(state, transport as any, async () => undefined)
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs() })
  const queue = (state: ConversationStateService, ai: any, outbox: any) => new WhatsAppWebhookQueueService(state, ai, outbox)

  it('persiste antes de processar e recupera o trabalho após reinício', async () => {
    await queue(state, ai, outbox).acceptEvolution(event())
    expect(ai.handleInbound).not.toHaveBeenCalled()
    const recovered = new ConversationStateService(join(dir, 'state.json'))
    expect((await recovered.listPendingWebhookEvents())).toHaveLength(1)
    await queue(recovered, ai, outbox).drain()
    expect(ai.handleInbound).toHaveBeenCalledTimes(1)
    expect(transport.sendText).toHaveBeenCalledTimes(1)
    expect((await recovered.getWebhookEvent('evento-1'))?.status).toBe('processed')
  })
  it('replay do webhook não reexecuta a IA nem duplica a resposta', async () => {
    const service = queue(state, ai, outbox)
    await service.acceptEvolution(event()); await service.drain()
    expect((await service.acceptEvolution(event())).duplicate).toBe(true)
    await service.drain()
    expect(ai.handleInbound).toHaveBeenCalledTimes(1); expect(transport.sendText).toHaveBeenCalledTimes(1)
  })
  it('retoma resposta preparada após envio confirmado e queda antes do checkpoint', async () => {
    let first = true
    const interrupted = { send: async (input: any) => {
      const sent = await outbox.send(input)
      if (first) { first = false; throw new Error('Simulação: processo parou após confirmação') }
      return sent
    } }
    const service = queue(state, ai, interrupted)
    await service.acceptEvolution(event())
    await expect(service.drain()).rejects.toThrow('processo parou')
    expect((await state.getWebhookEvent('evento-1'))?.status).toBe('prepared')
    const recovered = new ConversationStateService(join(dir, 'state.json'))
    await queue(recovered, ai, new WhatsAppOutboxService(recovered, transport as any)).drain()
    expect(ai.handleInbound).toHaveBeenCalledTimes(1); expect(transport.sendText).toHaveBeenCalledTimes(1)
    expect((await recovered.getWebhookEvent('evento-1'))?.status).toBe('processed')
  })
  it('decisão interrompida preserva a entrada para revisão sem repetir efeitos', async () => {
    ai.handleInbound.mockRejectedValue(new Error('Interrupção durante decisão'))
    const service = queue(state, ai, outbox)
    await service.acceptEvolution(event()); await service.drain()
    const saved = await state.getWebhookEvent('evento-1')
    expect(saved?.status).toBe('needs_review')
    expect(saved?.payload.__aletisQueue.items[0].message.text).toBe('Quero conversar')
    await queue(new ConversationStateService(join(dir, 'state.json')), ai, outbox).drain()
    expect(ai.handleInbound).toHaveBeenCalledTimes(1); expect(transport.sendText).not.toHaveBeenCalled()
  })
  it('resposta incerta termina em revisão sem novo envio', async () => {
    transport.sendText.mockRejectedValue(new Error('Timeout depois do envio'))
    const service = queue(state, ai, outbox)
    await service.acceptEvolution(event()); await service.drain(); await service.drain()
    expect((await state.getWebhookEvent('evento-1'))?.status).toBe('needs_review')
    expect(transport.sendText).toHaveBeenCalledTimes(1)
  })
  it('assumir atendimento enquanto a IA prepara resposta suspende o envio', async () => {
    ai.handleInbound.mockImplementation(async (message) => {
      const conversation = await state.upsertConversation({ instanceName: 'teste', telefone: message.fromNumber })
      await state.updateConversation(conversation.id, { atendimentoModo: 'humano', aiEnabled: false, takeoverAt: new Date().toISOString() })
      return { conversation, replies: ['Resposta automática já preparada'] }
    })
    const service = queue(state, ai, outbox)
    await service.acceptEvolution(event()); await service.drain()
    expect(transport.sendText).not.toHaveBeenCalled()
    expect((await state.getWebhookEvent('evento-1'))?.status).toBe('needs_review')
  })
  it('execuções concorrentes preservam a ordem das mensagens', async () => {
    const order: string[] = []
    ai.handleInbound.mockImplementation(async (message) => {
      order.push(message.providerMessageId)
      await Promise.resolve()
      return { conversation: await state.upsertConversation({ instanceName: 'teste', telefone: message.fromNumber }), replies: [] }
    })
    const first = queue(state, ai, outbox); const second = queue(state, ai, outbox)
    await first.acceptEvolution(event('primeira')); await first.acceptEvolution(event('segunda'))
    await Promise.all([first.drain(), second.drain()])
    expect(order).toEqual(['primeira', 'segunda'])
  })
  it('automação desligada registra recebimento e não deixa trabalho para ativação futura', async () => {
    vi.stubEnv('WHATSAPP_AUTOMATION_ENABLED', 'false')
    const service = queue(state, ai, outbox)
    await service.acceptEvolution(event()); await service.drain()
    expect((await state.getWebhookEvent('evento-1'))?.status).toBe('ignored')
    expect(ai.handleInbound).not.toHaveBeenCalled()
  })
  it('falha de persistência rejeita o recebimento', async () => {
    vi.spyOn(state, 'recordWebhookEvent').mockRejectedValue(new Error('Disco indisponível'))
    await expect(queue(state, ai, outbox).acceptEvolution(event())).rejects.toThrow('Disco indisponível')
    expect(ai.handleInbound).not.toHaveBeenCalled()
  })
})
