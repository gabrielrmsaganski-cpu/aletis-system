import { defineConfig } from 'vitest/config'

// O banco de testes é explicitamente validado em cada suíte; não carregar .env de produção.
export default defineConfig({
  test: {
    include: ['tests/api/drive-corpus-ingestion.test.ts','tests/alix/drive-corpus-access.test.ts','tests/alix/drive-corpus-tools.test.ts','tests/api/drive-authorization.test.ts','tests/api/google-corporate-callback.test.ts'],
    environment: 'node', globals: false, testTimeout: 60000, hookTimeout: 60000,
    maxWorkers: 1, minWorkers: 1,
    env: { ALETIS_PG_ENABLED: '0', ALETIS_INTERNAL_AUTH_ENABLED: '0' },
  },
})
