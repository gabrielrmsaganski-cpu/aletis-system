import { defineConfig } from 'vitest/config'

// Não carrega .env. As suítes simulam banco, rede, IA, arquivos e automações.
export default defineConfig({
  test: {
    include: ['tests/api/crm-write-safety.test.ts', 'tests/db/crm-write-repositories.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 10000,
    env: { ALETIS_PG_ENABLED: '0', ALETIS_INTERNAL_AUTH_ENABLED: '0' },
  },
})
