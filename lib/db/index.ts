export * from './types'
export * from './schema'
export { db, TodoDatabase, initializeDatabase } from './dexie'
export {
  CURRENT_DATABASE_NAME,
  LEGACY_DATABASE_NAME,
  LEGACY_MIGRATION_MARKER,
  migrateLegacyDatabase,
} from './legacyMigration'
export { createDexieDatabaseAPI } from './databaseAPI'
export type { DatabaseAPI } from './databaseAPI'
