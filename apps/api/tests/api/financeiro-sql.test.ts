/**
 * Wave-PG-13 — endpoints SQL queryable de financeiro.
 * Funciona com PG on/off (shape consistente).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/server.js'

describe('GET /api/financeiro/sql/*', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('/margem-cliente retorna array (mesmo PG vazio)', async () => {
    const r = await app.inject({ url: '/api/financeiro/sql/margem-cliente?limit=10' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    if (body.data.length > 0) {
      const first = body.data[0]
      expect(typeof first.clienteCpfCnpj).toBe('string')
      expect(typeof first.margem).toBe('number')
    }
  })

  it('/margem-cliente aceita filtro ano', async () => {
    const r = await app.inject({ url: '/api/financeiro/sql/margem-cliente?ano=2026&limit=5' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('/fluxo-competencia retorna série mensal', async () => {
    const r = await app.inject({ url: '/api/financeiro/sql/fluxo-competencia?desde=2026-01&ate=2026-12' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    for (const m of body.data) {
      expect(m).toHaveProperty('competencia')
      expect(m).toHaveProperty('saldo')
    }
  })

  it('/top-categorias retorna até limit', async () => {
    const r = await app.inject({ url: '/api/financeiro/sql/top-categorias?limit=3' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeLessThanOrEqual(3)
  })
})
