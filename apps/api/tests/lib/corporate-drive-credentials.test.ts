import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => false, getPool: () => { throw new Error('No real PG in tests') } }))
import { CorporateDriveCredentials } from '../../src/services/google-workspace/CorporateDriveCredentials.js'
import { GcloudDriveCredentials } from '../../src/services/google-workspace/gcloudDriveCredentials.js'
import { GOOGLE_SCOPES } from '../../src/services/google-workspace/schemas.js'

let row: any, store: any, sdk: any, network: any
const now = Date.parse('2026-09-08T15:00:00Z')
const fingerprint = createHash('sha256').update('fixture-client').digest('hex')
beforeEach(() => {
  vi.stubEnv('ALETIS_TENANT_ID', 'fixture-tenant'); vi.stubEnv('GOOGLE_CLIENT_ID', 'fixture-client'); vi.stubEnv('GOOGLE_CLIENT_SECRET', 'fixture-secret')
  row = { row: { id: 'connection-test', tenantId: 'fixture-tenant', googleEmail: 'fixture@example.test', status: 'connected', revokedAt: null, metadata: { corporateDriveSelected: true, oauthClientIdFingerprint: fingerprint } },
    tokens: { accessToken: 'access-old', refreshToken: 'refresh-old', tokenExpiry: new Date(now - 1000), scopes: [GOOGLE_SCOPES.drive] } }
  store = { missingEnv: vi.fn(() => []), corporatePreflight: vi.fn(async () => row), withCorporateConnection: vi.fn(async (_tenant, use) => { if (!row) return null; const result = await use(row); if (result.tokens) row.tokens = result.tokens; return result.value }) }
  sdk = { account: vi.fn(() => 'fixture@example.test'), getAccessToken: vi.fn(async () => 'sdk-access'), refreshAccessToken: vi.fn(async () => 'sdk-new'), invalidate: vi.fn(() => true) }
  network = vi.fn(async () => new Response(JSON.stringify({ access_token: 'access-new', expires_in: 3600, refresh_token: 'refresh-rotated', scope: GOOGLE_SCOPES.drive })))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const service = () => new CorporateDriveCredentials({ store, gcloud: sdk, fetch: network, now: () => now })

describe('explicit corporate credential selection', () => {
  it('delegates to the existing SDK only when no OAuth connection is selected', async () => {
    row = null; store.missingEnv.mockReturnValue(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'])
    const credentials = service()
    expect(await credentials.getAccessToken()).toBe('sdk-access')
    expect(await credentials.statusPreflight()).toMatchObject({ connectionMode: 'gcloud_drive', selected: false, oauthConfigured: false, ready: true })
    expect(network).not.toHaveBeenCalled()
  })
  it('forces an SDK refresh without a rejected token and reuses the resulting token', async () => {
    row = null
    vi.stubEnv('GOOGLE_DRIVE_GCLOUD_ACCOUNT', 'fixture@example.test')
    const output = (token: string) => JSON.stringify({ credential: { access_token: token, token_expiry: new Date(now + 3600_000).toISOString() } })
    const runGcloud = vi.fn().mockResolvedValueOnce(output('sdk-old')).mockResolvedValue(output('sdk-forced'))
    const gcloud = new GcloudDriveCredentials({ runGcloud, now: () => now })
    const credentials = new CorporateDriveCredentials({ store, gcloud, fetch: network, now: () => now })

    expect(await credentials.refreshAccessToken()).toBe('sdk-forced')
    expect(runGcloud).toHaveBeenCalledTimes(2)
    expect(runGcloud.mock.calls[0][0]).toContain('--min-expiry=120s')
    expect(runGcloud.mock.calls[1][0]).toContain('--force-auth-refresh')
    expect(await credentials.getAccessToken()).toBe('sdk-forced')
    expect(runGcloud).toHaveBeenCalledTimes(2)
    expect(network).not.toHaveBeenCalled()
  })
  it('forwards an explicitly rejected SDK token without acquiring another first', async () => {
    row = null
    expect(await service().refreshAccessToken('sdk-rejected')).toBe('sdk-new')
    expect(sdk.refreshAccessToken).toHaveBeenCalledWith('sdk-rejected')
    expect(sdk.getAccessToken).not.toHaveBeenCalled()
    expect(network).not.toHaveBeenCalled()
  })
  it('refreshes once for concurrent callers and persists rotated tokens before returning', async () => {
    const credentials = service()
    expect(await Promise.all(Array.from({ length: 20 }, () => credentials.getAccessToken()))).toEqual(Array(20).fill('access-new'))
    expect(network).toHaveBeenCalledTimes(1)
    expect(row.tokens.refreshToken).toBe('refresh-rotated')
    expect(row.tokens.tokenExpiry.toISOString()).toBe('2026-09-08T16:00:00.000Z')
    expect(sdk.getAccessToken).not.toHaveBeenCalled()
    expect(new URLSearchParams(network.mock.calls[0][1].body).get('grant_type')).toBe('refresh_token')
    const restarted = service()
    expect(await restarted.getAccessToken()).toBe('access-new')
    expect(network).toHaveBeenCalledTimes(1)
  })
  it('does not discard a refreshed token after a delayed 401 for the old token', async () => {
    const credentials = service()
    expect(await credentials.getAccessToken()).toBe('access-new')
    expect(credentials.invalidate('access-old')).toBe(false)
    expect(await credentials.refreshAccessToken('access-old')).toBe('access-new')
    expect(network).toHaveBeenCalledTimes(1)
  })
  it('forces one refresh after a 401 of an otherwise unexpired token', async () => {
    row.tokens.tokenExpiry = new Date(now + 3600_000)
    const credentials = service()
    expect(await credentials.getAccessToken()).toBe('access-old')
    expect(await credentials.refreshAccessToken('access-old')).toBe('access-new')
    expect(network).toHaveBeenCalledTimes(1)
  })
  it.each(['revoked', 'account', 'tenant', 'scope', 'cloud_scope', 'no_refresh', 'client_changed'])('never switches to SDK for invalid selected OAuth: %s', async problem => {
    if (problem === 'revoked') row.row.status = 'revoked'
    if (problem === 'account') row.row.googleEmail = 'another@example.test'
    if (problem === 'tenant') row.row.tenantId = 'another-tenant'
    if (problem === 'scope') row.tokens.scopes = [GOOGLE_SCOPES.driveFile]
    if (problem === 'cloud_scope') row.tokens.scopes.push('https://www.googleapis.com/auth/cloud-platform')
    if (problem === 'no_refresh') row.tokens.refreshToken = undefined
    if (problem === 'client_changed') row.row.metadata.oauthClientIdFingerprint = 'other-client'
    await expect(service().getAccessToken()).rejects.toThrow()
    expect(sdk.getAccessToken).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled()
  })
  it('does not return a fresh token if durable persistence fails', async () => {
    store.withCorporateConnection.mockImplementation(async (_tenant, use) => { await use(row); throw new Error('PG commit unavailable') })
    await expect(service().getAccessToken()).rejects.toThrow('PG commit unavailable')
    expect(sdk.getAccessToken).not.toHaveBeenCalled()
    expect(row.tokens.accessToken).toBe('access-old')
  })
  it('preserves the stored refresh token on invalid_grant and exposes no provider details', async () => {
    network.mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'secret-fixture-provider-data' }), { status: 400 }))
    await expect(service().getAccessToken()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    expect(row.tokens.refreshToken).toBe('refresh-old'); expect(sdk.getAccessToken).not.toHaveBeenCalled()
  })
  it('does not refresh or declare OAuth live from a local preflight', async () => {
    expect(await service().statusPreflight()).toMatchObject({ connectionMode: 'corporate_oauth', selected: true, ready: true })
    expect(network).not.toHaveBeenCalled(); expect(sdk.getAccessToken).not.toHaveBeenCalled()
  })
  it('keeps missing app configuration explicit despite an existing SDK login', async () => {
    store.missingEnv.mockReturnValue(['GOOGLE_CLIENT_SECRET'])
    expect(await service().statusPreflight()).toMatchObject({ connectionMode: 'corporate_oauth', selected: true, ready: false, oauthConfigured: false })
    await expect(service().getAccessToken()).rejects.toMatchObject({ code: 'SERVER_CONFIGURATION' })
    expect(sdk.getAccessToken).not.toHaveBeenCalled()
  })
})
