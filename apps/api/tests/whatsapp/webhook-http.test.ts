import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const calls = vi.hoisted(() => ({ acceptEvolution: vi.fn(), acceptMeta: vi.fn(), bundle: vi.fn(), recordMessage: vi.fn(), send: vi.fn() }))
vi.mock('../../src/services/whatsapp/WhatsAppWebhookQueueService.js', () => ({ WhatsAppWebhookQueueService: class {
  acceptEvolution = calls.acceptEvolution; acceptMeta = calls.acceptMeta; start() {}; async stop() {}
} }))
vi.mock('../../src/services/DataSourceManager.js', () => ({ DataSourceManager: { getInstance: () => ({}) } }))
vi.mock('../../src/services/AlixService.js', () => ({ AlixService: class {}, registerStores: () => undefined }))
vi.mock('../../src/routes/clientes.js', () => ({ clientes: new Map() }))
vi.mock('../../src/routes/propostas.js', () => ({ propostas: new Map(), propostasInteligentes: new Map() }))
vi.mock('../../src/services/whatsapp/WhatsAppService.js', () => ({ getWhatsAppService: () => ({ isConfigured: () => false }) }))
vi.mock('../../src/services/whatsapp/OpenAIAudioService.js', () => ({ getOpenAIAudioService: () => ({ isConfigured: () => false }), OPENAI_VOICES_PT_BR: [] }))
vi.mock('../../src/services/whatsapp/WhatsAppBrain.js', () => ({ getWhatsAppBrain: () => ({}) }))
vi.mock('../../src/services/whatsapp/evolution/EvolutionClient.js', () => ({ getEvolutionClient: () => ({ isConfigured: () => false }) }))
vi.mock('../../src/services/whatsapp/ConversationStateService.js', () => ({ getConversationStateService: () => ({ getConversationBundle: calls.bundle, recordMessage: calls.recordMessage }) }))
vi.mock('../../src/services/whatsapp/WhatsAppIaService.js', () => ({ getWhatsAppIaService: () => ({}) }))
vi.mock('../../src/services/whatsapp/DocumentIntakeService.js', () => ({ getDocumentIntakeService: () => ({}) }))
vi.mock('../../src/services/whatsapp/GoogleCalendarService.js', () => ({ getGoogleCalendarService: () => ({}) }))
vi.mock('../../src/services/whatsapp/WhatsAppOutboxService.js', () => ({ getWhatsAppOutboxService: () => ({ send: calls.send }) }))
vi.mock('../../src/services/whatsapp/HumanTakeoverService.js', () => ({ getHumanTakeoverService: () => ({}) }))
import whatsappRoutes from '../../src/routes/whatsapp.js'

const body = { event: 'messages.upsert', instance: 'teste', data: { key: { id: 'msg-1', remoteJid: '5599000000000@s.whatsapp.net' }, message: { conversation: 'Oi' } } }

describe('confirmação HTTP do webhook', () => {
  beforeEach(() => { vi.clearAllMocks(); delete process.env.WHATSAPP_WEBHOOK_SECRET; delete process.env.EVOLUTION_WEBHOOK_SECRET })
  it('mantém a requisição aberta até a persistência confirmar', async () => {
    let resolve!: (value: unknown) => void
    calls.acceptEvolution.mockReturnValue(new Promise((done) => { resolve = done }))
    const app = Fastify(); await app.register(whatsappRoutes); await app.ready()
    let finished = false
    const response = app.inject({ method: 'POST', url: '/api/whatsapp/webhook', payload: body }).then((result) => { finished = true; return result })
    await vi.waitFor(() => expect(calls.acceptEvolution).toHaveBeenCalledTimes(1), { timeout: 1000, interval: 10 })
    expect(calls.acceptEvolution).toHaveBeenCalledTimes(1); expect(finished).toBe(false)
    resolve({ eventId: 'teste:msg-1', duplicate: false })
    expect((await response).statusCode).toBe(200)
    await app.close()
  })
  it('falha de persistência devolve 503 para permitir reentrega', async () => {
    calls.acceptEvolution.mockRejectedValue(new Error('Persistência indisponível'))
    const app = Fastify(); await app.register(whatsappRoutes)
    const response = await app.inject({ method: 'POST', url: '/api/whatsapp/webhook', payload: body })
    expect(response.statusCode).toBe(503); expect(response.json().success).toBe(false)
    await app.close()
  })
  it('também persiste o webhook Meta antes de confirmar', async () => {
    calls.acceptMeta.mockResolvedValue({ eventId: 'meta:1', duplicate: true })
    const app = Fastify(); await app.register(whatsappRoutes)
    const response = await app.inject({ method: 'POST', url: '/api/whatsapp/webhook', payload: { object: 'whatsapp_business_account', entry: [] } })
    expect(calls.acceptMeta).toHaveBeenCalledTimes(1); expect(response.json()).toMatchObject({ success: true, duplicate: true })
    await app.close()
  })
  it.each([['uncertain', 409], ['dry_run', 409], ['failed', 502]])('saída %s não vira confirmação de envio na API', async (status, httpStatus) => {
    calls.bundle.mockResolvedValue({ conversation: { id: 'conv-1', instanceName: 'teste', telefone: '5599000000000' } })
    calls.send.mockResolvedValue({ outboxId: 'outbox-1', status })
    calls.recordMessage.mockResolvedValue({ message: { id: 'mensagem-1', status } })
    const app = Fastify(); await app.register(whatsappRoutes)
    const response = await app.inject({ method: 'POST', url: '/api/whatsapp/conversations/conv-1/send', payload: { text: 'Mensagem de teste', idempotencyKey: 'tentativa-1' } })
    expect(response.statusCode).toBe(httpStatus)
    expect(response.json()).toMatchObject({ success: false, status })
    expect(calls.send).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'tentativa-1' }))
    await app.close()
  })
})
