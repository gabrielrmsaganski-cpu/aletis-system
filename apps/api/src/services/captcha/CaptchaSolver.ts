import axios from 'axios'

/**
 * Wrapper do serviço 2captcha.com — resolve captchas de forma programática.
 *
 * Suporta:
 *  • reCAPTCHA v2 (sitekey + URL)
 *  • reCAPTCHA v3 (sitekey + URL + action + score mínimo)
 *  • hCaptcha (sitekey + URL)
 *  • Cloudflare Turnstile (sitekey + URL)
 *  • Captcha de imagem (base64)
 *  • Text captcha (perguntas, ex.: "What is 2+2?")
 *
 * Fluxo 2captcha:
 *  1. POST em `in.php` com parâmetros do captcha → retorna taskId
 *  2. Poll em `res.php?action=get&id=taskId` até receber token ou timeout
 *
 * Custo (aprox., out-2025):
 *  - Imagem normal: $0.50 / 1000
 *  - reCAPTCHA v2:  $1.00 / 1000
 *  - reCAPTCHA v3:  $2.00 / 1000
 *  - hCaptcha:      $2.00 / 1000
 *  - Turnstile:     $1.45 / 1000
 *
 * Docs: https://2captcha.com/2captcha-api
 */

export interface CaptchaSolverConfig {
  apiKey: string
  /** Timeout total — tempo máximo aguardando resolução (default 120s). */
  timeoutMs?: number
  /** Intervalo de polling (default 5s — 2captcha recomenda ≥5s). */
  pollIntervalMs?: number
  /** Base URL — permite redirecionar para rucaptcha/nocaptcha (compat). */
  baseUrl?: string
}

export interface RecaptchaV2Request {
  sitekey: string
  pageUrl: string
  /** `true` para reCAPTCHA invisível. */
  invisible?: boolean
  /** Parâmetro `data-s` de alguns domínios Google (p. ex. accounts.google.com). */
  dataS?: string
  /** Cookies a serem enviados junto ao resolvedor (formato "a=b; c=d"). */
  cookies?: string
  /** User-agent que o worker deve usar. */
  userAgent?: string
  /** Proxy (formato "host:port" ou "user:pass@host:port"). */
  proxy?: string
  proxyType?: 'HTTP' | 'HTTPS' | 'SOCKS4' | 'SOCKS5'
}

export interface RecaptchaV3Request extends Omit<RecaptchaV2Request, 'invisible'> {
  action: string
  minScore?: number // default 0.3
}

export interface HCaptchaRequest {
  sitekey: string
  pageUrl: string
  /** hCaptcha invisível? */
  invisible?: boolean
  cookies?: string
  userAgent?: string
  proxy?: string
  proxyType?: 'HTTP' | 'HTTPS' | 'SOCKS4' | 'SOCKS5'
}

export interface TurnstileRequest {
  sitekey: string
  pageUrl: string
  action?: string
  cData?: string
  userAgent?: string
}

export interface ImageCaptchaRequest {
  imageBase64: string
  /** 0 = qualquer coisa, 1 = só dígitos, 2 = só letras, 3 = letras+dígitos, 4 = só minúsculas, 5 = só maiúsculas */
  numeric?: 0 | 1 | 2 | 3 | 4 | 5
  /** Case sensitive? */
  regsense?: boolean
  /** Tamanho mínimo esperado. */
  minLen?: number
  /** Tamanho máximo esperado. */
  maxLen?: number
  /** Instruções em inglês para o worker (pt-BR também aceito). */
  hint?: string
}

export interface CaptchaSolution {
  /** Token ou texto resolvido. */
  token: string
  /** ID da task no 2captcha — útil para reportar incorreto via `reportbad`. */
  taskId: string
  /** Tempo gasto (ms) do envio até a resolução. */
  elapsedMs: number
}

export class CaptchaSolverError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = 'CaptchaSolverError'
  }
}

/**
 * Serviço thread-safe de resolução de captchas via 2captcha.
 *
 * Uso:
 * ```ts
 * const solver = new CaptchaSolver({ apiKey: process.env.TWOCAPTCHA_API_KEY! })
 * const { token } = await solver.solveRecaptchaV2({ sitekey: '...', pageUrl: 'https://...' })
 * // anexa `g-recaptcha-response=${token}` no request real
 * ```
 */
export class CaptchaSolver {
  private readonly apiKey: string
  private readonly timeoutMs: number
  private readonly pollIntervalMs: number
  private readonly baseUrl: string

  constructor(config: CaptchaSolverConfig) {
    // Não lançamos erro se a key estiver ausente — assim o módulo carrega
    // normalmente em dev sem 2captcha configurado. Cada método de solve
    // verifica a key em runtime via `ensureKey()`.
    this.apiKey = config.apiKey ?? ''
    this.timeoutMs = config.timeoutMs ?? 120_000
    this.pollIntervalMs = config.pollIntervalMs ?? 5_000
    this.baseUrl = config.baseUrl ?? 'https://2captcha.com'
  }

  private ensureKey(): void {
    if (!this.apiKey) {
      throw new CaptchaSolverError('NO_KEY', 'TWOCAPTCHA_API_KEY não configurada')
    }
  }

  /** Consulta o saldo (USD) restante da conta. */
  async getBalance(): Promise<number> {
    this.ensureKey()
    const { data } = await axios.get(`${this.baseUrl}/res.php`, {
      params: { key: this.apiKey, action: 'getbalance', json: 1 },
      timeout: 15_000,
    })
    if (data.status !== 1) {
      throw new CaptchaSolverError('BALANCE_ERR', String(data.request ?? data.error_text ?? 'unknown'))
    }
    return Number(data.request)
  }

  async solveRecaptchaV2(req: RecaptchaV2Request): Promise<CaptchaSolution> {
    const params: Record<string, any> = {
      method: 'userrecaptcha',
      googlekey: req.sitekey,
      pageurl: req.pageUrl,
    }
    if (req.invisible) params.invisible = 1
    if (req.dataS) params['data-s'] = req.dataS
    if (req.cookies) params.cookies = req.cookies
    if (req.userAgent) params.userAgent = req.userAgent
    // 2captcha v1 API aceita 'userAgent' (camelCase). Mantemos também a forma
    // lowercase 'useragent' que alguns workers exigem em tasks Turnstile.
    if (req.userAgent) params.useragent = req.userAgent
    if (req.proxy) {
      params.proxy = req.proxy
      params.proxytype = req.proxyType || 'HTTP'
    }
    return this.submitAndPoll(params, 'recaptcha v2')
  }

  async solveRecaptchaV3(req: RecaptchaV3Request): Promise<CaptchaSolution> {
    const params: Record<string, any> = {
      method: 'userrecaptcha',
      version: 'v3',
      googlekey: req.sitekey,
      pageurl: req.pageUrl,
      action: req.action,
      min_score: req.minScore ?? 0.3,
    }
    if (req.cookies) params.cookies = req.cookies
    if (req.userAgent) params.userAgent = req.userAgent
    // 2captcha v1 API aceita 'userAgent' (camelCase). Mantemos também a forma
    // lowercase 'useragent' que alguns workers exigem em tasks Turnstile.
    if (req.userAgent) params.useragent = req.userAgent
    if (req.proxy) {
      params.proxy = req.proxy
      params.proxytype = req.proxyType || 'HTTP'
    }
    return this.submitAndPoll(params, 'recaptcha v3')
  }

  async solveHCaptcha(req: HCaptchaRequest): Promise<CaptchaSolution> {
    const params: Record<string, any> = {
      method: 'hcaptcha',
      sitekey: req.sitekey,
      pageurl: req.pageUrl,
    }
    if (req.invisible) params.invisible = 1
    if (req.cookies) params.cookies = req.cookies
    if (req.userAgent) params.userAgent = req.userAgent
    // 2captcha v1 API aceita 'userAgent' (camelCase). Mantemos também a forma
    // lowercase 'useragent' que alguns workers exigem em tasks Turnstile.
    if (req.userAgent) params.useragent = req.userAgent
    if (req.proxy) {
      params.proxy = req.proxy
      params.proxytype = req.proxyType || 'HTTP'
    }
    return this.submitAndPoll(params, 'hcaptcha')
  }

  async solveTurnstile(req: TurnstileRequest): Promise<CaptchaSolution> {
    const params: Record<string, any> = {
      method: 'turnstile',
      sitekey: req.sitekey,
      pageurl: req.pageUrl,
    }
    if (req.action) params.action = req.action
    if (req.cData) params.data = req.cData
    if (req.userAgent) params.userAgent = req.userAgent
    // 2captcha v1 API aceita 'userAgent' (camelCase). Mantemos também a forma
    // lowercase 'useragent' que alguns workers exigem em tasks Turnstile.
    if (req.userAgent) params.useragent = req.userAgent
    return this.submitAndPoll(params, 'turnstile')
  }

  async solveImageCaptcha(req: ImageCaptchaRequest): Promise<CaptchaSolution> {
    const params: Record<string, any> = {
      method: 'base64',
      body: req.imageBase64.replace(/^data:image\/\w+;base64,/, ''),
    }
    if (req.numeric !== undefined) params.numeric = req.numeric
    if (req.regsense !== undefined) params.regsense = req.regsense ? 1 : 0
    if (req.minLen !== undefined) params.min_len = req.minLen
    if (req.maxLen !== undefined) params.max_len = req.maxLen
    if (req.hint) params.textinstructions = req.hint
    return this.submitAndPoll(params, 'image')
  }

  /** Reporta resolução incorreta para não ser cobrado. */
  async reportBad(taskId: string): Promise<void> {
    await axios.get(`${this.baseUrl}/res.php`, {
      params: { key: this.apiKey, action: 'reportbad', id: taskId, json: 1 },
      timeout: 10_000,
    })
  }

  /** Reporta resolução correta (ajuda o 2captcha a calibrar seus workers). */
  async reportGood(taskId: string): Promise<void> {
    await axios.get(`${this.baseUrl}/res.php`, {
      params: { key: this.apiKey, action: 'reportgood', id: taskId, json: 1 },
      timeout: 10_000,
    })
  }

  // ─── Internal ───────────────────────────────────────────

  private async submitAndPoll(params: Record<string, any>, kind: string): Promise<CaptchaSolution> {
    this.ensureKey()
    const t0 = Date.now()

    // 1. Submit
    const { data: submit } = await axios.post(
      `${this.baseUrl}/in.php`,
      new URLSearchParams({ ...params, key: this.apiKey, json: '1', soft_id: '4903' }),
      { timeout: 30_000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    )
    if (submit.status !== 1) {
      throw new CaptchaSolverError(
        String(submit.request || 'SUBMIT_FAIL'),
        `2captcha rejeitou ${kind}: ${submit.error_text ?? submit.request}`
      )
    }
    const taskId: string = String(submit.request)

    // 2. Poll
    const deadline = t0 + this.timeoutMs
    // 2captcha pede esperar ≥10s antes do primeiro poll para captchas do Google
    await sleep(Math.min(this.pollIntervalMs * 2, 10_000))

    while (Date.now() < deadline) {
      const { data: res } = await axios.get(`${this.baseUrl}/res.php`, {
        params: { key: this.apiKey, action: 'get', id: taskId, json: 1 },
        timeout: 20_000,
      })
      if (res.status === 1) {
        return {
          token: String(res.request),
          taskId,
          elapsedMs: Date.now() - t0,
        }
      }
      if (res.request !== 'CAPCHA_NOT_READY') {
        throw new CaptchaSolverError(
          String(res.request || 'SOLVE_FAIL'),
          `2captcha ${kind} falhou: ${res.error_text ?? res.request}`
        )
      }
      await sleep(this.pollIntervalMs)
    }
    throw new CaptchaSolverError('TIMEOUT', `Timeout aguardando ${kind} (${this.timeoutMs}ms)`)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ─── Singleton ────────────────────────────────────────────

let _instance: CaptchaSolver | null = null
export function getCaptchaSolver(): CaptchaSolver {
  if (!_instance) {
    _instance = new CaptchaSolver({
      apiKey: process.env.TWOCAPTCHA_API_KEY || '',
      timeoutMs: Number(process.env.TWOCAPTCHA_TIMEOUT_MS) || 120_000,
      pollIntervalMs: Number(process.env.TWOCAPTCHA_POLL_INTERVAL_MS) || 5_000,
    })
  }
  return _instance
}

export function hasCaptchaKey(): boolean {
  return !!process.env.TWOCAPTCHA_API_KEY
}
