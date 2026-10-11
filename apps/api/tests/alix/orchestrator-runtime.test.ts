import { beforeEach, expect, it, vi } from 'vitest'
import type { LLMRunOpts } from '../../src/services/llm/types.js'

const mocks = vi.hoisted(() => {
  const missions = new Map<string, any>()
  const service = {
    get: vi.fn(async (id: string) => missions.get(id)),
    create: vi.fn(async (input: any) => { const m = { ...input, id: `mission-${missions.size}`, status: 'queued' }; missions.set(m.id, m); return m }),
    start: vi.fn(async (id: string) => Object.assign(missions.get(id), { status: 'running' })),
    advance: vi.fn(async (id: string) => missions.get(id)),
    addSources: vi.fn(async () => undefined),
    complete: vi.fn(async (id: string) => Object.assign(missions.get(id), { status: 'completed' })),
    fail: vi.fn(async (id: string) => Object.assign(missions.get(id), { status: 'failed' })),
    cancel: vi.fn(async (id: string) => Object.assign(missions.get(id), { status: 'cancelled' })),
  }
  return { run: vi.fn(), route: vi.fn(), document: vi.fn(), documents: vi.fn(), audit: { startTrail: vi.fn(), recordToolCall: vi.fn(), finishTrail: vi.fn() }, service, missions }
})
vi.mock('../../src/services/llm/OpenAIClient.js', async (actual) => ({ ...await actual<Record<string, unknown>>(), runOpenAI: mocks.run }))
vi.mock('../../src/services/alix/model-routing/AlixModelRouter.js', () => ({ resolveAlixModelSelection: mocks.route }))
vi.mock('../../src/services/alix/AlixAuditTrailService.js', () => ({ getAlixAuditTrailService: () => mocks.audit }))
vi.mock('../../src/services/alix/workspace/AlixMissionService.js', async (actual) => ({ ...await actual<Record<string, unknown>>(), getAlixMissionService: () => mocks.service }))
vi.mock('../../src/services/alix/learning/FeedbackService.js', () => ({ getFeedbackService: () => ({ recentLearnings: async () => [] }) }))
vi.mock('../../src/services/alix/AlixConfirmationStore.js', () => ({ getAlixConfirmationStore: () => ({}) }))
vi.mock('../../src/services/alix/telemetry.js', () => ({ appendTelemetry: vi.fn(), estimateCostUsd: () => 0 }))
vi.mock('../../src/services/alix/intake/DocumentIntakeService.js', async (actual) => ({ ...await actual<Record<string, unknown>>(), getDocumentIntakeService: () => ({ get: mocks.document, list: mocks.documents }) }))

import { OrchestratorService } from '../../src/services/alix/OrchestratorService.js'
import { getAlixTurnContext } from '../../src/services/alix/AlixTurnContext.js'
import { registerStores } from '../../src/services/AlixService.js'

const route = { mode: 'auto', model: 'model-selected', provider: 'foundry', deployment: 'model-selected', modelLabel: 'Selecionado', reason: 'Capacidade verificada', taskType: 'operational', fallback: false, preferredModel: 'model-selected', maxIterations: 10, maxOutputTokens: 4000, catalogCheckedAt: '2026-09-06T12:00:00Z' }
const result = (stopReason = 'completed') => ({ text: 'Consulta concluída com a fonte disponível.', toolsUsed: [], stopReason, model: 'model-effective', provider: 'foundry', deployment: 'deployment-effective', usage: { input_tokens: 10, output_tokens: 10 }, iterations: 1 })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.missions.clear()
  mocks.run.mockReset()
  mocks.route.mockReset().mockResolvedValue(route)
  mocks.document.mockReset()
  mocks.documents.mockReset().mockResolvedValue([])
  registerStores({ clientes: () => [], propostas: () => [], propostasInteligentes: () => [] })
})
function orchestrator() {
  const orch = new OrchestratorService({} as any, '/tmp/alix-runtime-fixture', { alix: {} as any })
  vi.spyOn(orch, 'loadOrCreateSession').mockImplementation(async (id) => ({ id: id || 'new', title: 'Nova conversa', createdAt: 1, updatedAt: 1, messages: [] }))
  vi.spyOn(orch as any, 'saveSession').mockResolvedValue(undefined)
  vi.spyOn(orch as any, 'buildInsightsContext').mockResolvedValue(null)
  vi.spyOn(orch as any, 'buildTools').mockImplementation((sessionId: string, _history: unknown, _client: unknown, _documents: unknown, context: any) => {
    const spec = { name: 'consultar_fixture', description: 'Consulta a fonte de teste', input_schema: { type: 'object', properties: {} } }
    return { tools: [spec], registry: { [spec.name]: { spec, handler: async () => ({ sessionId, context: getAlixTurnContext(), delegateAuditKey: context.auditTrailKey, source: 'fixture-isolada' }) } } }
  })
  return orch
}

it('usa decisão de modelo e emite progresso real com fonte e modelo efetivo persistidos', async () => {
  const orch = orchestrator()
  const progress = vi.fn()
  const routing = vi.fn()
  mocks.run.mockImplementation(async (_messages, opts: LLMRunOpts) => {
    expect(opts.model).toBe('model-selected')
    expect(opts.tools?.map((tool) => tool.name)).toContain('descobrir_ferramentas')
    await opts.toolRegistry!.consultar_fixture.handler({})
    return result()
  })
  const response = await orch.chat('a', 'Consulte a fonte', { modelPreference: 'auto', onProgress: progress, onRouting: routing })
  expect(routing).toHaveBeenNthCalledWith(1, route)
  expect(progress.mock.calls.map(([event]) => event.phase)).toEqual(['started', 'completed'])
  expect(mocks.audit.recordToolCall).toHaveBeenCalledWith(expect.stringContaining('a:'), 'consultar_fixture', {}, expect.objectContaining({ source: 'fixture-isolada' }), expect.any(Number))
  expect(response.session.messages.at(-1)?.metadata).toMatchObject({ routing: { model: 'model-effective' }, costKnown: false, executionStatus: 'completed' })
  expect(response.mission?.status).toBe('completed')
})

it.each(['max_iterations', 'incomplete', 'cancelled'])('estado de geração %s não conclui missão com sucesso', async (state) => {
  const orch = orchestrator()
  mocks.run.mockResolvedValue(result(state))
  const response = await orch.chat('a', 'Faça a consulta')
  expect(response.mission?.status).toBe('failed')
  expect(response.reply).toContain('Trabalho interrompido')
  expect(response.session.messages.at(-1)?.metadata).toMatchObject({ executionStatus: 'incomplete', stopReason: state })
  expect(mocks.service.complete).not.toHaveBeenCalled()
})

it('cancelamento depois do modelo impede entrega como concluída e encerra a trilha', async () => {
  const orch = orchestrator()
  const abort = new AbortController()
  mocks.run.mockImplementation(async () => { abort.abort(new Error('Cancelado')); return result() })
  await expect(orch.chat('a', 'Faça a consulta', { signal: abort.signal })).rejects.toThrow('Cancelado')
  expect(mocks.service.cancel).toHaveBeenCalledTimes(1)
  expect(mocks.service.complete).not.toHaveBeenCalled()
  expect(mocks.audit.finishTrail).toHaveBeenCalledTimes(1)
})

it('falha de preparação após iniciar a missão encerra failed em vez de deixar running', async () => {
  const orch = orchestrator()
  vi.mocked((orch as any).buildTools).mockImplementation(() => { throw new Error('Catálogo indisponível') })
  await expect(orch.chat('a', 'Faça a consulta')).rejects.toThrow('Catálogo indisponível')
  expect(mocks.service.fail).toHaveBeenCalledTimes(1)
  expect(mocks.run).not.toHaveBeenCalled()
  expect(mocks.audit.finishTrail).toHaveBeenCalledTimes(1)
})

it('erro na seleção não cria missão nem inicia geração com modelo presumido', async () => {
  const orch = orchestrator()
  mocks.route.mockRejectedValue(new Error('Modelo indisponível'))
  await expect(orch.chat('a', 'Faça a consulta')).rejects.toThrow('Modelo indisponível')
  expect(mocks.service.create).not.toHaveBeenCalled()
  expect(mocks.run).not.toHaveBeenCalled()
})

it('um retry que perde a disputa de início não marca a missão vencedora como falha', async () => {
  const orch = orchestrator()
  mocks.service.start.mockRejectedValueOnce(Object.assign(new Error('Trabalho já iniciado'), { code: 'ALIX_MISSION_ALREADY_STARTED', statusCode: 409 }))
  await expect(orch.chat('a', 'Prepare a análise')).rejects.toThrow('Trabalho já iniciado')
  expect(mocks.service.fail).not.toHaveBeenCalled()
  expect(mocks.run).not.toHaveBeenCalled()
})

it('delegação relê anexos anteriores da mesma conversa e preserva cliente ativo', async () => {
  const orch = new OrchestratorService({} as any, '/tmp/alix-runtime-fixture', { alix: {} as any })
  const delegate = vi.spyOn((orch as any).docGenerator, 'run').mockResolvedValue({ summary: 'Rascunho preparado' })
  mocks.documents.mockResolvedValue([
    { id: 'anexo-anterior', clienteId: 'cliente-a', metadata: {} },
    { id: 'outro-cliente', clienteId: 'cliente-b', metadata: {} },
  ])
  const { registry } = (orch as any).buildTools('sessao-a', [], 'cliente-a', [])
  await registry.delegate_doc_generator.handler({ tipo: 'parecer' })
  expect(delegate).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    sessionId: 'sessao-a', clienteId: 'cliente-a', documentIds: ['anexo-anterior'],
  }))
})

it('anexo sem destino revisado não prepara enriquecimento nem delega escrita; vínculo verificado libera a delegação', async () => {
  const alix = { handle_onboarding_cliente_completo: vi.fn(), handle_atualizar_cliente_completo: vi.fn() }
  const orch = new OrchestratorService({} as any, '/tmp/alix-runtime-fixture', { alix: alix as any })
  const delegate = vi.spyOn((orch as any).crmWriter, 'run').mockResolvedValue({ summary: 'Preparado na fixture' })
  const document = { id: 'document-a', metadata: { clientScopeReview: { status: 'pending', requestedBy: 'consultor-a' } } }
  mocks.document.mockResolvedValue(document)
  mocks.documents.mockResolvedValue([document])
  const { registry } = (orch as any).buildTools('sessao-a', [], 'cliente-a', [])
  expect(await registry.criar_lead_de_documento.handler({ documentoId: document.id })).toMatchObject({ code: 'DOCUMENT_CLIENT_SCOPE_PENDING', pendingConfirmation: false })
  expect(await registry.delegate_crm_writer.handler({ intent: 'Atualizar cadastro' })).toMatchObject({ code: 'DOCUMENT_CLIENT_SCOPE_PENDING' })
  expect(delegate).not.toHaveBeenCalled()
  expect(alix.handle_onboarding_cliente_completo).not.toHaveBeenCalled()
  expect(alix.handle_atualizar_cliente_completo).not.toHaveBeenCalled()
  expect(mocks.run).not.toHaveBeenCalled()
  document.metadata.clientScopeReview.status = 'verified'
  await registry.delegate_crm_writer.handler({ intent: 'Atualizar cadastro' })
  expect(delegate).toHaveBeenCalledTimes(1)
})

it('a consulta assíncrona de CPF reconhece cliente existente antes de escolher cadastro documental', async () => {
  const client = { id: 'cliente-existente', nome: 'Cliente Sintético', cpfCnpj: '12345678901', valorTotalDivida: '900.00', dividas: [] }
  registerStores({ clientes: () => [client], propostas: () => [], propostasInteligentes: () => [] })
  const alix = {
    handle_onboarding_cliente_completo: vi.fn(() => ({ metadata: { pendingConfirmation: true } })),
    handle_atualizar_cliente_completo: vi.fn(() => ({ metadata: { pendingConfirmation: true } })),
  }
  const orch = new OrchestratorService({} as any, '/tmp/alix-runtime-fixture', { alix: alix as any })
  mocks.document.mockResolvedValue({ id: 'doc-financeiro', filename: 'contrato-fixture.pdf', sessionId: 'sessao-a', metadata: { smartExtraction: {
    documentoId: 'doc-financeiro', sessionId: 'sessao-a', tipoDocumento: 'contrato_credito_rural', confianca: 0.9,
    clienteData: { nome: 'Cliente Sintético', cpfCnpj: '123.456.789-01' }, dividas: [{ contrato: 'NOVO', valorOriginal: 500 }],
    propriedades: [], entidades: [], riscos: [], lacunas: [], acoesSugeridas: [], evidencias: [],
  } } })
  const { registry } = (orch as any).buildTools('sessao-a', [], undefined, [])
  const response = await registry.criar_lead_de_documento.handler({ documentoId: 'doc-financeiro' })
  expect(response).toMatchObject({ operation: 'update', pendingConfirmation: true })
  expect(alix.handle_onboarding_cliente_completo).not.toHaveBeenCalled()
  expect(alix.handle_atualizar_cliente_completo).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 'cliente-existente', dividas: [{ contrato: 'NOVO', valorOriginal: '500.00' }] }))
  expect(client.valorTotalDivida).toBe('900.00')
  expect(mocks.run).not.toHaveBeenCalled()
})

it('duas conversas intercaladas no mesmo singleton conservam suas trilhas e contextos', async () => {
  const orch = orchestrator()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let entered!: () => void
  const firstEntered = new Promise<void>((resolve) => { entered = resolve })
  const outputs: any[] = []
  mocks.run.mockImplementation(async (messages: any[], opts: LLMRunOpts) => {
    if (messages.at(-1)?.content === 'consulta A') { entered(); await gate }
    outputs.push(await opts.toolRegistry!.consultar_fixture.handler({}))
    return result()
  })
  const a = orch.chat('a', 'consulta A')
  await firstEntered
  const b = await orch.chat('b', 'consulta B')
  release(); await a
  expect(b.session.id).toBe('b')
  for (const output of outputs) {
    expect(output.context.sessionId).toBe(output.sessionId)
    expect(output.context.auditTrailKey).toBe(output.delegateAuditKey)
    expect(output.delegateAuditKey.startsWith(`${output.sessionId}:`)).toBe(true)
  }
  expect(mocks.audit.finishTrail).toHaveBeenCalledTimes(2)
})

it.each([true, false])('entrega normaliza link somente com artefato observado neste turno (recibo=%s) e preserva histórico', async (hasReceipt) => {
  const orch = orchestrator()
  const id = '5887ed2c-660e-40ad-8969-ecd6676dcfba'
  const url = `/api/alix/documents/generated/${id}`
  const oldContent = `Mensagem anterior: sandbox:${url}`
  vi.mocked(orch.loadOrCreateSession).mockResolvedValue({ id: 'a', title: 'Documentos', createdAt: 1, updatedAt: 1, messages: [{ id: 'old', role: 'assistant', content: oldContent, timestamp: 1 }] })
  const spec = { name: 'delegate_doc_generator', description: 'Emitir arquivo PDF real', input_schema: { type: 'object', properties: {} } }
  const receipt = { tool: 'gerar_documento_fundamentado', result: { ok: true, status: 'rascunho', document: { id, kind: 'pdf', filename: 'relatorio-fixture.pdf', sizeBytes: 75846, downloadUrl: url } } }
  vi.mocked((orch as any).buildTools).mockReturnValue({ tools: [spec], registry: { [spec.name]: { spec, handler: async () => ({ status: 'completed', summary: `sandbox:${url}`, toolEvidence: hasReceipt ? [receipt] : [] }) } } })
  mocks.run.mockImplementation(async (_messages, opts: LLMRunOpts) => {
    await opts.toolRegistry!.delegate_doc_generator.handler({})
    return { ...result(), text: `Download: sandbox:${url}` }
  })
  const response = await orch.chat('a', 'Entregue o documento PDF para download')
  const expected = hasReceipt ? `Download: [Baixar PDF](${url})` : `Download: sandbox:${url}`
  expect(response.reply).toBe(expected)
  expect(response.session.messages.at(-1)?.content).toBe(expected)
  expect(response.session.messages[0].content).toBe(oldContent)
  expect(mocks.service.complete).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ response: expected }))
})


it('continuação recupera o objetivo humano fora da janela, seleciona recursos e mantém fontes separadas', async () => {
  const orch = orchestrator()
  const objective = 'Pesquise as fontes, analise profundamente os contratos e prepare um parecer em PDF. Não altere dados.'
  const history = [
    { id: 'objective', role: 'user' as const, content: objective, timestamp: 1 },
    ...Array.from({ length: 35 }, (_, i) => ({ id: `follow-${i}`, role: 'user' as const, content: 'continue', timestamp: i + 2 })),
  ]
  vi.mocked(orch.loadOrCreateSession).mockResolvedValue({ id: 'a', title: 'Parecer em andamento', createdAt: 1, updatedAt: 1, messages: history })
  mocks.run.mockImplementation(async (_messages, opts: LLMRunOpts) => {
    const system = JSON.stringify(opts.system)
    expect(system).toContain(objective)
    expect(system).toContain('task_continuity')
    expect(system).toContain('delegate_doc_generator')
    expect(system).not.toContain('Resumo; Evidências usadas; Análise; Próxima ação recomendada')
    return result()
  })
  const response = await orch.chat('a', 'continue', { analysisMode: 'deep' })
  expect(mocks.route).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining(objective) }))
  expect(response.session.messages.at(-2)?.content).toBe('continue')
  expect(response.session.messages.at(-2)?.metadata).toMatchObject({ continuationOf: 'objective' })
})


it('continuação de preparo conserva a restrição operacional da missão anterior', async () => {
  const orch = orchestrator()
  mocks.missions.set('prior', { id: 'prior', sessionId: 'a', status: 'completed', sources: [{ kind: 'operational_handoff', evidence: { actionPolicy: 'prepare_only' } }] })
  vi.mocked(orch.loadOrCreateSession).mockResolvedValue({ id: 'a', title: 'Preparo', createdAt: 1, updatedAt: 1, messages: [
    { id: 'pedido', role: 'user', content: 'Prepare a análise e os próximos passos.', timestamp: 1 },
    { id: 'resposta', role: 'assistant', content: 'Rascunho preparado.', timestamp: 2, metadata: { missionId: 'prior' } },
  ] })
  mocks.run.mockImplementation(async (_messages, opts: LLMRunOpts) => {
    expect(JSON.stringify(opts.system)).toContain('Não afirme contato realizado, envio, aprovação ou alteração no CRM')
    return result()
  })
  const response = await orch.chat('a', 'continue')
  expect(response.session.messages.at(-2)?.metadata).toMatchObject({ actionPolicy: 'prepare_only', continuationOf: 'pedido' })
  expect(mocks.service.create).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining('Prepare a análise') }))
})
