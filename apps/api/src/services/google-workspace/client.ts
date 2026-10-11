import { createHmac, randomUUID } from 'crypto'
import type { GoogleApiErrorBody, GoogleTokens, GoogleWorkspaceActor } from './schemas.js'
import { DEFAULT_GOOGLE_SCOPES, hasScope } from './schemas.js'
import { getCorporateDriveCredentials, CORPORATE_DRIVE_SCOPES } from './CorporateDriveCredentials.js'
import { getGoogleTokenStore, safeSecretEquals } from './tokenStore.js'
import { GoogleConnectionError } from './connectionErrors.js'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'
const GOOGLE_REQUEST_TIMEOUT_MS = Math.max(1_000, Number(process.env.GOOGLE_REQUEST_TIMEOUT_MS || 15_000))

export interface OAuthStatePayload {
  nonce: string
  exp: number
  userId: string
  tenantId: string
  returnPath?: string
  purpose?: 'corporate_drive'
}

function stateSecret(): string {
  return process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || 'aletis-google-oauth-dev-state'
}

function signStatePayload(payload: string): string {
  return createHmac('sha256', stateSecret()).update(payload).digest('base64url')
}

function encodeState(payload: OAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = signStatePayload(body)
  return `${body}.${sig}`
}

function decodeState(state: string): OAuthStatePayload {
  const [body, sig] = state.split('.')
  if (!body || !sig || !safeSecretEquals(sig, signStatePayload(body))) {
    throw new Error('Estado OAuth inválido.')
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload
  if (!payload.exp || payload.exp < Date.now()) {
    throw new Error('Estado OAuth expirado.')
  }
  return payload
}

function redirectUri(fallbackOrigin?: string): string {
  return process.env.GOOGLE_REDIRECT_URI || `${fallbackOrigin || process.env.WHATSAPP_PUBLIC_BASE_URL || 'http://localhost:3001'}/api/integrations/google/callback`
}

function normalizeScopes(scopes?: string[] | string): string[] {
  if (Array.isArray(scopes)) return [...new Set(scopes.filter(Boolean))]
  if (typeof scopes === 'string') return [...new Set(scopes.split(/\s+/).filter(Boolean))]
  return DEFAULT_GOOGLE_SCOPES
}

function tokenExpiry(expiresIn?: number): Date | null {
  if (!expiresIn || !Number.isFinite(expiresIn)) return null
  return new Date(Date.now() + Math.max(0, expiresIn - 60) * 1000)
}

async function parseGoogleError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null) as GoogleApiErrorBody | null
  if (typeof body?.error === 'string') return body.error_description || body.error
  if (body?.error?.message) return body.error.message
  return `Google API HTTP ${res.status}`
}

function requestSignal(signal?: AbortSignal | null): AbortSignal {
  const timeout = AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

function isTimeout(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name
  return name === 'AbortError' || name === 'TimeoutError'
}

export class GoogleWorkspaceClient {
  buildAuthUrl(actor: GoogleWorkspaceActor, origin?: string, returnPath = '/configuracoes?tab=google'): string {
    return this.buildOAuthUrl(actor, origin, returnPath)
  }

  buildCorporateDriveAuthUrl(actor: GoogleWorkspaceActor, origin?: string, returnPath = '/configuracoes?tab=google'): string {
    if (actor.tenantId !== (process.env.ALETIS_TENANT_ID || 'default') || !getCorporateDriveCredentials().account()) throw new GoogleConnectionError('ACCOUNT_MISMATCH', 'A conta ou o contexto corporativo não está configurado.')
    return this.buildOAuthUrl(actor, origin, returnPath, 'corporate_drive')
  }

  private buildOAuthUrl(actor: GoogleWorkspaceActor, origin: string | undefined, returnPath: string, purpose?: 'corporate_drive'): string {
    const missing = getGoogleTokenStore().missingEnv()
    if (missing.length) throw new Error(`Configuração Google Workspace incompleta: ${missing.join(', ')}`)
    const scopes = purpose === 'corporate_drive' ? CORPORATE_DRIVE_SCOPES : normalizeScopes()
    const state = encodeState({
      nonce: randomUUID(),
      exp: Date.now() + 10 * 60_000,
      userId: actor.userId,
      tenantId: actor.tenantId,
      returnPath,
      ...(purpose ? { purpose } : {}),
    })
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri(origin),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: purpose === 'corporate_drive' ? 'false' : 'true',
      scope: scopes.join(' '),
      state,
    })
    return `${AUTH_URL}?${params.toString()}`
  }

  verifyState(state: string): OAuthStatePayload {
    return decodeState(state)
  }

  async exchangeCode(code: string, origin?: string, purpose?: 'corporate_drive'): Promise<{
    tokens: GoogleTokens
    googleEmail?: string | null
    googleAccountId?: string | null
  }> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: redirectUri(origin),
        grant_type: 'authorization_code',
      }),
    })
    if (!res.ok) throw new Error(await parseGoogleError(res))
    const data = await res.json() as {
      access_token: string
      refresh_token?: string
      expires_in?: number
      scope?: string
    }
    const scopes = normalizeScopes(data.scope || (purpose === 'corporate_drive' ? CORPORATE_DRIVE_SCOPES : DEFAULT_GOOGLE_SCOPES))
    const user = await this.getUserInfo(data.access_token)
    if (purpose === 'corporate_drive') {
      const account = getCorporateDriveCredentials().account()
      if (!account || user.email_verified !== true || user.email?.trim().toLowerCase() !== account.trim().toLowerCase()) throw new GoogleConnectionError('ACCOUNT_MISMATCH', 'Autorize a mesma conta corporativa configurada para o Drive, com e-mail verificado pelo Google.')
      if (!data.refresh_token || !user.sub) throw new GoogleConnectionError('AUTH_REQUIRED', 'O Google não forneceu autorização offline completa para a conexão corporativa.')
      if (!scopes.includes('https://www.googleapis.com/auth/drive') || scopes.some(scope => ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/accounts.reauth'].includes(scope))) throw new GoogleConnectionError('PERMISSION_DENIED', 'A conexão corporativa exige Drive completo sem escopos de sessão do Google Cloud.')
    }
    return {
      tokens: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        tokenExpiry: tokenExpiry(data.expires_in),
        scopes,
      },
      googleEmail: user.email,
      googleAccountId: user.sub,
    }
  }

  async getUserInfo(accessToken: string): Promise<{ email?: string; sub?: string; email_verified?: boolean }> {
    const res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(await parseGoogleError(res))
    return await res.json() as { email?: string; sub?: string; email_verified?: boolean }
  }

  async getAccessToken(actor: GoogleWorkspaceActor, requiredScope?: string): Promise<string> {
    const corporateCredentials = getCorporateDriveCredentials()
    if (corporateCredentials.supports(requiredScope)) {
      if (actor.tenantId !== (process.env.ALETIS_TENANT_ID || 'default')) throw new GoogleConnectionError('ACCOUNT_MISMATCH', 'A conexão corporativa não pertence a este contexto.')
      return corporateCredentials.getAccessToken()
    }
    const store = getGoogleTokenStore()
    const tokens = await store.getDecryptedTokens(actor)
    if (!tokens) throw new Error('Google Workspace não conectado.')
    if (requiredScope && !hasScope(tokens.scopes, requiredScope)) {
      throw new Error('A conta Google conectada não autorizou o escopo necessário para esta ação.')
    }

    const shouldRefresh = Boolean(tokens.refreshToken && (!tokens.tokenExpiry || tokens.tokenExpiry.getTime() < Date.now() + 90_000))
    if (!shouldRefresh) return tokens.accessToken

    const refreshed = await this.refreshAccessToken(tokens.refreshToken!, tokens.scopes)
    await store.saveTokens(actor, refreshed)
    return refreshed.accessToken
  }

  async refreshAccessToken(refreshToken: string, currentScopes: string[]): Promise<GoogleTokens> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        grant_type: 'refresh_token',
      }),
    })
    if (!res.ok) throw new Error(await parseGoogleError(res))
    const data = await res.json() as { access_token: string; expires_in?: number; scope?: string }
    return {
      accessToken: data.access_token,
      refreshToken,
      tokenExpiry: tokenExpiry(data.expires_in),
      scopes: normalizeScopes(data.scope || currentScopes),
    }
  }

  async googleFetch<T>(actor: GoogleWorkspaceActor, url: string, init: RequestInit = {}, requiredScope?: string): Promise<T> {
    init.signal?.throwIfAborted()
    const credentials = getCorporateDriveCredentials()
    const corporateDrive = credentials.supports(requiredScope)
    let token = await this.getAccessToken(actor, requiredScope)
    const headers = new Headers(init.headers || {})
    headers.set('Authorization', `Bearer ${token}`)
    if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json')
    try {
      const signal = requestSignal(init.signal)
      signal.throwIfAborted()
      let res = await fetch(url, { ...init, headers, signal })
      if (res.status === 401 && corporateDrive) {
        await res.body?.cancel().catch(() => undefined)
        signal.throwIfAborted()
        token = await credentials.refreshAccessToken(token)
        signal.throwIfAborted()
        if (init.body instanceof ReadableStream) throw new GoogleConnectionError('TEMPORARILY_UNAVAILABLE', 'A autorização Google foi renovada. Repita o envio para transmitir o arquivo desde o início.')
        headers.set('Authorization', `Bearer ${token}`)
        res = await fetch(url, { ...init, headers, signal })
        if (res.status === 401) {
          await res.body?.cancel().catch(() => undefined)
          credentials.invalidate(token)
          throw new GoogleConnectionError('AUTH_REQUIRED', 'O Google recusou a autorização corporativa mesmo após renovação. Verifique a conexão selecionada e a política do provedor.')
        }
      }
      if (!res.ok) throw new Error(await parseGoogleError(res))
      if (res.status === 204) return undefined as T
      return await res.json() as T
    } catch (error) {
      if (isTimeout(error)) throw new Error('A solicitação ao Google excedeu o tempo limite.')
      throw error
    }
  }

  async revoke(actor: GoogleWorkspaceActor): Promise<void> {
    const tokens = await getGoogleTokenStore().getDecryptedTokens(actor)
    const token = tokens?.refreshToken || tokens?.accessToken
    if (!token) return
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => null)
  }
}

let singleton: GoogleWorkspaceClient | null = null

export function getGoogleWorkspaceClient(): GoogleWorkspaceClient {
  if (!singleton) singleton = new GoogleWorkspaceClient()
  return singleton
}
