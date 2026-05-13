import Dexie, { type Table } from 'dexie'
import type { Todo, List, Goal, GoalProgress, Meta } from './types'
import { SCHEMA } from './schema'

export class TodoDatabase extends Dexie {
  todos!: Table<Todo>
  lists!: Table<List>
  goals!: Table<Goal>
  goal_progress!: Table<GoalProgress>
  meta!: Table<Meta>

  constructor() {
    super('todo-local-db')
    this.version(1).stores(SCHEMA)
  }
}

export const db = new TodoDatabase()

export async function initializeDatabase(): Promise<TodoDatabase> {
  await db.open()
  return db
}
