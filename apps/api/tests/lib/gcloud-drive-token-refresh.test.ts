import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GcloudDriveCredentials } from '../../src/services/google-workspace/gcloudDriveCredentials.js'

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const baseTime = Date.parse('2026-09-07T20:00:00Z')
const output = (value: string, expires?: number) => JSON.stringify({ credential: { access_token: value, ...(expires === undefined ? {} : { token_expiry: new Date(expires).toISOString() }) } })
beforeEach(() => vi.stubEnv('GOOGLE_DRIVE_GCLOUD_ACCOUNT', 'fixture@example.test'))
afterEach(() => vi.unstubAllEnvs())

describe('cache e renovação de credencial corporativa Drive', () => {
  it('usa validade real com margem, sem presumir 45 minutos a partir da impressão', async () => {
    let now = baseTime
    const runGcloud = vi.fn(async () => output(`token-${runGcloud.mock.calls.length}`, now + 180_000))
    const credentials = new GcloudDriveCredentials({ runGcloud, now: () => now })
    expect(await credentials.getAccessToken()).toBe('token-1')
    now += 119_999; expect(await credentials.getAccessToken()).toBe('token-1')
    now += 2; expect(await credentials.getAccessToken()).toBe('token-2')
    expect(runGcloud).toHaveBeenCalledTimes(2)
    expect(runGcloud.mock.calls[0][0]).toEqual(['config', 'config-helper', '--account=fixture@example.test', '--format=json(credential)', '--quiet', '--min-expiry=120s'])
  })
  it('mantém cache curto quando a credencial não informa vencimento', async () => {
    let now = baseTime; const runGcloud = vi.fn(async () => output(`token-${runGcloud.mock.calls.length}`))
    const credentials = new GcloudDriveCredentials({ runGcloud, now: () => now })
    expect(await credentials.getAccessToken()).toBe('token-1')
    now += 60_001; expect(await credentials.getAccessToken()).toBe('token-2')
  })
  it('recusa token já expirado ou sem margem e não guarda resultado inválido', async () => {
    const runGcloud = vi.fn(async () => output('token-expirado', baseTime - 1000))
    const credentials = new GcloudDriveCredentials({ runGcloud, now: () => baseTime })
    await expect(credentials.getAccessToken()).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' })
    await expect(credentials.getAccessToken()).rejects.toThrow('validade suficiente')
    expect(runGcloud).toHaveBeenCalledTimes(2)
  })
  it('agrupa 30 erros 401 em uma renovação forçada e protege token novo de 401 antigo', async () => {
    const fresh = deferred<string>(); const runGcloud = vi.fn().mockResolvedValueOnce(output('old-token', baseTime + 3600_000)).mockReturnValueOnce(fresh.promise)
    const credentials = new GcloudDriveCredentials({ runGcloud, now: () => baseTime })
    await credentials.getAccessToken()
    const pending = Array.from({ length: 30 }, () => credentials.refreshAccessToken('old-token'))
    expect(runGcloud).toHaveBeenCalledTimes(2)
    expect(runGcloud.mock.calls[1][0]).toContain('--force-auth-refresh')
    fresh.resolve(output('new-token', baseTime + 3600_000))
    expect(await Promise.all(pending)).toEqual(Array(30).fill('new-token'))
    expect(credentials.invalidate('old-token')).toBe(false)
    expect(await credentials.refreshAccessToken('old-token')).toBe('new-token')
    expect(await credentials.getAccessToken()).toBe('new-token')
    expect(runGcloud).toHaveBeenCalledTimes(2)
  })
  it('compartilha a renovação por expiração com 401s pendentes do token anterior', async () => {
    let now = baseTime; const fresh = deferred<string>()
    const runGcloud = vi.fn().mockResolvedValueOnce(output('old-token', now + 180_000)).mockReturnValueOnce(fresh.promise)
    const credentials = new GcloudDriveCredentials({ runGcloud, now: () => now }); await credentials.getAccessToken()
    now += 121_000
    const regular = credentials.getAccessToken(); const rejected = credentials.refreshAccessToken('old-token')
    fresh.resolve(output('new-token', now + 3600_000))
    expect(await Promise.all([regular, rejected])).toEqual(['new-token', 'new-token'])
    expect(runGcloud).toHaveBeenCalledTimes(2)
  })
  it('força uma vez se consulta normal em andamento ainda retornar o token recusado', async () => {
    let now = baseTime; const regular = deferred<string>(); const forced = deferred<string>()
    const runGcloud = vi.fn().mockResolvedValueOnce(output('old-token', now + 180_000)).mockReturnValueOnce(regular.promise).mockReturnValueOnce(forced.promise)
    const credentials = new GcloudDriveCredentials({ runGcloud, now: () => now }); await credentials.getAccessToken(); now += 121_000
    const current = credentials.getAccessToken(); const rejected = Array.from({ length: 10 }, () => credentials.refreshAccessToken('old-token'))
    regular.resolve(output('old-token', now + 3600_000)); await current
    await Promise.resolve(); await Promise.resolve()
    forced.resolve(output('new-token', now + 3600_000))
    expect(await Promise.all(rejected)).toEqual(Array(10).fill('new-token'))
    expect(runGcloud).toHaveBeenCalledTimes(3)
  })
  it('invalidação explícita impede resposta em andamento de ressuscitar credencial anterior', async () => {
    const old = deferred<string>(); const runGcloud = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(output('new-token', baseTime + 3600_000))
    const credentials = new GcloudDriveCredentials({ runGcloud, now: () => baseTime })
    const stale = credentials.getAccessToken(); const rejected = expect(stale).rejects.toThrow('mudou durante a consulta')
    credentials.invalidate(); expect(await credentials.getAccessToken()).toBe('new-token')
    old.resolve(output('old-token', baseTime + 3600_000)); await rejected
    expect(await credentials.getAccessToken()).toBe('new-token')
  })
  it('não compartilha promessa ou cache entre contas corporativas diferentes', async () => {
    const old = deferred<string>(); const runGcloud = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(output('other-token', baseTime + 3600_000))
    const credentials = new GcloudDriveCredentials({ runGcloud, now: () => baseTime })
    const stale = credentials.getAccessToken(); const rejected = expect(stale).rejects.toThrow('mudou durante a consulta')
    vi.stubEnv('GOOGLE_DRIVE_GCLOUD_ACCOUNT', 'other@example.test')
    expect(await credentials.getAccessToken()).toBe('other-token')
    old.resolve(output('old-token', baseTime + 3600_000)); await rejected
    expect(runGcloud.mock.calls[1][0]).toContain('--account=other@example.test')
  })
  it.each([{ code: 'ENOENT', expected: 'SERVER_CONFIGURATION' }, { stderr: 'invalid_grant sensitive-refresh-token', expected: 'AUTH_REQUIRED' }, { stderr: 'socket error sensitive-access-token', expected: 'TEMPORARILY_UNAVAILABLE' }])('classifica falha sem devolver stderr ou credenciais: $expected', async failure => {
    const credentials = new GcloudDriveCredentials({ runGcloud: async () => { throw failure } })
    await expect(credentials.getAccessToken()).rejects.toMatchObject({ code: failure.expected })
    try { await credentials.getAccessToken() } catch (error) { expect(String(error)).not.toContain('sensitive') }
  })
  it('não repassa saída inválida nem token em mensagem de erro', async () => {
    const credentials = new GcloudDriveCredentials({ runGcloud: async () => 'sensitive-stdout-token' })
    await expect(credentials.getAccessToken()).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' })
    try { await credentials.getAccessToken() } catch (error) { expect(String(error)).not.toContain('sensitive') }
  })
})
