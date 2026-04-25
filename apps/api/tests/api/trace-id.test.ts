/**
 * P2-24 — Trace IDs em respostas e validação contra injection.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/server.js'

describe('x-trace-id header', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('gera trace-id quando o cliente não envia', async () => {
    const r = await app.inject({ url: '/api/health' })
    expect(r.statusCode).toBe(200)
    const id = r.headers['x-trace-id']
    expect(typeof id).toBe('string')
    expect((id as string).length).toBeGreaterThanOrEqual(6)
    // Formato URL-safe (base64url) — sem caracteres perigosos
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('aceita trace-id válido vindo no header', async () => {
    const r = await app.inject({
      url: '/api/health',
      headers: { 'x-trace-id': 'abc-123_def-456' },
    })
    expect(r.headers['x-trace-id']).toBe('abc-123_def-456')
  })

  it('rejeita trace-id com payload XSS — gera próprio em vez de ecoar', async () => {
    const xss = '<script>alert(1)</script>'
    const r = await app.inject({
      url: '/api/health',
      headers: { 'x-trace-id': xss },
    })
    const id = r.headers['x-trace-id']
    expect(id).not.toBe(xss)
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('rejeita trace-id muito curto (<6) e gera próprio', async () => {
    const r = await app.inject({
      url: '/api/health',
      headers: { 'x-trace-id': 'abc' },
    })
    expect(r.headers['x-trace-id']).not.toBe('abc')
  })
})
