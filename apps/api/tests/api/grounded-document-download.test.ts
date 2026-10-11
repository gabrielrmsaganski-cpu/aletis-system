import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { GeneratedDocument } from '../../src/services/alix/generators/types.js'

const deps = vi.hoisted(() => ({ meta: vi.fn(), session: vi.fn() }))
vi.mock('../../src/services/alix/generators/DocumentGeneratorService.js', () => ({ loadGeneratedDocumentMeta: deps.meta }))
vi.mock('../../src/services/alix/AlixAccessService.js', () => ({ assertAlixSessionAccess: deps.session }))
vi.mock('../../src/middleware/alixAuth.js', () => ({
  applyAlixAuth(app: FastifyInstance) {
    app.addHook('onRequest', async (request, reply) => {
      if (!request.headers['x-fixture-user']) return reply.status(401).send({ error: 'Autenticação necessária' })
      request.alixUser = { id: String(request.headers['x-fixture-user']), sub: String(request.headers['x-fixture-user']), nome: 'Fixture' }
    })
  },
}))
import routes from '../../src/routes/alix-generators.js'

describe('Download de documento fundamentado', () => {
  let app: FastifyInstance
  let dir: string
  let meta: GeneratedDocument
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'alix-grounded-access-'))
    const path = join(dir, 'parecer.docx')
    await writeFile(path, 'artifact-fixture')
    meta = { id: 'doc-fixture', kind: 'docx', filename: 'parecer.docx', sizeBytes: 16, createdAt: '2026-09-07T00:00:00Z', path, downloadUrl: '/api/alix/documents/generated/doc-fixture', mimetype: 'application/docx', clienteId: 'cli-fixture', metadata: { tipo: 'documento-fundamentado', sessionId: 'sess-owner', status: 'rascunho' } }
    deps.meta.mockImplementation(async () => meta)
    deps.session.mockImplementation(async (user, sessionId) => {
      if (user?.id !== 'owner' || sessionId !== 'sess-owner') throw Object.assign(new Error('Indisponível'), { statusCode: 404 })
      return { id: sessionId, consultorId: 'owner' }
    })
    app = Fastify(); await app.register(routes)
  })
  afterEach(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); vi.clearAllMocks() })

  it('exige autenticação antes de ler arquivo/metadados', async () => {
    expect((await app.inject('/api/alix/documents/generated/doc-fixture')).statusCode).toBe(401)
    expect((await app.inject('/api/alix/documents/generated/doc-fixture/meta')).statusCode).toBe(401)
    expect(deps.meta).not.toHaveBeenCalled()
  })
  it.each(['', '/meta'])('nega acesso de outro usuário à rota %s', async suffix => {
    const result = await app.inject({ url: `/api/alix/documents/generated/doc-fixture${suffix}`, headers: { 'x-fixture-user': 'other' } })
    expect(result.statusCode).toBe(404)
    expect(result.body).not.toContain('artifact-fixture')
    expect(result.body).not.toContain(dir)
  })
  it('entrega arquivo somente após verificar sessão proprietária', async () => {
    const result = await app.inject({ url: '/api/alix/documents/generated/doc-fixture', headers: { 'x-fixture-user': 'owner' } })
    expect(result.statusCode).toBe(200)
    expect(result.body).toBe('artifact-fixture')
    expect(result.headers['cache-control']).toContain('no-store')
    expect(deps.session).toHaveBeenCalledWith(expect.objectContaining({ id: 'owner' }), 'sess-owner')
  })
  it('remove caminho absoluto dos metadados públicos', async () => {
    const result = await app.inject({ url: '/api/alix/documents/generated/doc-fixture/meta', headers: { 'x-fixture-user': 'owner' } })
    expect(result.statusCode).toBe(200)
    expect(result.json().data.path).toBeUndefined()
    expect(result.json().data.metadata.status).toBe('rascunho')
    expect(result.body).not.toContain(dir)
  })
  it('artefato novo sem sessão falha fechado', async () => {
    delete meta.metadata.sessionId
    const result = await app.inject({ url: '/api/alix/documents/generated/doc-fixture/meta', headers: { 'x-fixture-user': 'owner' } })
    expect(result.statusCode).toBe(404)
  })
  it('indisponibilidade da autorização não libera arquivo', async () => {
    deps.session.mockRejectedValue(new Error('Database unavailable'))
    const result = await app.inject({ url: '/api/alix/documents/generated/doc-fixture', headers: { 'x-fixture-user': 'owner' } })
    expect(result.statusCode).toBe(503)
    expect(result.body).not.toContain('Database unavailable')
  })
})
