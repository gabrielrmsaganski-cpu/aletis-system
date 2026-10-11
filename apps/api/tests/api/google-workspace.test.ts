import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
vi.mock('../../src/services/google-workspace/CorporateDriveCredentials.js', () => ({
  getCorporateDriveCredentials: () => ({ account: () => null, supports: () => false,
    statusPreflight: async () => ({ connectionMode: 'unconfigured', selected: false, ready: false, oauthConfigured: true, missingEnv: [], scopes: [] }) }),
  CORPORATE_DRIVE_SCOPES: ['openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/drive'],
}))

describe('Google Workspace API', () => {
  let app: FastifyInstance
  const originalFetch = globalThis.fetch

  beforeAll(async () => {
    process.env.ALETIS_PG_ENABLED = '0'
    process.env.ALIX_USE_LLM = 'false'
    process.env.ALETIS_RBAC_STRICT = 'false'
    process.env.GOOGLE_WORKSPACE_ENABLED = 'true'
    process.env.GOOGLE_CLIENT_ID = 'google-client-test'
    process.env.GOOGLE_CLIENT_SECRET = 'google-secret-test'
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = 'test-google-token-encryption-key-32bytes'
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3001/api/integrations/google/callback'
    process.env.GOOGLE_DRIVE_GCLOUD_ACCOUNT = ''
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = ''
    process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID = ''
    const mod = await import('../../src/server.js')
    app = await mod.buildApp()
    await app.ready()
  }, 30_000)

  afterAll(async () => {
    globalThis.fetch = originalFetch
    if (app) await app.close()
  })

  it('expõe status sem vazar tokens', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/integrations/google/status' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.success).toBe(true)
    expect(body.data.configured).toBe(true)
    expect(JSON.stringify(body.data)).not.toContain('access')
    expect(JSON.stringify(body.data)).not.toContain('refresh')
  })

  it('gera URL OAuth e salva conexão no callback', async () => {
    const auth = await app.inject({ method: 'GET', url: '/api/integrations/google/auth-url' })
    expect(auth.statusCode).toBe(200)
    const authorizationUrl = auth.json().data.authorizationUrl
    expect(authorizationUrl).toContain('accounts.google.com')
    const state = new URL(authorizationUrl).searchParams.get('state')
    expect(state).toBeTruthy()

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/token')) {
        return new Response(JSON.stringify({
          access_token: 'access-token-test',
          refresh_token: 'refresh-token-test',
          expires_in: 3600,
          scope: [
            'openid',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/drive.file',
          ].join(' '),
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('/userinfo')) {
        return new Response(JSON.stringify({ email: 'christian@aletis.com.br', sub: 'google-user-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch

    const callback = await app.inject({
      method: 'GET',
      url: `/api/integrations/google/callback?code=oauth-code-test&state=${encodeURIComponent(state!)}`,
    })
    expect(callback.statusCode).toBe(302)

    const status = await app.inject({ method: 'GET', url: '/api/integrations/google/status' })
    const body = status.json()
    expect(body.data.status).toBe('connected')
    expect(body.data.googleEmail).toBe('christian@aletis.com.br')
    expect(body.data.features.drive).toBe('Conectado')
  })

  it('cria pasta do cliente no Drive sem duplicar vínculo', async () => {
    let driveCounter = 0
    globalThis.fetch = vi.fn(async () => {
      driveCounter += 1
      return new Response(JSON.stringify({
        id: `drive-file-${driveCounter}`,
        webViewLink: `https://drive.google.com/mock/${driveCounter}`,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch

    const created = await app.inject({
      method: 'POST',
      url: '/api/integrations/google/drive/create-client-folder',
      payload: { clientId: 'cli-002' },
    })
    expect(created.statusCode).toBe(201)
    const folder = created.json().data
    expect(folder.googleFolderId).toBe('drive-file-1')
    expect(Object.keys(folder.subfolders).length).toBeGreaterThanOrEqual(6)

    const duplicated = await app.inject({
      method: 'POST',
      url: '/api/integrations/google/drive/create-client-folder',
      payload: { clientId: 'cli-002' },
    })
    expect(duplicated.statusCode).toBe(200)
    expect(duplicated.json().data.googleFolderId).toBe('drive-file-1')
  })
})
