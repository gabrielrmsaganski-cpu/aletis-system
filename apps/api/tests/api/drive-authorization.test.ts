import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), invalidate: vi.fn(), status: vi.fn(), audit: vi.fn(), corporateStatus: vi.fn(), corporateUrl: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
vi.mock('../../src/services/google-workspace/gcloudDriveCredentials.js', () => ({
  getGcloudDriveCredentials: () => ({ account: () => process.env.GOOGLE_DRIVE_GCLOUD_ACCOUNT || null, invalidate: mocks.invalidate }),
}))
vi.mock('../../src/services/google-workspace/services.js', () => ({ getGoogleWorkspaceService: () => ({ status: mocks.status }) }))
vi.mock('../../src/services/google-workspace/audit.js', () => ({ getGoogleWorkspaceAuditService: () => ({ record: mocks.audit }) }))
vi.mock('../../src/services/google-workspace/CorporateDriveCredentials.js', () => ({ getCorporateDriveCredentials: () => ({ statusPreflight: mocks.corporateStatus }) }))
vi.mock('../../src/services/google-workspace/client.js', () => ({ getGoogleWorkspaceClient: () => ({ buildCorporateDriveAuthUrl: mocks.corporateUrl }) }))
import { DriveAuthorizationService, driveConnectionManager } from '../../src/services/google-workspace/DriveAuthorization.js'
import routes from '../../src/routes/google-drive-authorization.js'

const authUrl = 'https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=test&state=test&code_challenge=pkce-test'
function processMock() {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() })
  child.kill.mockImplementation(() => { child.emit('close', null); return true })
  mocks.spawn.mockReturnValue(child)
  return child
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('GOOGLE_DRIVE_GCLOUD_ACCOUNT', 'christian@aletis.com.br')
  vi.stubEnv('GOOGLE_DRIVE_ADMIN_USER_IDS', '')
  mocks.status.mockResolvedValue({ status: 'connected' })
  mocks.audit.mockResolvedValue(undefined)
  mocks.corporateStatus.mockResolvedValue({ oauthConfigured: false, selected: false, ready: false, missingEnv: ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET'], scopes: [] })
  mocks.corporateUrl.mockReturnValue(authUrl)
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })

describe('autorização corporativa com PKCE via gcloud', () => {
  it('aceita saída fragmentada, protege proprietário e usa código apenas no stdin', async () => {
    const service = new DriveAuthorizationService()
    const child = processMock()
    const pending = service.start('tenant:owner')
    child.stderr.write(authUrl.slice(0, 40))
    child.stderr.write(authUrl.slice(40))
    child.stderr.write('\n')
    const attempt = await pending
    expect(attempt.authorizationUrl).toBe(authUrl)
    expect(mocks.spawn.mock.calls[0][1]).toContain('--no-activate')
    expect(await service.start('tenant:owner')).toEqual(attempt)
    await expect(service.start('tenant:other')).rejects.toMatchObject({ statusCode: 409 })
    await expect(service.finish('tenant:other', attempt.attemptId, 'test-code')).rejects.toMatchObject({ statusCode: 404 })
    let received = ''
    child.stdin.on('data', chunk => { received += chunk.toString() })
    const finish = service.finish('tenant:owner', attempt.attemptId, 'test-code')
    await expect(service.finish('tenant:owner', attempt.attemptId, 'test-code')).rejects.toMatchObject({ statusCode: 409 })
    child.emit('close', 0)
    await finish
    expect(received).toBe('test-code\n')
    expect(JSON.stringify(mocks.spawn.mock.calls)).not.toContain('test-code')
    expect(mocks.invalidate).toHaveBeenCalledOnce()
    await expect(service.finish('tenant:owner', attempt.attemptId, 'test-code')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('cancela processo ao expirar e rejeita tentativa antiga', async () => {
    vi.useFakeTimers()
    const service = new DriveAuthorizationService()
    const child = processMock()
    const pending = service.start('owner')
    child.stdout.write(authUrl + '\n')
    const attempt = await pending
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    await expect(service.finish('owner', attempt.attemptId, 'code')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('não expõe erro bruto do subprocesso nem deixa processo sem URL aberto', async () => {
    vi.useFakeTimers()
    const service = new DriveAuthorizationService()
    const child = processMock()
    const pending = expect(service.start('owner')).rejects.toThrow('Não foi possível iniciar')
    child.stderr.write('refresh_token=segredo-que-nao-pode-sair')
    await vi.advanceTimersByTimeAsync(15_000)
    await pending
    expect(child.kill).toHaveBeenCalled()
  })

  it('código inválido ou falha do Google não invalida credencial em uso', async () => {
    const service = new DriveAuthorizationService()
    const child = processMock()
    const pending = service.start('owner')
    child.stdout.write(authUrl + '\n')
    const attempt = await pending
    await expect(service.finish('owner', attempt.attemptId, 'x\ny')).rejects.toThrow('inválido')
    const finish = expect(service.finish('owner', attempt.attemptId, 'invalid-test-code')).rejects.toThrow('O Google não concluiu')
    child.emit('close', 1)
    await finish
    expect(mocks.invalidate).not.toHaveBeenCalled()
  })
})

describe('permissões verificadas na API', () => {
  it('aceita titular autenticado e rejeita cabeçalhos forjados, outro usuário e origem externa', async () => {
    const app = Fastify()
    await app.register(cookie)
    await app.register(jwt, { secret: 'unit-test-only-secret-never-production' })
    app.get('/manager', request => ({ manager: driveConnectionManager(request)?.id || null }))
    await app.register(routes)
    const session = (username: string, sub: string) => `aletis_session=${app.jwt.sign({ kind: 'internal', username, sub })}`
    const owner = session('christian', 'consultor-christian')
    const other = session('regis', 'consultor-regis')
    expect((await app.inject({ url: '/manager', headers: { cookie: owner } })).json().manager).toBe('consultor-christian')
    for (const headers of [{ 'x-user-id': 'consultor-christian', 'x-aletis-role': 'admin_master' }, { cookie: other, 'x-aletis-role': 'admin_master' }]) {
      const denied = await app.inject({ method: 'POST', url: '/api/integrations/google/drive/authorization/start', headers })
      expect(denied.statusCode).toBe(403)
    }
    expect((await app.inject({ method: 'POST', url: '/api/integrations/google/drive/authorization/start', headers: { cookie: owner, origin: 'https://external.invalid' } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: '/api/integrations/google/drive/authorization/complete', headers: { cookie: owner }, payload: { attemptId: 'wrong', code: 'secret' } })).statusCode).toBe(400)
    expect(mocks.spawn).not.toHaveBeenCalled()
    await app.close()
  })
  it('preparação OAuth persistente exige o titular e mesma origem, sem executar login SDK', async () => {
    const app = Fastify()
    await app.register(cookie); await app.register(jwt, { secret: 'unit-test-corporate-oauth-only' }); await app.register(routes)
    const owner=`aletis_session=${app.jwt.sign({ kind:'internal',username:'christian',sub:'consultor-christian' })}`
    const other=`aletis_session=${app.jwt.sign({ kind:'internal',username:'regis',sub:'consultor-regis' })}`
    const prefix='/api/integrations/google/drive/corporate'
    for (const headers of [{}, {cookie:other}, {'x-user-id':'consultor-christian'}]) {
      expect((await app.inject({url:prefix+'/status',headers})).statusCode).toBe(403)
      expect((await app.inject({method:'POST',url:prefix+'/authorization/start',headers})).statusCode).toBe(403)
    }
    const status=await app.inject({url:prefix+'/status',headers:{cookie:owner}})
    expect(status.statusCode).toBe(200); expect(status.headers['cache-control']).toBe('private, no-store')
    expect(status.json().data).toMatchObject({oauthConfigured:false,selected:false,setup:{clientsUrl:'https://console.cloud.google.com/auth/clients'}})
    expect((await app.inject({method:'POST',url:prefix+'/authorization/start',headers:{cookie:owner,origin:'https://external.invalid'}})).statusCode).toBe(403)
    const started=await app.inject({method:'POST',url:prefix+'/authorization/start',headers:{cookie:owner}})
    expect(started.statusCode).toBe(200)
    expect(mocks.corporateUrl).toHaveBeenCalledWith(expect.objectContaining({userId:'consultor-christian'}),undefined,'/configuracoes?tab=google')
    expect(mocks.spawn).not.toHaveBeenCalled()
    await app.close()
  })
})
