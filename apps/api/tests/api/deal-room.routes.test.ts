import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/server.js'
import type { FastifyInstance } from 'fastify'

describe('Deal Room API', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    process.env.ALETIS_INTERNAL_AUTH_ENABLED = '0'
    delete process.env.ALETIS_PG_ENABLED
    app = await buildApp()
  })
  afterEach(async () => { await app.close() })

  it('cria, evita duplicidade por idempotency key e atualiza status', async () => {
    const body = { clienteId: 'cli-route-test', credor: 'Banco A', valorAtual: '500000.00', valorProposto: '450000.00' }
    const first = await app.inject({ method: 'POST', url: '/api/deal-room/negociacoes', headers: { 'idempotency-key': 'route-test-1' }, payload: body })
    expect(first.statusCode).toBe(201)
    const id = first.json().data.id as string
    const duplicate = await app.inject({ method: 'POST', url: '/api/deal-room/negociacoes', headers: { 'idempotency-key': 'route-test-1' }, payload: body })
    expect(duplicate.statusCode).toBe(200)
    expect(duplicate.json().data.id).toBe(id)
    const changed = await app.inject({ method: 'PATCH', url: `/api/deal-room/negociacoes/${id}`, payload: { status: 'contraproposta' } })
    expect(changed.statusCode).toBe(200)
    expect(changed.json().data.status).toBe('contraproposta')
    const summary = await app.inject({ method: 'GET', url: '/api/deal-room/resumo' })
    expect(summary.json().data.porStatus.contraproposta).toBeGreaterThanOrEqual(1)
  })
})
