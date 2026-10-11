import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  clients: new Map<string, any>(), requests: new Map<string, any>(), files: new Map<string, any>(),
  access: vi.fn(), receive: vi.fn(), create: vi.fn(), patch: vi.fn(), cancel: vi.fn(), retry: vi.fn(), analysis: vi.fn(),
  updates: vi.fn(), publish: vi.fn(), share: vi.fn(), accepted: 0,
}))
vi.mock('../../src/routes/clientes.js', () => ({ clientes: state.clients }))
vi.mock('../../src/services/core/AccessControlService.js', () => ({ getAccessControlService: () => ({ assertClienteAccess: state.access }) }))
vi.mock('../../src/services/portal/PortalDocumentService.js', () => ({ portalDocumentService: {
  listarPendencias: async (id: string) => [...state.requests.values()].filter(request => request.clienteId === id),
  buscarPendencia: async (id: string, pid: string) => state.requests.get(pid)?.clienteId === id ? state.requests.get(pid) : null,
  listarUploads: async (id: string) => [...state.files.values()].filter(file => file.clienteId === id),
  buscarUpload: async (id: string, uid: string) => state.files.get(uid)?.clienteId === id ? state.files.get(uid) : null,
  receberUpload: state.receive, criarPendencia: state.create, atualizarPendencia: state.patch, cancelarPendencia: state.cancel,
} }))
vi.mock('../../src/services/portal/PortalDocumentProcessor.js', () => ({ getPortalDocumentProcessor: () => ({ retry: state.retry, getAnalysis: state.analysis }) }))
vi.mock('../../src/services/portal/PortalCommunicationService.js', () => ({ listPortalUpdates: state.updates, publishPortalUpdate: state.publish, sharePortalUpload: state.share }))

import { registerPortalDocumentRoutes } from '../../src/services/portal/PortalDocumentRoutes.js'
import { decodePortalBase64, PORTAL_UPLOAD_MAX_BYTES } from '../../src/services/portal/PortalUploadValidation.js'

const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF')
const pending = (id: string, clienteId: string) => ({ id, clienteId, titulo: 'Documento de teste', categoria: 'identidade', status: 'pendente', prioridade: 'normal', prazo: null, tipoDocumento: null, obrigatorio: true, solicitadoEm: '2026-09-11T12:00:00.000Z', updatedAt: '2026-09-11T12:00:00.000Z', metadata: { internal: 'PRIVATE_REQUEST' } })
function multipartBody(parts: Array<{ name: string; value?: string; filename?: string; buffer?: Buffer; mime?: string }>) {
  const boundary = 'portal-document-fixture-boundary'
  const chunks: Buffer[] = []
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${part.filename ? `; filename="${part.filename}"` : ''}\r\n${part.filename ? `Content-Type: ${part.mime || 'application/octet-stream'}\r\n` : ''}\r\n`))
    chunks.push(part.buffer || Buffer.from(part.value || '')); chunks.push(Buffer.from('\r\n'))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` }
}

describe('rotas documentais isoladas: autenticação, arquivos e projeção pública', () => {
  let app: FastifyInstance
  let directory: string
  let previousDirectory: string | undefined
  let portalA: string, portalB: string, staff: string
  beforeEach(async () => {
    vi.clearAllMocks(); state.clients.clear(); state.requests.clear(); state.files.clear(); state.accepted = 0
    state.clients.set('client-a', { id: 'client-a' }); state.clients.set('client-b', { id: 'client-b' })
    state.requests.set('request-a', pending('request-a', 'client-a')); state.requests.set('request-b', pending('request-b', 'client-b'))
    state.access.mockResolvedValue(undefined); state.updates.mockResolvedValue([])
    state.receive.mockImplementation(async (data: any) => {
      const found = [...state.files.values()].find(file => file.clienteId === data.clienteId && data.idempotencyKey && file.idempotencyKey === data.idempotencyKey)
      if (found) return { upload: found, pendencia: null, replayed: true }
      const upload = { ...data, enviadoEm: new Date().toISOString(), versao: data.pendenciaId ? 1 : null, metadata: { segredo: 'PRIVATE_UPLOAD', processing: { analysis: { status: 'pending' }, drive: { status: 'pending' } } } }
      state.files.set(data.id, upload); state.accepted++
      return { upload, pendencia: data.pendenciaId ? state.requests.get(data.pendenciaId) : null, replayed: false }
    })
    directory = await mkdtemp(join(tmpdir(), 'portal-upload-routes-'))
    previousDirectory = process.env.ALETIS_PORTAL_UPLOAD_DIR; process.env.ALETIS_PORTAL_UPLOAD_DIR = directory
    app = Fastify()
    await app.register(jwt, { secret: 'portal-fixture-only-never-used-on-server-1234567890' })
    await app.register(multipart)
    await registerPortalDocumentRoutes(app, async (request, reply) => {
      try { await request.jwtVerify() } catch { return reply.code(401).send({ success: false }) }
      const claims = request.user as { kind?: string; sub?: string }
      if (claims.kind !== 'portal-cliente' || !claims.sub || !state.clients.has(claims.sub)) return reply.code(401).send({ success: false })
      ;(request as any).clienteId = claims.sub
    })
    await app.ready()
    portalA = app.jwt.sign({ sub: 'client-a', kind: 'portal-cliente' })
    portalB = app.jwt.sign({ sub: 'client-b', kind: 'portal-cliente' })
    staff = app.jwt.sign({ sub: 'consultor-christian', kind: 'internal', username: 'christian' })
  })
  afterEach(async () => {
    await app?.close()
    if (previousDirectory === undefined) delete process.env.ALETIS_PORTAL_UPLOAD_DIR
    else process.env.ALETIS_PORTAL_UPLOAD_DIR = previousDirectory
    if (directory) await rm(directory, { recursive: true, force: true })
  })
  const authorization = (token: string) => ({ authorization: `Bearer ${token}` })
  const jsonUpload = () => ({ nome: 'documento.pdf', conteudoBase64: pdf.toString('base64'), pendenciaId: 'request-a' })
  const seedFile = async (id: string, clienteId: string, overrides: any = {}) => {
    const value = { id, clienteId, nomeOriginal: `${id}.pdf`, nomeStorage: `${id}.bin`, mime: 'application/pdf', tamanho: pdf.length, enviadoPor: 'cliente', enviadoEm: '2026-09-11T12:00:00.000Z', metadata: {}, ...overrides }
    state.files.set(id, value)
    await writeFile(join(directory, `${id}.bin`), pdf)
    return value
  }

  it('JWT de cliente não acessa nenhum endpoint da equipe, sem depender do guard global', async () => {
    const targets = [
      ['GET', '/api/clientes/client-a/portal/pendencias'], ['POST', '/api/clientes/client-a/portal/pendencias'],
      ['PATCH', '/api/clientes/client-a/portal/pendencias/request-a'], ['DELETE', '/api/clientes/client-a/portal/pendencias/request-a'],
      ['GET', '/api/clientes/client-a/portal/uploads'], ['GET', '/api/clientes/client-a/portal/uploads/file-a/analysis'],
      ['POST', '/api/clientes/client-a/portal/uploads/file-a/reprocessar'], ['POST', '/api/clientes/client-a/portal/andamentos'],
      ['PATCH', '/api/clientes/client-a/portal/uploads/file-a/compartilhar'],
    ] as const
    for (const [method, url] of targets) expect((await app.inject({ method, url, headers: authorization(portalA) })).statusCode).toBe(401)
    expect(state.access).not.toHaveBeenCalled(); expect(state.receive).not.toHaveBeenCalled(); expect(state.retry).not.toHaveBeenCalled(); expect(state.publish).not.toHaveBeenCalled()
    expect((await app.inject({ url: '/api/portal/uploads' })).statusCode).toBe(401)
    expect((await app.inject({ url: '/api/portal/uploads', headers: authorization(staff) })).statusCode).toBe(401)
  })
  it('equipe usa identidade verificada e respeita controle de acesso do cliente', async () => {
    expect((await app.inject({ url: '/api/clientes/client-a/portal/pendencias', headers: authorization(staff) })).statusCode).toBe(200)
    expect(state.access).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 'client-a', action: 'document:read', actor: expect.objectContaining({ id: 'consultor-christian' }) }))
    const forged = app.jwt.sign({ sub: 'client-a', kind: 'internal', username: 'christian' })
    expect((await app.inject({ url: '/api/clientes/client-a/portal/pendencias', headers: authorization(forged) })).statusCode).toBe(401)
    state.access.mockRejectedValueOnce(Object.assign(new Error('Fora da carteira'), { statusCode: 403 }))
    expect((await app.inject({ url: '/api/clientes/client-b/portal/uploads/file-b/analysis', headers: authorization(staff) })).statusCode).toBe(403)
    expect(state.analysis).not.toHaveBeenCalled()
  })
  it('cliente A não vincula arquivo à solicitação B nem baixa arquivo B', async () => {
    await seedFile('file-b', 'client-b')
    const requests = await app.inject({ url: '/api/portal/pendencias', headers: authorization(portalA) })
    expect(requests.json().data.map((item: any) => item.id)).toEqual(['request-a'])
    expect((await app.inject({ url: '/api/portal/uploads/file-b', headers: authorization(portalA) })).statusCode).toBe(404)
    const upload = await app.inject({ method: 'POST', url: '/api/portal/upload', headers: authorization(portalA), payload: { ...jsonUpload(), pendenciaId: 'request-b' } })
    expect(upload.statusCode).toBe(404); expect(state.receive).not.toHaveBeenCalled()
    expect(await readdir(directory)).toEqual(['file-b.bin'])
    expect((await app.inject({ url: '/api/portal/uploads/file-b', headers: authorization(portalB) })).statusCode).toBe(200)
  })
  it('download da equipe exige sessão interna, carteira autorizada e arquivo do cliente informado', async () => {
    await seedFile('file-a', 'client-a')
    await seedFile('file-b', 'client-b')
    const url = '/api/clientes/client-a/portal/uploads/file-a/download'
    expect((await app.inject({ url })).statusCode).toBe(401)
    expect((await app.inject({ url, headers: authorization(portalA) })).statusCode).toBe(401)
    state.access.mockRejectedValueOnce(Object.assign(new Error('Fora da carteira'), { statusCode: 403 }))
    expect((await app.inject({ url, headers: authorization(staff) })).statusCode).toBe(403)
    const allowed = await app.inject({ url, headers: authorization(staff) })
    expect(allowed.statusCode).toBe(200); expect(allowed.rawPayload).toEqual(pdf)
    expect(allowed.headers['cache-control']).toBe('private, no-store')
    expect((await app.inject({ url: '/api/clientes/client-a/portal/uploads/file-b/download', headers: authorization(staff) })).statusCode).toBe(404)
    await seedFile('invalid-path', 'client-a', { nomeStorage: '../outside-fixture' })
    expect((await app.inject({ url: '/api/clientes/client-a/portal/uploads/invalid-path/download', headers: authorization(staff) })).statusCode).toBe(410)
  })
  it('portal vê arquivos próprios e compartilhados, sem caminhos, hashes, prompts ou revisor interno', async () => {
    await seedFile('own', 'client-a', { sha256: 'PRIVATE_HASH', metadata: { resumoIa: 'PRIVATE_SUMMARY', processing: { analysis: { status: 'completed', prompt: 'PRIVATE_PROMPT' }, drive: { status: 'archived', fileId: 'PRIVATE_DRIVE_ID' } }, review: { status: 'rejeitado', observacao: 'Envie o verso.', revisadoEm: '2026-09-11T12:00:00.000Z', revisadoPor: 'PRIVATE_REVIEWER' } } })
    await seedFile('hidden', 'client-a', { enviadoPor: 'consultor' })
    await seedFile('shared', 'client-a', { enviadoPor: 'consultor', metadata: { portalCompartilhado: true } })
    await seedFile('file-b', 'client-b')
    const response = await app.inject({ url: '/api/portal/uploads', headers: authorization(portalA) })
    expect(response.json().data.map((item: any) => item.id)).toEqual(['own', 'shared'])
    expect(response.body).not.toMatch(/PRIVATE_|nomeStorage|sha256|metadata|file-b|hidden|\.bin/)
    expect(response.json().data[0].review).toEqual({ status: 'rejeitado', observacao: 'Envie o verso.', revisadoEm: '2026-09-11T12:00:00.000Z' })
    expect((await app.inject({ url: '/api/portal/uploads/hidden', headers: authorization(portalA) })).statusCode).toBe(404)
    const download = await app.inject({ url: '/api/portal/uploads/shared', headers: authorization(portalA) })
    expect(download.statusCode).toBe(200); expect(download.rawPayload).toEqual(pdf)
    expect(download.headers['content-disposition']).toContain('attachment;')
    expect(download.headers['content-security-policy']).toBe('sandbox')
    expect(download.headers['x-content-type-options']).toBe('nosniff')
  })
  it('multipart real rejeita PDF falso antes de gravar ou agendar análise', async () => {
    const body = multipartBody([{ name: 'arquivo', filename: 'documento.pdf', mime: 'application/pdf', buffer: Buffer.from('<html>arquivo falso</html>') }])
    const response = await app.inject({ method: 'POST', url: '/api/portal/upload', headers: { ...authorization(portalA), 'content-type': body.contentType }, payload: body.payload })
    expect(response.statusCode).toBe(415); expect(state.receive).not.toHaveBeenCalled(); expect(state.accepted).toBe(0)
    expect(await readdir(directory)).toEqual([])
  })
  it('multipart lê campos posteriores ao arquivo e usa ID gerado sem confiar no nome ou mime do cliente', async () => {
    const body = multipartBody([{ name: 'arquivo', filename: '../../documento.pdf', mime: 'text/html', buffer: pdf }, { name: 'pendenciaId', value: 'request-a' }, { name: 'categoria', value: 'identidade' }])
    const response = await app.inject({ method: 'POST', url: '/api/portal/upload', headers: { ...authorization(portalA), 'content-type': body.contentType }, payload: body.payload })
    expect(response.statusCode).toBe(201)
    const record = state.receive.mock.calls[0][0]
    expect(record).toMatchObject({ clienteId: 'client-a', pendenciaId: 'request-a', mime: 'application/pdf', nomeOriginal: 'documento.pdf' })
    expect(record.nomeStorage).toBe(`${record.id}.bin`); expect(record.id).toMatch(/^up-/)
    expect(await readFile(join(directory, record.nomeStorage))).toEqual(pdf)
    expect(response.body).not.toMatch(/PRIVATE_|nomeStorage|\.bin/)
  })
  it('retry mantém apenas o original no disco, preserva ID e não substitui seu conteúdo', async () => {
    const headers = { ...authorization(portalA), 'idempotency-key': 'stable-upload-test' }
    const first = await app.inject({ method: 'POST', url: '/api/portal/upload', headers, payload: jsonUpload() })
    const firstId = first.json().data.id
    const firstPath = join(directory, `${firstId}.bin`)
    const before = await stat(firstPath)
    const second = await app.inject({ method: 'POST', url: '/api/portal/upload', headers, payload: jsonUpload() })
    expect(first.statusCode).toBe(201); expect(second.statusCode).toBe(200)
    expect(second.json().data).toMatchObject({ id: firstId, replayed: true })
    expect(state.accepted).toBe(1); expect(await readdir(directory)).toEqual([`${firstId}.bin`])
    expect((await stat(firstPath)).mtimeMs).toBe(before.mtimeMs)
    expect(await readFile(firstPath)).toEqual(pdf)
  })
  it('erro antes da confirmação remove temporário e resposta ambígua após COMMIT preserva o arquivo', async () => {
    state.receive.mockRejectedValueOnce(new Error('Falha antes da transação'))
    expect((await app.inject({ method: 'POST', url: '/api/portal/upload', headers: authorization(portalA), payload: jsonUpload() })).statusCode).toBe(500)
    expect(await readdir(directory)).toEqual([])
    state.receive.mockImplementationOnce(async (data: any) => { state.files.set(data.id, { ...data, metadata: {} }); throw new Error('Conexão perdida após COMMIT') })
    expect((await app.inject({ method: 'POST', url: '/api/portal/upload', headers: authorization(portalA), payload: jsonUpload() })).statusCode).toBe(500)
    expect(await readdir(directory)).toHaveLength(1)
  })
  it('base64 inválido, campo repetido ou metadados injetados não chegam ao recebimento', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/portal/upload', headers: authorization(portalA), payload: { ...jsonUpload(), conteudoBase64: '%%%' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/portal/upload', headers: authorization(portalA), payload: { ...jsonUpload(), clienteId: 'client-b', metadata: { portalCompartilhado: true } } })).statusCode).toBe(400)
    const body = multipartBody([{ name: 'arquivo', filename: 'documento.pdf', buffer: pdf }, { name: 'pendenciaId', value: 'request-a' }, { name: 'pendenciaId', value: 'request-b' }])
    expect((await app.inject({ method: 'POST', url: '/api/portal/upload', headers: { ...authorization(portalA), 'content-type': body.contentType }, payload: body.payload })).statusCode).toBe(400)
    expect(state.receive).not.toHaveBeenCalled(); expect(await readdir(directory)).toEqual([])
  })
  it('referência de armazenamento fora do diretório não permite download', async () => {
    await seedFile('outside', 'client-a', { nomeStorage: '../PRIVATE_OUTSIDE.pdf' })
    expect((await app.inject({ url: '/api/portal/uploads/outside', headers: authorization(portalA) })).statusCode).toBe(410)
  })
  it('base64 válido de 5 MiB e de 20 MiB não estoura a pilha do validador', () => {
    for (const size of [5 * 1024 * 1024, PORTAL_UPLOAD_MAX_BYTES]) {
      const encoded = Buffer.alloc(size, 65).toString('base64')
      const decoded = decodePortalBase64(encoded)
      expect(decoded.length).toBe(size)
      expect(decoded[0]).toBe(65); expect(decoded.at(-1)).toBe(65)
    }
  })
})
