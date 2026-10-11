import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPrivateKey, randomBytes, X509Certificate } from 'node:crypto'
import { createSecureContext } from 'node:tls'
import { createServer as createHttpsServer, request as httpsRequest, type RequestOptions } from 'node:https'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import type { Writable } from 'node:stream'
import { FiscalCertificateError, inspectCertificate, isFiscalVaultConfigured, openCertificate, prepareFiscalTlsIdentity, sealCertificate } from '../../src/services/fiscal-connection/FiscalCertificateVault.js'

let directory: string
let caFile: string
let rootKey: string
let leafKey: string
let keyFile: string
let validPfx: Buffer
let legacyPfx: Buffer
let validPem: Buffer
const password = 'senha-ficticia-\u00e7-2026'
const context = { clienteId: 'cliente-ficticio-a', credentialId: 'cert-ficticio-a' }

async function openssl(args: string[], pass?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('openssl', args, { stdio: ['ignore', 'pipe', 'ignore', 'pipe'] })
    const chunks: Buffer[] = []
    child.stdout.on('data', (data: Buffer) => chunks.push(data))
    child.on('error', () => reject(new Error('OpenSSL de teste indisponível')))
    child.on('close', (code) => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('Falha na preparação do certificado fictício')))
    const stream = child.stdio[3] as Writable
    stream.on('error', () => {})
    stream.end(pass === undefined ? undefined : `${pass}\n`)
  })
}

async function fixture(name: string, san: string | null, options: { legacy?: boolean; key?: string; eku?: string; signer?: { key: string; cert: string } } = {}): Promise<{ pfx: Buffer; pem: Buffer }> {
  const key = options.key ?? leafKey
  const csr = join(directory, `${name}.csr`)
  const pem = join(directory, `${name}.pem`)
  const config = join(directory, `${name}.cnf`)
  await writeFile(config, [
    'basicConstraints=critical,CA:FALSE',
    'keyUsage=critical,digitalSignature,keyEncipherment',
    `extendedKeyUsage=${options.eku ?? 'clientAuth'}`,
    'subjectKeyIdentifier=hash',
    'authorityKeyIdentifier=keyid,issuer',
    ...(san ? [`subjectAltName=${san}`] : []),
  ].join('\n'), { mode: 0o600 })
  await openssl(['req', '-new', '-key', key, '-out', csr, '-subj', '/C=BR/O=Teste ficticio/CN=Titular de teste:00000000000000'])
  const signer = options.signer ?? { key: rootKey, cert: caFile }
  await openssl(['x509', '-req', '-in', csr, '-CA', signer.cert, '-CAkey', signer.key, '-set_serial', String(Math.floor(Math.random() * 1000000000) + 1), '-days', '2', '-extfile', config, '-out', pem])
  const pfx = await openssl(['pkcs12', ...(options.legacy ? ['-legacy'] : []), '-export', '-inkey', key, '-in', pem, '-certfile', signer.cert, '-passout', 'fd:3'], password)
  return { pfx, pem: await readFile(pem) }
}

function der(tag: number, ...parts: Buffer[]): Buffer {
  const content = Buffer.concat(parts)
  let length: Buffer
  if (content.length < 128) length = Buffer.from([content.length])
  else {
    const encoded: number[] = []
    let remaining = content.length
    while (remaining) { encoded.unshift(remaining & 255); remaining >>>= 8 }
    length = Buffer.from([128 + encoded.length, ...encoded])
  }
  return Buffer.concat([Buffer.from([tag]), length, content])
}

function oid(hex: string): Buffer { return der(6, Buffer.from(hex, 'hex')) }

/** PFX sem MAC para exercitar combinações inconsistentes que o exportador normal recusaria. */
function inconsistentPfx(keys: Buffer[], certs: Buffer[]): Buffer {
  const bags = [
    ...keys.map((key) => der(0x30, oid('2a864886f70d010c0a0101'), der(0xa0, createPrivateKey(key).export({ format: 'der', type: 'pkcs8' }) as Buffer))),
    ...certs.map((cert) => der(0x30, oid('2a864886f70d010c0a0103'), der(0xa0, der(0x30, oid('2a864886f70d01091601'), der(0xa0, der(4, new X509Certificate(cert).raw)))))),
  ]
  const dataContent = (content: Buffer) => der(0x30, oid('2a864886f70d010701'), der(0xa0, der(4, content)))
  return der(0x30, der(2, Buffer.from([3])), dataContent(der(0x30, dataContent(der(0x30, ...bags)))))
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aletis-fiscal-vault-test-'))
  await chmod(directory, 0o700)
  caFile = join(directory, 'root.pem')
  rootKey = join(directory, 'root.key')
  leafKey = join(directory, 'leaf.key')
  keyFile = join(directory, 'vault.key')
  await writeFile(keyFile, randomBytes(32), { mode: 0o600 })
  await openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', rootKey, '-out', caFile, '-days', '5', '-subj', '/C=BR/O=CA de teste ficticia/CN=Raiz de teste', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign'])
  await chmod(rootKey, 0o600)
  await openssl(['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', leafKey])
  await chmod(leafKey, 0o600)
  const normal = await fixture('valid', 'otherName:2.16.76.1.3.3;UTF8:11222333000181')
  validPfx = normal.pfx
  validPem = normal.pem
  legacyPfx = (await fixture('legacy', 'otherName:2.16.76.1.3.3;UTF8:11222333000181', { legacy: true })).pfx
}, 30000)

afterAll(async () => {
  validPfx?.fill(0)
  legacyPfx?.fill(0)
  validPem?.fill(0)
  if (directory) await rm(directory, { recursive: true, force: true })
})

describe('validação do certificado A1 sem confiar na identidade textual do arquivo', () => {
  it('confere chave, cadeia configurada, CNPJ do otherName e validade', async () => {
    const result = await inspectCertificate(validPfx, password, { caFile })
    expect(result).toMatchObject({ documentType: 'CNPJ', document: '11222333000181', maskedDocument: '11.***.***/****-81', keyType: 'rsa', keyBits: 2048, chainVerified: true, revocationChecked: false })
    expect(result.fingerprint256).toMatch(/^[a-f0-9]{64}$/)
    expect(result.validFrom < result.validTo).toBe(true)
    expect(JSON.stringify(result)).not.toContain(password)
    expect(JSON.stringify(result)).not.toContain('PRIVATE KEY')
  })

  it('lê o CPF na posição definida pelo OID, sem usar CN nem CPF do responsável', async () => {
    const item = await fixture('cpf', 'otherName:2.16.76.1.3.1;UTF8:010119905299822472500000000000')
    try {
      expect(await inspectCertificate(item.pfx, password, { caFile })).toMatchObject({ documentType: 'CPF', document: '52998224725', maskedDocument: '***.***.247-25' })
    } finally { item.pfx.fill(0) }
  })

  it('aceita CNPJ alfanumérico com dígitos verificadores válidos', async () => {
    const item = await fixture('alphanumeric', 'otherName:2.16.76.1.3.3;UTF8:12ABC34501DE35')
    try { expect(await inspectCertificate(item.pfx, password, { caFile })).toMatchObject({ document: '12ABC34501DE35' }) }
    finally { item.pfx.fill(0) }
  })

  it('permite campos complementares UTF-8 após o CPF, sem alterar sua identificação', async () => {
    const item = await fixture('cpf-complemento', '@alt_names\n[alt_names]\notherName.1=2.16.76.1.3.1;FORMAT:UTF8,UTF8:010119905299822472500000000000ÓRGÃO')
    try { expect(await inspectCertificate(item.pfx, password, { caFile })).toMatchObject({ documentType: 'CPF', document: '52998224725' }) }
    finally { item.pfx.fill(0) }
  })

  it('recusa senha incorreta sem propagar conteúdo ou erro bruto do OpenSSL', async () => {
    const error = await inspectCertificate(validPfx, 'senha-errada-confidencial', { caFile }).catch((value) => value)
    expect(error).toBeInstanceOf(FiscalCertificateError)
    expect(error.code).toBe('FISCAL_CERTIFICATE_INVALID')
    expect(String(error)).not.toMatch(/senha-errada-confidencial|mac verify|openssl|pkcs12/i)
  })

  it.each([Buffer.alloc(0), Buffer.from('arquivo totalmente invalido'), Buffer.alloc(256 * 1024 + 1)])('recusa PFX inválido ou acima do limite', async (input) => {
    await expect(inspectCertificate(input, password, { caFile })).rejects.toMatchObject({ code: 'FISCAL_CERTIFICATE_INVALID' })
  })

  it('recusa bytes anexados depois do contêiner PFX', async () => {
    await expect(inspectCertificate(Buffer.concat([validPfx, Buffer.from('anexo')]), password, { caFile })).rejects.toMatchObject({ code: 'FISCAL_CERTIFICATE_INVALID', statusCode: 400 })
  })

  it('não trunca silenciosamente senha contendo quebra de linha', async () => {
    await expect(inspectCertificate(validPfx, 'antes\ndepois', { caFile })).rejects.toMatchObject({ code: 'FISCAL_CERTIFICATE_PASSWORD_INVALID' })
  })

  it('recusa certificado vencido ou ainda não válido', async () => {
    await expect(inspectCertificate(validPfx, password, { caFile, now: new Date('2050-01-01') })).rejects.toMatchObject({ code: 'FISCAL_CERTIFICATE_EXPIRED' })
    await expect(inspectCertificate(validPfx, password, { caFile, now: new Date('2020-01-01') })).rejects.toMatchObject({ code: 'FISCAL_CERTIFICATE_NOT_YET_VALID' })
  })

  it('falha fechado quando não há cadeia de confiança configurada', async () => {
    await expect(inspectCertificate(validPfx, password, { caFile: join(directory, 'inexistente.pem') })).rejects.toMatchObject({ code: 'FISCAL_CERTIFICATE_TRUST_NOT_CONFIGURED', statusCode: 503 })
  })

  it('não toma a raiz enviada dentro do PFX como raiz confiável', async () => {
    const alternative = join(directory, 'another-root.pem')
    await openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(directory, 'another-root.key'), '-out', alternative, '-days', '2', '-subj', '/CN=Raiz nao relacionada', '-addext', 'basicConstraints=critical,CA:TRUE'])
    await expect(inspectCertificate(validPfx, password, { caFile: alternative })).rejects.toMatchObject({ code: 'FISCAL_CERTIFICATE_UNTRUSTED' })
  })

  it('recusa certificado sem OID ICP-Brasil apesar do nome do titular', async () => {
    const item = await fixture('missing', 'DNS:empresa.example.test')
    try { await expect(inspectCertificate(item.pfx, password, { caFile })).rejects.toMatchObject({ code: 'FISCAL_CERTIFICATE_IDENTITY_MISSING' }) }
    finally { item.pfx.fill(0) }
  })

  it('ignora OID do responsável do e-CNPJ ao identificar o titular', async () => {
    const item = await fixture('responsavel', 'otherName:2.16.76.1.3.4;UTF8:010119905299822472500000000000')
    try { await expect(inspectCertificate(item.pfx, password, { caFile })).rejects.toMatchObject({ code: 'FISCAL_CERTIFICATE_IDENTITY_MISSING' }) }
    finally { item.pfx.fill(0) }
  })

  it('recusa dois identificadores de titular mesmo repetidos', async () => {
    const item = await fixture('ambiguous', 'otherName:2.16.76.1.3.3;UTF8:11222333000181,otherName:2.16.76.1.3.3;UTF8:11222333000181')
    try { await expect(inspectCertificate(item.pfx, password, { caFile })).rejects.toMatchObject({ code: 'FISCAL_CERTIFICATE_IDENTITY_AMBIGUOUS' }) }
    finally { item.pfx.fill(0) }
  })

  it('recusa identificador com dígitos verificadores inválidos', async () => {
    const item = await fixture('invalid-document', 'otherName:2.16.76.1.3.3;UTF8:11222333000182')
    try { await expect(inspectCertificate(item.pfx, password, { caFile })).rejects.toMatchObject({ code: 'FISCAL_CERTIFICATE_IDENTITY_INVALID' }) }
    finally { item.pfx.fill(0) }
  })

  it('recusa certificado destinado exclusivamente à autenticação de servidor', async () => {
    const item = await fixture('server-auth', 'otherName:2.16.76.1.3.3;UTF8:11222333000181', { eku: 'serverAuth' })
    try { await expect(inspectCertificate(item.pfx, password, { caFile })).rejects.toMatchObject({ code: 'FISCAL_CERTIFICATE_UNTRUSTED' }) }
    finally { item.pfx.fill(0) }
  })

  it('recusa chave que não corresponde ao certificado', async () => {
    const otherKey = await readFile(rootKey)
    const pfx = inconsistentPfx([otherKey], [validPem])
    try { await expect(inspectCertificate(pfx, '', { caFile })).rejects.toMatchObject({ code: 'FISCAL_CERTIFICATE_KEY_MISMATCH' }) }
    finally { otherKey.fill(0); pfx.fill(0) }
  })

  it('recusa múltiplas chaves privadas no mesmo PFX', async () => {
    const first = await readFile(leafKey)
    const second = await readFile(rootKey)
    const pfx = inconsistentPfx([first, second], [validPem])
    try { await expect(inspectCertificate(pfx, '', { caFile })).rejects.toMatchObject({ code: 'FISCAL_CERTIFICATE_AMBIGUOUS' }) }
    finally { first.fill(0); second.fill(0); pfx.fill(0) }
  })

  it('recusa chave RSA abaixo de 2048 bits', async () => {
    const weakKey = join(directory, 'weak.key')
    await openssl(['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:1024', '-out', weakKey])
    const item = await fixture('weak', 'otherName:2.16.76.1.3.3;UTF8:11222333000181', { key: weakKey })
    try { await expect(inspectCertificate(item.pfx, password, { caFile })).rejects.toMatchObject({ code: 'FISCAL_CERTIFICATE_KEY_UNSUPPORTED' }) }
    finally { item.pfx.fill(0) }
  })
})

describe('cofre AES-GCM vinculado ao cliente e à credencial', () => {
  it('impede CA extra do PFX de ampliar a confiança TLS e mantém autenticação mútua válida', async () => {
    const extraRoot = join(directory, 'tls-extra-root.pem')
    const extraRootKey = join(directory, 'tls-extra-root.key')
    await openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', extraRootKey, '-out', extraRoot, '-days', '2', '-subj', '/CN=CA externa de teste TLS', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign'])
    const serverCertificate = await fixture('tls-server', 'IP:127.0.0.1', { eku: 'serverAuth', signer: { key: extraRootKey, cert: extraRoot } })
    const extraCaPem = await readFile(extraRoot)
    const extraChain = join(directory, 'tls-extra-chain.pem')
    await writeFile(extraChain, Buffer.concat([await readFile(caFile), extraCaPem]), { mode: 0o600 })
    const pfx = await openssl(['pkcs12', '-export', '-inkey', leafKey, '-in', join(directory, 'valid.pem'), '-certfile', extraChain, '-passout', 'fd:3'], password)
    expect(await inspectCertificate(pfx, password, { caFile })).toMatchObject({ chainVerified: true })
    const identity = await prepareFiscalTlsIdentity(pfx, password)
    expect(identity.cert.toString('ascii')).not.toContain(extraCaPem.toString('ascii').trim())
    const server = createHttpsServer({ key: await readFile(leafKey), cert: serverCertificate.pem, requestCert: true, rejectUnauthorized: true, ca: await readFile(caFile) }, (_request, response) => response.end('autenticação mútua local'))
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = (server.address() as AddressInfo).port
    const query = (options: RequestOptions): Promise<{ connected: boolean; error?: string }> => new Promise((resolve) => {
      const request = httpsRequest({ hostname: '127.0.0.1', port, agent: false, ...options }, (response) => { response.resume(); response.on('end', () => resolve({ connected: response.statusCode === 200 })) })
      request.on('error', (error: NodeJS.ErrnoException) => resolve({ connected: false, error: error.code }))
      request.setTimeout(3000, () => request.destroy(new Error('Tempo limite do teste TLS local')))
      request.end()
    })
    try {
      // Demonstra a regressão do caminho PFX e o isolamento do caminho cert/key.
      expect(await query({ pfx, passphrase: password })).toMatchObject({ connected: true })
      expect(await query({ cert: identity.cert, key: identity.key })).toMatchObject({ connected: false, error: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' })
      expect(await query({ cert: identity.cert, key: identity.key, ca: extraCaPem })).toMatchObject({ connected: true })
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      identity.dispose()
      pfx.fill(0)
      serverCertificate.pfx.fill(0)
    }
    expect(identity.key.every((value) => value === 0)).toBe(true)
    expect(identity.cert.every((value) => value === 0)).toBe(true)
  })

  it('sinaliza configuração válida somente com chave protegida e raiz válida', async () => {
    expect(await isFiscalVaultConfigured({ caFile, keyFile })).toBe(true)
    expect(await isFiscalVaultConfigured({ caFile, keyFile: join(directory, 'not-found.key') })).toBe(false)
    const invalidKey = join(directory, 'invalid-vault.key')
    await writeFile(invalidKey, 'chave curta', { mode: 0o600 })
    expect(await isFiscalVaultConfigured({ caFile, keyFile: invalidKey })).toBe(false)
    await writeFile(invalidKey, randomBytes(32), { mode: 0o600 })
    await chmod(invalidKey, 0o644)
    expect(await isFiscalVaultConfigured({ caFile, keyFile: invalidKey })).toBe(false)
    const invalidCa = join(directory, 'not-root.pem')
    await writeFile(invalidCa, validPem, { mode: 0o600 })
    expect(await isFiscalVaultConfigured({ caFile: invalidCa, keyFile })).toBe(false)
    await writeFile(invalidCa, 'não é um certificado', { mode: 0o600 })
    expect(await isFiscalVaultConfigured({ caFile: invalidCa, keyFile })).toBe(false)
  })

  it('normaliza PFX legado, cifra senha nova e recupera material compatível com TLS nativo', async () => {
    expect(await inspectCertificate(legacyPfx, password, { caFile })).toMatchObject({ document: '11222333000181' })
    const envelope = await sealCertificate({ ...context, pfx: legacyPfx, password }, { keyFile })
    expect(envelope).toMatchObject({ version: 1, algorithm: 'aes-256-gcm' })
    expect(JSON.stringify(envelope)).not.toContain(password)
    expect(JSON.stringify(envelope)).not.toContain(legacyPfx.toString('base64'))
    expect(JSON.stringify(envelope)).not.toContain('PRIVATE KEY')
    const opened = await openCertificate(envelope, context, { keyFile })
    try {
      expect(opened.passphrase).not.toBe(password)
      expect(() => createSecureContext({ pfx: opened.pfx, passphrase: opened.passphrase })).not.toThrow()
      expect(await inspectCertificate(opened.pfx, opened.passphrase, { caFile })).toMatchObject({ document: '11222333000181' })
    } finally { opened.dispose() }
    expect(opened.pfx.every((value) => value === 0)).toBe(true)
    expect(opened.passphrase).toBe('')
  })

  it('não abre a credencial de outro cliente ou outro registro', async () => {
    const envelope = await sealCertificate({ ...context, pfx: validPfx, password }, { keyFile })
    await expect(openCertificate(envelope, { ...context, clienteId: 'cliente-ficticio-b' }, { keyFile })).rejects.toMatchObject({ code: 'FISCAL_VAULT_AUTHENTICATION_FAILED' })
    await expect(openCertificate(envelope, { ...context, credentialId: 'cert-ficticio-b' }, { keyFile })).rejects.toMatchObject({ code: 'FISCAL_VAULT_AUTHENTICATION_FAILED' })
  })

  it('detecta alteração do ciphertext, tag, algoritmo ou chave', async () => {
    const envelope = await sealCertificate({ ...context, pfx: validPfx, password }, { keyFile })
    const cipher = Buffer.from(envelope.ciphertext, 'base64')
    cipher[20] ^= 1
    await expect(openCertificate({ ...envelope, ciphertext: cipher.toString('base64') }, context, { keyFile })).rejects.toMatchObject({ code: 'FISCAL_VAULT_AUTHENTICATION_FAILED' })
    await expect(openCertificate({ ...envelope, tag: Buffer.alloc(16).toString('base64') }, context, { keyFile })).rejects.toMatchObject({ code: 'FISCAL_VAULT_AUTHENTICATION_FAILED' })
    await expect(openCertificate({ ...envelope, algorithm: 'aes-128-cbc' as 'aes-256-gcm' }, context, { keyFile })).rejects.toMatchObject({ code: 'FISCAL_VAULT_AUTHENTICATION_FAILED' })
    const wrongKey = join(directory, 'other-vault.key')
    await writeFile(wrongKey, randomBytes(32), { mode: 0o600 })
    await expect(openCertificate(envelope, context, { keyFile: wrongKey })).rejects.toMatchObject({ code: 'FISCAL_VAULT_AUTHENTICATION_FAILED' })
  })

  it('recusa chave ausente, permissiva ou symlink', async () => {
    await expect(sealCertificate({ ...context, pfx: validPfx, password }, { keyFile: join(directory, 'missing.key') })).rejects.toMatchObject({ code: 'FISCAL_VAULT_NOT_CONFIGURED' })
    const permissive = join(directory, 'permissive.key')
    await writeFile(permissive, randomBytes(32), { mode: 0o644 })
    await expect(sealCertificate({ ...context, pfx: validPfx, password }, { keyFile: permissive })).rejects.toMatchObject({ code: 'FISCAL_VAULT_NOT_CONFIGURED' })
    const symbolic = join(directory, 'symbolic.key')
    await symlink(keyFile, symbolic)
    await expect(sealCertificate({ ...context, pfx: validPfx, password }, { keyFile: symbolic })).rejects.toMatchObject({ code: 'FISCAL_VAULT_NOT_CONFIGURED' })
  })

  it('aceita chave hexadecimal protegida e produz IV diferente a cada gravação', async () => {
    const hexadecimal = join(directory, 'hex.key')
    await writeFile(hexadecimal, `${(await readFile(keyFile)).toString('hex')}\n`, { mode: 0o600 })
    const first = await sealCertificate({ ...context, pfx: validPfx, password }, { keyFile })
    const second = await sealCertificate({ ...context, pfx: validPfx, password }, { keyFile: hexadecimal })
    expect(first.keyId).toBe(second.keyId)
    expect(first.iv).not.toBe(second.iv)
    const opened = await openCertificate(second, context, { keyFile })
    opened.dispose()
  })
})
