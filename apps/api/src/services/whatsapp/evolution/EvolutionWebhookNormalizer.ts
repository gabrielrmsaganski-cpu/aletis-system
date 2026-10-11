import { createHash } from 'node:crypto'
import type { NormalizedEvolutionMessage, NormalizedWebhookEvent, NormalizedMessageType } from './types.js'

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

function hash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

function asObj(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function first<T>(...values: T[]): T | undefined {
  return values.find((v) => v !== undefined && v !== null && v !== '') as T | undefined
}

export function normalizePhone(input?: string): string {
  if (!input) return ''
  return input
    .replace(/@s\.whatsapp\.net$/i, '')
    .replace(/@c\.us$/i, '')
    .replace(/@g\.us$/i, '')
    .replace(/\D/g, '')
}

function parseTimestamp(value: unknown): Date {
  if (value instanceof Date) return value
  if (typeof value === 'number') {
    const ms = value > 10_000_000_000 ? value : value * 1000
    return new Date(ms)
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return parseTimestamp(n)
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date()
}

function normalizeEventName(event?: string): string {
  const raw = (event || 'UNKNOWN').trim()
  if (!raw) return 'UNKNOWN'
  return raw.replace(/[.-]/g, '_').toUpperCase()
}

function getMessageText(message: Record<string, any>): string | undefined {
  return first(
    message.conversation,
    message.extendedTextMessage?.text,
    message.ephemeralMessage?.message?.extendedTextMessage?.text,
    message.ephemeralMessage?.message?.conversation,
    message.buttonsResponseMessage?.selectedDisplayText,
    message.listResponseMessage?.title,
    message.templateButtonReplyMessage?.selectedDisplayText,
  )
}

function mediaFromMessage(message: Record<string, any>): {
  type: NormalizedMessageType
  media?: Record<string, any>
} {
  const candidates: Array<[NormalizedMessageType, string]> = [
    ['audio', 'audioMessage'],
    ['image', 'imageMessage'],
    ['document', 'documentMessage'],
    ['video', 'videoMessage'],
  ]
  for (const [type, key] of candidates) {
    const media = message[key] || message.ephemeralMessage?.message?.[key]
    if (media) return { type, media }
  }
  return { type: getMessageText(message) ? 'text' : 'unsupported' }
}

function getDataArray(payload: Record<string, any>): Record<string, any>[] {
  const data = payload.data
  if (Array.isArray(data)) return data.map(asObj)
  if (data && typeof data === 'object') return [asObj(data)]
  if (payload.key || payload.message || payload.messages) return [payload]
  return []
}

export function normalizeEvolutionWebhook(payload: unknown): NormalizedWebhookEvent {
  const body = asObj(payload)
  const eventType = normalizeEventName(first(body.event, body.eventType, body.type))
  const instanceName = String(first(body.instance, body.instanceName, body.data?.instanceId, process.env.EVOLUTION_INSTANCE, 'default'))
  const messages: NormalizedEvolutionMessage[] = []

  for (const item of getDataArray(body)) {
    const data = asObj(item)
    const messageRoot = asObj(first(data.message, data.messages?.[0]?.message, data))
    const key = asObj(first(data.key, data.messages?.[0]?.key, messageRoot.key))
    const remoteJid = String(first(key.remoteJid, data.remoteJid, data.chatId, data.from, data.sender, '') || '')
    const fromMe = Boolean(first(key.fromMe, data.fromMe, false))
    const mediaInfo = mediaFromMessage(messageRoot)
    const media = mediaInfo.media || {}
    const text = getMessageText(messageRoot)
    const providerMessageId = String(first(key.id, data.id, data.messageId, data.keyId, '') || '') || undefined
    const timestamp = parseTimestamp(first(data.messageTimestamp, data.timestamp, data.date_time, body.date_time))
    const fromNumber = normalizePhone(fromMe ? first(body.sender, data.sender, data.participant) : remoteJid)
    const toNumber = normalizePhone(fromMe ? remoteJid : first(body.sender, data.sender, data.participant))

    if (!providerMessageId && !remoteJid && !text && mediaInfo.type === 'unsupported') continue

    messages.push({
      instanceName,
      eventType,
      providerMessageId,
      remoteJid,
      fromNumber: fromNumber || normalizePhone(remoteJid),
      toNumber,
      contactName: first(data.pushName, data.notifyName, data.contactName, data.senderName),
      fromMe,
      timestamp,
      type: mediaInfo.type,
      text,
      mediaId: first(media.mediaKey, media.id, data.mediaId),
      mediaUrl: first(media.url, media.directPath, data.mediaUrl),
      mediaBase64: first(data.base64, data.mediaBase64, messageRoot.base64, media.base64),
      mediaMime: first(media.mimetype, media.mimeType, data.mimetype),
      mediaFilename: first(media.fileName, media.filename, data.fileName, `${mediaInfo.type}-${providerMessageId || hash(data).slice(0, 10)}`),
      caption: first(media.caption, messageRoot.imageMessage?.caption, messageRoot.documentMessage?.caption),
      status: first(data.status, body.status),
      raw: data,
    })
  }

  const providerMessageId = messages[0]?.providerMessageId
  const id = providerMessageId
    ? `${instanceName}:${eventType}:${providerMessageId}`
    : `${instanceName}:${eventType}:${hash(body).slice(0, 40)}`

  return {
    id,
    instanceName,
    eventType,
    providerMessageId,
    messages,
    raw: body,
  }
}

export function isEvolutionWebhook(payload: unknown): boolean {
  const body = asObj(payload)
  if (!body || body.object === 'whatsapp_business_account') return false
  return Boolean(body.event || body.instance || body.data?.key || body.data?.message || body.key || body.message)
}
