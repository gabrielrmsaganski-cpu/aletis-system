import Fastify from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  insertCliente: vi.fn(), writeCliente: vi.fn(), writeProposta: vi.fn(), audit: vi.fn(),
  enrich: vi.fn(), getLead: vi.fn(), schedule: vi.fn(), memory: vi.fn(),
  demanda: vi.fn(), demandaUpdate: vi.fn(), deal: vi.fn(), contract: vi.fn(),
}))
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => false, getPool: () => { throw new Error('Banco real proibido no teste') } }))
vi.mock('../../src/db/ClienteRepository.js', () => ({
  insertClienteStrict: mocks.insertCliente, upsertClienteStrict: mocks.writeCliente,
  upsertCliente: vi.fn(), listClientes: async () => [], deleteCliente: vi.fn(), findClienteByCpfCnpj: async () => null,
  normalizeCpfCnpj: (value: unknown) => String(value ?? '').replace(/\D/g, ''),
  isValidCpfCnpj: (value: unknown) => [11, 14].includes(String(value ?? '').replace(/\D/g, '').length),
}))
vi.mock('../../src/db/PropostaRepository.js', () => ({
  upsertPropostaStrict: mocks.writeProposta, upsertProposta: vi.fn(), listPropostas: async () => [], deleteProposta: vi.fn(),
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

import clientesRoutes, { clientes } from '../../src/routes/clientes.js'
import propostasRoutes, { propostas } from '../../src/routes/propostas.js'
import { CrmLeadService } from '../../src/services/whatsapp/CrmLeadService.js'
import { crmDiscountPercent, crmMoneySchema } from '../../src/lib/crm-write-validation.js'

const app = Fastify()
const createInput = { nome: 'Cliente sintético', cidade: 'Cidade teste', uf: 'MT', escritorio: 'Aletis' }
function clienteFixture() {
  return { id: 'cli-test', ...createInput, cpfCnpj: '', estagio: 'analise', telefone: '', email: '', atividade: '', areaTotalHa: 0,
    culturas: [], credor: 'Credor teste', consultor: 'Equipe teste', valorTotalDivida: 100, valorTotalPago: 0, dividas: [], pagamentos: [],
    timeline: [{ data: '2026-01-01', tipo: 'contato', descricao: 'Evento original' }],
    dataCadastro: '2026-01-01', ultimaAtualizacao: '2026-01-01', observacoes: '', car: { codImovel: 'CAR-TESTE' },
  } as unknown as Parameters<typeof clientes.set>[1]
}
function propostaFixture() {
  return { id: 'prop-test', clienteId: 'cli-test', clienteNome: 'Cliente sintético', credor: 'Credor teste', titulo: 'Título original',
    tipo: 'renegociacao', status: 'em_analise', valorDivida: 100, valorProposta: 75, descontoPercentual: 25,
    itens: [{ descricao: 'Item original', valor: 75, tipo: 'pagamento' }], condicoes: [], fundamentacao: '', observacoes: '',
    dataCriacao: '2026-01-01', dataValidade: '2026-02-01', ultimaAtualizacao: '2026-01-01', pdfUrl: null,
  } as Parameters<typeof propostas.set>[1]
}
function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Rede real proibida no teste') }))
  // Limpar antes do registro impede backfills dos dados seed do módulo.
  clientes.clear()
  propostas.clear()
  await app.register(clientesRoutes)
  await app.register(propostasRoutes)
  await app.ready()
})
beforeEach(() => {
  vi.clearAllMocks()
  clientes.clear()
  propostas.clear()
  mocks.insertCliente.mockReset().mockResolvedValue(undefined)
  mocks.writeCliente.mockReset().mockResolvedValue(undefined)
  mocks.writeProposta.mockReset().mockResolvedValue(undefined)
  mocks.enrich.mockReset().mockResolvedValue({ errors: {} })
  mocks.getLead.mockReset().mockImplementation((cpfCnpj: string) => ({
    nome: 'Lead sintético', cpfCnpj, cpfCnpjClean: cpfCnpj, uf: 'MT', debts: [], totalDivida: 0,
    agroSignals: [], qtdInscricoes: 0, temAjuizada: false,
    score: { total: 0, classificacao: 'frio', honorariosEstimados: 0 },
  }))
  mocks.demanda.mockReset().mockResolvedValue({ demanda: { id: 'dem-test' } })
  mocks.demandaUpdate.mockReset().mockResolvedValue(undefined)
  mocks.deal.mockReset().mockResolvedValue({ negociacao: { id: 'neg-test' } })
  mocks.contract.mockReset().mockResolvedValue({ contract: { id: 'contract-test' } })
})
afterEach(async () => { await new Promise(resolve => setImmediate(resolve)) })
afterAll(async () => { await app.close(); vi.unstubAllGlobals() })

describe('POST clientes: criação sem sobrescrita', () => {
  it('dois cadastros em paralelo recebem UUIDs distintos e só aparecem após INSERT', async () => {
    const gate = deferred()
    mocks.insertCliente.mockImplementation(() => gate.promise)
    const first = app.inject({ method: 'POST', url: '/api/clientes', payload: createInput }).then(response => response)
    const second = app.inject({ method: 'POST', url: '/api/clientes', payload: createInput }).then(response => response)
    await vi.waitFor(() => expect(mocks.insertCliente).toHaveBeenCalledTimes(2))
    expect(clientes.size).toBe(0)
    const ids = mocks.insertCliente.mock.calls.map(([client]) => client.id)
    expect(new Set(ids).size).toBe(2)
    ids.forEach(id => expect(id).toMatch(/^cli-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/))
    gate.resolve()
    const responses = await Promise.all([first, second])
    expect(responses.map(response => response.statusCode)).toEqual([201, 201])
    expect(clientes.size).toBe(2)
  })

  it.each([
    [Object.assign(new Error('conflito simulado'), { code: '23505' }), 409],
    [new Error('falha simulada', { cause: Object.assign(new Error('conflito'), { code: '23505' }) }), 409],
    [new Error('banco indisponível simulado'), 503],
  ])('falha de INSERT não publica cliente nem dispara automação (%s)', async (error, status) => {
    mocks.insertCliente.mockRejectedValueOnce(error)
    const response = await app.inject({ method: 'POST', url: '/api/clientes', payload: createInput })
    expect(response.statusCode).toBe(status)
    expect(clientes.size).toBe(0)
    expect(mocks.audit).not.toHaveBeenCalled()
    expect(mocks.enrich).not.toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
  })

  it('mantém string monetária sem perda de centavos no INSERT e na resposta', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/clientes', payload: { ...createInput, valorTotalDivida: '9007199254740991.99' } })
    expect(response.statusCode).toBe(201)
    expect(mocks.insertCliente.mock.calls[0][0].valorTotalDivida).toBe('9007199254740991.99')
    expect(response.json().data.valorTotalDivida).toBe('9007199254740991.99')
  })
})

describe('POST iniciar-prospeccao: segunda entrada de criação do CRM', () => {
  it('importações distintas concorrentes recebem UUIDs e não aparecem antes do INSERT', async () => {
    const gate = deferred()
    mocks.insertCliente.mockImplementation(() => gate.promise)
    const first = app.inject({ method: 'POST', url: '/api/clientes/iniciar-prospeccao', payload: { cpfCnpj: '00000000000' } }).then(response => response)
    const second = app.inject({ method: 'POST', url: '/api/clientes/iniciar-prospeccao', payload: { cpfCnpj: '11111111111' } }).then(response => response)
    await vi.waitFor(() => expect(mocks.insertCliente).toHaveBeenCalledTimes(2))
    expect(clientes.size).toBe(0)
    expect(new Set(mocks.insertCliente.mock.calls.map(([client]) => client.id)).size).toBe(2)
    gate.resolve()
    expect((await Promise.all([first, second])).map(response => response.statusCode)).toEqual([201, 201])
    expect(clientes.size).toBe(2)
  })

  it('importações simultâneas do mesmo documento reutilizam o cadastro no processo', async () => {
    const gate = deferred()
    mocks.insertCliente.mockImplementation(() => gate.promise)
    const input = { method: 'POST' as const, url: '/api/clientes/iniciar-prospeccao', payload: { cpfCnpj: '00000000000' } }
    const first = app.inject(input).then(response => response)
    await vi.waitFor(() => expect(mocks.insertCliente).toHaveBeenCalledTimes(1))
    const second = app.inject(input).then(response => response)
    gate.resolve()
    const responses = await Promise.all([first, second])
    expect(responses.map(response => response.statusCode)).toEqual([201, 200])
    expect(responses[0].json().data.id).toBe(responses[1].json().data.id)
    expect(responses[1].json().jaExistia).toBe(true)
    expect(mocks.insertCliente).toHaveBeenCalledTimes(1)
    expect(clientes.size).toBe(1)
  })

  it.each([
    [Object.assign(new Error('colisão simulada'), { code: '23505' }), 409],
    [new Error('falha simulada'), 503],
  ])('falha de INSERT não declara sucesso ou publica cliente (%s)', async (error, status) => {
    mocks.insertCliente.mockRejectedValueOnce(error)
    const response = await app.inject({ method: 'POST', url: '/api/clientes/iniciar-prospeccao', payload: { cpfCnpj: '00000000000' } })
    expect(response.statusCode).toBe(status)
    expect(response.json().success).toBe(false)
    expect(clientes.size).toBe(0)
    expect(mocks.audit).not.toHaveBeenCalled()
    expect(mocks.enrich).not.toHaveBeenCalled()
  })
})

describe('PATCH clientes: validar e confirmar antes de publicar', () => {
  it.each([
    { estagio: 'nao-existe', observacoes: 'Não deve salvar' },
    { valorTotalPago: -1, observacoes: 'Não deve salvar' },
    { proximaAcao: { data: '2026-02-30', descricao: 'Data impossível' } },
    { timelineEvent: { tipo: 'contato' } },
  ])('rejeita payload inválido sem mutação parcial: %j', async (payload) => {
    const original = clienteFixture()
    clientes.set(original.id, original)
    const snapshot = structuredClone(original)
    const response = await app.inject({ method: 'PATCH', url: '/api/clientes/cli-test', payload })
    expect(response.statusCode).toBe(400)
    expect(clientes.get(original.id)).toBe(original)
    expect(original).toEqual(snapshot)
    expect(mocks.writeCliente).not.toHaveBeenCalled()
  })

  it('falha de PG mantém objeto e timeline originais, sem auditoria de sucesso', async () => {
    const original = clienteFixture()
    const snapshot = structuredClone(original)
    clientes.set(original.id, original)
    mocks.writeCliente.mockRejectedValueOnce(new Error('falha simulada'))
    const response = await app.inject({ method: 'PATCH', url: '/api/clientes/cli-test', payload: { estagio: 'negociacao', timelineEvent: { tipo: 'contato', descricao: 'Contato teste' } } })
    expect(response.statusCode).toBe(503)
    expect(clientes.get(original.id)).toBe(original)
    expect(original).toEqual(snapshot)
    expect(mocks.audit).not.toHaveBeenCalled()
    expect(mocks.memory).not.toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
  })

  it('serializa PATCH concorrentes e preserva as duas edições após commit', async () => {
    const original = clienteFixture()
    clientes.set(original.id, original)
    const gate = deferred()
    mocks.writeCliente.mockImplementationOnce(() => gate.promise)
    const first = app.inject({ method: 'PATCH', url: '/api/clientes/cli-test', payload: { observacoes: 'Primeira edição' } }).then(response => response)
    await vi.waitFor(() => expect(mocks.writeCliente).toHaveBeenCalledTimes(1))
    const second = app.inject({ method: 'PATCH', url: '/api/clientes/cli-test', payload: { telefone: 'TESTE', valorTotalPago: '0.29' } }).then(response => response)
    expect(clientes.get(original.id)).toBe(original)
    expect(original.observacoes).toBe('')
    gate.resolve()
    expect((await Promise.all([first, second])).map(response => response.statusCode)).toEqual([200, 200])
    expect(clientes.get(original.id)).toMatchObject({ observacoes: 'Primeira edição', telefone: 'TESTE', valorTotalPago: '0.29' })
    expect(mocks.audit.mock.calls[0][0].dadosAntes.valorTotalPago).toBe(0)
  })

  it('resultado tardio de enriquecimento não desfaz edição posterior', async () => {
    const original = clienteFixture()
    clientes.set(original.id, original)
    const enrichGate = deferred<{ errors: Record<string, string> }>()
    mocks.enrich.mockImplementationOnce(() => enrichGate.promise)
    const first = await app.inject({ method: 'PATCH', url: '/api/clientes/cli-test', payload: { nome: 'Nome editado' } })
    expect(first.statusCode).toBe(200)
    const second = await app.inject({ method: 'PATCH', url: '/api/clientes/cli-test', payload: { observacoes: 'Edição posterior' } })
    expect(second.statusCode).toBe(200)
    enrichGate.resolve({ errors: {} })
    await new Promise(resolve => setImmediate(resolve))
    expect(clientes.get(original.id)).toMatchObject({ nome: 'Nome editado', observacoes: 'Edição posterior' })
    expect(mocks.writeCliente).toHaveBeenCalledTimes(2)
  })
})

describe('PATCH propostas: falhas não alteram cache', () => {
  it('transição proibida após outros campos no payload não vaza alterações', async () => {
    const original = propostaFixture()
    original.status = 'aceita'
    propostas.set(original.id, original)
    const response = await app.inject({ method: 'PATCH', url: '/api/propostas/prop-test', payload: { titulo: 'Título que não deve salvar', status: 'rascunho' } })
    expect(response.statusCode).toBe(409)
    expect(propostas.get(original.id)).toBe(original)
    expect(original.titulo).toBe('Título original')
    expect(mocks.demanda).not.toHaveBeenCalled()
    expect(mocks.writeProposta).not.toHaveBeenCalled()
  })

  it.each([{ status: 'novo-status' }, { valorProposta: 'NaN' }, { itens: [{ valor: 5, tipo: 'pagamento' }] }])('rejeita payload inválido: %j', async (payload) => {
    const original = propostaFixture()
    propostas.set(original.id, original)
    const response = await app.inject({ method: 'PATCH', url: '/api/propostas/prop-test', payload })
    expect(response.statusCode).toBe(400)
    expect(propostas.get(original.id)).toBe(original)
    expect(mocks.writeProposta).not.toHaveBeenCalled()
  })

  it('falha do vínculo mantém proposta e itens originais', async () => {
    const original = propostaFixture()
    const snapshot = structuredClone(original)
    propostas.set(original.id, original)
    mocks.deal.mockRejectedValueOnce(new Error('vínculo recusado no teste'))
    const response = await app.inject({ method: 'PATCH', url: '/api/propostas/prop-test', payload: { status: 'enviada', titulo: 'Editado', itens: [{ descricao: 'Item novo', valor: '12.50', tipo: 'parcela' }] } })
    expect(response.statusCode).toBe(422)
    expect(propostas.get(original.id)).toBe(original)
    expect(original).toEqual(snapshot)
    expect(mocks.writeProposta).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('falha do PG mantém proposta original sem auditoria ou snapshot de sucesso', async () => {
    const original = propostaFixture()
    propostas.set(original.id, original)
    mocks.writeProposta.mockRejectedValueOnce(new Error('falha simulada'))
    const response = await app.inject({ method: 'PATCH', url: '/api/propostas/prop-test', payload: { titulo: 'Editado', valorProposta: '0.29' } })
    expect(response.statusCode).toBe(503)
    expect(propostas.get(original.id)).toBe(original)
    expect(original.valorProposta).toBe(75)
    expect(mocks.audit).not.toHaveBeenCalled()
    expect(mocks.memory).not.toHaveBeenCalled()
  })

  it('só publica após PG; mantém strings de dinheiro e snapshots antes/depois', async () => {
    const original = propostaFixture()
    propostas.set(original.id, original)
    const gate = deferred()
    mocks.writeProposta.mockImplementationOnce(() => gate.promise)
    const pending = app.inject({ method: 'PATCH', url: '/api/propostas/prop-test', payload: { valorDivida: '0.30', valorProposta: '0.20', itens: [{ descricao: 'Parcela', valor: '0.20', tipo: 'parcela' }] } }).then(response => response)
    await vi.waitFor(() => expect(mocks.writeProposta).toHaveBeenCalledTimes(1))
    expect(propostas.get(original.id)).toBe(original)
    gate.resolve()
    const response = await pending
    expect(response.statusCode).toBe(200)
    expect(response.json().data).toMatchObject({ valorDivida: '0.30', valorProposta: '0.20', descontoPercentual: 33.33, itens: [{ valor: '0.20' }] })
    expect(mocks.audit.mock.calls[0][0]).toMatchObject({ dadosAntes: { valorProposta: 75 }, dadosDepois: { valorProposta: '0.20' } })
  })
})

describe('WhatsApp: estágio comercial não regride', () => {
  const service = new CrmLeadService()
  it.each([
    ['negociacao', 'status não reconhecido', 'negociacao'],
    ['acordo', 'Reunião agendada', 'acordo'],
    ['encerrado', 'Cliente ativo', 'encerrado'],
    ['concluido', 'Atendimento humano', 'concluido'],
    ['prospeccao', 'Elegível', 'analise'],
    ['analise', 'Atendimento humano', 'negociacao'],
    ['negociacao', 'Cliente ativo', 'acordo'],
  ])('%s + %s resulta em %s', async (stage, status, expected) => {
    const original = clienteFixture()
    Object.assign(original, { estagio: stage })
    clientes.set(original.id, original)
    await service.updateLeadStatus(original.id, status)
    expect(clientes.get(original.id)?.estagio).toBe(expected)
    expect(original.estagio).toBe(stage)
    expect(clientes.get(original.id)?.timeline.at(-1)?.tipo).toBe(stage === expected ? 'contato' : 'estagio')
  })

  it('erro de persistência não publica mudança de estágio nem timeline', async () => {
    const original = clienteFixture()
    clientes.set(original.id, original)
    const snapshot = structuredClone(original)
    mocks.writeCliente.mockRejectedValueOnce(new Error('falha simulada'))
    await expect(service.updateLeadStatus(original.id, 'Cliente ativo')).rejects.toThrow('falha simulada')
    expect(clientes.get(original.id)).toBe(original)
    expect(original).toEqual(snapshot)
  })
})

describe('Validação de dinheiro no limite do CRM', () => {
  it('valida centavos exatos e calcula percentual sem aritmética monetária em float', () => {
    expect(crmMoneySchema.parse('9007199254740991.99')).toBe('9007199254740991.99')
    for (const invalid of ['-1.00', '1.001', '10000000000000000.00', '1e3', Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(crmMoneySchema.safeParse(invalid).success).toBe(false)
    }
    expect(crmDiscountPercent('0.30', '0.20')).toBe(33.33)
    expect(crmDiscountPercent('0.00', '0.20')).toBe(0)
  })
})
