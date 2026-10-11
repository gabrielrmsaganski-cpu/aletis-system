import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validatePortalFile } from '../../src/services/portal/PortalUploadValidation.js'

describe('o envio de documentos não admite credenciais digitais privadas', () => {
  let privateKey: string
  let certificate: string
  let pfx: Buffer
  let directory: string

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'portal-credential-test-'))
    privateKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1',
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    }).privateKey
    const privateKeyPath = join(directory, 'key.pem')
    writeFileSync(privateKeyPath, privateKey, { mode: 0o600 })
    certificate = execFileSync('openssl', ['req', '-new', '-x509', '-key', privateKeyPath, '-subj', '/CN=Portal Test Only', '-days', '1'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    const certificatePath = join(directory, 'certificate.pem')
    writeFileSync(certificatePath, certificate, { mode: 0o600 })
    pfx = execFileSync('openssl', ['pkcs12', '-export', '-inkey', privateKeyPath, '-in', certificatePath, '-passout', 'pass:fixture-only'], { stdio: ['pipe', 'pipe', 'pipe'] })
  })

  afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }) })

  it('rejeita uma chave PEM real renomeada como TXT antes de ingestão', async () => {
    await expect(validatePortalFile(Buffer.from(privateKey), 'dados.txt')).rejects.toMatchObject({ code: 'PORTAL_PRIVATE_CREDENTIAL_BLOCKED', statusCode: 415 })
  })

  it('examina o arquivo todo, incluindo segredo após os primeiros 64 KiB', async () => {
    await expect(validatePortalFile(Buffer.from('Documento\n'.repeat(10_000) + privateKey), 'dados.csv')).rejects.toMatchObject({ code: 'PORTAL_PRIVATE_CREDENTIAL_BLOCKED' })
  })

  it('rejeita PKCS#12 real renomeado como PDF e anexado a um cabeçalho PDF', async () => {
    for (const content of [pfx, Buffer.concat([Buffer.from('%PDF-1.7\n'), pfx])]) {
      await expect(validatePortalFile(content, 'procuracao.pdf')).rejects.toMatchObject({ code: 'PORTAL_PRIVATE_CREDENTIAL_BLOCKED' })
    }
  })

  it('rejeita PKCS#12 convertido em base64 e chave PEM UTF-16', async () => {
    for (const content of [Buffer.from(pfx.toString('base64')), Buffer.from('\uFEFF' + privateKey, 'utf16le')]) {
      await expect(validatePortalFile(content, 'dados.txt')).rejects.toMatchObject({ code: 'PORTAL_PRIVATE_CREDENTIAL_BLOCKED' })
    }
  })

  it('rejeita exportação XML de chave privada RSA', async () => {
    const xml = '<RSAKeyValue><Modulus>AA==</Modulus><Exponent>AQAB</Exponent><P>AA==</P><D>AA==</D></RSAKeyValue>'
    await expect(validatePortalFile(Buffer.from(xml), 'chave.xml')).rejects.toMatchObject({ code: 'PORTAL_PRIVATE_CREDENTIAL_BLOCKED' })
  })

  it('permite XML fiscal assinado contendo certificado público e chave pública', async () => {
    const publicCertificate = certificate.replace(/-----[^-]+-----|\s/g, '')
    const xml = `<nfeProc><NFe><infNFe Id="NFe-fixture"/><Signature><KeyInfo><X509Data><X509Certificate>${publicCertificate}</X509Certificate></X509Data><KeyValue><RSAKeyValue><Modulus>AA==</Modulus><Exponent>AQAB</Exponent></RSAKeyValue></KeyValue></KeyInfo></Signature></NFe><P>Campo fora da chave pública</P></nfeProc>`
    await expect(validatePortalFile(Buffer.from(xml), 'nfe.xml')).resolves.toEqual({ nome: 'nfe.xml', mime: 'application/xml' })
    await expect(validatePortalFile(Buffer.from(certificate), 'certificado-publico.txt')).resolves.toMatchObject({ mime: 'text/plain' })
  })

  it('permite comprovante PDF e texto explicando certificados sem conter chave', async () => {
    await expect(validatePortalFile(Buffer.from('%PDF-1.7\nComprovante de procuração eletrônica\n%%EOF'), 'procuracao.pdf')).resolves.toMatchObject({ mime: 'application/pdf' })
    await expect(validatePortalFile(Buffer.from('Meu certificado é A1; preciso de orientação para emitir uma procuração.'), 'pedido.txt')).resolves.toMatchObject({ mime: 'text/plain' })
  })
})
