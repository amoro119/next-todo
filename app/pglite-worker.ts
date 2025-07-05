// app/pglite-worker.ts
import { worker } from '@electric-sql/pglite/worker'
import { PGlite } from '@electric-sql/pglite'
import { migrate } from '../db/migrations-client'

/**
 * The PGlite worker.
 * This is the entry point for the PGlite database worker.
 */
worker({
  async init() {
    const pg = await PGlite.create({
      dataDir: 'idb://next-todo-localfirst-db',
      relaxedDurability: true,
    })

    // Check if the 'todos' table exists. If not, it's a fresh DB, so apply migrations.
    const tables = await pg.query(
      `SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'todos';`
    )

    if (tables.rows.length === 0) {
      console.log('Applying client-side database schema...')
      await migrate(pg)
      console.log('Client-side schema applied.')
    }
    
    return pg
  },
})