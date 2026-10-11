/**
 * Wave-PG-11 — endpoints /api/fontes/historico e /api/fontes/uptime.
 *
 * Smoke (sem PG): ambos retornam 200 com aviso de PG desligado.
 * Smoke (com PG): contrato shape ok; valores podem variar entre runs.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/server.js'

describe('GET /api/fontes/historico + /uptime', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('historico retorna 200 com array de eventos', async () => {
    const r = await app.inject({ url: '/api/fontes/historico?limit=5' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.sucesso).toBe(true)
    expect(Array.isArray(body.eventos)).toBe(true)
  })

  it('historico rejeita `desde` inválido com 400', async () => {
    const r = await app.inject({ url: '/api/fontes/historico?desde=NOT_A_DATE' })
    expect(r.statusCode).toBe(400)
  })

  it('uptime retorna 200 com média e fontes', async () => {
    const r = await app.inject({ url: '/api/fontes/uptime?horas=24' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.sucesso).toBe(true)
    if (body.fontes && body.fontes.length > 0) {
      expect(body.fontes).toHaveLength(36)
      expect(typeof body.media).toBe('number')
      for (const f of body.fontes.slice(0, 3)) {
        expect(typeof f.nome).toBe('string')
        expect(['online', 'offline', 'degraded']).toContain(f.statusAtual)
        expect(f.uptimePct).toBeGreaterThanOrEqual(0)
        expect(f.uptimePct).toBeLessThanOrEqual(100)
      }
    }
  })

  it('uptime aceita janela customizada (1..720h)', async () => {
    const r = await app.inject({ url: '/api/fontes/uptime?horas=168' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.janelaHoras).toBe(168)
  })
})
