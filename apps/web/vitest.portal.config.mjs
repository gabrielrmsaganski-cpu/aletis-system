export default {
  root: new URL('.', import.meta.url).pathname,
  cacheDir: '/tmp/aletis-portal-documents-ui-vite',
  resolve: { alias: { vitest: new URL('../api/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  esbuild: { jsx: 'automatic' },
  test: { include: ['tests/portal-document*.test.ts', 'tests/portal-document*.test.tsx', 'tests/fiscal-connection-ui.test.tsx', 'tests/fiscal-archive-years-ui.test.tsx'], environment: 'node', testTimeout: 10000, fileParallelism: false },
}
