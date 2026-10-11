import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { gzipSync } from 'node:zlib'
import { request as httpsRequest } from 'node:https'
import {
  NFE_DISTRIBUTION_ENDPOINT, NFE_DISTRIBUTION_ACTION, NFE_DISTRIBUTION_LIMITS,
  NFE_UF_CODES, NfeDistributionError, queryNfeDistribution,
  type NfeDistributionInput, type NfeDistributionTransport, type NfeDistributionTransportResponse,
} from '../../src/services/fiscal-connection/NfeDistributionConnector.js'

vi.mock('node:https', () => ({ request: vi.fn() }))
const tlsProvider = vi.hoisted(() => ({ prepare: vi.fn() }))
vi.mock('../../src/services/fiscal-connection/FiscalCertificateVault.js', () => ({ prepareFiscalTlsIdentity: tlsProvider.prepare }))

const nfe = 'http://www.portalfiscal.inf.br/nfe'
const wsdl = `${nfe}/wsdl/NFeDistribuicaoDFe`
const soap = 'http://www.w3.org/2003/05/soap-envelope'
const key = '352609' + '12ABC34501DE35' + '55' + '001' + '000000001' + '1' + '12345678' + '0'
const input: NfeDistributionInput = {
  pfx: Buffer.alloc(64, 1), passphrase: 'senha-sintetica-nao-real', documento: '12ABC34501DE35', uf: 'SP', ultNSU: '0',
}
const nsu = (value: number) => String(value).padStart(15, '0')
const summary = (overrides: { value?: string; version?: string; namespace?: string; extra?: string } = {}) =>
  `<resNFe xmlns="${overrides.namespace ?? nfe}" versao="${overrides.version ?? '1.01'}"><chNFe>${key}</chNFe><CNPJ>12ABC34501DE35</CNPJ><xNome>Fazenda São José &amp; Filhos</xNome><dhEmi>2026-09-13T10:00:00-03:00</dhEmi><vNF>${overrides.value ?? '1234567890123.45'}</vNF><cSitNFe>1</cSitNFe>${overrides.extra ?? ''}</resNFe>`
const zip = (xml: string, cursor = 1, schema = 'resNFe_v1.01.xsd') =>
  `<docZip NSU="${nsu(cursor)}" schema="${schema}">${gzipSync(xml).toString('base64')}</docZip>`
const response = (options: { status?: string; ult?: string; max?: string; batch?: string; extra?: string; noCursor?: boolean; soapNamespace?: string } = {}): NfeDistributionTransportResponse => {
  const body = `<s:Envelope xmlns:s="${options.soapNamespace ?? soap}"><s:Body><nfeDistDFeInteresseResponse xmlns="${wsdl}"><nfeDistDFeInteresseResult><retDistDFeInt xmlns="${nfe}" versao="1.01"><tpAmb>1</tpAmb><verAplic>1.4.0</verAplic><cStat>${options.status ?? '137'}</cStat><xMotivo>Retorno fiscal sintético</xMotivo><dhResp>2026-09-13T10:00:00-03:00</dhResp>${options.noCursor ? '' : `<ultNSU>${options.ult ?? nsu(0)}</ultNSU><maxNSU>${options.max ?? options.ult ?? nsu(0)}</maxNSU>`}${options.batch === undefined ? '' : `<loteDistDFeInt>${options.batch}</loteDistDFeInt>`}${options.extra ?? ''}</retDistDFeInt></nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></s:Body></s:Envelope>`
  return { statusCode: 200, contentType: 'application/soap+xml; charset=utf-8', body: Buffer.from(body) }
}
const transport = (value = response()): NfeDistributionTransport => vi.fn(async () => value)
const replaceResponse = (value: NfeDistributionTransportResponse, from: string | RegExp, to: string) =>
  ({ ...value, body: Buffer.from(value.body.toString().replace(from, to)) })
const rejectsCode = async (promise: Promise<unknown>, code: string) => expect(promise).rejects.toMatchObject({ name: 'NfeDistributionError', code })

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

describe('consulta nacional NF-e sem atos fiscais', () => {
  const lookupKey=(()=>{let sum=0,w=2;for(let i=42;i>=0;i--){sum+=(key.charCodeAt(i)-48)*w;w=w===9?2:w+1}const d=11-sum%11;return key.slice(0,43)+(d>=10?0:d)})()
  const lookupXml=()=>`<nfeProc xmlns="${nfe}" versao="4.00"><NFe><infNFe Id="NFe${lookupKey}" versao="4.00"><ide><tpAmb>1</tpAmb><dhEmi>2026-09-13T10:00:00-03:00</dhEmi><nNF>123</nNF><serie>1</serie><natOp>Venda de sementes</natOp></ide><emit><CNPJ>12ABC34501DE35</CNPJ><xNome>Fornecedor</xNome></emit><dest><CPF>12345678909</CPF></dest><det nItem="1"><prod><xProd>Soja</xProd><NCM>12011000</NCM><CFOP>5102</CFOP><qCom>2.0000</qCom><vUnCom>61.7250000000</vUnCom><vProd>123.45</vProd></prod></det><total><ICMSTot><vNF>123.45</vNF><vICMS>12.34</vICMS></ICMSTot></total><cobr><dup><nDup>001</nDup><dVenc>2026-10-10</dVenc><vDup>123.45</vDup></dup></cobr></infNFe></NFe><protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>${lookupKey}</chNFe><cStat>100</cStat><nProt>123456789012345</nProt></infProt></protNFe></nfeProc>`
  it('consulta por chave aceita XML semNSU/cursores e extrai itens, tributos e parcelas',async()=>{
    const batch=zip(lookupXml(),1,'procNFe_v4.00.xsd').replace(' NSU="000000000000001"','')
    const send=transport(response({status:'138',noCursor:true,batch}))
    const result=await queryNfeDistribution({...input,ultNSU:'500',consulta:{tipo:'chave',valor:lookupKey}},send)
    expect(vi.mocked(send).mock.calls[0][0].body).toContain(`<consChNFe><chNFe>${lookupKey}</chNFe></consChNFe>`)
    expect(result).toMatchObject({ultNSU:nsu(500),cursorReceived:false})
    expect(result.documents[0]).toMatchObject({nsu:'',kind:'nfe',details:{numero:'123',situacao:'autorizada',totais:{vICMS:'12.34'},itens:[{descricao:'Soja',quantidade:'2.0000',valorUnitario:'61.7250000000'}],parcelas:[{vencimento:'2026-10-10',valor:'123.45'}]}})
  })
  it('consulta NSU faltante abaixo do cursor sem exigir avanço da distribuição',async()=>{
    const send=transport(response({status:'138',noCursor:true,batch:zip(summary(),5)}))
    const result=await queryNfeDistribution({...input,ultNSU:'500',consulta:{tipo:'nsu',valor:'5'}},send)
    expect(vi.mocked(send).mock.calls[0][0].body).toContain(`<consNSU><NSU>${nsu(5)}</NSU></consNSU>`)
    expect(result.documents[0].nsu).toBe(nsu(5));expect(result.ultNSU).toBe(nsu(500))
  })
  it('recusa chave inválida antes da rede e não aceita resumo em retorno por chave',async()=>{
    const send=transport();await rejectsCode(queryNfeDistribution({...input,consulta:{tipo:'chave',valor:lookupKey.slice(0,43)+(Number(lookupKey[43])+1)%10}},send),'INVALID_INPUT');expect(send).not.toHaveBeenCalled()
    await rejectsCode(queryNfeDistribution({...input,consulta:{tipo:'chave',valor:lookupKey}},transport(response({status:'138',noCursor:true,batch:zip(summary().replace(key,lookupKey))}))),'INVALID_DOCUMENT')
  })
  it('recusa retorno de outra chave, outro NSU e múltiplos documentos em consulta pontual',async()=>{
    await rejectsCode(queryNfeDistribution({...input,consulta:{tipo:'nsu',valor:'9'}},transport(response({status:'138',noCursor:true,batch:zip(summary(),5)}))),'INVALID_PAGINATION')
    await rejectsCode(queryNfeDistribution({...input,consulta:{tipo:'nsu',valor:'5'}},transport(response({status:'138',noCursor:true,batch:zip(summary(),5)+zip(summary(),6)}))),'INVALID_PAGINATION')
    await rejectsCode(queryNfeDistribution({...input,consulta:{tipo:'chave',valor:lookupKey}},transport(response({status:'138',noCursor:true,batch:zip(lookupXml().replaceAll(lookupKey,key.slice(0,42)+'99'),1,'procNFe_v4.00.xsd')}))),'INVALID_DOCUMENT')
  })
  it('monta SOAP 1.2 de produção exclusivamente para distNSU e preserva CNPJ alfanumérico', async () => {
    const send = transport()
    const result = await queryNfeDistribution(input, send)
    const request = vi.mocked(send).mock.calls[0][0]
    expect(request.endpoint).toBe(NFE_DISTRIBUTION_ENDPOINT)
    expect(request.body).toContain(`<soap:Envelope xmlns:soap="${soap}">`)
    expect(request.body).toContain('<tpAmb>1</tpAmb><cUFAutor>35</cUFAutor><CNPJ>12ABC34501DE35</CNPJ>')
    expect(request.body).toContain(`<distNSU><ultNSU>${nsu(0)}</ultNSU></distNSU>`)
    expect(request.body).not.toMatch(/consNSU|consChNFe|envEvento|evento|passphrase|senha-sintetica/)
    expect(result).toMatchObject({ statusCode: '137', cursorReceived: true, documents: [], ultNSU: nsu(0) })
  })

  it('constrói o código correto das 27 UFs usando o mesmo serviço nacional', async () => {
    expect(Object.keys(NFE_UF_CODES)).toHaveLength(27)
    expect(new Set(Object.values(NFE_UF_CODES)).size).toBe(27)
    for (const [uf, code] of Object.entries(NFE_UF_CODES)) {
      const send = transport()
      await queryNfeDistribution({ ...input, uf, documento: '12345678909' }, send)
      expect(vi.mocked(send).mock.calls[0][0].body).toContain(`<cUFAutor>${code}</cUFAutor><CPF>12345678909</CPF>`)
    }
  })

  it.each([
    { documento: '12ABC34501DE35</CNPJ><CPF>123' }, { documento: '12abc34501de35' }, { documento: '123' },
    { documento: '00000000000' }, { uf: 'ZZ' }, { uf: '__proto__' }, { ultNSU: '-1' }, { ultNSU: '1000000000000000' },
    { pfx: Buffer.alloc(0) }, { passphrase: 'senha\0malformada' },
  ])('recusa parâmetros inválidos antes da rede: %j', async (override) => {
    const send = transport()
    await rejectsCode(queryNfeDistribution({ ...input, ...override }, send), 'INVALID_INPUT')
    expect(send).not.toHaveBeenCalled()
  })

  it('interpreta resumos sem converter dinheiro em número nem dizer que recebeu XML completo', async () => {
    const result = await queryNfeDistribution(input, transport(response({ status: '138', ult: '1', max: '2', batch: zip(summary()) })))
    expect(result).toMatchObject({ statusCode: '138', ultNSU: nsu(1), maxNSU: nsu(2), receivedAt: '2026-09-13T10:00:00-03:00' })
    expect(result.documents[0]).toMatchObject({ kind: 'nfe_summary', nsu: nsu(1), key, value: '1234567890123.45', issuer: { documento: input.documento, nome: 'Fazenda São José & Filhos' } })
    expect(result.documents[0].summary).toContain('XML integral não recebido')
    expect(result.documents[0].xml).toBe(summary())
  })

  it('preserva NF-e integral, identidades, data e total em texto decimal', async () => {
    const xml = `<nfeProc xmlns="${nfe}" versao="4.00"><NFe><infNFe Id="NFe${key}" versao="4.00"><ide><tpAmb>1</tpAmb><dhEmi>2026-09-13T10:00:00-03:00</dhEmi></ide><emit><CNPJ>12ABC34501DE35</CNPJ><xNome>Emitente</xNome></emit><dest><CPF>12345678909</CPF><xNome>Destinatário</xNome></dest><total><ICMSTot><vNF>123.45</vNF></ICMSTot></total></infNFe></NFe><protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>${key}</chNFe></infProt></protNFe></nfeProc>`
    const result = await queryNfeDistribution(input, transport(response({ status: '138', ult: '1', batch: zip(xml, 1, 'procNFe_v4.00.xsd') })))
    expect(result.documents[0]).toMatchObject({ kind: 'nfe', key, value: '123.45', issuer: { documento: input.documento }, recipient: { documento: '12345678909' }, xml })
    expect(result.documents[0].summary).toContain('não comprova recebimento ou pagamento')
  })

  it('extrai resumo de evento e evento protocolado sem manifestação', async () => {
    const res = `<resEvento xmlns="${nfe}" versao="1.01"><CNPJ>12ABC34501DE35</CNPJ><chNFe>${key}</chNFe><dhEvento>2026-09-13T10:00:00-03:00</dhEvento><tpEvento>110111</tpEvento><xEvento>Cancelamento</xEvento></resEvento>`
    const event = `<procEventoNFe xmlns="${nfe}" versao="1.00"><evento><infEvento><tpAmb>1</tpAmb><CNPJ>12ABC34501DE35</CNPJ><chNFe>${key}</chNFe><dhEvento>2026-09-13T10:00:00-03:00</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><detEvento><descEvento>Cancelamento</descEvento></detEvento></infEvento></evento><retEvento><infEvento><tpAmb>1</tpAmb><chNFe>${key}</chNFe><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento></infEvento></retEvento></procEventoNFe>`
    const send = transport(response({ status: '138', ult: '2', batch: zip(res, 1, 'resEvento_v1.01.xsd') + zip(event, 2, 'procEventoNFe_v1.00.xsd') }))
    const result = await queryNfeDistribution(input, send)
    expect(result.documents.map((doc) => doc.kind)).toEqual(['event_summary', 'event'])
    expect(result.documents[1].summary).toContain('nenhum evento foi enviado')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('devolve 656 sem repetir e sinaliza ausência facultativa do cursor', async () => {
    const send = transport(response({ status: '656', noCursor: true }))
    const result = await queryNfeDistribution({ ...input, ultNSU: '125' }, send)
    expect(result).toMatchObject({ statusCode: '656', ultNSU: nsu(125), maxNSU: nsu(125), cursorReceived: false, documents: [] })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('preserva rejeição oficial de identidade e não a converte em consulta bem-sucedida', async () => {
    const result = await queryNfeDistribution(input, transport(response({ status: '593', noCursor: true })))
    expect(result).toMatchObject({ statusCode: '593', cursorReceived: false, documents: [] })
  })

  it('aceita envelope SOAP 1.1 documentado com resposta fiscal idêntica', async () => {
    const result = await queryNfeDistribution(input, transport(response({ soapNamespace: 'http://schemas.xmlsoap.org/soap/envelope/' })))
    expect(result.statusCode).toBe('137')
  })

  it.each([
    { status: '138', ult: '1', batch: '' },
    { status: '137', ult: '1', max: '2' },
    { status: '137', ult: '1', batch: zip(summary()) },
    { status: '138', noCursor: true, batch: zip(summary()) },
    { status: '138', ult: '2', max: '1', batch: zip(summary()) },
    { status: '138', ult: '2', batch: zip(summary()) },
    { status: '138', ult: '2', batch: zip(summary(), 2) + zip(summary(), 1) },
    { status: '138', ult: '1', batch: zip(summary()) + zip(summary()) },
    { status: '138', ult: '1', batch: zip(summary()).replace('NSU="000000000000001"', '') },
    { status: '138', ult: '51', batch: Array.from({ length: 51 }, (_, index) => zip(summary(), index + 1)).join('') },
  ])('recusa lote ou cursor incoerente sem devolver lote parcial: %j', async (options) => {
    await rejectsCode(queryNfeDistribution(input, transport(response(options))), 'INVALID_PAGINATION')
  })

  it('recusa retrocesso de cursores de resposta bem-sucedida', async () => {
    await rejectsCode(queryNfeDistribution({ ...input, ultNSU: '10' }, transport(response({ ult: '9' }))), 'INVALID_PAGINATION')
  })

  it.each([
    ['namespace incorreto', '<cStat>137</cStat>', '<cStat xmlns="https://example.invalid">137</cStat>'],
    ['campo duplicado', '<cStat>137</cStat>', '<cStat>137</cStat><cStat>138</cStat>'],
    ['DTD externa', /^/, '<!DOCTYPE s:Envelope SYSTEM "file:///etc/passwd">'],
    ['entidades', /^/, '<!DOCTYPE s:Envelope [<!ENTITY many "value">]>'],
  ])('recusa %s', async (_name, from, to) => {
    await rejectsCode(queryNfeDistribution(input, transport(replaceResponse(response(), from, to as string))), 'INVALID_XML')
  })

  it.each([
    ['namespace do envelope', soap, 'https://example.invalid'],
    ['ambiente', '<tpAmb>1</tpAmb>', '<tpAmb>2</tpAmb>'],
    ['versão de resposta', 'versao="1.01"', 'versao="9.99"'],
  ])('recusa %s incompatível', async (_name, from, to) => {
    await rejectsCode(queryNfeDistribution(input, transport(replaceResponse(response(), from, to))), 'INVALID_RESPONSE')
  })

  it('recusa XML excessivamente aninhado antes de construir o DOM', async () => {
    const xml = '<a>'.repeat(200) + '</a>'.repeat(200)
    await rejectsCode(queryNfeDistribution(input, transport({ statusCode: 200, body: Buffer.from(xml) })), 'INVALID_XML')
  })

  it.each([
    ['esquema desconhecido', summary(), 'futuro_v9.99.xsd', 'UNSUPPORTED_SCHEMA'],
    ['esquema com caminho', summary(), '../resNFe_v1.01.xsd', 'UNSUPPORTED_SCHEMA'],
    ['versão incompatível', summary({ version: '1.00' }), 'resNFe_v1.01.xsd', 'INVALID_DOCUMENT'],
    ['namespace do documento', summary({ namespace: 'https://example.invalid' }), 'resNFe_v1.01.xsd', 'INVALID_DOCUMENT'],
    ['raiz incompatível', summary().replaceAll('resNFe', 'resEvento'), 'resNFe_v1.01.xsd', 'INVALID_DOCUMENT'],
    ['valor com vírgula', summary({ value: '123,45' }), 'resNFe_v1.01.xsd', 'INVALID_DOCUMENT'],
    ['valor exponencial', summary({ value: '1e6' }), 'resNFe_v1.01.xsd', 'INVALID_DOCUMENT'],
    ['dia inexistente', summary().replace('2026-09-13', '2026-02-30'), 'resNFe_v1.01.xsd', 'INVALID_DOCUMENT'],
    ['XXE dentro do gzip', '<!DOCTYPE resNFe SYSTEM "file:///etc/passwd">' + summary(), 'resNFe_v1.01.xsd', 'INVALID_XML'],
  ])('recusa documento com %s sem avançar cursor', async (_name, xml, schema, code) => {
    await rejectsCode(queryNfeDistribution(input, transport(response({ status: '138', ult: '1', batch: zip(xml, 1, schema) }))), code)
  })

  it('aborta o lote inteiro se o segundo documento for malformado', async () => {
    const batch = zip(summary()) + zip('<documento>', 2)
    await rejectsCode(queryNfeDistribution(input, transport(response({ status: '138', ult: '2', batch }))), 'INVALID_XML')
  })

  it('recusa base64 inválido e gzip inválido', async () => {
    for (const encoded of ['*invalid*', Buffer.from('texto que não é gzip').toString('base64')]) {
      const batch = `<docZip NSU="1" schema="resNFe_v1.01.xsd">${encoded}</docZip>`
      await rejectsCode(queryNfeDistribution(input, transport(response({ status: '138', ult: '1', batch }))), 'INVALID_DOCUMENT')
    }
  })

  it('limita expansão gzip e recusa XML UTF-8 corrompido', async () => {
    const huge = summary({ extra: '<!--' + 'x'.repeat(NFE_DISTRIBUTION_LIMITS.documentBytes) + '-->' })
    await rejectsCode(queryNfeDistribution(input, transport(response({ status: '138', ult: '1', batch: zip(huge) }))), 'DOCUMENT_TOO_LARGE')
    const encoded = gzipSync(Buffer.from([0xff, 0xfe, 0x61, 0x00])).toString('base64')
    const batch = `<docZip NSU="1" schema="resNFe_v1.01.xsd">${encoded}</docZip>`
    await rejectsCode(queryNfeDistribution(input, transport(response({ status: '138', ult: '1', batch }))), 'INVALID_XML')
  })

  it('recusa resposta HTTP grande, não XML, redirecionada ou com compactação inesperada', async () => {
    await rejectsCode(queryNfeDistribution(input, transport({ statusCode: 200, body: Buffer.alloc(NFE_DISTRIBUTION_LIMITS.responseBytes + 1) })), 'RESPONSE_TOO_LARGE')
    await rejectsCode(queryNfeDistribution(input, transport({ ...response(), contentType: 'text/html' })), 'INVALID_RESPONSE')
    await rejectsCode(queryNfeDistribution(input, transport({ ...response(), statusCode: 302 })), 'HTTP_ERROR')
    await rejectsCode(queryNfeDistribution(input, transport({ ...response(), contentEncoding: 'gzip' })), 'INVALID_RESPONSE')
  })

  it('não expõe erros de biblioteca, arquivo ou senha', async () => {
    const send: NfeDistributionTransport = async () => { throw new Error(`OpenSSL ${input.passphrase} /private/certificate.pfx`) }
    try { await queryNfeDistribution(input, send); expect.fail('Deveria falhar') } catch (error) {
      expect(error).toBeInstanceOf(NfeDistributionError)
      expect(String(error)).not.toContain(input.passphrase)
      expect(String(error)).not.toContain('certificate.pfx')
      expect((error as NfeDistributionError).code).toBe('TRANSPORT_ERROR')
    }
  })

  it('obedece cancelamento antes e depois da rede', async () => {
    const controller = new AbortController()
    controller.abort()
    const send = transport()
    await rejectsCode(queryNfeDistribution({ ...input, signal: controller.signal }, send), 'ABORTED')
    expect(send).not.toHaveBeenCalled()
    const controller2 = new AbortController()
    await rejectsCode(queryNfeDistribution({ ...input, signal: controller2.signal }, async () => { controller2.abort(); return response() }), 'ABORTED')
  })
})

describe('transporte HTTPS nacional', () => {
  let identity: { cert: Buffer; key: Buffer; dispose: ReturnType<typeof vi.fn> }
  beforeEach(() => {
    vi.mocked(httpsRequest).mockReset()
    tlsProvider.prepare.mockReset()
    identity = { cert: Buffer.from('synthetic-public-leaf'), key: Buffer.from('synthetic-private-key'), dispose: vi.fn(() => { identity.cert.fill(0); identity.key.fill(0) }) }
    tlsProvider.prepare.mockResolvedValue(identity)
  })

  function fakeRequest(options: { respond?: boolean; statusCode?: number; headers?: Record<string, string>; body?: Buffer } = {}) {
    const req = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() })
    const res = Object.assign(new EventEmitter(), { statusCode: options.statusCode ?? 200, headers: options.headers ?? { 'content-type': 'application/soap+xml' }, destroy: vi.fn() })
    req.destroy.mockImplementation((error?: Error) => { if (error) queueMicrotask(() => req.emit('error', error)); return req })
    vi.mocked(httpsRequest).mockImplementation((...args: unknown[]) => {
      const callback = args[2] as (value: unknown) => void
      req.end.mockImplementation(() => {
        if (options.respond === false) return
        queueMicrotask(() => {
          callback(res)
          if (!res.destroy.mock.calls.length) {
            res.emit('data', options.body ?? response().body)
            if (!res.destroy.mock.calls.length) res.emit('end')
          }
        })
      })
      return req as never
    })
    return { req, res }
  }

  it('usa mTLS com verificação de cadeia/hostname, TLS 1.2 mínimo e destino fixo', async () => {
    const fake = fakeRequest()
    const result = await queryNfeDistribution({ ...input, endpoint: 'https://example.invalid/collect' } as NfeDistributionInput)
    const [url, options] = vi.mocked(httpsRequest).mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(url).toBe(NFE_DISTRIBUTION_ENDPOINT)
    expect(options).toMatchObject({ method: 'POST', agent: false, cert: identity.cert, key: identity.key, rejectUnauthorized: true, minVersion: 'TLSv1.2' })
    expect(tlsProvider.prepare).toHaveBeenCalledWith(input.pfx, input.passphrase)
    expect(options).not.toHaveProperty('pfx')
    expect(options).not.toHaveProperty('passphrase')
    expect(options.headers).toMatchObject({ 'Accept-Encoding': 'identity', 'Content-Type': `application/soap+xml; charset=utf-8; action="${NFE_DISTRIBUTION_ACTION}"` })
    expect(options).not.toHaveProperty('checkServerIdentity')
    expect(options).not.toHaveProperty('ca')
    expect(fake.req.end).toHaveBeenCalledTimes(1)
    expect(result.statusCode).toBe('137')
    expect(identity.dispose).toHaveBeenCalledOnce()
    expect(identity.key.every(byte => byte === 0)).toBe(true)
  })

  it('não segue redirecionamento levando o certificado a outro endereço', async () => {
    const fake = fakeRequest({ statusCode: 302, headers: { location: 'https://example.invalid/collect' } })
    await rejectsCode(queryNfeDistribution(input), 'HTTP_ERROR')
    expect(httpsRequest).toHaveBeenCalledTimes(1)
    expect(fake.res.destroy).toHaveBeenCalled()
    expect(identity.dispose).toHaveBeenCalledOnce()
  })

  it('interrompe stream acima do limite, inclusive sem Content-Length', async () => {
    const fake = fakeRequest({ body: Buffer.alloc(NFE_DISTRIBUTION_LIMITS.responseBytes + 1) })
    await rejectsCode(queryNfeDistribution(input), 'RESPONSE_TOO_LARGE')
    expect(fake.req.destroy).toHaveBeenCalled()
    expect(identity.dispose).toHaveBeenCalledOnce()
  })

  it('respeita prazo absoluto de 30 segundos sem repetição automática', async () => {
    vi.useFakeTimers()
    fakeRequest({ respond: false })
    const pending = rejectsCode(queryNfeDistribution(input), 'TIMEOUT')
    await vi.advanceTimersByTimeAsync(NFE_DISTRIBUTION_LIMITS.timeoutMs)
    await pending
    expect(httpsRequest).toHaveBeenCalledTimes(1)
    expect(identity.dispose).toHaveBeenCalledOnce()
  })

  it('cancela a conexão quando a autorização é interrompida', async () => {
    const fake = fakeRequest({ respond: false })
    const controller = new AbortController()
    const pending = rejectsCode(queryNfeDistribution({ ...input, signal: controller.signal }), 'ABORTED')
    await Promise.resolve()
    controller.abort()
    await pending
    expect(fake.req.destroy).toHaveBeenCalled()
    expect(identity.dispose).toHaveBeenCalledOnce()
  })

  it('sanitiza falha síncrona de OpenSSL', async () => {
    vi.mocked(httpsRequest).mockImplementation(() => { throw new Error('pkcs12 senha-sintetica-nao-real') })
    let caught: unknown
    try { await queryNfeDistribution(input) } catch (error) { caught = error }
    expect(caught).toBeInstanceOf(NfeDistributionError)
    expect((caught as NfeDistributionError).code).toBe('TRANSPORT_ERROR')
    expect(String(caught)).not.toContain(input.passphrase)
    expect(httpsRequest).toHaveBeenCalledTimes(1)
    expect(identity.dispose).toHaveBeenCalledOnce()
    vi.mocked(httpsRequest).mockReset()
  })

  it('não envia certificado se a autorização for cancelada enquanto prepara a identidade TLS', async () => {
    const controller = new AbortController()
    tlsProvider.prepare.mockImplementationOnce(async () => { controller.abort(); return identity })
    await rejectsCode(queryNfeDistribution({ ...input, signal: controller.signal }), 'ABORTED')
    expect(httpsRequest).not.toHaveBeenCalled()
    expect(identity.dispose).toHaveBeenCalledOnce()
  })

  it('falha na extração da identidade não usa PFX como alternativa nem expõe segredo', async () => {
    tlsProvider.prepare.mockRejectedValueOnce(new Error('synthetic-private-key senha-sintetica-nao-real'))
    const error = await queryNfeDistribution(input).catch(error => error)
    expect(error).toMatchObject({ code: 'TRANSPORT_ERROR' })
    expect(String(error)).not.toMatch(/synthetic-private-key|senha-sintetica/)
    expect(httpsRequest).not.toHaveBeenCalled()
  })
})
