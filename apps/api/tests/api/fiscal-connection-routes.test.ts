import Fastify, { type FastifyInstance, type InjectOptions } from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  clients: new Map<string, { id: string }>(), access: vi.fn(), list: vi.fn(), consult: vi.fn(),
  change: vi.fn(), download: vi.fn(), receive: vi.fn(),
  search:vi.fn(),detail:vi.fn(),history:vi.fn(),export:vi.fn(),retry:vi.fn(),
}))
vi.mock('../../src/routes/clientes.js', () => ({ clientes: state.clients }))
vi.mock('../../src/services/core/AccessControlService.js', () => ({ getAccessControlService: () => ({ assertClienteAccess: state.access }) }))
vi.mock('../../src/services/fiscal-connection/FiscalConnectionService.js', async original => ({
  ...await original<typeof import('../../src/services/fiscal-connection/FiscalConnectionService.js')>(),
  fiscalConnectionService: { list: state.list, consult: state.consult, change: state.change, download: state.download, receive: state.receive },
}))
vi.mock('../../src/services/fiscal-connection/FiscalArchiveService.js',()=>({fiscalArchiveService:{search:state.search,detail:state.detail,history:state.history,export:state.export,retryBridge:state.retry}}))
// Preservamos assertPortalStaff e a verificação real da sessão interna.
vi.mock('../../src/services/portal/PortalDocumentService.js', () => ({ portalDocumentService: {} }))
vi.mock('../../src/services/portal/PortalDocumentProcessor.js', () => ({ getPortalDocumentProcessor: vi.fn() }))
vi.mock('../../src/services/portal/PortalCommunicationService.js', () => ({ listPortalUpdates: vi.fn(), publishPortalUpdate: vi.fn(), sharePortalUpload: vi.fn() }))
import { registerFiscalConnectionRoutes } from '../../src/services/fiscal-connection/FiscalConnectionRoutes.js'
import { FiscalConnectionError } from '../../src/services/fiscal-connection/FiscalConnectionService.js'

type Part = { name: string; value: string | Buffer; filename?: string }
const packet = (parts: Part[]) => {
  const boundary = 'fiscal-synthetic-boundary-987654321'
  const body = Buffer.concat(parts.flatMap(part => [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${part.filename ? `; filename="${part.filename}"` : ''}\r\n${part.filename ? 'Content-Type: application/x-pkcs12\r\n' : ''}\r\n`),
    Buffer.isBuffer(part.value) ? part.value : Buffer.from(part.value), Buffer.from('\r\n'),
  ]).concat([Buffer.from(`--${boundary}--\r\n`)]))
  return { payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }
}
const certificateParts = (): Part[] => [
  { name: 'file', filename: 'sintetico.pfx', value: Buffer.alloc(100, 7) },
  { name: 'senha', value: 'synthetic-certificate-password' }, { name: 'uf', value: 'MT' },
  { name: 'documento', value: '12345678909' }, { name: 'consentimento', value: 'true' },
]
const clientBase = '/api/portal/fiscal/conexao'
const staffBase = '/api/clientes/client-a/portal/fiscal/conexao'
const stamp = '2026-09-13T10:00:00.123Z'
const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
const targets = (base: string): InjectOptions[] => [
  { method: 'GET', url: base },
  { method: 'POST', url: base + '/consultar', payload: { credencialId: 'fc-a' } },
  { method: 'POST', url: base + '/credenciais/fc-a/suspender', payload: { expectedUpdatedAt: stamp } },
  { method: 'PATCH', url: base + '/credenciais/fc-a/automacao', payload: { expectedUpdatedAt: stamp, ativa: true } },
  { method: 'GET', url: base + '/documentos/fd-a/download' },
  { method:'GET',url:base+'/acervo?busca=soja' },
  { method:'GET',url:base+'/documentos/fd-a' },
  { method:'GET',url:base+'/historico' },
  { method:'GET',url:base+'/exportar/csv' },
  { method:'GET',url:base+'/exportar/xlsx' },
]

describe('rotas da conexão fiscal com isolamento real de sessões', () => {
  let app: FastifyInstance, portalA: string, portalB: string, staff: string
  beforeEach(async () => {
    vi.resetAllMocks(); state.clients.clear()
    state.clients.set('client-a', { id: 'client-a' }); state.clients.set('client-b', { id: 'client-b' })
    state.access.mockResolvedValue(undefined)
    state.list.mockImplementation(async clienteId => ({ configurado: true, credenciais: [{ id: 'fc-' + clienteId, documentoMascarado: '***.***.***-09' }], consultas: [], documentos: [] }))
    state.consult.mockResolvedValue({ id: 'fq-a', status: 'sem_documentos' })
    state.change.mockResolvedValue({ id: 'fc-a', status: 'suspensa' })
    state.download.mockResolvedValue({ xml: '<resNFe>synthetic-only</resNFe>', filename: 'SEFAZ-resumo-1.xml' })
    state.receive.mockResolvedValue({ credencial: { id: 'fc-a', documentoMascarado: '***.***.***-09', status: 'ativa' }, replayed: false })
    state.search.mockResolvedValue({documentos:[],total:0});state.detail.mockResolvedValue({documento:{id:'fd-a'}});state.history.mockResolvedValue({consultas:[],total:0});state.export.mockResolvedValue({body:Buffer.from('csv'),filename:'fiscal.csv',contentType:'text/csv'});state.retry.mockResolvedValue({agendado:true})
    app = Fastify()
    await app.register(jwt, { secret: 'fiscal-connection-route-synthetic-secret-not-production-123456789' })
    await app.register(cookie)
    await app.register(multipart)
    await registerFiscalConnectionRoutes(app, async (request, reply) => {
      try { await request.jwtVerify() } catch { return reply.code(401).send({ success: false }) }
      const claims = request.user as { sub?: string; kind?: string }
      if (claims.kind !== 'portal-cliente' || !claims.sub || !state.clients.has(claims.sub)) return reply.code(401).send({ success: false })
      ;(request as typeof request & { clienteId: string }).clienteId = claims.sub
    })
    await app.ready()
    portalA = app.jwt.sign({ sub: 'client-a', kind: 'portal-cliente' })
    portalB = app.jwt.sign({ sub: 'client-b', kind: 'portal-cliente' })
    staff = app.jwt.sign({ sub: 'consultor-christian', kind: 'internal', username: 'christian' })
  })
  afterEach(async () => { await app.close() })
  const upload = (parts = certificateParts(), token = portalA): InjectOptions => {
    const request = packet(parts)
    return { method: 'POST', url: clientBase + '/certificado', payload: request.payload, headers: { ...request.headers, ...bearer(token), 'idempotency-key': 'certificate-request-001' } }
  }

  it('nenhuma operação pública admite ausência de JWT, identidade interna ou token fornecido na URL', async () => {
    const operations = [...targets(clientBase), { method: 'POST' as const, url: clientBase + '/certificado', payload: {} }]
    for (const target of operations) {
      expect((await app.inject(target)).statusCode).toBe(401)
      expect((await app.inject({ ...target, headers: bearer(staff) })).statusCode).toBe(401)
      expect((await app.inject({ ...target, url: target.url + '?token=' + portalA })).statusCode).toBe(401)
    }
    for (const service of [state.list, state.consult, state.change, state.receive, state.download]) expect(service).not.toHaveBeenCalled()
  })

  it('JWT de portal, cookies de portal e cabeçalhos declaratórios não concedem acesso à equipe', async () => {
    for (const target of targets(staffBase)) {
      expect((await app.inject(target)).statusCode).toBe(401)
      expect((await app.inject({ ...target, headers: { ...bearer(portalA), 'x-role': 'admin', 'x-user-id': 'consultor-christian' } })).statusCode).toBe(401)
      expect((await app.inject({ ...target, headers: { cookie: `aletis_session=${portalA}` } })).statusCode).toBe(401)
      expect((await app.inject({ ...target, url: target.url + '?token=' + staff })).statusCode).toBe(401)
    }
    expect(state.access).not.toHaveBeenCalled(); expect(state.download).not.toHaveBeenCalled()
  })

  it('recusa identidade interna adulterada, desconhecida, expirada ou com sub incompatível', async () => {
    const invalid = [
      app.jwt.sign({ sub: 'client-a', kind: 'internal', username: 'christian' }),
      app.jwt.sign({ sub: 'consultor-christian', kind: 'internal', username: 'unknown' }),
      app.jwt.sign({ sub: 'consultor-christian', kind: 'internal', username: 'christian', exp: Math.floor(Date.now() / 1000) - 60 }),
      staff.slice(0, -6) + 'xxxxxx',
    ]
    for (const token of invalid) expect((await app.inject({ url: staffBase, headers: bearer(token) })).statusCode).toBe(401)
    expect(state.access).not.toHaveBeenCalled()
  })

  it('recusa JWT público de titular inexistente ou outro kind', async () => {
    for (const claims of [{ sub: 'unknown', kind: 'portal-cliente' }, { sub: 'client-a', kind: 'internal' }, { sub: 'client-a' }]) {
      expect((await app.inject({ url: clientBase, headers: bearer(app.jwt.sign(claims)) })).statusCode).toBe(401)
    }
    expect(state.list).not.toHaveBeenCalled()
  })

  it('lista dados somente do titular autenticado e proíbe cache, mesmo com tentativa de trocar cliente por query ou header', async () => {
    const result = await app.inject({ url: clientBase + '?clienteId=client-b', headers: { ...bearer(portalA), 'x-cliente-id': 'client-b' } })
    expect(result.statusCode).toBe(200); expect(result.headers['cache-control']).toBe('no-store')
    expect(state.list).toHaveBeenCalledWith('client-a')
    expect(result.json().data.credenciais[0].id).toBe('fc-client-a')
    await app.inject({ url: clientBase, headers: bearer(portalB) })
    expect(state.list).toHaveBeenLastCalledWith('client-b')
  })

  it('consultas encaminham o titular e ator verificados, corpo e recibo de idempotência sem usar um cliente declarado', async () => {
    const body = { credencialId: 'fc-b', clienteId: 'client-b' }
    const response = await app.inject({ method: 'POST', url: clientBase + '/consultar?clienteId=client-b', headers: { ...bearer(portalA), 'idempotency-key': 'query-request-001' }, payload: body })
    expect(response.statusCode).toBe(200); expect(response.headers['cache-control']).toBe('no-store')
    expect(state.consult).toHaveBeenCalledWith('client-a', body, 'query-request-001', 'portal:client-a')
    // O schema estrito e a propriedade da credencial são verificados pelo serviço, coberto pela suíte PostgreSQL.
    state.consult.mockRejectedValueOnce(new FiscalConnectionError('Certificado não encontrado.', 404))
    expect((await app.inject({ method: 'POST', url: clientBase + '/consultar', headers: bearer(portalA), payload: { credencialId: 'fc-b' } })).statusCode).toBe(404)
  })

  it('suspensão e automação mantêm o titular e propagam conflitos de versão ou credencial de terceiros', async () => {
    const payload = { expectedUpdatedAt: stamp }
    const response = await app.inject({ method: 'POST', url: clientBase + '/credenciais/fc-b/suspender?clienteId=client-b', headers: bearer(portalA), payload })
    expect(response.statusCode).toBe(200); expect(response.headers['cache-control']).toBe('no-store')
    expect(state.change).toHaveBeenCalledWith('client-a', 'fc-b', payload, 'portal:client-a', true)
    state.change.mockRejectedValueOnce(new FiscalConnectionError('O certificado mudou.', 409))
    expect((await app.inject({ method: 'PATCH', url: clientBase + '/credenciais/fc-b/automacao', headers: bearer(portalA), payload: { ...payload, ativa: true } })).statusCode).toBe(409)
    expect(state.change).toHaveBeenLastCalledWith('client-a', 'fc-b', { ...payload, ativa: true }, 'portal:client-a', false)
  })

  it('uma carteira não autorizada bloqueia leitura, download, consulta, suspensão e automação antes do serviço', async () => {
    state.access.mockRejectedValue(Object.assign(new Error('Fora da carteira'), { statusCode: 403 }))
    for (const target of targets(staffBase)) expect((await app.inject({ ...target, headers: bearer(staff) })).statusCode).toBe(403)
    for (const service of [state.list, state.consult, state.change, state.download]) expect(service).not.toHaveBeenCalled()
    expect(state.access.mock.calls.map(call => call[0].action)).toEqual(['document:read', 'document:write', 'document:write', 'document:write', 'document:read', 'document:read', 'document:read', 'document:read', 'document:read', 'document:read'])
  })

  it('toda mutação da equipe exige escrita documental e também permissão de escrita no CRM', async () => {
    state.access.mockImplementation(async ({ action }: { action: string }) => { if (action === 'write') throw Object.assign(new Error('CRM somente leitura'), { statusCode: 403 }) })
    for (const target of targets(staffBase).filter(target => target.method !== 'GET')) {
      state.access.mockClear()
      expect((await app.inject({ ...target, headers: bearer(staff) })).statusCode).toBe(403)
      expect(state.access.mock.calls.map(call => call[0].action)).toEqual(['document:write', 'write'])
    }
    expect(state.consult).not.toHaveBeenCalled(); expect(state.change).not.toHaveBeenCalled()
  })

  it('cookie interno oficial mantém o cliente do caminho e o ator conhecido', async () => {
    const headers = { cookie: `aletis_session=${staff}`, 'idempotency-key': 'staff-query-request-001' }
    const response = await app.inject({ method: 'POST', url: staffBase + '/consultar', headers, payload: { credencialId: 'fc-a' } })
    expect(response.statusCode).toBe(200)
    expect(state.consult).toHaveBeenCalledWith('client-a', { credencialId: 'fc-a' }, 'staff-query-request-001', 'consultor-christian')
    expect(state.access).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 'client-a', actor: expect.objectContaining({ id: 'consultor-christian' }) }))
    expect((await app.inject({ url: staffBase.replace('client-a', 'unknown'), headers })).statusCode).toBe(404)
  })

  it('XML é entregue como anexo autenticado sem cache, com sandbox e proteção contra interpretação de outro tipo', async () => {
    const response = await app.inject({ url: clientBase + '/documentos/fd-a/download?clienteId=client-b', headers: bearer(portalA) })
    expect(response.statusCode).toBe(200)
    expect(state.download).toHaveBeenCalledWith('client-a', 'fd-a', 'portal:client-a')
    expect(response.headers['content-type']).toContain('application/xml')
    expect(response.headers['content-disposition']).toBe('attachment; filename="SEFAZ-resumo-1.xml"')
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['content-security-policy']).toContain('sandbox')
    expect(response.body).toBe('<resNFe>synthetic-only</resNFe>')
    state.download.mockRejectedValueOnce(new FiscalConnectionError('Documento não encontrado.', 404))
    const other = await app.inject({ url: clientBase + '/documentos/fd-b/download', headers: bearer(portalA) })
    expect(other.statusCode).toBe(404); expect(other.body).not.toContain('<resNFe>')
  })

  it('não existe rota para importar certificado pela equipe, baixar a chave privada ou ler sua senha', async () => {
    for (const path of ['/certificado', '/credenciais/fc-a', '/credenciais/fc-a/download', '/credenciais/fc-a/senha', '/credenciais/fc-a/arquivo']) {
      expect((await app.inject({ url: clientBase + path, headers: bearer(portalA) })).statusCode).toBe(404)
      expect((await app.inject({ url: staffBase + path, headers: bearer(staff) })).statusCode).toBe(404)
    }
    expect((await app.inject({ method: 'POST', url: staffBase + '/certificado', headers: bearer(staff), payload: {} })).statusCode).toBe(404)
    expect(state.receive).not.toHaveBeenCalled(); expect(state.download).not.toHaveBeenCalled()
  })

  it('recebe multipart somente do titular, retorna DTO público e apaga buffer e senha após confirmação', async () => {
    let originalBytes: Buffer | undefined, originalFields: Record<string, unknown> | undefined, seen: Record<string, unknown> | undefined
    state.receive.mockImplementation(async (owner, input, key) => {
      originalBytes = input.file; originalFields = input.fields; seen = { owner, filename: input.filename, key, fields: { ...input.fields }, size: input.file.length }
      return { credencial: { id: 'fc-a', status: 'ativa' }, replayed: false }
    })
    const request = upload(); request.url += '?clienteId=client-b'
    const result = await app.inject(request)
    expect(result.statusCode).toBe(201); expect(result.headers['cache-control']).toBe('no-store')
    expect(seen).toMatchObject({ owner: 'client-a', filename: 'sintetico.pfx', key: 'certificate-request-001', size: 100, fields: { senha: 'synthetic-certificate-password', uf: 'MT', documento: '12345678909', consentimento: 'true' } })
    expect(originalBytes!.every(value => value === 0)).toBe(true)
    expect(originalFields!.senha).toBeUndefined()
    expect(result.json()).toEqual({ success: true, data: { id: 'fc-a', status: 'ativa' }, replayed: false })
    expect(result.body).not.toMatch(/senha|synthetic-certificate-password|file|envelope/)
  })

  it('limpa material sensível também se a validação falha, libera novo envio e respeita replay', async () => {
    let buffer: Buffer | undefined, fields: Record<string, unknown> | undefined
    state.receive.mockImplementationOnce(async (_owner, input) => { buffer = input.file; fields = input.fields; throw new FiscalConnectionError('Certificado inválido.', 422) })
    expect((await app.inject(upload())).statusCode).toBe(422)
    expect(buffer!.every(value => value === 0)).toBe(true); expect(fields!.senha).toBeUndefined()
    state.receive.mockResolvedValueOnce({ credencial: { id: 'fc-a' }, replayed: true })
    const replay = await app.inject(upload())
    expect(replay.statusCode).toBe(200); expect(replay.json().replayed).toBe(true)
    expect(state.receive).toHaveBeenCalledTimes(2)
  })

  it('recusa JSON, ausência de arquivo e campo de arquivo diferente de file antes do cofre', async () => {
    expect((await app.inject({ method: 'POST', url: clientBase + '/certificado', headers: bearer(portalA), payload: { file: 'base64-private', senha: 'synthetic' } })).statusCode).toBe(415)
    expect((await app.inject(upload(certificateParts().filter(part => part.name !== 'file')))).statusCode).toBe(400)
    const wrongField = certificateParts(); wrongField[0].name = 'arquivo'
    expect((await app.inject(upload(wrongField))).statusCode).toBe(400)
    expect(state.receive).not.toHaveBeenCalled()
  })

  it('recusa campos repetidos e múltiplos arquivos sem chegar ao serviço', async () => {
    const repeated = certificateParts().slice(0, 3).concat([{ name: 'senha', value: 'second-password' }])
    expect((await app.inject(upload(repeated))).statusCode).toBe(400)
    const twoFiles = [certificateParts()[0], { name: 'file', filename: 'second.p12', value: Buffer.alloc(100, 2) }]
    expect((await app.inject(upload(twoFiles))).statusCode).toBe(413)
    expect(state.receive).not.toHaveBeenCalled()
    // A rejeição não conserva o bloqueio de envio do titular.
    expect((await app.inject(upload())).statusCode).toBe(201)
  })

  it('impõe 256 KB ao arquivo e quatro campos ao multipart', async () => {
    const tooLarge = certificateParts(); tooLarge[0].value = Buffer.alloc(256 * 1024 + 1, 9)
    expect((await app.inject(upload(tooLarge))).statusCode).toBe(413)
    expect((await app.inject(upload([...certificateParts(), { name: 'extra', value: 'blocked' }]))).statusCode).toBe(413)
    expect(state.receive).not.toHaveBeenCalled()
    const maximum = certificateParts(); maximum[0].value = Buffer.alloc(256 * 1024, 5)
    expect((await app.inject(upload(maximum))).statusCode).toBe(201)
  })

  it('um envio pendente bloqueia outro do mesmo titular, sem bloquear cliente diferente', async () => {
    let resolve!: (value: unknown) => void
    let started!: () => void
    const entered = new Promise<void>(done => { started = done })
    state.receive.mockImplementationOnce(async () => { started(); return new Promise(done => { resolve = done }) })
    const first = app.inject(upload())
    await entered
    try {
      expect((await app.inject(upload())).statusCode).toBe(429)
      expect((await app.inject(upload(certificateParts(), portalB))).statusCode).toBe(201)
    } finally { resolve({ credencial: { id: 'fc-a' }, replayed: false }); await first }
    expect((await app.inject(upload())).statusCode).toBe(201)
  })
})
