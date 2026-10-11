import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { getPool, isPgEnabled } from '../../db/client.js'
import type { CalendarSlot } from './GoogleCalendarService.js'

import type {
  ConversationDocument,
  ConversationMessage,
  ConversationSummary,
} from './evolution/types.js'

const calendarSlotSchema = z.object({
  id: z.string().min(1), start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }), label: z.string().min(1),
}).passthrough().refine((slot) => Date.parse(slot.end) > Date.parse(slot.start), 'Intervalo de agenda inválido')

interface LocalState {
  conversations: ConversationSummary[]
  messages: ConversationMessage[]
  documents: ConversationDocument[]
  eligibility: Array<Record<string, any>>
  webhookEvents: Array<Record<string, any>>
  calendarEvents: Array<Record<string, any>>
  outbox: Array<Record<string, any>>
  mediaFiles: Array<Record<string, any>>
  auditLogs: Array<Record<string, any>>
  contacts: Array<Record<string, any>>
  documentRequests: Array<Record<string, any>>
  eligibilityResults: Array<Record<string, any>>
  bookingOptions: Array<Record<string, any>>
  bookings: Array<Record<string, any>>
}

interface UpsertConversationInput {
  instanceName: string
  telefone: string
  waJid?: string
  nomeContato?: string
  clienteId?: string | null
  leadId?: string | null
  payload?: Record<string, unknown>
}

interface RecordMessageInput {
  conversationId: string
  instanceName: string
  providerMessageId?: string
  direction: 'inbound' | 'outbound' | 'system'
  type: string
  status?: string
  text?: string
  transcription?: string
  mediaUrl?: string
  mediaMime?: string
  mediaFilename?: string
  mediaStorageKey?: string
  fromNumber?: string
  toNumber?: string
  timestamp?: Date
  payload?: Record<string, unknown>
}

function nowIso(): string {
  return new Date().toISOString()
}

function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}

function rowConversation(row: any): ConversationSummary {
  return {
    id: row.id,
    clienteId: row.cliente_id ?? row.clienteId ?? null,
    leadId: row.lead_id ?? row.leadId ?? null,
    telefone: row.telefone,
    waJid: row.wa_jid ?? row.waJid ?? null,
    nomeContato: row.nome_contato ?? row.nomeContato ?? null,
    instanceName: row.instance_name ?? row.instanceName,
    atendimentoModo: row.atendimento_modo ?? row.atendimentoModo ?? 'ia',
    status: row.status,
    etapa: row.etapa,
    elegibilidadeStatus: row.elegibilidade_status ?? row.elegibilidadeStatus ?? 'em_coleta',
    crmStatus: row.crm_status ?? row.crmStatus ?? 'Novo lead',
    currentState: row.current_state ?? row.currentState ?? 'new_lead',
    aiEnabled: row.ai_enabled ?? row.aiEnabled ?? true,
    assignedUserId: row.assigned_user_id ?? row.assignedUserId ?? null,
    takeoverReason: row.takeover_reason ?? row.takeoverReason ?? null,
    takeoverAt: (row.takeover_at ?? row.takeoverAt)?.toISOString?.() ?? row.takeover_at ?? row.takeoverAt ?? null,
    releasedAt: (row.released_at ?? row.releasedAt)?.toISOString?.() ?? row.released_at ?? row.releasedAt ?? null,
    eligibilityScore: Number(row.eligibility_score ?? row.eligibilityScore ?? 0),
    prioridade: row.prioridade ?? 'normal',
    tags: row.tags ?? null,
    resumo: row.resumo ?? null,
    ultimaMensagemEm: (row.ultima_mensagem_em ?? row.ultimaMensagemEm)?.toISOString?.() ?? row.ultima_mensagem_em ?? row.ultimaMensagemEm ?? null,
    criadoEm: (row.criado_em ?? row.criadoEm)?.toISOString?.() ?? row.criado_em ?? row.criadoEm ?? null,
    atualizadoEm: (row.atualizado_em ?? row.atualizadoEm)?.toISOString?.() ?? row.atualizado_em ?? row.atualizadoEm ?? null,
    totalMensagens: Number(row.total_mensagens ?? row.totalMensagens ?? 0),
    documentosPendentes: Number(row.documentos_pendentes ?? row.documentosPendentes ?? 0),
    ultimaMensagem: row.ultima_mensagem ?? row.ultimaMensagem ?? null,
  }
}

function rowMessage(row: any): ConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id ?? row.conversationId,
    instanceName: row.instance_name ?? row.instanceName,
    providerMessageId: row.provider_message_id ?? row.providerMessageId ?? null,
    direction: row.direction,
    type: row.type,
    status: row.status,
    text: row.text ?? null,
    transcription: row.transcription ?? null,
    mediaUrl: row.media_url ?? row.mediaUrl ?? null,
    mediaMime: row.media_mime ?? row.mediaMime ?? null,
    mediaFilename: row.media_filename ?? row.mediaFilename ?? null,
    mediaStorageKey: row.media_storage_key ?? row.mediaStorageKey ?? null,
    fromNumber: row.from_number ?? row.fromNumber ?? null,
    toNumber: row.to_number ?? row.toNumber ?? null,
    timestamp: row.timestamp?.toISOString?.() ?? row.timestamp,
    criadoEm: (row.criado_em ?? row.criadoEm)?.toISOString?.() ?? row.criado_em ?? row.criadoEm ?? null,
  }
}

function rowDocument(row: any): ConversationDocument {
  return {
    id: row.id,
    conversationId: row.conversation_id ?? row.conversationId,
    clienteId: row.cliente_id ?? row.clienteId ?? null,
    messageId: row.message_id ?? row.messageId ?? null,
    filename: row.filename,
    mimeType: row.mime_type ?? row.mimeType ?? null,
    storageProvider: row.storage_provider ?? row.storageProvider,
    storageKey: row.storage_key ?? row.storageKey,
    sha256: row.sha256 ?? null,
    categoria: row.categoria,
    status: row.status,
    resumoIa: row.resumo_ia ?? row.resumoIa ?? null,
    criadoEm: (row.criado_em ?? row.criadoEm)?.toISOString?.() ?? row.criado_em ?? row.criadoEm ?? null,
  }
}

export class ConversationStateService {
  private filePath: string

  constructor(filePath = join(process.cwd(), 'storage', 'whatsapp-state', 'state.json')) {
    this.filePath = filePath
  }

  private readLocal(): LocalState {
    const empty: LocalState = {
      conversations: [],
      messages: [],
      documents: [],
      eligibility: [],
      webhookEvents: [],
      calendarEvents: [],
      outbox: [],
      mediaFiles: [],
      auditLogs: [],
      contacts: [],
      documentRequests: [],
      eligibilityResults: [],
      bookingOptions: [],
      bookings: [],
    }
    if (!existsSync(this.filePath)) {
      return empty
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<LocalState>
      return { ...empty, ...parsed }
    } catch (error) {
      throw new Error('Estado local do WhatsApp ilegível; recuperação necessária antes de gravar.', { cause: error })
    }
  }

  private writeLocal(state: LocalState): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.${randomUUID()}.tmp`
    let descriptor: number | undefined
    try {
      descriptor = openSync(temporary, 'wx')
      writeFileSync(descriptor, JSON.stringify(state))
      fsyncSync(descriptor)
      closeSync(descriptor); descriptor = undefined
      renameSync(temporary, this.filePath)
      descriptor = openSync(dirname(this.filePath), 'r')
      fsyncSync(descriptor)
    } finally {
      if (descriptor !== undefined) closeSync(descriptor)
      if (existsSync(temporary)) unlinkSync(temporary)
    }
  }

  /** Uma execução por vez preserva a ordem mesmo com mais de uma instância da API. */
  async withWebhookWorkerLock(run: () => Promise<void>): Promise<void> {
    if (isPgEnabled()) {
      const client = await getPool().connect()
      let locked = false
      try {
        const result = await client.query("SELECT pg_try_advisory_lock(hashtext('aletis-whatsapp-inbox')) AS locked")
        locked = result.rows[0]?.locked === true
        if (locked) await run()
      } finally {
        if (locked) await client.query("SELECT pg_advisory_unlock(hashtext('aletis-whatsapp-inbox'))").catch(() => undefined)
        client.release()
      }
      return
    }
    mkdirSync(dirname(this.filePath), { recursive: true })
    const lockPath = `${this.filePath}.worker.lock`
    if (existsSync(lockPath)) {
      const pid = Number(readFileSync(lockPath, 'utf8'))
      try { process.kill(pid, 0); return } catch { unlinkSync(lockPath) }
    }
    let descriptor: number
    try { descriptor = openSync(lockPath, 'wx') } catch { return }
    writeFileSync(descriptor, String(process.pid))
    try { await run() } finally { closeSync(descriptor); unlinkSync(lockPath) }
  }

  private async dbQuery<T = any>(sql: string, values: unknown[] = []): Promise<T[]> {
    if (!isPgEnabled()) throw new Error('PG disabled')
    const res = await getPool().query(sql, values)
    return res.rows as T[]
  }

  async recordWebhookEvent(input: {
    id: string
    instanceName: string
    eventType: string
    providerMessageId?: string
    payload: Record<string, unknown>
  }): Promise<{ inserted: boolean }> {
    let inserted: boolean | undefined
    if (isPgEnabled()) {
      try {
        const rows = await this.dbQuery(
          `INSERT INTO whatsapp_webhook_event
            (id, instance_name, event_type, provider_message_id, status, payload)
           VALUES ($1, $2, $3, $4, 'received', $5::jsonb)
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
          [input.id, input.instanceName, input.eventType, input.providerMessageId ?? null, JSON.stringify(input.payload)],
        )
        inserted = rows.length > 0
        if (!inserted) return { inserted: false }
      } catch (err) {
        console.warn('[WhatsAppState] recordWebhookEvent PG fallback:', (err as Error).message)
      }
    }

    const state = this.readLocal()
    if (state.webhookEvents.some((e) => e.id === input.id)) return { inserted: false }
    state.webhookEvents.push({ ...input, status: 'received', recebidoEm: nowIso() })
    this.writeLocal(state)
    return { inserted: true }
  }

  async getWebhookEvent(id: string): Promise<Record<string, any> | undefined> {
    if (isPgEnabled()) {
      const rows = await this.dbQuery('SELECT * FROM whatsapp_webhook_event WHERE id = $1', [id])
      if (rows[0]) return rows[0]
    }
    return this.readLocal().webhookEvents.find((event) => event.id === id)
  }

  async listPendingWebhookEvents(limit = 20): Promise<Array<Record<string, any>>> {
    const local = this.readLocal().webhookEvents
      .filter((event) => ['received', 'processing', 'prepared'].includes(event.status) && event.payload?.__aletisQueue?.version === 1)
    const merged = new Map(local.map((event) => [event.id, event]))
    if (isPgEnabled()) {
      const rows = await this.dbQuery("SELECT * FROM whatsapp_webhook_event WHERE status IN ('received','processing','prepared') AND payload->'__aletisQueue'->>'version' = '1' ORDER BY recebido_em LIMIT $1", [limit])
      for (const row of rows) merged.set(row.id, row)
      // Terminais em PG prevalecem sobre eventual espelho local de outro momento.
      for (const id of local.map((event) => event.id)) {
        const row = await this.getWebhookEvent(id)
        if (row && !['received', 'processing', 'prepared'].includes(row.status)) merged.delete(id)
      }
    }
    return [...merged.values()].sort((a, b) => new Date(a.recebido_em || a.recebidoEm).getTime() - new Date(b.recebido_em || b.recebidoEm).getTime()).slice(0, limit)
  }

  async listWebhookQueueEvents(limit = 100): Promise<Array<Record<string, unknown>>> {
    const merged = new Map(this.readLocal().webhookEvents.filter((event) => event.payload?.__aletisQueue?.version === 1).map((event) => [event.id, event]))
    if (isPgEnabled()) {
      const rows = await this.dbQuery("SELECT * FROM whatsapp_webhook_event WHERE payload->'__aletisQueue'->>'version' = '1' ORDER BY recebido_em DESC LIMIT $1", [limit])
      for (const row of rows) merged.set(row.id, row)
    }
    return [...merged.values()].sort((a, b) => new Date(b.recebido_em || b.recebidoEm).getTime() - new Date(a.recebido_em || a.recebidoEm).getTime()).slice(0, limit).map((event) => {
      const work = event.payload.__aletisQueue
      const items = Array.isArray(work.items) ? work.items : []
      return {
        eventId: event.id, status: event.status, error: event.error || null, provider: work.provider,
        receivedAt: event.recebido_em || event.recebidoEm, updatedAt: event.processado_em || event.processadoEm,
        conversationIds: [...new Set(items.map((item: any) => item.conversationId).filter(Boolean))],
        totalMessages: items.length, completedMessages: items.filter((item: any) => item.phase === 'done').length,
        waitingReplies: items.reduce((sum: number, item: any) => sum + Math.max(0, (item.replies?.length || 0) - (item.nextReply || 0)), 0),
      }
    })
  }

  async saveWebhookWork(id: string, work: Record<string, unknown>, status: string, error?: string): Promise<void> {
    z.record(z.unknown()).parse(work)
    const original = await this.getWebhookEvent(id)
    if (!original) throw new Error('Evento de WhatsApp não encontrado para checkpoint')
    const payload = { ...original.payload, __aletisQueue: work }
    const local = this.readLocal()
    const row = { ...original, payload, status, error, processadoEm: nowIso() }
    const index = local.webhookEvents.findIndex((event) => event.id === id)
    if (index < 0) local.webhookEvents.push(row)
    else local.webhookEvents[index] = row
    this.writeLocal(local)
    if (isPgEnabled()) {
      await this.dbQuery(`INSERT INTO whatsapp_webhook_event (id, instance_name, event_type, provider_message_id, status, payload, error, processado_em)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,now()) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, payload = EXCLUDED.payload, error = EXCLUDED.error, processado_em = now()`,
      [id, original.instance_name || original.instanceName, original.event_type || original.eventType, original.provider_message_id || original.providerMessageId || null, status, JSON.stringify(payload), error || null])
    }
  }

  async markWebhookProcessed(id: string, status: 'processed' | 'ignored' | 'error', error?: string): Promise<void> {
    if (isPgEnabled()) {
      try {
        await this.dbQuery(
          `UPDATE whatsapp_webhook_event
             SET status = $2, error = $3, processado_em = now()
           WHERE id = $1`,
          [id, status, error ?? null],
        )
        return
      } catch (err) {
        console.warn('[WhatsAppState] markWebhookProcessed PG fallback:', (err as Error).message)
      }
    }
    const state = this.readLocal()
    const item = state.webhookEvents.find((e) => e.id === id)
    if (item) Object.assign(item, { status, error, processadoEm: nowIso() })
    this.writeLocal(state)
  }

  async upsertConversation(input: UpsertConversationInput): Promise<ConversationSummary> {
    const id = newId('wa_conv')
    const now = new Date()
    if (isPgEnabled()) {
      try {
        const rows = await this.dbQuery(
          `INSERT INTO whatsapp_conversation
            (id, instance_name, telefone, wa_jid, nome_contato, cliente_id, lead_id, ultima_mensagem_em, payload,
             crm_status, current_state, ai_enabled)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'Novo lead', 'new_lead', true)
           ON CONFLICT (instance_name, telefone) DO UPDATE SET
             wa_jid = COALESCE(EXCLUDED.wa_jid, whatsapp_conversation.wa_jid),
             nome_contato = COALESCE(EXCLUDED.nome_contato, whatsapp_conversation.nome_contato),
             cliente_id = COALESCE(EXCLUDED.cliente_id, whatsapp_conversation.cliente_id),
             lead_id = COALESCE(EXCLUDED.lead_id, whatsapp_conversation.lead_id),
             ultima_mensagem_em = GREATEST(COALESCE(whatsapp_conversation.ultima_mensagem_em, EXCLUDED.ultima_mensagem_em), EXCLUDED.ultima_mensagem_em),
             atualizado_em = now(),
             payload = whatsapp_conversation.payload || EXCLUDED.payload
           RETURNING *`,
          [
            id,
            input.instanceName,
            input.telefone,
            input.waJid ?? null,
            input.nomeContato ?? null,
            input.clienteId ?? null,
            input.leadId ?? null,
            now,
            JSON.stringify(input.payload || {}),
          ],
        )
        return rowConversation(rows[0])
      } catch (err) {
        console.warn('[WhatsAppState] upsertConversation PG fallback:', (err as Error).message)
      }
    }

    const state = this.readLocal()
    let conv = state.conversations.find((c) => c.instanceName === input.instanceName && c.telefone === input.telefone)
    if (!conv) {
      conv = {
        id,
        instanceName: input.instanceName,
        telefone: input.telefone,
        waJid: input.waJid,
        nomeContato: input.nomeContato,
        clienteId: input.clienteId,
        leadId: input.leadId,
        atendimentoModo: 'ia',
        status: 'aberta',
        etapa: 'boas_vindas',
        elegibilidadeStatus: 'em_coleta',
        crmStatus: 'Novo lead',
        currentState: 'new_lead',
        aiEnabled: true,
        eligibilityScore: 0,
        prioridade: 'normal',
        ultimaMensagemEm: now.toISOString(),
        criadoEm: now.toISOString(),
        atualizadoEm: now.toISOString(),
        totalMensagens: 0,
      }
      state.conversations.push(conv)
    } else {
      conv.nomeContato = input.nomeContato || conv.nomeContato
      conv.waJid = input.waJid || conv.waJid
      conv.ultimaMensagemEm = now.toISOString()
      conv.atualizadoEm = now.toISOString()
    }
    this.writeLocal(state)
    return conv
  }

  async updateConversation(id: string, patch: Partial<ConversationSummary> & { payload?: Record<string, unknown> }): Promise<void> {
    if (isPgEnabled()) {
      try {
        await this.dbQuery(
          `UPDATE whatsapp_conversation SET
             atendimento_modo = COALESCE($2, atendimento_modo),
             status = COALESCE($3, status),
             etapa = COALESCE($4, etapa),
             elegibilidade_status = COALESCE($5, elegibilidade_status),
             prioridade = COALESCE($6, prioridade),
             resumo = COALESCE($7, resumo),
             cliente_id = COALESCE($8, cliente_id),
             payload = payload || $9::jsonb,
             crm_status = COALESCE($10, crm_status),
             current_state = COALESCE($11, current_state),
             ai_enabled = COALESCE($12, ai_enabled),
             assigned_user_id = CASE WHEN $13 = '__NULL__' THEN NULL ELSE COALESCE($13, assigned_user_id) END,
             takeover_reason = CASE WHEN $14 = '__NULL__' THEN NULL ELSE COALESCE($14, takeover_reason) END,
             takeover_at = COALESCE($15, takeover_at),
             released_at = COALESCE($16, released_at),
             eligibility_score = COALESCE($17, eligibility_score),
             atualizado_em = now()
           WHERE id = $1`,
          [
            id,
            patch.atendimentoModo ?? null,
            patch.status ?? null,
            patch.etapa ?? null,
            patch.elegibilidadeStatus ?? null,
            patch.prioridade ?? null,
            patch.resumo ?? null,
            patch.clienteId ?? null,
            JSON.stringify(patch.payload || {}),
            patch.crmStatus ?? null,
            patch.currentState ?? null,
            patch.aiEnabled ?? null,
            patch.assignedUserId === null ? '__NULL__' : patch.assignedUserId ?? null,
            patch.takeoverReason === null ? '__NULL__' : patch.takeoverReason ?? null,
            patch.takeoverAt ? new Date(patch.takeoverAt) : null,
            patch.releasedAt ? new Date(patch.releasedAt) : null,
            patch.eligibilityScore ?? null,
          ],
        )
        if (patch.currentState || patch.crmStatus || patch.aiEnabled !== undefined) {
          await this.recordConversationState({
            conversationId: id,
            state: patch.currentState || patch.etapa || 'updated',
            crmStatus: patch.crmStatus || patch.status || 'Atualizado',
            aiEnabled: patch.aiEnabled ?? true,
            assignedUserId: patch.assignedUserId,
            takeoverReason: patch.takeoverReason,
            payload: patch.payload,
          })
        }
        return
      } catch (err) {
        console.warn('[WhatsAppState] updateConversation PG fallback:', (err as Error).message)
      }
    }
    const state = this.readLocal()
    const conv = state.conversations.find((c) => c.id === id)
    if (conv) Object.assign(conv, patch, { atualizadoEm: nowIso() })
    if (patch.currentState || patch.crmStatus || patch.aiEnabled !== undefined) {
      state.auditLogs.push({ id: newId('wa_audit'), conversationId: id, action: 'conversation_state_update', details: patch, criadoEm: nowIso() })
    }
    this.writeLocal(state)
  }

  async recordMessage(input: RecordMessageInput): Promise<{ inserted: boolean; message: ConversationMessage }> {
    const timestamp = input.timestamp || new Date()
    const id = input.providerMessageId
      ? `wa_msg_${input.instanceName}_${input.providerMessageId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180)
      : newId('wa_msg')

    if (isPgEnabled()) {
      try {
        const rows = await this.dbQuery(
          `INSERT INTO whatsapp_message
            (id, conversation_id, instance_name, provider_message_id, direction, type, status, text, transcription,
             media_url, media_mime, media_filename, media_storage_key, from_number, to_number, timestamp, processed_at, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),$17::jsonb)
           ON CONFLICT (instance_name, provider_message_id) DO NOTHING
           RETURNING *`,
          [
            id,
            input.conversationId,
            input.instanceName,
            input.providerMessageId ?? null,
            input.direction,
            input.type,
            input.status || (input.direction === 'outbound' ? 'sent' : 'received'),
            input.text ?? null,
            input.transcription ?? null,
            input.mediaUrl ?? null,
            input.mediaMime ?? null,
            input.mediaFilename ?? null,
            input.mediaStorageKey ?? null,
            input.fromNumber ?? null,
            input.toNumber ?? null,
            timestamp,
            JSON.stringify(input.payload || {}),
          ],
        )
        await this.dbQuery(
          `UPDATE whatsapp_conversation
             SET ultima_mensagem_em = GREATEST(COALESCE(ultima_mensagem_em, $2), $2),
                 atualizado_em = now()
           WHERE id = $1`,
          [input.conversationId, timestamp],
        )
        if (rows[0]) return { inserted: true, message: rowMessage(rows[0]) }
        const existing = await this.dbQuery(
          `SELECT * FROM whatsapp_message WHERE instance_name = $1 AND provider_message_id = $2 LIMIT 1`,
          [input.instanceName, input.providerMessageId ?? null],
        )
        return { inserted: false, message: rowMessage(existing[0]) }
      } catch (err) {
        console.warn('[WhatsAppState] recordMessage PG fallback:', (err as Error).message)
      }
    }

    const state = this.readLocal()
    const existing = input.providerMessageId
      ? state.messages.find((m) => m.instanceName === input.instanceName && m.providerMessageId === input.providerMessageId)
      : undefined
    if (existing) return { inserted: false, message: existing }
    const message: ConversationMessage = {
      id,
      conversationId: input.conversationId,
      instanceName: input.instanceName,
      providerMessageId: input.providerMessageId || null,
      direction: input.direction,
      type: input.type,
      status: input.status || (input.direction === 'outbound' ? 'sent' : 'received'),
      text: input.text || null,
      transcription: input.transcription || null,
      mediaUrl: input.mediaUrl || null,
      mediaMime: input.mediaMime || null,
      mediaFilename: input.mediaFilename || null,
      mediaStorageKey: input.mediaStorageKey || null,
      fromNumber: input.fromNumber || null,
      toNumber: input.toNumber || null,
      timestamp: timestamp.toISOString(),
      criadoEm: nowIso(),
    }
    state.messages.push(message)
    const conv = state.conversations.find((c) => c.id === input.conversationId)
    if (conv) {
      conv.ultimaMensagemEm = message.timestamp
      conv.atualizadoEm = nowIso()
      conv.totalMensagens = (conv.totalMensagens || 0) + 1
      conv.ultimaMensagem = message.text || message.mediaFilename || message.type
    }
    this.writeLocal(state)
    return { inserted: true, message }
  }

  async listConversations(limit = 80, search = ''): Promise<ConversationSummary[]> {
    if (isPgEnabled()) {
      try {
        const term = `%${search.trim()}%`
        const rows = await this.dbQuery(
          `SELECT c.*,
                  COUNT(m.id)::int AS total_mensagens,
                  COUNT(d.id) FILTER (WHERE d.status <> 'aprovado')::int AS documentos_pendentes,
                  (
                    SELECT COALESCE(NULLIF(mm.text, ''), mm.media_filename, mm.type)
                    FROM whatsapp_message mm
                    WHERE mm.conversation_id = c.id
                    ORDER BY mm.timestamp DESC
                    LIMIT 1
                  ) AS ultima_mensagem
             FROM whatsapp_conversation c
             LEFT JOIN whatsapp_message m ON m.conversation_id = c.id
             LEFT JOIN whatsapp_document d ON d.conversation_id = c.id
            WHERE ($2 = '' OR c.telefone ILIKE $3 OR c.nome_contato ILIKE $3 OR c.resumo ILIKE $3)
            GROUP BY c.id
            ORDER BY COALESCE(c.ultima_mensagem_em, c.atualizado_em) DESC
            LIMIT $1`,
          [limit, search.trim(), term],
        )
        return rows.map(rowConversation)
      } catch (err) {
        console.warn('[WhatsAppState] listConversations PG fallback:', (err as Error).message)
      }
    }
    const q = search.toLowerCase()
    const state = this.readLocal()
    return state.conversations
      .filter((c) => !q || `${c.telefone} ${c.nomeContato || ''} ${c.resumo || ''}`.toLowerCase().includes(q))
      .sort((a, b) => String(b.ultimaMensagemEm || '').localeCompare(String(a.ultimaMensagemEm || '')))
      .slice(0, limit)
  }

  async getConversationBundle(id: string): Promise<{
    conversation?: ConversationSummary
    messages: ConversationMessage[]
    documents: ConversationDocument[]
    eligibility: Array<Record<string, any>>
    calendarEvents: Array<Record<string, any>>
  }> {
    if (isPgEnabled()) {
      try {
        const [convRows, msgRows, docRows, eligibilityRows, calendarRows] = await Promise.all([
          this.dbQuery('SELECT * FROM whatsapp_conversation WHERE id = $1 LIMIT 1', [id]),
          this.dbQuery('SELECT * FROM whatsapp_message WHERE conversation_id = $1 ORDER BY timestamp ASC LIMIT 500', [id]),
          this.dbQuery('SELECT * FROM whatsapp_document WHERE conversation_id = $1 ORDER BY criado_em DESC LIMIT 100', [id]),
          this.dbQuery('SELECT * FROM whatsapp_eligibility_answer WHERE conversation_id = $1 ORDER BY criado_em ASC', [id]),
          this.dbQuery('SELECT * FROM whatsapp_calendar_event WHERE conversation_id = $1 ORDER BY start_at DESC LIMIT 20', [id]),
        ])
        return {
          conversation: convRows[0] ? rowConversation(convRows[0]) : undefined,
          messages: msgRows.map(rowMessage),
          documents: docRows.map(rowDocument),
          eligibility: eligibilityRows,
          calendarEvents: calendarRows,
        }
      } catch (err) {
        console.warn('[WhatsAppState] getConversationBundle PG fallback:', (err as Error).message)
      }
    }
    const state = this.readLocal()
    return {
      conversation: state.conversations.find((c) => c.id === id),
      messages: state.messages.filter((m) => m.conversationId === id).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      documents: state.documents.filter((d) => d.conversationId === id),
      eligibility: state.eligibility.filter((e) => e.conversationId === id),
      calendarEvents: state.calendarEvents.filter((e) => e.conversationId === id),
    }
  }

  async saveEligibilityAnswer(input: {
    conversationId: string
    questionKey: string
    questionText: string
    answerText: string
    answerValue: Record<string, unknown>
    score: number
    payload?: Record<string, unknown>
  }): Promise<void> {
    if (isPgEnabled()) {
      try {
        await this.dbQuery(
          `INSERT INTO whatsapp_eligibility_answer
            (id, conversation_id, question_key, question_text, answer_text, answer_value, score, payload)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb)
           ON CONFLICT (conversation_id, question_key) DO UPDATE SET
             answer_text = EXCLUDED.answer_text,
             answer_value = EXCLUDED.answer_value,
             score = EXCLUDED.score,
             payload = whatsapp_eligibility_answer.payload || EXCLUDED.payload`,
          [
            newId('wa_elg'),
            input.conversationId,
            input.questionKey,
            input.questionText,
            input.answerText,
            JSON.stringify(input.answerValue),
            input.score,
            JSON.stringify(input.payload || {}),
          ],
        )
        return
      } catch (err) {
        console.warn('[WhatsAppState] saveEligibilityAnswer PG fallback:', (err as Error).message)
      }
    }
    const state = this.readLocal()
    const idx = state.eligibility.findIndex((e) => e.conversationId === input.conversationId && e.questionKey === input.questionKey)
    const row = { id: newId('wa_elg'), ...input, criadoEm: nowIso() }
    if (idx >= 0) state.eligibility[idx] = { ...state.eligibility[idx], ...row }
    else state.eligibility.push(row)
    this.writeLocal(state)
  }

  async saveDocument(input: {
    conversationId: string
    clienteId?: string | null
    messageId?: string | null
    filename: string
    mimeType?: string | null
    storageProvider: string
    storageKey: string
    sha256?: string | null
    categoria: string
    status?: string
    resumoIa?: string
    classification?: Record<string, unknown>
    payload?: Record<string, unknown>
  }): Promise<ConversationDocument> {
    const id = newId('wa_doc')
    if (isPgEnabled()) {
      try {
        const rows = await this.dbQuery(
          `INSERT INTO whatsapp_document
            (id, conversation_id, cliente_id, message_id, filename, mime_type, storage_provider, storage_key,
             sha256, categoria, status, resumo_ia, classification, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb)
           RETURNING *`,
          [
            id,
            input.conversationId,
            input.clienteId ?? null,
            input.messageId ?? null,
            input.filename,
            input.mimeType ?? null,
            input.storageProvider,
            input.storageKey,
            input.sha256 ?? null,
            input.categoria,
            input.status || 'recebido',
            input.resumoIa ?? null,
            JSON.stringify(input.classification || {}),
            JSON.stringify(input.payload || {}),
          ],
        )
        return rowDocument(rows[0])
      } catch (err) {
        console.warn('[WhatsAppState] saveDocument PG fallback:', (err as Error).message)
      }
    }
    const state = this.readLocal()
    const doc: ConversationDocument = {
      id,
      conversationId: input.conversationId,
      clienteId: input.clienteId ?? null,
      messageId: input.messageId ?? null,
      filename: input.filename,
      mimeType: input.mimeType ?? null,
      storageProvider: input.storageProvider,
      storageKey: input.storageKey,
      sha256: input.sha256 ?? null,
      categoria: input.categoria,
      status: input.status || 'recebido',
      resumoIa: input.resumoIa ?? null,
      criadoEm: nowIso(),
    }
    state.documents.push(doc)
    this.writeLocal(state)
    return doc
  }

  async listDocuments(limit = 200): Promise<ConversationDocument[]> {
    if (isPgEnabled()) {
      try {
        const rows = await this.dbQuery(
          'SELECT * FROM whatsapp_document ORDER BY criado_em DESC LIMIT $1',
          [limit],
        )
        return rows.map(rowDocument)
      } catch (err) {
        console.warn('[WhatsAppState] listDocuments PG fallback:', (err as Error).message)
      }
    }
    return this.readLocal().documents.slice(-limit).reverse()
  }

  async createCalendarEvent(input: Record<string, any>): Promise<void> {
    if (isPgEnabled()) {
      try {
        await this.dbQuery(
          `INSERT INTO whatsapp_calendar_event
            (id, conversation_id, cliente_id, consultor, calendar_id, external_event_id, status,
             start_at, end_at, timezone, titulo, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
          [
            input.id || newId('wa_cal'),
            input.conversationId,
            input.clienteId ?? null,
            input.consultor || 'Christian',
            input.calendarId ?? null,
            input.externalEventId ?? null,
            input.status || 'dry_run',
            new Date(input.startAt),
            new Date(input.endAt),
            input.timezone || 'America/Cuiaba',
            input.titulo || 'Reuniao ALETIS',
            JSON.stringify(input.payload || {}),
          ],
        )
        return
      } catch (err) {
        console.warn('[WhatsAppState] createCalendarEvent PG fallback:', (err as Error).message)
      }
    }
    const state = this.readLocal()
    state.calendarEvents.push({ id: input.id || newId('wa_cal'), ...input, criadoEm: nowIso() })
    this.writeLocal(state)
  }

  async recordConversationState(input: {
    conversationId: string
    state: string
    crmStatus: string
    aiEnabled: boolean
    assignedUserId?: string | null
    takeoverReason?: string | null
    payload?: Record<string, unknown>
  }): Promise<void> {
    if (isPgEnabled()) {
      try {
        await this.dbQuery(
          `INSERT INTO whatsapp_conversation_state
            (id, conversation_id, state, crm_status, ai_enabled, assigned_user_id, takeover_reason, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
          [
            newId('wa_state'),
            input.conversationId,
            input.state,
            input.crmStatus,
            input.aiEnabled,
            input.assignedUserId ?? null,
            input.takeoverReason ?? null,
            JSON.stringify(input.payload || {}),
          ],
        )
        return
      } catch (err) {
        console.warn('[WhatsAppState] recordConversationState PG fallback:', (err as Error).message)
      }
    }
    const state = this.readLocal()
    state.auditLogs.push({ id: newId('wa_state'), action: 'conversation_state', ...input, criadoEm: nowIso() })
    this.writeLocal(state)
  }

  async audit(input: {
    conversationId?: string | null
    instanceName?: string | null
    action: string
    actor?: string
    level?: 'info' | 'warn' | 'error'
    details?: Record<string, unknown>
  }): Promise<void> {
    if (isPgEnabled()) {
      try {
        await this.dbQuery(
          `INSERT INTO whatsapp_audit_log
            (conversation_id, instance_name, action, actor, level, details)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
          [
            input.conversationId ?? null,
            input.instanceName ?? null,
            input.action,
            input.actor || 'system',
            input.level || 'info',
            JSON.stringify(input.details || {}),
          ],
        )
        return
      } catch (err) {
        console.warn('[WhatsAppState] audit PG fallback:', (err as Error).message)
      }
    }
    const state = this.readLocal()
    state.auditLogs.push({ id: newId('wa_audit'), ...input, criadoEm: nowIso() })
    this.writeLocal(state)
  }

  async upsertContact(input: {
    instanceName: string
    telefone: string
    waJid?: string | null
    nomeContato?: string | null
    clienteId?: string | null
    leadId?: string | null
    payload?: Record<string, unknown>
  }): Promise<void> {
    if (isPgEnabled()) {
      try {
        await this.dbQuery(
          `INSERT INTO whatsapp_contact
            (id, instance_name, telefone, wa_jid, nome_contato, cliente_id, lead_id, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
           ON CONFLICT (instance_name, telefone) DO UPDATE SET
             wa_jid = COALESCE(EXCLUDED.wa_jid, whatsapp_contact.wa_jid),
             nome_contato = COALESCE(EXCLUDED.nome_contato, whatsapp_contact.nome_contato),
             cliente_id = COALESCE(EXCLUDED.cliente_id, whatsapp_contact.cliente_id),
             lead_id = COALESCE(EXCLUDED.lead_id, whatsapp_contact.lead_id),
             payload = whatsapp_contact.payload || EXCLUDED.payload,
             atualizado_em = now()`,
          [
            newId('wa_contact'),
            input.instanceName,
            input.telefone,
            input.waJid ?? null,
            input.nomeContato ?? null,
            input.clienteId ?? null,
            input.leadId ?? null,
            JSON.stringify(input.payload || {}),
          ],
        )
        return
      } catch (err) {
        console.warn('[WhatsAppState] upsertContact PG fallback:', (err as Error).message)
      }
    }
    const state = this.readLocal()
    const idx = state.contacts.findIndex((c) => c.instanceName === input.instanceName && c.telefone === input.telefone)
    const row = { id: idx >= 0 ? state.contacts[idx].id : newId('wa_contact'), ...input, atualizadoEm: nowIso() }
    if (idx >= 0) state.contacts[idx] = { ...state.contacts[idx], ...row }
    else state.contacts.push({ ...row, criadoEm: nowIso() })
    this.writeLocal(state)
  }

  async saveMediaFile(input: {
    conversationId: string
    messageId?: string | null
    providerMediaId?: string | null
    mediaType: string
    mimeType?: string | null
    filename: string
    storageProvider: string
    storageKey: string
    sha256?: string | null
    sizeBytes?: number | null
    payload?: Record<string, unknown>
  }): Promise<string> {
    const id = newId('wa_media')
    if (isPgEnabled()) {
      try {
        await this.dbQuery(
          `INSERT INTO whatsapp_media_file
            (id, conversation_id, message_id, provider_media_id, media_type, mime_type, filename,
             storage_provider, storage_key, sha256, size_bytes, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
          [
            id,
            input.conversationId,
            input.messageId ?? null,
            input.providerMediaId ?? null,
            input.mediaType,
            input.mimeType ?? null,
            input.filename,
            input.storageProvider,
            input.storageKey,
            input.sha256 ?? null,
            input.sizeBytes ?? null,
            JSON.stringify(input.payload || {}),
          ],
        )
        return id
      } catch (err) {
        console.warn('[WhatsAppState] saveMediaFile PG fallback:', (err as Error).message)
      }
    }
    const state = this.readLocal()
    state.mediaFiles.push({ id, ...input, criadoEm: nowIso() })
    this.writeLocal(state)
    return id
  }

  async createOutbox(input: {
    id?: string
    conversationId?: string | null
    instanceName: string
    toNumber: string
    messageType?: string
    content?: string | null
    mediaStorageKey?: string | null
    payload?: Record<string, unknown>
  }): Promise<string> {
    const id = input.id || newId('wa_out')
    const state = this.readLocal()
    if (!state.outbox.some((item) => item.id === id)) {
      state.outbox.push({ ...input, id, status: 'queued', attempt: 0, queuedAt: nowIso() })
      this.writeLocal(state)
    }
    if (isPgEnabled()) {
        await this.dbQuery(
          `INSERT INTO whatsapp_outbox
            (id, conversation_id, instance_name, to_number, message_type, content, media_storage_key, status, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',$8::jsonb) ON CONFLICT (id) DO NOTHING`,
          [
            id,
            input.conversationId ?? null,
            input.instanceName,
            input.toNumber,
            input.messageType || 'text',
            input.content ?? null,
            input.mediaStorageKey ?? null,
            JSON.stringify(input.payload || {}),
          ],
        )
    }
    return id
  }

  async getOutbox(id: string): Promise<Record<string, any> | undefined> {
    if (isPgEnabled()) {
      const rows = await this.dbQuery('SELECT * FROM whatsapp_outbox WHERE id = $1', [id])
      if (rows[0]) return rows[0]
    }
    return this.readLocal().outbox.find((item) => item.id === id)
  }

  async claimOutboxForSend(id: string): Promise<boolean> {
    let claimed: Record<string, any> | undefined
    if (isPgEnabled()) {
      const rows = await this.dbQuery(`UPDATE whatsapp_outbox SET status = 'sending', attempt = attempt + 1, atualizado_em = now()
        WHERE id = $1 AND attempt < 3 AND (status = 'queued' OR (status = 'failed' AND payload->>'retryable' = 'true')) RETURNING *`, [id])
      if (!rows[0]) return false
      claimed = rows[0]
    }
    const state = this.readLocal()
    const index = state.outbox.findIndex((item) => item.id === id)
    if (!claimed) {
      const row = state.outbox[index]
      if (!row || Number(row.attempt || 0) >= 3 || !(row.status === 'queued' || (row.status === 'failed' && row.payload?.retryable === true))) return false
      claimed = { ...row, status: 'sending', attempt: Number(row.attempt || 0) + 1, atualizadoEm: nowIso() }
    }
    if (index < 0) state.outbox.push(claimed)
    else state.outbox[index] = claimed
    this.writeLocal(state)
    return true
  }

  async updateOutbox(id: string, patch: {
    status: 'queued' | 'sending' | 'sent' | 'failed' | 'dry_run' | 'uncertain' | 'cancelled'
    providerMessageId?: string | null
    error?: string | null
    payload?: Record<string, unknown>
  }): Promise<void> {
    const original = await this.getOutbox(id)
    if (!original) throw new Error('Saída WhatsApp não encontrada')
    const state = this.readLocal()
    const index = state.outbox.findIndex((item) => item.id === id)
    const updated = { ...original, ...patch, payload: { ...original.payload, ...patch.payload }, attempt: Number(original.attempt || 0) + (patch.status === 'sending' ? 1 : 0), atualizadoEm: nowIso() }
    if (index < 0) state.outbox.push(updated)
    else state.outbox[index] = updated
    this.writeLocal(state)
    if (isPgEnabled()) {
        await this.dbQuery(
          `UPDATE whatsapp_outbox SET
             status = $2,
             provider_message_id = COALESCE($3, provider_message_id),
             error = $4,
             attempt = attempt + CASE WHEN $2 = 'sending' THEN 1 ELSE 0 END,
             sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END,
             payload = payload || $5::jsonb,
             atualizado_em = now()
           WHERE id = $1`,
          [id, patch.status, patch.providerMessageId ?? null, patch.error ?? null, JSON.stringify(patch.payload || {})],
        )
    }
  }

  async saveEligibilityResult(input: {
    conversationId: string
    checklistId?: string
    score: number
    maxScore: number
    result: string
    reasons: string[]
    payload?: Record<string, unknown>
  }): Promise<void> {
    const checklistId = input.checklistId || 'whatsapp-default-v1'
    if (isPgEnabled()) {
      try {
        await this.dbQuery(
          `INSERT INTO eligibility_result
            (id, conversation_id, checklist_id, score, max_score, result, reasons, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
           ON CONFLICT (conversation_id, checklist_id) DO UPDATE SET
             score = EXCLUDED.score,
             max_score = EXCLUDED.max_score,
             result = EXCLUDED.result,
             reasons = EXCLUDED.reasons,
             payload = eligibility_result.payload || EXCLUDED.payload,
             atualizado_em = now()`,
          [
            newId('wa_elg_result'),
            input.conversationId,
            checklistId,
            input.score,
            input.maxScore,
            input.result,
            input.reasons,
            JSON.stringify(input.payload || {}),
          ],
        )
        return
      } catch (err) {
        console.warn('[WhatsAppState] saveEligibilityResult PG fallback:', (err as Error).message)
      }
    }
    const state = this.readLocal()
    const idx = state.eligibilityResults.findIndex((r) => r.conversationId === input.conversationId && r.checklistId === checklistId)
    const row = { id: idx >= 0 ? state.eligibilityResults[idx].id : newId('wa_elg_result'), ...input, checklistId, atualizadoEm: nowIso() }
    if (idx >= 0) state.eligibilityResults[idx] = { ...state.eligibilityResults[idx], ...row }
    else state.eligibilityResults.push({ ...row, criadoEm: nowIso() })
    this.writeLocal(state)
  }

  async upsertDocumentRequests(input: {
    conversationId: string
    clienteId?: string | null
    requests: Array<{ key: string; label: string; status?: string }>
  }): Promise<void> {
    if (isPgEnabled()) {
      for (const req of input.requests) {
        try {
          await this.dbQuery(
            `INSERT INTO whatsapp_document_request
              (id, conversation_id, cliente_id, document_key, label, status)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (conversation_id, document_key) DO UPDATE SET
               status = EXCLUDED.status,
               received_at = CASE WHEN EXCLUDED.status = 'recebido' THEN now() ELSE whatsapp_document_request.received_at END`,
            [newId('wa_doc_req'), input.conversationId, input.clienteId ?? null, req.key, req.label, req.status || 'pendente'],
          )
        } catch (err) {
          console.warn('[WhatsAppState] upsertDocumentRequests PG fallback:', (err as Error).message)
          break
        }
      }
    }
    const state = this.readLocal()
    for (const req of input.requests) {
      const idx = state.documentRequests.findIndex((r) => r.conversationId === input.conversationId && r.documentKey === req.key)
      const row = {
        id: idx >= 0 ? state.documentRequests[idx].id : newId('wa_doc_req'),
        conversationId: input.conversationId,
        clienteId: input.clienteId ?? null,
        documentKey: req.key,
        label: req.label,
        status: req.status || 'pendente',
        atualizadoEm: nowIso(),
      }
      if (idx >= 0) state.documentRequests[idx] = { ...state.documentRequests[idx], ...row }
      else state.documentRequests.push({ ...row, criadoEm: nowIso() })
    }
    this.writeLocal(state)
  }

  async saveBookingOptions(conversationId: string, candidates: CalendarSlot[]): Promise<CalendarSlot[]> {
    const offeredAt = nowIso()
    // A chave pertence à oferta/conversa, e não ao horário global da agenda.
    const slots = z.array(calendarSlotSchema).parse(candidates).map((slot) => ({ ...slot, sourceSlotId: slot.id, id: newId('wa_option') }))
    const state = this.readLocal()
    state.bookingOptions = state.bookingOptions.filter((o) => o.conversationId !== conversationId || o.status !== 'offered')
    state.bookingOptions.push({ id: newId('wa_booking_options'), conversationId, slots, criadoEm: offeredAt, status: 'offered' })
    this.writeLocal(state)
    if (isPgEnabled()) {
      const client = await getPool().connect().catch(() => null)
      try {
        if (!client) throw new Error('Conexão de agenda indisponível')
        await client.query('BEGIN')
        await client.query('UPDATE whatsapp_calendar_booking_option SET status = $2 WHERE conversation_id = $1 AND status = $3', [conversationId, 'expired', 'offered'])
        for (let i = 0; i < slots.length; i++) {
          const s = slots[i]
          await client.query(
            `INSERT INTO whatsapp_calendar_booking_option
              (id, conversation_id, option_number, start_at, end_at, label, status, payload)
             VALUES ($1,$2,$3,$4,$5,$6,'offered',$7::jsonb)`,
            [s.id, conversationId, i + 1, new Date(s.start), new Date(s.end), s.label, JSON.stringify(calendarSlotSchema.parse({ ...s, offeredAt }))],
          )
        }
        await client.query('COMMIT')
      } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => undefined)
        console.warn('[WhatsAppState] saveBookingOptions PG fallback:', (err as Error).message)
      } finally {
        client?.release()
      }
    }
    return slots
  }

  async getBookingOptions(conversationId: string): Promise<CalendarSlot[]> {
    const state = this.readLocal()
    const local = [...state.bookingOptions].reverse().find((option) => option.conversationId === conversationId && option.status === 'offered')
    let slots: CalendarSlot[] = local?.slots || []
    let offeredAt = local?.criadoEm || ''
    if (isPgEnabled()) {
      try {
        const rows = await this.dbQuery(
          `SELECT id, start_at, end_at, label, payload, criado_em
           FROM whatsapp_calendar_booking_option WHERE conversation_id = $1 AND status = 'offered' ORDER BY option_number`,
          [conversationId],
        )
        const persistedAt = rows[0]?.payload?.offeredAt || rows[0]?.criado_em?.toISOString?.() || ''
        if (rows.length && (!local || persistedAt >= offeredAt)) {
          offeredAt = persistedAt
          slots = rows.map((row) => ({
            id: row.id, start: new Date(row.start_at).toISOString(), end: new Date(row.end_at).toISOString(), label: row.label,
          }))
        }
      } catch (err) {
        console.warn('[WhatsAppState] getBookingOptions local fallback:', (err as Error).message)
      }
    }
    if (!Number.isFinite(Date.parse(offeredAt)) || Date.now() - Date.parse(offeredAt) > 24 * 60 * 60_000) return []
    // Mantém a ordem original, inclusive de opção já expirada; nunca renumera uma escolha recebida.
    const parsed = z.array(calendarSlotSchema).safeParse(slots)
    return parsed.success ? parsed.data : []
  }

  async createBooking(input: {
    conversationId: string
    clienteId?: string | null
    optionId?: string | null
    calendarId?: string | null
    externalEventId?: string | null
    status: string
    startAt: string
    endAt: string
    summary: string
    description?: string
    payload?: Record<string, unknown>
  }): Promise<void> {
    if (isPgEnabled()) {
      try {
        await this.dbQuery(
          `INSERT INTO whatsapp_calendar_booking
            (id, conversation_id, cliente_id, option_id, calendar_id, external_event_id, status,
             start_at, end_at, summary, description, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
          [
            newId('wa_booking'),
            input.conversationId,
            input.clienteId ?? null,
            input.optionId ?? null,
            input.calendarId ?? null,
            input.externalEventId ?? null,
            input.status,
            new Date(input.startAt),
            new Date(input.endAt),
            input.summary,
            input.description ?? null,
            JSON.stringify(input.payload || {}),
          ],
        )
        return
      } catch (err) {
        console.warn('[WhatsAppState] createBooking PG fallback:', (err as Error).message)
      }
    }
    const state = this.readLocal()
    const row = { id: newId('wa_booking'), ...input, criadoEm: nowIso() }
    state.bookings.push(row)
    state.calendarEvents.push(row)
    this.writeLocal(state)
  }
}

let cached: ConversationStateService | null = null
export function getConversationStateService(): ConversationStateService {
  if (!cached) cached = new ConversationStateService()
  return cached
}
