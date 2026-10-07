import { build } from 'esbuild'
import { readFile, rm, writeFile } from 'node:fs/promises'

await rm('dist/worker', { recursive: true, force: true })

// Embed the schema (single source of truth) as a string so the Worker can
// initialize a fresh D1 database on its own — see worker/db/migrate.ts.
const schema = await readFile('worker/db/schema.sql', 'utf8')
await writeFile(
  'worker/db/schema.generated.ts',
  `/** AUTO-GENERATED from worker/db/schema.sql by tools/build-worker.mjs — do not edit. */\nexport const SCHEMA_SQL = ${JSON.stringify(schema)}\n`,
)

await build({
  entryPoints: ['worker/index.ts'],
  outfile: 'dist/worker/index.js',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'neutral',
  // Workerd-first resolution so we never pull a Node build of a dependency.
  conditions: ['workerd', 'worker', 'browser', 'import', 'module', 'default'],
  mainFields: ['module', 'browser', 'main'],
  external: ['cloudflare:workers'],
  sourcemap: false, // never upload source maps
  minify: true,
  legalComments: 'none',
  logLevel: 'info',
})

console.log('worker bundle → dist/worker/index.js')
