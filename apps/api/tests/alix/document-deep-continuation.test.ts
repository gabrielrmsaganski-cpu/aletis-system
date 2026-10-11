import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IngestedDocument } from '../../src/services/alix/intake/types.js'
import { buildDocumentReadingPlan } from '../../src/services/alix/intake/DocumentReadingPlan.js'
import type { DeepAnalysisJobContext } from '../../src/services/alix/jobs/DocumentDeepAnalysisRunner.js'

const fixture = vi.hoisted(() => ({ doc: null as IngestedDocument | null, prompts: [] as string[], failModel: false, failSave: false }))
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => false, getPool: () => { throw new Error('PG real proibido') } }))
vi.mock('../../src/services/alix/intake/DocumentIntakeService.js', () => ({ getDocumentIntakeService: () => ({
  get: async () => structuredClone(fixture.doc),
  saveDeepAnalysisCheckpoint: async (_session: string, _document: string, sourceHash: string, input: { deepAnalysis?: Record<string, unknown>; continuation?: { rootJobId: string; checkpoint: Record<string, unknown> } }) => {
    if (fixture.failSave) { fixture.failSave = false; throw new Error('Falha de persistência simulada') }
    const { buildDocumentReadingPlan } = await import('../../src/services/alix/intake/DocumentReadingPlan.js')
    if (!fixture.doc || sourceHash !== buildDocumentReadingPlan(fixture.doc).sourceHash) throw new Error('Fonte mudou')
    if (input.deepAnalysis) fixture.doc.metadata.deepAnalysis = structuredClone(input.deepAnalysis)
    if (input.continuation) fixture.doc.metadata.deepAnalysisContinuations = { ...(fixture.doc.metadata.deepAnalysisContinuations as object || {}), [input.continuation.rootJobId]: structuredClone(input.continuation.checkpoint) }
    return structuredClone(fixture.doc)
  },
}) }))
vi.mock('../../src/services/llm/OpenAIClient.js', () => ({ isOpenAIEnabled: () => true, generateStructured: async (messages: Array<{ content: string }>) => {
  const text = String(JSON.parse(messages[0].content).textoExtraido)
  fixture.prompts.push(text)
  if (fixture.failModel) throw new Error('Modelo indisponível na fixture')
  const quote = text.match(/Cláusula FINAL: [^.]+\./)?.[0]
  return { data: { tipoDocumento: 'Texto', resumoExecutivo: 'Resumo', achadosChave: [],
    achadosFundamentados: quote ? [{ tipo: 'achado', descricao: quote, evidencia: quote }] : [],
    indicadores: [], riscos: [], lacunas: [], acoesSugeridas: [], acoesSistema: [], evidencias: quote ? [quote] : [] } }
} }))
vi.mock('../../src/services/llm/LLMConfig.js', () => ({ getModelForRole: () => 'fixture' }))
vi.mock('../../src/services/alix/intake/DocumentModelInput.js', () => ({ buildDocumentModelContent: async (_doc: unknown, prompt: string) => prompt }))
import { runDocumentDeepAnalysis } from '../../src/services/alix/jobs/DocumentDeepAnalysisRunner.js'
const input = { sessionId: 'session-fixture', documentId: 'fixture', autoContinue: true }
const rootId = '11111111-1111-4111-a111-111111111111'
const childId = '22222222-2222-4222-a222-222222222222'
const otherRootId = '33333333-3333-4333-a333-333333333333'
const context = (extra: Partial<DeepAnalysisJobContext> = {}): DeepAnalysisJobContext => ({ jobId: rootId, rootJobId: rootId, pass: 0, sourceHash: buildDocumentReadingPlan(fixture.doc!).sourceHash, model: 'fixture', maxPasses: 12, maxDurationMs: 3_600_000, ...extra })
beforeEach(() => {
  fixture.prompts = []; fixture.failModel = false; fixture.failSave = false
  fixture.doc = { id: 'fixture', sessionId: 'session-fixture', filename: 'contrato.txt', kind: 'text', mimetype: 'text/plain', sizeBytes: 400_100, uploadedAt: '2026-09-08T00:00:00Z', extractedText: 'a'.repeat(400_000) + '\nCláusula FINAL: garantia suplementar obrigatória.', metadata: {} }
  vi.stubEnv('ALIX_DEEP_ANALYSIS_MAX_SEGMENTS', '1')
  vi.stubGlobal('fetch', () => { throw new Error('Rede externa proibida') })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('continuação durável de documentos extensos', () => {
  it('alcança cláusula no final após reinício, sem reanalisar os primeiros segmentos', async () => {
    const job = context()
    const first = await runDocumentDeepAnalysis({ ...input, job })
    expect(first.processing.status).toBe('continuation_required')
    expect(first.analysis.readingCoverage).toMatchObject({ analyzedSegments: 12, totalSegments: 13, complete: false })
    expect(fixture.prompts).toHaveLength(12)
    vi.resetModules()
    const restarted = await import('../../src/services/alix/jobs/DocumentDeepAnalysisRunner.js')
    const second = await restarted.runDocumentDeepAnalysis({ ...input, job: { ...job, jobId: childId, pass: 1 } })
    expect(second.processing.status).toBe('completed')
    expect(second.analysis.readingCoverage?.complete).toBe(true)
    expect(second.analysis.achadosChave.join(' ')).toContain('garantia suplementar')
    expect(fixture.prompts).toHaveLength(13)
  })

  it('não repete chamadas quando o processo cai entre o checkpoint e o enqueue da continuação', async () => {
    const job = context()
    const first = await runDocumentDeepAnalysis({ ...input, job })
    const retried = await runDocumentDeepAnalysis({ ...input, job })
    expect(retried.cached).toBe(true)
    expect(retried.processing).toEqual(first.processing)
    expect(fixture.prompts).toHaveLength(12)
  })

  it('uma tentativa antiga observa a passagem mais recente sem voltar o cursor', async () => {
    const job = context()
    await runDocumentDeepAnalysis({ ...input, job })
    await runDocumentDeepAnalysis({ ...input, job: { ...job, jobId: childId, pass: 1 } })
    const replay = await runDocumentDeepAnalysis({ ...input, job })
    expect(replay.processing.status).toBe('completed')
    expect(fixture.prompts).toHaveLength(13)
    const saved = fixture.doc!.metadata.deepAnalysisContinuations as Record<string, { pass: number }>
    expect(saved[rootId].pass).toBe(1)
  })

  it('pausa por orçamento, preserva cobertura e retoma com novo orçamento explícito', async () => {
    const job = context({ maxPasses: 1 })
    const first = await runDocumentDeepAnalysis({ ...input, job })
    expect(first.processing).toMatchObject({ status: 'paused_budget', passesUsed: 1, maxPasses: 1 })
    expect(first.continuationRequired).toBe(true)
    await runDocumentDeepAnalysis({ ...input, job })
    expect(fixture.prompts).toHaveLength(12)
    const resumed = await runDocumentDeepAnalysis({ ...input, job: context({ rootJobId: otherRootId, jobId: otherRootId }) })
    expect(resumed.processing.status).toBe('completed')
    expect(fixture.prompts).toHaveLength(13)
  })

  it('reserva tempo antes do modelo e não refaz chamadas após esgotá-lo', async () => {
    const first = await runDocumentDeepAnalysis({ ...input, job: context({ maxDurationMs: 1_000 }) })
    expect(first.processing).toMatchObject({ status: 'paused_budget', reservedDurationMs: 1_000, maxDurationMs: 1_000 })
    const count = fixture.prompts.length
    await runDocumentDeepAnalysis({ ...input, job: context({ maxDurationMs: 1_000 }) })
    expect(fixture.prompts).toHaveLength(count)
  })

  it('falha ao salvar reserva impede consumo do modelo', async () => {
    fixture.failSave = true
    await expect(runDocumentDeepAnalysis({ ...input, job: context() })).rejects.toThrow('persistência')
    expect(fixture.prompts).toHaveLength(0)
  })

  it('interrompe ausência de progresso sem encadear tentativas caras', async () => {
    fixture.failModel = true
    const first = await runDocumentDeepAnalysis({ ...input, job: context() })
    expect(first.processing.status).toBe('paused_no_progress')
    expect(first.analysis.readingCoverage?.analyzedSegments).toBe(0)
    await runDocumentDeepAnalysis({ ...input, job: context() })
    expect(fixture.prompts).toHaveLength(1)
  })

  it('não anuncia conclusão quando faltam páginas de OCR', async () => {
    fixture.doc!.extractedText = 'Texto legível da primeira página.'
    fixture.doc!.metadata.extractionCoverage = { status: 'partial', totalPages: 2, readablePages: [1], pendingPages: [2], limitations: ['OCR da página 2 pendente.'] }
    const result = await runDocumentDeepAnalysis({ ...input, job: context() })
    expect(result.processing.status).toBe('awaiting_source')
    expect(result.continuationRequired).toBe(false)
    expect(result.sourceReprocessingRequired).toBe(true)
    expect(result.analysis.readingCoverage?.complete).toBe(false)
  })

  it('revisão ou modelo diferente invalida a continuação sem chamadas', async () => {
    const job = context()
    await runDocumentDeepAnalysis({ ...input, job })
    fixture.doc!.extractedText += ' Alteração posterior.'
    await expect(runDocumentDeepAnalysis({ ...input, job: { ...job, jobId: childId, pass: 1 } })).rejects.toThrow('fonte ou o modelo mudou')
    expect(fixture.prompts).toHaveLength(12)
  })

  it('mantém progresso separado quando outro foco é analisado no mesmo documento', async () => {
    const firstJob = context()
    await runDocumentDeepAnalysis({ ...input, focus: 'garantias', job: firstJob })
    await runDocumentDeepAnalysis({ ...input, focus: 'prazos', job: context({ rootJobId: otherRootId, jobId: otherRootId }) })
    const calls = fixture.prompts.length
    const completed = await runDocumentDeepAnalysis({ ...input, focus: 'garantias', job: { ...firstJob, jobId: childId, pass: 1 } })
    expect(completed.processing.status).toBe('completed')
    expect(fixture.prompts.length - calls).toBe(1)
  })

  it('reaproveita segmento adicional concluído pelo pedido interativo no mesmo foco', async () => {
    const job = context()
    await runDocumentDeepAnalysis({ ...input, job })
    await runDocumentDeepAnalysis({ sessionId: input.sessionId, documentId: input.documentId })
    expect(fixture.prompts).toHaveLength(13)
    const resumed = await runDocumentDeepAnalysis({ ...input, job: { ...job, jobId: childId, pass: 1 } })
    expect(resumed.processing.status).toBe('completed')
    expect(fixture.prompts).toHaveLength(13)
  })
  it('novo orçamento recupera o foco anterior mesmo depois de outro foco substituir o cache principal', async () => {
    await runDocumentDeepAnalysis({ ...input, focus: 'garantias', job: context({ maxPasses: 1 }) })
    await runDocumentDeepAnalysis({ ...input, focus: 'prazos', job: context({ rootJobId: otherRootId, jobId: otherRootId }) })
    const calls = fixture.prompts.length
    const resumed = await runDocumentDeepAnalysis({ ...input, focus: 'garantias', job: context({ rootJobId: childId, jobId: childId }) })
    expect(resumed.processing.status).toBe('completed')
    expect(fixture.prompts.length - calls).toBe(1)
  })
})
