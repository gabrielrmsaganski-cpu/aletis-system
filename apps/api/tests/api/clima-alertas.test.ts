/**
 * P1-04 — Sanitização de alertas climáticos:
 *   - alertas com vigênciaFim < hoje são removidos
 *   - alertas com início > fim são auto-corrigidos (swap)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/server.js'

describe('GET /api/clima/alertas/:estado (saneamento)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('só retorna alertas com vigência ativa (fim >= hoje)', async () => {
    const r = await app.inject({ url: '/api/clima/alertas/PR' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    const hoje = new Date().toISOString().slice(0, 10)
    for (const a of body.alertas) {
      expect(a.vigenciaFim >= hoje).toBe(true)
    }
  })

  it('garante vigênciaInicio <= vigênciaFim em todos os alertas', async () => {
    const r = await app.inject({ url: '/api/clima/alertas/MS' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    for (const a of body.alertas) {
      expect(new Date(a.vigenciaInicio).getTime())
        .toBeLessThanOrEqual(new Date(a.vigenciaFim).getTime())
    }
  })

  it('400 para UF inválida', async () => {
    const r = await app.inject({ url: '/api/clima/alertas/XX' })
    expect(r.statusCode).toBe(400)
  })
})
