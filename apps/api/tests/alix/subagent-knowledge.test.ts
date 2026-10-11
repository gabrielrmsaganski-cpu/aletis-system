import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ render: vi.fn(), facts: vi.fn(), search: vi.fn() }))
vi.mock('../../src/services/alix/memory/AlixMemoryService.js', () => ({ getAlixMemoryService: () => ({ render: mocks.render }) }))
vi.mock('../../src/services/alix/memory/AlixMemoryFactExtractor.js', () => ({ getFactsForCliente: mocks.facts, formatFactsForPrompt: () => 'Fato contestado: conferir fonte.' }))
vi.mock('../../src/services/alix/rag/RagService.js', () => ({ searchRAG: mocks.search }))
import { buildSubAgentKnowledgeTools } from '../../src/services/alix/agents/knowledge-tools.js'
beforeEach(() => { vi.clearAllMocks(); mocks.render.mockResolvedValue('Memória do cliente A'); mocks.facts.mockResolvedValue([]); mocks.search.mockResolvedValue([]) })
const context = { sessionId: 'sessao-a', clienteId: 'cliente-a', orchestratorHistory: [], parentToolCalls: [], hitl: true }
it('fornece memória e fatos reais do cliente da delegação sem aceitar outro ID do modelo', async () => {
  const tools = buildSubAgentKnowledgeTools(context)
  const result = await tools.registry.memoria_cliente.handler({ clienteId: 'cliente-b' })
  expect(result).toMatchObject({ clienteId: 'cliente-a', fatos: 'Fato contestado: conferir fonte.' })
  expect(mocks.render).toHaveBeenCalledWith('cliente-a')
  expect(mocks.facts).toHaveBeenCalledWith('cliente-a', 80)
})
it('pesquisa documentos históricos exclusivamente no cliente da delegação', async () => {
  const tools = buildSubAgentKnowledgeTools(context)
  await tools.registry.buscar_conhecimento_cliente.handler({ query: 'garantia rural', clienteId: 'cliente-b' })
  expect(mocks.search).toHaveBeenCalledWith({ query: 'garantia rural', clienteId: 'cliente-a', topK: 8 })
})
it('não amplia pesquisa quando falta cliente ativo', async () => {
  const tools = buildSubAgentKnowledgeTools({ ...context, clienteId: undefined })
  expect(await tools.registry.buscar_conhecimento_cliente.handler({ query: 'garantia' })).toMatchObject({ ok: false })
  expect(mocks.search).not.toHaveBeenCalled()
})
