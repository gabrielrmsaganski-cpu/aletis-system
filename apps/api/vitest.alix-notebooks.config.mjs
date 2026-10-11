export default {
  test: {
    root: new URL('.', import.meta.url).pathname,
    environment: 'node',
    globals: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    env: {
      ALETIS_PG_ENABLED: '0',
      ALETIS_INTERNAL_AUTH_ENABLED: '0',
      ALIX_USE_LLM: 'false',
      OPENAI_API_KEY: '',
      AZURE_OPENAI_API_KEY: '',
      ALIX_PROACTIVE_ENABLED: 'false',
    },
  },
}
