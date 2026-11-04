/**
 * Schema initialization for a fresh database.
 *
 * The hosting platform gives the Worker a D1 binding but no external SQL tool,
 * so the Worker owns its own schema: on first request per isolate it checks
 * `meta.schema_version` and, when it is behind, applies the (idempotent,
 * `CREATE TABLE IF NOT EXISTS`) statements from worker/db/schema.sql.
 *
 * That file is the single source of truth for both local development
 * (`npm run db:local`) and production. The build step embeds it as a string so
 * no filesystem or extra binding is required at runtime.
 */
import { SCHEMA_SQL } from './schema.generated.ts'

export const SCHEMA_VERSION = '2'

/**
 * Columns added after the first release. `CREATE TABLE IF NOT EXISTS` cannot add
 * them to an existing table, so they are applied separately and a duplicate
 * column (fresh database, or already migrated) is ignored.
 */
const COLUMN_MIGRATIONS = [
  `ALTER TABLE users ADD COLUMN password_hash TEXT`,
  `ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'freebuff'`,
  `ALTER TABLE users ADD COLUMN email_edited INTEGER NOT NULL DEFAULT 0`,
]

async function addMissingColumns(db: D1Database): Promise<void> {
  for (const statement of COLUMN_MIGRATIONS) {
    try {
      await db.prepare(statement).run()
    } catch {
      // The column already exists — nothing to do.
    }
  }
}

let applied: Promise<void> | null = null

function statements(): string[] {
  return SCHEMA_SQL
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
}

async function apply(db: D1Database, requestId: string): Promise<void> {
  try {
    const row = await db
      .prepare(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
      .run()
    void row
    const current = await db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).first<{ value: string }>()
    if (current?.value === SCHEMA_VERSION) return

    const batch = statements()
    // D1 batches run statements sequentially in one round trip.
    await db.batch(batch.map((statement) => db.prepare(statement)))
    await addMissingColumns(db)
    await db
      .prepare(
        `INSERT INTO meta (key, value) VALUES ('schema_version', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .bind(SCHEMA_VERSION)
      .run()
    console.log(`[${requestId}] database schema initialized at version ${SCHEMA_VERSION}`)
  } catch (error) {
    console.error(`[${requestId}] schema initialization failed`, error)
    throw error
  }
}

/** Runs at most once per isolate; safe to call on every request. */
export function ensureSchema(db: D1Database, requestId: string): Promise<void> {
  applied ??= apply(db, requestId).catch((error) => {
    // Let a later request retry rather than caching the failure forever.
    applied = null
    throw error
  })
  return applied
}
