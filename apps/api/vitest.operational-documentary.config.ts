import { defineConfig } from 'vitest/config'

// Suítes isoladas: nenhum carregamento do ambiente ou do banco de produção.
export default defineConfig({ test: {
  include: ['tests/alix/operational-drive-analysis.test.ts', 'tests/alix/operational-drive-analysis-pg.test.ts', 'tests/alix/operational-documentary.test.ts', 'tests/alix/operational-documentary-pg.test.ts', 'tests/alix/operational-plan.test.ts', 'tests/alix/operational-handoff.test.ts', 'tests/alix/governance.test.ts', 'tests/api/alix-operational-handoff.test.ts', 'tests/api/alix-operations.test.ts', 'tests/api/frontend-operations.test.ts'],
  environment: 'node', globals: false, testTimeout: 30_000, hookTimeout: 30_000, maxWorkers: 1, minWorkers: 1,
  env: { ALETIS_PG_ENABLED: '0', ALETIS_INTERNAL_AUTH_ENABLED: '0', ALIX_AUTH_STRICT: 'false' },
} })
