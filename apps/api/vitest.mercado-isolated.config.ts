import { defineConfig } from 'vitest/config'

// Execução offline: não carrega .env; fontes HTTP e integrações são simuladas.
export default defineConfig({
  test: {
    include: ['tests/api/mercado-integrity.test.ts', 'tests/api/mercado-risk-ui.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 10000,
    env: { ALETIS_PG_ENABLED: '0', ALETIS_INTERNAL_AUTH_ENABLED: '0' },
  },
})
