import { defineConfig } from 'vitest/config'

// Somente o hook de interface: sem .env, rede, modelo ou banco de dados.
export default defineConfig({ test: {
  include: ['tests/api/frontend-alix-streaming.test.ts'],
  environment: 'jsdom', globals: false, maxWorkers: 1, minWorkers: 1,
  testTimeout: 10_000, hookTimeout: 10_000,
  env: { ALETIS_PG_ENABLED: '0', ALETIS_INTERNAL_AUTH_ENABLED: '0', ALIX_USE_LLM: 'false' },
} })
