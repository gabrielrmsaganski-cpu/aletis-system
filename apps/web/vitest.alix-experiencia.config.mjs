export default {
  root: new URL('.', import.meta.url).pathname,
  cacheDir: '/tmp/aletis-alix-experiencia-ui-vite',
  resolve: { alias: { vitest: new URL('../api/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { include: ['tests/alix-reading-ui.test.tsx', 'tests/alix-conversation-scroll-ui.test.tsx', 'tests/alix-session-continuity-ui.test.tsx'], environment: 'jsdom', testTimeout: 10000, fileParallelism: false },
}
