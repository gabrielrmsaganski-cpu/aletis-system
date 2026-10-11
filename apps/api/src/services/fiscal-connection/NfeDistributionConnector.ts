import { request as httpsRequest } from 'node:https'
import type { ClientRequest } from 'node:http'
import { gunzip } from 'node:zlib'
import { JSDOM } from 'jsdom'
import { prepareFiscalTlsIdentity } from './FiscalCertificateVault.js'
import { extractFiscalDetails } from './FiscalDocumentDetails.js'
import type { FiscalDocumentDetails } from '@aletis/shared-types'

/** Fonte: Portal Nacional NF-e, Serviços Web, conferido em 13/09/2026. */
export const NFE_DISTRIBUTION_ENDPOINT = 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx' as const
export const NFE_DISTRIBUTION_ACTION = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse' as const
export const NFE_DISTRIBUTION_MIN_INTERVAL_MS = 60 * 60 * 1000
export const NFE_DISTRIBUTION_LIMITS = Object.freeze({
  timeoutMs: 30_000,
  responseBytes: 8 * 1024 * 1024,
  compressedDocumentBytes: 1024 * 1024,
  documentBytes: 2 * 1024 * 1024,
  batchDocumentBytes: 16 * 1024 * 1024,
  documents: 50,
  xmlDepth: 80,
  xmlElements: 50_000,
})

export const NFE_UF_CODES: Readonly<Record<string, string>> = Object.freeze({
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17',
  MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27', SE: '28', BA: '29',
  MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41', SC: '42', RS: '43',
  MS: '50', MT: '51', GO: '52', DF: '53',
})

const NFE_NAMESPACE = 'http://www.portalfiscal.inf.br/nfe'
const WSDL_NAMESPACE = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe'
const SOAP_12_NAMESPACE = 'http://www.w3.org/2003/05/soap-envelope'
const SOAP_11_NAMESPACE = 'http://schemas.xmlsoap.org/soap/envelope/'
const NSU_FORMAT = /^\d{1,15}$/
const DOCUMENTO_FORMAT = /^(?:\d{11}|[A-Z0-9]{12}\d{2})$/
const KEY_FORMAT = /^\d{6}[A-Z0-9]{12}\d{26}$/
const MONEY_FORMAT = /^(?:0|[1-9]\d{0,12})\.\d{2}$/
const UTF8 = new TextDecoder('utf-8', { fatal: true })

export type NfeDistributionErrorCode = 'INVALID_INPUT' | 'ABORTED' | 'TIMEOUT' | 'TRANSPORT_ERROR' |
  'HTTP_ERROR' | 'RESPONSE_TOO_LARGE' | 'INVALID_RESPONSE' | 'INVALID_XML' | 'UNSUPPORTED_SCHEMA' |
  'INVALID_DOCUMENT' | 'INVALID_PAGINATION' | 'DOCUMENT_TOO_LARGE'

export class NfeDistributionError extends Error {
  constructor(public readonly code: NfeDistributionErrorCode, message: string, public readonly httpStatus?: number) {
    super(message)
    this.name = 'NfeDistributionError'
  }
}

export interface NfeDistributionInput {
  consulta?: { tipo: 'chave' | 'nsu'; valor: string }
  pfx: Buffer
  passphrase: string
  documento: string
  uf: string
  ultNSU: string
  signal?: AbortSignal
}

export interface NfeDistributionParty { documento?: string; nome?: string }
export interface NfeDistributionDocument {
  details?: FiscalDocumentDetails
  nsu: string
  schema: string
  xml: string
  kind: 'nfe_summary' | 'nfe' | 'event_summary' | 'event'
  key?: string
  issuer?: NfeDistributionParty
  recipient?: NfeDistributionParty
  issuedAt?: string
  value?: string
  summary?: string
}
export interface NfeDistributionResult {
  statusCode: string
  message: string
  ultNSU: string
  maxNSU: string
  receivedAt: string
  /** Erros fiscais podem omitir os cursores; nunca avançar por esse retorno. */
  cursorReceived: boolean
  documents: NfeDistributionDocument[]
}

export interface NfeDistributionTransportRequest {
  endpoint: typeof NFE_DISTRIBUTION_ENDPOINT
  body: string
  pfx: Buffer
  passphrase: string
  signal?: AbortSignal
}
export interface NfeDistributionTransportResponse {
  statusCode: number
  body: Buffer
  contentType?: string
  contentEncoding?: string
}
/** Injeção exclusivamente em código para testes; nenhum endpoint vem de HTTP, banco ou ambiente. */
export type NfeDistributionTransport = (input: NfeDistributionTransportRequest) => Promise<NfeDistributionTransportResponse>

function failure(code: NfeDistributionErrorCode, message: string): never {
  throw new NfeDistributionError(code, message)
}

function normalizeNsu(value: string, code: 'INVALID_INPUT' | 'INVALID_PAGINATION'): string {
  if (typeof value !== 'string' || !NSU_FORMAT.test(value)) failure(code, 'NSU fiscal inválido.')
  return value.padStart(15, '0')
}

function normalizeInput(input: NfeDistributionInput): NfeDistributionInput {
  if (!Buffer.isBuffer(input.pfx) || input.pfx.length < 16 || input.pfx.length > 256 * 1024 ||
      typeof input.passphrase !== 'string' || input.passphrase.length > 1024 || input.passphrase.includes('\0')) {
    failure('INVALID_INPUT', 'Certificado ou senha em formato inválido para a consulta fiscal.')
  }
  if (typeof input.documento !== 'string' || !DOCUMENTO_FORMAT.test(input.documento) || /^0+$/.test(input.documento) ||
      typeof input.uf !== 'string' || !Object.hasOwn(NFE_UF_CODES, input.uf)) {
    failure('INVALID_INPUT', 'Informe CPF ou CNPJ e UF válidos para a consulta fiscal.')
  }
  const consulta=normalizeNfeLookup(input.consulta)
  return { ...input,consulta, ultNSU: normalizeNsu(input.ultNSU, 'INVALID_INPUT') }
}

export function normalizeNfeLookup(value:NfeDistributionInput['consulta']):NfeDistributionInput['consulta'] {
  let consulta=value
  if(consulta) {
    if(consulta.tipo==='chave') {
      if(!KEY_FORMAT.test(consulta.valor)||consulta.valor.slice(20,22)!=='55')failure('INVALID_INPUT','Informe uma chave de NF-e modelo 55 com 44 caracteres.')
      let sum=0,weight=2
      for(let i=42;i>=0;i--){sum+=(consulta.valor.charCodeAt(i)-48)*weight;weight=weight===9?2:weight+1}
      const digit=11-sum%11
      if(String(digit>=10?0:digit)!==consulta.valor[43])failure('INVALID_INPUT','O dígito verificador da chave NF-e é inválido.')
    } else if(consulta.tipo==='nsu') {
      consulta={tipo:'nsu',valor:normalizeNsu(consulta.valor,'INVALID_INPUT')}
      if(/^0+$/.test(consulta.valor))failure('INVALID_INPUT','Informe um NSU maior que zero.')
    } else failure('INVALID_INPUT','Modalidade de consulta fiscal inválida.')
  }
  return consulta
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function requestXml(input: NfeDistributionInput): string {
  const identity = input.documento.length === 11 ? 'CPF' : 'CNPJ'
  const query=input.consulta?.tipo==='chave'?`<consChNFe><chNFe>${escapeXml(input.consulta.valor)}</chNFe></consChNFe>`
    :input.consulta?.tipo==='nsu'?`<consNSU><NSU>${escapeXml(input.consulta.valor)}</NSU></consNSU>`
    :`<distNSU><ultNSU>${escapeXml(input.ultNSU)}</ultNSU></distNSU>`
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    `<soap:Envelope xmlns:soap="${SOAP_12_NAMESPACE}"><soap:Body>` +
    `<nfeDistDFeInteresse xmlns="${WSDL_NAMESPACE}"><nfeDadosMsg>` +
    `<distDFeInt xmlns="${NFE_NAMESPACE}" versao="1.01"><tpAmb>1</tpAmb>` +
    `<cUFAutor>${NFE_UF_CODES[input.uf]}</cUFAutor><${identity}>${escapeXml(input.documento)}</${identity}>` +
    `${query}</distDFeInt>` +
    '</nfeDadosMsg></nfeDistDFeInteresse></soap:Body></soap:Envelope>'
}

/** Uma única chamada; sem redirecionamento, proxy, repetição automática ou ato fiscal. */
const officialTransport: NfeDistributionTransport = async (input) => {
  if (input.signal?.aborted) failure('ABORTED', 'Consulta fiscal interrompida.')
  // PFX não entra no contexto TLS: certificados adicionais do contêiner podem
  // ampliar a confiança do servidor no OpenSSL. Somente a identidade é extraída.
  const identity = await prepareFiscalTlsIdentity(input.pfx, input.passphrase)
  try {
    if (input.signal?.aborted) failure('ABORTED', 'Consulta fiscal interrompida.')
    return await new Promise<NfeDistributionTransportResponse>((resolve, reject) => {
      let settled = false
      let req: ClientRequest | undefined
      let deadline: ReturnType<typeof setTimeout> | undefined
      const finish = (error?: NfeDistributionError, value?: NfeDistributionTransportResponse) => {
        if (settled) return
        settled = true
        clearTimeout(deadline)
        input.signal?.removeEventListener('abort', abort)
        if (error) reject(error)
        else resolve(value!)
      }
      const abort = () => req?.destroy(new NfeDistributionError('ABORTED', 'Consulta fiscal interrompida.'))
      try { req = httpsRequest(NFE_DISTRIBUTION_ENDPOINT, {
        method: 'POST',
        agent: false,
        cert: identity.cert,
        key: identity.key,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        maxHeaderSize: 16 * 1024,
        headers: {
          'Content-Type': `application/soap+xml; charset=utf-8; action="${NFE_DISTRIBUTION_ACTION}"`,
          Accept: 'application/soap+xml, text/xml',
          'Accept-Encoding': 'identity',
          'Content-Length': Buffer.byteLength(input.body),
        },
      }, (response) => {
        if (response.statusCode !== 200) {
          response.destroy()
          req?.destroy()
          finish(new NfeDistributionError('HTTP_ERROR', 'O serviço fiscal não concluiu a consulta.', response.statusCode))
          return
        }
        const declared = response.headers['content-length']
        if (declared && (!/^\d+$/.test(declared) || Number(declared) > NFE_DISTRIBUTION_LIMITS.responseBytes)) {
          response.destroy()
          req?.destroy()
          finish(new NfeDistributionError('RESPONSE_TOO_LARGE', 'Resposta fiscal excede o limite permitido.'))
          return
        }
        const chunks: Buffer[] = []
        let bytes = 0
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length
          if (bytes > NFE_DISTRIBUTION_LIMITS.responseBytes) {
            response.destroy()
            req?.destroy()
            finish(new NfeDistributionError('RESPONSE_TOO_LARGE', 'Resposta fiscal excede o limite permitido.'))
          } else chunks.push(chunk)
        })
        response.on('end', () => finish(undefined, {
          statusCode: response.statusCode!, body: Buffer.concat(chunks),
          contentType: response.headers['content-type'],
          contentEncoding: response.headers['content-encoding'],
        }))
        response.on('error', () => finish(new NfeDistributionError('TRANSPORT_ERROR', 'A conexão com a SEFAZ foi interrompida.')))
        response.on('aborted', () => finish(new NfeDistributionError('TRANSPORT_ERROR', 'A resposta da SEFAZ foi interrompida.')))
      }) } catch {
        finish(new NfeDistributionError('TRANSPORT_ERROR', 'Não foi possível estabelecer a conexão segura com a SEFAZ.'))
        return
      }
      deadline = setTimeout(() => req?.destroy(new NfeDistributionError('TIMEOUT', 'A SEFAZ não respondeu dentro do prazo da consulta.')), NFE_DISTRIBUTION_LIMITS.timeoutMs)
      deadline.unref()
      req.on('error', (error) => finish(error instanceof NfeDistributionError ? error : new NfeDistributionError('TRANSPORT_ERROR', 'Não foi possível estabelecer a conexão segura com a SEFAZ.')))
      input.signal?.addEventListener('abort', abort, { once: true })
      if (input.signal?.aborted) abort()
      else req.end(input.body)
    })
  } finally { identity.dispose() }
}

function decodeUtf8(bytes: Buffer): string {
  try { return UTF8.decode(bytes) } catch { return failure('INVALID_XML', 'O XML fiscal não está em UTF-8 válido.') }
}

/** Limita profundidade antes do DOM; respeita comentários, CDATA, instruções e aspas. */
function preflightXml(xml: string): void {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml) || xml.includes('\0')) failure('INVALID_XML', 'O XML fiscal contém declaração não permitida.')
  const encoding = xml.match(/^\s*<\?xml\b[^?]*\bencoding\s*=\s*['"]([^'"]+)['"]/i)?.[1]
  if (encoding && !/^utf-?8$/i.test(encoding)) failure('INVALID_XML', 'Codificação XML fiscal não suportada.')
  let depth = 0
  let elements = 0
  let index = 0
  while ((index = xml.indexOf('<', index)) !== -1) {
    let terminator: string | undefined
    if (xml.startsWith('<!--', index)) terminator = '-->'
    else if (xml.startsWith('<![CDATA[', index)) terminator = ']]>'
    else if (xml.startsWith('<?', index)) terminator = '?>'
    if (terminator) {
      const end = xml.indexOf(terminator, index + 2)
      if (end === -1) failure('INVALID_XML', 'XML fiscal incompleto.')
      index = end + terminator.length
      continue
    }
    if (xml.startsWith('<!', index)) failure('INVALID_XML', 'Declaração XML fiscal não permitida.')
    let quote = ''
    let end = index + 1
    for (; end < xml.length; end++) {
      const char = xml[end]
      if (quote) { if (char === quote) quote = '' }
      else if (char === '"' || char === "'") quote = char
      else if (char === '>') break
    }
    if (end === xml.length) failure('INVALID_XML', 'XML fiscal incompleto.')
    if (xml[index + 1] === '/') depth--
    else {
      elements++
      if (xml[end - 1] !== '/') depth++
    }
    if (depth < 0 || depth > NFE_DISTRIBUTION_LIMITS.xmlDepth || elements > NFE_DISTRIBUTION_LIMITS.xmlElements) {
      failure('INVALID_XML', 'A estrutura XML fiscal excede o limite permitido.')
    }
    index = end + 1
  }
  if (depth !== 0) failure('INVALID_XML', 'Estrutura XML fiscal incompleta.')
}

function parseXml(xml: string): JSDOM {
  preflightXml(xml)
  try {
    // JSDOM sem execução de scripts nem carregamento de recursos externos.
    return new JSDOM(xml, { contentType: 'application/xml' })
  } catch { return failure('INVALID_XML', 'Não foi possível interpretar o XML fiscal.') }
}

function elements(node: Element): Element[] { return Array.from(node.children) }

function child(node: Element, name: string, namespace = NFE_NAMESPACE, required = true): Element | undefined {
  const matches = elements(node).filter((value) => value.localName === name)
  if (matches.length > 1 || matches.some((value) => value.namespaceURI !== namespace) || (required && matches.length !== 1)) {
    failure('INVALID_XML', 'Estrutura ou namespace do XML fiscal inválido.')
  }
  return matches[0]
}

function textValue(node: Element, name: string, required = true, max = 255): string | undefined {
  const value = child(node, name, NFE_NAMESPACE, required)
  if (!value) return undefined
  const text = value.textContent?.trim() ?? ''
  if (value.childElementCount > 0 || (required && !text) || text.length > max) failure('INVALID_XML', 'Campo XML fiscal inválido.')
  return text || undefined
}

function allowedChildren(node: Element, allowed: string[], namespace = NFE_NAMESPACE): void {
  if (elements(node).some((value) => value.namespaceURI !== namespace || !allowed.includes(value.localName))) {
    failure('INVALID_XML', 'Estrutura ou namespace fiscal não suportado.')
  }
}

function validDate(value: string | undefined, required = true): string | undefined {
  if (!value && !required) return undefined
  const parts = value?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/)
  if (!value || !parts || !Number.isFinite(Date.parse(value))) {
    failure('INVALID_DOCUMENT', 'Data fiscal inválida no documento recebido.')
  }
  const [, year, month, day, hour, minute, second, zoneHour = '0', zoneMinute = '0'] = parts
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > days ||
      Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 ||
      Number(zoneHour) > 14 || Number(zoneMinute) > 59 || (Number(zoneHour) === 14 && Number(zoneMinute) !== 0)) {
    failure('INVALID_DOCUMENT', 'Data fiscal inválida no documento recebido.')
  }
  return value
}

function validKey(value: string | undefined): string {
  if (!value || !KEY_FORMAT.test(value)) failure('INVALID_DOCUMENT', 'Chave da NF-e inválida no documento recebido.')
  return value
}

function party(node: Element, required = false): NfeDistributionParty | undefined {
  const cnpj = textValue(node, 'CNPJ', false, 14)
  const cpf = textValue(node, 'CPF', false, 11)
  const documento = cnpj ?? cpf
  if ((cnpj && cpf) || (documento && !DOCUMENTO_FORMAT.test(documento)) || (required && !documento)) {
    failure('INVALID_DOCUMENT', 'Identificação fiscal inválida no documento recebido.')
  }
  const nome = textValue(node, 'xNome', false, 120)
  return documento || nome ? { ...(documento ? { documento } : {}), ...(nome ? { nome } : {}) } : undefined
}

function money(node: Element): string {
  const value = textValue(node, 'vNF')!
  if (!MONEY_FORMAT.test(value)) failure('INVALID_DOCUMENT', 'Valor fiscal inválido no documento recebido.')
  return value
}

const schemas: Readonly<Record<string, { root: string; version: string; kind: NfeDistributionDocument['kind'] }>> = Object.freeze({
  'resNFe_v1.00.xsd': { root: 'resNFe', version: '1.00', kind: 'nfe_summary' },
  'resNFe_v1.01.xsd': { root: 'resNFe', version: '1.01', kind: 'nfe_summary' },
  'procNFe_v3.10.xsd': { root: 'nfeProc', version: '3.10', kind: 'nfe' },
  'procNFe_v4.00.xsd': { root: 'nfeProc', version: '4.00', kind: 'nfe' },
  'resEvento_v1.00.xsd': { root: 'resEvento', version: '1.00', kind: 'event_summary' },
  'resEvento_v1.01.xsd': { root: 'resEvento', version: '1.01', kind: 'event_summary' },
  'procEventoNFe_v1.00.xsd': { root: 'procEventoNFe', version: '1.00', kind: 'event' },
})

export function documentMetadata(xml: string, schema: string, nsu: string): NfeDistributionDocument {
  if (!Object.hasOwn(schemas, schema)) failure('UNSUPPORTED_SCHEMA', 'O lote fiscal contém um tipo ou versão de documento ainda não suportado.')
  const expected = schemas[schema]
  const dom = parseXml(xml)
  try {
    const root = dom.window.document.documentElement
    if (root.localName !== expected.root || root.namespaceURI !== NFE_NAMESPACE || root.getAttribute('versao') !== expected.version) {
      failure('INVALID_DOCUMENT', 'O documento fiscal não corresponde ao tipo e versão informados.')
    }
    const document: NfeDistributionDocument = { nsu, schema, xml, kind: expected.kind }
    if (expected.kind === 'nfe_summary') {
      document.key = validKey(textValue(root, 'chNFe'))
      document.issuer = party(root, true)
      document.issuedAt = validDate(textValue(root, 'dhEmi'))
      document.value = money(root)
      const status = textValue(root, 'cSitNFe')
      if (!status || !/^[123]$/.test(status)) failure('INVALID_DOCUMENT', 'Situação fiscal inválida no resumo recebido.')
      document.summary = `Resumo da NF-e: ${status === '1' ? 'uso autorizado' : status === '2' ? 'uso denegado' : 'cancelada'}. XML integral não recebido neste documento.`
    } else if (expected.kind === 'nfe') {
      const info = child(child(root, 'NFe')!, 'infNFe')!
      const id = info.getAttribute('Id')
      if (!id?.startsWith('NFe') || info.getAttribute('versao') !== expected.version) failure('INVALID_DOCUMENT', 'Identificação da NF-e não corresponde ao leiaute recebido.')
      document.key = validKey(id.slice(3))
      const protocol = child(child(root, 'protNFe')!, 'infProt')!
      if (textValue(protocol, 'chNFe') !== document.key || textValue(protocol, 'tpAmb') !== '1') failure('INVALID_DOCUMENT', 'Protocolo da NF-e não corresponde ao documento recebido.')
      const ide = child(info, 'ide')!
      if (textValue(ide, 'tpAmb') !== '1') failure('INVALID_DOCUMENT', 'Documento fiscal recebido em ambiente diferente de produção.')
      document.issuer = party(child(info, 'emit')!, true)
      const dest = child(info, 'dest', NFE_NAMESPACE, false)
      document.recipient = dest ? party(dest) : undefined
      document.issuedAt = validDate(textValue(ide, 'dhEmi'))
      document.value = money(child(child(info, 'total')!, 'ICMSTot')!)
      document.summary = 'XML da NF-e e protocolo recebidos do Ambiente Nacional. O valor da nota não comprova recebimento ou pagamento.'
    } else if (expected.kind === 'event_summary') {
      document.key = validKey(textValue(root, 'chNFe'))
      document.issuer = party(root)
      document.issuedAt = validDate(textValue(root, 'dhEvento'))
      const type = textValue(root, 'tpEvento')!
      if (!/^\d{6}$/.test(type)) failure('INVALID_DOCUMENT', 'Tipo de evento fiscal inválido.')
      document.summary = `Resumo de evento fiscal ${type}${textValue(root, 'xEvento', false, 120) ? `: ${textValue(root, 'xEvento', false, 120)}` : ''}.`
    } else {
      const event = child(child(root, 'evento')!, 'infEvento')!
      const result = child(child(root, 'retEvento')!, 'infEvento')!
      document.key = validKey(textValue(event, 'chNFe'))
      const type = textValue(event, 'tpEvento')!
      const sequence = textValue(event, 'nSeqEvento')!
      if (!/^\d{6}$/.test(type) || !/^\d{1,2}$/.test(sequence) || textValue(result, 'chNFe') !== document.key ||
          textValue(result, 'tpEvento') !== type || textValue(result, 'nSeqEvento') !== sequence ||
          textValue(event, 'tpAmb') !== '1' || textValue(result, 'tpAmb') !== '1') {
        failure('INVALID_DOCUMENT', 'Protocolo do evento fiscal não corresponde ao documento recebido.')
      }
      document.issuer = party(event)
      document.issuedAt = validDate(textValue(event, 'dhEvento'))
      const detail = child(event, 'detEvento', NFE_NAMESPACE, false)
      const description = detail ? textValue(detail, 'descEvento', false, 120) : undefined
      document.summary = `Evento fiscal ${type}${description ? `: ${description}` : ''}. Consulta apenas; nenhum evento foi enviado pelo ALETIS.`
    }
    document.details = extractFiscalDetails(root, expected.kind)
    return document
  } finally { dom.window.close() }
}

async function decompressDocument(value: string): Promise<Buffer> {
  const encoded = value.replace(/[\r\n\t ]/g, '')
  if (!encoded || encoded.length > Math.ceil(NFE_DISTRIBUTION_LIMITS.compressedDocumentBytes / 3) * 4 ||
      encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    failure('INVALID_DOCUMENT', 'Codificação de documento fiscal compactado inválida.')
  }
  const zipped = Buffer.from(encoded, 'base64')
  if (zipped.length < 18 || zipped.length > NFE_DISTRIBUTION_LIMITS.compressedDocumentBytes || zipped[0] !== 0x1f || zipped[1] !== 0x8b || zipped[2] !== 8 || zipped.toString('base64') !== encoded) {
    failure('INVALID_DOCUMENT', 'Documento fiscal compactado inválido.')
  }
  return new Promise((resolve, reject) => gunzip(zipped, { maxOutputLength: NFE_DISTRIBUTION_LIMITS.documentBytes }, (error, output) => {
    if (error) reject(new NfeDistributionError((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE' ? 'DOCUMENT_TOO_LARGE' : 'INVALID_DOCUMENT', 'Não foi possível descompactar o documento fiscal dentro dos limites permitidos.'))
    else resolve(output)
  }))
}

async function parseResponse(response: NfeDistributionTransportResponse, input: NfeDistributionInput): Promise<NfeDistributionResult> {
  if (response.statusCode !== 200) throw new NfeDistributionError('HTTP_ERROR', 'O serviço fiscal não concluiu a consulta.', response.statusCode)
  if (!Buffer.isBuffer(response.body) || response.body.length > NFE_DISTRIBUTION_LIMITS.responseBytes) failure('RESPONSE_TOO_LARGE', 'Resposta fiscal excede o limite permitido.')
  if (response.contentEncoding && response.contentEncoding.toLowerCase() !== 'identity') failure('INVALID_RESPONSE', 'Compactação HTTP fiscal não suportada.')
  if (response.contentType && !/^(?:application\/(?:soap\+xml|xml)|text\/xml)(?:\s*;|$)/i.test(response.contentType)) failure('INVALID_RESPONSE', 'A SEFAZ não retornou uma resposta XML fiscal.')
  const dom = parseXml(decodeUtf8(response.body))
  try {
    const envelope = dom.window.document.documentElement
    const soap = envelope.namespaceURI
    if (envelope.localName !== 'Envelope' || (soap !== SOAP_12_NAMESPACE && soap !== SOAP_11_NAMESPACE)) failure('INVALID_RESPONSE', 'Envelope de resposta fiscal inválido.')
    allowedChildren(envelope, ['Header', 'Body'], soap)
    const body = child(envelope, 'Body', soap)!
    const operation = child(body, 'nfeDistDFeInteresseResponse', WSDL_NAMESPACE)!
    if (body.childElementCount !== 1 || operation.childElementCount !== 1) failure('INVALID_RESPONSE', 'Operação de resposta fiscal inválida.')
    const result = child(operation, 'nfeDistDFeInteresseResult', WSDL_NAMESPACE)!
    const fiscal = child(result, 'retDistDFeInt')!
    if (result.childElementCount !== 1 || !['1.00', '1.01'].includes(fiscal.getAttribute('versao') ?? '')) failure('INVALID_RESPONSE', 'Versão de resposta fiscal não suportada.')
    allowedChildren(fiscal, ['tpAmb', 'verAplic', 'cStat', 'xMotivo', 'dhResp', 'ultNSU', 'maxNSU', 'loteDistDFeInt'])
    if (textValue(fiscal, 'tpAmb') !== '1') failure('INVALID_RESPONSE', 'A SEFAZ retornou um ambiente fiscal diferente de produção.')
    textValue(fiscal, 'verAplic', true, 20)
    const statusCode = textValue(fiscal, 'cStat')!
    if (!/^\d{3}$/.test(statusCode)) failure('INVALID_RESPONSE', 'Código de resposta fiscal inválido.')
    const message = textValue(fiscal, 'xMotivo')!
    const receivedAt = validDate(textValue(fiscal, 'dhResp'))!
    const rawUlt = textValue(fiscal, 'ultNSU', false, 15)
    const rawMax = textValue(fiscal, 'maxNSU', false, 15)
    const successful = statusCode === '137' || statusCode === '138'
    if (successful && !input.consulta && (!rawUlt || !rawMax)) failure('INVALID_PAGINATION', 'Resposta fiscal sem os cursores necessários para continuar com segurança.')
    const ultNSU = normalizeNsu(rawUlt ?? input.ultNSU, 'INVALID_PAGINATION')
    const maxNSU = normalizeNsu(rawMax ?? ultNSU, 'INVALID_PAGINATION')
    if (ultNSU > maxNSU || (successful && !input.consulta && ultNSU < input.ultNSU)) failure('INVALID_PAGINATION', 'Sequência fiscal retornada incompatível com a consulta.')
    const batch = child(fiscal, 'loteDistDFeInt', NFE_NAMESPACE, false)
    const zipped = batch ? elements(batch) : []
    if (batch) allowedChildren(batch, ['docZip'])
    if ((statusCode === '138' && (zipped.length === 0 || zipped.length > NFE_DISTRIBUTION_LIMITS.documents)) ||
        (statusCode !== '138' && zipped.length > 0) || (statusCode === '137' && !input.consulta && ultNSU !== maxNSU) || (input.consulta && zipped.length>1)) {
      failure('INVALID_PAGINATION', 'Lote de documentos incompatível com o retorno fiscal.')
    }
    const documents: NfeDistributionDocument[] = []
    let previousNsu = input.ultNSU
    let totalBytes = 0
    for (const entry of zipped) {
      if (input.signal?.aborted) failure('ABORTED', 'Consulta fiscal interrompida.')
      const rawNsu=entry.getAttribute('NSU')
      const nsu = !rawNsu && input.consulta?.tipo==='chave' ? '' : normalizeNsu(rawNsu ?? '', 'INVALID_PAGINATION')
      if ((!input.consulta && (nsu <= previousNsu || nsu > ultNSU)) || (input.consulta?.tipo==='nsu'&&nsu!==input.consulta.valor) || entry.childElementCount > 0) failure('INVALID_PAGINATION', 'Ordem dos documentos fiscais inválida; o cursor foi preservado.')
      const schema = entry.getAttribute('schema') ?? ''
      if (!Object.hasOwn(schemas, schema)) failure('UNSUPPORTED_SCHEMA', 'O lote fiscal contém um tipo ou versão de documento ainda não suportado.')
      const bytes = await decompressDocument(entry.textContent ?? '')
      totalBytes += bytes.length
      if (totalBytes > NFE_DISTRIBUTION_LIMITS.batchDocumentBytes) failure('DOCUMENT_TOO_LARGE', 'O lote de documentos fiscais excede o limite permitido.')
      const document=documentMetadata(decodeUtf8(bytes), schema, nsu)
      if(input.consulta?.tipo==='chave'&&(document.key!==input.consulta.valor||document.kind!=='nfe'))failure('INVALID_DOCUMENT','A resposta não contém o XML integral da chave consultada.')
      documents.push(document)
      previousNsu = nsu
    }
    if (statusCode === '138' && !input.consulta && previousNsu !== ultNSU) failure('INVALID_PAGINATION', 'O último documento recebido não corresponde ao cursor fiscal retornado.')
    return { statusCode, message, ultNSU, maxNSU, receivedAt, cursorReceived: !!rawUlt && !!rawMax, documents }
  } finally { dom.window.close() }
}

/** Distribuição e consultas pontuais. Persistência e limites por titular ficam no serviço. */
export async function queryNfeDistribution(input: NfeDistributionInput, transport: NfeDistributionTransport = officialTransport): Promise<NfeDistributionResult> {
  const normalized = normalizeInput(input)
  if (normalized.signal?.aborted) failure('ABORTED', 'Consulta fiscal interrompida.')
  let response: NfeDistributionTransportResponse
  try {
    response = await transport({ endpoint: NFE_DISTRIBUTION_ENDPOINT, body: requestXml(normalized), pfx: normalized.pfx, passphrase: normalized.passphrase, signal: normalized.signal })
  } catch (error) {
    if (error instanceof NfeDistributionError) throw error
    failure('TRANSPORT_ERROR', 'Não foi possível estabelecer a conexão segura com a SEFAZ.')
  }
  if (normalized.signal?.aborted) failure('ABORTED', 'Consulta fiscal interrompida.')
  return parseResponse(response, normalized)
}
