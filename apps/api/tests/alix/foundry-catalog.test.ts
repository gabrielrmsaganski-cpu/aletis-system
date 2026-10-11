import { describe, expect, it, vi } from 'vitest'
import { getLLMProviderConfig } from '../../src/services/llm/ProviderConfig.js'
import { RuntimeModelCatalogService, parseDiscoveredModels } from '../../src/services/llm/ModelCatalog.js'

const env = {
  ALIX_LLM_PROVIDER: 'foundry', AZURE_OPENAI_API_KEY: 'test-only-key',
  AZURE_OPENAI_ENDPOINT: 'https://example.openai.azure.com/', AZURE_OPENAI_RESOURCE_GROUP: 'test-rg',
}
const config = () => getLLMProviderConfig(env)
const deployment = (model: string, state = 'Succeeded', name = model) => ({ name,
  properties: { model: { name: model }, provisioningState: state, capabilities: { responses: 'true', chatCompletion: 'true' } },
})
const raw = [deployment('gpt-6-astra'), deployment('gpt-5.6-sol'), deployment('gpt-5.6-terra'), deployment('gpt-5.6-luna')]

describe('configuração Foundry', () => {
  it('normaliza o endpoint v1 e não utiliza a chave OpenAI como fallback', () => {
    expect(config()).toMatchObject({ configured: true, provider: 'foundry', baseURL: 'https://example.openai.azure.com/openai/v1' })
    expect(getLLMProviderConfig({ ...env, AZURE_OPENAI_API_KEY: '', OPENAI_API_KEY: 'another-provider' })).toMatchObject({ configured: false, apiKey: '' })
  })

  it('recusa endpoint com credencial/query e configuração de provedor desconhecido', () => {
    expect(getLLMProviderConfig({ ...env, AZURE_OPENAI_ENDPOINT: 'https://example.openai.azure.com/?key=secret' }).configured).toBe(false)
    expect(getLLMProviderConfig({ OPENAI_API_KEY: 'test', ALIX_LLM_PROVIDER: 'typo' }).configured).toBe(false)
  })
})

describe('catálogo verificável', () => {
  it('só disponibiliza deployments Succeeded com protocolo Responses', () => {
    const models = parseDiscoveredModels(config(), [deployment('gpt-6-astra', 'Failed'), deployment('gpt-5.6-sol', 'Succeeded', 'sol-production')], '2026-09-06T12:00:00.000Z')
    expect(models.find((m) => m.id === 'gpt-6-astra')?.availability).toBe('unavailable')
    expect(models.find((m) => m.id === 'gpt-5.6-luna')?.availability).toBe('unavailable')
    expect(models.find((m) => m.id === 'gpt-5.6-sol')).toMatchObject({ deployment: 'sol-production', availability: 'available', protocols: ['responses', 'chat_completions'] })
    expect(models[0].capabilities).not.toContain('web_search')
  })

  it('não considera o catálogo global /models evidência de deployment', async () => {
    const service = new RuntimeModelCatalogService({ config, discover: async () => ({ data: [{ id: 'gpt-6-astra' }] }) })
    const result = await service.get()
    expect(result.models.every((m) => m.availability === 'unknown')).toBe(true)
    expect(result.error).toContain('formato inesperado')
  })

  it('respeita mapping explícito sem selecionar outro deployment silenciosamente', () => {
    const mapped = getLLMProviderConfig({ ...env, ALIX_FOUNDRY_DEPLOYMENTS: '{"gpt-5.6-sol":"sol-production"}' })
    expect(parseDiscoveredModels(mapped, raw, '2026-09-06T12:00:00.000Z').find((m) => m.id === 'gpt-5.6-sol')).toMatchObject({ deployment: 'sol-production', availability: 'unavailable' })
  })

  it('coalesce consultas concorrentes, mantém TTL e preserva evidência antiga como desconhecida após falha', async () => {
    let now = 1_000
    const discover = vi.fn().mockResolvedValue(raw)
    const service = new RuntimeModelCatalogService({ config, discover, now: () => now, ttlMs: 100, failureTtlMs: 10 })
    const results = await Promise.all([service.get(), service.get(), service.get()])
    expect(discover).toHaveBeenCalledTimes(1)
    const verifiedAt = results[0].verifiedAt
    results[0].models[0].availability = 'unknown'
    expect((await service.get()).models[0].availability).toBe('available')
    now = 1_101
    discover.mockRejectedValueOnce(new Error('Verificação indisponível'))
    const failed = await service.get()
    expect(failed).toMatchObject({ stale: true, verifiedAt, error: 'Verificação indisponível' })
    expect(failed.checkedAt).not.toBe(verifiedAt)
    expect(failed.models.every((m) => m.availability === 'unknown' && m.verifiedAt === verifiedAt)).toBe(true)
    await service.get()
    expect(discover).toHaveBeenCalledTimes(2)
    now += 11
    expect((await service.get()).models.every((m) => m.availability === 'available')).toBe(true)
    expect(discover).toHaveBeenCalledTimes(3)
  })

  it('invalida cache na troca de conta/chave sem divulgar a chave no retorno', async () => {
    let current = config()
    const discover = vi.fn().mockResolvedValue(raw)
    const service = new RuntimeModelCatalogService({ config: () => current, discover })
    await service.get()
    current = { ...current, apiKey: 'rotated-test-key' }
    const result = await service.get()
    expect(discover).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(result)).not.toMatch(/test-only-key|rotated-test-key|apiKey/)
  })

  it('não consulta o provedor quando a configuração está incompleta', async () => {
    const discover = vi.fn()
    const service = new RuntimeModelCatalogService({ config: () => getLLMProviderConfig({ ALIX_LLM_PROVIDER: 'foundry' }), discover })
    expect(await service.get()).toMatchObject({ configured: false })
    expect(discover).not.toHaveBeenCalled()
  })
})
