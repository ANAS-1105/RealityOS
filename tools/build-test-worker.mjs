import { build } from 'esbuild'

await build({
  entryPoints: ['tests/fixtures/test-worker.ts'],
  outfile: 'dist/test-worker/index.js',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'neutral',
  conditions: ['workerd', 'worker', 'browser', 'import', 'module', 'default'],
  mainFields: ['module', 'browser', 'main'],
  external: ['cloudflare:workers'],
  sourcemap: false,
  logLevel: 'warning',
})
console.log('test worker bundle → dist/test-worker/index.js')
