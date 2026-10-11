import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'

const fx = vi.hoisted(() => ({ queries: [] as Array<{ sql: string; values: unknown[] }>, acl: vi.fn(), databaseError: false, logs: [] as string[], rows: [] as Array<Record<string, any>> }))
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => true, getPool: () => ({ query: async (sql: string, values: unknown[] = []) => {
  fx.queries.push({ sql, values })
  if (fx.databaseError) throw new Error('postgresql://private-user:private-token@db /root/private/query.sql SELECT confidential_payload')
  if (sql.startsWith('SELECT payload FROM cliente')) return { rows: ['a', 'b'].includes(String(values[0])) ? [{ payload: { id: values[0], consultor: values[0] === 'a' ? 'Regis' : 'Outro' } }] : [] }
  if (!sql.includes('FROM alix_drive_analysis a')) throw new Error('SQL não previsto nesta fixture isolada')
  let index = 1
  let rows = fx.rows.filter(row => row.tenant_id === values[0])
  if (sql.includes('a.cliente_id=ANY(')) { const ids = values[index++] as string[]; rows = rows.filter(row => ids.includes(row.cliente_id)) }
  if (sql.includes('AND a.id=$')) { const id = values[index++]; rows = rows.filter(row => row.id === id) }
  const limit = Number(values[index++]), offset = Number(values[index])
  return { rows: structuredClone(rows.slice(offset, offset + limit)), rowCount: rows.length }
} }) }))
vi.mock('../../src/services/core/AccessControlService.js', () => ({ getAccessControlService: () => ({ canAccessCliente: fx.acl }) }))
vi.mock('../../src/services/google-workspace/gcloudDriveCredentials.js', () => ({ getGcloudDriveCredentials: () => ({ account: () => 'christian@aletis.com.br' }) }))
vi.mock('../../src/services/llm/OpenAIClient.js', () => ({ generateStructured: () => { throw new Error('Modelo proibido nesta suíte') }, isOpenAIEnabled: () => false }))
vi.mock('../../src/services/llm/LLMConfig.js', () => ({ getModelForRole: () => 'fixture-disabled' }))
import routes from '../../src/routes/alix-drive-corpus.js'
import { listDriveCorpusAnalyses } from '../../src/services/alix/intake/DriveCorpusAnalysisService.js'
const endpoint = '/api/alix/drive-corpus/analyses'
const analysisId = 'a'.repeat(64)
let app: FastifyInstance
let owner: string, consultant: string
const candidate = (index: number) => ({ id: index.toString(16).padStart(64, '0'), label: `Informação ${index}`, category: 'other', value: `Valor ${index}`, subject: '', context: '', status: 'pending_review',
  evidence: { chunkId: 'chunk-fixture', quoteHash: 'd'.repeat(64), excerpt: `Fonte sintética Valor ${index}`, excerptHash: 'e'.repeat(64), ordinal: 0, page: 2 } })
const row = (id: string, tenantId: string, clienteId: string) => ({ id, tenant_id: tenantId, file_id: `file-${clienteId}`, cliente_id: clienteId, name: `Documento ${clienteId}`, revision_key: 'revision-fixture', content_hash: 'f'.repeat(64), status: 'review_ready', processed_chunks: 2, total_chunks: 2, available_at: '2026-09-08T00:00:00Z', updated_at: '2026-09-08T01:00:00Z', read_status: 'partial', coverage: { status: 'partial', pendingPages: [3], limitations: ['OCR pendente.', '/root/private/extraction.json'], privatePath: '/root/private' }, error_code: null, job_id: 'internal-job-id', payload: { candidates: Array.from({ length: 6 }, (_, n) => candidate(n + 1)), documentTypes: ['Texto'], rejectedCandidates: 0, privateToken: 'not-public' } })
beforeEach(async () => {
  fx.queries = []; fx.databaseError = false; fx.logs = []; fx.acl.mockReset()
  fx.rows = [row(analysisId, 'tenant-fixture', 'a'), row('b'.repeat(64), 'tenant-fixture', 'b'), row('c'.repeat(64), 'other-tenant', 'a')]
  fx.acl.mockImplementation(async ({ actor, clienteId }) => ({ allowed: actor.id === 'consultor-regis' && clienteId === 'a', source: 'assignment' }))
  vi.stubEnv('ALETIS_INTERNAL_AUTH_ENABLED', '1'); vi.stubEnv('ALETIS_TENANT_ID', 'tenant-fixture'); vi.stubEnv('GOOGLE_DRIVE_ADMIN_USER_IDS', ''); vi.stubEnv('ALIX_ADMIN_USER_IDS', '')
  vi.stubGlobal('fetch', () => { throw new Error('Rede proibida nesta suíte') })
  app = Fastify({ logger: { level: 'error', stream: { write: (line: string) => { fx.logs.push(line) } } } })
  await app.register(cookie); await app.register(jwt, { secret: 'isolated-drive-analysis-route-secret' }); await app.register(routes); await app.ready()
  owner = `aletis_session=${app.jwt.sign({ kind: 'internal', username: 'christian', sub: 'consultor-christian' })}`
  consultant = `aletis_session=${app.jwt.sign({ kind: 'internal', username: 'regis', sub: 'consultor-regis' })}`
})
afterEach(async () => { await app.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const analysisQueries = () => fx.queries.filter(query => query.sql.includes('FROM alix_drive_analysis a'))

describe('consulta autenticada das análises do Drive', () => {
  it('rejeita anônimo, token inválido e cabeçalhos que forjam identidade/papel antes do banco', async () => {
    for (const headers of [{}, { authorization: 'Bearer invalid-token' }, { 'x-user-id': 'consultor-christian', 'x-aletis-role': 'admin_master', 'x-tenant-id': 'tenant-fixture' }]) {
      const response = await app.inject({ url: endpoint, headers })
      expect(response.statusCode).toBe(401)
      expect(response.headers['cache-control']).toBe('private, no-store')
    }
    expect(fx.queries).toHaveLength(0)
  })
  it('usa tenant do servidor, preserva revisão/página e não expõe estrutura interna', async () => {
    const response = await app.inject({ url: endpoint, headers: { cookie: owner, 'x-tenant-id': 'other-tenant', 'x-aletis-role': 'admin_master' } })
    expect(response.statusCode).toBe(200); expect(response.headers['cache-control']).toBe('private, no-store')
    const data = response.json().data
    expect(data.analyses.map((analysis: any) => analysis.clienteId)).toEqual(['a', 'b'])
    expect(data.analyses[0]).toMatchObject({ id: analysisId, revision: 'revision-fixture', candidateCount: 6, nextCandidateOffset: 4, sourceCoverage: { status: 'partial', pendingPages: [3] }, candidates: [{ status: 'pending_review', evidence: { page: 2 } }, {}, {}, {}] })
    expect(response.body).not.toMatch(/privateToken|not-public|job_id|internal-job-id|other-tenant|\/root\/private/)
    expect(analysisQueries()[0].values).toEqual(['tenant-fixture', 5, 0])
    expect(analysisQueries()[0].sql).toContain('a.tenant_id=$1')
    expect(fx.acl).not.toHaveBeenCalled()
  })
  it('consultor precisa de cliente autorizado e cabeçalho admin não amplia sua visão', async () => {
    for (const url of [endpoint, endpoint + '?clienteId=b']) {
      const response = await app.inject({ url, headers: { cookie: consultant, 'x-aletis-role': 'admin_master' } })
      expect(response.statusCode).toBe(403); expect(response.headers['cache-control']).toBe('private, no-store')
    }
    expect(analysisQueries()).toHaveLength(0)
    const response = await app.inject({ url: endpoint + '?clienteId=a', headers: { cookie: consultant } })
    expect(response.statusCode).toBe(200)
    expect(response.json().data.analyses.map((analysis: any) => analysis.clienteId)).toEqual(['a'])
    expect(fx.acl).toHaveBeenLastCalledWith(expect.objectContaining({ actor: expect.objectContaining({ id: 'consultor-regis', role: 'consultor' }), clienteId: 'a', action: 'document:read' }))
    expect(analysisQueries()[0].values).toEqual(['tenant-fixture', ['a'], 5, 0])
  })
  it('recusa autorização de compatibilidade e cliente inexistente sem consultar análises', async () => {
    fx.acl.mockResolvedValue({ allowed: true, source: 'compat' })
    expect((await app.inject({ url: endpoint + '?clienteId=a', headers: { cookie: consultant } })).statusCode).toBe(403)
    expect((await app.inject({ url: endpoint + '?clienteId=missing', headers: { cookie: consultant } })).statusCode).toBe(404)
    expect(analysisQueries()).toHaveLength(0)
  })
  it('analysisId de outro cliente não contorna escopo mesmo com cliente permitido', async () => {
    const response = await app.inject({ url: endpoint + '?clienteId=a&analysisId=' + 'b'.repeat(64), headers: { cookie: consultant } })
    expect(response.statusCode).toBe(200)
    expect(response.json().data).toMatchObject({ analyses: [], nextOffset: null })
    expect(analysisQueries()[0].values).toEqual(['tenant-fixture', ['a'], 'b'.repeat(64), 5, 0])
  })
  it('pagina documentos e candidatos com continuidade explícita e preserva valores textuais', async () => {
    const first = await app.inject({ url: endpoint + '?limit=1&candidateLimit=2', headers: { cookie: owner } })
    expect(first.json().data).toMatchObject({ nextOffset: 1, analyses: [{ id: analysisId, nextCandidateOffset: 2, candidates: [{ value: 'Valor 1' }, { value: 'Valor 2' }] }] })
    const second = await app.inject({ url: endpoint + '?offset=1&limit=1', headers: { cookie: owner } })
    expect(second.json().data.analyses[0].id).toBe('b'.repeat(64))
    const final = await app.inject({ url: endpoint + '?analysisId=' + analysisId + '&candidateOffset=4&candidateLimit=2', headers: { cookie: owner } })
    expect(final.json().data).toMatchObject({ nextOffset: null, analyses: [{ nextCandidateOffset: null, candidates: [{ value: 'Valor 5' }, { value: 'Valor 6' }] }] })
  })
  it('leitura interna recebe57 candidatos em uma chamada sem ampliar o limite público de16', async () => {
    fx.rows[0].payload.candidates = Array.from({ length: 57 }, (_, index) => candidate(index + 1))
    const actor = { userId: 'consultor-christian', userName: 'Christian', role: 'admin_master', tenantId: 'tenant-fixture' }
    const complete = await listDriveCorpusAnalyses(actor, { clienteId: 'a', analysisId, limit: 1, candidateLimit: 64 })
    expect(complete.analyses[0].candidates).toHaveLength(57)
    expect(complete.analyses[0]).toMatchObject({ candidateCount: 57, nextCandidateOffset: null, candidates: expect.arrayContaining([expect.objectContaining({ value: 'Valor 57', status: 'pending_review', evidence: expect.objectContaining({ page: 2 }) })]) })
    expect(complete.nextOffset).toBeNull()
    const publicPage = await app.inject({ url: endpoint + '?clienteId=a&analysisId=' + analysisId + '&candidateLimit=16', headers: { cookie: owner } })
    expect(publicPage.statusCode).toBe(200)
    expect(publicPage.json().data.analyses[0].candidates).toHaveLength(16)
    expect(publicPage.json().data.analyses[0].nextCandidateOffset).toBe(16)
    expect((await app.inject({ url: endpoint + '?candidateLimit=64', headers: { cookie: owner } })).statusCode).toBe(400)
    fx.rows[0].payload.candidates = Array.from({ length: 70 }, (_, index) => candidate(index + 1))
    const first = await listDriveCorpusAnalyses(actor, { analysisId, candidateLimit: 64 })
    const last = await listDriveCorpusAnalyses(actor, { analysisId, candidateLimit: 64, candidateOffset: 64 })
    expect(first.analyses[0]).toMatchObject({ candidateCount: 70, nextCandidateOffset: 64 })
    expect(first.analyses[0].candidates).toHaveLength(64)
    expect(last.analyses[0].candidates).toHaveLength(6)
    expect(last.analyses[0].nextCandidateOffset).toBeNull()
  })
  it.each(['tenantId=other', 'role=admin', 'limit=0', 'limit=21', 'offset=-1', 'offset=2000001', 'offset=0.5', 'candidateLimit=0', 'candidateLimit=17', 'candidateOffset=257', 'candidateOffset=-1', 'analysisId=invalid', 'clienteId='])('valida %s antes de consultar banco e aplica no-store', async query => {
    const response = await app.inject({ url: endpoint + '?' + query, headers: { cookie: owner } })
    expect(response.statusCode).toBe(400); expect(response.headers['cache-control']).toBe('private, no-store')
    expect(fx.queries).toHaveLength(0)
  })
  it('falha inesperada retorna 503 sem SQL, credenciais ou caminho na resposta/log', async () => {
    fx.databaseError = true
    const response = await app.inject({ url: endpoint, headers: { cookie: owner } })
    expect(response.statusCode).toBe(503); expect(response.headers['cache-control']).toBe('private, no-store')
    expect(response.json()).toMatchObject({ success: false, code: 'DRIVE_CORPUS_UNAVAILABLE' })
    expect(response.body + fx.logs.join('')).not.toMatch(/private-user|private-token|\/root\/private|confidential_payload|postgresql/)
  })
})
