// db/migrations-client/index.ts
import { PGlite } from '@electric-sql/pglite'
import migration from './01-create_tables.sql?raw'

export async function migrate(db: PGlite) {
  await db.exec(migration)
}

export async function postInitialSync(db: PGlite) {
  console.log('Applying post-initial-sync migrations (enabling triggers)...')
  await db.exec(`
    ALTER TABLE lists ENABLE TRIGGER ALL;
    ALTER TABLE todos ENABLE TRIGGER ALL;
  `)
  console.log('Triggers enabled.')
}