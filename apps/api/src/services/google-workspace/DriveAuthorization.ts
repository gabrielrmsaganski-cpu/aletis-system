import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import { resolveInternalSession } from '../../lib/internal-auth.js'
import { getGcloudDriveCredentials } from './gcloudDriveCredentials.js'

const AUTH_TTL_MS = 10 * 60_000
const START_TIMEOUT_MS = 15_000

export class DriveAuthorizationError extends Error {
  constructor(message: string, public readonly statusCode = 400) { super(message) }
}

/** A identidade vem do JWT validado; cabeçalhos de papel/e-mail não concedem acesso. */
export function driveConnectionManager(request: FastifyRequest) {
  const user = resolveInternalSession(request.server, request)
  if (!user) return null
  const account = getGcloudDriveCredentials().account()
  const allowed = (process.env.GOOGLE_DRIVE_ADMIN_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
  return (account && user.email.toLowerCase() === account.toLowerCase()) || allowed.includes(user.id) ? user : null
}

interface AuthorizationAttempt {
  id: string
  owner: string
  account: string
  expiresAt: number
  process: ChildProcessWithoutNullStreams
  authorizationUrl?: string
  submitted: boolean
  result: Promise<void>
  expire: () => void
}

/** Uma autorização curta por servidor. Códigos, PKCE e saídas do gcloud nunca vão aos logs. */
export class DriveAuthorizationService {
  private attempt: AuthorizationAttempt | null = null

  async start(owner: string): Promise<{ attemptId: string; authorizationUrl: string; expiresAt: string; account: string }> {
    const account = getGcloudDriveCredentials().account()
    if (!account) throw new DriveAuthorizationError('A conta corporativa do Drive não está configurada.')
    const current = this.attempt
    if (current && current.expiresAt > Date.now()) {
      if (current.owner !== owner || current.submitted || !current.authorizationUrl) {
        throw new DriveAuthorizationError('Uma autorização do Drive já está em andamento. Aguarde ou cancele a tentativa anterior.', 409)
      }
      return this.publicAttempt(current)
    }
    current?.expire()

    const child = spawn(process.env.GOOGLE_GCLOUD_BIN || 'gcloud', [
      'auth', 'login', account, '--enable-gdrive-access', '--no-launch-browser', '--no-activate', '--force',
    ], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CLOUDSDK_CORE_DISABLE_PROMPTS: 'false' } })
    let resolveResult!: () => void
    let rejectResult!: (error: Error) => void
    const result = new Promise<void>((resolve, reject) => { resolveResult = resolve; rejectResult = reject })
    // A conclusão pode ocorrer entre as duas requisições HTTP.
    void result.catch(() => undefined)
    const attempt: AuthorizationAttempt = {
      id: randomUUID(), owner, account, expiresAt: Date.now() + AUTH_TTL_MS, process: child, submitted: false, result,
      expire: () => {
        child.kill('SIGTERM')
        rejectResult(new DriveAuthorizationError('A tentativa de autorização expirou. Inicie novamente.', 410))
        if (this.attempt === attempt) this.attempt = null
      },
    }
    this.attempt = attempt
    child.stdin.on('error', () => {
      rejectResult(new DriveAuthorizationError('A tentativa foi encerrada pelo Google. Inicie uma nova autorização.'))
      attempt.expire()
    })
    const expiry = setTimeout(attempt.expire, AUTH_TTL_MS)
    expiry.unref()

    const started = new Promise<void>((resolve, reject) => {
      const startTimer = setTimeout(() => {
        reject(new DriveAuthorizationError('Não foi possível iniciar a autorização Google. Tente novamente.', 503))
        attempt.expire()
      }, START_TIMEOUT_MS)
      startTimer.unref()
      let output = ''
      const read = (chunk: Buffer) => {
        output = (output + chunk.toString('utf8')).slice(-32_768)
        const match = output.match(/(https:\/\/accounts\.google\.com\/[^\s\u001b]+)[\s\u001b]/)
        if (!match) return
        const url = new URL(match[1])
        if (url.origin !== 'https://accounts.google.com' || url.searchParams.get('response_type') !== 'code' || !url.searchParams.has('code_challenge')) return
        attempt.authorizationUrl = url.toString()
        output = ''
        clearTimeout(startTimer)
        resolve()
      }
      child.stdout.on('data', read)
      child.stderr.on('data', read)
      child.on('error', () => {
        clearTimeout(startTimer)
        clearTimeout(expiry)
        const error = new DriveAuthorizationError('O serviço de autorização Google está indisponível no servidor.', 503)
        reject(error)
        rejectResult(error)
        if (this.attempt === attempt) this.attempt = null
      })
      child.on('close', code => {
        clearTimeout(startTimer)
        clearTimeout(expiry)
        output = ''
        if (code === 0 && attempt.submitted) {
          getGcloudDriveCredentials().invalidate()
          resolveResult()
        } else {
          const error = new DriveAuthorizationError('O Google não concluiu a autorização. Confira a conta e inicie uma nova tentativa.')
          reject(error)
          rejectResult(error)
        }
        // Mantém a tentativa submetida até finish consumir o resultado.
        if (!attempt.submitted && this.attempt === attempt) this.attempt = null
      })
    })
    await started
    return this.publicAttempt(attempt)
  }

  async finish(owner: string, attemptId: string, code: string): Promise<void> {
    const attempt = this.owned(owner, attemptId)
    if (attempt.submitted) throw new DriveAuthorizationError('Este código já está sendo verificado.', 409)
    if (!code.trim() || code.length > 4096 || /[\r\n\u0000]/.test(code)) throw new DriveAuthorizationError('Código de autorização inválido.')
    attempt.submitted = true
    // stdin, nunca shell/argumentos de processo, arquivo ou URL.
    attempt.process.stdin.end(`${code.trim()}\n`)
    const timeout = setTimeout(attempt.expire, 30_000)
    timeout.unref()
    try { await attempt.result } finally {
      clearTimeout(timeout)
      if (this.attempt === attempt) this.attempt = null
    }
  }

  cancel(owner: string, attemptId: string): void { this.owned(owner, attemptId).expire() }

  private owned(owner: string, id: string): AuthorizationAttempt {
    const attempt = this.attempt
    if (!attempt || attempt.id !== id || attempt.owner !== owner) throw new DriveAuthorizationError('Tentativa de autorização não encontrada.', 404)
    if (attempt.expiresAt <= Date.now()) { attempt.expire(); throw new DriveAuthorizationError('A autorização expirou. Inicie novamente.', 410) }
    return attempt
  }

  private publicAttempt(attempt: AuthorizationAttempt) {
    return { attemptId: attempt.id, authorizationUrl: attempt.authorizationUrl!, expiresAt: new Date(attempt.expiresAt).toISOString(), account: attempt.account }
  }
}

let singleton: DriveAuthorizationService | undefined
export function getDriveAuthorizationService() { return singleton ??= new DriveAuthorizationService() }
