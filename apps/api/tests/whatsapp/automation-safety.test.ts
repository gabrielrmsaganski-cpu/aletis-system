import assert from 'node:assert'
import { test } from 'vitest'

import { getWhatsAppAutomationBlockReason } from '../../src/services/whatsapp/AutomationSafety.ts'

const now = Date.parse('2026-09-05T01:30:00.000Z')

function message(overrides: Record<string, unknown> = {}) {
  return {
    instanceName: 'aletis-principal',
    eventType: 'MESSAGES_UPSERT',
    remoteJid: '5547999999999@s.whatsapp.net',
    fromNumber: '5547999999999',
    toNumber: '',
    fromMe: false,
    timestamp: new Date(now - 30_000),
    type: 'text',
    raw: {},
    ...overrides,
  } as Parameters<typeof getWhatsAppAutomationBlockReason>[0]
}

test('bloqueia automação enquanto não há ativação explícita', () => {
  assert.strictEqual(getWhatsAppAutomationBlockReason(message(), {}, now), 'automation_disabled')
})

test('aceita somente número permitido e mensagem recente', () => {
  const env = {
    WHATSAPP_AUTOMATION_ENABLED: 'true',
    WHATSAPP_AUTOMATION_ALLOWED_NUMBERS: '+55 (47) 99999-9999',
    WHATSAPP_AUTOMATION_MAX_MESSAGE_AGE_SECONDS: '120',
  }
  assert.strictEqual(getWhatsAppAutomationBlockReason(message(), env, now), undefined)
  assert.strictEqual(getWhatsAppAutomationBlockReason(message({ timestamp: new Date(now - 121_000) }), env, now), 'message_outside_safe_window')
  assert.strictEqual(getWhatsAppAutomationBlockReason(message({ remoteJid: '120000000000@g.us' }), env, now), 'group_or_broadcast')
})
