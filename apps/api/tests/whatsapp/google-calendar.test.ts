import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCandidateSlots, GoogleCalendarService } from '../../src/services/whatsapp/GoogleCalendarService.js'

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
const free = () => json({ calendars: { primary: { busy: [] } } })

describe('GoogleCalendarService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-05-30T14:00:00Z'))
    for (const [key, value] of Object.entries({ GOOGLE_CALENDAR_ENABLED: 'true', GOOGLE_CALENDAR_DRY_RUN: 'false', GOOGLE_CALENDAR_ID: 'primary', GOOGLE_OAUTH_ACCESS_TOKEN: 'credencial-ficticia', GOOGLE_CALENDAR_TIMEZONE: 'America/Cuiaba', GOOGLE_CALENDAR_HOLIDAYS: '' })) vi.stubEnv(key, value)
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers() })

  it.each(['2026-05-29T14:00:00Z', '2026-05-30T14:00:00Z', '2026-05-31T01:00:00Z'])('gera horários únicos às 9h de Cuiabá a partir de %s', (now) => {
    const slots = buildCandidateSlots({ now: new Date(now), days: 2 })
    expect(slots).toHaveLength(8)
    expect(new Set(slots.map((slot) => slot.start)).size).toBe(8)
    expect(slots[0].start).toBe('2026-06-01T13:00:00.000Z')
    expect(slots[0].label).toContain('09:00')
  })
  it('considera virada de dia local, feriados nacionais e feriados configurados', () => {
    expect(buildCandidateSlots({ now: new Date('2026-06-02T02:00:00Z'), days: 1, holidays: ['2026-06-02'] })[0].start).toBe('2026-06-03T13:00:00.000Z')
    expect(buildCandidateSlots({ now: new Date('2026-09-05T14:00:00Z'), days: 1 })[0].start).toBe('2026-09-08T13:00:00.000Z')
  })
  it('converte horário civil em fuso com horário de verão', () => {
    expect(buildCandidateSlots({ now: new Date('2026-01-05T12:00:00Z'), days: 1, timeZone: 'America/New_York' })[0].start).toContain('T14:00:00.000Z')
    expect(buildCandidateSlots({ now: new Date('2026-07-06T12:00:00Z'), days: 1, timeZone: 'America/New_York' })[0].start).toContain('T13:00:00.000Z')
  })
  it.each(['disabled', 'dry_run'])('não oferece candidatos como livres em %s', async (mode) => {
    vi.stubEnv(mode === 'disabled' ? 'GOOGLE_CALENDAR_ENABLED' : 'GOOGLE_CALENDAR_DRY_RUN', mode === 'disabled' ? 'false' : 'true')
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    expect(await new GoogleCalendarService().listAvailableSlots()).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([() => json({}, 503), () => json({ calendars: { primary: { errors: [{ reason: 'notFound' }] } } }), () => json({ calendars: { primary: {} } }), () => json({ calendars: { primary: { busy: [{ start: 'inválido', end: 'inválido' }] } } })])('não presume disponibilidade quando freeBusy falha ou está incompleto', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()))
    await expect(new GoogleCalendarService().listAvailableSlots()).rejects.toMatchObject({ reason: 'unavailable' })
  })
  it('consulta além das primeiras opções ocupadas', async () => {
    const candidates = buildCandidateSlots()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ calendars: { primary: { busy: [{ start: candidates[0].start, end: candidates[7].end }] } } })))
    const slots = await new GoogleCalendarService().listAvailableSlots()
    expect(slots).toHaveLength(6); expect(slots[0].start).toBe(candidates[8].start)
  })
  it('não confunde uma data ou hora com o número da opção', () => {
    const svc = new GoogleCalendarService(); const slots = buildCandidateSlots().slice(0, 6)
    expect(svc.pickSlotFromText('opção 2', slots)).toEqual(slots[1])
    for (const text of ['dia 2 às 9h', '9h', '']) expect(svc.pickSlotFromText(text, slots)).toBeUndefined()
  })
  it('revalida ocupação e não envia criação quando há conflito', async () => {
    const slot = buildCandidateSlots()[0]
    const fetch = vi.fn().mockResolvedValue(json({ calendars: { primary: { busy: [{ start: slot.start, end: slot.end }] } } })); vi.stubGlobal('fetch', fetch)
    await expect(new GoogleCalendarService().createEvent({ slot, summary: 'Teste' })).rejects.toMatchObject({ reason: 'conflict' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('confirma apenas evento com identificação e período correto', async () => {
    const slot = buildCandidateSlots()[0]
    const fetch = vi.fn().mockResolvedValueOnce(free()).mockResolvedValueOnce(json({ id: 'evento-real-mock', start: { dateTime: slot.start }, end: { dateTime: slot.end } })); vi.stubGlobal('fetch', fetch)
    expect(await new GoogleCalendarService().createEvent({ slot, summary: 'Teste', requestKey: 'conversa:horario' })).toMatchObject({ status: 'created', externalEventId: 'evento-real-mock' })
    const request = JSON.parse(fetch.mock.calls[1][1].body)
    expect(request.id).toMatch(/^a1[a-f0-9]{64}$/); expect(request.start.timeZone).toBe('America/Cuiaba')
  })
  it('não confirma HTTP 200 sem evento identificável', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(free()).mockResolvedValueOnce(json({})))
    await expect(new GoogleCalendarService().createEvent({ slot: buildCandidateSlots()[0], summary: 'Teste' })).rejects.toMatchObject({ reason: 'uncertain' })
  })
  it('reconcilia retorno perdido sem duplicar o evento já criado', async () => {
    const slot = buildCandidateSlots()[0]
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ calendars: { primary: { busy: [{ start: slot.start, end: slot.end }] } } }))
      .mockResolvedValueOnce(json({ id: 'evento-anterior', start: { dateTime: slot.start }, end: { dateTime: slot.end } }))
    vi.stubGlobal('fetch', fetch)
    expect(await new GoogleCalendarService().createEvent({ slot, summary: 'Teste', requestKey: 'mesma-conversa:mesmo-horario' })).toMatchObject({ status: 'created', externalEventId: 'evento-anterior' })
    expect(fetch.mock.calls[1][0]).toMatch(/\/events\/a1[a-f0-9]{64}$/)
    expect(fetch.mock.calls[1][1].method).toBeUndefined()
  })
  it('expõe simulação sem criação externa', async () => {
    vi.stubEnv('GOOGLE_CALENDAR_DRY_RUN', 'true'); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const result = await new GoogleCalendarService().createEvent({ slot: buildCandidateSlots()[0], summary: 'Teste' })
    expect(result.status).toBe('dry_run'); expect(result.externalEventId).toBeUndefined(); expect(fetch).not.toHaveBeenCalled()
  })
})
