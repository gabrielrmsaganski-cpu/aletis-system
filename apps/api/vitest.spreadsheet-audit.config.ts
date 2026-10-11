import { defineConfig } from 'vitest/config'

// Auditoria de arquivos sintéticos, sem carregar credenciais ou banco do servidor.
export default defineConfig({
  test: {
    include: ['tests/spreadsheet-quality.test.ts', 'tests/xlsm-import-values.test.ts', 'tests/xlsm-import-atomic-pg.test.ts'],
    environment: 'node',
    testTimeout: 15_000,
    hookTimeout: 15_000,
    fileParallelism: false,
    env: { ALETIS_PG_ENABLED: '0', ALETIS_INTERNAL_AUTH_ENABLED: '0' },
  },
})
