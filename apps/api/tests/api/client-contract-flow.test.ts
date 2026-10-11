import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClientCoreService } from '../../src/services/core/ClientCoreService.js'

describe('ClientCoreService contract draft flow', () => {
  beforeEach(() => {
    process.env.ALETIS_PG_ENABLED = '0'
  })

  afterEach(() => {
    delete process.env.ALETIS_PG_ENABLED
  })

  it('creates one review draft for an accepted proposal and preserves the canonical links', async () => {
    const service = new ClientCoreService()
    const input = {
      clienteId: 'cli-contract-flow',
      propostaId: 'prop-contract-flow',
      negociacaoId: 'neg-contract-flow',
      demandaId: 'dem-contract-flow',
      titulo: 'Renegociação da safra 2026',
      credor: 'Banco Exemplo',
      tipo: 'termo_renegociacao',
      valorDivida: '1000000.00',
      valorProposta: '850000.00',
    }

    const [first, second] = await Promise.all([
      service.ensureContractDraftForAcceptedProposal(input, 'consultor'),
      service.ensureContractDraftForAcceptedProposal(input, 'consultor'),
    ])

    expect(first.created).toBe(true)
    expect(second.contract.id).toBe(first.contract.id)
    expect(second.created).toBe(false)
    expect(first.contract.status).toBe('rascunho')
    expect(first.contract.propostaId).toBe(input.propostaId)
    expect(first.contract.negociacaoId).toBe(input.negociacaoId)
    expect(first.contract.demandaId).toBe(input.demandaId)
    expect(first.contract.metadata).toMatchObject({
      origem: 'proposta_aceita',
      statusGeracao: 'pendente_revisao_juridica',
    })
    expect(await service.findContractByProposal(input.propostaId)).toMatchObject({
      id: first.contract.id,
      clienteId: input.clienteId,
    })
  })
})
