import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Configuração opt-in: não lê .env e não permite usar o PostgreSQL da aplicação.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: '/tmp/aletis-proposal-workflow-vitest-cache',
  test: {
    include: ['tests/api/proposal-workflow-pg.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    env: {
      ALETIS_PROPOSAL_WORKFLOW_FIXTURE: '1',
      ALETIS_PG_ENABLED: '1',
      DATABASE_URL: 'postgresql://postgres:aletis-fixture-only@127.0.0.1:55436/aletis_implementation_fixture',
      ALETIS_INTERNAL_AUTH_ENABLED: '0',
      ALIX_MEMORY_ENABLED: '0',
      ALIX_RAG_ENABLED: '0',
      OPENAI_API_KEY: '',
      N8N_WEBHOOK_URL: '',
      AUTOMATION_N8N_WEBHOOK_URL: '',
    },
  },
})
