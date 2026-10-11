import { afterEach, expect, it, vi } from 'vitest'
import { isOpenAIAuxiliaryEnabled, isPrimaryLLMEnabled } from '../../src/services/llm/ProviderConfig.js'
import Fastify from 'fastify'
import telemetryRoutes from '../../src/routes/alix-telemetry-dashboard.js'

afterEach(() => vi.unstubAllEnvs())
it('mantém Foundry independente da chave dos serviços auxiliares OpenAI', () => {
  vi.stubEnv('ALIX_USE_LLM', 'true')
  vi.stubEnv('ALIX_LLM_PROVIDER', 'foundry')
  vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://test.openai.azure.com')
  vi.stubEnv('AZURE_OPENAI_API_KEY', 'synthetic')
  vi.stubEnv('OPENAI_API_KEY', '')
  expect(isPrimaryLLMEnabled()).toBe(true)
  expect(isOpenAIAuxiliaryEnabled()).toBe(false)
  vi.stubEnv('OPENAI_API_KEY', 'synthetic-auxiliary')
  vi.stubEnv('AZURE_OPENAI_API_KEY', '')
  expect(isPrimaryLLMEnabled()).toBe(false)
  expect(isOpenAIAuxiliaryEnabled()).toBe(true)
})
it('desativar IA desativa tanto provedor principal quanto serviços auxiliares', () => {
  vi.stubEnv('ALIX_USE_LLM', 'false')
  vi.stubEnv('OPENAI_API_KEY', 'synthetic')
  expect(isPrimaryLLMEnabled()).toBe(false)
  expect(isOpenAIAuxiliaryEnabled()).toBe(false)
})
it('painel do Foundry retorna custo desconhecido em vez de zero presumido', async () => {
  vi.stubEnv('ALIX_LLM_PROVIDER', 'foundry')
  vi.stubEnv('ALIX_STORAGE_DIR', '/tmp/aletis-no-telemetry-fixture')
  const app = Fastify()
  try {
    await app.register(telemetryRoutes)
    const response = await app.inject('/api/alix/telemetry-dashboard')
    expect(response.statusCode).toBe(200)
    expect(response.json().data).toMatchObject({ provider: 'foundry', costKnown: false, custoHoje: null, custoMes: null, totals: { costUsd: null } })
  } finally { await app.close() }
})
