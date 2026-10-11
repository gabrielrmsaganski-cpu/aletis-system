interface N8nDispatchInput {
  id: string
  eventType: string
  payload: Record<string, unknown>
}

export interface IntegrationResult {
  configured: boolean
  ok: boolean
  skipped?: boolean
  status?: number
  detail?: unknown
}

function baseWebhookUrl(): string {
  return (process.env.N8N_WEBHOOK_BASE_URL || process.env.N8N_WEBHOOK_URL || '').replace(/\/+$/, '')
}

function eventWebhookUrl(eventType: string): string {
  const specific = process.env[`N8N_WEBHOOK_${eventType.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`]
  if (specific) return specific
  const base = baseWebhookUrl()
  if (!base) return ''
  return `${base}/aletis/${encodeURIComponent(eventType)}`
}

export class N8nAutomationService {
  getConfigSummary() {
    return {
      provider: 'n8n',
      configured: Boolean(baseWebhookUrl()),
      baseUrl: baseWebhookUrl() || undefined,
      enabled: (process.env.N8N_AUTOMATION_ENABLED || 'false').toLowerCase() === 'true',
    }
  }

  async dispatch(input: N8nDispatchInput): Promise<IntegrationResult> {
    const enabled = (process.env.N8N_AUTOMATION_ENABLED || 'false').toLowerCase() === 'true'
    const url = eventWebhookUrl(input.eventType)
    if (!enabled || !url) {
      return { configured: Boolean(url), ok: true, skipped: true, detail: 'n8n disabled or webhook not configured' }
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const secret = process.env.N8N_WEBHOOK_SECRET
    if (secret) headers['x-aletis-webhook-secret'] = secret

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Number(process.env.N8N_TIMEOUT_MS || 8000))
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: input.id,
          eventType: input.eventType,
          payload: input.payload,
          emittedAt: new Date().toISOString(),
        }),
        signal: controller.signal,
      })
      const text = await res.text()
      return {
        configured: true,
        ok: res.ok,
        status: res.status,
        detail: text ? safeJson(text) : undefined,
      }
    } catch (err) {
      return { configured: true, ok: false, detail: (err as Error).message }
    } finally {
      clearTimeout(timer)
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text.slice(0, 1000)
  }
}

let singleton: N8nAutomationService | null = null

export function getN8nAutomationService(): N8nAutomationService {
  if (!singleton) singleton = new N8nAutomationService()
  return singleton
}
