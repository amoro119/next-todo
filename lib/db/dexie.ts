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
    // version 3: protocol v2 revisions + durable patch outbox
    this.version(3)
      .stores(SCHEMA)
      .upgrade(async (tx) => {
        const now = new Date().toISOString()
        const epoch = '1970-01-01T00:00:00.000Z'

        for (const tableName of ['todos', 'lists', 'goals'] as const) {
          await tx.table(tableName).toCollection().modify((record) => {
            record.revision = Number.isFinite(record.revision) ? record.revision : 0
            record.server_modified = record.server_modified ?? null
          })
        }

        const legacy = await tx.table('pendingOperations').toArray()
        await tx.table('pendingOperations').clear()
        for (const op of legacy) {
          const recordId = op.recordId ?? op.record?.id
          if (!recordId || !op.table) continue
          await tx.table('pendingOperations').put({
            operationId: op.operationId
              ?? op.id
              ?? globalThis.crypto?.randomUUID?.()
              ?? `${Date.now()}-${Math.random()}`,
            deviceId: op.deviceId ?? 'legacy-device',
            table: op.table,
            recordId,
            operation: op.operation ?? 'update',
            expectedRevision: null,
            patch: {},
            baseValues: {},
            generation: 1,
            status: 'blocked',
            retryCount: op.retryCount ?? 0,
            nextAttemptAt: null,
            lastError: 'legacy-operation-requires-review',
            createdAt: op.timestamp ?? epoch,
            updatedAt: now,
            legacyRecord: op.record,
          })
        }
      })
  }
}

export const db = new TodoDatabase()

export async function initializeDatabase(): Promise<TodoDatabase> {
  await db.open()
  return db
}
