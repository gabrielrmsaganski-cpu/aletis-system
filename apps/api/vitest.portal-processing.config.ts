import { defineConfig } from 'vitest/config'

// Não carrega .env nem conecta a dados reais. PG é somente fixture explícita.
export default defineConfig({ test: {
  include: ['tests/portal/portal-document-processor.test.ts', 'tests/portal/portal-drive-archiver.test.ts', 'tests/portal/portal-processing-pg.test.ts'],
  environment: 'node', testTimeout: 30_000, hookTimeout: 30_000, fileParallelism: false,
  env: { NODE_ENV: 'test', ALETIS_PG_ENABLED: '0', ALIX_LLM_ENABLED: 'false', ALETIS_INTERNAL_AUTH_ENABLED: '0' },
} })
