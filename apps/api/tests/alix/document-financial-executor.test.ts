import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mocks = vi.hoisted(() => ({
  create: vi.fn((toolName, _description, payload) => ({ id: 'confirmation-fixture', expiresAt: Date.now() + 60_000, toolName, payload })),
  attach: vi.fn(async () => null),
}))
vi.mock('../../src/services/alix/AlixConfirmationStore.js', () => ({ getAlixConfirmationStore: () => ({ create: mocks.create }) }))
vi.mock('../../src/services/alix/memory/AlixMemoryService.js', () => ({ getAlixMemoryService: () => ({ appendNota: vi.fn(async () => undefined) }) }))
vi.mock('../../src/services/alix/intake/DocumentVaultBridgeService.js', () => ({ attachAlixDocumentToCliente: mocks.attach }))

import { AlixService, registerCrmWriteBackends, registerStores } from '../../src/services/AlixService.js'

const clients: Array<Record<string, any>> = []
const proposals: Array<Record<string, any>> = []
let service: AlixService
const input = () => ({ nome: 'Cliente Sintético', cpfCnpj: '12345678901', tipoPessoa: 'PF', escritorio: 'Aletis', documentoId: 'documento-fixture', confiancaDocumento: 0.9,
  evidencias: [{ field: 'nome', trecho: 'Cliente Sintético' }, { field: 'cpfCnpj', trecho: 'CPF 123.456.789-01' }] })
const debtEvidence = { field: 'dividas', trecho: 'Contrato NOVO. Valor original R$ 100,10. Saldo atualizado R$ 0,00.', fonte: 'página 2', confianca: 0.9 }

beforeEach(() => {
  clients.length = 0; proposals.length = 0; vi.clearAllMocks()
  registerStores({ clientes: () => clients, propostas: () => [], propostasInteligentes: () => proposals })
  registerCrmWriteBackends({
    setCliente: async client => { clients.push(client) },
    getCliente: id => clients.find(client => client.id === id),
    patchCliente: async (id, patch) => { const client = clients.find(client => client.id === id); Object.assign(client!, patch); return client },
    setPropostaInteligente: async proposal => { proposals.push(proposal) },
    deleteCliente: async id => { const index = clients.findIndex(client => client.id === id); if (index !== -1) clients.splice(index, 1) },
  })
  service = new AlixService({} as any, join(tmpdir(), 'alix-financial-executor-fixture'))
})

describe('preparação e execução financeira após confirmação', () => {
  it('prepara cadastro não financeiro sem criar cliente/proposta nem zero automático', () => {
    const result = service.handle_onboarding_cliente_completo(input())
    expect(result.metadata.pendingConfirmation).toBe(true)
    expect(clients).toEqual([]); expect(proposals).toEqual([])
    const payload = mocks.create.mock.calls[0][2]
    expect(payload).not.toHaveProperty('dividaTotal')
    expect(payload.revisaoFinanceira.pendencias).toContainEqual(expect.objectContaining({ campo: 'dividaTotal' }))
  })
  it('execução confirmada de cadastro sem saldo preserva ausência e não cria proposta', async () => {
    const result: any = await service.getExecutor('onboarding_cliente_completo')!(input())
    expect(result.ok).toBe(true)
    expect(clients).toHaveLength(1); expect(proposals).toHaveLength(0)
    expect(clients[0]).not.toHaveProperty('valorTotalDivida')
    expect(clients[0]).not.toHaveProperty('valorTotalPago')
    expect(result).not.toHaveProperty('dividaTotal')
  })
  it('saldo zero comprovado permanece zero e não cria proposta de renegociação', async () => {
    const base = input()
    const payload = { ...base, dividaTotal: 0, evidencias: [...base.evidencias, { field: 'dividaTotal', trecho: 'Saldo total R$ 0,00' }] }
    expect(service.handle_onboarding_cliente_completo(payload).metadata.pendingConfirmation).toBe(true)
    const result: any = await service.getExecutor('onboarding_cliente_completo')!(mocks.create.mock.calls[0][2])
    expect(clients[0].valorTotalDivida).toBe('0.00')
    expect(result.propostaCriada).toBe(false); expect(proposals).toHaveLength(0)
  })
  it('montante positivo comprovado conserva centavos exatos no cliente e na proposta', async () => {
    const base = input()
    await service.getExecutor('onboarding_cliente_completo')!({ ...base, dividaTotal: '90071992547409.91', evidencias: [...base.evidencias, { field: 'dividaTotal', trecho: 'Saldo total R$ 90.071.992.547.409,91' }] })
    expect(clients[0].valorTotalDivida).toBe('90071992547409.91')
    expect(proposals[0].dividaTotal).toBe('90071992547409.91')
  })
  it('principal isolado entra como principal sem inventar saldo total ou saldo do contrato', async () => {
    const base = input()
    await service.getExecutor('onboarding_cliente_completo')!({ ...base, dividas: [{ contrato: 'NOVO', valorOriginal: 100.1 }], evidencias: [...base.evidencias, debtEvidence] })
    expect(clients[0].dividas[0]).toMatchObject({ valorOriginal: '100.10' })
    expect(clients[0].dividas[0]).not.toHaveProperty('valorAtualizado')
    expect(clients[0]).not.toHaveProperty('valorTotalDivida'); expect(proposals).toHaveLength(0)
  })
  it('adicionar contrato após confirmação preserva o total financeiro histórico', async () => {
    clients.push({ id: 'existente', cpfCnpj: '12345678901', valorTotalDivida: '5432.10', dividas: [{ contrato: 'ANTIGO', valorAtualizado: '5432.10' }] })
    const base = input()
    const payload = { ...base, clienteId: 'existente', dividas: [{ contrato: 'NOVO', valorOriginal: 100.1, valorAtualizado: 0 }], evidencias: [...base.evidencias, debtEvidence] }
    const pending = service.handle_atualizar_cliente_completo(payload)
    expect(pending.metadata.pendingConfirmation).toBe(true)
    expect(clients[0].dividas).toHaveLength(1)
    await service.getExecutor('atualizar_cliente_completo')!(mocks.create.mock.calls[0][2])
    expect(clients[0].valorTotalDivida).toBe('5432.10')
    expect(clients[0].dividas[1]).toMatchObject({ valorOriginal: '100.10', valorAtualizado: '0.00' })
  })
  it('CPF já cadastrado prepara atualização HITL em vez de outro cliente', () => {
    clients.push({ id: 'existente', cpfCnpj: '12345678901', nome: 'Cliente Sintético' })
    const pending = service.handle_onboarding_cliente_completo({ ...input(), cpfCnpj: '123.456.789-01' })
    expect(pending.metadata.toolName).toBe('atualizar_cliente_completo')
    expect(clients).toHaveLength(1); expect(mocks.create.mock.calls[0][2].clienteId).toBe('existente')
  })
  it('CPF cadastrado depois da preparação impede duplicação na execução', async () => {
    service.handle_onboarding_cliente_completo(input())
    clients.push({ id: 'concorrente', cpfCnpj: '12345678901' })
    await expect(service.getExecutor('onboarding_cliente_completo')!(mocks.create.mock.calls[0][2])).rejects.toThrow('CPF/CNPJ já cadastrado')
    expect(clients).toHaveLength(1); expect(proposals).toHaveLength(0)
  })
  it('executor rejeita valor inválido antes de escrever mesmo quando chamado diretamente', async () => {
    await expect(service.getExecutor('onboarding_cliente_completo')!({ ...input(), dividaTotal: '1.234' })).rejects.toThrow('Saldo total inválido')
    expect(clients).toHaveLength(0); expect(proposals).toHaveLength(0)
  })
})
