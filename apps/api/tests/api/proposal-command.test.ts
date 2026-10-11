import Fastify from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  insertCliente: vi.fn(), writeCliente: vi.fn(), writeProposta: vi.fn(), audit: vi.fn(),
  enrich: vi.fn(), getLead: vi.fn(), schedule: vi.fn(), memory: vi.fn(),
  demanda: vi.fn(), demandaUpdate: vi.fn(), deal: vi.fn(), contract: vi.fn(), workflow: vi.fn(), getProposta: vi.fn(),
}))
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => true, getPool: () => { throw new Error('Banco real proibido no teste') } }))
vi.mock('../../src/db/ClienteRepository.js', () => ({
  insertClienteStrict: mocks.insertCliente, upsertClienteStrict: mocks.writeCliente,
  upsertCliente: vi.fn(), listClientes: async () => [], deleteCliente: vi.fn(), findClienteByCpfCnpj: async () => null,
  normalizeCpfCnpj: (value: unknown) => String(value ?? '').replace(/\D/g, ''),
  isValidCpfCnpj: (value: unknown) => [11, 14].includes(String(value ?? '').replace(/\D/g, '').length),
}))
vi.mock('../../src/db/PropostaRepository.js', () => ({
  upsertPropostaStrict: mocks.writeProposta, upsertProposta: vi.fn(), listPropostas: async () => [], getProposta: mocks.getProposta, deleteProposta: vi.fn(),
}))
vi.mock('../../src/db/AuditLog.js', () => ({ auditAsync: mocks.audit }))
vi.mock('../../src/services/prospeccao/ProspeccaoService', () => ({ getProspeccaoService: () => ({ enriquecerCliente: mocks.enrich, getLead: mocks.getLead }) }))
vi.mock('../../src/services/cliente/AutoCalcOrchestrator.js', () => ({
  getAutoCalcOrchestrator: () => ({ schedule: mocks.schedule, orchestrate: async () => { throw new Error('AutoCalc desativado no teste') } }),
  buildSraiInput: vi.fn(), buildAbsInput: vi.fn(),
}))
vi.mock('../../src/services/cliente/AnalisesBus.js', () => ({ getAnalisesBus: () => ({ onInvalidar: vi.fn(), emitAtualizada: vi.fn() }) }))
vi.mock('../../src/services/cliente/advisor/SmartAdvisor.js', () => ({ getSmartAdvisor: vi.fn() }))
vi.mock('../../src/services/ScoreSRAI.js', () => ({ calcularSRAI: vi.fn() }))
vi.mock('../../src/services/VerificadorABS.js', () => ({ verificarABS: vi.fn() }))
vi.mock('../../src/services/llm/ProviderConfig.js', () => ({ isPrimaryLLMEnabled: () => false }))
vi.mock('../../src/services/llm/OpenAIClient.js', () => ({ generateStructured: vi.fn() }))
vi.mock('../../src/services/llm/LLMConfig.js', () => ({ MODEL_REGISTRY: {}, getModelForRole: vi.fn() }))
vi.mock('../../src/services/alix/intake/DocumentIntakeService.js', () => ({ getDocumentIntakeService: vi.fn() }))
vi.mock('../../src/services/alix/intake/ClientOnboardingDossierService.js', () => ({ buildClientOnboardingDossier: vi.fn(), buildOnboardingDocumentPreview: vi.fn() }))
vi.mock('../../src/services/alix/intake/DocumentVaultBridgeService.js', () => ({ attachAlixDocumentToCliente: vi.fn() }))
vi.mock('../../src/services/alix/memory/AlixMemoryEvents.js', () => ({ rememberClienteSnapshot: mocks.memory, rememberPropostaCliente: mocks.memory }))
vi.mock('../../src/services/cliente/ClienteFinancialHealthService.js', () => ({ calcularSaudeFinanceiraCliente: vi.fn() }))
vi.mock('../../src/services/cliente/ClienteDemandaService.js', () => ({ getClienteDemandaService: () => ({ ensureForProposal: mocks.demanda, update: mocks.demandaUpdate }) }))
vi.mock('../../src/services/dealRoom/DealRoomService.js', () => ({ getDealRoomService: () => ({ ensureForProposal: mocks.deal }) }))
vi.mock('../../src/services/core/ClientCoreService.js', () => ({ getClientCoreService: () => ({ ensureContractDraftForAcceptedProposal: mocks.contract }) }))
vi.mock('../../src/services/PdfGenerator.js', () => ({ generatePropostaPdf: vi.fn() }))
vi.mock('../../src/services/PropostaGeneratorInteligente.js', () => ({ gerarPropostaInteligente: vi.fn() }))

vi.mock('../../src/services/propostas/ProposalWorkflowService.js', () => ({
  updateProposalWorkflow: mocks.workflow, prepareProposalPatch: vi.fn(), deleteProposalWorkflow: vi.fn(),
}))
import propostasRoutes, { propostas, updatePropostaCommand } from '../../src/routes/propostas.js'
import { normalizeAlixProposalPatch } from '../../src/services/alix/crm/proposal-patch.js'

const app = Fastify()
const original = { id: 'prop-fixture', clienteId: 'cli-fixture', clienteNome: 'Cliente sintético', credor: 'Credor teste', titulo: 'Proposta teste',
  tipo: 'renegociacao', status: 'enviada', revision: 2, valorDivida: '100.00', valorProposta: '75.00', descontoPercentual: 25,
  itens: [], condicoes: [], fundamentacao: '', observacoes: '', dataCriacao: '2026-01-01', dataValidade: '2026-12-01', ultimaAtualizacao: '2026-01-01', pdfUrl: null,
} as Parameters<typeof propostas.set>[1]
function result(status = 'aceita', revision = 3, changed = true) {
  return { proposta: { ...original, status, revision }, previous: original, changed, negociacaoId: 'neg-fixture', contratoId: 'ctr-fixture', eventIds: [] }
}
beforeAll(async () => { await app.register(propostasRoutes); await app.ready() })
beforeEach(() => {
  vi.clearAllMocks(); propostas.clear(); propostas.set(original.id, structuredClone(original))
  mocks.workflow.mockReset().mockResolvedValue(result())
})
afterAll(async () => { await app.close() })

it('PATCH só publica cache depois do commit e conserva os vínculos na resposta', async () => {
  let commit!: (value: ReturnType<typeof result>) => void
  mocks.workflow.mockReturnValueOnce(new Promise(resolve => { commit = resolve }))
  const pending = app.inject({ method: 'PATCH', url: '/api/propostas/prop-fixture', payload: { status: 'aceita', expectedRevision: 2 } }).then(value => value)
  await vi.waitFor(() => expect(mocks.workflow).toHaveBeenCalledOnce())
  expect(propostas.get(original.id)?.status).toBe('enviada')
  expect(mocks.memory).not.toHaveBeenCalled()
  expect(mocks.workflow).toHaveBeenCalledWith({ id: original.id, patch: { status: 'aceita' }, expectedRevision: 2, actor: { nome: 'sistema' } })
  commit(result())
  const response = await pending
  expect(response.statusCode).toBe(200)
  expect(response.json()).toMatchObject({ data: { status: 'aceita', revision: 3 }, meta: { negociacaoId: 'neg-fixture', contratoId: 'ctr-fixture' } })
  expect(propostas.get(original.id)?.status).toBe('aceita')
  expect(mocks.audit).not.toHaveBeenCalled() // auditoria já está no commit do serviço
})
it.each([409, 404, 422, 503])('falha %s preserva cache e memória e não declara sucesso', async status => {
  const previous = propostas.get(original.id)
  mocks.workflow.mockRejectedValueOnce(Object.assign(new Error('Falha sintética'), { statusCode: status, code: 'SYNTHETIC' }))
  const response = await app.inject({ method: 'PATCH', url: '/api/propostas/prop-fixture', payload: { status: 'aceita' } })
  expect(response.statusCode).toBe(status)
  expect(response.json().success).toBe(false)
  expect(propostas.get(original.id)).toBe(previous)
  expect(mocks.memory).not.toHaveBeenCalled()
})
it('retry idêntico devolve vínculos sem repetir memória/auditoria', async () => {
  mocks.workflow.mockResolvedValueOnce(result('aceita', 3, false))
  const response = await app.inject({ method: 'PATCH', url: '/api/propostas/prop-fixture', payload: { status: 'aceita', expectedRevision: 2 } })
  expect(response.statusCode).toBe(200)
  expect(response.json().meta.contratoId).toBe('ctr-fixture')
  expect(mocks.memory).not.toHaveBeenCalled()
})
it('ALIX usa o mesmo comando, traduz aliases e espera a gravação', async () => {
  const patch = normalizeAlixProposalPatch({ valor: '0.29', dividaTotal: '0.30', observacao: 'Nota', expectedRevision: 2 })
  await updatePropostaCommand(original.id, patch, { id: 'consultor-fixture', nome: 'Consultor teste' })
  expect(mocks.workflow).toHaveBeenCalledWith({ id: original.id, patch: { valorProposta: '0.29', valorDivida: '0.30', observacoes: 'Nota' }, expectedRevision: 2, actor: { id: 'consultor-fixture', nome: 'Consultor teste' } })
  mocks.workflow.mockRejectedValueOnce(new Error('PG indisponível'))
  await expect(updatePropostaCommand(original.id, { status: 'aceita' })).rejects.toThrow('PG indisponível')
})
it.each([{ valor: 'NaN' }, { status: 'aprovada' }, { estrategia: 'sem efeito', status: 'enviada' }, { prazoMeses: 12 }])('ALIX não confirma campos inválidos ou sem efeito: %j', patch => {
  expect(() => normalizeAlixProposalPatch(patch)).toThrow()
})
it('GET recupera revisão persistida depois de conflito, independente do Map antigo', async () => {
  mocks.getProposta.mockResolvedValueOnce(result().proposta)
  const response = await app.inject({ method: 'GET', url: '/api/propostas/prop-fixture' })
  expect(response.statusCode).toBe(200)
  expect(response.json().data.revision).toBe(3)
  expect(response.json().data.status).toBe('aceita')
})
it.each([{ expectedRevision: -1, status: 'aceita' }, { expectedRevision: 2 }, { valorProposta: '1.001' }])('payload inválido não alcança coordenador: %j', async payload => {
  const response = await app.inject({ method: 'PATCH', url: '/api/propostas/prop-fixture', payload })
  expect(response.statusCode).toBe(400)
  expect(mocks.workflow).not.toHaveBeenCalled()
})
