import type { NormalizedEvolutionMessage } from './evolution/types.js'

type AutomationEnv = Partial<Pick<NodeJS.ProcessEnv, 'WHATSAPP_AUTOMATION_ENABLED' | 'WHATSAPP_AUTOMATION_ALLOWED_NUMBERS' | 'WHATSAPP_AUTOMATION_MAX_MESSAGE_AGE_SECONDS' | 'WHATSAPP_AUTO_CREATE_LEADS' | 'EVOLUTION_WEBHOOK_ENABLED'>>

function isEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true'
}

function normalizePhone(value: string | undefined): string {
  return String(value || '').replace(/\D/g, '')
}

function allowedNumbers(env: AutomationEnv): Set<string> {
  return new Set(
    String(env.WHATSAPP_AUTOMATION_ALLOWED_NUMBERS || '')
      .split(',')
      .map(normalizePhone)
      .filter(Boolean),
  )
}

function maxMessageAgeMs(env: AutomationEnv): number {
  const configured = Number(env.WHATSAPP_AUTOMATION_MAX_MESSAGE_AGE_SECONDS)
  const seconds = Number.isFinite(configured) && configured > 0 ? configured : 120
  return seconds * 1_000
}

export function isWhatsAppAutomationEnabled(env: AutomationEnv = process.env): boolean {
  return isEnabled(env.WHATSAPP_AUTOMATION_ENABLED)
}

export function isWhatsAppAutoLeadCreationEnabled(env: AutomationEnv = process.env): boolean {
  return isEnabled(env.WHATSAPP_AUTO_CREATE_LEADS)
}

export function isEvolutionWebhookEnabled(env: AutomationEnv = process.env): boolean {
  return isEnabled(env.EVOLUTION_WEBHOOK_ENABLED)
}

export function getWhatsAppAutomationBlockReason(
  message: NormalizedEvolutionMessage,
  env: AutomationEnv = process.env,
  now = Date.now(),
): string | undefined {
  if (!isWhatsAppAutomationEnabled(env)) return 'automation_disabled'
  const allowed = allowedNumbers(env)
  if (allowed.size === 0) return 'allowlist_not_configured'
  if (message.fromMe) return 'sent_by_instance'
  const remoteJid = message.remoteJid || ''
  if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast')) return 'group_or_broadcast'
  if (!allowed.has(normalizePhone(message.fromNumber))) return 'sender_not_allowlisted'
  const timestamp = message.timestamp.getTime()
  const age = now - timestamp
  if (!Number.isFinite(timestamp) || age > maxMessageAgeMs(env) || age < -60_000) return 'message_outside_safe_window'
  return undefined
}
