/** Credenciais privadas não pertencem ao fluxo de documentos, OCR ou Drive.
 * Esta inspeção reconhece formatos usuais; não substitui um cofre de segredos
 * nem garante identificar credenciais escondidas em imagens/arquivos cifrados. */
const PRIVATE_PEM = /-----BEGIN\s+(?:(?:RSA|EC|DSA|ENCRYPTED|OPENSSH)\s+)?PRIVATE\s+KEY-----|-----BEGIN\s+(?:PGP\s+PRIVATE\s+KEY\s+BLOCK|PKCS12|PFX)-----/i
const PFX_VERSION = Buffer.from([0x02, 0x01, 0x03])
const CMS_OID_PREFIX = Buffer.from('2a864886f70d0107', 'hex')

function derElement(buffer: Buffer, offset: number, tag: number): { start: number; end: number } | null {
  if (offset < 0 || offset + 2 > buffer.length || buffer[offset] !== tag) return null
  let length = buffer[offset + 1]
  let start = offset + 2
  if (length & 0x80) {
    const bytes = length & 0x7f
    if (!bytes || bytes > 4 || start + bytes > buffer.length || buffer[start] === 0) return null
    length = 0
    for (let index = 0; index < bytes; index++) length = length * 256 + buffer[start + index]
    start += bytes
    if (length < 128) return null
  }
  if (start + length > buffer.length) return null
  return { start, end: start + length }
}

/** PKCS#12: SEQUENCE { version INTEGER 3, authSafe ContentInfo, macData? }.
 * A busca também alcança um contêiner anexado a um arquivo com cabeçalho PDF. */
function containsPkcs12(buffer: Buffer): boolean {
  let position = buffer.indexOf(PFX_VERSION)
  while (position >= 0) {
    const content = derElement(buffer, position + PFX_VERSION.length, 0x30)
    const oid = content && derElement(buffer, content.start, 0x06)
    if (content && oid && oid.end <= content.end && oid.end - oid.start === 9
      && buffer.subarray(oid.start, oid.start + 8).equals(CMS_OID_PREFIX)
      && [1, 2].includes(buffer[oid.start + 8])) {
      for (let header = 2; header <= 6; header++) {
        const envelope = derElement(buffer, position - header, 0x30)
        if (envelope?.start === position && envelope.end >= content.end) return true
      }
    }
    position = buffer.indexOf(PFX_VERSION, position + PFX_VERSION.length)
  }
  return false
}

function containsPrivateRsaXml(text: string): boolean {
  let keyDepth = 0
  for (const match of text.matchAll(/<(\/?)(?:[\w.-]+:)?(RSAKeyValue|InverseQ|DP|DQ|D|P|Q)\b[^<>]*>/gi)) {
    const closing = match[1] === '/'
    if (match[2].toLowerCase() === 'rsakeyvalue') {
      if (!match[0].endsWith('/>')) keyDepth = closing ? Math.max(0, keyDepth - 1) : keyDepth + 1
    } else if (keyDepth > 0 && !closing) return true
  }
  return false
}

export function containsPortalPrivateCredential(buffer: Buffer): boolean {
  if (containsPkcs12(buffer)) return true
  const text = buffer.toString('latin1')
  if (PRIVATE_PEM.test(text)) return true
  if (buffer[0] === 0xff && buffer[1] === 0xfe && PRIVATE_PEM.test(buffer.toString('utf16le'))) return true
  // Exportação XML de chave RSA privada; XMLDSig público possui apenas Modulus/Exponent.
  if (containsPrivateRsaXml(text)) return true
  // Um PFX convertido integralmente para base64 continua sendo credencial privada.
  if (buffer.length >= 64 && /^[A-Za-z0-9+/=\r\n\t ]+$/.test(text)) {
    const compact = text.replace(/\s/g, '')
    if (compact.length % 4 === 0 && containsPkcs12(Buffer.from(compact, 'base64'))) return true
  }
  return false
}
