// ============================================================
// ALETIS — Cloudflare Bypass Service
// Usa Puppeteer para passar pelo "Managed Challenge" do Cloudflare
// (ex.: cepea.org.br) e, se necessário, resolve Turnstile via 2captcha.
//
// Fluxo:
//  1. Lança um Chromium headless com flags realistas
//  2. Navega até a URL alvo
//  3. Detecta se caiu no challenge ("Just a moment...")
//  4a. Aguarda até `maxWaitMs` pela resolução automática (JS challenge)
//  4b. Se um widget Turnstile aparecer, extrai sitekey e resolve via 2captcha
//  5. Persiste cookie cf_clearance + user-agent em memória
//  6. Retorna o HTML final da página
//
// Reutilização:
//  - Mantém um Browser singleton por processo
//  - Cacheia o cf_clearance por hostname para reusar via axios em
//    chamadas subsequentes (até o cookie expirar — geralmente 30-60min)
// ============================================================

import type { Browser, Page } from 'puppeteer'
import puppeteerCore from 'puppeteer'
// @ts-ignore — puppeteer-extra não tem types oficiais
import puppeteerExtra from 'puppeteer-extra'
// @ts-ignore
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { getCaptchaSolver, hasCaptchaKey } from './CaptchaSolver.js'

// Registra stealth — evita fingerprinting que o Cloudflare usa pra
// detectar Puppeteer (navigator.webdriver, chrome runtime, etc)
try {
  puppeteerExtra.use(StealthPlugin())
} catch {
  /* no-op — stealth opcional */
}

// Usa puppeteerExtra como driver, caindo pra puppeteer puro se falhar.
const puppeteer: typeof puppeteerCore = (puppeteerExtra as unknown as typeof puppeteerCore) || puppeteerCore

// ── Types ────────────────────────────────────────────────────

export interface BypassResult {
  html: string
  finalUrl: string
  /** Cookie `cf_clearance=...` pronto pra injetar em um axios header. */
  cookies: string
  /** User-Agent usado — precisa ser o mesmo em requests subsequentes. */
  userAgent: string
  /** Se o Turnstile teve de ser resolvido pelo 2captcha. */
  turnstileResolvido: boolean
  durationMs: number
}

export interface BypassOptions {
  /** Tempo máximo aguardando o CF challenge resolver sozinho. */
  maxChallengeWaitMs?: number
  /** Timeout total da operação (inclui goto + espera + parse). */
  totalTimeoutMs?: number
  /** Seletor CSS que indica que a página real carregou (ex.: `#imagenet`). */
  readySelector?: string
  /** Se true, ignora cache de cookie e força nova sessão. */
  forceFresh?: boolean
}

interface CachedSession {
  cookies: string
  userAgent: string
  expiresAt: number
}

// ── Constants ────────────────────────────────────────────────

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// cf_clearance costuma valer 30min; damos margem de segurança.
const SESSION_TTL_MS = 25 * 60_000

// ── Singleton Browser ────────────────────────────────────────

let browserInstance: Browser | null = null
let browserPromise: Promise<Browser> | null = null
const sessionCache = new Map<string, CachedSession>()

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) return browserInstance
  if (browserPromise) return browserPromise

  browserPromise = puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=1920,1080',
      '--lang=pt-BR',
    ],
    defaultViewport: { width: 1920, height: 1080 },
  })
  try {
    browserInstance = await browserPromise
    browserInstance.on('disconnected', () => {
      browserInstance = null
    })
    return browserInstance
  } finally {
    browserPromise = null
  }
}

/** Fecha o browser (útil em testes / shutdown gracioso). */
export async function closeCloudflareBypassBrowser(): Promise<void> {
  if (browserInstance) {
    try {
      await browserInstance.close()
    } catch {
      /* no-op */
    }
    browserInstance = null
  }
}

// ── Helpers ──────────────────────────────────────────────────

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function cachedSession(hostname: string): CachedSession | null {
  const s = sessionCache.get(hostname)
  if (!s) return null
  if (Date.now() > s.expiresAt) {
    sessionCache.delete(hostname)
    return null
  }
  return s
}

async function isCloudflareChallenge(page: Page): Promise<boolean> {
  try {
    const title = await page.title()
    if (/just a moment|verifying/i.test(title)) return true
    const hasCfOpt = await page.evaluate(() => {
      // @ts-expect-error _cf_chl_opt é injetado pelo CF
      return typeof window._cf_chl_opt === 'object'
    })
    return Boolean(hasCfOpt)
  } catch {
    return false
  }
}

async function waitForChallengeResolution(
  page: Page,
  maxWaitMs: number,
  readySelector?: string
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    // Se o selector alvo já existe, considera resolvido
    if (readySelector) {
      try {
        const found = await page.$(readySelector)
        if (found) return true
      } catch {
        /* ignore */
      }
    }
    // Se não estamos mais na página de challenge, resolveu
    const stillChallenge = await isCloudflareChallenge(page)
    if (!stillChallenge) return true
    // Espera um pouco e tenta de novo
    await new Promise((r) => setTimeout(r, 1500))
  }
  return false
}

/**
 * Extrai a sitekey Turnstile. Na página de managed challenge do CF,
 * o widget é carregado em um iframe cross-origin — não aparece no DOM
 * principal. Inspecionamos page.frames() e extraímos a sitekey da URL
 * (padrão: `/turnstile/f/ov2/av0/rch/<ver>/<SITEKEY>/...`).
 */
async function findTurnstileSitekey(page: Page): Promise<string | null> {
  // 1. Tenta nos frames (fonte mais confiável no managed challenge)
  for (const frame of page.frames()) {
    const url = frame.url()
    if (/challenges\.cloudflare\.com.*turnstile/.test(url)) {
      // Formato 1: /rch/<ver>/<SITEKEY>/
      const m1 = url.match(/\/rch\/[a-zA-Z0-9]+\/([A-Za-z0-9_-]+)\//)
      if (m1 && m1[1].length > 10) return m1[1]
      // Formato 2: ?sitekey= ou &sitekey=
      const m2 = url.match(/[?&]sitekey=([^&]+)/)
      if (m2) return decodeURIComponent(m2[1])
    }
  }

  // 2. Fallback: DOM explícito (widgets standalone, não managed challenge)
  try {
    const fromDom = await page.evaluate(() => {
      const el = document.querySelector('[data-sitekey]')
      if (el) {
        const sk = el.getAttribute('data-sitekey')
        if (sk && sk.length > 10) return sk
      }
      return null
    })
    if (fromDom) return fromDom
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Resolve Turnstile via 2captcha e injeta o token na página, disparando
 * a submissão do form CF.
 */
async function solveAndInjectTurnstile(
  page: Page,
  sitekey: string,
  pageUrl: string,
  userAgent: string
): Promise<boolean> {
  if (!hasCaptchaKey()) {
    console.warn('[CloudflareBypass] Turnstile detectado mas TWOCAPTCHA_API_KEY ausente')
    return false
  }
  try {
    const solver = getCaptchaSolver()
    console.log(`[CloudflareBypass] Resolvendo Turnstile sitekey=${sitekey} via 2captcha`)
    const { token, elapsedMs } = await solver.solveTurnstile({
      sitekey,
      pageUrl,
      userAgent,
    })
    console.log(`[CloudflareBypass] Token Turnstile obtido em ${elapsedMs}ms`)

    // Injeta o token preenchendo o input hidden e disparando eventos/callbacks
    // que o CF está aguardando. A sequência abaixo cobre as três formas
    // comuns de submissão:
    //   a. form.submit() — usado no managed challenge
    //   b. window.turnstile.execute() — usado no widget standalone
    //   c. _cf_chl_opt callback — em alguns layouts específicos
    await page.evaluate((tk) => {
      const inputs = document.querySelectorAll<HTMLInputElement>(
        'input[name="cf-turnstile-response"], input[name^="cf-chl-widget"], input[id^="cf-chl-widget"]'
      )
      inputs.forEach((el) => {
        el.value = tk
        el.dispatchEvent(new Event('change', { bubbles: true }))
        el.dispatchEvent(new Event('input', { bubbles: true }))
      })

      const w = window as unknown as {
        turnstile?: { execute?: (id?: string) => void }
        _cf_chl_opt?: { cType?: string; cFPWv?: string }
      }
      if (typeof w.turnstile?.execute === 'function') {
        try {
          w.turnstile.execute()
        } catch {
          /* no-op */
        }
      }

      const form = document.querySelector<HTMLFormElement>('form')
      if (form) {
        try {
          form.submit()
        } catch {
          /* no-op */
        }
      }
    }, token)
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.warn(`[CloudflareBypass] Falha ao resolver Turnstile: ${msg}`)
    return false
  }
}

// ── Public API ───────────────────────────────────────────────

/**
 * Busca uma URL atravessando o Cloudflare Challenge quando houver.
 * Reutiliza cookie cf_clearance em memória por hostname por até 25min.
 */
export async function bypassCloudflareAndFetch(
  url: string,
  options: BypassOptions = {}
): Promise<BypassResult> {
  const {
    maxChallengeWaitMs = 20_000,
    totalTimeoutMs = 60_000,
    readySelector,
    forceFresh = false,
  } = options

  const started = Date.now()
  const hostname = hostnameOf(url)

  // Tentativa rápida usando cookie em cache — axios sem browser
  if (!forceFresh) {
    const cached = cachedSession(hostname)
    if (cached) {
      try {
        const axios = (await import('axios')).default
        const resp = await axios.get(url, {
          timeout: 12_000,
          maxRedirects: 5,
          validateStatus: () => true,
          headers: {
            'User-Agent': cached.userAgent,
            Cookie: cached.cookies,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cache-Control': 'no-cache',
          },
        })
        if (resp.status >= 200 && resp.status < 300 && !/Just a moment/i.test(resp.data)) {
          return {
            html: String(resp.data),
            finalUrl: url,
            cookies: cached.cookies,
            userAgent: cached.userAgent,
            turnstileResolvido: false,
            durationMs: Date.now() - started,
          }
        }
        // Cookie expirou — limpa e segue pro puppeteer
        sessionCache.delete(hostname)
      } catch {
        sessionCache.delete(hostname)
      }
    }
  }

  // Rota completa via puppeteer
  const browser = await getBrowser()
  const page = await browser.newPage()
  let turnstileResolvido = false

  try {
    await page.setUserAgent(DEFAULT_USER_AGENT)
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    })

    // Navigator.webdriver hack — reduz fingerprinting de automação
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US'] })
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
    })

    // Timeout global com Promise.race
    const navPromise = page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(totalTimeoutMs, 30_000),
    })
    await navPromise

    // Aguarda CF resolver (se houver challenge)
    if (await isCloudflareChallenge(page)) {
      console.log(`[CloudflareBypass] Challenge detectado em ${hostname} — aguardando iframe Turnstile...`)

      // Dá até ~8s pro iframe do Turnstile carregar (ele aparece alguns segundos
      // depois do primeiro render do challenge)
      let sitekey: string | null = null
      const iframeDeadline = Date.now() + 10_000
      while (Date.now() < iframeDeadline) {
        sitekey = await findTurnstileSitekey(page)
        if (sitekey) break
        if (await page.$(readySelector ?? '#noop-selector-never-matches')) break
        await new Promise((r) => setTimeout(r, 1000))
      }

      // Caminho A: temos sitekey → resolve via 2captcha imediatamente
      if (sitekey && hasCaptchaKey()) {
        console.log(
          `[CloudflareBypass] Sitekey Turnstile encontrada (${sitekey}) — resolvendo via 2captcha`
        )
        turnstileResolvido = await solveAndInjectTurnstile(page, sitekey, url, DEFAULT_USER_AGENT)
        if (turnstileResolvido) {
          // Aguarda o CF processar o token e carregar a página real
          await waitForChallengeResolution(page, 30_000, readySelector)
        }
      } else {
        // Caminho B: sem sitekey ou sem 2captcha → aguarda resolução passiva
        // (funciona quando stealth passa o fingerprint check direto)
        const resolved = await waitForChallengeResolution(page, maxChallengeWaitMs, readySelector)
        if (!resolved) {
          // Tenta procurar sitekey uma última vez (pode ter aparecido)
          const skLate = await findTurnstileSitekey(page)
          if (skLate && hasCaptchaKey()) {
            console.log(
              `[CloudflareBypass] Sitekey tardio (${skLate}) — tentando resolver via 2captcha`
            )
            turnstileResolvido = await solveAndInjectTurnstile(page, skLate, url, DEFAULT_USER_AGENT)
            if (turnstileResolvido) {
              await waitForChallengeResolution(page, 30_000, readySelector)
            }
          }
        }
      }
    }

    // Pequeno delay pra garantir render completo (CEPEA tem tabs AJAX)
    if (readySelector) {
      try {
        await page.waitForSelector(readySelector, { timeout: 10_000 })
      } catch {
        /* segue — tenta pegar o HTML mesmo assim */
      }
    } else {
      await new Promise((r) => setTimeout(r, 1500))
    }

    const html = await page.content()
    const finalUrl = page.url()

    // Persiste cookies pro cache
    const cookiesArr = await page.cookies()
    const cookieStr = cookiesArr.map((c) => `${c.name}=${c.value}`).join('; ')
    const ua = await page.evaluate(() => navigator.userAgent)

    if (cookieStr) {
      sessionCache.set(hostname, {
        cookies: cookieStr,
        userAgent: ua,
        expiresAt: Date.now() + SESSION_TTL_MS,
      })
    }

    return {
      html,
      finalUrl,
      cookies: cookieStr,
      userAgent: ua,
      turnstileResolvido,
      durationMs: Date.now() - started,
    }
  } finally {
    try {
      await page.close()
    } catch {
      /* no-op */
    }
  }
}

/** Invalida o cache de cookie pra um hostname específico. */
export function invalidateCloudflareSession(urlOrHost: string): void {
  const host = /\//.test(urlOrHost) ? hostnameOf(urlOrHost) : urlOrHost
  sessionCache.delete(host)
}

/** Inspeciona o cache (útil pra debug / métricas). */
export function getCloudflareSessionCache(): Array<{
  hostname: string
  validoPor: number
  userAgent: string
}> {
  const now = Date.now()
  return Array.from(sessionCache.entries())
    .filter(([, s]) => s.expiresAt > now)
    .map(([hostname, s]) => ({
      hostname,
      validoPor: Math.round((s.expiresAt - now) / 1000),
      userAgent: s.userAgent,
    }))
}
