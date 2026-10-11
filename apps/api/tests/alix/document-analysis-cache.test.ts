import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IngestedDocument } from '../../src/services/alix/intake/types.js'
const fixture = vi.hoisted(() => ({ doc: null as IngestedDocument | null, calls: 0, saves: 0, fail: false, mutate: false }))
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => false, getPool: () => { throw new Error('PG real proibido neste teste') } }))
vi.mock('../../src/services/alix/intake/DocumentIntakeService.js', () => ({ getDocumentIntakeService: () => ({
  get: async () => fixture.doc ? structuredClone(fixture.doc) : null,
  saveDeepAnalysisCheckpoint: async (_session: string, _id: string, expectedHash: string, metadata: Record<string, unknown>) => {
    const { buildDocumentReadingPlan } = await import('../../src/services/alix/intake/DocumentReadingPlan.js')
    if (fixture.doc && buildDocumentReadingPlan(fixture.doc).sourceHash !== expectedHash) throw new Error('O conteúdo mudou durante a análise')
    fixture.saves++; if (fixture.doc) fixture.doc.metadata = { ...fixture.doc.metadata, ...metadata }
  },
}) }))
vi.mock('../../src/services/llm/OpenAIClient.js', () => ({ isOpenAIEnabled: () => true, generateStructured: async () => {
  fixture.calls++
  if (fixture.fail) throw new Error('Falha sintética')
  if (fixture.mutate && fixture.doc) fixture.doc.extractedText += ' outra versão'
  return { data: { tipoDocumento: 'Texto', resumoExecutivo: 'Resumo', achadosChave: [], achadosFundamentados: [], indicadores: [], riscos: [], lacunas: [], acoesSugeridas: [], acoesSistema: [], evidencias: [] } }
} }))
vi.mock('../../src/services/llm/LLMConfig.js', () => ({ getModelForRole: () => 'fixture' }))
vi.mock('../../src/services/alix/intake/DocumentModelInput.js', () => ({ buildDocumentModelContent: async (_doc: unknown, prompt: string) => prompt }))
import { runDocumentDeepAnalysis } from '../../src/services/alix/jobs/DocumentDeepAnalysisRunner.js'
const input = { sessionId: 'session-fixture', documentId: 'fixture' }
beforeEach(() => {
  fixture.calls = 0; fixture.saves = 0; fixture.fail = false; fixture.mutate = false
  fixture.doc = { id: 'fixture', sessionId: 'session-fixture', filename: 'fixture.txt', kind: 'text', mimetype: 'text/plain', sizeBytes: 40, uploadedAt: '2026-09-07T00:00:00Z', extractedText: 'Conteúdo documental sintético e verificável.', metadata: {} }
})
afterEach(() => vi.unstubAllEnvs())

describe('cache e continuidade da leitura documental', () => {
  it('reutiliza análise completa da mesma versão/foco e deduplica chamadas simultâneas', async () => {
    const first = await Promise.all([runDocumentDeepAnalysis(input), runDocumentDeepAnalysis(input)])
    expect(fixture.calls).toBe(1)
    expect(first[0].analysis.readingCoverage?.complete).toBe(true)
    expect((await runDocumentDeepAnalysis(input)).cached).toBe(true)
    expect(fixture.calls).toBe(1)
  })
  it('foco diferente e ausência de foco não reaproveitam uma análise focada', async () => {
    await runDocumentDeepAnalysis({ ...input, focus: '  garantias  ' })
    expect((await runDocumentDeepAnalysis({ ...input, focus: 'garantias' })).cached).toBe(true)
    expect((await runDocumentDeepAnalysis(input)).cached).toBe(false)
    expect((await runDocumentDeepAnalysis({ ...input, focus: 'vencimentos' })).cached).toBe(false)
    expect(fixture.calls).toBe(3)
  })
  it('novo texto invalida cache anterior', async () => {
    const first = await runDocumentDeepAnalysis(input)
    fixture.doc!.extractedText += ' Garantia nova.'
    const second = await runDocumentDeepAnalysis(input)
    expect(second.cached).toBe(false)
    expect(second.analysis.readingCoverage?.sourceHash).not.toBe(first.analysis.readingCoverage?.sourceHash)
  })
  it('worker continua sozinho e salva cada rodada sem reler segmentos concluídos', async () => {
    vi.stubEnv('ALIX_DEEP_ANALYSIS_MAX_SEGMENTS', '1')
    fixture.doc!.extractedText = 'x'.repeat(70_000)
    const partial = await runDocumentDeepAnalysis(input)
    expect(partial.continuationRequired).toBe(true)
    const completed = await runDocumentDeepAnalysis({ ...input, autoContinue: true })
    expect(completed.analysis.readingCoverage?.complete).toBe(true)
    expect(fixture.calls).toBe(3)
    expect(fixture.saves).toBe(3)
  })
  it('para quando não há progresso e quando falta só extração, sem loop infinito', async () => {
    fixture.fail = true
    const failed = await runDocumentDeepAnalysis({ ...input, autoContinue: true })
    expect(fixture.calls).toBe(1)
    expect(failed.continuationRequired).toBe(true)
    fixture.fail = false
    fixture.doc!.metadata.extractionCoverage = { status: 'partial', pendingPages: [2], limitations: ['Página 2 não extraída.'] }
    const partial = await runDocumentDeepAnalysis({ ...input, autoContinue: true })
    expect(fixture.calls).toBe(2)
    expect(partial.continuationRequired).toBe(false)
    expect(partial.sourceReprocessingRequired).toBe(true)
  })
  it('não grava análise obsoleta quando o parser muda a fonte durante a execução', async () => {
    fixture.mutate = true
    await expect(runDocumentDeepAnalysis(input)).rejects.toThrow('mudou durante')
    expect(fixture.saves).toBe(0)
  })
})
