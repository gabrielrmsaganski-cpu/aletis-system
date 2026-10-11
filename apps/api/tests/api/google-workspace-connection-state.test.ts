import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const credentials = vi.hoisted(() => ({ account: vi.fn(), getAccessToken: vi.fn(), refreshAccessToken: vi.fn(), invalidate: vi.fn(), statusPreflight: vi.fn() }))
const store = vi.hoisted(() => ({ missingEnv: vi.fn(), publicStatus: vi.fn() }))
vi.mock('../../src/services/google-workspace/CorporateDriveCredentials.js', () => ({ getCorporateDriveCredentials: () => credentials }))
vi.mock('../../src/services/google-workspace/tokenStore.js', () => ({ getGoogleTokenStore: () => store }))
import { GoogleWorkspaceService } from '../../src/services/google-workspace/services'

beforeEach(() => {
  credentials.account.mockReset().mockReturnValue('conta-corporativa@example.test')
  credentials.getAccessToken.mockReset().mockRejectedValue(new Error('Authorization expired'))
  credentials.invalidate.mockReset()
  credentials.refreshAccessToken.mockReset().mockResolvedValue('token-renovado')
  store.missingEnv.mockReset().mockReturnValue(['GOOGLE_CLIENT_ID'])
  store.publicStatus.mockReset().mockResolvedValue({ status: 'disconnected', configured: true })
  credentials.statusPreflight.mockReset().mockImplementation(async () => ({ connectionMode: credentials.account() ? 'gcloud_drive' : 'unconfigured', selected: false, ready: Boolean(credentials.account()), oauthConfigured: store.missingEnv().length === 0, missingEnv: store.missingEnv(), scopes: ['https://www.googleapis.com/auth/drive'] }))
  vi.stubEnv('ALETIS_TENANT_ID', 'test')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { emailAddress: 'conta-corporativa@example.test' } }))))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })
const actor = { userId: 'test-user', userName: 'Test', role: 'admin_master', tenantId: 'test' }

it('conta gcloud existente não faz o status afirmar disponibilidade de OAuth', async () => {
  const status = await new GoogleWorkspaceService().status(actor)
  expect(status).toMatchObject({ status: 'error', connectionMode: 'gcloud_drive', configured: true, oauthConfigured: false })
  expect(status.features.drive).toBe('Autorização necessária')
})

it('informa OAuth realmente configurado mesmo quando a autorização gcloud precisa ser renovada', async () => {
  store.missingEnv.mockReturnValue([])
  expect(await new GoogleWorkspaceService().status(actor)).toMatchObject({ status: 'error', oauthConfigured: true })
})

it('mantém OAuth independente do sucesso da credencial corporativa', async () => {
  credentials.getAccessToken.mockResolvedValue('token-de-teste')
  expect(await new GoogleWorkspaceService().status(actor)).toMatchObject({ status: 'connected', oauthConfigured: false })
  expect(fetch).toHaveBeenCalledWith('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', expect.objectContaining({
    method: 'GET', headers: { Authorization: 'Bearer token-de-teste' }, signal: expect.any(AbortSignal),
  }))
})

it('expõe a mesma capacidade quando usa o cadastro OAuth', async () => {
  credentials.account.mockReturnValue(null)
  store.missingEnv.mockReturnValue([])
  expect(await new GoogleWorkspaceService().status(actor)).toMatchObject({ status: 'disconnected', oauthConfigured: true })
  expect(fetch).not.toHaveBeenCalled()
})

it('token válido sem permissão Drive retorna autorização necessária e não tenta usar OAuth de outra conta', async () => {
  credentials.getAccessToken.mockResolvedValue('token-de-teste')
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Insufficient Permission' } }), { status: 403 }))
  const result = await new GoogleWorkspaceService().status(actor)
  expect(result).toMatchObject({ status: 'error', connectionMode: 'gcloud_drive', features: { drive: 'Autorização necessária', docs: 'Autorização necessária' } })
  expect(store.publicStatus).not.toHaveBeenCalled()
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('resposta 200 sem usuário verificável ou com outra conta não confirma a conexão', async () => {
  credentials.getAccessToken.mockResolvedValue('token-de-teste')
  for (const payload of [{}, { user: { emailAddress: 'outra-conta@example.test' } }]) {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(payload)))
    expect(await new GoogleWorkspaceService().status(actor)).toMatchObject({ status: 'error', features: { drive: 'Autorização necessária' } })
  }
})

it('compartilha a verificação simultânea e revalida depois do cache curto', async () => {
  vi.useFakeTimers()
  credentials.getAccessToken.mockResolvedValue('token-de-teste')
  let resolve!: (response: Response) => void
  vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>(done => { resolve = done }))
  const service = new GoogleWorkspaceService()
  const pending = [service.status(actor), service.status(actor), service.status(actor)]
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  expect(fetch).toHaveBeenCalledTimes(1)
  resolve(new Response(JSON.stringify({ user: { emailAddress: 'conta-corporativa@example.test' } })))
  expect((await Promise.all(pending)).map(result => result.status)).toEqual(['connected', 'connected', 'connected'])
  await service.status(actor)
  expect(fetch).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(30_001)
  await service.status(actor)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('não reutiliza sucesso entre tokens ou contas diferentes', async () => {
  credentials.getAccessToken.mockResolvedValue('token-1')
  vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ user: { emailAddress: 'conta-corporativa@example.test' } })))
  const service = new GoogleWorkspaceService()
  expect((await service.status(actor)).status).toBe('connected')
  credentials.getAccessToken.mockResolvedValue('token-2')
  expect((await service.status(actor)).status).toBe('connected')
  credentials.account.mockReturnValue('outra-conta@example.test')
  expect((await service.status(actor)).status).toBe('error')
  expect(fetch).toHaveBeenCalledTimes(3)
})

it('401 atrasado da verificação de status não invalida a credencial nova', async () => {
  let token = 'token-antigo'
  credentials.getAccessToken.mockImplementation(async () => token)
  credentials.refreshAccessToken.mockImplementation(async () => token)
  credentials.invalidate.mockImplementation((rejected: string) => {
    if (token !== rejected) return false
    token = ''
    return true
  })
  let finish!: (response: Response) => void
  vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>(resolve => { finish = resolve }))
  const service = new GoogleWorkspaceService()
  const pending = service.status(actor)
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  token = 'token-renovado'
  finish(new Response('{}', { status: 401 }))
  expect((await pending).status).toBe('connected')
  expect(credentials.invalidate).toHaveBeenCalledWith('token-antigo')
  expect(token).toBe('token-renovado')
  expect((await service.status(actor)).status).toBe('connected')
})

it('renova um 401 uma vez e confirma o Drive antes de declarar conexão', async () => {
  credentials.getAccessToken.mockResolvedValue('token-antigo')
  vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 401 }))
  expect((await new GoogleWorkspaceService().status(actor)).status).toBe('connected')
  expect(credentials.refreshAccessToken).toHaveBeenCalledExactlyOnceWith('token-antigo')
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('segundo 401 mantém erro explícito sem terceira consulta ou troca de provedor', async () => {
  credentials.getAccessToken.mockResolvedValue('token-antigo')
  vi.mocked(fetch).mockImplementation(async () => new Response('{}', { status: 401 }))
  expect(await new GoogleWorkspaceService().status(actor)).toMatchObject({ status: 'error', diagnostic: { code: 'AUTH_REQUIRED' } })
  expect(credentials.refreshAccessToken).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(store.publicStatus).not.toHaveBeenCalled()
})

it('repete a consulta após falha transitória, sem reutilizar erro indefinidamente', async () => {
  vi.useFakeTimers()
  credentials.getAccessToken.mockResolvedValue('token-de-teste')
  vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 403 }))
  const service = new GoogleWorkspaceService()
  expect((await service.status(actor)).status).toBe('error')
  expect((await service.status(actor)).status).toBe('error')
  expect(fetch).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(5_001)
  expect((await service.status(actor)).status).toBe('connected')
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('interrompe a leitura do Drive após cinco segundos e permite tentar novamente', async () => {
  vi.useFakeTimers()
  credentials.getAccessToken.mockResolvedValue('token-de-teste')
  vi.mocked(fetch).mockImplementationOnce(async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  }))
  const service = new GoogleWorkspaceService()
  const pending = service.status(actor)
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(5_000)
  expect((await pending).status).toBe('error')
  await vi.advanceTimersByTimeAsync(5_001)
  expect((await service.status(actor)).status).toBe('connected')
})
