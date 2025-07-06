// db/migrations-client/index.ts
import { PGlite } from '@electric-sql/pglite'
import migration from './01-create_tables.sql?raw'

export async function migrate(db: PGlite) {
  await db.exec(migration)
}

export async function postInitialSync(db: PGlite) {
  console.log('Post-initial-sync migrations completed (no triggers to enable)')
}