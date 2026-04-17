import axios, { AxiosInstance } from 'axios'
import { CaptchaSolver, CaptchaSolverError, getCaptchaSolver } from '../captcha/CaptchaSolver'
import type { CarConsultaResult } from './types'

/**
 * Cliente do SICAR (Cadastro Ambiental Rural) — Serviço Florestal Brasileiro.
 *
 * Fluxo da consulta pública:
 *  1. GET `/publico/imoveis/index` — obtém cookies de sessão e o sitekey do reCAPTCHA v2
 *  2. Resolve o captcha via 2captcha → token `g-recaptcha-response`
 *  3. POST `/publico/estadosCaR/consultaImovel` com (codImovel, g-recaptcha-response, cookies)
 *  4. Se 200, parseia os campos do imóvel. Se 5xx ou HTML de manutenção, retorna erro estruturado.
 *
 * Observação (out-2025 → abr-2026):
 *  O SICAR passa por manutenções frequentes. O cliente detecta a página de
 *  "aviso_seguranca" e devolve um erro `SICAR_MAINTENANCE` sem gastar captcha —
 *  a UI deve exibir "SICAR indisponível no momento".
 *
 * Códigos CAR seguem o formato `UF-XXXXXXX-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
 * (44 caracteres alfanuméricos após o UF).
 */

const SICAR_BASE_URL = 'https://consultapublica.car.gov.br'
const SICAR_SITEKEY_CACHE_MS = 6 * 60 * 60_000 // 6h
const SICAR_HOMEPAGE = '/publico/imoveis/index'
const SICAR_CONSULTA_ENDPOINT = '/publico/estadosCaR/consultaImovel'
const SICAR_REGEX =
  /^[A-Z]{2}-\d{7}-[0-9A-F]{32,44}$/i

export type SicarErrorCode =
  | 'SICAR_MAINTENANCE'
  | 'SICAR_TIMEOUT'
  | 'SICAR_NOT_FOUND'
  | 'SICAR_INVALID_CODE'
  | 'SICAR_CAPTCHA_FAIL'
  | 'SICAR_PARSE_FAIL'
  | 'SICAR_UNKNOWN'

export class SICARError extends Error {
  constructor(public code: SicarErrorCode, message: string, public cause?: unknown) {
    super(message)
    this.name = 'SICARError'
  }
}

interface SicarContext {
  sitekey: string
  cookieHeader: string
  fetchedAt: number
}

export class SICARClient {
  private readonly http: AxiosInstance
  private readonly captcha: CaptchaSolver
  private ctx: SicarContext | null = null

  constructor(captcha: CaptchaSolver) {
    this.captcha = captcha
    this.http = axios.create({
      baseURL: SICAR_BASE_URL,
      timeout: 30_000,
      maxRedirects: 5,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      // Não joga para catch em 4xx — queremos inspecionar o status
      validateStatus: () => true,
    })
  }

  /**
   * Verifica se o SICAR está online. Rápido — não consome captcha.
   * Retorna `{ online, reason?, sitekey? }`.
   */
  async checkStatus(): Promise<{ online: boolean; reason?: string; sitekey?: string }> {
    try {
      const res = await this.http.get(SICAR_HOMEPAGE)
      if (res.status >= 500) {
        return { online: false, reason: `HTTP ${res.status}` }
      }
      const body = String(res.data ?? '')
      if (this.isMaintenancePage(body)) {
        return { online: false, reason: 'SICAR em manutenção (aviso_seguranca)' }
      }
      const sitekey = this.extractSitekey(body)
      if (!sitekey) {
        return {
          online: false,
          reason: 'Página acessível mas sitekey reCAPTCHA não encontrada — layout mudou',
        }
      }
      return { online: true, sitekey }
    } catch (err: any) {
      return { online: false, reason: this.describeNetworkError(err) }
    }
  }

  private describeNetworkError(err: any): string {
    const code = err?.code
    if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'CERT_HAS_EXPIRED' || code === 'SELF_SIGNED_CERT_IN_CHAIN') {
      return `TLS/certificado SICAR fora do ar (${code})`
    }
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
      return `Rede indisponível (${code})`
    }
    return err?.message || 'Falha ao acessar SICAR'
  }

  /**
   * Consulta dados de um imóvel rural pelo código CAR.
   * Resolve reCAPTCHA v2 automaticamente via 2captcha.
   */
  async consultarPorCodigo(codImovel: string): Promise<CarConsultaResult> {
    const code = (codImovel || '').trim().toUpperCase()
    if (!SICAR_REGEX.test(code)) {
      throw new SICARError(
        'SICAR_INVALID_CODE',
        `Código CAR inválido: "${codImovel}". Formato esperado UF-XXXXXXX-<hex>`
      )
    }

    const ctx = await this.getContext()
    const pageUrl = `${SICAR_BASE_URL}${SICAR_HOMEPAGE}`

    let captchaToken: string
    let captchaTaskId: string
    try {
      const solution = await this.captcha.solveRecaptchaV2({
        sitekey: ctx.sitekey,
        pageUrl,
        cookies: ctx.cookieHeader,
        userAgent: this.http.defaults.headers['User-Agent'] as string,
      })
      captchaToken = solution.token
      captchaTaskId = solution.taskId
    } catch (err) {
      if (err instanceof CaptchaSolverError) {
        throw new SICARError('SICAR_CAPTCHA_FAIL', `Captcha não resolvido: ${err.message}`, err)
      }
      throw err
    }

    const form = new URLSearchParams({
      codImovel: code,
      'g-recaptcha-response': captchaToken,
    })

    const res = await this.http.post(SICAR_CONSULTA_ENDPOINT, form, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: pageUrl,
        Cookie: ctx.cookieHeader,
        'X-Requested-With': 'XMLHttpRequest',
      },
    })

    if (res.status === 404) {
      throw new SICARError('SICAR_NOT_FOUND', `Imóvel ${code} não encontrado no SICAR`)
    }
    if (res.status >= 500) {
      throw new SICARError('SICAR_MAINTENANCE', `SICAR indisponível (HTTP ${res.status})`)
    }
    if (res.status !== 200) {
      throw new SICARError('SICAR_UNKNOWN', `Resposta inesperada do SICAR: HTTP ${res.status}`)
    }

    const bodyText = typeof res.data === 'string' ? res.data : ''
    if (this.isMaintenancePage(bodyText)) {
      // reset context since homepage may have served the page too
      this.ctx = null
      throw new SICARError('SICAR_MAINTENANCE', 'SICAR retornou página de manutenção após consulta')
    }

    try {
      const parsed = this.parseResponse(res.data, code)
      return { ...parsed, captchaTaskId }
    } catch (err: any) {
      // Reporta captcha como inválido para não ser cobrado quando o SICAR rejeitou
      try {
        await this.captcha.reportBad(captchaTaskId)
      } catch {
        /* best-effort */
      }
      throw new SICARError('SICAR_PARSE_FAIL', `Não foi possível parsear resposta SICAR: ${err?.message || err}`, err)
    }
  }

  // ─── Internals ──────────────────────────────────────────────

  private async getContext(): Promise<SicarContext> {
    const now = Date.now()
    if (this.ctx && now - this.ctx.fetchedAt < SICAR_SITEKEY_CACHE_MS) {
      return this.ctx
    }
    let res
    try {
      res = await this.http.get(SICAR_HOMEPAGE)
    } catch (err: any) {
      throw new SICARError('SICAR_MAINTENANCE', this.describeNetworkError(err), err)
    }
    if (res.status >= 500) {
      throw new SICARError('SICAR_MAINTENANCE', `SICAR offline (HTTP ${res.status})`)
    }
    const body = String(res.data ?? '')
    if (this.isMaintenancePage(body)) {
      throw new SICARError('SICAR_MAINTENANCE', 'SICAR em manutenção — tente novamente depois')
    }
    const sitekey = this.extractSitekey(body)
    if (!sitekey) {
      throw new SICARError(
        'SICAR_UNKNOWN',
        'Não foi possível localizar sitekey reCAPTCHA — layout SICAR pode ter mudado'
      )
    }
    const setCookie = res.headers['set-cookie']
    const cookieHeader = this.cookiesToHeader(setCookie)
    this.ctx = { sitekey, cookieHeader, fetchedAt: now }
    return this.ctx
  }

  private isMaintenancePage(html: string): boolean {
    if (!html) return false
    return (
      html.includes('aviso_seguranca') ||
      html.includes('Serviço em manutenção') ||
      html.includes('Serviço indisponível') ||
      html.includes('manutencao')
    )
  }

  private extractSitekey(html: string): string | null {
    // padrões comuns: data-sitekey="…", sitekey:'…', grecaptcha.render(…, {sitekey: '…'})
    const patterns = [
      /data-sitekey=["']([^"']+)["']/i,
      /['"]sitekey['"]\s*:\s*['"]([^'"]+)['"]/i,
      /grecaptcha\.render\([^)]*sitekey\s*:\s*['"]([^'"]+)['"]/i,
      /google\.com\/recaptcha\/api2\/anchor\?.*?k=([A-Za-z0-9_-]+)/i,
    ]
    for (const pat of patterns) {
      const m = html.match(pat)
      if (m) return m[1]
    }
    return null
  }

  private cookiesToHeader(setCookie: string | string[] | undefined): string {
    if (!setCookie) return ''
    const arr = Array.isArray(setCookie) ? setCookie : [setCookie]
    return arr
      .map((c) => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ')
  }

  /**
   * Extrai os campos do imóvel da resposta do SICAR.
   * A resposta real pode ser JSON (AJAX moderno) ou HTML (legado). Aceita ambos.
   */
  private parseResponse(data: unknown, codImovel: string): CarConsultaResult {
    const now = new Date().toISOString()

    // JSON path
    if (data && typeof data === 'object') {
      const obj = data as Record<string, any>
      const num = (v: unknown) => (v == null ? undefined : Number(String(v).replace(',', '.')))
      const areaImovel = num(obj.areaImovel ?? obj.area ?? obj.areaTotal ?? obj.area_total)
      if (areaImovel != null && isFinite(areaImovel)) {
        return {
          codImovel,
          areaImovel,
          municipio: String(obj.municipio ?? obj.nomeMunicipio ?? ''),
          uf: String(obj.uf ?? obj.siglaUf ?? codImovel.slice(0, 2)).toUpperCase(),
          modulosFiscais: num(obj.modulosFiscais ?? obj.numeroModulosFiscais),
          areaAntropizada: num(obj.areaAntropizada),
          areaReservaLegal: num(obj.areaReservaLegal),
          areaPreservacaoPermanente: num(obj.areaAPP ?? obj.areaPreservacaoPermanente),
          areaVegetacaoNativa: num(obj.areaVegetacaoNativa ?? obj.areaRemanescente),
          condicaoCadastro: String(obj.condicaoCadastro ?? obj.situacao ?? 'desconhecida'),
          statusAnalise: obj.statusAnalise ? String(obj.statusAnalise) : undefined,
          dataCadastro: obj.dataCadastro ? String(obj.dataCadastro) : undefined,
          tipoImovel: obj.tipoImovel as any,
          consultadoEm: now,
        }
      }
    }

    // HTML path (fallback)
    const html = String(data)
    const field = (label: string): string | undefined => {
      const re = new RegExp(
        `${label}[^<]*?<[^>]*>\\s*([0-9.,A-Za-zÀ-ÿ\\-\\s/]+?)\\s*<`,
        'i'
      )
      const m = html.match(re)
      return m?.[1]?.trim()
    }
    const parseNum = (s?: string) =>
      s ? Number(s.replace(/\./g, '').replace(',', '.')) : undefined

    const areaTxt = field('Área do Imóvel') || field('Área Total')
    const area = parseNum(areaTxt)
    if (!area || !isFinite(area)) {
      throw new Error('Campo "Área do Imóvel" não encontrado na resposta HTML')
    }
    return {
      codImovel,
      areaImovel: area,
      municipio: field('Município') || '',
      uf: (field('UF') || codImovel.slice(0, 2)).toUpperCase(),
      modulosFiscais: parseNum(field('Módulos Fiscais')),
      areaReservaLegal: parseNum(field('Reserva Legal')),
      areaPreservacaoPermanente: parseNum(field('Preservação Permanente')),
      areaVegetacaoNativa: parseNum(field('Vegetação Nativa')),
      condicaoCadastro: field('Condição') || field('Situação') || 'desconhecida',
      statusAnalise: field('Status'),
      dataCadastro: field('Cadastrado em') || field('Data'),
      consultadoEm: now,
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────

let _instance: SICARClient | null = null
export function getSICARClient(): SICARClient {
  if (!_instance) {
    _instance = new SICARClient(getCaptchaSolver())
  }
  return _instance
}
