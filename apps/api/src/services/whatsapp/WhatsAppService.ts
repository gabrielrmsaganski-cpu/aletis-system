// ============================================================
// ALETIS — WhatsApp Cloud API Service
// Meta Graph API v21.0 wrapper — send text/audio, upload/download media,
// webhook verification.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
// ============================================================

// ── Configuration ────────────────────────────────────────────

interface WhatsAppConfig {
  token: string
  phoneNumberId: string
  verifyToken: string
  apiVersion: string
  businessAccountId?: string
}

function readConfig(): WhatsAppConfig | null {
  const token = process.env.WHATSAPP_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
  if (!token || !phoneNumberId || !verifyToken) return null
  return {
    token,
    phoneNumberId,
    verifyToken,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  }
}

// ── Types ────────────────────────────────────────────────────

export interface InboundMessage {
  from: string
  messageId: string
  timestamp: string
  type: 'text' | 'audio' | 'image' | 'document' | 'video' | 'button' | 'interactive' | 'unsupported'
  contact?: { nome?: string; wa_id?: string }
  text?: string
  audio?: { mediaId: string; mimeType: string; sha256?: string; voice: boolean }
  image?: { mediaId: string; mimeType: string; caption?: string }
  buttonReply?: { id: string; title: string }
}

export interface WebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product?: string
        metadata?: { display_phone_number?: string; phone_number_id?: string }
        contacts?: Array<{ profile?: { name?: string }; wa_id: string }>
        messages?: Array<any>
        statuses?: Array<{ id: string; recipient_id: string; status: string; timestamp: string }>
      }
      field: string
    }>
  }>
}

// ── Service ──────────────────────────────────────────────────

export class WhatsAppService {
  private config: WhatsAppConfig | null

  constructor() {
    this.config = readConfig()
    if (!this.config) {
      console.warn('[WhatsApp] Credenciais Meta não configuradas — webhook aceita verify mas send está desabilitado')
    } else {
      console.log(`[WhatsApp] Inicializado: phoneNumberId=${this.config.phoneNumberId} apiVersion=${this.config.apiVersion}`)
    }
  }

  isConfigured(): boolean {
    return this.config !== null
  }

  getConfigSummary(): { configurado: boolean; phoneNumberId?: string; apiVersion?: string } {
    if (!this.config) return { configurado: false }
    return {
      configurado: true,
      phoneNumberId: this.config.phoneNumberId,
      apiVersion: this.config.apiVersion,
    }
  }

  private baseUrl(): string {
    if (!this.config) throw new Error('WhatsApp não configurado')
    return `https://graph.facebook.com/${this.config.apiVersion}`
  }

  // ── Webhook verification (GET handshake) ────────────────

  verifyWebhook(mode: string | undefined, token: string | undefined, challenge: string | undefined): string | null {
    if (!this.config) return null
    if (mode === 'subscribe' && token === this.config.verifyToken && challenge) {
      return challenge
    }
    return null
  }

  // ── Webhook parsing ─────────────────────────────────────

  parseInbound(payload: WebhookPayload): InboundMessage[] {
    const result: InboundMessage[] = []
    if (payload?.object !== 'whatsapp_business_account') return result

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change?.value
        if (!value?.messages) continue

        const contactsByWaId: Record<string, string> = {}
        for (const c of value.contacts || []) {
          if (c.wa_id && c.profile?.name) contactsByWaId[c.wa_id] = c.profile.name
        }

        for (const m of value.messages) {
          const base: InboundMessage = {
            from: m.from,
            messageId: m.id,
            timestamp: m.timestamp,
            type: m.type,
            contact: { nome: contactsByWaId[m.from], wa_id: m.from },
          }

          switch (m.type) {
            case 'text':
              base.text = m.text?.body || ''
              break
            case 'audio':
              base.audio = {
                mediaId: m.audio?.id,
                mimeType: m.audio?.mime_type || 'audio/ogg; codecs=opus',
                sha256: m.audio?.sha256,
                voice: !!m.audio?.voice,
              }
              break
            case 'image':
              base.image = {
                mediaId: m.image?.id,
                mimeType: m.image?.mime_type || 'image/jpeg',
                caption: m.image?.caption,
              }
              break
            case 'interactive':
              if (m.interactive?.type === 'button_reply') {
                base.buttonReply = {
                  id: m.interactive.button_reply.id,
                  title: m.interactive.button_reply.title,
                }
              }
              break
            default:
              base.type = 'unsupported'
          }

          result.push(base)
        }
      }
    }
    return result
  }

  // ── Send: text ──────────────────────────────────────────

  async sendText(to: string, body: string, previewUrl: boolean = false): Promise<{ messageId: string }> {
    if (!this.config) throw new Error('WhatsApp não configurado')
    const url = `${this.baseUrl()}/${this.config.phoneNumberId}/messages`
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: previewUrl, body: body.slice(0, 4096) },
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const json: any = await res.json()
    if (!res.ok) {
      throw new Error(`sendText falhou: ${res.status} ${json?.error?.message || ''}`)
    }
    return { messageId: json?.messages?.[0]?.id }
  }

  // ── Send: typing indicator ─────────────────────────────

  async markAsRead(messageId: string): Promise<void> {
    if (!this.config) return
    const url = `${this.baseUrl()}/${this.config.phoneNumberId}/messages`
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    }).catch(() => { /* non-fatal */ })
  }

  // ── Send: audio via uploaded media ──────────────────────

  async uploadAudio(audioBuffer: Buffer, mimeType: string = 'audio/ogg'): Promise<string> {
    if (!this.config) throw new Error('WhatsApp não configurado')
    const url = `${this.baseUrl()}/${this.config.phoneNumberId}/media`

    const fd = new FormData()
    fd.append('messaging_product', 'whatsapp')
    fd.append('type', mimeType)
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType })
    fd.append('file', blob, 'voice.ogg')

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.token}` },
      body: fd as unknown as BodyInit,
    })
    const json: any = await res.json()
    if (!res.ok || !json?.id) {
      throw new Error(`uploadAudio falhou: ${res.status} ${json?.error?.message || ''}`)
    }
    return json.id
  }

  async sendAudio(to: string, audioBuffer: Buffer, mimeType: string = 'audio/ogg'): Promise<{ messageId: string; mediaId: string }> {
    if (!this.config) throw new Error('WhatsApp não configurado')
    const mediaId = await this.uploadAudio(audioBuffer, mimeType)

    const url = `${this.baseUrl()}/${this.config.phoneNumberId}/messages`
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'audio',
      audio: { id: mediaId },
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const json: any = await res.json()
    if (!res.ok) {
      throw new Error(`sendAudio falhou: ${res.status} ${json?.error?.message || ''}`)
    }
    return { messageId: json?.messages?.[0]?.id, mediaId }
  }

  // ── Send: interactive buttons ───────────────────────────

  async sendButtons(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
  ): Promise<{ messageId: string }> {
    if (!this.config) throw new Error('WhatsApp não configurado')
    const url = `${this.baseUrl()}/${this.config.phoneNumberId}/messages`

    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body.slice(0, 1024) },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const json: any = await res.json()
    if (!res.ok) {
      throw new Error(`sendButtons falhou: ${res.status} ${json?.error?.message || ''}`)
    }
    return { messageId: json?.messages?.[0]?.id }
  }

  // ── Download inbound media ──────────────────────────────

  async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    if (!this.config) throw new Error('WhatsApp não configurado')
    // 1. Resolve media URL
    const infoUrl = `${this.baseUrl()}/${mediaId}`
    const infoRes = await fetch(infoUrl, {
      headers: { Authorization: `Bearer ${this.config.token}` },
    })
    const info: any = await infoRes.json()
    if (!infoRes.ok || !info?.url) {
      throw new Error(`downloadMedia info falhou: ${infoRes.status} ${info?.error?.message || ''}`)
    }

    // 2. Download actual bytes (same token required)
    const mediaRes = await fetch(info.url, {
      headers: { Authorization: `Bearer ${this.config.token}` },
    })
    if (!mediaRes.ok) {
      throw new Error(`downloadMedia bytes falhou: ${mediaRes.status}`)
    }
    const arr = await mediaRes.arrayBuffer()
    return {
      buffer: Buffer.from(arr),
      mimeType: info.mime_type || 'application/octet-stream',
    }
  }
}

// ── Singleton ────────────────────────────────────────────────

let _instance: WhatsAppService | null = null

export function getWhatsAppService(): WhatsAppService {
  if (!_instance) _instance = new WhatsAppService()
  return _instance
}
