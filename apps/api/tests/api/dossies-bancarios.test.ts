import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/server.js'

describe('API de dossiês bancários', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('expõe o catálogo dos modelos disponíveis no servidor', async () => {
    const response = await app.inject({ url: '/api/dossies-bancarios/catalogo' })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.success).toBe(true)
    expect(body.data.modelos.length).toBeGreaterThanOrEqual(10)
    expect(body.data.modelos.filter((modelo: any) => modelo.disponivel).length).toBeGreaterThanOrEqual(10)
  })

  it('analisa a prontidão do cliente selecionado sem gerar arquivos', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/dossies-bancarios/preparacao',
      payload: {
        banco: 'btg',
        perfilId: 'produtor-pf',
        clienteId: 'cli-002',
      },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.success).toBe(true)
    expect(body.data.cliente.id).toBe('cli-002')
    expect(body.data.checklist.length).toBeGreaterThan(0)
    expect(body.data.prontidao).toBeGreaterThanOrEqual(0)
    expect(body.data.prontidao).toBeLessThanOrEqual(100)
  })

  it('rejeita banco inválido com resposta estruturada', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/dossies-bancarios/preparacao',
      payload: { banco: 'inexistente' },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      success: false,
      code: 'BANCO_INVALIDO',
    })
  })
})
