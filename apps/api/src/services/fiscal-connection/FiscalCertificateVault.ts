import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { chmod, mkdtemp, open, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { createCipheriv, createDecipheriv, createHash, createPrivateKey, randomBytes, X509Certificate, type KeyObject } from 'node:crypto'
import type { Writable } from 'node:stream'

/** Material privado nunca passa pelo fluxo de documentos, Drive, ALIX ou logs. */
export const MAX_FISCAL_CERTIFICATE_BYTES = 256 * 1024
const MAX_OPENSSL_OUTPUT = 4 * MAX_FISCAL_CERTIFICATE_BYTES
const DEFAULT_CA_FILE = '/etc/aletis/fiscal/icp-brasil.pem'
const DEFAULT_KEY_FILE = '/etc/aletis/fiscal/vault.key'

export class FiscalCertificateError extends Error {
  readonly statusCode: number
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'FiscalCertificateError'
    this.statusCode = code === 'FISCAL_CERTIFICATE_BUSY' ? 429 : ['FISCAL_VAULT_NOT_CONFIGURED', 'FISCAL_CERTIFICATE_TRUST_NOT_CONFIGURED', 'FISCAL_CERTIFICATE_PROCESSING_FAILED'].includes(code) ? 503 : 400
  }
}

export interface FiscalCertificateMetadata {
  documentType: 'CPF' | 'CNPJ'
  /** Identificador exato: uso interno para conferir titularidade; não enviar à ALIX. */
  document: string
  maskedDocument: string
  subject: string
  issuer: string
  serialNumber: string
  fingerprint256: string
  validFrom: string
  validTo: string
  keyType: 'rsa'
  keyBits: number
  chainVerified: true
  revocationChecked: false
}

export interface FiscalCertificateEnvelope {
  version: 1
  algorithm: 'aes-256-gcm'
  keyId: string
  iv: string
  ciphertext: string
  tag: string
}

export interface FiscalCertificateContext { clienteId: string; credentialId: string }
export interface OpenedFiscalCertificate {
  pfx: Buffer
  passphrase: string
  /** Reduz a permanência de segredos em memória; strings/KeyObjects dependem também do GC. */
  dispose(): void
}

export interface FiscalTlsIdentity {
  cert: Buffer
  key: Buffer
  dispose(): void
}

function failure(code: string, message: string): FiscalCertificateError {
  return new FiscalCertificateError(code, message)
}

function assertInput(pfx: Buffer, password: string): void {
  if (!Buffer.isBuffer(pfx) || pfx.length < 16 || pfx.length > MAX_FISCAL_CERTIFICATE_BYTES) {
    throw failure('FISCAL_CERTIFICATE_INVALID', 'Envie um certificado A1 válido em formato PFX ou P12, com até 256 KB.')
  }
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 1024 || /[\r\n\0]/.test(password)) {
    throw failure('FISCAL_CERTIFICATE_PASSWORD_INVALID', 'A senha do certificado não é válida para importação.')
  }
  try {
    const outer = derNode(pfx, 0)
    if (outer.tag !== 0x30 || outer.end !== pfx.length) throw new Error('Estrutura inválida')
  } catch { throw failure('FISCAL_CERTIFICATE_INVALID', 'O arquivo não contém um único certificado PFX/P12 válido.') }
}

let opensslRunning = 0

/** Senha em descritor separado; nenhum segredo em argumentos, ambiente ou arquivo temporário. */
async function runOpenSsl(args: string[], input?: Buffer, password?: string): Promise<Buffer> {
  if (opensslRunning >= 4) throw failure('FISCAL_CERTIFICATE_BUSY', 'Há outras verificações de certificados em andamento. Tente novamente em instantes.')
  opensslRunning += 1
  const passwordBytes = password === undefined ? undefined : Buffer.from(`${password}\n`, 'utf8')
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      let total = 0
      let finished = false
      const child = spawn('openssl', args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore', 'pipe'] })
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        finish(failure('FISCAL_CERTIFICATE_PROCESSING_FAILED', 'Não foi possível processar o certificado dentro do tempo permitido.'))
      }, 12_000)
      const finish = (error?: Error) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        const output = error ? undefined : Buffer.concat(chunks, total)
        for (const chunk of chunks) chunk.fill(0)
        if (error) reject(error)
        else resolve(output!)
      }
      child.stdout!.on('data', (chunk: Buffer) => {
        if (finished) { chunk.fill(0); return }
        total += chunk.length
        if (total > MAX_OPENSSL_OUTPUT) {
          chunk.fill(0)
          child.kill('SIGKILL')
          finish(failure('FISCAL_CERTIFICATE_INVALID', 'O certificado contém dados acima do limite permitido.'))
          return
        }
        chunks.push(chunk)
      })
      child.on('error', () => finish(failure('FISCAL_CERTIFICATE_PROCESSING_FAILED', 'O verificador de certificados não está disponível.')))
      child.on('close', (code) => finish(code === 0 ? undefined : failure('FISCAL_CERTIFICATE_PROCESSING_FAILED', 'Não foi possível verificar o certificado. Confira o arquivo e a senha.')))
      child.stdin!.on('error', () => { /* A falha é consolidada pelo encerramento do processo. */ })
      const passStream = child.stdio[3] as Writable
      passStream.on('error', () => { /* Não registrar senha nem erro bruto do OpenSSL. */ })
      child.stdin!.end(input)
      passStream.end(passwordBytes)
    })
  } finally {
    passwordBytes?.fill(0)
    opensslRunning -= 1
  }
}

function pemBlocks(data: Buffer, label: string): Buffer[] {
  const startMarker = Buffer.from(`-----BEGIN ${label}-----`)
  const endMarker = Buffer.from(`-----END ${label}-----`)
  const blocks: Buffer[] = []
  let offset = 0
  while (offset < data.length) {
    const start = data.indexOf(startMarker, offset)
    if (start < 0) break
    const end = data.indexOf(endMarker, start + startMarker.length)
    if (end < 0 || blocks.length >= 32) throw failure('FISCAL_CERTIFICATE_INVALID', 'A estrutura do certificado é inválida.')
    blocks.push(Buffer.from(data.subarray(start, end + endMarker.length)))
    offset = end + endMarker.length
  }
  return blocks
}

interface CertificateBundle { keyPem: Buffer; key: KeyObject; certificates: { pem: Buffer; x509: X509Certificate }[]; leaf: X509Certificate; leafPem: Buffer }

async function extractBundle(pfx: Buffer, password: string): Promise<CertificateBundle> {
  assertInput(pfx, password)
  let output: Buffer
  try {
    output = await runOpenSsl(['pkcs12', '-passin', 'fd:3', '-nodes'], pfx, password)
  } catch (error) {
    if (!(error instanceof FiscalCertificateError) || error.code !== 'FISCAL_CERTIFICATE_PROCESSING_FAILED') throw error
    // Somente a leitura permite cifras antigas. O cofre converte a saída para AES/SHA-256.
    try {
      output = await runOpenSsl(['pkcs12', '-legacy', '-passin', 'fd:3', '-nodes'], pfx, password)
    } catch (legacyError) {
      if (legacyError instanceof FiscalCertificateError && legacyError.code === 'FISCAL_CERTIFICATE_BUSY') throw legacyError
      throw failure('FISCAL_CERTIFICATE_INVALID', 'Não foi possível abrir o certificado. Confira o arquivo PFX/P12 e sua senha.')
    }
  }
  const privateBlocks: Buffer[] = []
  const certificateBlocks: Buffer[] = []
  let success = false
  try {
    privateBlocks.push(...pemBlocks(output, 'PRIVATE KEY'), ...pemBlocks(output, 'RSA PRIVATE KEY'), ...pemBlocks(output, 'EC PRIVATE KEY'))
    certificateBlocks.push(...pemBlocks(output, 'CERTIFICATE'))
    if (privateBlocks.length !== 1 || !certificateBlocks.length) {
      throw failure('FISCAL_CERTIFICATE_AMBIGUOUS', 'O arquivo deve conter exatamente uma chave privada e seu certificado de titular.')
    }
    const key = createPrivateKey(privateBlocks[0])
    if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 || (key.asymmetricKeyDetails?.modulusLength ?? 0) > 8192) {
      throw failure('FISCAL_CERTIFICATE_KEY_UNSUPPORTED', 'Use um certificado A1 ICP-Brasil com chave RSA de 2048 a 8192 bits.')
    }
    const all = certificateBlocks.map((pem) => ({ pem, x509: new X509Certificate(pem) }))
    const certificates = all.filter((value, index) => all.findIndex((candidate) => candidate.x509.fingerprint256 === value.x509.fingerprint256) === index)
    const leaves = certificates.filter(({ x509 }) => x509.checkPrivateKey(key))
    if (leaves.length !== 1 || leaves[0].x509.ca || certificates.some(({ x509 }) => !x509.ca && x509.fingerprint256 !== leaves[0]?.x509.fingerprint256)) {
      throw failure('FISCAL_CERTIFICATE_KEY_MISMATCH', 'A chave privada deve corresponder a um único certificado de titular no arquivo.')
    }
    success = true
    return { keyPem: privateBlocks[0], key, certificates: all, leaf: leaves[0].x509, leafPem: leaves[0].pem }
  } catch (error) {
    if (error instanceof FiscalCertificateError) throw error
    throw failure('FISCAL_CERTIFICATE_INVALID', 'A estrutura do certificado não pôde ser validada.')
  } finally {
    output.fill(0)
    if (!success) {
      for (const part of privateBlocks) part.fill(0)
      for (const part of certificateBlocks) part.fill(0)
    }
  }
}

function disposeBundle(bundle: CertificateBundle): void {
  bundle.keyPem.fill(0)
  for (const certificate of bundle.certificates) certificate.pem.fill(0)
}

/** PFX acrescenta suas CAs à confiança remota do Node, mesmo quando `ca` é explícita.
 * A identidade mTLS deve usar cert/key separados. As autoridades do servidor vêm
 * exclusivamente da configuração TLS do conector, nunca do arquivo do cliente.
 * Executar inspectCertificate antes desta preparação para conferir a confiança ICP.
 */
export async function prepareFiscalTlsIdentity(pfx: Buffer, passphrase: string): Promise<FiscalTlsIdentity> {
  const bundle = await extractBundle(pfx, passphrase)
  try {
    const chain = [bundle.leafPem]
    const seen = new Set([bundle.leaf.fingerprint256])
    let descendants = [bundle.leaf]
    // Aceita alternativas de cadeia cruzada, desde que cada vínculo tenha assinatura válida.
    // Não envia raízes autoassinadas ou CAs que não participem da cadeia do titular.
    for (let depth = 0; depth < 32 && descendants.length; depth++) {
      const parents: X509Certificate[] = []
      for (const candidate of bundle.certificates) {
        if (seen.has(candidate.x509.fingerprint256) || !candidate.x509.ca) continue
        let linked = false
        try { linked = descendants.some((child) => child.checkIssued(candidate.x509) && child.verify(candidate.x509.publicKey)) }
        catch { /* Uma CA adicional incompatível não participa da cadeia transmitida. */ }
        if (!linked) continue
        seen.add(candidate.x509.fingerprint256)
        if (!candidate.x509.checkIssued(candidate.x509)) {
          chain.push(candidate.pem)
          parents.push(candidate.x509)
        }
      }
      descendants = parents
    }
    const identity: FiscalTlsIdentity = {
      cert: Buffer.concat(chain.flatMap((pem) => [pem, Buffer.from('\n')])),
      key: Buffer.from(bundle.keyPem),
      dispose() { identity.cert.fill(0); identity.key.fill(0) },
    }
    return identity
  } finally { disposeBundle(bundle) }
}

interface DerNode { tag: number; content: Buffer; end: number }

function derNode(data: Buffer, offset: number): DerNode {
  if (offset < 0 || offset + 2 > data.length || (data[offset] & 31) === 31) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'O identificador do titular tem codificação inválida.')
  const tag = data[offset]
  let cursor = offset + 1
  let length = data[cursor++]
  if (length & 128) {
    const count = length & 127
    if (count < 1 || count > 4 || cursor + count > data.length || data[cursor] === 0) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'O identificador do titular tem codificação inválida.')
    length = 0
    for (let index = 0; index < count; index++) length = length * 256 + data[cursor++]
    if (length < 128) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'O identificador do titular tem codificação inválida.')
  }
  if (cursor + length > data.length) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'O identificador do titular tem codificação inválida.')
  return { tag, content: data.subarray(cursor, cursor + length), end: cursor + length }
}

function derChildren(data: Buffer): DerNode[] {
  const nodes: DerNode[] = []
  let offset = 0
  while (offset < data.length) {
    if (nodes.length >= 128) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'O certificado contém identificadores acima do limite.')
    const node = derNode(data, offset)
    nodes.push(node)
    offset = node.end
  }
  return nodes
}

function decodeIdentityValue(node: DerNode): string {
  if (node.content.length > 512) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'O identificador do titular tem tamanho inválido.')
  let text: string
  if (node.tag === 0x1e) {
    if (node.content.length % 2) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'O identificador do titular tem codificação inválida.')
    const swapped = Buffer.from(node.content)
    text = swapped.swap16().toString('utf16le')
    swapped.fill(0)
  } else if ([0x04, 0x0c, 0x12, 0x13, 0x14, 0x16].includes(node.tag)) {
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(node.content) }
    catch { throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'O identificador do titular tem codificação inválida.') }
  } else throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'O identificador do titular tem codificação não suportada.')
  if (/[\x00-\x1f\x7f-\x9f]/.test(text)) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'O identificador do titular contém caracteres inválidos.')
  return text
}

function checkDocument(document: string, kind: 'CPF' | 'CNPJ'): boolean {
  if (kind === 'CPF') {
    if (!/^\d{11}$/.test(document) || /^(\d)\1+$/.test(document)) return false
    const digit = (length: number) => {
      let sum = 0
      for (let index = 0; index < length; index++) sum += Number(document[index]) * (length + 1 - index)
      const remainder = (sum * 10) % 11
      return remainder === 10 ? 0 : remainder
    }
    return digit(9) === Number(document[9]) && digit(10) === Number(document[10])
  }
  if (!/^[A-Z0-9]{12}\d{2}$/.test(document) || /^(\d)\1+$/.test(document)) return false
  const digit = (length: number) => {
    let weight = length - 7
    let sum = 0
    for (let index = 0; index < length; index++) {
      sum += (document.charCodeAt(index) - 48) * weight
      weight = weight === 2 ? 9 : weight - 1
    }
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }
  return digit(12) === Number(document[12]) && digit(13) === Number(document[13])
}

/** CPF é a posição 9–19 do otherName 2.16.76.1.3.1; CNPJ está no 2.16.76.1.3.3.
 * O CPF do responsável pelo e-CNPJ (2.16.76.1.3.4) nunca é tratado como titular.
 */
function certificateIdentity(leaf: X509Certificate): Pick<FiscalCertificateMetadata, 'document' | 'documentType' | 'maskedDocument'> {
  const raw = leaf.raw
  const outer = derNode(raw, 0)
  if (outer.tag !== 0x30 || outer.end !== raw.length) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'O certificado tem estrutura inválida.')
  const tbs = derChildren(outer.content)[0]
  if (tbs?.tag !== 0x30) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'O certificado tem estrutura inválida.')
  const extensionsContainer = derChildren(tbs.content).filter((node) => node.tag === 0xa3)
  if (extensionsContainer.length !== 1) throw failure('FISCAL_CERTIFICATE_IDENTITY_MISSING', 'Não foi encontrado o CPF/CNPJ ICP-Brasil do titular.')
  const extensionSequence = derChildren(extensionsContainer[0].content)
  if (extensionSequence.length !== 1 || extensionSequence[0].tag !== 0x30) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'As extensões do certificado têm estrutura inválida.')
  const found: { kind: 'CPF' | 'CNPJ'; value: string }[] = []
  let sanCount = 0
  for (const extension of derChildren(extensionSequence[0].content)) {
    if (extension.tag !== 0x30) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'As extensões do certificado têm estrutura inválida.')
    const fields = derChildren(extension.content)
    if (fields[0]?.tag !== 0x06 || fields[0].content.toString('hex') !== '551d11') continue
    if (++sanCount > 1) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'O certificado contém identificadores repetidos.')
    const value = fields[fields.length - 1]
    if (value.tag !== 0x04) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'Os identificadores do certificado têm estrutura inválida.')
    const generalNames = derChildren(value.content)
    if (generalNames.length !== 1 || generalNames[0].tag !== 0x30) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'Os identificadores do certificado têm estrutura inválida.')
    for (const generalName of derChildren(generalNames[0].content)) {
      if (generalName.tag !== 0xa0) continue
      const otherName = derChildren(generalName.content)
      if (otherName[0]?.tag !== 0x06) continue
      const oid = otherName[0].content.toString('hex')
      const kind = oid === '604c010301' ? 'CPF' : oid === '604c010303' ? 'CNPJ' : undefined
      if (!kind) continue
      if (otherName.length !== 2 || otherName[1].tag !== 0xa0) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'O CPF/CNPJ ICP-Brasil tem estrutura inválida.')
      const inner = derChildren(otherName[1].content)
      if (inner.length !== 1) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'O CPF/CNPJ ICP-Brasil tem estrutura inválida.')
      const content = decodeIdentityValue(inner[0])
      if (kind === 'CPF' && !/^\d{19}/.test(content)) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'O CPF ICP-Brasil do titular está incompleto.')
      const document = kind === 'CPF' ? content.slice(8, 19) : content
      if (!checkDocument(document, kind)) throw failure('FISCAL_CERTIFICATE_IDENTITY_INVALID', 'O CPF/CNPJ ICP-Brasil do titular não é válido.')
      found.push({ kind, value: document })
    }
  }
  if (!found.length) throw failure('FISCAL_CERTIFICATE_IDENTITY_MISSING', 'Não foi encontrado o CPF/CNPJ ICP-Brasil do titular. Um nome ou CPF no nome do arquivo não comprova titularidade.')
  if (found.length !== 1) throw failure('FISCAL_CERTIFICATE_IDENTITY_AMBIGUOUS', 'O certificado contém mais de um identificador de titular. Envie um certificado individual.')
  const { kind: documentType, value: document } = found[0]
  const maskedDocument = documentType === 'CPF' ? `***.***.${document.slice(6, 9)}-${document.slice(9)}` : `${document.slice(0, 2)}.***.***/****-${document.slice(12)}`
  return { documentType, document, maskedDocument }
}

async function readProtectedFile(path: string, kind: 'key' | 'ca'): Promise<Buffer> {
  const code = kind === 'key' ? 'FISCAL_VAULT_NOT_CONFIGURED' : 'FISCAL_CERTIFICATE_TRUST_NOT_CONFIGURED'
  const message = kind === 'key' ? 'O cofre de certificados ainda não está configurado.' : 'A cadeia de confiança ICP-Brasil ainda não está configurada.'
  if (!path || !isAbsolute(path)) throw failure(code, message)
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const stat = await handle.stat()
    const expectedUid = typeof process.geteuid === 'function' ? process.geteuid() : 0
    if (!stat.isFile() || (stat.uid !== 0 && stat.uid !== expectedUid) || (stat.mode & 0o022) !== 0 || (kind === 'key' && (stat.mode & 0o777) !== 0o600) || stat.size < 1 || stat.size > (kind === 'key' ? 128 : MAX_OPENSSL_OUTPUT)) throw failure(code, message)
    return await handle.readFile()
  } catch { throw failure(code, message) }
  finally { await handle?.close() }
}

export async function inspectCertificate(pfx: Buffer, password: string, options: { caFile?: string; now?: Date } = {}): Promise<FiscalCertificateMetadata> {
  const bundle = await extractBundle(pfx, password)
  let directory: string | undefined
  let ca: Buffer | undefined
  try {
    const now = options.now ?? new Date()
    const from = new Date(bundle.leaf.validFrom)
    const until = new Date(bundle.leaf.validTo)
    if (!Number.isFinite(now.getTime()) || !Number.isFinite(from.getTime()) || !Number.isFinite(until.getTime())) throw failure('FISCAL_CERTIFICATE_INVALID', 'Não foi possível verificar a validade do certificado.')
    if (now < from) throw failure('FISCAL_CERTIFICATE_NOT_YET_VALID', 'O certificado ainda não iniciou seu período de validade.')
    if (now >= until) throw failure('FISCAL_CERTIFICATE_EXPIRED', 'O certificado está vencido. Envie um certificado válido.')
    const identity = certificateIdentity(bundle.leaf)
    ca = await readProtectedFile(options.caFile ?? process.env.ALETIS_FISCAL_CA_FILE ?? DEFAULT_CA_FILE, 'ca')
    directory = await mkdtemp(join(tmpdir(), 'aletis-fiscal-chain-'))
    await chmod(directory, 0o700)
    const leafPath = join(directory, 'leaf.pem')
    const chainPath = join(directory, 'chain.pem')
    const caPath = join(directory, 'trusted.pem')
    await writeFile(leafPath, bundle.leafPem, { mode: 0o600 })
    await writeFile(caPath, ca, { mode: 0o600 })
    const others = bundle.certificates.filter(({ x509 }) => x509.fingerprint256 !== bundle.leaf.fingerprint256)
    const args = ['verify', '-no-CAfile', '-no-CApath', '-no-CAstore', '-CAfile', caPath, '-purpose', 'sslclient', '-auth_level', '2', '-attime', String(Math.floor(now.getTime() / 1000))]
    if (others.length) {
      const chain = Buffer.concat(others.flatMap(({ pem }) => [pem, Buffer.from('\n')]))
      try { await writeFile(chainPath, chain, { mode: 0o600 }) }
      finally { chain.fill(0) }
      args.push('-untrusted', chainPath)
    }
    args.push(leafPath)
    try { (await runOpenSsl(args)).fill(0) }
    catch (error) {
      if (error instanceof FiscalCertificateError && error.code === 'FISCAL_CERTIFICATE_BUSY') throw error
      throw failure('FISCAL_CERTIFICATE_UNTRUSTED', 'O certificado não possui uma cadeia válida para a autoridade ICP-Brasil configurada ou não permite autenticação de cliente.')
    }
    return {
      ...identity,
      subject: bundle.leaf.subject,
      issuer: bundle.leaf.issuer,
      serialNumber: bundle.leaf.serialNumber,
      fingerprint256: bundle.leaf.fingerprint256.replaceAll(':', '').toLowerCase(),
      validFrom: from.toISOString(),
      validTo: until.toISOString(),
      keyType: 'rsa',
      keyBits: bundle.key.asymmetricKeyDetails!.modulusLength!,
      chainVerified: true,
      revocationChecked: false,
    }
  } finally {
    disposeBundle(bundle)
    ca?.fill(0)
    if (directory) await rm(directory, { recursive: true, force: true })
  }
}

async function vaultKey(options: { keyFile?: string }): Promise<Buffer> {
  const data = await readProtectedFile(options.keyFile ?? process.env.ALETIS_FISCAL_VAULT_KEY_FILE ?? DEFAULT_KEY_FILE, 'key')
  try {
    if (data.length === 32) return Buffer.from(data)
    if (/^[a-fA-F0-9]{64}\r?\n?$/.test(data.toString('ascii'))) return Buffer.from(data.toString('ascii').trim(), 'hex')
    throw failure('FISCAL_VAULT_NOT_CONFIGURED', 'A chave de criptografia do cofre é inválida.')
  } finally { data.fill(0) }
}

/** Confere a configuração local; não afirma que um titular tem poderes ou conexão fiscal ativa. */
export async function isFiscalVaultConfigured(options: { caFile?: string; keyFile?: string } = {}): Promise<boolean> {
  let key: Buffer | undefined
  let ca: Buffer | undefined
  const certificates: Buffer[] = []
  try {
    key = await vaultKey(options)
    ca = await readProtectedFile(options.caFile ?? process.env.ALETIS_FISCAL_CA_FILE ?? DEFAULT_CA_FILE, 'ca')
    certificates.push(...pemBlocks(ca, 'CERTIFICATE'))
    const now = Date.now()
    return certificates.some((pem) => {
      const certificate = new X509Certificate(pem)
      return certificate.ca && certificate.checkIssued(certificate) && certificate.verify(certificate.publicKey) && now >= Date.parse(certificate.validFrom) && now < Date.parse(certificate.validTo)
    })
  } catch { return false }
  finally {
    key?.fill(0)
    ca?.fill(0)
    for (const certificate of certificates) certificate.fill(0)
  }
}

function contextAad(context: FiscalCertificateContext, keyId: string): Buffer {
  if (![context.clienteId, context.credentialId].every((value) => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,180}$/.test(value))) throw failure('FISCAL_VAULT_CONTEXT_INVALID', 'A vinculação do certificado ao cliente não é válida.')
  return Buffer.from(JSON.stringify(['aletis-fiscal-vault', 1, 'aes-256-gcm', keyId, context.clienteId, context.credentialId]))
}

/** Chamar inspectCertificate antes da gravação. Esta função cifra e normaliza, sem autorizar pesquisas. */
export async function sealCertificate(input: FiscalCertificateContext & { pfx: Buffer; password: string }, options: { keyFile?: string } = {}): Promise<FiscalCertificateEnvelope> {
  assertInput(input.pfx, input.password)
  const key = await vaultKey(options)
  let normalized: Buffer | undefined
  let payload: Buffer | undefined
  let bundle: CertificateBundle | undefined
  const newPasswordBytes = randomBytes(32)
  try {
    const keyId = createHash('sha256').update(key).digest('hex')
    const aad = contextAad(input, keyId)
    bundle = await extractBundle(input.pfx, input.password)
    const combined = Buffer.concat([bundle.keyPem, Buffer.from('\n'), ...bundle.certificates.flatMap(({ pem }) => [pem, Buffer.from('\n')])])
    // A senha original não é persistida. A exportação moderna funciona no TLS nativo do Node.
    const newPassword = newPasswordBytes.toString('hex')
    try {
      normalized = await runOpenSsl(['pkcs12', '-export', '-passout', 'fd:3', '-keypbe', 'AES-256-CBC', '-certpbe', 'AES-256-CBC', '-macalg', 'sha256', '-iter', '100000'], combined, newPassword)
      if (normalized.length > MAX_FISCAL_CERTIFICATE_BYTES) throw failure('FISCAL_CERTIFICATE_INVALID', 'O certificado normalizado ultrapassa o limite de 256 KB.')
    } finally { combined.fill(0) }
    const passwordBuffer = Buffer.from(newPassword, 'ascii')
    try {
      const header = Buffer.alloc(7)
      header[0] = 1
      header.writeUInt16BE(passwordBuffer.length, 1)
      header.writeUInt32BE(normalized.length, 3)
      payload = Buffer.concat([header, passwordBuffer, normalized])
    } finally { passwordBuffer.fill(0) }
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(aad)
    const encrypted = Buffer.concat([cipher.update(payload), cipher.final()])
    return { version: 1, algorithm: 'aes-256-gcm', keyId, iv: iv.toString('base64'), ciphertext: encrypted.toString('base64'), tag: cipher.getAuthTag().toString('base64') }
  } finally {
    key.fill(0)
    normalized?.fill(0)
    payload?.fill(0)
    newPasswordBytes.fill(0)
    if (bundle) disposeBundle(bundle)
  }
}

function envelopeBuffer(value: unknown, min: number, max: number): Buffer {
  if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw failure('FISCAL_VAULT_AUTHENTICATION_FAILED', 'O certificado protegido não pôde ser autenticado.')
  const decoded = Buffer.from(value, 'base64')
  if (decoded.length < min || decoded.length > max || decoded.toString('base64') !== value) throw failure('FISCAL_VAULT_AUTHENTICATION_FAILED', 'O certificado protegido não pôde ser autenticado.')
  return decoded
}

export async function openCertificate(envelope: FiscalCertificateEnvelope, context: FiscalCertificateContext, options: { keyFile?: string } = {}): Promise<OpenedFiscalCertificate> {
  const key = await vaultKey(options)
  let payload: Buffer | undefined
  try {
    const keyId = createHash('sha256').update(key).digest('hex')
    if (!envelope || envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm' || envelope.keyId !== keyId) throw failure('FISCAL_VAULT_AUTHENTICATION_FAILED', 'O certificado protegido não pôde ser autenticado.')
    const aad = contextAad(context, keyId)
    const iv = envelopeBuffer(envelope.iv, 12, 12)
    const tag = envelopeBuffer(envelope.tag, 16, 16)
    const encrypted = envelopeBuffer(envelope.ciphertext, 80, MAX_OPENSSL_OUTPUT)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAAD(aad)
    decipher.setAuthTag(tag)
    const first = decipher.update(encrypted)
    try { payload = Buffer.concat([first, decipher.final()]) }
    finally { first.fill(0) }
    const passwordLength = payload.readUInt16BE(1)
    const pfxLength = payload.readUInt32BE(3)
    if (payload[0] !== 1 || passwordLength !== 64 || pfxLength < 16 || pfxLength > MAX_OPENSSL_OUTPUT || payload.length !== 7 + passwordLength + pfxLength) throw failure('FISCAL_VAULT_AUTHENTICATION_FAILED', 'O certificado protegido não pôde ser autenticado.')
    const opened: OpenedFiscalCertificate = {
      pfx: Buffer.from(payload.subarray(7 + passwordLength)),
      passphrase: payload.subarray(7, 7 + passwordLength).toString('ascii'),
      dispose() { opened.pfx.fill(0); opened.passphrase = '' },
    }
    return opened
  } catch (error) {
    if (error instanceof FiscalCertificateError && error.code === 'FISCAL_VAULT_CONTEXT_INVALID') throw error
    throw failure('FISCAL_VAULT_AUTHENTICATION_FAILED', 'O certificado protegido não pôde ser autenticado. Reenvie-o pela área segura do portal.')
  } finally {
    key.fill(0)
    payload?.fill(0)
  }
}
