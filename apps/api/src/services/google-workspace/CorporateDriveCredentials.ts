import { createHash } from 'node:crypto'
import { getGcloudDriveCredentials } from './gcloudDriveCredentials.js'
import { getGoogleTokenStore, type CorporateConnectionTokens } from './tokenStore.js'
import { GoogleConnectionError } from './connectionErrors.js'
import { GOOGLE_SCOPES, type GoogleTokens } from './schemas.js'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const REFRESH_MARGIN_MS = 90_000
const FORBIDDEN_SCOPES = ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/accounts.reauth']
export const CORPORATE_DRIVE_SCOPES = [GOOGLE_SCOPES.profile, GOOGLE_SCOPES.email, GOOGLE_SCOPES.drive]

export interface CorporateDrivePreflight {
  connectionMode: 'gcloud_drive' | 'corporate_oauth' | 'unconfigured'
  oauthConfigured: boolean
  selected: boolean
  ready: boolean
  missingEnv: string[]
  diagnostic?: { code: string; message: string }
  scopes: string[]
}

interface Dependencies {
  store: Pick<ReturnType<typeof getGoogleTokenStore>, 'missingEnv' | 'corporatePreflight' | 'withCorporateConnection'>
  gcloud: Pick<ReturnType<typeof getGcloudDriveCredentials>, 'account' | 'getAccessToken' | 'refreshAccessToken' | 'invalidate'>
  fetch: typeof fetch
  now: () => number
}

/** Uma identidade corporativa para API e trabalhadores. A seleção OAuth
 * explícita nunca troca de credencial silenciosamente após uma falha. */
export class CorporateDriveCredentials {
  private readonly deps: Dependencies
  private pending: Promise<string> | null = null
  private lastTokenHash: string | null = null
  private rejectedTokenHash: string | null = null
  private forceNext = false
  private lastMode: CorporateDrivePreflight['connectionMode'] = 'unconfigured'

  constructor(overrides: Partial<Dependencies> = {}) {
    this.deps = { store: getGoogleTokenStore(), gcloud: getGcloudDriveCredentials(), fetch: globalThis.fetch, now: Date.now, ...overrides }
  }

  account(): string | null { return this.deps.gcloud.account() }
  supports(scope?: string): boolean {
    return Boolean(this.account()) && [GOOGLE_SCOPES.drive, GOOGLE_SCOPES.driveFile, GOOGLE_SCOPES.docs].includes(scope as any)
  }

  private tenant(): string { return process.env.ALETIS_TENANT_ID || 'default' }
  private validate(connection: CorporateConnectionTokens) {
    const missing = this.deps.store.missingEnv()
    if (missing.length) throw new GoogleConnectionError('SERVER_CONFIGURATION', 'A conexão OAuth corporativa selecionada exige completar a configuração do aplicativo.')
    if (connection.row.tenantId !== this.tenant()) throw new GoogleConnectionError('ACCOUNT_MISMATCH', 'A conexão corporativa pertence a outro contexto.')
    const account = this.account()
    if (!account || connection.row.googleEmail?.trim().toLowerCase() !== account.trim().toLowerCase()) throw new GoogleConnectionError('ACCOUNT_MISMATCH', 'A conexão OAuth selecionada não corresponde à conta corporativa configurada.')
    if (connection.row.status !== 'connected' || connection.row.revokedAt || !connection.tokens.refreshToken) throw new GoogleConnectionError('AUTH_REQUIRED', 'A conexão OAuth corporativa selecionada não tem autorização offline ativa.')
    const metadata = connection.row.metadata as Record<string, unknown>
    if (metadata?.oauthClientIdFingerprint !== hash(process.env.GOOGLE_CLIENT_ID || '')) throw new GoogleConnectionError('SERVER_CONFIGURATION', 'A configuração OAuth mudou desde a autorização corporativa selecionada.')
    this.validateScopes(connection.tokens.scopes)
  }

  private validateScopes(scopes: string[]) {
    if (!scopes.includes(GOOGLE_SCOPES.drive) || FORBIDDEN_SCOPES.some(scope => scopes.includes(scope))) throw new GoogleConnectionError('PERMISSION_DENIED', 'A conexão corporativa exige autorização do Drive completo, sem escopos de sessão do Google Cloud.')
  }

  /** Consulta apenas configuração e seleção persistida, sem renovar ou abrir login. */
  async statusPreflight(): Promise<CorporateDrivePreflight> {
    const missingEnv = this.deps.store.missingEnv()
    let selected = false
    try {
      const connection = await this.deps.store.corporatePreflight(this.tenant())
      selected = Boolean(connection)
      if (connection) {
        this.validate(connection)
        return { connectionMode: 'corporate_oauth', oauthConfigured: true, selected: true, ready: true, missingEnv, scopes: connection.tokens.scopes }
      }
      const available = Boolean(this.account())
      return { connectionMode: available ? 'gcloud_drive' : 'unconfigured', oauthConfigured: missingEnv.length === 0, selected: false, ready: available, missingEnv, scopes: available ? [GOOGLE_SCOPES.drive] : [] }
    } catch (error) {
      const diagnostic = error instanceof GoogleConnectionError ? { code: error.code, message: error.message }
        : { code: 'TEMPORARILY_UNAVAILABLE', message: 'Não foi possível verificar a seleção corporativa persistida.' }
      return { connectionMode: selected ? 'corporate_oauth' : 'unconfigured', oauthConfigured: missingEnv.length === 0, selected, ready: false, missingEnv, diagnostic, scopes: [] }
    }
  }

  invalidate(rejectedToken?: string): boolean {
    if (rejectedToken !== undefined && this.lastTokenHash && hash(rejectedToken) !== this.lastTokenHash) return false
    if (rejectedToken !== undefined) this.rejectedTokenHash = hash(rejectedToken)
    else this.forceNext = true
    // O SDK cuida de seu cache. Tokens de renovação e registros PG são preservados.
    if (this.lastMode === 'gcloud_drive') this.deps.gcloud.invalidate(rejectedToken)
    return true
  }

  async getAccessToken(): Promise<string> {
    if (this.pending) return this.pending
    return this.acquire()
  }

  async refreshAccessToken(rejectedToken?: string): Promise<string> {
    if (this.pending) {
      const token = await this.pending
      if (rejectedToken !== undefined && token !== rejectedToken) return token
    }
    return this.acquire(rejectedToken, true)
  }

  private acquire(rejectedToken?: string, force = false): Promise<string> {
    if (this.pending) return this.pending
    const tenant = this.tenant()
    const account = this.account()
    let operation!: Promise<string>
    operation = (async () => {
      const result = await this.deps.store.withCorporateConnection(tenant, async connection => {
        this.lastMode = 'corporate_oauth'
        this.validate(connection)
        const token = connection.tokens.accessToken
        const currentValid = Boolean(connection.tokens.tokenExpiry && connection.tokens.tokenExpiry.getTime() > this.deps.now() + REFRESH_MARGIN_MS)
        const rejectedCurrent = this.rejectedTokenHash === hash(token)
        const needsRefresh = !token || !currentValid || rejectedCurrent || this.forceNext || (force && (rejectedToken === undefined || token === rejectedToken))
        if (!needsRefresh) return { value: token }
        const tokens = await this.refreshOAuth(connection.tokens)
        this.validateScopes(tokens.scopes)
        return { value: tokens.accessToken, tokens }
      })
      let token: string
      if (result === null) {
        this.lastMode = 'gcloud_drive'
        token = force || this.forceNext || this.rejectedTokenHash
          ? await this.deps.gcloud.refreshAccessToken(rejectedToken ?? await this.deps.gcloud.getAccessToken())
          : await this.deps.gcloud.getAccessToken()
      } else token = result
      if (tenant !== this.tenant() || account !== this.account()) throw new GoogleConnectionError('ACCOUNT_MISMATCH', 'A identidade corporativa mudou durante a consulta.')
      this.lastTokenHash = hash(token)
      this.rejectedTokenHash = null
      this.forceNext = false
      return token
    })().finally(() => { if (this.pending === operation) this.pending = null })
    this.pending = operation
    return operation
  }

  private async refreshOAuth(current: GoogleTokens): Promise<GoogleTokens> {
    let response: Response
    try {
      response = await this.deps.fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: current.refreshToken!, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET! }),
        signal: AbortSignal.timeout(15_000), redirect: 'error',
      })
    } catch { throw new GoogleConnectionError('TEMPORARILY_UNAVAILABLE', 'Não foi possível renovar a autorização corporativa agora. A conexão persistida foi preservada.') }
    const data: any = await response.json().catch(() => null)
    if (!response.ok) {
      if (data?.error === 'invalid_client' || data?.error === 'unauthorized_client') throw new GoogleConnectionError('SERVER_CONFIGURATION', 'O Google recusou a configuração do aplicativo OAuth corporativo.')
      if (data?.error === 'invalid_grant') throw new GoogleConnectionError('AUTH_REQUIRED', 'O Google recusou a autorização offline selecionada; confirme revogação ou política de sessão antes de reconectar.')
      throw new GoogleConnectionError(response.status === 403 ? 'PERMISSION_DENIED' : 'TEMPORARILY_UNAVAILABLE', 'O Google não concluiu a renovação corporativa. A credencial anterior foi preservada.')
    }
    if (typeof data?.access_token !== 'string' || !data.access_token || typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in <= REFRESH_MARGIN_MS / 1000) throw new GoogleConnectionError('TEMPORARILY_UNAVAILABLE', 'O Google retornou uma autorização sem validade suficiente.')
    return { accessToken: data.access_token, refreshToken: typeof data.refresh_token === 'string' && data.refresh_token ? data.refresh_token : current.refreshToken,
      tokenExpiry: new Date(this.deps.now() + data.expires_in * 1000), scopes: typeof data.scope === 'string' ? [...new Set<string>((data.scope as string).split(/\s+/).filter(Boolean))] : current.scopes }
  }
}

let singleton: CorporateDriveCredentials | undefined
export function getCorporateDriveCredentials(): CorporateDriveCredentials { return singleton ??= new CorporateDriveCredentials() }
