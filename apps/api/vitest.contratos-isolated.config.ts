import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/api/generated-contract-catalog.test.ts', 'tests/api/contract-generation-validation.test.ts', 'tests/db/generated-contract-persistence.test.ts'],
    environment: 'node',
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    env: { ALETIS_INTERNAL_AUTH_ENABLED: '0', ALETIS_PG_ENABLED: '0' },
  },
})
