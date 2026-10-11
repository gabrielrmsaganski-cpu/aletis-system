import { defineConfig } from 'vitest/config'

// Fixtures sintéticas e backends em memória; nunca carrega o .env nem o banco real.
export default defineConfig({ test: {
  include: ['tests/alix/document-financial-review.test.ts', 'tests/alix/document-financial-executor.test.ts',
    'tests/alix/crm-enrichment-missing-values.test.ts', 'tests/alix/document-onboarding-review.test.ts',
    'tests/alix/client-onboarding-dossier.test.ts', 'tests/alix/onboarding-enrichment.test.ts',
    'tests/alix/crm-diff-service.test.ts', 'tests/alix/grounding-guard.test.ts',
    'tests/alix/crm-writer-tools.test.ts', 'tests/alix/orchestrator-runtime.test.ts'],
  environment: 'node', globals: false, maxWorkers: 1, minWorkers: 1, testTimeout: 30_000,
  env: { ALETIS_PG_ENABLED: '0', ALETIS_INTERNAL_AUTH_ENABLED: '0', ALIX_USE_LLM: 'false' },
} })
