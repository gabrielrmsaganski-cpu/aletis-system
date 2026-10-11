export interface EvolutionConfigSummary {
  provider: 'evolution'
  configurado: boolean
  baseUrl?: string
  instance?: string
  webhookUrl?: string
  managerUrl?: string
}

export type EvolutionConnectionStatus = 'disconnected' | 'connecting' | 'qr_available' | 'connected' | 'degraded' | 'error'

export interface EvolutionRuntimeStatus extends EvolutionConfigSummary {
  status: EvolutionConnectionStatus
  reachable: boolean
  checkedAt: string
}

export interface EvolutionCreateInstanceInput {
  instanceName?: string
  qrcode?: boolean
  integration?: 'WHATSAPP-BAILEYS' | 'WHATSAPP-BUSINESS'
  rejectCall?: boolean
  msgCall?: string
  groupsIgnore?: boolean
  alwaysOnline?: boolean
  readMessages?: boolean
  readStatus?: boolean
  syncFullHistory?: boolean
}

interface SendTextOptions {
  delay?: number
  linkPreview?: boolean
  quotedMessageId?: string
}

interface SendMediaOptions {
  mediatype: 'image' | 'video' | 'document' | 'audio'
  mimetype: string
  media: string
  fileName: string
  caption?: string
  delay?: number
}

function readBaseUrl(): string {
  return (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '')
}

function redactWebhookUrl(url?: string): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    if (parsed.searchParams.has('secret')) parsed.searchParams.set('secret', '***')
    return parsed.toString()
  } catch {
    return url.replace(/([?&]secret=)[^&]+/i, '$1***')
  }
}

function connectionStatus(value: unknown, healthOk: boolean): EvolutionConnectionStatus {
  const source = value as Record<string, unknown> | undefined
  // Evolution/Baileys usa open, close e connecting. Aceitamos os aliases
  // explícitos dos outros adaptadores; "disconnected" nunca contém um sucesso.
  const knownStates: Record<string, EvolutionConnectionStatus> = {
    open: healthOk ? 'connected' : 'degraded',
    connected: healthOk ? 'connected' : 'degraded',
    online: healthOk ? 'connected' : 'degraded',
    close: 'disconnected',
    closed: 'disconnected',
    disconnected: 'disconnected',
    offline: 'disconnected',
    connecting: 'connecting',
    sync: 'connecting',
    syncing: 'connecting',
    qr: 'qr_available',
    qrcode: 'qr_available',
    qr_available: 'qr_available',
    pairing: 'qr_available',
  }
  const candidates = [
    source?.state,
    (source?.instance as Record<string, unknown> | undefined)?.state,
    (source?.instance as Record<string, unknown> | undefined)?.connectionStatus,
    source?.connectionStatus,
    source?.status,
    (source?.instance as Record<string, unknown> | undefined)?.status,
  ]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const normalized = candidate.trim().toLowerCase()
    if (Object.hasOwn(knownStates, normalized)) return knownStates[normalized]
  }
  return healthOk ? 'degraded' : 'error'
}

export class EvolutionClient {
  private baseUrl: string
  private apiKey: string
  private defaultInstance: string

  constructor() {
    this.baseUrl = readBaseUrl()
    this.apiKey = process.env.EVOLUTION_API_KEY || ''
    this.defaultInstance = process.env.EVOLUTION_INSTANCE_NAME || process.env.EVOLUTION_INSTANCE || 'aletis-principal'
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey && this.defaultInstance)
  }

  getConfigSummary(): EvolutionConfigSummary {
    return {
      provider: 'evolution',
      configurado: this.isConfigured(),
      baseUrl: this.baseUrl || undefined,
      instance: this.defaultInstance || undefined,
      webhookUrl: redactWebhookUrl(process.env.EVOLUTION_WEBHOOK_URL),
      managerUrl: process.env.EVOLUTION_MANAGER_PUBLIC_URL || undefined,
    }
  }

  getDefaultInstance(): string {
    return this.defaultInstance
  }

  async health(): Promise<{ ok: boolean; detail?: unknown }> {
    if (!this.isConfigured()) return { ok: false, detail: 'not_configured' }
    try {
      const res = await fetch(`${this.baseUrl}/`, {
        headers: { apikey: this.apiKey },
      })
      return { ok: res.ok, detail: res.status }
    } catch (err) {
      return { ok: false, detail: (err as Error).message }
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.isConfigured()) throw new Error('Evolution API nao configurada')
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      signal: init.signal || AbortSignal.timeout(20_000),
      // Não seguir uma segunda tentativa de POST por redirecionamento: o primeiro
      // endpoint pode já ter aceitado o envio e o resultado deve ficar explícito.
      redirect: init.method && init.method !== 'GET' ? 'error' : init.redirect,
      headers: {
        'Content-Type': 'application/json',
        apikey: this.apiKey,
        ...(init.headers || {}),
      },
    })
    const text = await res.text()
    const json = text ? (() => {
      try {
        return JSON.parse(text)
      } catch {
        return { raw: text }
      }
    })() : {}
    if (!res.ok) {
      const responseMessage = Array.isArray(json?.response?.message)
        ? json.response.message.join('; ')
        : json?.response?.message
      const message = responseMessage || json?.message || json?.error || text || `HTTP ${res.status}`
      const error = new Error(`Evolution API falhou em ${path}: ${message}`) as Error & { status?: number; body?: unknown }
      error.status = res.status
      error.body = json
      throw error
    }
    return json as T
  }

  async fetchInstances(): Promise<unknown[]> {
    if (!this.isConfigured()) return []
    const data = await this.request<unknown>('/instance/fetchInstances', { method: 'GET' })
    return Array.isArray(data) ? data : Array.isArray((data as any)?.instances) ? (data as any).instances : [data]
  }

  async createInstance(input: EvolutionCreateInstanceInput = {}): Promise<unknown> {
    const instanceName = input.instanceName || this.defaultInstance
    try {
      return await this.request('/instance/create', {
        method: 'POST',
        body: JSON.stringify({
          instanceName,
          qrcode: input.qrcode ?? true,
          integration: input.integration || 'WHATSAPP-BAILEYS',
          rejectCall: input.rejectCall ?? true,
          msgCall: input.msgCall || 'A ALETIS atende por mensagem. Por favor envie seu caso por texto ou audio.',
          groupsIgnore: input.groupsIgnore ?? true,
          alwaysOnline: input.alwaysOnline ?? false,
          readMessages: input.readMessages ?? true,
          readStatus: input.readStatus ?? false,
          syncFullHistory: input.syncFullHistory ?? false,
        }),
      })
    } catch (err) {
      const message = (err as Error).message.toLowerCase()
      if (message.includes('already in use') || message.includes('ja esta em uso') || message.includes('já está em uso')) {
        return { existing: true, instance: { instanceName }, message: 'Instancia ja existe; use Gerar QR para conectar.' }
      }
      throw err
    }
  }

  async connect(instance = this.defaultInstance): Promise<unknown> {
    return this.request(`/instance/connect/${encodeURIComponent(instance)}`, { method: 'GET' })
  }

  async connectionState(instance = this.defaultInstance): Promise<unknown> {
    if (!this.isConfigured()) return { configured: false }
    return this.request(`/instance/connectionState/${encodeURIComponent(instance)}`, { method: 'GET' })
  }

  async getRuntimeStatus(instance = this.defaultInstance): Promise<EvolutionRuntimeStatus> {
    const summary = this.getConfigSummary()
    const checkedAt = new Date().toISOString()
    if (!summary.configurado) {
      return { ...summary, status: 'disconnected', reachable: false, checkedAt }
    }
    try {
      const [health, connection] = await Promise.all([
        this.health(),
        this.connectionState(instance),
      ])
      return {
        ...summary,
        status: connectionStatus(connection, health.ok),
        reachable: health.ok,
        checkedAt,
      }
    } catch {
      return { ...summary, status: 'error', reachable: false, checkedAt }
    }
  }

  async setWebhook(instance = this.defaultInstance, url = process.env.EVOLUTION_WEBHOOK_URL || ''): Promise<unknown> {
    if (!isEvolutionWebhookEnabled()) throw new Error('Entrega de webhook Evolution desativada pela política de segurança.')
    if (!url) throw new Error('EVOLUTION_WEBHOOK_URL nao configurada')
    return this.request(`/webhook/set/${encodeURIComponent(instance)}`, {
      method: 'POST',
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url,
          webhookByEvents: true,
          webhookBase64: (process.env.EVOLUTION_WEBHOOK_BASE64 || 'true') !== 'false',
          events: ['MESSAGES_UPSERT'],
        },
      }),
    })
  }

  async sendText(to: string, text: string, opts: SendTextOptions = {}, instance = this.defaultInstance): Promise<any> {
    const payload: Record<string, unknown> = {
      number: to.replace(/\D/g, ''),
      text: text.slice(0, 4096),
      delay: opts.delay ?? 800,
      linkPreview: opts.linkPreview ?? false,
    }
    if (opts.quotedMessageId) {
      payload.quoted = { key: { id: opts.quotedMessageId } }
    }
    return this.request(`/message/sendText/${encodeURIComponent(instance)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async sendMedia(to: string, opts: SendMediaOptions, instance = this.defaultInstance): Promise<any> {
    return this.request(`/message/sendMedia/${encodeURIComponent(instance)}`, {
      method: 'POST',
      body: JSON.stringify({
        number: to.replace(/\D/g, ''),
        mediatype: opts.mediatype === 'audio' ? 'document' : opts.mediatype,
        mimetype: opts.mimetype,
        caption: opts.caption || '',
        media: opts.media,
        fileName: opts.fileName,
        delay: opts.delay ?? 800,
        linkPreview: false,
        mentionsEveryOne: false,
        mentioned: [],
      }),
    })
  }

  async sendWhatsAppAudio(to: string, audioBase64: string, instance = this.defaultInstance): Promise<any> {
    return this.request(`/message/sendWhatsAppAudio/${encodeURIComponent(instance)}`, {
      method: 'POST',
      body: JSON.stringify({
        number: to.replace(/\D/g, ''),
        audio: audioBase64,
        delay: 800,
        linkPreview: false,
        mentionsEveryOne: false,
        mentioned: [],
      }),
    })
  }

  async downloadMedia(input: {
    mediaUrl?: string
    mediaBase64?: string
    mimetype?: string
  }): Promise<{ buffer: Buffer; mimeType: string; source: 'base64' | 'url' }> {
    if (input.mediaBase64) {
      return {
        buffer: Buffer.from(input.mediaBase64.replace(/^data:[^;]+;base64,/, ''), 'base64'),
        mimeType: input.mimetype || 'application/octet-stream',
        source: 'base64',
      }
    }
    if (!input.mediaUrl) throw new Error('Midia sem URL/base64 para download')
    const headers: Record<string, string> = {}
    if (input.mediaUrl.startsWith(this.baseUrl)) headers.apikey = this.apiKey
    const res = await fetch(input.mediaUrl, { headers })
    if (!res.ok) throw new Error(`Download de midia falhou: HTTP ${res.status}`)
    const arrayBuffer = await res.arrayBuffer()
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: input.mimetype || res.headers.get('content-type') || 'application/octet-stream',
      source: 'url',
    }
  }
}

let cached: EvolutionClient | null = null

export function getEvolutionClient(): EvolutionClient {
  if (!cached) cached = new EvolutionClient()
  return cached
}
import { isEvolutionWebhookEnabled } from '../AutomationSafety.js'
