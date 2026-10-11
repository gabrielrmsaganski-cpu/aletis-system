import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const deps = vi.hoisted(() => ({ credential: undefined as unknown, corporate: undefined as unknown, tokens: vi.fn(), save: vi.fn() }))
vi.mock('../../src/services/google-workspace/gcloudDriveCredentials.js', async original => ({ ...await original<object>(), getGcloudDriveCredentials: () => deps.credential }))
vi.mock('../../src/services/google-workspace/CorporateDriveCredentials.js', async original => ({ ...await original<object>(), getCorporateDriveCredentials: () => deps.corporate }))
vi.mock('../../src/services/google-workspace/tokenStore.js', () => ({ getGoogleTokenStore: () => ({ getDecryptedTokens: deps.tokens, saveTokens: deps.save }), safeSecretEquals: () => false }))
import { GcloudDriveCredentials } from '../../src/services/google-workspace/gcloudDriveCredentials.js'
import { CorporateDriveCredentials } from '../../src/services/google-workspace/CorporateDriveCredentials.js'
import { GoogleWorkspaceClient } from '../../src/services/google-workspace/client.js'
import { GOOGLE_SCOPES } from '../../src/services/google-workspace/schemas.js'
const actor = { userId: 'fixture', userName: 'Fixture', role: 'consultor', tenantId: 'fixture' }
const url = 'https://www.googleapis.com/drive/v3/files'
const output = (token: string) => JSON.stringify({ credential: { access_token: token, token_expiry: new Date(Date.now() + 3600_000).toISOString() } })
let credentials: GcloudDriveCredentials
let runGcloud: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.stubEnv('GOOGLE_DRIVE_GCLOUD_ACCOUNT', 'fixture@example.test')
  vi.stubEnv('ALETIS_TENANT_ID', actor.tenantId)
  runGcloud = vi.fn().mockResolvedValueOnce(output('old-token')).mockResolvedValue(output('new-token'))
  credentials = new GcloudDriveCredentials({ runGcloud }); deps.credential = credentials; deps.tokens.mockReset(); deps.save.mockReset()
  deps.corporate = new CorporateDriveCredentials({ gcloud: credentials, store: { missingEnv: () => [], corporatePreflight: async () => null, withCorporateConnection: async () => null } })
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const response = (status: number) => new Response(JSON.stringify(status < 300 ? { id: 'fixture-file' } : { error: { message: `HTTP ${status}` } }), { status })
describe('renovação única de HTTP 401 no cliente Workspace', () => {
  it('renova token uma vez e preserva método, corpo e headers no reenvio', async () => {
    const calls: Array<{ auth: string | null; method: string | undefined; body: unknown; custom: string | null }> = []
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => { const headers = new Headers(init.headers); calls.push({ auth: headers.get('Authorization'), method: init.method, body: init.body, custom: headers.get('x-fixture') }); return response(calls.length === 1 ? 401 : 200) }))
    const body = JSON.stringify({ name: 'Documento sintético' })
    expect(await new GoogleWorkspaceClient().googleFetch(actor, url, { method: 'POST', body, headers: { 'x-fixture': 'yes' } }, GOOGLE_SCOPES.driveFile)).toEqual({ id: 'fixture-file' })
    expect(calls).toEqual([{ auth: 'Bearer old-token', method: 'POST', body, custom: 'yes' }, { auth: 'Bearer new-token', method: 'POST', body, custom: 'yes' }])
    expect(runGcloud).toHaveBeenCalledTimes(2); expect(runGcloud.mock.calls[1][0]).toContain('--force-auth-refresh')
    expect(deps.tokens).not.toHaveBeenCalled(); expect(deps.save).not.toHaveBeenCalled()
  })
  it('coalesce 20 requisições simultâneas com 401 sem 20 renovações', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => response(new Headers(init.headers).get('Authorization') === 'Bearer old-token' ? 401 : 200)))
    const client = new GoogleWorkspaceClient()
    expect((await Promise.all(Array.from({ length: 20 }, () => client.googleFetch(actor, url, {}, GOOGLE_SCOPES.driveFile)))).length).toBe(20)
    expect(fetch).toHaveBeenCalledTimes(40); expect(runGcloud).toHaveBeenCalledTimes(2)
  })
  it('segundo 401 devolve erro de autorização claro, sem terceira requisição', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(401)))
    await expect(new GoogleWorkspaceClient().googleFetch(actor, url, {}, GOOGLE_SCOPES.drive)).rejects.toMatchObject({ code: 'AUTH_REQUIRED', message: expect.stringContaining('mesmo após renovação') })
    expect(fetch).toHaveBeenCalledTimes(2); expect(runGcloud).toHaveBeenCalledTimes(2)
  })
  it.each([403, 429, 500])('não renova nem repete HTTP %s', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => response(status)))
    await expect(new GoogleWorkspaceClient().googleFetch(actor, url, {}, GOOGLE_SCOPES.driveFile)).rejects.toThrow(`HTTP ${status}`)
    expect(fetch).toHaveBeenCalledTimes(1); expect(runGcloud).toHaveBeenCalledTimes(1)
  })
  it('preserva OAuth independente, sem usar gcloud para falha de Calendar', async () => {
    deps.tokens.mockResolvedValue({ accessToken: 'oauth-token', refreshToken: 'oauth-refresh', tokenExpiry: new Date(Date.now() + 3600_000), scopes: [GOOGLE_SCOPES.calendarEvents] })
    vi.stubGlobal('fetch', vi.fn(async () => response(401)))
    await expect(new GoogleWorkspaceClient().googleFetch(actor, 'https://www.googleapis.com/calendar/v3/calendars/primary', {}, GOOGLE_SCOPES.calendarEvents)).rejects.toThrow('HTTP 401')
    expect(fetch).toHaveBeenCalledTimes(1); expect(runGcloud).not.toHaveBeenCalled(); expect(deps.save).not.toHaveBeenCalled()
  })
  it('cancelamento durante renovação impede segundo envio', async () => {
    const controller = new AbortController(); runGcloud.mockReset().mockResolvedValueOnce(output('old-token')).mockImplementation(async () => { controller.abort(); return output('new-token') })
    vi.stubGlobal('fetch', vi.fn(async () => response(401)))
    await expect(new GoogleWorkspaceClient().googleFetch(actor, url, { signal: controller.signal }, GOOGLE_SCOPES.driveFile)).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('não tenta reenviar stream consumido após renovar credencial', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(401)))
    await expect(new GoogleWorkspaceClient().googleFetch(actor, url, { method: 'POST', body: new ReadableStream() }, GOOGLE_SCOPES.driveFile)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE', message: expect.stringContaining('transmitir o arquivo desde o início') })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('resposta 204 continua sem JSON e não dispara renovação', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    expect(await new GoogleWorkspaceClient().googleFetch(actor, url, {}, GOOGLE_SCOPES.docs)).toBeUndefined()
    expect(runGcloud).toHaveBeenCalledTimes(1)
  })
})
