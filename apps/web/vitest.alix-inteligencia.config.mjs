export default {
  root: new URL('.', import.meta.url).pathname,
  cacheDir: '/tmp/aletis-alix-inteligencia-ui-vite',
  resolve: { alias: { vitest: new URL('../api/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { include: ['tests/alix-operational-handoff-ui.test.tsx'], environment: 'jsdom', testTimeout: 10000, fileParallelism: false },
}
