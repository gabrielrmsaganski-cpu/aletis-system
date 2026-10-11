import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => false, getPool: () => { throw new Error('No real PG in tests') } }))
vi.mock('../../src/services/google-workspace/gcloudDriveCredentials.js', () => ({ getGcloudDriveCredentials: () => ({ account: () => 'fixture@example.test' }) }))
import { GoogleWorkspaceClient } from '../../src/services/google-workspace/client.js'
import { GOOGLE_SCOPES } from '../../src/services/google-workspace/schemas.js'
const actor = { tenantId: 'fixture-tenant', userId: 'fixture-user', userName: 'Fixture', role: 'admin_master' }
beforeEach(() => {
  vi.stubEnv('ALETIS_TENANT_ID', actor.tenantId); vi.stubEnv('GOOGLE_WORKSPACE_ENABLED', 'true'); vi.stubEnv('GOOGLE_CLIENT_ID', 'fixture-client')
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'fixture-secret'); vi.stubEnv('GOOGLE_TOKEN_ENCRYPTION_KEY', 'fixture-encryption-key'); vi.stubEnv('GOOGLE_REDIRECT_URI', 'https://example.test/api/integrations/google/callback')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('binds a corporate purpose to the signed state and requests only offline Drive/identity scopes', () => {
  const client = new GoogleWorkspaceClient()
  const url = new URL(client.buildCorporateDriveAuthUrl(actor))
  expect(url.origin).toBe('https://accounts.google.com')
  expect(url.searchParams.get('scope')?.split(' ')).toEqual([GOOGLE_SCOPES.profile, GOOGLE_SCOPES.email, GOOGLE_SCOPES.drive])
  expect(url.searchParams.get('access_type')).toBe('offline')
  expect(url.searchParams.get('include_granted_scopes')).toBe('false')
  expect(url.searchParams.get('prompt')).toBe('consent')
  expect(url.searchParams.get('redirect_uri')).toBe('https://example.test/api/integrations/google/callback')
  expect(client.verifyState(url.searchParams.get('state')!)).toMatchObject({ purpose: 'corporate_drive', userId: actor.userId, tenantId: actor.tenantId })
  const regular = new URL(client.buildAuthUrl(actor))
  expect(client.verifyState(regular.searchParams.get('state')!).purpose).toBeUndefined()
  expect(regular.searchParams.get('scope')).toContain(GOOGLE_SCOPES.driveFile)
})

it('does not offer an authorization URL for missing app configuration or another tenant', () => {
  expect(() => new GoogleWorkspaceClient().buildCorporateDriveAuthUrl({ ...actor, tenantId: 'other' })).toThrow()
  vi.stubEnv('GOOGLE_CLIENT_SECRET', '')
  expect(() => new GoogleWorkspaceClient().buildCorporateDriveAuthUrl(actor)).toThrow('GOOGLE_CLIENT_SECRET')
})

it.each(['valid', 'wrong_account', 'unverified_email', 'missing_refresh', 'cloud_scope'])('validates corporate code exchange: %s', async kind => {
  const payload = { access_token: 'fixture-access', refresh_token: kind === 'missing_refresh' ? undefined : 'fixture-refresh', expires_in: 3600,
    scope: GOOGLE_SCOPES.drive + (kind === 'cloud_scope' ? ' https://www.googleapis.com/auth/cloud-platform' : '') }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(payload)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ email: kind === 'wrong_account' ? 'other@example.test' : 'fixture@example.test', sub: 'fixture-google-id', email_verified: kind !== 'unverified_email' }))))
  const result = new GoogleWorkspaceClient().exchangeCode('synthetic-code', undefined, 'corporate_drive')
  if (kind === 'valid') expect(await result).toMatchObject({ googleEmail: 'fixture@example.test', tokens: { refreshToken: 'fixture-refresh', scopes: [GOOGLE_SCOPES.drive] } })
  else await expect(result).rejects.toMatchObject({ code: ['wrong_account', 'unverified_email'].includes(kind) ? 'ACCOUNT_MISMATCH' : kind === 'missing_refresh' ? 'AUTH_REQUIRED' : 'PERMISSION_DENIED' })
})
