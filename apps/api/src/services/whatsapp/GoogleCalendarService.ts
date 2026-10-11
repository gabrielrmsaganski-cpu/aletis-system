import { createHash } from 'node:crypto'

export interface CalendarSlot {
  id: string
  start: string
  end: string
  label: string
}

export interface CalendarCreateResult {
  status: 'created' | 'dry_run'
  externalEventId?: string
  htmlLink?: string
  slot: CalendarSlot
}

export class CalendarUnavailableError extends Error {
  constructor(public readonly reason: 'unavailable' | 'conflict' | 'invalid_slot' | 'uncertain', message: string) {
    super(message)
    this.name = 'CalendarUnavailableError'
  }
}

function timezone(): string {
  return process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/Cuiaba'
}

function localParts(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute') }
}

function dateInZone(year: number, month: number, day: number, hour: number, minute: number, zone: string): Date | null {
  const target = Date.UTC(year, month - 1, day, hour, minute)
  let instant = target
  for (let attempt = 0; attempt < 4; attempt++) {
    const p = localParts(new Date(instant), zone)
    const delta = target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
    if (delta === 0) return new Date(instant)
    instant += delta
  }
  // Horário civil inexistente durante mudança de fuso não vira outra hora silenciosamente.
  return null
}

export function buildCandidateSlots(input: { now?: Date; days?: number; timeZone?: string; holidays?: string[] } = {}): CalendarSlot[] {
  const now = input.now || new Date()
  const zone = input.timeZone || timezone()
  const base = localParts(now, zone)
  const days = Math.min(30, Math.max(1, input.days || 7))
  const holidayDates = new Set(input.holidays || (process.env.GOOGLE_CALENDAR_HOLIDAYS || '').split(',').map((day) => day.trim()))
  const nationalHolidays = new Set(['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'])
  const slots: CalendarSlot[] = []
  const hours = [[9, 0], [10, 30], [14, 0], [15, 30]]
  let businessDays = 0
  for (let offset = 1; businessDays < days && offset < 90; offset++) {
    // Avança datas civis uma única vez; sábado e domingo não geram a mesma segunda.
    const date = new Date(Date.UTC(base.year, base.month - 1, base.day + offset))
    const isoDate = date.toISOString().slice(0, 10)
    if ([0, 6].includes(date.getUTCDay()) || nationalHolidays.has(isoDate.slice(5)) || holidayDates.has(isoDate)) continue
    businessDays++
    for (const [hour, minute] of hours) {
      const start = dateInZone(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour, minute, zone)
      if (!start || start.getTime() <= now.getTime() + 2 * 60 * 60 * 1000) continue
      slots.push({
        id: `slot_${start.toISOString()}`,
        start: start.toISOString(),
        end: new Date(start.getTime() + 50 * 60_000).toISOString(),
        label: new Intl.DateTimeFormat('pt-BR', {
          weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: zone,
        }).format(start),
      })
    }
  }
  return slots
}

function overlaps(slot: CalendarSlot, busy: Array<{ start: string; end: string }>): boolean {
  const start = new Date(slot.start).getTime()
  const end = new Date(slot.end).getTime()
  return busy.some((range) => start < new Date(range.end).getTime() && end > new Date(range.start).getTime())
}

export class GoogleCalendarService {
  isConfigured(): boolean {
    return process.env.GOOGLE_CALENDAR_ENABLED === 'true' && Boolean(process.env.GOOGLE_CALENDAR_ID) && Boolean(process.env.GOOGLE_OAUTH_ACCESS_TOKEN)
  }

  isDryRun(): boolean {
    return process.env.GOOGLE_CALENDAR_DRY_RUN !== 'false' || !this.isConfigured()
  }

  getConfigSummary() {
    return {
      configurado: this.isConfigured(), dryRun: this.isDryRun(),
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      consultor: process.env.GOOGLE_CALENDAR_CONSULTOR_NAME || 'Christian', timezone: timezone(),
    }
  }

  private async getBusy(timeMin: string, timeMax: string): Promise<Array<{ start: string; end: string }>> {
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'
    let response: Response
    try {
      response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST', signal: AbortSignal.timeout(12_000),
        headers: { Authorization: `Bearer ${process.env.GOOGLE_OAUTH_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeMin, timeMax, timeZone: timezone(), items: [{ id: calendarId }] }),
      })
    } catch {
      throw new CalendarUnavailableError('unavailable', 'Não foi possível consultar a disponibilidade da agenda.')
    }
    const data: any = await response.json().catch(() => null)
    const calendar = data?.calendars?.[calendarId]
    if (!response.ok || !calendar || calendar.errors?.length || !Array.isArray(calendar.busy)) {
      throw new CalendarUnavailableError('unavailable', 'A agenda não confirmou a disponibilidade dos horários.')
    }
    for (const range of calendar.busy) {
      const start = Date.parse(range?.start)
      const end = Date.parse(range?.end)
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        throw new CalendarUnavailableError('unavailable', 'A agenda retornou intervalos inválidos.')
      }
    }
    return calendar.busy
  }

  async listAvailableSlots(): Promise<CalendarSlot[]> {
    if (this.isDryRun()) return []
    let candidates: CalendarSlot[]
    try {
      candidates = buildCandidateSlots()
    } catch {
      throw new CalendarUnavailableError('unavailable', 'Não foi possível calcular os horários no fuso configurado.')
    }
    if (!candidates.length) return []
    const busy = await this.getBusy(candidates[0].start, candidates[candidates.length - 1].end)
    return candidates.filter((slot) => !overlaps(slot, busy)).slice(0, 6)
  }

  pickSlotFromText(text: string, slots: CalendarSlot[]): CalendarSlot | undefined {
    const clean = text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const ordinal = clean.match(/^(?:(?:quero|escolho|fico com)\s+)?(?:a\s+)?(?:(?:opcao|horario|numero)\s*)?(\d{1,2})[.)]?$/)
    if (ordinal) return slots[Number(ordinal[1]) - 1]
    return slots.find((slot) => slot.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === clean)
  }

  async createEvent(input: {
    slot: CalendarSlot; summary: string; description?: string; attendeeEmail?: string; requestKey?: string
  }): Promise<CalendarCreateResult> {
    const start = Date.parse(input.slot.start)
    const end = Date.parse(input.slot.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= Date.now() || end <= start) {
      throw new CalendarUnavailableError('invalid_slot', 'O horário escolhido expirou ou é inválido.')
    }
    if (this.isDryRun()) return { status: 'dry_run', slot: input.slot }
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'
    const headers = { Authorization: `Bearer ${process.env.GOOGLE_OAUTH_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }
    const eventId = input.requestKey ? `a1${createHash('sha256').update(input.requestKey).digest('hex')}` : undefined
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    const busy = overlaps(input.slot, await this.getBusy(input.slot.start, input.slot.end))
    if (busy && !eventId) throw new CalendarUnavailableError('conflict', 'O horário escolhido foi ocupado. É necessário escolher uma nova opção.')
    let response: Response
    try {
      // Um retorno perdido pode deixar o próprio evento ocupando o horário. Consulta a
      // identidade determinística antes de concluir conflito ou repetir a criação.
      response = busy ? await fetch(`${url}/${eventId}`, { headers, signal: AbortSignal.timeout(12_000) }) : await fetch(url, {
        method: 'POST', signal: AbortSignal.timeout(12_000), headers,
        body: JSON.stringify({
          ...(eventId ? { id: eventId } : {}), summary: input.summary, description: input.description,
          start: { dateTime: input.slot.start, timeZone: timezone() },
          end: { dateTime: input.slot.end, timeZone: timezone() },
          attendees: input.attendeeEmail ? [{ email: input.attendeeEmail }] : [],
        }),
      })
      if (response.status === 409 && eventId) {
        response = await fetch(`${url}/${eventId}`, { headers, signal: AbortSignal.timeout(12_000) })
      }
    } catch {
      throw new CalendarUnavailableError('uncertain', 'A agenda não confirmou o resultado da criação; o horário precisa ser conferido.')
    }
    if (busy && response.status === 404) throw new CalendarUnavailableError('conflict', 'O horário escolhido foi ocupado. É necessário escolher uma nova opção.')
    const data: any = await response.json().catch(() => null)
    if (!response.ok || typeof data?.id !== 'string' || !data.id || data.status === 'cancelled'
      || Date.parse(data?.start?.dateTime) !== start || Date.parse(data?.end?.dateTime) !== end) {
      throw new CalendarUnavailableError('uncertain', 'A agenda não retornou um evento confirmado para o horário escolhido.')
    }
    return { status: 'created', externalEventId: data.id, htmlLink: data.htmlLink, slot: input.slot }
  }
}

let cached: GoogleCalendarService | null = null
export function getGoogleCalendarService(): GoogleCalendarService {
  if (!cached) cached = new GoogleCalendarService()
  return cached
}
