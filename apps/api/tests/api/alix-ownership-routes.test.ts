import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const sessions = new Map<string, any>()
  const missions = new Map<string, any>()
  const pending = new Map<string, any>()
  const batches = new Map<string, any>()
  const receipts = new Map<string, any>()
  const executor = vi.fn(async () => ({ ok: true, id: 'effect-fixture' }))
  const alix = { listSessions: vi.fn(), getSession: vi.fn(), createSession: vi.fn(), updateSession: vi.fn(), deleteSession: vi.fn(), chat: vi.fn(), setWebSearchProvider: vi.fn(), getExecutor: vi.fn(() => executor) }
  const missionService = { get: vi.fn(), list: vi.fn(), stats: vi.fn(), create: vi.fn(), cancel: vi.fn(), resume: vi.fn() }
  const store = { get: vi.fn(), getBatch: vi.fn(), getExecution: vi.fn(), listActive: vi.fn(), listBatches: vi.fn(), authorize: vi.fn(), executeOnce: vi.fn(), consume: vi.fn(), authorizeBatch: vi.fn(), applyBatch: vi.fn(), cancelBatch: vi.fn(), on: vi.fn(() => () => undefined) }
  return { sessions, missions, pending, batches, receipts, alix, missionService, store, executor, access: vi.fn() }
})
vi.mock('../../src/db/AlixSessionRepository.js', () => ({ getSessionAccess: mocks.access, getSessionsAccess: async (ids: string[]) => (await Promise.all(ids.map(id => mocks.access(id)))).filter(Boolean) }))
vi.mock('../../src/services/AlixService.js', () => ({
  AlixService: class { constructor() { Object.assign(this, mocks.alix) } },
  registerStores: vi.fn(), registerCrmWriteBackends: vi.fn(),
}))
vi.mock('../../src/services/DataSourceManager.js', () => ({ DataSourceManager: { getInstance: () => ({}) } }))
vi.mock('../../src/services/alix/OrchestratorService.js', () => ({ OrchestratorService: { create: vi.fn() } }))
vi.mock('../../src/services/alix/tools/websearch/WebSearchProviderFactory.js', () => ({ WebSearchProviderFactory: { warmUp: async () => ({ name: 'fixture' }) } }))
vi.mock('../../src/services/prospeccao/ProspeccaoService.js', () => ({ getProspeccaoService: () => ({}) }))
vi.mock('../../src/routes/clientes.js', () => ({ clientes: new Map() }))
vi.mock('../../src/routes/propostas.js', () => ({ propostas: new Map(), propostasInteligentes: new Map() }))
vi.mock('../../src/db/ClienteRepository.js', () => ({ deleteCliente: vi.fn(), upsertClienteStrict: vi.fn() }))
vi.mock('../../src/db/PropostaRepository.js', () => ({ upsertProposta: vi.fn() }))
vi.mock('../../src/services/alix/workspace/AlixMissionService.js', () => ({ getAlixMissionService: () => mocks.missionService, ALIX_WORK_MODES: ['client_analysis', 'documentary', 'negotiation', 'research', 'document_generation', 'due_diligence'] }))
vi.mock('../../src/services/alix/AlixConfirmationStore.js', () => ({ getAlixConfirmationStore: () => mocks.store }))
vi.mock('../../src/services/alix/governance/AlixGovernanceService.js', () => ({ getAlixGovernanceService: () => ({ recordApproval: vi.fn(async () => undefined) }) }))
vi.mock('../../src/services/alix/AlixAuditTrailService.js', () => ({ getAlixAuditTrailService: () => ({ getTrail: () => null }) }))
import alixRoutes from '../../src/routes/alix.js'
import missionRoutes from '../../src/routes/alix-missions.js'
import confirmationRoutes from '../../src/routes/alix-confirmations.js'

const servers: ReturnType<typeof Fastify>[] = []
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('ALETIS_INTERNAL_AUTH_ENABLED', '1')
  vi.stubEnv('ALIX_AUTH_STRICT', 'false')
  vi.stubEnv('ALIX_ADMIN_USER_IDS', '')
  vi.stubEnv('ALIX_LEGACY_SHARED_SESSION_IDS', '')
  vi.stubEnv('ALIX_MULTIAGENT_ENABLED', 'false')
  for (const map of [mocks.sessions, mocks.missions, mocks.pending, mocks.batches, mocks.receipts]) map.clear()
  mocks.sessions.set('own', { id: 'own', consultorId: 'consultor-regis', clienteId: 'cliente-a', messages: [] })
  mocks.sessions.set('other', { id: 'other', consultorId: 'consultora-eliandra', clienteId: 'cliente-b', messages: [] })
  mocks.sessions.set('legacy', { id: 'legacy', messages: [] })
  mocks.access.mockReset().mockImplementation(async id => mocks.sessions.get(id) || null)
  mocks.alix.listSessions.mockImplementation(async () => [...mocks.sessions.values()])
  mocks.alix.getSession.mockImplementation(async id => mocks.sessions.get(id))
  mocks.alix.createSession.mockImplementation(async (title, consultorId) => ({ id: 'new', title, consultorId, messages: [] }))
  mocks.alix.updateSession.mockImplementation(async (id, patch) => Object.assign(mocks.sessions.get(id), patch))
  mocks.alix.deleteSession.mockResolvedValue(true)
  mocks.alix.chat.mockImplementation(async id => ({ session: mocks.sessions.get(id || 'own'), reply: { content: 'fixture' } }))
  mocks.missionService.get.mockImplementation(async id => mocks.missions.get(id))
  mocks.missionService.list.mockImplementation(async opts => [...mocks.missions.values()].filter(mission => !opts.consultorIds || opts.consultorIds.includes(mission.consultorId) || opts.sharedSessionIds?.includes(mission.sessionId)))
  mocks.missionService.stats.mockResolvedValue({ total: 1 })
  mocks.missionService.create.mockImplementation(async input => ({ id: 'new-mission', ...input }))
  mocks.missionService.cancel.mockResolvedValue({ status: 'cancelled' })
  mocks.missionService.resume.mockResolvedValue({ status: 'queued' })
  mocks.store.get.mockImplementation(id => mocks.pending.get(id))
  mocks.store.getBatch.mockImplementation(id => mocks.batches.get(id))
  mocks.store.getExecution.mockImplementation(id => mocks.receipts.get(id))
  mocks.store.listActive.mockImplementation(() => [...mocks.pending.values()])
  mocks.store.listBatches.mockImplementation(() => [...mocks.batches.values()])
  mocks.store.authorize.mockImplementation(id => ({ status: 'ready', confirmation: mocks.pending.get(id) }))
  mocks.store.executeOnce.mockImplementation(async (confirmation, executor) => {
    const receipt = { confirmation, status: 'completed', outcome: 'executed', startedAt: new Date().toISOString(), result: await executor(confirmation.payload) }
    mocks.receipts.set(confirmation.id, receipt)
    return receipt
  })
  mocks.store.consume.mockImplementation(id => { const item = mocks.pending.get(id); mocks.pending.delete(id); return item })
})
afterEach(async () => { await Promise.all(servers.splice(0).map(server => server.close())); vi.unstubAllEnvs() })

async function app(plugin: typeof alixRoutes) {
  const server = Fastify()
  servers.push(server)
  await server.register(jwt, { secret: 'alix-routes-isolated-fixture-secret' })
  await server.register(cookie)
  await server.register(plugin)
  await server.ready()
  const token = server.jwt.sign({ sub: 'consultor-regis', username: 'regis', kind: 'internal' })
  return { server, cookies: { aletis_session: token } }
}
function pending(id: string, sessionId: string, clienteId: string | null) {
  const item = { id, sessionId, contextClienteId: clienteId, payload: { clienteId }, toolName: 'fixture_write', description: 'Efeito isolado', createdAt: Date.now(), expiresAt: Date.now() + 60_000, riskLevel: 'standard', approvalsRequired: 1, approvalStep: 0 }
  mocks.pending.set(id, item)
  return item
}
function batch(id: string, sessionId: string, item: ReturnType<typeof pending>) {
  const value = { batchId: id, sessionId, title: 'Lote de teste', pendings: [item], createdAt: Date.now(), updatedAt: Date.now(), status: 'pending' }
  mocks.batches.set(id, value)
  return value
}

it('lista somente sessões próprias e cria sessão com identidade do cookie, ignorando dono enviado', async () => {
  const { server, cookies } = await app(alixRoutes)
  const list = await server.inject({ url: '/api/alix/sessions', cookies })
  expect(list.json().data.map((item: any) => item.id)).toEqual(['own'])
  const created = await server.inject({ method: 'POST', url: '/api/alix/session', cookies, payload: { title: 'Nova análise', consultorId: 'consultora-eliandra' } })
  expect(created.statusCode).toBe(201)
  expect(mocks.alix.createSession).toHaveBeenCalledWith('Nova análise', 'consultor-regis')
})

it('bloqueia leitura, edição, remoção, chat e trilha de sessão alheia antes de chamar o serviço', async () => {
  const { server, cookies } = await app(alixRoutes)
  for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
    expect((await server.inject({ method, url: '/api/alix/session/other', cookies, ...(method === 'PATCH' ? { payload: { title: 'Alterar' } } : {}) })).statusCode).toBe(404)
  }
  for (const url of ['/api/alix/chat', '/api/alix/chat/stream', '/api/alix/chat/stream-v2']) {
    expect((await server.inject({ method: 'POST', url, cookies, payload: { sessionId: 'other', message: 'Teste' } })).statusCode).toBe(404)
  }
  expect((await server.inject({ url: '/api/alix/telemetry/other', cookies })).statusCode).toBe(404)
  expect(mocks.alix.getSession).not.toHaveBeenCalled()
  expect(mocks.alix.updateSession).not.toHaveBeenCalled()
  expect(mocks.alix.deleteSession).not.toHaveBeenCalled()
  expect(mocks.alix.chat).not.toHaveBeenCalled()
  expect((await server.inject({ url: '/api/alix/session/own', cookies })).statusCode).toBe(200)
})

it('histórico sem dono exige administrador explicitamente permitido', async () => {
  const { server, cookies } = await app(alixRoutes)
  expect((await server.inject({ url: '/api/alix/session/legacy', cookies })).statusCode).toBe(404)
  vi.stubEnv('ALIX_ADMIN_USER_IDS', 'consultor-regis')
  expect((await server.inject({ url: '/api/alix/session/legacy', cookies })).statusCode).toBe(200)
  expect((await server.inject({ url: '/api/alix/sessions', cookies })).json().total).toBe(3)
})

it('allowlist compartilha apenas o histórico nomeado com internos, rotula a resposta e deixa de valer ao atribuir dono', async () => {
  vi.stubEnv('ALIX_LEGACY_SHARED_SESSION_IDS', 'legacy,other')
  const { server, cookies } = await app(alixRoutes)
  const list = (await server.inject({ url: '/api/alix/sessions', cookies })).json().data
  expect(list.map((item: any) => item.id)).toEqual(['own', 'legacy'])
  expect(list.find((item: any) => item.id === 'legacy').legacyShared).toBe(true)
  expect((await server.inject({ url: '/api/alix/session/legacy', cookies })).json().data.legacyShared).toBe(true)
  mocks.sessions.get('legacy').consultorId = 'consultora-eliandra'
  expect((await server.inject({ url: '/api/alix/session/legacy', cookies })).statusCode).toBe(404)
})

it('chat não retoma missão alheia e confirmação textual exige o cliente salvo', async () => {
  const { server, cookies } = await app(alixRoutes)
  mocks.missions.set('foreign', { id: 'foreign', sessionId: 'other', consultorId: 'consultora-eliandra' })
  expect((await server.inject({ method: 'POST', url: '/api/alix/chat', cookies, payload: { sessionId: 'own', missionId: 'foreign', message: 'Continue' } })).statusCode).toBe(404)
  expect((await server.inject({ method: 'POST', url: '/api/alix/chat', cookies, payload: { sessionId: 'own', clienteId: 'cliente-b', message: 'confirmo' } })).statusCode).toBe(409)
  expect(mocks.alix.chat).not.toHaveBeenCalled()
  expect((await server.inject({ method: 'POST', url: '/api/alix/chat', cookies, payload: { sessionId: 'own', message: 'Consulta simples' } })).statusCode).toBe(200)
  expect(mocks.alix.chat).toHaveBeenCalledWith('own', 'Consulta simples', expect.objectContaining({ consultorId: 'consultor-regis' }))
})

it('missões e estatísticas recebem filtro do dono; cancelamento e retomada exigem missão e sessão próprias', async () => {
  const { server, cookies } = await app(missionRoutes)
  mocks.missions.set('mine', { id: 'mine', consultorId: 'consultor-regis', sessionId: 'own' })
  mocks.missions.set('foreign', { id: 'foreign', consultorId: 'consultora-eliandra', sessionId: 'other' })
  expect((await server.inject({ url: '/api/alix/missions', cookies })).json().data.missions.map((item: any) => item.id)).toEqual(['mine'])
  await server.inject({ url: '/api/alix/missions/stats', cookies })
  expect(mocks.missionService.stats).toHaveBeenCalledWith(['consultor-regis'], [])
  for (const action of ['cancel', 'resume']) expect((await server.inject({ method: 'POST', url: `/api/alix/missions/foreign/${action}`, cookies })).statusCode).toBe(404)
  expect(mocks.missionService.cancel).not.toHaveBeenCalled()
  expect(mocks.missionService.resume).not.toHaveBeenCalled()
  expect((await server.inject({ method: 'POST', url: '/api/alix/missions/mine/cancel', cookies })).statusCode).toBe(200)
  expect(mocks.missionService.cancel).toHaveBeenCalledWith('mine', 'consultor-regis')
  expect((await server.inject({ method: 'POST', url: '/api/alix/missions', cookies, payload: { sessionId: 'other', prompt: 'Analisar' } })).statusCode).toBe(404)
  expect(mocks.missionService.create).not.toHaveBeenCalled()
})

it('missões legadas herdam somente sessões compartilhadas autorizadas, inclusive listas e estatísticas', async () => {
  vi.stubEnv('ALIX_LEGACY_SHARED_SESSION_IDS', 'legacy,other')
  const { server, cookies } = await app(missionRoutes)
  mocks.missions.set('historical', { id: 'historical', sessionId: 'legacy' })
  mocks.missions.set('foreign', { id: 'foreign', sessionId: 'other' })
  expect((await server.inject({ url: '/api/alix/missions', cookies })).json().data.missions.map((item: any) => item.id)).toEqual(['historical'])
  await server.inject({ url: '/api/alix/missions/stats', cookies })
  expect(mocks.missionService.stats).toHaveBeenCalledWith(['consultor-regis'], ['legacy'])
  expect((await server.inject({ method: 'POST', url: '/api/alix/missions/historical/resume', cookies })).statusCode).toBe(200)
  expect((await server.inject({ method: 'POST', url: '/api/alix/missions/foreign/resume', cookies })).statusCode).toBe(404)
})

it('pendências e lotes são filtrados; IDs alheios não leem, aprovam, rejeitam ou cancelam', async () => {
  const { server, cookies } = await app(confirmationRoutes)
  const own = pending('mine', 'own', 'cliente-a')
  const other = pending('foreign', 'other', 'cliente-b')
  batch('my-batch', 'own', own); batch('other-batch', 'other', other)
  expect((await server.inject({ url: '/api/alix/confirmations', cookies })).json().data.map((item: any) => item.id)).toEqual(['mine'])
  expect((await server.inject({ url: '/api/alix/confirmations/batches', cookies })).json().data.map((item: any) => item.batchId)).toEqual(['my-batch'])
  expect((await server.inject({ url: '/api/alix/confirmations/foreign', cookies })).statusCode).toBe(404)
  for (const action of ['approve', 'reject']) expect((await server.inject({ method: 'POST', url: `/api/alix/confirmations/foreign/${action}`, cookies })).statusCode).toBe(404)
  for (const action of ['apply', 'cancel']) expect((await server.inject({ method: 'POST', url: `/api/alix/confirmations/batch/other-batch/${action}`, cookies })).statusCode).toBe(404)
  expect(mocks.store.authorize).not.toHaveBeenCalled()
  expect(mocks.store.consume).not.toHaveBeenCalled()
  expect(mocks.store.authorizeBatch).not.toHaveBeenCalled()
  expect(mocks.store.cancelBatch).not.toHaveBeenCalled()
})

it('omitir sessionId no corpo não permite aprovar ação preparada antes de trocar cliente', async () => {
  const { server, cookies } = await app(confirmationRoutes)
  const stale = pending('stale', 'own', 'cliente-anterior')
  batch('stale-batch', 'own', stale)
  expect((await server.inject({ method: 'POST', url: '/api/alix/confirmations/stale/approve', cookies, payload: {} })).statusCode).toBe(409)
  expect((await server.inject({ method: 'POST', url: '/api/alix/confirmations/batch/stale-batch/apply', cookies, payload: {} })).statusCode).toBe(409)
  expect(mocks.store.authorize).not.toHaveBeenCalled()
  expect(mocks.store.authorizeBatch).not.toHaveBeenCalled()
  expect(mocks.executor).not.toHaveBeenCalled()
})

it('confirmações históricas herdam sessão compartilhada sem dispensar checagem do cliente salvo', async () => {
  vi.stubEnv('ALIX_LEGACY_SHARED_SESSION_IDS', 'legacy')
  const { server, cookies } = await app(confirmationRoutes)
  pending('historical', 'legacy', null)
  expect((await server.inject({ url: '/api/alix/confirmations', cookies })).json().data.map((item: any) => item.id)).toEqual(['historical'])
  expect((await server.inject({ method: 'POST', url: '/api/alix/confirmations/historical/approve', cookies, payload: {} })).statusCode).toBe(200)
  pending('stale-historical', 'legacy', 'cliente-antigo')
  expect((await server.inject({ method: 'POST', url: '/api/alix/confirmations/stale-historical/approve', cookies, payload: {} })).statusCode).toBe(409)
})

it('aprovação própria usa contexto salvo, conserva recibo e nunca aceita corpo apontando outra sessão', async () => {
  const { server, cookies } = await app(confirmationRoutes)
  pending('mine', 'own', 'cliente-a')
  expect((await server.inject({ method: 'POST', url: '/api/alix/confirmations/mine/approve', cookies, payload: { sessionId: 'other' } })).statusCode).toBe(409)
  const first = await server.inject({ method: 'POST', url: '/api/alix/confirmations/mine/approve', cookies, payload: {} })
  expect(first.statusCode).toBe(200)
  expect(first.json().data.executed).toBe(true)
  expect(mocks.store.authorize).toHaveBeenCalledWith('mine', expect.objectContaining({ actorId: 'consultor-regis', deferConsumption: true }))
  expect((await server.inject({ method: 'POST', url: '/api/alix/confirmations/mine/approve', cookies, payload: {} })).json().data.replay).toBe(true)
  expect(mocks.executor).toHaveBeenCalledTimes(1)
})

it('falha ao resolver dono não consome confirmação nem executa por fallback', async () => {
  const { server, cookies } = await app(confirmationRoutes)
  pending('mine', 'own', 'cliente-a')
  mocks.access.mockRejectedValueOnce(new Error('Fonte de autorização indisponível'))
  expect((await server.inject({ method: 'POST', url: '/api/alix/confirmations/mine/approve', cookies })).statusCode).toBe(500)
  expect(mocks.store.authorize).not.toHaveBeenCalled()
  expect(mocks.executor).not.toHaveBeenCalled()
})
