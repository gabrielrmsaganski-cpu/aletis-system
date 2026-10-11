import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LLMToolRegistry } from '../../src/services/llm/types.js'
import type { IngestedDocument } from '../../src/services/alix/intake/types.js'

const mocks = vi.hoisted(() => ({ get: vi.fn(), list: vi.fn(), search: vi.fn(), analyze: vi.fn() }))
vi.mock('../../src/services/alix/intake/DocumentIntakeService.js', async actual => ({
  ...await actual<Record<string, unknown>>(),
  getDocumentIntakeService: () => ({ get: mocks.get, list: mocks.list }),
}))
vi.mock('../../src/services/alix/intake/DocumentIndexService.js', async actual => ({
  ...await actual<Record<string, unknown>>(), getDocumentIndexService: () => ({ search: mocks.search }),
}))
vi.mock('../../src/services/alix/jobs/DocumentDeepAnalysisRunner.js', () => ({ runDocumentDeepAnalysis: mocks.analyze }))

import { OrchestratorService } from '../../src/services/alix/OrchestratorService.js'
import { withAlixTurnContext, type AlixTurnContext } from '../../src/services/alix/AlixTurnContext.js'
import { buildSubAgentDocumentTools } from '../../src/services/alix/agents/document-tools.js'

const sessionId = 'sessao-documentos-sinteticos'
const preparation: AlixTurnContext = { sessionId, clienteId: 'cliente-a', actionPolicy: 'prepare_only', actor: { id: 'consultor-fixture' } }
let documents: IngestedDocument[]
function document(id: string, clienteId?: string): IngestedDocument {
  return { id, sessionId, clienteId, filename: `${id}.txt`, mimetype: 'text/plain', sizeBytes: 50,
    uploadedAt: '2026-09-07T12:00:00Z', kind: 'text', extractedText: `Conteúdo sintético exclusivo de ${id}.`,
    metadata: { processingState: 'completed_basic', ...(!clienteId ? { clientScopeReview: { status: 'pending' } } : {}) } }
}
function orchestratorTools(clienteId?: string) {
  const orch = new OrchestratorService({} as any, '/tmp/alix-document-scope-fixture', { alix: {} as any })
  const { registry } = (orch as any).buildTools(sessionId, [], clienteId, []) as { registry: LLMToolRegistry }
  return { orch, registry }
}
function invoke(registry: LLMToolRegistry, name: string, input: Record<string, unknown> = {}, context = preparation) {
  return withAlixTurnContext(context, () => registry[name].handler(input)) as Promise<any>
}

beforeEach(() => {
  vi.clearAllMocks()
  documents = [document('doc-a', 'cliente-a'), document('doc-b', 'cliente-b'), document('doc-pendente')]
  mocks.get.mockImplementation(async (session: string, id: string) => documents.find(doc => doc.sessionId === session && doc.id === id) ?? null)
  mocks.list.mockImplementation(async (session: string) => documents.filter(doc => doc.sessionId === session))
  mocks.search.mockImplementation(async (options: any) => documents
    .filter(doc => doc.sessionId === options.sessionId && (!options.clienteId || doc.clienteId === options.clienteId)
      && (!options.documentId || doc.id === options.documentId))
    .map(doc => ({ documentId: doc.id, clienteId: doc.clienteId, filename: doc.filename, chunkId: `${doc.id}-chunk`,
      kind: 'text', source: 'fixture', score: 1, text: doc.extractedText, evidences: [] })))
  mocks.analyze.mockImplementation(async ({ documentId }: { documentId: string }) => ({
    analysis: { resumo: `Análise sintética de ${documentId}`, segmentAnalyses: [] }, cached: false,
    continuationRequired: false, sourceReprocessingRequired: false,
  }))
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Rede proibida nesta regressão') }))
})
afterEach(() => { vi.unstubAllGlobals() })

it('preparação lista apenas anexos do cliente ativo ou ainda sem vínculo na mesma sessão', async () => {
  const { registry } = orchestratorTools('cliente-a')
  const result = await invoke(registry, 'listar_documentos_sessao')
  expect(result.total).toBe(2)
  expect(result.documentos.map((doc: any) => doc.id)).toEqual(['doc-a', 'doc-pendente'])
  expect(JSON.stringify(result)).not.toContain('doc-b')
})

it.each(['ver_documento', 'analisar_documento_profundo', 'buscar_no_indice_documental'])(
  '%s recusa documento de outro cliente antes de ler, buscar ou executar análise', async name => {
    const { registry } = orchestratorTools('cliente-a')
    const result = await invoke(registry, name, { documentoId: 'doc-b', query: 'Conteúdo' })
    expect(result).toMatchObject({ ok: false, code: 'PREPARATION_DOCUMENT_CLIENT_MISMATCH' })
    expect(JSON.stringify(result)).not.toContain('Conteúdo sintético exclusivo de doc-b')
    expect(mocks.search).not.toHaveBeenCalled()
    expect(mocks.analyze).not.toHaveBeenCalled()
  },
)

it.each([undefined, 'cliente-b'])('índice impõe cliente da missão quando o modelo informa clienteId=%s', async clienteId => {
  const { registry } = orchestratorTools('cliente-a')
  const result = await invoke(registry, 'buscar_no_indice_documental', { query: 'Conteúdo', ...(clienteId ? { clienteId } : {}) })
  expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({ sessionId, clienteId: 'cliente-a' }))
  expect(result.hits.map((hit: any) => hit.documentId)).toEqual(['doc-a'])
})

it.each([
  { label: 'preparação sem cliente', clienteId: undefined, context: { sessionId, actionPolicy: 'prepare_only' } as AlixTurnContext },
  { label: 'conversa normal', clienteId: 'cliente-a', context: { sessionId, clienteId: 'cliente-a' } as AlixTurnContext },
])('$label preserva o escopo de sessão das quatro ferramentas', async ({ clienteId, context }) => {
  const { registry } = orchestratorTools(clienteId)
  expect((await invoke(registry, 'listar_documentos_sessao', {}, context)).total).toBe(3)
  expect((await invoke(registry, 'ver_documento', { documentoId: 'doc-b' }, context)).extractedText).toContain('doc-b')
  expect((await invoke(registry, 'analisar_documento_profundo', { documentoId: 'doc-b' }, context)).resumo).toContain('doc-b')
  const result = await invoke(registry, 'buscar_no_indice_documental', { query: 'Conteúdo' }, context)
  expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({ clienteId: undefined }))
  expect(result.hits.map((hit: any) => hit.documentId)).toContain('doc-b')
})

it('documento sem vínculo e com revisão pendente continua disponível para leitura e análise', async () => {
  const { registry } = orchestratorTools('cliente-a')
  expect((await invoke(registry, 'ver_documento', { documentoId: 'doc-pendente' })).extractedText).toContain('doc-pendente')
  expect((await invoke(registry, 'analisar_documento_profundo', { documentoId: 'doc-pendente' })).resumo).toContain('doc-pendente')
  const sub = buildSubAgentDocumentTools({ sessionId, clienteId: 'cliente-a', documentIds: ['doc-pendente'],
    orchestratorHistory: [], parentToolCalls: [], hitl: true })
  expect(await sub.registry.ver_documento_anexado.handler({ documentoId: 'doc-pendente' })).toMatchObject({
    ok: true, documento: { textoExtraido: expect.stringContaining('doc-pendente') },
  })
})

it('delegação revalida vínculo confirmado para outro cliente depois de formar os anexos autorizados', async () => {
  const { orch, registry } = orchestratorTools('cliente-a')
  const pending = documents.find(doc => doc.id === 'doc-pendente')!
  vi.spyOn((orch as any).docGenerator, 'run').mockImplementation(async (_goal: unknown, ctx: any) => {
    expect(ctx.documentIds).toContain(pending.id)
    expect(ctx.documentIds).not.toContain('doc-b')
    const sub = buildSubAgentDocumentTools(ctx)
    pending.clienteId = 'cliente-b'
    return sub.registry.ver_documento_anexado.handler({ documentoId: pending.id })
  })
  const result = await invoke(registry, 'delegate_doc_generator', { tipo: 'parecer' })
  expect(result).toMatchObject({ ok: false, code: 'DOCUMENT_CLIENT_MISMATCH' })
  expect(mocks.get).toHaveBeenCalledWith(sessionId, pending.id)
  expect(JSON.stringify(result)).not.toContain('Conteúdo sintético')
})

it.each([
  { clienteId: 'cliente-a', documentId: 'doc-a' },
  { clienteId: undefined, documentId: 'doc-b' },
])('subagente preserva leitura autorizada de $documentId no contexto $clienteId', async ({ clienteId, documentId }) => {
  const { registry } = buildSubAgentDocumentTools({ sessionId, clienteId, documentIds: [documentId],
    orchestratorHistory: [], parentToolCalls: [], hitl: true })
  expect(await registry.ver_documento_anexado.handler({ documentoId: documentId })).toMatchObject({
    ok: true, documento: { textoExtraido: expect.stringContaining(documentId) },
  })
})
