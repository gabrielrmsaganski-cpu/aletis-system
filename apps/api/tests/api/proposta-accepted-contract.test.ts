import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/server.js'
import { getClientCoreService } from '../../src/services/core/ClientCoreService.js'

describe('accepted proposal contract flow', () => {
  let app: FastifyInstance
  let previousInternalAuthEnabled: string | undefined
  let previousPgEnabled: string | undefined

  beforeAll(async () => {
    previousInternalAuthEnabled = process.env.ALETIS_INTERNAL_AUTH_ENABLED
    previousPgEnabled = process.env.ALETIS_PG_ENABLED
    process.env.ALETIS_INTERNAL_AUTH_ENABLED = '0'
    process.env.ALETIS_PG_ENABLED = '0'
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    if (previousInternalAuthEnabled === undefined) delete process.env.ALETIS_INTERNAL_AUTH_ENABLED
    else process.env.ALETIS_INTERNAL_AUTH_ENABLED = previousInternalAuthEnabled
    if (previousPgEnabled === undefined) delete process.env.ALETIS_PG_ENABLED
    else process.env.ALETIS_PG_ENABLED = previousPgEnabled
  })

  it('links an accepted proposal to one negotiation and one contract draft', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/propostas/gerar',
      payload: {
        clienteId: 'cli-proposta-contract-flow',
        clienteNome: 'Cliente de teste',
        credor: 'Banco Exemplo',
        titulo: 'Renegociação da safra',
        tipo: 'renegociacao',
        valorDivida: 1_000_000,
        valorProposta: 850_000,
      },
    })
    expect(created.statusCode).toBe(201)
    const propostaId = created.json().data.id as string

    const sent = await app.inject({
      method: 'PATCH',
      url: `/api/propostas/${propostaId}`,
      payload: { status: 'enviada' },
    })
    expect(sent.statusCode).toBe(200)
    expect(sent.json().meta.negociacaoId).toEqual(expect.any(String))

    const accepted = await app.inject({
      method: 'PATCH',
      url: `/api/propostas/${propostaId}`,
      payload: { status: 'aceita' },
    })
    expect(accepted.statusCode).toBe(200)
    expect(accepted.json().meta.negociacaoId).toEqual(expect.any(String))
    expect(accepted.json().meta.contratoId).toEqual(expect.any(String))

    const contract = await getClientCoreService().findContractByProposal(propostaId)
    expect(contract).toMatchObject({
      id: accepted.json().meta.contratoId,
      clienteId: 'cli-proposta-contract-flow',
      propostaId,
      status: 'rascunho',
    })
  })
})
