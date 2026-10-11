export default {
  root: new URL('.', import.meta.url).pathname,
  cacheDir: '/tmp/aletis-ui-redesign-vitest',
  resolve: { alias: { vitest: new URL('../api/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/*.test.ts', 'tests/*.test.tsx'],
    exclude: ['tests/entity-search.test.ts', 'tests/ticker-data.test.ts', 'tests/whatsapp-manual-send.test.ts', 'tests/simulation-route-sync.test.ts', 'tests/simulation-workspace.test.ts'],
    environment: 'jsdom', testTimeout: 15000, fileParallelism: false,
  },
}
