import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
const mocks = vi.hoisted(() => ({ run: vi.fn(), get: vi.fn(), list: vi.fn() }))
vi.mock('../../src/routes/clientes.js', () => ({ clientes: new Map([['client-test', { id: 'client-test', nome: 'Cliente sintético' }]]) }))
vi.mock('../../src/services/google-workspace/DriveImportBatchService.js', () => ({ getDriveImportBatchService: () => mocks, DriveImportBatchError: class extends Error {} }))
import routes from '../../src/routes/google-workspace.js'
let app: ReturnType<typeof Fastify>
let headers: Record<string, string>
const importUrl = '/api/integrations/google/drive/client/client-test/import'
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubEnv('ALETIS_PG_ENABLED', '0'); vi.stubEnv('ALETIS_RBAC_STRICT', 'false')
  mocks.run.mockResolvedValue({ status: 'completed', meta: { imported: 1 }, results: [] })
  mocks.get.mockResolvedValue(null); mocks.list.mockResolvedValue([])
  app = Fastify(); await app.register(cookie); await app.register(jwt, { secret: 'synthetic-test-secret-no-live-credentials' }); await app.register(routes)
  headers = { cookie: `aletis_session=${app.jwt.sign({ kind: 'internal', username: 'christian', sub: 'consultor-christian' })}` }
})
afterEach(async () => { await app.close(); vi.unstubAllEnvs() })
it('encaminha chave e identidade validada, ignorando headers de proprietário', async () => {
  const requestId = randomUUID()
  expect((await app.inject({ method: 'POST', url: importUrl, headers: { ...headers, 'x-user-id': 'forged' }, payload: { requestId, fileIds: ['file-a'] } })).statusCode).toBe(200)
  expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ requestId, clientId: 'client-test', actor: expect.objectContaining({ userId: 'consultor-christian' }), signal: expect.any(AbortSignal) }))
})
it('recibo incompleto responde 202 e pode ser reconsultado', async () => {
  mocks.run.mockResolvedValue({ status: 'paused', results: [], meta: { imported: 0, remaining: 1 } })
  const requestId = randomUUID()
  expect((await app.inject({ method: 'POST', url: importUrl, headers, payload: { requestId, fileIds: ['file-a'] } })).statusCode).toBe(202)
  expect((await app.inject({ url: `${importUrl}-batches/${requestId}`, headers })).statusCode).toBe(404)
  expect(mocks.get).toHaveBeenCalledWith(expect.objectContaining({ userId: 'consultor-christian' }), 'client-test', requestId)
})
it('rejeita chave ausente, arquivos inválidos e requisição sem sessão interna', async () => {
  for (const fileIds of [[], ['bad'], Array.from({ length: 21 }, (_, index) => `file-${index}`)]) {
    expect((await app.inject({ method: 'POST', url: importUrl, headers, payload: { requestId: randomUUID(), fileIds } })).statusCode).toBe(400)
  }
  expect((await app.inject({ method: 'POST', url: importUrl, headers, payload: { fileIds: ['file-a'] } })).statusCode).toBe(400)
  expect((await app.inject({ method: 'POST', url: importUrl, payload: { requestId: randomUUID(), fileIds: ['file-a'] } })).statusCode).toBe(401)
  expect(mocks.run).not.toHaveBeenCalled()
})
