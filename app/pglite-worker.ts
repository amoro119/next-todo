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
    // 在浏览器环境中，PGlite 会自动使用 IndexedDB 存储
    const pg = await PGlite.create({
      dataDir: 'idb://todo-local-db',
      relaxedDurability: true,
      // 不指定 dataDir，让 PGlite 自动使用 IndexedDB
    })

    // Always run migrations to ensure schema is up to date
    // This handles both fresh databases and existing databases that need updates
    console.log('Applying/updating client-side database schema...')
    await migrate(pg)
    console.log('Client-side schema applied/updated.')
    
    return pg
  },
})