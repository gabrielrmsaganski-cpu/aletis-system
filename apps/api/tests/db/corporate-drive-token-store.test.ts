import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), upsert: vi.fn(), enabled: true }))
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => mocks.enabled,
  getDb: () => ({ insert: () => ({ values: () => ({ onConflictDoUpdate: mocks.upsert }) }) }),
  getPool: () => ({ query: mocks.query, connect: async () => ({ query: mocks.query, release: mocks.release }) }) }))
import { PgDialect } from 'drizzle-orm/pg-core'
import { GoogleTokenStore, encryptToken, decryptToken } from '../../src/services/google-workspace/tokenStore.js'
import { GOOGLE_SCOPES } from '../../src/services/google-workspace/schemas.js'

const actor = { tenantId: 'fixture-tenant', userId: 'fixture-user', userName: 'Fixture', role: 'admin_master' }
let row: any
let caseNumber = 0
const input = () => ({ actor, googleEmail: 'fixture@example.test', googleAccountId: 'fixture-google-id', accessToken: 'fixture-access', refreshToken: 'fixture-refresh', tokenExpiry: new Date(Date.now() + 3600_000), scopes: [GOOGLE_SCOPES.drive] })
beforeEach(() => {
  mocks.enabled = true; mocks.query.mockReset(); mocks.release.mockReset(); mocks.upsert.mockReset()
  actor.userId = `fixture-user-${++caseNumber}`
  vi.stubEnv('ALETIS_TENANT_ID', actor.tenantId); vi.stubEnv('GOOGLE_WORKSPACE_ENABLED', 'true'); vi.stubEnv('GOOGLE_CLIENT_ID', 'fixture-client')
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'fixture-secret'); vi.stubEnv('GOOGLE_TOKEN_ENCRYPTION_KEY', 'fixture-encryption-key'); vi.stubEnv('GOOGLE_DRIVE_GCLOUD_ACCOUNT', 'fixture@example.test')
  row = { id: 'fixture-connection', tenantId: actor.tenantId, userId: actor.userId, googleEmail: 'fixture@example.test', status: 'connected', revokedAt: null,
    accessTokenEncrypted: encryptToken('old-access'), refreshTokenEncrypted: encryptToken('old-refresh'), scopes: [GOOGLE_SCOPES.drive], tokenExpiry: new Date(Date.now() - 1000), metadata: { corporateDriveSelected: true } }
  mocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.startsWith('INSERT INTO')) row = { ...row, googleEmail: params![3], googleAccountId: params![4], accessTokenEncrypted: params![5], refreshTokenEncrypted: params![6], tokenExpiry: params![7], scopes: params![8], metadata: JSON.parse(String(params![9])) }
    if (sql.startsWith('UPDATE google_workspace_connection SET access_token_encrypted')) row = { ...row, accessTokenEncrypted: params![0], refreshTokenEncrypted: params![1], tokenExpiry: params![2], scopes: params![3] }
    return { rowCount: 1, rows: sql.startsWith('SELECT id,') || sql.startsWith('INSERT INTO') || sql.startsWith('UPDATE google_workspace_connection SET access_token_encrypted') ? [row] : [] }
  })
})
afterEach(() => vi.unstubAllEnvs())

it('selects one corporate connection and persists encrypted offline credentials in the same tenant transaction', async () => {
  const store = new GoogleTokenStore()
  await store.saveCorporateConnected(input())
  const calls = mocks.query.mock.calls
  expect(calls[0][0]).toBe('BEGIN')
  const lock = calls.findIndex(([sql]) => sql.includes('pg_advisory_xact_lock'))
  const deselect = calls.findIndex(([sql]) => sql.includes("metadata=metadata-'corporateDriveSelected'"))
  const insert = calls.findIndex(([sql]) => sql.startsWith('INSERT INTO'))
  expect(lock).toBeLessThan(deselect); expect(deselect).toBeLessThan(insert)
  expect(calls[deselect][1][0]).toBe(actor.tenantId)
  expect(decryptToken(calls[insert][1][5])).toBe('fixture-access')
  expect(decryptToken(calls[insert][1][6])).toBe('fixture-refresh')
  expect(JSON.parse(calls[insert][1][9])).toMatchObject({ corporateDriveSelected: true, corporateDriveSelectedBy: actor.userId })
  expect(calls.at(-1)?.[0]).toBe('COMMIT'); expect(mocks.release).toHaveBeenCalledTimes(1)
  mocks.enabled = false
  expect(await store.get(actor)).toMatchObject({ id: row.id, metadata: { corporateDriveSelected: true } })
})

it('rolls back the prior selection on persistence failure instead of claiming an in-memory connection', async () => {
  const original = mocks.query.getMockImplementation()!
  mocks.query.mockImplementation(async (...args) => { if (String(args[0]).startsWith('INSERT INTO')) throw new Error('private-db-detail'); return original(...args) })
  await expect(new GoogleTokenStore().saveCorporateConnected(input())).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE', message: expect.not.stringContaining('private-db-detail') })
  expect(mocks.query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true)
  expect(mocks.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false)
  mocks.enabled = false
  expect(await new GoogleTokenStore().get(actor)).toBeNull()
})

it('requires durable PG, the configured account, tenant, Drive scope and offline token before selection', async () => {
  const store = new GoogleTokenStore()
  await expect(store.saveCorporateConnected({ ...input(), actor: { ...actor, tenantId: 'other' } })).rejects.toMatchObject({ code: 'ACCOUNT_MISMATCH' })
  await expect(store.saveCorporateConnected({ ...input(), refreshToken: undefined })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  await expect(store.saveCorporateConnected({ ...input(), scopes: [GOOGLE_SCOPES.driveFile] })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  expect(mocks.query).not.toHaveBeenCalled()
  mocks.enabled = false
  await expect(store.saveCorporateConnected(input())).rejects.toMatchObject({ code: 'SERVER_CONFIGURATION' })
})

it('does not choose arbitrarily between two selections or fall back after a database error', async () => {
  mocks.query.mockResolvedValue({ rows: [row, row], rowCount: 2 })
  await expect(new GoogleTokenStore().corporatePreflight(actor.tenantId)).rejects.toMatchObject({ code: 'SERVER_CONFIGURATION' })
  mocks.query.mockRejectedValue(new Error('private-db-detail'))
  await expect(new GoogleTokenStore().corporatePreflight(actor.tenantId)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' })
})

it('writes refreshed tokens with the same selection lock and never returns them after a failed commit', async () => {
  const original = mocks.query.getMockImplementation()!
  mocks.query.mockImplementation(async (...args) => { if (args[0] === 'COMMIT') throw new Error('commit failed'); return original(...args) })
  await expect(new GoogleTokenStore().withCorporateConnection(actor.tenantId, async () => ({ value: 'new-access', tokens: { accessToken: 'new-access', refreshToken: 'new-refresh', tokenExpiry: new Date(), scopes: [GOOGLE_SCOPES.drive] } }))).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' })
  const update = mocks.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE google_workspace_connection SET access_token_encrypted'))!
  expect(update[0]).toContain("status='connected'"); expect(update[1].slice(-2)).toEqual([row.id, actor.tenantId])
  expect(decryptToken(update[1][0])).toBe('new-access')
  expect(mocks.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK')
  mocks.enabled = false
  expect(await new GoogleTokenStore().get(actor)).toBeNull()
})

it('rejeita metadata não serializável antes do INSERT corporativo', async () => {
  await expect(new GoogleTokenStore().saveCorporateConnected({ ...input(), metadata: { invalid: Infinity } })).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' })
  expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO'))).toBe(false)
})

it('atualiza o Map só depois do COMMIT de uma renovação corporativa', async () => {
  const store = new GoogleTokenStore()
  expect(await store.withCorporateConnection(actor.tenantId, async () => ({ value: 'new-access', tokens: { accessToken: 'new-access', refreshToken: 'new-refresh', tokenExpiry: new Date(Date.now() + 3600_000), scopes: [GOOGLE_SCOPES.drive] } }))).toBe('new-access')
  mocks.enabled = false
  expect(decryptToken((await store.get(actor))?.accessTokenEncrypted)).toBe('new-access')
})

it('CAS do upsert comum preserva seleção corporativa confirmada após a leitura inicial', async () => {
  const store = new GoogleTokenStore()
  await store.saveCorporateConnected(input())
  const selected = row
  const staleRead = vi.spyOn(store, 'get').mockResolvedValue({ ...row, metadata: { connectedVia: 'oauth2' } })
  mocks.upsert.mockReturnValue({ returning: async () => [] })
  await expect(store.saveConnected({ ...input(), scopes: [GOOGLE_SCOPES.driveFile] })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  const predicate = new PgDialect().sqlToQuery(mocks.upsert.mock.calls[0][0].setWhere).sql
  expect(predicate).toContain('corporateDriveSelected'); expect(predicate).toContain("<> 'true'::jsonb")
  staleRead.mockRestore(); mocks.enabled = false
  expect(await store.get(actor)).toEqual(selected)
})
