import Dexie, { type Table } from 'dexie'
import type { Todo, List, Goal, GoalProgress, Meta, PendingOperation } from './types'
import { SCHEMA } from './schema'
import {
  CURRENT_DATABASE_NAME,
  migrateLegacyDatabase,
} from './legacyMigration'

export class TodoDatabase extends Dexie {
  todos!: Table<Todo>
  lists!: Table<List>
  goals!: Table<Goal>
  goal_progress!: Table<GoalProgress>
  meta!: Table<Meta>
  pendingOperations!: Table<PendingOperation>

  constructor(databaseName = CURRENT_DATABASE_NAME) {
    super(databaseName)
    // This is a new physical database. Never reuse this schema declaration for
    // the legacy todo-local-db: its pendingOperations primary key may be `id`.
    this.version(1).stores(SCHEMA)
  }
}

export const db = new TodoDatabase()

export async function initializeDatabase(): Promise<TodoDatabase> {
  await db.open()
  await migrateLegacyDatabase(db)
  return db
}
