import { randomUUID } from 'crypto'
import { and, desc, eq } from 'drizzle-orm'
import { getDb, isPgEnabled } from '../../db/client.js'
import { googleEmailLog, type GoogleEmailLog } from '../../db/schema.js'
import { getClientCoreService } from '../core/ClientCoreService.js'
import type { GoogleWorkspaceActor } from './schemas.js'
import { GOOGLE_SCOPES } from './schemas.js'
import { getGoogleWorkspaceAuditService } from './audit.js'
import { getGoogleWorkspaceClient } from './client.js'

const memoryEmails = new Map<string, GoogleEmailLog[]>()

function key(tenantId: string, clientId: string): string {
  return `${tenantId}:${clientId}`
}

function encodeHeader(value: string): string {
  return /[^\x20-\x7E]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
    : value
}

function buildRawEmail(input: {
  from?: string | null
  to: string
  subject: string
  body: string
}): string {
  const lines = [
    input.from ? `From: ${input.from}` : '',
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.body,
  ].filter((line, index) => index > 5 || line !== '')
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url')
}

function toPublic(row: GoogleEmailLog) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    clientId: row.clientId,
    googleMessageId: row.googleMessageId,
    threadId: row.threadId,
    direction: row.direction,
    subject: row.subject,
    fromEmail: row.fromEmail,
    toEmail: row.toEmail,
    sentAt: row.sentAt instanceof Date ? row.sentAt.toISOString() : row.sentAt ? String(row.sentAt) : null,
    snippet: row.snippet,
    createdBy: row.createdBy,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  }
}

async function save(row: GoogleEmailLog): Promise<GoogleEmailLog> {
  if (isPgEnabled()) {
    try {
      const [saved] = await getDb().insert(googleEmailLog).values(row as any).returning()
      return saved
    } catch {
      // fallback
    }
  }
  const list = memoryEmails.get(key(row.tenantId, row.clientId)) || []
  memoryEmails.set(key(row.tenantId, row.clientId), [row, ...list])
  return row
}

export class GoogleGmailService {
  async listClientEmails(actor: GoogleWorkspaceActor, clientId: string): Promise<ReturnType<typeof toPublic>[]> {
    if (isPgEnabled()) {
      try {
        const rows = await getDb()
          .select()
          .from(googleEmailLog)
          .where(and(eq(googleEmailLog.tenantId, actor.tenantId), eq(googleEmailLog.clientId, clientId)))
          .orderBy(desc(googleEmailLog.createdAt))
          .limit(200)
        return rows.map(toPublic)
      } catch {
        // fallback
      }
    }
    return (memoryEmails.get(key(actor.tenantId, clientId)) || []).map(toPublic)
  }

  async send(input: {
    actor: GoogleWorkspaceActor
    clientId: string
    clienteNome: string
    to: string
    subject: string
    body: string
  }): Promise<ReturnType<typeof toPublic>> {
    if (!input.to.includes('@')) throw new Error('Destinatário inválido.')
    if (!input.subject.trim()) throw new Error('Assunto obrigatório.')
    if (!input.body.trim()) throw new Error('Corpo do e-mail obrigatório.')

    const status = await import('./tokenStore.js').then((m) => m.getGoogleTokenStore().get(input.actor))
    const from = status?.googleEmail || null
    const sent = await getGoogleWorkspaceClient().googleFetch<{ id: string; threadId?: string; labelIds?: string[] }>(
      input.actor,
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        body: JSON.stringify({
          raw: buildRawEmail({
            from,
            to: input.to,
            subject: input.subject,
            body: input.body,
          }),
        }),
      },
      GOOGLE_SCOPES.gmailSend,
    )
    const row = await save({
      id: `gmail_${randomUUID()}`,
      tenantId: input.actor.tenantId,
      clientId: input.clientId,
      googleMessageId: sent.id,
      threadId: sent.threadId || null,
      direction: 'outbound',
      subject: input.subject,
      fromEmail: from,
      toEmail: input.to,
      sentAt: new Date(),
      snippet: input.body.slice(0, 240),
      createdBy: input.actor.userId,
      createdAt: new Date(),
      metadata: { clienteNome: input.clienteNome },
    } as GoogleEmailLog)

    await getGoogleWorkspaceAuditService().record({
      actor: input.actor,
      action: 'gmail_message_sent',
      resourceType: 'cliente',
      resourceId: input.clientId,
      googleResourceId: sent.id,
      metadata: { to: input.to, subject: input.subject },
    })
    await getClientCoreService().addTimelineEvent(input.clientId, {
      eventType: 'gmail_message_sent',
      title: 'E-mail enviado pelo Google Workspace',
      description: `${input.subject} para ${input.to}`,
      source: 'google_workspace',
      sourceId: sent.id,
      metadata: { threadId: sent.threadId || null },
    }, input.actor.userId)
    return toPublic(row)
  }
}

let singleton: GoogleGmailService | null = null

export function getGoogleGmailService(): GoogleGmailService {
  if (!singleton) singleton = new GoogleGmailService()
  return singleton
}
