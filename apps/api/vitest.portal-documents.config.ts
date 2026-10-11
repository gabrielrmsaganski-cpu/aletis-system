import { defineConfig } from 'vitest/config'
// A URL do fixture é lida exclusivamente pelo teste, com validação explícita de host/porta/base.
export default defineConfig({ test: {
  include: ['tests/api/portal-document-persistence.test.ts', 'tests/api/portal-alix-public-context.test.ts', 'tests/api/portal-document-routes.test.ts'],
  environment: 'node', testTimeout: 15000, hookTimeout: 30000,
  env: { NODE_ENV: 'test', ALETIS_PG_ENABLED: '0', ALETIS_INTERNAL_AUTH_ENABLED: '0', ALIX_LLM_ENABLED: 'false' },
} })
