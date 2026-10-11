import Fastify from 'fastify'
import { afterEach, expect, it, vi } from 'vitest'
import routes from '../../src/routes/alix-operations.js'
import { AlixOperationalPlanService, projectOperationalPlan } from '../../src/services/alix/workspace/AlixOperationalPlanService.js'

const plan = projectOperationalPlan({ now: new Date('2026-09-06T15:00:00Z'), records: {}, coverage: ['clients', 'demands', 'proposals'].map(key => ({ key, label: key, status: 'available', origin: 'memory', records: 0 })) as any })
const mission = { id: 'mission_test', sessionId: 'operations_test', status: 'completed', progress: 100, result: { conclusion: 'Plano preparado.', facts: [], risks: [], gaps: [], nextAction: 'Revisar o plano.', rawResponse: 'Plano preparado.' } }

afterEach(() => vi.restoreAllMocks())

it('consulta é somente leitura e valida escopo antes de preparar', async () => {
  const overview = vi.spyOn(AlixOperationalPlanService.prototype, 'overview').mockResolvedValue(plan)
  const prepare = vi.spyOn(AlixOperationalPlanService.prototype, 'prepare').mockResolvedValue({ reused: false, plan, mission } as any)
  const app = Fastify()
  try {
    await app.register(routes)
    const response = await app.inject('/api/alix/operations?clienteId=cliente%20a')
    expect(response.statusCode).toBe(200)
    expect(overview).toHaveBeenCalledWith({ clienteId: 'cliente a' })
    expect(prepare).not.toHaveBeenCalled()
    expect((await app.inject('/api/alix/operations?clienteId=')).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/alix/operations/prepare', payload: { clienteId: 'c1', actorId: 'externo' } })).statusCode).toBe(400)
    const created = await app.inject({ method: 'POST', url: '/api/alix/operations/prepare', payload: { clienteId: 'c1' } })
    expect(created.statusCode).toBe(200)
    expect(created.json().data.mission.id).toBe('mission_test')
    expect(prepare).toHaveBeenCalledWith({ clienteId: 'c1', actorId: undefined })
  } finally { await app.close() }
})

it('não afirma que preparou plano quando a persistência falha', async () => {
  vi.spyOn(AlixOperationalPlanService.prototype, 'prepare').mockRejectedValue(new Error('persistência indisponível'))
  const app = Fastify({ logger: false })
  try {
    await app.register(routes)
    const response = await app.inject({ method: 'POST', url: '/api/alix/operations/prepare', payload: {} })
    expect(response.statusCode).toBe(503)
    expect(response.json().success).toBe(false)
    expect(response.json().data).toBeUndefined()
  } finally { await app.close() }
})

it('não publica conclusão quando o serviço retorna uma missão interrompida', async () => {
  vi.spyOn(AlixOperationalPlanService.prototype, 'prepare').mockResolvedValue({ reused: false, plan, mission: { ...mission, status: 'cancelled', progress: 55 } } as any)
  const app = Fastify({ logger: false })
  try {
    await app.register(routes)
    const response = await app.inject({ method: 'POST', url: '/api/alix/operations/prepare', payload: {} })
    expect(response.statusCode).toBe(503)
    expect(response.json().success).toBe(false)
  } finally { await app.close() }
})
