import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeepAnalysisJobResult } from '../../src/services/alix/jobs/DocumentDeepAnalysisRunner.js'
const fx = vi.hoisted(() => ({ jobs: new Map<string, any>(), handlers: new Map<string, (jobs: any[]) => Promise<any>>(), sends: [] as any[], sql: [] as string[], runner: vi.fn(), failSend: false, text: 'Fonte sintética.', drive: vi.fn(), dispatch: vi.fn() }))
vi.mock('pg-boss', () => ({ PgBoss: class {
  on() {} async start() {} async stop() {} async createQueue() {}
  async work(name: string, _options: unknown, handler: (jobs: any[]) => Promise<any>) { fx.handlers.set(name, handler) }
  async send(name: string, data: any, options: any = {}) {
    fx.sends.push({ name, data: structuredClone(data), options })
    if (fx.failSend) { fx.failSend = false; throw new Error('Falha de enqueue simulada') }
    const id = options.id || crypto.randomUUID()
    if (fx.jobs.has(id)) return null
    fx.jobs.set(id, { id, name, data: structuredClone(data), singletonKey: options.singletonKey, state: 'created', output: null, createdOn: new Date(), startedOn: null, completedOn: null, retryCount: 0, retryLimit: 2 })
    return id
  }
  async findJobs(name: string, options: any) { return [...fx.jobs.values()].filter(job => job.name === name && job.singletonKey === options.key) }
  async getJobById(_name: string, id: string) { return fx.jobs.get(id) || null }
  async cancel(_name: string, id: string) { const job = fx.jobs.get(id); if (job) job.state = 'cancelled'; return job ? 1 : 0 }
} }))
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => true, getPool: () => ({ connect: async () => ({ query: async (sql: string) => {
  fx.sql.push(sql); return { rows: sql.startsWith('select payload') ? [{ payload: { id: 'fixture', sessionId: 'session-fixture', kind: 'text', extractedText: fx.text, metadata: {} } }] : [], rowCount: 1 }
}, release() {} }) }) }))
vi.mock('../../src/services/alix/knowledge/FactLedgerService.js', () => ({ ingestFactsFromAlixDocument: vi.fn(), ingestFactsFromCrmClient: vi.fn() }))
vi.mock('../../src/services/alix/knowledge/RagKnowledgeService.js', () => ({ indexAlixDocument: vi.fn(), indexCoreDocument: vi.fn() }))
vi.mock('../../src/services/alix/jobs/DocumentDeepAnalysisRunner.js', () => ({ runDocumentDeepAnalysis: fx.runner, deepAnalysisBudget: () => ({ maxPasses: 12, maxDurationMs: 3_600_000 }) }))
vi.mock('../../src/services/alix/intake/DocumentIntakeService.js', () => ({ getDocumentIntakeService: () => ({ get: vi.fn() }) }))
vi.mock('../../src/services/alix/intake/DocumentPipelineService.js', () => ({ runSpecializedDocumentPipeline: vi.fn() }))
vi.mock('../../src/services/alix/governance/DossierRefreshRunner.js', () => ({ runDossierRefresh: vi.fn() }))
vi.mock('../../src/services/llm/LLMConfig.js', () => ({ getModelForRole: () => 'fixture' }))
vi.mock('../../src/services/alix/intake/DriveCorpusAnalysisService.js', () => ({ runDriveCorpusAnalysis: fx.drive, dispatchDriveCorpusAnalyses: fx.dispatch }))
import { AI_JOB_QUEUES, AiJobQueueService } from '../../src/services/alix/jobs/AiJobQueueService.js'
let queue: AiJobQueueService
const input = { sessionId: 'session-fixture', documentId: 'fixture' }
const result = (status: DeepAnalysisJobResult['processing']['status'] = 'continuation_required', nextPass = 1) => ({
  analysis: { documentoId: 'fixture', resumoExecutivo: 'Leitura parcial', readingCoverage: { complete: status === 'completed', totalSegments: 13, analyzedSegments: status === 'completed' ? 13 : 12 } },
  continuationRequired: !['completed', 'awaiting_source'].includes(status), processing: { status, nextPass, reason: 'Motivo', nextStep: 'Próximo passo' },
})
async function runJob(id: string) {
  const job = fx.jobs.get(id); job.state = 'active'
  const output = await fx.handlers.get(AI_JOB_QUEUES.deepAnalysis)!([job])
  job.output = output; job.state = 'completed'; job.completedOn = new Date(); return output
}
beforeEach(async () => {
  fx.jobs.clear(); fx.handlers.clear(); fx.sends = []; fx.sql = []; fx.runner.mockReset(); fx.failSend = false; fx.text = 'Fonte sintética.'; fx.dispatch.mockReset(); fx.drive.mockReset()
  vi.stubEnv('DATABASE_URL', 'postgres://fixture.invalid/no-connection'); vi.stubEnv('ALETIS_AI_QUEUE_ENABLED', 'true')
  vi.stubGlobal('fetch', () => { throw new Error('Rede proibida') })
  queue = new AiJobQueueService(); await queue.start()
})
afterEach(async () => { await queue.stop(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers() })
describe('fila durável da leitura extensa', () => {
  it('deduplica a raiz por revisão/foco inclusive com continuação pendente', async () => {
    const first = await queue.enqueueDeepAnalysis(input)
    expect((await queue.enqueueDeepAnalysis(input)).jobId).toBe(first.jobId)
    fx.runner.mockResolvedValue(result()); await runJob(first.jobId)
    expect((await queue.enqueueDeepAnalysis(input)).jobId).toBe(first.jobId)
    expect(fx.jobs.size).toBe(2)
    expect(fx.sql.some(sql => sql.includes('pg_advisory_xact_lock'))).toBe(true)
    fx.text += ' Nova revisão.'
    expect((await queue.enqueueDeepAnalysis(input)).jobId).not.toBe(first.jobId)
  })
  it('persiste continuação antes de concluir e raiz acompanha sua conclusão real', async () => {
    const first = await queue.enqueueDeepAnalysis(input)
    fx.runner.mockResolvedValueOnce(result()).mockResolvedValueOnce(result('completed', 2))
    const partial = await runJob(first.jobId)
    expect(fx.jobs.has(partial.processing.continuationJobId)).toBe(true)
    expect(await queue.getJob(AI_JOB_QUEUES.deepAnalysis, first.jobId)).toMatchObject({ completed: false, finished: false, state: 'created', progress: 92 })
    await runJob(partial.processing.continuationJobId)
    expect(await queue.getJob(AI_JOB_QUEUES.deepAnalysis, first.jobId)).toMatchObject({ completed: true, finished: true, state: 'completed', progress: 100 })
  })
  it('falha de enqueue não confirma sucesso e retry mantém ID determinístico', async () => {
    const first = await queue.enqueueDeepAnalysis(input); fx.runner.mockResolvedValue(result()); fx.failSend = true
    await expect(runJob(first.jobId)).rejects.toThrow('enqueue simulada')
    const expectedId = fx.sends.at(-1).options.id
    expect((await runJob(first.jobId)).processing.continuationJobId).toBe(expectedId)
    expect((await runJob(first.jobId)).processing.continuationJobId).toBe(expectedId)
    expect(fx.jobs.size).toBe(2)
  })
  it.each(['paused_budget', 'paused_no_progress', 'awaiting_source'] as const)('encerra em %s sem anunciar leitura integral', async status => {
    const first = await queue.enqueueDeepAnalysis(input); fx.runner.mockResolvedValue(result(status)); await runJob(first.jobId)
    expect(fx.jobs.size).toBe(1)
    expect(await queue.getJob(AI_JOB_QUEUES.deepAnalysis, first.jobId)).toMatchObject({ completed: false, finished: true, state: status })
    expect((await queue.enqueueDeepAnalysis(input)).jobId).not.toBe(first.jobId)
  })
  it('falha da continuação aparece na raiz preservando o resultado parcial', async () => {
    const first = await queue.enqueueDeepAnalysis(input); fx.runner.mockResolvedValue(result()); const partial = await runJob(first.jobId)
    const child = fx.jobs.get(partial.processing.continuationJobId); child.state = 'failed'; child.output = { message: 'Falha' }
    expect(await queue.getJob(AI_JOB_QUEUES.deepAnalysis, first.jobId)).toMatchObject({ failed: true, finished: true, completed: false, output: { analysis: { resumoExecutivo: 'Leitura parcial' } } })
  })
  it('cancelar a raiz atinge a continuação pendente', async () => {
    const first = await queue.enqueueDeepAnalysis(input); fx.runner.mockResolvedValue(result()); const partial = await runJob(first.jobId)
    expect(await queue.cancelJob(AI_JOB_QUEUES.deepAnalysis, first.jobId)).toBe(true)
    expect(fx.jobs.get(partial.processing.continuationJobId).state).toBe('cancelled')
    expect(await queue.getJob(AI_JOB_QUEUES.deepAnalysis, first.jobId)).toMatchObject({ state: 'cancelled', completed: false, finished: true })
  })
  it('não agenda continuação se a passagem foi cancelada durante a análise', async () => {
    const first = await queue.enqueueDeepAnalysis(input)
    fx.runner.mockImplementation(async () => { fx.jobs.get(first.jobId).state = 'cancelled'; return result() })
    await fx.handlers.get(AI_JOB_QUEUES.deepAnalysis)!([fx.jobs.get(first.jobId)])
    expect(fx.jobs.size).toBe(1)
  })
  it('corpus usa prioridade baixa, cliente e chave de revisão/passagem, sem despacho imediato', async () => {
    const data = { analysisId: 'fixture-analysis', tenantId: 'tenant-fixture', clienteId: 'client-fixture', pass: 2 }
    await queue.enqueueDriveCorpusAnalysis(data)
    expect(fx.sends.at(-1)).toMatchObject({ name: AI_JOB_QUEUES.driveAnalysis, options: { singletonSeconds: 30, priority: -5, group: { id: data.clienteId } } })
    expect(fx.dispatch).not.toHaveBeenCalled()
  })
  it('despacha corpus a cada 30s sem sobrepor chamadas e encerra o timer no stop', async () => {
    await queue.stop(); vi.useFakeTimers(); await queue.start()
    let finish!: () => void
    fx.dispatch.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve })).mockResolvedValue(undefined)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fx.dispatch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fx.dispatch).toHaveBeenCalledTimes(1)
    finish(); await vi.advanceTimersByTimeAsync(30_000)
    expect(fx.dispatch).toHaveBeenCalledTimes(2)
    await queue.stop(); await vi.advanceTimersByTimeAsync(60_000)
    expect(fx.dispatch).toHaveBeenCalledTimes(2)
  })
  it('não expõe payload ou resultado dos jobs internos do corpus pela consulta pública genérica', async () => {
    const internal = await queue.enqueueDriveCorpusAnalysis({ analysisId: 'internal', tenantId: 'tenant-fixture', clienteId: 'client-fixture', pass: 0 })
    fx.jobs.get(internal.jobId).output = { confidential: 'conteúdo do cliente' }
    await expect(queue.getJob(AI_JOB_QUEUES.driveAnalysis, internal.jobId)).rejects.toThrow('Fila interna')
  })
})
