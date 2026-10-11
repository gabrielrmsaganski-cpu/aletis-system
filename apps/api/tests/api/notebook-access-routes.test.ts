import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'

const fx = vi.hoisted(() => ({
  sessions: new Map<string, any>(), notebooks: new Map<string, any>(), databaseError: false,
  access: vi.fn(), get: vi.fn(), list: vi.fn(), create: vi.fn(), addSources: vi.fn(), addNote: vi.fn(), sourceMap: vi.fn(), updateSourceScope: vi.fn(), addComment: vi.fn(), updateComment: vi.fn(), getArtifact: vi.fn(), listArtifactVersions: vi.fn(), compareArtifacts: vi.fn(), updateArtifact: vi.fn(), convertArtifact: vi.fn(), updateAction: vi.fn(), search: vi.fn(), ask: vi.fn(), synthesize: vi.fn(), export: vi.fn(), render: vi.fn(), logs: [] as string[],
}))
vi.mock('../../src/db/AlixSessionRepository.js', () => ({ getSessionAccess: fx.access, getSessionsAccess: async (ids: string[]) => (await Promise.all(ids.map(id => fx.access(id)))).filter(Boolean) }))
vi.mock('../../src/db/ClienteRepository.js', () => ({ resolveClienteId: async (id: string) => id === 'old-client-a' ? 'client-a' : id }))
vi.mock('../../src/services/alix/notebook/AlixNotebookService.js', () => ({ getAlixNotebookService: () => fx }))
vi.mock('../../src/services/alix/notebook/AlixNotebookExportService.js', () => ({ exportNotebookArtifact: fx.export }))
vi.mock('../../src/services/alix/notebook/AlixNotebookHtmlRenderer.js', () => ({ renderNotebookArtifactHtml: fx.render }))
import routes from '../../src/routes/alix-notebooks.js'

const base = '/api/alix/notebooks'
let app: FastifyInstance, regis: string, eliandra: string, admin: string
const reference = (sessionId: string) => ({ sessionId, documentId: `doc-${sessionId}`, filename: `Fonte ${sessionId}`, addedAt: '2026-09-13T00:00:00Z' })
const notebook = (id: string, sessionId?: string, sources: any[] = []) => ({ id, title: `Caso ${id}`, sessionId, clienteId: sessionId === 'session-own' ? 'client-a' : sessionId === 'session-other' ? 'client-b' : undefined, sources, notes: [], artifacts: [{ id: `artifact-${id}` }], sourceScope: {}, comments: [], actions: [], createdAt: '2026-09-13T00:00:00Z', updatedAt: '2026-09-13T00:00:00Z' })

beforeEach(async () => {
  vi.clearAllMocks(); fx.sessions.clear(); fx.notebooks.clear(); fx.databaseError = false; fx.logs = []
  vi.stubEnv('ALETIS_INTERNAL_AUTH_ENABLED', '1'); vi.stubEnv('ALIX_AUTH_STRICT', 'false'); vi.stubEnv('ALIX_ADMIN_USER_IDS', 'consultor-christian'); vi.stubEnv('ALIX_LEGACY_SHARED_SESSION_IDS', '')
  vi.stubGlobal('fetch', () => { throw new Error('Rede proibida nesta suíte') })
  fx.sessions.set('session-own', { id: 'session-own', consultorId: 'consultor-regis', clienteId: 'client-a' })
  fx.sessions.set('session-other', { id: 'session-other', consultorId: 'consultora-eliandra', clienteId: 'client-b' })
  fx.sessions.set('session-legacy', { id: 'session-legacy' })
  fx.notebooks.set('own', notebook('own', 'session-own', [reference('session-own')]))
  fx.notebooks.set('other', notebook('other', 'session-other', [reference('session-other')]))
  fx.notebooks.set('no-session', notebook('no-session'))
  fx.notebooks.set('legacy', notebook('legacy', 'session-legacy'))
  fx.notebooks.set('mixed', notebook('mixed', 'session-own', [reference('session-other')]))
  fx.access.mockImplementation(async id => { if (fx.databaseError) throw new Error('postgresql://private-user:private-token@db /root/private.sql'); return fx.sessions.get(id) || null })
  fx.get.mockImplementation(async id => fx.notebooks.get(id) || null)
  fx.list.mockImplementation(async () => [...fx.notebooks.values()])
  fx.create.mockImplementation(async input => ({ ...input, id: 'new' }))
  fx.getArtifact.mockImplementation(async (id, artifactId) => { const notebook = fx.notebooks.get(id); const artifact = notebook?.artifacts.find((item: any) => item.id === artifactId); return artifact ? { notebook, artifact } : null })
  for (const method of [fx.addSources, fx.addNote, fx.sourceMap, fx.updateSourceScope, fx.addComment, fx.updateComment, fx.listArtifactVersions, fx.compareArtifacts, fx.updateArtifact, fx.convertArtifact, fx.updateAction, fx.ask, fx.synthesize]) method.mockResolvedValue({ ok: true })
  fx.search.mockResolvedValue([])
  fx.export.mockResolvedValue({ buffer: Buffer.from('%PDF-fixture'), filename: 'fixture.pdf', mimetype: 'application/pdf' })
  fx.render.mockReturnValue({ html: '<html>Fixture</html>', filename: 'fixture.html' })
  app = Fastify({ logger: { level: 'error', stream: { write: (line: string) => { fx.logs.push(line) } } } })
  await app.register(jwt, { secret: 'isolated-notebook-auth-fixture-secret' }); await app.register(cookie); await app.register(routes); await app.ready()
  const token = (username: string, sub: string) => `aletis_session=${app.jwt.sign({ username, sub, kind: 'internal' })}`
  regis = token('regis', 'consultor-regis'); eliandra = token('eliandra', 'consultora-eliandra'); admin = token('christian', 'consultor-christian')
})
afterEach(async () => { await app.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('Notebook aplica o acesso da sessão a todas as operações e fontes', () => {
  it('rejeita anônimo e token inválido antes de acessar o serviço', async () => {
    for (const headers of [{}, { authorization: 'Bearer invalid' }, { 'x-user-id': 'consultor-christian', 'x-aletis-role': 'admin_master' }]) {
      expect((await app.inject({ url: base, headers })).statusCode).toBe(401)
    }
    expect(fx.list).not.toHaveBeenCalled(); expect(fx.get).not.toHaveBeenCalled()
  })
  it('lista somente casos e fontes autorizados, com contagem filtrada e sem cache', async () => {
    const first = await app.inject({ url: base, headers: { cookie: regis, 'x-aletis-role': 'admin_master' } })
    expect(first.statusCode).toBe(200); expect(first.headers['cache-control']).toBe('private, no-store')
    expect(first.json().data.notebooks.map((item: any) => item.id)).toEqual(['own']); expect(first.json().data.total).toBe(1)
    expect(first.body).not.toMatch(/Caso other|Caso mixed|Fonte session-other/)
    const second = await app.inject({ url: base, headers: { cookie: eliandra } })
    expect(second.json().data.notebooks.map((item: any) => item.id)).toEqual(['other'])
    expect(fx.list).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ strict: true, ownerIds: ['consultor-regis'], sharedSessionIds: [] }))
  })
  it.each([
    ['GET', '', undefined], ['GET', '/source-map', undefined], ['PATCH', '/source-scope', { includeCrm: true }],
    ['POST', '/sources', { sources: [] }], ['POST', '/notes', { text: 'Nota' }], ['POST', '/search', { query: 'Buscar' }],
    ['POST', '/ask', { question: 'Conferir' }], ['POST', '/generate', { kind: 'parecer' }],
    ['POST', '/comments', { text: 'Comentário' }], ['PATCH', '/comments/comment-other', { status: 'resolved' }],
    ['GET', '/artifacts/artifact-other/html', undefined], ['GET', '/artifacts/artifact-other/export/pdf', undefined], ['GET', '/artifacts/artifact-other/export/docx', undefined],
    ['GET', '/artifacts/artifact-other/versions', undefined], ['GET', '/artifacts/compare?from=a&to=b', undefined],
    ['POST', '/artifacts/artifact-other/update', {}], ['POST', '/artifacts/artifact-other/convert', { target: 'note' }], ['PATCH', '/actions/action-other', { status: 'done' }],
  ])('trocar o Notebook bloqueia %s %s antes da operação', async (method, suffix, payload) => {
    const response = await app.inject({ method: method as any, url: base + '/other' + suffix, payload, headers: { cookie: regis } })
    expect(response.statusCode).toBe(404); expect(response.body).not.toMatch(/Caso other|Fonte session-other|client-b|artifact-other/)
    expect(fx.get).toHaveBeenCalledWith('other', { strict: true })
    for (const action of [fx.addSources, fx.addNote, fx.sourceMap, fx.updateSourceScope, fx.addComment, fx.updateComment, fx.listArtifactVersions, fx.compareArtifacts, fx.updateArtifact, fx.convertArtifact, fx.updateAction, fx.search, fx.ask, fx.synthesize, fx.export, fx.render, fx.getArtifact]) expect(action).not.toHaveBeenCalled()
  })
  it('preserva leitura, escrita e exportação da própria sessão; artefato alheio não é encontrado', async () => {
    expect((await app.inject({ url: base + '/own', headers: { cookie: regis } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: base + '/own/notes', payload: { text: 'Conferir' }, headers: { cookie: regis } })).statusCode).toBe(200)
    expect((await app.inject({ url: base + '/own/artifacts/artifact-own/export/pdf', headers: { cookie: regis } })).statusCode).toBe(200)
    expect((await app.inject({ url: base + '/own/artifacts/artifact-other/export/pdf', headers: { cookie: regis } })).statusCode).toBe(404)
    expect(fx.export).toHaveBeenCalledTimes(1)
  })
  it('nega sessão estrangeira em filtros, criação e inclusão de fontes antes do serviço', async () => {
    expect((await app.inject({ url: base + '?sessionId=session-other', headers: { cookie: regis } })).statusCode).toBe(404)
    for (const payload of [{ title: 'Novo', sessionId: 'session-other' }, { title: 'Novo', sessionId: 'session-own', sources: [reference('session-other')] }]) {
      expect((await app.inject({ method: 'POST', url: base, payload, headers: { cookie: regis } })).statusCode).toBe(404)
    }
    expect((await app.inject({ method: 'POST', url: base + '/own/sources', payload: { sources: [reference('session-other')] }, headers: { cookie: regis } })).statusCode).toBe(404)
    expect(fx.list).not.toHaveBeenCalled(); expect(fx.create).not.toHaveBeenCalled(); expect(fx.addSources).not.toHaveBeenCalled()
  })
  it('não atribui proprietário a Notebook sem sessão e conserva política de legados compartilhados', async () => {
    expect((await app.inject({ method: 'POST', url: base, payload: { title: 'Sem sessão' }, headers: { cookie: regis } })).statusCode).toBe(400)
    expect((await app.inject({ url: base + '/no-session', headers: { cookie: regis } })).statusCode).toBe(404)
    expect((await app.inject({ url: base + '/legacy', headers: { cookie: regis } })).statusCode).toBe(404)
    vi.stubEnv('ALIX_LEGACY_SHARED_SESSION_IDS', 'session-legacy')
    expect((await app.inject({ url: base + '/legacy', headers: { cookie: regis } })).statusCode).toBe(200)
    expect((await app.inject({ url: base + '/no-session', headers: { cookie: admin } })).statusCode).toBe(200)
    expect(fx.create).not.toHaveBeenCalled()
  })
  it('revalida revogação de dono e fontes em leituras posteriores', async () => {
    expect((await app.inject({ url: base + '/own', headers: { cookie: regis } })).statusCode).toBe(200)
    fx.sessions.get('session-own').consultorId = 'consultora-eliandra'
    expect((await app.inject({ url: base + '/own', headers: { cookie: regis } })).statusCode).toBe(404)
    expect((await app.inject({ url: base + '/mixed', headers: { cookie: regis } })).statusCode).toBe(404)
  })
  it('recusa cliente divergente e mantém alias canônico da sessão', async () => {
    expect((await app.inject({ method: 'POST', url: base, payload: { title: 'Novo', sessionId: 'session-own', clienteId: 'client-b' }, headers: { cookie: regis } })).statusCode).toBe(404)
    expect(fx.create).not.toHaveBeenCalled()
    fx.sessions.get('session-own').clienteId = 'old-client-a'
    const created = await app.inject({ method: 'POST', url: base, payload: { title: 'Novo', sessionId: 'session-own', clienteId: 'client-a', consultorId: 'consultora-eliandra' }, headers: { cookie: regis } })
    expect(created.statusCode).toBe(201)
    expect(fx.create).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-own', clienteId: 'client-a' }))
    expect(fx.create.mock.calls[0][0]).not.toHaveProperty('consultorId')
  })
  it('comentários usam ator verificado e ignoram identidade enviada', async () => {
    await app.inject({ method: 'POST', url: base + '/own/comments', payload: { text: 'Conferir', authorId: 'consultora-eliandra' }, headers: { cookie: regis } })
    expect(fx.addComment).toHaveBeenCalledWith('own', expect.objectContaining({ authorId: 'consultor-regis' }))
    await app.inject({ method: 'PATCH', url: base + '/own/comments/comment-own', payload: { status: 'resolved', actorId: 'consultora-eliandra' }, headers: { cookie: regis } })
    expect(fx.updateComment).toHaveBeenCalledWith('own', 'comment-own', 'resolved', 'consultor-regis')
  })
  it('falha da autoridade fecha lista e exportação sem expor detalhe sensível na resposta ou log', async () => {
    fx.databaseError = true
    for (const url of [base, base + '/own/artifacts/artifact-own/export/pdf']) {
      const response = await app.inject({ url, headers: { cookie: regis } })
      expect(response.statusCode).toBe(503); expect(response.body).not.toMatch(/private-token|private-user|postgresql|\/root\/private/)
    }
    expect(fx.logs.join('')).not.toMatch(/private-token|private-user|postgresql|\/root\/private/)
    expect(fx.export).not.toHaveBeenCalled()
  })
})
