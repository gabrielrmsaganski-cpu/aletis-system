/**
 * Smoke — health endpoint, NotFound handler e error response shape.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/server.js'

describe('Smoke API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /api/health retorna {success, data.status: ok}', async () => {
    const r = await app.inject({ url: '/api/health' })
    expect(r.statusCode).toBe(200)
    const b = r.json()
    expect(b.success).toBe(true)
    expect(b.data.status).toBe('ok')
    expect(b.data.services.api).toBe('running')
  })

  it('rota inexistente retorna 404 com shape padrão', async () => {
    const r = await app.inject({ url: '/api/inexistente-xyz' })
    expect(r.statusCode).toBe(404)
    const b = r.json()
    expect(b.success).toBe(false)
    expect(b.code).toBe('NOT_FOUND')
    expect(b.statusCode).toBe(404)
  })
})
