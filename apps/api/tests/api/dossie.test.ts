/**
 * P1-09 — GET /api/clientes/:id/dossie deve retornar 200 + dossie vazio
 * quando o cliente existe mas o dossie ainda não foi criado.
 * Antes, retornava 404 (poluía o console do front no caminho feliz).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/server.js'

describe('GET /api/clientes/:id/dossie', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('retorna 200 + data vazio + novo:true para cliente existente sem dossie', async () => {
    // cli-002 (Paulo Luciano) é seed; provavelmente não tem dossie ainda.
    const r = await app.inject({ url: '/api/clientes/cli-002/dossie' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.success).toBe(true)
    expect(body.data).toBeTruthy()
    expect(body.data.clienteId).toBe('cli-002')
    // Caminho `novo:true` aparece quando o dossie é vazio (recém-pré-populado).
    if (body.novo === true) {
      expect(body.data.grupoEconomico).toBeTruthy()
    }
  })

  it('retorna 404 para cliente inexistente', async () => {
    const r = await app.inject({ url: '/api/clientes/cli-NAO-EXISTE/dossie' })
    expect(r.statusCode).toBe(404)
    const body = r.json()
    expect(body.success).toBe(false)
  })
})
