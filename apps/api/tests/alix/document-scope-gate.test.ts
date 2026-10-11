import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  service: null as any, detectedCpf: '', activeCpf: '12345678909',
  query: vi.fn(async () => ({ rows: [], rowCount: 1 })),
  index: vi.fn(async () => undefined), persistIndex: vi.fn(async () => undefined),
  pipeline: vi.fn(async () => ({ id: 'job-fixture' })), knowledge: vi.fn(async () => undefined),
  assertSession: vi.fn(async () => ({ id: 'sessao-fixture' })),
  accessClient: vi.fn(async () => ({ allowed: true })), attach: vi.fn(),
}))
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => true, getPool: () => ({ query: state.query }) }))
vi.mock('../../src/services/alix/intake/DocumentIndexService.js', () => ({ getDocumentIndexService: () => ({ buildIndex: () => ({ chunks: [], evidences: [] }), persist: state.persistIndex, indexDocument: state.index }) }))
vi.mock('../../src/services/alix/jobs/AiJobQueueService.js', () => ({ getAiJobQueueService: () => ({ ready: () => true, enqueueDocumentPipeline: state.pipeline, enqueueDocumentKnowledge: state.knowledge }) }))
vi.mock('../../src/services/alix/jobs/DocumentDeepAnalysisRunner.js', () => ({ runDocumentDeepAnalysis: vi.fn() }))
vi.mock('../../src/services/alix/intake/DoclingParser.js', () => ({ parseWithDocling: async () => null }))
vi.mock('../../src/services/alix/intake/LlmDocExtractor.js', () => ({ extractDocViaLlm: async () => null }))
vi.mock('../../src/services/alix/intake/DocEntityExtractor.js', () => ({ extractEntitiesFromDocument: async () => null }))
vi.mock('../../src/services/alix/intake/PdfParser.js', () => ({ parsePdf: vi.fn() }))
vi.mock('../../src/services/alix/intake/DocxParser.js', () => ({ parseDocx: vi.fn() }))
vi.mock('../../src/services/alix/intake/XlsxParser.js', () => ({ parseXlsx: vi.fn(), parseCsv: vi.fn() }))
vi.mock('../../src/services/alix/intake/ImageProcessor.js', () => ({ processImage: vi.fn() }))
vi.mock('../../src/services/alix/extraction/SmartExtractor.js', () => ({ smartExtract: async () => ({ timingMs: 1, classification: {}, result: null }) }))
vi.mock('../../src/services/alix/intake/DocumentIntakeService.js', async importOriginal => ({ ...await importOriginal<object>(), getDocumentIntakeService: () => state.service }))
vi.mock('../../src/services/alix/intake/DocumentOnboardingReviewService.js', () => ({
  buildDocumentOnboardingCandidate: () => state.detectedCpf ? { candidate: { cpfCnpj: state.detectedCpf, nome: 'Pessoa Sintética' }, ready: true } : null,
  getDocumentOnboardingReviewService: () => ({ createFromDocument: async (_doc: unknown, options: any) => ({ candidate: { cpfCnpj: state.detectedCpf, nome: 'Pessoa Sintética' }, duplicateCliente: options.duplicateCliente }), get: async () => null }),
}))
vi.mock('../../src/services/AlixService.js', () => ({ alixGetClientes: () => [
  { id: 'cliente-a', nome: 'Cliente A', cpfCnpj: state.activeCpf }, { id: 'cliente-b', nome: 'Cliente B', cpfCnpj: '11222333000181' },
] }))
vi.mock('../../src/db/ClienteRepository.js', async importOriginal => ({ ...await importOriginal<object>(), findClienteByCpfCnpj: async () => null }))
vi.mock('../../src/middleware/alixAuth.js', () => ({ applyAlixAuth: (app: any) => app.addHook('onRequest', async (req: any) => { req.alixUser = { id: 'user-fixture', sub: 'user-fixture', nome: 'Consultor Sintético' } }) }))
vi.mock('../../src/services/alix/AlixAccessService.js', () => ({ assertAlixSessionAccess: state.assertSession, isAlixAccessEnforced: () => true, canAccessAlixOwner: (_user: unknown, owner: string) => owner === 'user-fixture' }))
vi.mock('../../src/services/core/AccessControlService.js', () => ({ actorFromRequest: (req: any) => req.alixUser, getAccessControlService: () => ({ assertClienteAccess: state.accessClient }) }))
vi.mock('../../src/services/alix/intake/DocumentVaultBridgeService.js', () => ({ attachAlixDocumentToCliente: state.attach }))

import { DocumentIntakeService, documentClientScopeReview } from '../../src/services/alix/intake/DocumentIntakeService.js'
import routes from '../../src/routes/alix-documents.js'

let directory = ''
const apps: ReturnType<typeof Fastify>[] = []
const input = (text = 'Documento sintético sem identificação pessoal.') => ({ buffer: Buffer.from(text), filename: 'fixture.txt', mimetype: 'text/plain', sessionId: 'sessao-fixture', processingMode: 'deep' as const })
const scope = { requestedBy: 'user-fixture', requestedClienteId: 'cliente-a' }
const human = { clienteId: 'cliente-a', reviewedBy: 'user-fixture', reason: 'Conferi o documento com o responsável pelo caso.', verification: 'human' as const }
beforeEach(async () => {
  vi.clearAllMocks()
  state.detectedCpf = ''
  state.activeCpf = '12345678909'
  state.query.mockResolvedValue({ rows: [], rowCount: 1 })
  state.assertSession.mockResolvedValue({ id: 'sessao-fixture' })
  state.accessClient.mockResolvedValue({ allowed: true })
  state.attach.mockImplementation(async (options: any) => {
    const doc = await state.service.linkToCliente(options.sessionId, options.documentoId, options.clienteId)
    return { ok: true, id: 'vault-fixture', clienteId: doc.clienteId }
  })
  directory = await mkdtemp(join(tmpdir(), 'aletis-scope-gate-'))
  state.service = new DocumentIntakeService(directory)
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Rede proibida no teste') }))
})
afterEach(async () => {
  await Promise.all(apps.splice(0).map(app => app.close()))
  await rm(directory, { recursive: true, force: true })
  vi.unstubAllGlobals()
})

describe('intake real e promoção documental', () => {
  it('mantém documento e cache em quarentena sem índice/jobs, bloqueando attach direto', async () => {
    const doc = await state.service.ingest(input(), scope)
    expect(doc.clienteId).toBeUndefined()
    expect(documentClientScopeReview(doc)?.status).toBe('pending')
    expect((await state.service.ingest(input(), scope)).id).toBe(doc.id)
    expect(state.index).not.toHaveBeenCalled()
    expect(state.persistIndex).not.toHaveBeenCalled()
    expect(state.pipeline).not.toHaveBeenCalled()
    expect(state.knowledge).not.toHaveBeenCalled()
    await expect(state.service.linkToCliente(doc.sessionId, doc.id, 'cliente-a')).rejects.toThrow(/Confirme a identidade/)
    await expect(state.service.ingest({ ...input(), clienteId: 'cliente-a' })).rejects.toThrow(/confirmação de identidade/)
  })
  it('confirma documento sem CPF, atualiza escopo e publica derivados somente depois', async () => {
    const doc = await state.service.ingest(input(), scope)
    const updated = await state.service.confirmClientScope(doc.sessionId, doc.id, human)
    expect(updated.clienteId).toBe('cliente-a')
    expect(documentClientScopeReview(updated)).toMatchObject({ status: 'verified', reviewedBy: 'user-fixture', verification: 'human', reason: human.reason })
    expect(state.index).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 'cliente-a' }))
    expect(state.knowledge).toHaveBeenCalledWith({ documentId: doc.id, clienteId: 'cliente-a' })
    await expect(state.service.linkToCliente(doc.sessionId, doc.id, 'cliente-b')).rejects.toThrow(/outro cliente/)
  })
  it('preserva quarentena no processamento diferido e não perde o original', async () => {
    const queued = await state.service.enqueue({ ...input(), clienteId: 'cliente-a' }, scope)
    await vi.waitFor(async () => expect((await state.service.get(queued.sessionId, queued.id))?.metadata.processingState).toBe('completed_basic'))
    const processed = await state.service.get(queued.sessionId, queued.id)
    expect(processed.clienteId).toBeUndefined()
    expect(documentClientScopeReview(processed)).toMatchObject(scope)
    expect((await state.service.getOriginalFile(queued.sessionId, queued.id)).buffer.equals(input().buffer)).toBe(true)
    expect(state.knowledge).not.toHaveBeenCalled()
    expect(state.persistIndex).not.toHaveBeenCalled()
  })
  it('preserva IDs de recibo distintos e repete o mesmo ID sem novo documento', async () => {
    const firstInput = { ...input(), documentId: 'receipt-document-a' }
    const first = await state.service.enqueue(firstInput, scope)
    const second = await state.service.enqueue({ ...input(), documentId: 'receipt-document-b' }, scope)
    expect(first.id).toBe('receipt-document-a')
    expect(second.id).toBe('receipt-document-b')
    expect((await state.service.enqueue(firstInput, scope)).id).toBe(first.id)
    await vi.waitFor(async () => {
      expect((await state.service.get(first.sessionId, first.id)).metadata.processingState).toBe('completed_basic')
      expect((await state.service.get(second.sessionId, second.id)).metadata.processingState).toBe('completed_basic')
    })
    expect(state.knowledge).not.toHaveBeenCalled()
  })
  it('duas confirmações concorrentes não atribuem o mesmo documento a clientes diferentes', async () => {
    const doc = await state.service.ingest(input(), scope)
    const results = await Promise.allSettled([
      state.service.confirmClientScope(doc.sessionId, doc.id, human),
      state.service.confirmClientScope(doc.sessionId, doc.id, { ...human, clienteId: 'cliente-b' }),
    ])
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
    expect((await state.service.get(doc.sessionId, doc.id)).clienteId).toBe('cliente-a')
  })
  it('falha PostgreSQL na promoção não publica índice, jobs nem vínculo local', async () => {
    const doc = await state.service.ingest(input(), scope)
    state.query.mockImplementation(async (...args: any[]) => {
      if (String(args[0]).includes('insert into alix_document') && args[1]?.[2]) throw new Error('PG indisponível')
      return { rows: [], rowCount: 1 }
    })
    await expect(state.service.confirmClientScope(doc.sessionId, doc.id, human)).rejects.toThrow('PG indisponível')
    expect((await state.service.get(doc.sessionId, doc.id)).clienteId).toBeUndefined()
    expect(state.index).not.toHaveBeenCalled()
    expect(state.knowledge).not.toHaveBeenCalled()
  })
  it('reupload em outro contexto não modifica documento já confirmado', async () => {
    const doc = await state.service.ingest(input(), scope)
    await state.service.confirmClientScope(doc.sessionId, doc.id, human)
    const other = await state.service.ingest(input(), { ...scope, requestedClienteId: 'cliente-b' })
    expect(other.id).not.toBe(doc.id)
    expect(other.clienteId).toBeUndefined()
    expect((await state.service.get(doc.sessionId, doc.id)).clienteId).toBe('cliente-a')
  })
})

async function application() {
  const app = Fastify()
  apps.push(app)
  await app.register(multipart)
  await app.register(routes)
  return app
}
async function upload(text: string) {
  const app = await application()
  const payload = `--fixture-boundary\r\nContent-Disposition: form-data; name="file"; filename="fixture.txt"\r\nContent-Type: text/plain\r\n\r\n${text}\r\n--fixture-boundary--\r\n`
  return { app, response: await app.inject({ method: 'POST', url: '/api/alix/documents/upload?sessionId=sessao-fixture&clienteId=cliente-a', headers: { 'content-type': 'multipart/form-data; boundary=fixture-boundary' }, payload }) }
}
describe('rota real com intake real e efeitos externos substituídos', () => {
  it('CPF divergente não anexa, indexa ou enfileira para o cliente ativo', async () => {
    state.detectedCpf = '11222333000181'
    const { response } = await upload('Documento sintético. CNPJ: 11.222.333/0001-81.')
    expect(response.statusCode).toBe(201)
    expect(response.json().data.scopeReview.status).toBe('conflict')
    expect(response.json().data.clienteId).toBeUndefined()
    expect(state.attach).not.toHaveBeenCalled()
    expect(state.index).not.toHaveBeenCalled()
    expect(state.knowledge).not.toHaveBeenCalled()
    expect(state.assertSession).toHaveBeenCalled()
  })
  it('CPF correspondente literal promove, indexa e anexa', async () => {
    state.detectedCpf = '12345678909'
    const { response } = await upload('Documento sintético. CPF: 123.456.789-09.')
    expect(response.statusCode).toBe(201)
    expect(response.json().data.clienteId).toBe('cliente-a')
    expect(response.json().data.anexadoAoCliente.ok).toBe(true)
    expect(state.knowledge).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 'cliente-a' }))
  })
  it('CPF inferido ausente do texto não autoriza promoção', async () => {
    state.detectedCpf = '12345678909'
    const { response } = await upload('Documento sintético sem qualquer número de identificação.')
    expect(response.json().data.scopeReview.status).toBe('unverified')
    expect(state.attach).not.toHaveBeenCalled()
    expect(state.knowledge).not.toHaveBeenCalled()
  })
  it.each(['12345678900', '11111111111', '11222333000182'])('identificação inválida %s não promove mesmo correspondendo ao cadastro', async value => {
    state.activeCpf = value
    state.detectedCpf = value
    const { response } = await upload(`Documento sintético com identificação: ${value}.`)
    expect(response.statusCode).toBe(201)
    expect(response.json().data.scopeReview.status).toBe('unverified')
    expect(state.attach).not.toHaveBeenCalled()
    expect(state.knowledge).not.toHaveBeenCalled()
  })
  it('vários titulares exigem confirmar o papel antes de promover', async () => {
    state.detectedCpf = '12345678909'
    const { response } = await upload('Documento sintético. CPF: 123.456.789-09. Outro participante CNPJ: 11.222.333/0001-81.')
    expect(response.json().data.scopeReview.status).toBe('unverified')
    expect(state.attach).not.toHaveBeenCalled()
    expect(state.knowledge).not.toHaveBeenCalled()
  })
  it('documento sem CPF exige confirmação e motivo; repetição não duplica anexo', async () => {
    const { app, response } = await upload('Documento sintético sem identificação pessoal.')
    const doc = response.json().data
    const url = `/api/alix/documents/${doc.sessionId}/${doc.id}/client-scope`
    expect((await app.inject({ method: 'POST', url, payload: { clienteId: 'cliente-a', confirmed: true, reason: 'curto' } })).statusCode).toBe(400)
    const payload = { clienteId: 'cliente-a', confirmed: true, reason: human.reason }
    expect((await app.inject({ method: 'POST', url, payload })).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url, payload })).statusCode).toBe(200)
    expect(state.attach).toHaveBeenCalledTimes(1)
  })
  it('confirma importação Drive sem reenviar o arquivo para o Drive', async () => {
    const doc = await state.service.ingest({ ...input(), source: { type: 'google_drive', fileId: 'fixture-drive', url: 'https://drive.google.com/file/d/fixture-drive/view', path: 'Fixture', modifiedAt: null, importedAt: '2026-09-06T00:00:00Z' } }, scope)
    const app = await application()
    const response = await app.inject({ method: 'POST', url: `/api/alix/documents/${doc.sessionId}/${doc.id}/client-scope`, payload: { clienteId: 'cliente-a', confirmed: true, reason: human.reason } })
    expect(response.statusCode).toBe(200)
    expect(state.attach).toHaveBeenCalledWith(expect.objectContaining({ skipGoogleDriveSync: true }))
  })
  it('sessão não autorizada é recusada antes da ingestão', async () => {
    state.assertSession.mockRejectedValueOnce(Object.assign(new Error('Sessão indisponível'), { statusCode: 404 }))
    const { response } = await upload('Arquivo que não deve ser recebido.')
    expect(response.statusCode).toBe(404)
    expect(state.query).not.toHaveBeenCalled()
  })
})
