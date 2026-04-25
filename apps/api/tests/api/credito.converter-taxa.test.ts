/**
 * P0-04 contract — /api/credito/converter-taxa precisa aceitar
 * tanto `tipo=` quanto `de=&para=` (frontend Credito.tsx envia o segundo).
 * Resposta deve trazer `data.taxa` com o valor convertido para `para`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/server.js'

describe('GET /api/credito/converter-taxa', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('aceita ?tipo= (canônico) e retorna data.mensal/anual/diaria', async () => {
    const r = await app.inject({ url: '/api/credito/converter-taxa?taxa=1.5&tipo=mensal' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.success).toBe(true)
    expect(body.data.mensal).toBe(1.5)
    expect(body.data.anual).toBeCloseTo(19.561, 2)
    expect(body.data.diaria).toBeCloseTo(0.0496, 2)
  })

  it('aceita ?de=&para= (alias) e expõe data.taxa com a conversão pro destino', async () => {
    const r = await app.inject({ url: '/api/credito/converter-taxa?taxa=1.5&de=mensal&para=anual' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.success).toBe(true)
    expect(body.data.taxa).toBeCloseTo(19.561, 2) // anual de 1.5% mensal
    expect(body.data.entrada.tipo).toBe('mensal')
    expect(body.data.entrada.para).toBe('anual')
  })

  it('400 quando taxa ausente', async () => {
    const r = await app.inject({ url: '/api/credito/converter-taxa?tipo=mensal' })
    expect(r.statusCode).toBe(400)
  })

  it('400 quando tipo/de inválido', async () => {
    const r = await app.inject({ url: '/api/credito/converter-taxa?taxa=1.5&tipo=ano' })
    expect(r.statusCode).toBe(400)
  })

  it('inverte direção: 18% anual → ~1,38% mensal', async () => {
    const r = await app.inject({ url: '/api/credito/converter-taxa?taxa=18&de=anual&para=mensal' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.data.taxa).toBeCloseTo(1.388, 2)
  })
})
