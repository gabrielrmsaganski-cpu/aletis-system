import { defineConfig } from 'vitest/config'

// Suíte isolada: nunca carrega o .env de produção.
export default defineConfig({ test: {
  include: ['tests/api/simulation-workspace*.test.ts', 'tests/alix/simulador-operacao-tools.test.ts', 'tests/api/*spreadsheet*.test.ts', 'tests/api/*xlsm*.test.ts'],
  environment: 'node', testTimeout: 30000, hookTimeout: 30000,
  env: { NODE_ENV: 'test', ALETIS_PG_ENABLED: '0', ALETIS_INTERNAL_AUTH_ENABLED: '0', ALIX_LLM_ENABLED: 'false' },
} })
