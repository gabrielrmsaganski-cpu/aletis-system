/**
 * Downloader automático de shapefiles SICAR por UF.
 *
 * Fluxo:
 *   1. Probe de saúde via SICARClient.checkStatus() — aborta se SICAR estiver
 *      em manutenção (página Dataprev / aviso_seguranca). Não gasta captcha.
 *   2. Para cada UF configurada: resolve reCAPTCHA v2 via 2captcha e faz POST
 *      no endpoint de download oficial. Grava o zip em /tmp/sicar/downloads/.
 *   3. Descompacta (via /usr/bin/unzip) em /tmp/sicar/<UF>/ prontinho para
 *      o `ingest-sicar.ts` consumir.
 *
 * Variáveis de ambiente:
 *   SICAR_UFS                     — UFs a baixar, ex: "MT,GO,MS,BA,PR" (default: MT)
 *   SICAR_DOWNLOAD_URL_TEMPLATE   — template da URL de download (default:
 *                                   https://consultapublica.car.gov.br/publico/estadosCaR/downloadBaseShape?sigla={UF})
 *   SICAR_DOWNLOAD_DIR            — diretório de saída dos zips (default: /tmp/sicar/downloads)
 *   SICAR_EXTRACT_DIR             — raiz de extração (default: /tmp/sicar)
 *   SICAR_INSECURE_TLS            — "1" para bypass de cadeia TLS do SICAR
 *   SICAR_SKIP_IF_RECENT_HOURS    — pula UF cujo zip anterior é mais novo que N h (default: 20)
 *
 * Exit codes:
 *   0  — tudo ok (ou skip deliberado, ex.: SICAR offline)
 *   10 — SICAR offline (aviso Dataprev)
 *   20 — captcha não configurado
 *   30 — pelo menos um download falhou
 */
import axios from 'axios'
import https from 'https'
import { spawnSync } from 'child_process'
import { createWriteStream, existsSync, mkdirSync, statSync, rmSync } from 'fs'
import { join } from 'path'
import { getSICARClient } from '../src/services/prospeccao/SICARClient.js'
import { getCaptchaSolver, hasCaptchaKey } from '../src/services/captcha/CaptchaSolver.js'

const DEFAULT_URL_TEMPLATE =
  'https://consultapublica.car.gov.br/publico/estadosCaR/downloadBaseShape?sigla={UF}'
const DOWNLOAD_DIR = process.env.SICAR_DOWNLOAD_DIR || '/tmp/sicar/downloads'
const EXTRACT_ROOT = process.env.SICAR_EXTRACT_DIR || '/tmp/sicar'
const UFS = (process.env.SICAR_UFS || 'MT')
  .split(',')
  .map((u) => u.trim().toUpperCase())
  .filter(Boolean)
const SKIP_RECENT_HOURS = Number(process.env.SICAR_SKIP_IF_RECENT_HOURS ?? 20)
const URL_TEMPLATE = process.env.SICAR_DOWNLOAD_URL_TEMPLATE || DEFAULT_URL_TEMPLATE
const INSECURE = process.env.SICAR_INSECURE_TLS === '1'

interface DownloadResult {
  uf: string
  status: 'downloaded' | 'extracted' | 'skipped-recent' | 'skipped-offline' | 'failed'
  zipPath?: string
  extractDir?: string
  bytes?: number
  reason?: string
}

function log(msg: string, ...rest: unknown[]) {
  console.log(`[download-sicar] ${msg}`, ...rest)
}

function zipPathFor(uf: string): string {
  return join(DOWNLOAD_DIR, `sicar-${uf}.zip`)
}

function extractDirFor(uf: string): string {
  return join(EXTRACT_ROOT, uf)
}

function zipIsFresh(path: string): boolean {
  if (!existsSync(path)) return false
  const ageMs = Date.now() - statSync(path).mtimeMs
  return ageMs < SKIP_RECENT_HOURS * 3600 * 1000
}

async function downloadUf(
  uf: string,
  sitekey: string,
  cookieHeader: string,
  userAgent: string,
): Promise<DownloadResult> {
  const zipPath = zipPathFor(uf)
  if (zipIsFresh(zipPath)) {
    log(`[${uf}] zip recente em ${zipPath} — pulando`)
    return { uf, status: 'skipped-recent', zipPath }
  }

  const pageUrl = 'https://consultapublica.car.gov.br/publico/imoveis/index'
  log(`[${uf}] resolvendo reCAPTCHA v2...`)
  const { token, elapsedMs, taskId } = await getCaptchaSolver().solveRecaptchaV2({
    sitekey,
    pageUrl,
    cookies: cookieHeader,
    userAgent,
  })
  log(`[${uf}] captcha resolvido em ${Math.round(elapsedMs / 1000)}s (task ${taskId})`)

  const url = URL_TEMPLATE.replace(/\{UF\}/gi, uf)
  const agent = INSECURE
    ? new https.Agent({ rejectUnauthorized: false, keepAlive: true })
    : new https.Agent({ keepAlive: true })

  log(`[${uf}] baixando shapefile de ${url}`)
  try {
    const res = await axios.get(url, {
      params: { 'g-recaptcha-response': token },
      responseType: 'stream',
      timeout: 20 * 60 * 1000, // 20min para UFs grandes (MT ~2GB)
      maxRedirects: 5,
      httpsAgent: agent,
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/zip,application/octet-stream,*/*',
        Referer: pageUrl,
        Cookie: cookieHeader,
      },
      validateStatus: () => true,
    })

    if (res.status !== 200) {
      return { uf, status: 'failed', reason: `HTTP ${res.status}` }
    }
    const contentType = String(res.headers['content-type'] || '').toLowerCase()
    if (contentType.includes('text/html')) {
      // Provavelmente voltou a página de manutenção — captcha desperdiçado
      return { uf, status: 'failed', reason: `resposta HTML (provável manutenção) content-type=${contentType}` }
    }

    mkdirSync(DOWNLOAD_DIR, { recursive: true })
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(zipPath)
      res.data.pipe(out)
      out.on('finish', () => resolve())
      out.on('error', reject)
      res.data.on('error', reject)
    })

    const size = statSync(zipPath).size
    if (size < 1024 * 100) {
      // < 100KB: quase certo que é um erro HTML disfarçado
      return { uf, status: 'failed', reason: `zip suspeitosamente pequeno (${size}B)`, zipPath }
    }
    log(`[${uf}] zip salvo: ${zipPath} (${(size / 1048576).toFixed(1)} MB)`)

    const extracted = extractZip(zipPath, uf)
    return { ...extracted, bytes: size }
  } catch (err: any) {
    return { uf, status: 'failed', reason: err?.message || 'erro rede desconhecido' }
  }
}

function extractZip(zipPath: string, uf: string): DownloadResult {
  const extractDir = extractDirFor(uf)
  try {
    // Limpa diretório anterior pra evitar arquivos stale
    if (existsSync(extractDir)) rmSync(extractDir, { recursive: true, force: true })
    mkdirSync(extractDir, { recursive: true })
    const r = spawnSync('/usr/bin/unzip', ['-o', '-q', zipPath, '-d', extractDir], {
      encoding: 'utf8',
      timeout: 15 * 60 * 1000,
    })
    if (r.status !== 0) {
      return {
        uf,
        status: 'failed',
        reason: `unzip saiu com status ${r.status}: ${r.stderr?.slice(0, 400)}`,
        zipPath,
      }
    }
    log(`[${uf}] extraído em ${extractDir}`)
    return { uf, status: 'extracted', zipPath, extractDir }
  } catch (err: any) {
    return { uf, status: 'failed', reason: `extração falhou: ${err?.message}`, zipPath }
  }
}

async function main() {
  log(`UFs alvo: ${UFS.join(', ')}`)

  if (!hasCaptchaKey()) {
    log('TWOCAPTCHA_API_KEY não configurada — abortando')
    process.exit(20)
  }

  log('sondando saúde do SICAR...')
  const status = await getSICARClient().checkStatus()
  if (!status.online) {
    log(`SICAR offline — ${status.reason || 'sem detalhe'} · abortando sem gastar captcha`)
    process.exit(10)
  }
  log(`SICAR online · sitekey=${status.sitekey?.slice(0, 12)}...`)

  // Obtém cookies de sessão da homepage para reusar em todos os UFs
  const agent = INSECURE
    ? new https.Agent({ rejectUnauthorized: false, keepAlive: true })
    : new https.Agent({ keepAlive: true })
  const userAgent =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
  const home = await axios.get('https://consultapublica.car.gov.br/publico/imoveis/index', {
    httpsAgent: agent,
    headers: { 'User-Agent': userAgent },
    validateStatus: () => true,
  })
  const setCookie = home.headers['set-cookie']
  const cookieHeader = Array.isArray(setCookie)
    ? setCookie.map((c) => c.split(';')[0].trim()).join('; ')
    : ''

  const results: DownloadResult[] = []
  for (const uf of UFS) {
    try {
      const r = await downloadUf(uf, status.sitekey!, cookieHeader, userAgent)
      results.push(r)
    } catch (err: any) {
      results.push({ uf, status: 'failed', reason: err?.message || 'erro inesperado' })
    }
  }

  const summary = results.map((r) => {
    const bits = [r.uf, r.status]
    if (r.bytes) bits.push(`${(r.bytes / 1048576).toFixed(1)}MB`)
    if (r.reason) bits.push(`reason=${r.reason}`)
    return bits.join(' ')
  })
  log('resumo:')
  for (const s of summary) log('  • ' + s)

  const failed = results.filter((r) => r.status === 'failed')
  if (failed.length > 0) {
    log(`${failed.length}/${results.length} UFs falharam`)
    process.exit(30)
  }
  log('ok')
}

main().catch((err) => {
  console.error('[download-sicar] erro fatal:', err)
  process.exit(1)
})
