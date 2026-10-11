import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConversationStateService } from '../../src/services/whatsapp/ConversationStateService.js'

describe('ConversationStateService', () => {
  let dir: string
  let previousPg: string | undefined

  beforeEach(() => {
    previousPg = process.env.ALETIS_PG_ENABLED
    process.env.ALETIS_PG_ENABLED = '0'
    dir = mkdtempSync(join(tmpdir(), 'aletis-wa-state-'))
  })

  afterEach(() => {
    process.env.ALETIS_PG_ENABLED = previousPg
    rmSync(dir, { recursive: true, force: true })
  })

  it('ignora webhook duplicado pelo id persistido', async () => {
    const svc = new ConversationStateService(join(dir, 'state.json'))
    const first = await svc.recordWebhookEvent({
      id: 'aletis-principal:MESSAGES_UPSERT:abc',
      instanceName: 'aletis-principal',
      eventType: 'MESSAGES_UPSERT',
      providerMessageId: 'abc',
      payload: { ok: true },
    })
    const second = await svc.recordWebhookEvent({
      id: 'aletis-principal:MESSAGES_UPSERT:abc',
      instanceName: 'aletis-principal',
      eventType: 'MESSAGES_UPSERT',
      providerMessageId: 'abc',
      payload: { ok: true },
    })

    expect(first.inserted).toBe(true)
    expect(second.inserted).toBe(false)
  })

  it('cria conversa, salva mensagem e evita duplicidade por providerMessageId', async () => {
    const svc = new ConversationStateService(join(dir, 'state.json'))
    const conversation = await svc.upsertConversation({
      instanceName: 'aletis-principal',
      telefone: '556699999999',
      nomeContato: 'Cliente Teste',
    })

    const first = await svc.recordMessage({
      conversationId: conversation.id,
      instanceName: 'aletis-principal',
      providerMessageId: 'msg-1',
      direction: 'inbound',
      type: 'text',
      text: 'Oi',
    })
    const second = await svc.recordMessage({
      conversationId: conversation.id,
      instanceName: 'aletis-principal',
      providerMessageId: 'msg-1',
      direction: 'inbound',
      type: 'text',
      text: 'Oi duplicado',
    })

    const bundle = await svc.getConversationBundle(conversation.id)
    expect(first.inserted).toBe(true)
    expect(second.inserted).toBe(false)
    expect(bundle.messages).toHaveLength(1)
    expect(bundle.messages[0].text).toBe('Oi')
  })
})

describe('persistência das opções de agenda', () => {
  let dir: string
  let previousPg: string | undefined
  beforeEach(() => {
    previousPg = process.env.ALETIS_PG_ENABLED
    process.env.ALETIS_PG_ENABLED = '0'
    dir = mkdtempSync(join(tmpdir(), 'aletis-wa-offers-'))
  })
  afterEach(() => {
    if (previousPg === undefined) delete process.env.ALETIS_PG_ENABLED
    else process.env.ALETIS_PG_ENABLED = previousPg
    rmSync(dir, { recursive: true, force: true })
  })
  it('restaura a ordem após reinício e isola opções por conversa', async () => {
    const path = join(dir, 'state.json'); const service = new ConversationStateService(path)
    const slots = [
      { id: 'mesmo-horario', start: '2027-06-01T13:00:00Z', end: '2027-06-01T13:50:00Z', label: 'Primeira opção' },
      { id: 'segundo-horario', start: '2027-06-02T13:00:00Z', end: '2027-06-02T13:50:00Z', label: 'Segunda opção' },
    ]
    const first = await service.saveBookingOptions('conversa-a', slots)
    const second = await service.saveBookingOptions('conversa-b', slots)
    expect(first[0].id).not.toBe(second[0].id)
    const restored = new ConversationStateService(path)
    expect(await restored.getBookingOptions('conversa-a')).toEqual(first)
    expect(await restored.getBookingOptions('conversa-b')).toEqual(second)
    await restored.saveBookingOptions('conversa-a', [])
    expect(await restored.getBookingOptions('conversa-a')).toEqual([])
    expect(await restored.getBookingOptions('conversa-b')).toEqual(second)
  })
  it.each(['expired', 'corrupt'])('não reaproveita nem renumera oferta %s', async (scenario) => {
    const path = join(dir, 'state.json'); const service = new ConversationStateService(path)
    const slot = { id: 'slot-original', start: '2027-06-01T13:00:00Z', end: '2027-06-01T13:50:00Z', label: '09h' }
    await service.saveBookingOptions('conversa-a', [slot, { ...slot, id: 'slot-2', label: 'Outra opção' }])
    const saved = JSON.parse(readFileSync(path, 'utf8'))
    if (scenario === 'expired') saved.bookingOptions[0].criadoEm = new Date(Date.now() - 25 * 60 * 60_000).toISOString()
    else saved.bookingOptions[0].slots[0].start = 'data inválida'
    writeFileSync(path, JSON.stringify(saved))
    expect(await service.getBookingOptions('conversa-a')).toEqual([])
  })
})
