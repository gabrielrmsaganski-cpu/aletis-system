import { defineConfig } from 'vitest/config'

// A suíte valida host, porta, banco e schema antes de qualquer escrita de fixture.
export default defineConfig({ test: {
  include: ['tests/api/drive-corpus-analysis.test.ts'], environment: 'node', globals: false,
  maxWorkers: 1, minWorkers: 1, testTimeout: 30_000, hookTimeout: 30_000,
  env: { ALETIS_PG_ENABLED: '0', ALETIS_INTERNAL_AUTH_ENABLED: '0', ALIX_USE_LLM: 'false' },
} })
