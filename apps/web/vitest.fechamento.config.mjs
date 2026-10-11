export default {
  root: new URL('.', import.meta.url).pathname,
  cacheDir: '/tmp/aletis-fechamento-ui-vite',
  resolve: { alias: { vitest: new URL('../api/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: {
    include: ['tests/proposal-draft.test.ts', 'tests/api-errors.test.ts', 'tests/proposal-editor-ui.test.tsx'],
    environment: 'node', testTimeout: 10000,
  },
}
