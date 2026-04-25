// ============================================================
// AlixPushChannel — canal unificado de push da ALIX (Fase A)
// ============================================================
// Abstrai destino (WhatsApp oficial / log-only) e degrada com graça
// quando credenciais não estão configuradas.
//
// Uso típico:
//   const ch = getAlixPushChannel()
//   await ch.sendInsight(insight)
//   await ch.sendBriefing(texto)
//   await ch.send({ body: "..." })
//
// Env:
//   ALIX_PROACTIVE_PUSH_WHATSAPP  — número destino em E.164 (ex.: 5541999999999)
//   ALIX_PUSH_ENABLED             — true|false (default true)
//   ALIX_PUSH_DRYRUN              — true → só loga, não envia (útil em dev)
//   WHATSAPP_ACCESS_TOKEN         — token Meta (se ausente, canal == log)
//   WHATSAPP_PHONE_NUMBER_ID      — idem
//
// Rate limit interno: 1 msg a cada 5s para o mesmo destino.
// Deduplicação: mesmo texto+destino em <60s é ignorado (hash).
// Log persistente em storage/alix-push/YYYY-MM-DD.jsonl.
// ============================================================
import { createHash } from 'crypto'
import { appendFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { getWhatsAppService } from '../../whatsapp/WhatsAppService.js'
import type { Insight } from '../ProactiveService.js'

export type PushDestination =
  | { kind: 'whatsapp'; to: string }
  | { kind: 'log' }

export interface PushResult {
  ok: boolean
  destination: PushDestination
  messageId?: string
  error?: string
  skippedReason?: 'disabled' | 'duplicate' | 'rate_limit' | 'no_destination'
  loggedAt: string
}

export interface SendOpts {
  /** Fallback para quando não há destino configurado */
  silentIfNoDest?: boolean
  /** Bypass de dedupe/rate-limit para mensagens críticas. */
  force?: boolean
  /** Rótulo para log (ex.: "insight:critico", "briefing:diario"). */
  tag?: string
}

const DEDUPE_WINDOW_MS = 60_000
const RATE_LIMIT_MS = 5_000

export class AlixPushChannel {
  private lastSentAt = new Map<string, number>()
  private recentHashes = new Map<string, number>()
  private storageDir: string

  constructor(storageDir: string) {
    this.storageDir = join(storageDir, 'alix-push')
    if (!existsSync(this.storageDir)) mkdirSync(this.storageDir, { recursive: true })
  }

  /** Descobre destino a partir de env. Sem destino configurado → log-only. */
  private resolveDestination(): PushDestination {
    const to = (process.env.ALIX_PROACTIVE_PUSH_WHATSAPP || '').trim()
    if (!to) return { kind: 'log' }
    // WhatsAppService pode estar não-configurado (sem WHATSAPP_ACCESS_TOKEN)
    const wa = getWhatsAppService()
    if (!wa.isConfigured()) return { kind: 'log' }
    return { kind: 'whatsapp', to }
  }

  isEnabled(): boolean {
    const flag = (process.env.ALIX_PUSH_ENABLED || 'true').toLowerCase()
    return flag === 'true' || flag === '1' || flag === 'yes'
  }

  isDryRun(): boolean {
    return (process.env.ALIX_PUSH_DRYRUN || '').toLowerCase() === 'true'
  }

  private hash(body: string, destKey: string): string {
    return createHash('sha1').update(`${destKey}::${body}`).digest('hex')
  }

  private pruneHashes(now: number): void {
    // Limpa hashes vencidos para não crescer sem bound.
    for (const [k, ts] of this.recentHashes.entries()) {
      if (now - ts > DEDUPE_WINDOW_MS) this.recentHashes.delete(k)
    }
  }

  private destKey(dest: PushDestination): string {
    return dest.kind === 'whatsapp' ? `wa:${dest.to}` : 'log'
  }

  private logPush(result: PushResult, body: string, tag?: string): void {
    try {
      const day = new Date().toISOString().slice(0, 10)
      const file = join(this.storageDir, `${day}.jsonl`)
      const line = JSON.stringify({
        ts: result.loggedAt,
        tag: tag ?? 'adhoc',
        destination: result.destination,
        ok: result.ok,
        messageId: result.messageId,
        error: result.error,
        skippedReason: result.skippedReason,
        preview: body.slice(0, 180),
      })
      appendFileSync(file, line + '\n')
    } catch {
      /* logging é best-effort */
    }
  }

  async send(params: { body: string; opts?: SendOpts }): Promise<PushResult> {
    const now = Date.now()
    const dest = this.resolveDestination()
    const destKey = this.destKey(dest)
    const body = params.body
    const opts = params.opts ?? {}
    const loggedAt = new Date().toISOString()

    if (!this.isEnabled()) {
      const res: PushResult = { ok: false, destination: dest, skippedReason: 'disabled', loggedAt }
      this.logPush(res, body, opts.tag)
      return res
    }

    // Dedupe (não aplica para force)
    if (!opts.force) {
      this.pruneHashes(now)
      const h = this.hash(body, destKey)
      if (this.recentHashes.has(h)) {
        const res: PushResult = { ok: false, destination: dest, skippedReason: 'duplicate', loggedAt }
        this.logPush(res, body, opts.tag)
        return res
      }
      this.recentHashes.set(h, now)
    }

    // Rate limit por destino
    if (!opts.force) {
      const last = this.lastSentAt.get(destKey) ?? 0
      if (now - last < RATE_LIMIT_MS) {
        const res: PushResult = { ok: false, destination: dest, skippedReason: 'rate_limit', loggedAt }
        this.logPush(res, body, opts.tag)
        return res
      }
    }

    // Se destino for log-only (sem WhatsApp)
    if (dest.kind === 'log') {
      if (opts.silentIfNoDest) {
        const res: PushResult = { ok: true, destination: dest, loggedAt }
        this.logPush(res, body, opts.tag)
        return res
      }
      console.log(`[AlixPush · ${opts.tag ?? 'adhoc'}] (log-only, sem WhatsApp) ${body.slice(0, 140)}${body.length > 140 ? '…' : ''}`)
      this.lastSentAt.set(destKey, now)
      const res: PushResult = { ok: true, destination: dest, loggedAt }
      this.logPush(res, body, opts.tag)
      return res
    }

    // Dryrun → loga como se enviasse, mas não chama a Meta API
    if (this.isDryRun()) {
      console.log(`[AlixPush · ${opts.tag ?? 'adhoc'}] DRYRUN → ${dest.to}: ${body.slice(0, 140)}${body.length > 140 ? '…' : ''}`)
      this.lastSentAt.set(destKey, now)
      const res: PushResult = { ok: true, destination: dest, messageId: 'dryrun', loggedAt }
      this.logPush(res, body, opts.tag)
      return res
    }

    // Envio real via WhatsApp Cloud API
    try {
      const wa = getWhatsAppService()
      const { messageId } = await wa.sendText(dest.to, body, false)
      this.lastSentAt.set(destKey, now)
      const res: PushResult = { ok: true, destination: dest, messageId, loggedAt }
      this.logPush(res, body, opts.tag)
      return res
    } catch (err) {
      const res: PushResult = { ok: false, destination: dest, error: (err as Error).message, loggedAt }
      this.logPush(res, body, opts.tag)
      return res
    }
  }

  /**
   * Envia um insight proativo crítico — formatação específica para WhatsApp.
   * Só dispara se `insight.urgencia === 'critico'` por default; pode forçar via opts.
   */
  async sendInsight(insight: Insight, opts?: SendOpts & { allowImportante?: boolean }): Promise<PushResult> {
    const allowed = insight.urgencia === 'critico' || (opts?.allowImportante && insight.urgencia === 'importante')
    if (!allowed) {
      const res: PushResult = {
        ok: false,
        destination: this.resolveDestination(),
        skippedReason: 'disabled',
        loggedAt: new Date().toISOString(),
      }
      return res
    }
    const icon = insight.urgencia === 'critico' ? '🔴' : '🟡'
    const body = [
      `${icon} *ALIX · ${insight.tipo.replace(/-/g, ' ')}*`,
      '',
      `*${insight.titulo}*`,
      insight.detalhes,
      '',
      '_responda "detalhes" para aprofundar ou "ignorar" para não receber similares._',
    ].join('\n')
    return this.send({ body, opts: { ...(opts ?? {}), tag: `insight:${insight.urgencia}` } })
  }

  /**
   * Envia briefing diário formatado para WhatsApp.
   */
  async sendBriefing(texto: string, opts?: SendOpts): Promise<PushResult> {
    return this.send({ body: texto, opts: { ...(opts ?? {}), tag: 'briefing:diario', force: true } })
  }

  /** Saúde do canal — útil para endpoint admin / healthcheck. */
  health(): {
    enabled: boolean
    dryRun: boolean
    destination: PushDestination
    whatsappConfigured: boolean
    targetNumber: string | null
  } {
    const dest = this.resolveDestination()
    return {
      enabled: this.isEnabled(),
      dryRun: this.isDryRun(),
      destination: dest,
      whatsappConfigured: getWhatsAppService().isConfigured(),
      targetNumber: (process.env.ALIX_PROACTIVE_PUSH_WHATSAPP || '').trim() || null,
    }
  }
}

// ── Singleton ────────────────────────────────────────────────
let _channel: AlixPushChannel | null = null
export function getAlixPushChannel(storageDir?: string): AlixPushChannel {
  if (!_channel) {
    const dir = storageDir || process.env.ALIX_STORAGE_DIR || join(process.cwd(), 'storage')
    _channel = new AlixPushChannel(dir)
  }
  return _channel
}
