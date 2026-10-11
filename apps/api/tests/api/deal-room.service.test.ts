import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DealRoomService } from '../../src/services/dealRoom/DealRoomService.js'

describe('DealRoomService', () => {
  beforeEach(() => { process.env.ALETIS_PG_ENABLED = '0' })
  afterEach(() => { delete process.env.ALETIS_PG_ENABLED })
  it('cria negociação manual com valores normalizados e histórico', async () => {
    const service = new DealRoomService()
    const item = await service.create({ clienteId: 'cli-1', credor: 'Credor', valorAtual: '500.000,00', valorProposto: '450000', prazoMeses: 24, carenciaMeses: 2, usuarioId: 'u1', usuarioNome: 'Christian' })
    expect(item.valorAtual).toBe('500000.00')
    expect(item.valorProposto).toBe('450000.00')
    expect(item.historico).toHaveLength(1)
    expect((item.historico as Array<{ usuarioNome?: string }>)[0].usuarioNome).toBe('Christian')
  })
  it('registra mudança de status e rejeita transição inválida', async () => {
    const service = new DealRoomService()
    const item = await service.create({ clienteId: 'cli-1', credor: 'Credor' })
    const updated = await service.update(item.id, { status: 'contraproposta', usuarioNome: 'Regis' })
    expect(updated?.status).toBe('contraproposta')
    expect(updated?.historico).toHaveLength(2)
    await expect(service.update(item.id, { status: 'aceito' as never })).rejects.toThrow()
  })
  it('arquiva ao excluir e preserva o histórico', async () => {
    const service = new DealRoomService()
    const item = await service.create({ clienteId: 'cli-1', credor: 'Credor' })
    expect(await service.delete(item.id)).toBe(true)
    const archived = await service.get(item.id)
    expect(archived?.status).toBe('encerrado')
    expect(archived?.historico).toHaveLength(2)
  })

  it('vincula uma proposta enviada uma única vez à negociação', async () => {
    const service = new DealRoomService()
    const proposta = {
      id: 'prop-1',
      clienteId: 'cli-1',
      credor: 'Banco Exemplo',
      titulo: 'Renegociação safra 2026',
      valorDivida: 500_000,
      valorProposta: 450_000,
      status: 'enviada',
    }
    const [first, second] = await Promise.all([
      service.ensureForProposal(proposta, { nome: 'Christian' }),
      service.ensureForProposal(proposta, { nome: 'Christian' }),
    ])
    const reenvio = await service.ensureForProposal(proposta, { nome: 'Christian' })

    expect(first.criada).toBe(true)
    expect(second.negociacao.id).toBe(first.negociacao.id)
    expect(reenvio.criada).toBe(false)
    expect(reenvio.negociacao.id).toBe(first.negociacao.id)
    expect((await service.listByCliente('cli-1'))).toHaveLength(1)
  })

  it('marca a negociação como aprovada quando a proposta vinculada é aceita', async () => {
    const service = new DealRoomService()
    const proposta = {
      id: 'prop-2',
      clienteId: 'cli-1',
      credor: 'Banco Exemplo',
      valorDivida: 500_000,
      valorProposta: 450_000,
      status: 'aceita',
    }
    const vinculo = await service.ensureForProposal(proposta)

    expect(vinculo.negociacao.status).toBe('aprovado')
    expect(vinculo.negociacao.historico).toHaveLength(2)
  })
})
