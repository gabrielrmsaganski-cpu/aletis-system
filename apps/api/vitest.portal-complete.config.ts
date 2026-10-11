import { defineConfig } from 'vitest/config'

// Isolado: nenhuma suíte carrega credenciais ou dados de produção.
export default defineConfig({ test: {
  include: ['tests/api/portal-*.test.ts', 'tests/lib/portal-*.test.ts', 'tests/portal/portal-*.test.ts'],
  environment: 'node', testTimeout: 30000, hookTimeout: 30000,
  maxWorkers: 1, fileParallelism: false,
  env: { NODE_ENV: 'test', ALETIS_PG_ENABLED: '0', ALETIS_INTERNAL_AUTH_ENABLED: '0', ALIX_LLM_ENABLED: 'false', ALETIS_PORTAL_PROCESSOR_ENABLED: 'false' },
} })
