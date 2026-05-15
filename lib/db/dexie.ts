import Dexie, { type Table } from 'dexie'
import type { Todo, List, Goal, GoalProgress, Meta, PendingOperation } from './types'
import { SCHEMA } from './schema'

export class TodoDatabase extends Dexie {
  todos!: Table<Todo>
  lists!: Table<List>
  goals!: Table<Goal>
  goal_progress!: Table<GoalProgress>
  meta!: Table<Meta>
  pendingOperations!: Table<PendingOperation>

  constructor() {
    super('todo-local-db')
    // version 1: original schema without pendingOperations
    this.version(1).stores({
      lists: '&id, user_id, deleted_at, updated_at',
      todos: '&id, list_id, goal_id, user_id, deleted_at, updated_at',
      goals: '&id, list_id, user_id, deleted_at, updated_at',
      goal_progress: '&id, goal_id, todo_id, deleted_at, updated_at',
      meta: '&key',
    })
    // version 2: add pendingOperations table
    this.version(2).stores(SCHEMA)
  }
}

export const db = new TodoDatabase()

export async function initializeDatabase(): Promise<TodoDatabase> {
  await db.open()
  return db
}
