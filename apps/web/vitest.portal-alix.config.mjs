export default {
 root:new URL('.',import.meta.url).pathname,
 cacheDir:'/tmp/aletis-portal-alix-ui-vite',
 resolve:{alias:{vitest:new URL('../api/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 esbuild:{jsx:'automatic'},
 test:{include:['tests/portal-alix-ui.test.tsx'],environment:'node',testTimeout:10000,fileParallelism:false},
}
