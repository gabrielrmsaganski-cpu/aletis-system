import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../src/services/llm/ModelCatalog.js', () => ({ getRuntimeModelCatalog: mocks.get }))
import routes from '../../src/routes/alix-models.js'

describe('GET /api/alix/models', () => {
  it('expõe disponibilidade desconhecida com erro e remove propriedades internas', async () => {
    mocks.get.mockResolvedValue({
      checkedAt: '2026-09-06T12:00:00.000Z', verifiedAt: '2026-09-06T11:58:00.000Z',
      provider: 'foundry', configured: true, stale: true, error: 'Verificação indisponível', apiKey: 'must-not-leak',
      models: [{ id: 'gpt-6-astra', deployment: 'astra-production', label: 'GPT-6 Astra', provider: 'foundry', availability: 'unknown', capabilities: ['chat'], protocols: ['responses'] }],
    })
    const app = Fastify()
    await app.register(routes)
    try {
      const response = await app.inject({ method: 'GET', url: '/api/alix/models' })
      expect(response.statusCode).toBe(200)
      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.json()).toMatchObject({ stale: true, models: [{ availability: 'unknown' }] })
      expect(response.body).not.toContain('must-not-leak')
      expect(mocks.get).toHaveBeenCalledTimes(1)
    } finally { await app.close() }
  })
})
