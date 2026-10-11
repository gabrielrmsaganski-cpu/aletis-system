export default {
  root: new URL('.', import.meta.url).pathname,
  cacheDir: '/tmp/aletis-alix-notebook-sources-ui-vite',
  resolve: { alias: { vitest: new URL('../api/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  esbuild: { jsx: 'automatic' },
  test: { include: ['tests/alix-notebook-source-scope-ui.test.tsx'], environment: 'jsdom', testTimeout: 10000, fileParallelism: false },
}
