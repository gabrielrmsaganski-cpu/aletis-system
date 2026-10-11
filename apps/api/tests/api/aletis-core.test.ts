import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

describe('ALETIS Core API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    process.env.ALETIS_PG_ENABLED = '0'
    process.env.ALIX_USE_LLM = 'false'
    process.env.ALETIS_RBAC_STRICT = 'false'
    process.env.N8N_AUTOMATION_ENABLED = 'false'
    const mod = await import('../../src/server.js')
    app = await mod.buildApp()
    await app.ready()
  }, 30_000)

  afterAll(async () => {
    if (app) await app.close()
  })

  it('retorna resumo operacional normalizado de um cliente', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/clientes/cli-002/core' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.success).toBe(true)
    expect(body.data.clienteId).toBe('cli-002')
    expect(body.data.metrics).toBeTruthy()
    expect(Array.isArray(body.data.timeline)).toBe(true)
  })

  it('cria tarefa vinculada ao cliente e reflete no core summary', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/clients/cli-002/tasks',
      payload: { titulo: 'Conferir documentos pendentes', prioridade: 'alta' },
    })
    expect(create.statusCode).toBe(201)
    const task = create.json().data
    expect(task.titulo).toBe('Conferir documentos pendentes')

    const summary = await app.inject({ method: 'GET', url: '/api/clientes/cli-002/core' })
    const body = summary.json()
    expect(body.data.tasks.some((t: { id: string }) => t.id === task.id)).toBe(true)
    expect(body.data.metrics.tarefasPendentes).toBeGreaterThanOrEqual(1)
  })

  it('responde IA contextual em fallback sem alucinar dependência de LLM', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/clientes/cli-002/ask',
      payload: { question: 'Qual é a situação atual deste cliente?' },
    })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.success).toBe(true)
    expect(body.data.provider).toBe('fallback')
    expect(body.data.answer).toContain('Fatos encontrados')
    expect(Array.isArray(body.data.sources)).toBe(true)
  })

  it('expõe status seguro dos adapters externos', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/integrations/ai-core/status' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.success).toBe(true)
    expect(body.data.n8n).toBeTruthy()
    expect(body.data.automations.internalQueue).toBe(true)
    expect(body.data.documents.ragProvider).toBe('aletis-local')
  })
})
