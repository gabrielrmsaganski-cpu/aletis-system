import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IngestedDocument } from '../../src/services/alix/intake/types.js'
import { buildDocumentReadingPlan } from '../../src/services/alix/intake/DocumentReadingPlan.js'

const fx = vi.hoisted(() => ({ doc: null as IngestedDocument | null, before: null as IngestedDocument | null, queries: [] as string[], failUpdate: false, failCommit: false }))
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => true, getPool: () => ({ query: async () => ({ rows: [], rowCount: 0 }), connect: async () => ({
  query: async (sql: string, values: unknown[] = []) => {
    fx.queries.push(sql)
    if (sql === 'BEGIN') fx.before = structuredClone(fx.doc)
    if (sql.startsWith('select payload')) return { rows: fx.doc ? [{ payload: structuredClone(fx.doc) }] : [] }
    if (sql.startsWith('update alix_document')) {
      if (fx.failUpdate) throw new Error('Falha PG simulada')
      fx.doc!.metadata = JSON.parse(String(values[2])); return { rows: [], rowCount: 1 }
    }
    if (sql === 'COMMIT' && fx.failCommit) throw new Error('Falha no commit simulado')
    if (sql === 'ROLLBACK') fx.doc = structuredClone(fx.before)
    return { rows: [], rowCount: 0 }
  }, release() {},
}) }) }))
vi.mock('../../src/services/alix/intake/PdfParser.js', () => ({ parsePdf: vi.fn() }))
vi.mock('../../src/services/alix/intake/DocxParser.js', () => ({ parseDocx: vi.fn() }))
vi.mock('../../src/services/alix/intake/XlsxParser.js', () => ({ parseXlsx: vi.fn(), parseCsv: vi.fn() }))
vi.mock('../../src/services/alix/intake/ImageProcessor.js', () => ({ processImage: vi.fn() }))
vi.mock('../../src/services/alix/intake/TextParser.js', () => ({ parseText: vi.fn() }))
vi.mock('../../src/services/alix/intake/DocumentIndexService.js', () => ({ getDocumentIndexService: vi.fn() }))
vi.mock('../../src/services/alix/extraction/SmartExtractor.js', () => ({ smartExtract: vi.fn() }))
vi.mock('../../src/services/alix/intake/DoclingParser.js', () => ({ parseWithDocling: vi.fn() }))
vi.mock('../../src/services/alix/intake/LlmDocExtractor.js', () => ({ extractDocViaLlm: vi.fn() }))
vi.mock('../../src/services/alix/intake/DocEntityExtractor.js', () => ({ extractEntitiesFromDocument: vi.fn() }))
import { DocumentIntakeService } from '../../src/services/alix/intake/DocumentIntakeService.js'
let directory: string
let service: DocumentIntakeService
const rootId = '11111111-1111-4111-a111-111111111111'
const patch = { deepAnalysis: { version: 3, marker: 'checkpoint-sintético' }, continuation: { rootJobId: rootId, checkpoint: { status: 'continuation_required', pass: 0, updatedAt: '2026-09-08T00:00:00Z' } } }
beforeEach(async () => {
  fx.doc = { id: 'fixture', sessionId: 'session-fixture', filename: 'contrato.txt', kind: 'text', mimetype: 'text/plain', sizeBytes: 40, uploadedAt: '2026-09-08T00:00:00Z', extractedText: 'Fonte sintética de teste.', metadata: { fieldPreserved: 'value' } }
  fx.queries = []; fx.failUpdate = false; fx.failCommit = false
  directory = await mkdtemp(join(tmpdir(), 'aletis-deep-checkpoint-')); service = new DocumentIntakeService(directory)
  vi.stubGlobal('fetch', () => { throw new Error('Rede proibida') })
})
afterEach(async () => { await rm(directory, { recursive: true, force: true }); vi.unstubAllGlobals() })
describe('checkpoint documental condicionado à revisão', () => {
  it('confirma PG antes do espelho e atualiza somente metadata preservando campos concorrentes', async () => {
    const hash = buildDocumentReadingPlan(fx.doc!).sourceHash
    fx.doc!.clienteId = 'cliente-vinculado-enquanto-a-ia-trabalhava'
    fx.doc!.metadata.linkedToClienteAt = '2026-09-08T01:00:00Z'
    await service.saveDeepAnalysisCheckpoint('session-fixture', 'fixture', hash, patch)
    const mirrored = JSON.parse(await readFile(join(directory, 'session-fixture/fixture.json'), 'utf8'))
    expect(mirrored).toEqual(fx.doc)
    expect(fx.doc).toMatchObject({ clienteId: 'cliente-vinculado-enquanto-a-ia-trabalhava', extractedText: 'Fonte sintética de teste.', metadata: { fieldPreserved: 'value', linkedToClienteAt: '2026-09-08T01:00:00Z', deepAnalysis: patch.deepAnalysis } })
    expect(fx.queries.some(sql => sql.includes('for update'))).toBe(true)
    expect(fx.queries.find(sql => sql.startsWith('update'))).toContain("jsonb_set(payload, '{metadata}'")
    expect(fx.queries.at(-1)).toBe('COMMIT')
  })
  it('rejeita fonte modificada sob o bloqueio sem gravar checkpoint', async () => {
    const hash = buildDocumentReadingPlan(fx.doc!).sourceHash; fx.doc!.extractedText += ' Nova cláusula.'
    await expect(service.saveDeepAnalysisCheckpoint('session-fixture', 'fixture', hash, patch)).rejects.toThrow('mudou durante')
    expect(fx.doc!.metadata.deepAnalysis).toBeUndefined()
    expect(fx.queries.at(-1)).toBe('ROLLBACK')
    expect(fx.queries.some(sql => sql.startsWith('update'))).toBe(false)
    await expect(readFile(join(directory, 'session-fixture/fixture.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it.each(['failUpdate', 'failCommit'] as const)('falha %s não produz sucesso local nem apaga progresso anterior', async failure => {
    const original = structuredClone(fx.doc)
    fx[failure] = true
    await expect(service.saveDeepAnalysisCheckpoint('session-fixture', 'fixture', buildDocumentReadingPlan(fx.doc!).sourceHash, patch)).rejects.toThrow('simulad')
    expect(fx.doc).toEqual(original)
    await expect(readFile(join(directory, 'session-fixture/fixture.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('falha do espelho deixa checkpoint durável recuperável em outra tentativa', async () => {
    await writeFile(join(directory, 'blocked'), 'arquivo que impede diretório')
    const blocked = new DocumentIntakeService(join(directory, 'blocked'))
    const hash = buildDocumentReadingPlan(fx.doc!).sourceHash
    await expect(blocked.saveDeepAnalysisCheckpoint('session-fixture', 'fixture', hash, patch)).rejects.toThrow()
    expect(fx.doc!.metadata.deepAnalysis).toEqual(patch.deepAnalysis)
    await service.saveDeepAnalysisCheckpoint('session-fixture', 'fixture', hash, patch)
    expect(JSON.parse(await readFile(join(directory, 'session-fixture/fixture.json'), 'utf8'))).toEqual(fx.doc)
  })
  it('preserva checkpoints de focos paralelos e não remove leituras ativas ao atingir limite', async () => {
    const active = Object.fromEntries(Array.from({ length: 8 }, (_, n) => [`00000000-0000-4000-a000-${String(n).padStart(12, '0')}`, { status: 'running', updatedAt: '2026-09-08T00:00:00Z' }]))
    fx.doc!.metadata.deepAnalysisContinuations = active
    await expect(service.saveDeepAnalysisCheckpoint('session-fixture', 'fixture', buildDocumentReadingPlan(fx.doc!).sourceHash, patch)).rejects.toThrow('oito leituras')
    expect(fx.doc!.metadata.deepAnalysisContinuations).toEqual(active)
  })
  it('não recupera arquivo local quando documento não existe no PG', async () => {
    const hash = buildDocumentReadingPlan(fx.doc!).sourceHash; fx.doc = null
    await expect(service.saveDeepAnalysisCheckpoint('session-fixture', 'fixture', hash, patch)).rejects.toThrow('banco autoritativo')
  })
})
