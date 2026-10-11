import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { GOOGLE_SCOPES } from './schemas.js'
import { GoogleConnectionError } from './connectionErrors.js'

const execFileAsync = promisify(execFile)
const MAX_TOKEN_TTL_MS = 45 * 60_000
const UNKNOWN_EXPIRY_TTL_MS = 60_000
const EXPIRY_MARGIN_MS = 60_000

interface CachedToken {
  account: string
  value: string
  expiresAt: number
}

interface TokenRequest {
  account: string
  generation: number
  forceRefresh: boolean
  promise: Promise<string>
}

export interface GcloudCredentialDependencies {
  runGcloud: (args: string[]) => Promise<string>
  now: () => number
}

function configuredAccount(): string | null {
  const account = process.env.GOOGLE_DRIVE_GCLOUD_ACCOUNT?.trim()
  return account || null
}

export class GcloudDriveCredentials {
  private cachedToken: CachedToken | null = null
  private tokenRequest: TokenRequest | null = null
  private generation = 0
  private activeAccount: string | null = null
  private readonly deps: GcloudCredentialDependencies

  constructor(overrides: Partial<GcloudCredentialDependencies> = {}) {
    this.deps = {
      runGcloud: async args => {
        const { stdout } = await execFileAsync(process.env.GOOGLE_GCLOUD_BIN || 'gcloud', args, { encoding: 'utf8', timeout: 15_000, maxBuffer: 8_192 })
        return stdout
      },
      now: () => Date.now(),
      ...overrides,
    }
  }

  account(): string | null {
    return configuredAccount()
  }

  invalidate(rejectedToken?: string): boolean {
    // Um 401 atrasado não pode descartar o token que já substituiu o rejeitado.
    if (rejectedToken !== undefined && this.cachedToken?.value !== rejectedToken) return false
    this.cachedToken = null
    this.tokenRequest = null
    this.generation += 1
    return true
  }

  supports(requiredScope?: string): boolean {
    if (!configuredAccount()) return false
    return requiredScope === GOOGLE_SCOPES.drive
      || requiredScope === GOOGLE_SCOPES.driveFile
      || requiredScope === GOOGLE_SCOPES.docs
  }

  async getAccessToken(): Promise<string> {
    const account = this.currentAccount()
    if (this.cachedToken && this.cachedToken.account === account && this.cachedToken.expiresAt > this.deps.now()) {
      return this.cachedToken.value
    }
    return this.acquireToken(account, false)
  }

  async refreshAccessToken(rejectedToken: string): Promise<string> {
    const account = this.currentAccount()
    if (this.cachedToken?.account === account && this.cachedToken.value !== rejectedToken && this.cachedToken.expiresAt > this.deps.now()) return this.cachedToken.value
    const pending = this.tokenRequest
    if (pending?.account === account && pending.generation === this.generation) {
      const token = await pending.promise
      // Renovações normais em andamento podem já ter resolvido o 401. Não inicie uma por requisição.
      if (pending.forceRefresh || token !== rejectedToken) return token
      return this.refreshAccessToken(rejectedToken)
    }
    this.invalidate(rejectedToken)
    return this.acquireToken(account, true)
  }

  private currentAccount(): string {
    const account = configuredAccount()
    if (!account) throw new GoogleConnectionError('SERVER_CONFIGURATION', 'Conta corporativa do Google Drive não configurada.')
    if (account !== this.activeAccount) {
      this.invalidate()
      this.activeAccount = account
    }
    return account
  }

  private acquireToken(account: string, forceRefresh: boolean): Promise<string> {
    if (this.tokenRequest?.account === account && this.tokenRequest.generation === this.generation) return this.tokenRequest.promise
    const generation = this.generation
    const request: TokenRequest = { account, generation, forceRefresh, promise: Promise.resolve('') }
    request.promise = this.requestAccessToken(account, generation, forceRefresh).finally(() => {
      if (this.tokenRequest === request) this.tokenRequest = null
    })
    this.tokenRequest = request
    return request.promise
  }

  private async requestAccessToken(account: string, generation: number, forceRefresh: boolean): Promise<string> {
    try {
      // print-access-token não informa a validade restante e pode devolver um token perto de expirar.
      const stdout = await this.deps.runGcloud(['config', 'config-helper', `--account=${account}`, '--format=json(credential)', '--quiet', forceRefresh ? '--force-auth-refresh' : '--min-expiry=120s'])
      const data = JSON.parse(stdout) as { credential?: { access_token?: unknown; token_expiry?: unknown } }
      const credential = data?.credential
      const token = typeof credential?.access_token === 'string' ? credential.access_token.trim() : ''
      if (!token || /\s/.test(token)) throw new Error('Token do Google Drive inválido.')
      const expiry = typeof credential?.token_expiry === 'string' ? Date.parse(credential.token_expiry) : Number.NaN
      const now = this.deps.now()
      if (Number.isFinite(expiry) && expiry <= now + EXPIRY_MARGIN_MS) throw new GoogleConnectionError('TEMPORARILY_UNAVAILABLE', 'A autorização Google retornou um token sem validade suficiente. Tente novamente em instantes.')
      if (generation !== this.generation || account !== configuredAccount()) throw new GoogleConnectionError('TEMPORARILY_UNAVAILABLE', 'A autorização Google mudou durante a consulta. Repita a operação no contexto atual.')
      const expiresAt = Number.isFinite(expiry) ? Math.min(expiry - EXPIRY_MARGIN_MS, now + MAX_TOKEN_TTL_MS) : now + UNKNOWN_EXPIRY_TTL_MS
      this.cachedToken = { account, value: token, expiresAt }
      return token
    } catch (error) {
      if (error instanceof GoogleConnectionError) throw error
      const failure = error as { code?: string; stderr?: string }
      if (failure.code === 'ENOENT') throw new GoogleConnectionError('SERVER_CONFIGURATION', 'O serviço de autorização Google não foi encontrado no servidor.')
      if (/reauth|invalid_grant|login|credentials|refresh.*token/i.test(failure.stderr || '')) {
        throw new GoogleConnectionError('AUTH_REQUIRED', 'A autorização corporativa do Google Drive precisa ser reconectada.')
      }
      throw new GoogleConnectionError('TEMPORARILY_UNAVAILABLE', 'Não foi possível consultar a autorização Google. Tente novamente em instantes.')
    }
  }
}

let singleton: GcloudDriveCredentials | null = null

export function getGcloudDriveCredentials(): GcloudDriveCredentials {
  if (!singleton) singleton = new GcloudDriveCredentials()
  return singleton
}
