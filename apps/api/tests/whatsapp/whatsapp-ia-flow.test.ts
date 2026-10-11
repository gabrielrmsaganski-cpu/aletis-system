import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ state: null as any, calendar: null as any, crm: { findByPhone: vi.fn(), ensureLead: vi.fn(), updateLeadStatus: vi.fn() } }))
vi.mock('../../src/services/whatsapp/ConversationStateService.js', async (importOriginal) => ({
  ...await importOriginal<any>(), getConversationStateService: () => mocks.state,
}))
vi.mock('../../src/services/whatsapp/GoogleCalendarService.js', async (importOriginal) => ({
  ...await importOriginal<any>(), getGoogleCalendarService: () => mocks.calendar,
}))
vi.mock('../../src/services/whatsapp/CrmLeadService.js', () => ({ getCrmLeadService: () => mocks.crm }))
vi.mock('../../src/services/whatsapp/DocumentIntakeService.js', () => ({ getDocumentIntakeService: () => ({ getChecklistStatus: async () => [{ label: 'Contrato bancário' }] }) }))
vi.mock('../../src/services/whatsapp/AudioService.js', () => ({ getAudioService: () => ({}) }))
vi.mock('../../src/services/whatsapp/AutomationSafety.js', () => ({ isWhatsAppAutoLeadCreationEnabled: () => false }))
vi.mock('../../src/services/whatsapp/AiOrchestratorService.js', () => ({ getAiOrchestratorService: () => ({ composeReply: async ({ baseReply }: { baseReply: string }) => baseReply }) }))

import { ConversationStateService } from '../../src/services/whatsapp/ConversationStateService.js'
import { CalendarUnavailableError, GoogleCalendarService, type CalendarSlot } from '../../src/services/whatsapp/GoogleCalendarService.js'
import { EligibilityService } from '../../src/services/whatsapp/EligibilityService.js'
import { WhatsAppIaService } from '../../src/services/whatsapp/WhatsAppIaService.js'
import type { NormalizedEvolutionMessage, ConversationSummary } from '../../src/services/whatsapp/evolution/types.js'

const candidates: CalendarSlot[] = [
  { id: 'slot-1', start: '2026-06-02T13:00:00Z', end: '2026-06-02T13:50:00Z', label: 'Terça, 02/06, 09:00' },
  { id: 'slot-2', start: '2026-06-03T14:30:00Z', end: '2026-06-03T15:20:00Z', label: 'Quarta, 03/06, 10:30' },
]
const inbound = (text: string, id = 'msg-1'): NormalizedEvolutionMessage => ({
  instanceName: 'instancia-teste', eventType: 'messages.upsert', providerMessageId: id,
  fromNumber: '5599000000000', fromMe: false, timestamp: new Date(), type: 'text', text, raw: {},
})

describe('fluxo de triagem e agenda WhatsApp', () => {
  let dir: string
  let state: ConversationStateService
  let conversation: ConversationSummary
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
    vi.stubEnv('ALETIS_PG_ENABLED', '0')
    dir = mkdtempSync(join(tmpdir(), 'aletis-wa-flow-'))
    state = new ConversationStateService(join(dir, 'state.json')); mocks.state = state
    vi.clearAllMocks(); mocks.crm.findByPhone.mockResolvedValue(null)
    const calendar = new GoogleCalendarService()
    mocks.calendar = {
      listAvailableSlots: vi.fn().mockResolvedValue(candidates),
      pickSlotFromText: calendar.pickSlotFromText.bind(calendar),
      createEvent: vi.fn(async ({ slot }: { slot: CalendarSlot }) => ({ status: 'created', externalEventId: 'evento-confirmado', slot })),
    }
    conversation = await state.upsertConversation({ instanceName: 'instancia-teste', telefone: '5599000000000', nomeContato: 'Contato sintético' })
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); vi.useRealTimers() })

  async function offer() {
    const slots = await state.saveBookingOptions(conversation.id, candidates)
    await state.updateConversation(conversation.id, { etapa: 'agenda_oferecida' })
    return slots
  }

  it('coleta seis campos de uma mensagem e oferece apenas agenda consultada', async () => {
    const result = await new WhatsAppIaService().handleInbound(inbound('Sou produtor rural; preciso renegociar uma dívida de 500 mil; tenho documentos; quero falar com consultor.'))
    const bundle = await state.getConversationBundle(conversation.id)
    expect(bundle.eligibility).toHaveLength(6)
    expect(bundle.conversation?.etapa).toBe('agenda_oferecida')
    expect(result.replies[0]).toContain('última consulta')
    expect(await state.getBookingOptions(conversation.id)).toHaveLength(2)
  })

  it('resposta monetária inválida permanece pendente sem avançar a agenda', async () => {
    const eligibility = new EligibilityService()
    for (const answer of eligibility.parseMessage('Sou produtor rural; tenho dívida e preciso renegociar.', [])) {
      await state.saveEligibilityAnswer({ conversationId: conversation.id, questionKey: answer.questionKey, questionText: answer.questionKey, answerText: answer.answerText, answerValue: answer.value, score: answer.score })
    }
    const result = await new WhatsAppIaService().handleInbound(inbound('não sei'))
    const bundle = await state.getConversationBundle(conversation.id)
    expect(bundle.eligibility.some((answer) => answer.questionKey === 'valor_envolvido')).toBe(false)
    expect(result.replies[0]).toContain('valor aproximado')
    expect(mocks.calendar.listAvailableSlots).not.toHaveBeenCalled()
  })

  it('escolhe a opção persistida e não renumera a partir de uma nova consulta', async () => {
    const slots = await offer()
    const result = await new WhatsAppIaService().handleInbound(inbound('2'))
    expect(mocks.calendar.listAvailableSlots).not.toHaveBeenCalled()
    expect(mocks.calendar.createEvent).toHaveBeenCalledWith(expect.objectContaining({ slot: slots[1], requestKey: `${conversation.id}:${slots[1].start}` }))
    expect((await state.getConversationBundle(conversation.id)).conversation?.status).toBe('reuniao_agendada')
    expect(result.replies[0]).toContain('Sua reunião está confirmada')
    expect(await state.getBookingOptions(conversation.id)).toEqual([])
  })

  it('simulação não marca reunião no CRM nem cria booking', async () => {
    await offer()
    mocks.calendar.createEvent.mockImplementation(async ({ slot }: { slot: CalendarSlot }) => ({ status: 'dry_run', slot }))
    const result = await new WhatsAppIaService().handleInbound(inbound('1'))
    const bundle = await state.getConversationBundle(conversation.id)
    expect(bundle.conversation?.status).toBe('aguardando_consultor')
    expect(bundle.calendarEvents).toHaveLength(0)
    expect(result.replies[0]).toContain('nenhuma reunião foi criada')
    expect(mocks.crm.updateLeadStatus.mock.calls.some((call: any[]) => call[1] === 'Reunião agendada')).toBe(false)
  })

  it('falta de evento real também impede confirmação', async () => {
    await offer()
    mocks.calendar.createEvent.mockImplementation(async ({ slot }: { slot: CalendarSlot }) => ({ status: 'created', slot }))
    const result = await new WhatsAppIaService().handleInbound(inbound('1'))
    expect(result.escalated).toBe(true)
    expect((await state.getConversationBundle(conversation.id)).calendarEvents).toHaveLength(0)
  })

  it('conflito atualiza a oferta sem confirmar reunião', async () => {
    await offer(); mocks.calendar.createEvent.mockRejectedValue(new CalendarUnavailableError('conflict', 'Ocupado'))
    const result = await new WhatsAppIaService().handleInbound(inbound('1'))
    expect(result.replies[0]).toContain('não está mais disponível')
    expect((await state.getConversationBundle(conversation.id)).conversation?.etapa).toBe('agenda_oferecida')
    expect((await state.getConversationBundle(conversation.id)).calendarEvents).toHaveLength(0)
  })

  it('contato sob atendimento humano não recebe triagem automática', async () => {
    await state.updateConversation(conversation.id, { atendimentoModo: 'humano', aiEnabled: false })
    const result = await new WhatsAppIaService().handleInbound(inbound('Quero um horário'))
    expect(result.replies).toEqual([])
    expect(mocks.calendar.listAvailableSlots).not.toHaveBeenCalled()
  })

  it('replay de mensagem não duplica a criação e mensagem posterior não reinicia agenda', async () => {
    await offer(); const service = new WhatsAppIaService()
    await service.handleInbound(inbound('1'))
    expect((await service.handleInbound(inbound('1'))).replies).toEqual([])
    expect((await service.handleInbound(inbound('Obrigado', 'msg-2'))).replies[0]).toContain('já está registrada')
    expect(mocks.calendar.createEvent).toHaveBeenCalledTimes(1)
  })

  it('mídia não suportada recebe orientação compreensível', async () => {
    const result = await new WhatsAppIaService().handleInbound({ ...inbound(''), type: 'unsupported' })
    expect(result.replies[0]).toContain('por texto, PDF ou foto')
  })
})
