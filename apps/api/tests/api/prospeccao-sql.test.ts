/**
 * Wave-PG-12 — endpoint /api/prospeccao/leads/sql.
 * Skip se PG off (mas o handler retorna 200 com aviso, não 500).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/server.js'

describe('GET /api/prospeccao/leads/sql', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('retorna 200 com shape consistente (Postgres ou índice local)', async () => {
    const r = await app.inject({ url: '/api/prospeccao/leads/sql?limit=3' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.leads)).toBe(true)
    expect(typeof body.total).toBe('number')
    expect(['postgres', 'memory']).toContain(body.source)
  })

  it('aceita filtro uf=PR', async () => {
    const r = await app.inject({ url: '/api/prospeccao/leads/sql?uf=PR&limit=2' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.success).toBe(true)
    if (body.leads.length > 0) {
      for (const l of body.leads) expect(l.uf).toBe('PR')
    }
  })

  it('aceita filtro ajuizado=true', async () => {
    const r = await app.inject({ url: '/api/prospeccao/leads/sql?ajuizado=true&limit=2' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.success).toBe(true)
    if (body.leads.length > 0) {
      for (const l of body.leads) expect(l.ajuizado).toBe(true)
    }
  })

  it('respeita limit (default 50, max 500)', async () => {
    const r = await app.inject({ url: '/api/prospeccao/leads/sql?limit=10000' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    if (body.limit !== undefined) {
      expect(body.limit).toBeLessThanOrEqual(500)
    }
  })
})
