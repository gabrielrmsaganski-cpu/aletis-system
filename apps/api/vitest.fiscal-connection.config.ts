import { defineConfig } from 'vitest/config'
export default defineConfig({ test: {
  include: ['tests/api/fiscal-connection*.test.ts','tests/lib/fiscal-certificate*.test.ts','tests/lib/nfe-distribution*.test.ts','tests/lib/fiscal-workbook*.test.ts'],
  environment: 'node', testTimeout: 30000, hookTimeout: 60000, maxWorkers:1, fileParallelism:false,
  env:{NODE_ENV:'test',ALETIS_PG_ENABLED:'0',ALETIS_INTERNAL_AUTH_ENABLED:'0',ALIX_LLM_ENABLED:'false',ALETIS_FISCAL_WORKER_ENABLED:'false',ALETIS_PORTAL_PROCESSOR_ENABLED:'false'},
} })
