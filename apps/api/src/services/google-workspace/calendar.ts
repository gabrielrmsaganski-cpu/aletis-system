import { randomUUID } from 'crypto'
import { and, desc, eq } from 'drizzle-orm'
import { getDb, isPgEnabled } from '../../db/client.js'
import { googleCalendarEvent, type GoogleCalendarEvent } from '../../db/schema.js'
import { getClientCoreService } from '../core/ClientCoreService.js'
import type { GoogleWorkspaceActor } from './schemas.js'
import { GOOGLE_SCOPES } from './schemas.js'
import { getGoogleWorkspaceAuditService } from './audit.js'
import { getGoogleWorkspaceClient } from './client.js'

const memoryEvents = new Map<string, GoogleCalendarEvent[]>()

function key(tenantId: string, clientId: string): string {
  return `${tenantId}:${clientId}`
}

function calendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID || 'primary'
}

function timezone(): string {
  return process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/Cuiaba'
}

function toDate(value: unknown): Date {
  const d = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(d.getTime())) throw new Error('Data/hora inválida para evento Google Calendar.')
  return d
}

function toPublic(row: GoogleCalendarEvent) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    clientId: row.clientId,
    googleEventId: row.googleEventId,
    title: row.title,
    description: row.description,
    startTime: row.startTime instanceof Date ? row.startTime.toISOString() : String(row.startTime),
    endTime: row.endTime instanceof Date ? row.endTime.toISOString() : row.endTime ? String(row.endTime) : null,
    attendees: row.attendees || [],
    eventUrl: row.eventUrl,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  }
}

async function save(row: GoogleCalendarEvent): Promise<GoogleCalendarEvent> {
  if (isPgEnabled()) {
    try {
      const [saved] = await getDb().insert(googleCalendarEvent).values(row as any).returning()
      return saved
    } catch {
      // fallback
    }
  }
  const list = memoryEvents.get(key(row.tenantId, row.clientId)) || []
  memoryEvents.set(key(row.tenantId, row.clientId), [row, ...list])
  return row
}

export class GoogleWorkspaceCalendarService {
  async listClientEvents(actor: GoogleWorkspaceActor, clientId: string): Promise<ReturnType<typeof toPublic>[]> {
    if (isPgEnabled()) {
      try {
        const rows = await getDb()
          .select()
          .from(googleCalendarEvent)
          .where(and(eq(googleCalendarEvent.tenantId, actor.tenantId), eq(googleCalendarEvent.clientId, clientId)))
          .orderBy(desc(googleCalendarEvent.startTime))
          .limit(200)
        return rows.map(toPublic)
      } catch {
        // fallback
      }
    }
    return (memoryEvents.get(key(actor.tenantId, clientId)) || []).map(toPublic)
  }

  async createEvent(input: {
    actor: GoogleWorkspaceActor
    clientId: string
    clienteNome: string
    title: string
    description?: string
    startTime: string
    endTime?: string
    attendees?: string[]
    createMeetLink?: boolean
  }): Promise<ReturnType<typeof toPublic>> {
    const start = toDate(input.startTime)
    const end = input.endTime ? toDate(input.endTime) : new Date(start.getTime() + 50 * 60_000)
    const requestId = `aletis-${randomUUID()}`
    const body: Record<string, unknown> = {
      summary: input.title,
      description: [
        input.description,
        '',
        `Cliente ALETIS: ${input.clienteNome}`,
        `Cliente ID: ${input.clientId}`,
      ].filter(Boolean).join('\n'),
      start: { dateTime: start.toISOString(), timeZone: timezone() },
      end: { dateTime: end.toISOString(), timeZone: timezone() },
      attendees: (input.attendees || []).filter(Boolean).map((email) => ({ email })),
    }
    if (input.createMeetLink || process.env.GOOGLE_CALENDAR_CREATE_MEET === 'true') {
      body.conferenceData = {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      }
    }

    const created = await getGoogleWorkspaceClient().googleFetch<{ id: string; htmlLink?: string; status?: string }>(
      input.actor,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId())}/events?conferenceDataVersion=1`,
      { method: 'POST', body: JSON.stringify(body) },
      GOOGLE_SCOPES.calendarEvents,
    )
    const row = await save({
      id: `gcal_${randomUUID()}`,
      tenantId: input.actor.tenantId,
      clientId: input.clientId,
      googleEventId: created.id,
      title: input.title,
      description: input.description || null,
      startTime: start,
      endTime: end,
      attendees: input.attendees || [],
      eventUrl: created.htmlLink || null,
      status: created.status || 'confirmed',
      createdBy: input.actor.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: { calendarId: calendarId(), createMeetLink: Boolean(input.createMeetLink) },
    } as GoogleCalendarEvent)

    await getClientCoreService().addMeeting(input.clientId, {
      titulo: input.title,
      descricao: input.description,
      startAt: start,
      endAt: end,
      consultorId: input.actor.userId,
      consultorNome: input.actor.userName,
      calendarProvider: 'google',
      externalEventId: created.id,
      metadata: { eventUrl: row.eventUrl },
    }, input.actor.userId)
    await getGoogleWorkspaceAuditService().record({
      actor: input.actor,
      action: 'google_calendar_event_created',
      resourceType: 'cliente',
      resourceId: input.clientId,
      googleResourceId: created.id,
      metadata: { title: input.title, startTime: start.toISOString() },
    })
    return toPublic(row)
  }

  async cancelEvent(actor: GoogleWorkspaceActor, googleEventId: string): Promise<void> {
    await getGoogleWorkspaceClient().googleFetch(
      actor,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId())}/events/${encodeURIComponent(googleEventId)}`,
      { method: 'DELETE' },
      GOOGLE_SCOPES.calendarEvents,
    )
    if (isPgEnabled()) {
      try {
        await getDb()
          .update(googleCalendarEvent)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(and(eq(googleCalendarEvent.tenantId, actor.tenantId), eq(googleCalendarEvent.googleEventId, googleEventId)))
      } catch {
        // fallback
      }
    }
    for (const [mapKey, list] of memoryEvents) {
      memoryEvents.set(mapKey, list.map((event) => event.googleEventId === googleEventId ? { ...event, status: 'cancelled', updatedAt: new Date() } : event))
    }
    await getGoogleWorkspaceAuditService().record({
      actor,
      action: 'google_calendar_event_cancelled',
      resourceType: 'calendar_event',
      googleResourceId: googleEventId,
    })
  }
}

let singleton: GoogleWorkspaceCalendarService | null = null

export function getGoogleWorkspaceCalendarService(): GoogleWorkspaceCalendarService {
  if (!singleton) singleton = new GoogleWorkspaceCalendarService()
  return singleton
}
