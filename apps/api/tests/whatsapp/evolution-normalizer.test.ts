import { describe, expect, it } from 'vitest'
import {
  isEvolutionWebhook,
  normalizeEvolutionWebhook,
  normalizePhone,
} from '../../src/services/whatsapp/evolution/EvolutionWebhookNormalizer.js'

describe('EvolutionWebhookNormalizer', () => {
  it('normaliza payload messages.upsert de texto', () => {
    const payload = {
      event: 'messages.upsert',
      instance: 'aletis-principal',
      data: {
        key: {
          id: 'ABC123',
          remoteJid: '556699999999@s.whatsapp.net',
          fromMe: false,
        },
        pushName: 'Cliente Teste',
        message: { conversation: 'Oi, quero analisar uma proposta' },
        messageTimestamp: 1779926400,
      },
    }

    expect(isEvolutionWebhook(payload)).toBe(true)
    const normalized = normalizeEvolutionWebhook(payload)

    expect(normalized.id).toBe('aletis-principal:MESSAGES_UPSERT:ABC123')
    expect(normalized.eventType).toBe('MESSAGES_UPSERT')
    expect(normalized.messages).toHaveLength(1)
    expect(normalized.messages[0]).toMatchObject({
      instanceName: 'aletis-principal',
      providerMessageId: 'ABC123',
      fromNumber: '556699999999',
      contactName: 'Cliente Teste',
      type: 'text',
      text: 'Oi, quero analisar uma proposta',
      fromMe: false,
    })
  })

  it('normaliza telefone de jid', () => {
    expect(normalizePhone('556699999999@s.whatsapp.net')).toBe('556699999999')
    expect(normalizePhone('+55 (66) 9999-9999')).toBe('556699999999')
  })
})
