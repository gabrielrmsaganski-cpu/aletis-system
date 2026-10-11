export default {
  root: new URL('.', import.meta.url).pathname,
  cacheDir: '/tmp/aletis-alix-context-ui-vite',
  resolve: { alias: { vitest: new URL('../api/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  esbuild: { jsx: 'automatic' },
  test: { include: ['tests/alix-conversation-context-ui.test.tsx', '../api/tests/api/alix-conversation-context.test.ts'], environment: 'jsdom', testTimeout: 10000, fileParallelism: false },
}
