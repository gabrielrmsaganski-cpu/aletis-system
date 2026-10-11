import assert from 'node:assert'
import { test, vi } from 'vitest'

import { ClienteDemandaService, type DemandProposalLike } from '../../src/services/cliente/ClienteDemandaService.ts'

test('consultar demandas não importa dados financeiros nem altera propostas', async () => {
  const service = new ClienteDemandaService()
  const importer = vi.spyOn(service as any, 'importFinancialDemands')
  const created = await service.create('cli-readonly', { titulo: 'Demanda preservada' })
  const first = JSON.stringify(await service.list('cli-readonly'))
  const second = JSON.stringify(await service.list('cli-readonly'))
  assert.strictEqual(first, second)
  assert.strictEqual((await service.get('cli-readonly', created.id))?.atualizadoEm, created.atualizadoEm)
  assert.strictEqual(importer.mock.calls.length, 0)
})

test('organiza propostas antigas por assunto e mantém versões na mesma demanda', async () => {
  const previous = process.env.ALETIS_PG_ENABLED
  process.env.ALETIS_PG_ENABLED = '0'
  try {
    const service = new ClienteDemandaService()
    const proposals: DemandProposalLike[] = [
      {
        id: 'prop-1', clienteId: 'cli-test', titulo: 'Proposta de Custeio Safra 2026/27',
        tipo: 'custeio', credor: 'Banco A', status: 'rascunho', valorDivida: 100000,
      },
      {
        id: 'prop-2', clienteId: 'cli-test', titulo: 'Proposta de Custeio Safra 2026/27',
        tipo: 'custeio', credor: 'Banco A', status: 'enviada', valorDivida: 100000,
      },
      {
        id: 'prop-3', clienteId: 'cli-test', titulo: 'Proposta para acordo judicial',
        tipo: 'acordo_judicial', credor: 'Banco A', status: 'em_analise', valorDivida: 80000,
      },
    ]

    const demands = await service.organizeProposals('cli-test', proposals)

    assert.strictEqual(demands.length, 2)
    assert.strictEqual(proposals[0].demandaId, proposals[1].demandaId)
    assert.notStrictEqual(proposals[0].demandaId, proposals[2].demandaId)
    assert.strictEqual(proposals[0].versaoDemanda, 1)
    assert.strictEqual(proposals[1].versaoDemanda, 2)
    assert.strictEqual(demands.find((item) => item.id === proposals[0].demandaId)?.propostaIds.length, 2)
  } finally {
    if (previous === undefined) delete process.env.ALETIS_PG_ENABLED
    else process.env.ALETIS_PG_ENABLED = previous
  }
})

test('permite mover proposta para outra demanda sem duplicar o vínculo', async () => {
  const previous = process.env.ALETIS_PG_ENABLED
  process.env.ALETIS_PG_ENABLED = '0'
  try {
    const service = new ClienteDemandaService()
    const first = await service.create('cli-test', { titulo: 'Renegociação Banco A' })
    const second = await service.create('cli-test', { titulo: 'Crédito para máquinas' })

    await service.linkProposal('cli-test', first.id, 'prop-1')
    await service.linkProposal('cli-test', second.id, 'prop-1')

    const demands = await service.list('cli-test')
    assert.deepStrictEqual(demands.find((item) => item.id === first.id)?.propostaIds, [])
    assert.deepStrictEqual(demands.find((item) => item.id === second.id)?.propostaIds, ['prop-1'])
    assert.strictEqual(await service.remove('cli-test', second.id), false)
    assert.strictEqual(await service.remove('cli-test', first.id), true)
  } finally {
    if (previous === undefined) delete process.env.ALETIS_PG_ENABLED
    else process.env.ALETIS_PG_ENABLED = previous
  }
})

test('associa nova proposta a uma demanda manual semanticamente compatível', async () => {
  const previous = process.env.ALETIS_PG_ENABLED
  process.env.ALETIS_PG_ENABLED = '0'
  try {
    const service = new ClienteDemandaService()
    const manual = await service.create('cli-test', {
      titulo: 'Custeio da safra 2026/27',
      assunto: 'custeio rural',
      credor: 'Banco A',
      origem: 'manual',
    })
    const proposal: DemandProposalLike = {
      id: 'prop-semantic',
      clienteId: 'cli-test',
      titulo: 'Proposta de custeio da safra 2026/27',
      tipo: 'custeio_rural',
      credor: 'Banco A',
      status: 'enviada',
      arquivoOrigem: { cofreUploadId: 'doc-proposta-1' },
    }

    const result = await service.ensureForProposal(proposal)

    assert.strictEqual(result.demanda.id, manual.id)
    assert.strictEqual(result.demanda.status, 'negociacao')
    assert.deepStrictEqual(result.demanda.propostaIds, ['prop-semantic'])
    assert.deepStrictEqual(result.demanda.documentoIds, ['doc-proposta-1'])
    assert.strictEqual((await service.list('cli-test')).length, 1)

    const nextCrop: DemandProposalLike = {
      id: 'prop-next-crop',
      clienteId: 'cli-test',
      titulo: 'Proposta de custeio da safra 2027/28',
      tipo: 'custeio_rural',
      credor: 'Banco A',
      status: 'rascunho',
    }
    const nextResult = await service.ensureForProposal(nextCrop)
    assert.notStrictEqual(nextResult.demanda.id, manual.id)
    assert.strictEqual((await service.list('cli-test')).length, 2)

    await service.unlinkProposal('cli-test', proposal.id)
    assert.deepStrictEqual((await service.get('cli-test', manual.id))?.propostaIds, [])
  } finally {
    if (previous === undefined) delete process.env.ALETIS_PG_ENABLED
    else process.env.ALETIS_PG_ENABLED = previous
  }
})

test('mantém numeração, timeline, checklist e proposta principal por demanda', async () => {
  const previous = process.env.ALETIS_PG_ENABLED
  process.env.ALETIS_PG_ENABLED = '0'
  try {
    const service = new ClienteDemandaService()
    const first = await service.create('cli-operacional', {
      titulo: 'Renegociação CPR',
      categoria: 'renegociacao',
      proximaAcao: 'Solicitar memória de cálculo',
      proximaAcaoEm: '2026-08-03',
      probabilidade: 45,
      resultadoEsperado: 'Alongar a dívida em cinco anos',
    })
    const second = await service.create('cli-operacional', { titulo: 'Crédito para armazenagem' })

    assert.strictEqual(first.numero, 1)
    assert.strictEqual(second.numero, 2)
    assert.strictEqual(first.categoria, 'renegociacao')
    assert.strictEqual(first.probabilidade, 45)
    assert.strictEqual(first.eventos[0].titulo, 'Demanda criada')

    const withActivity = await service.addEvent('cli-operacional', first.id, {
      tipo: 'contato', titulo: 'Reunião com o cliente', descricao: 'Cliente validou o fluxo proposto.', autor: 'Consultor',
    })
    assert.strictEqual(withActivity?.eventos.at(-1)?.tipo, 'contato')

    const withChecklist = await service.addChecklistItem('cli-operacional', first.id, {
      titulo: 'Conferir garantias', responsavel: 'Consultor', prazo: '2026-08-01',
    })
    const itemId = withChecklist?.checklist[0]?.id
    assert.ok(itemId)
    const completed = await service.updateChecklistItem('cli-operacional', first.id, itemId!, { concluido: true })
    assert.strictEqual(completed?.checklist[0].concluido, true)
    assert.ok(completed?.checklist[0].concluidoEm)

    await service.linkProposal('cli-operacional', first.id, 'prop-principal')
    const primary = await service.setPrimaryProposal('cli-operacional', first.id, 'prop-principal')
    assert.strictEqual(primary?.propostaPrincipalId, 'prop-principal')
    await service.linkProposal('cli-operacional', second.id, 'prop-principal')
    assert.strictEqual((await service.get('cli-operacional', first.id))?.propostaPrincipalId, undefined)
  } finally {
    if (previous === undefined) delete process.env.ALETIS_PG_ENABLED
    else process.env.ALETIS_PG_ENABLED = previous
  }
})
