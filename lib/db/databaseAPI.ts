import type { Table } from 'dexie'
import type { TodoDatabase } from './dexie'
import type { Todo, List, Goal } from './types'
import {
  enqueueOutboxMutation,
  getOrCreateDeviceId,
  notifyOutboxChanged,
} from '@/lib/supabase/realtime/offlineQueue'

const DEFAULT_USER_ID = 'default_user'

type SyncTableName = 'todos' | 'lists' | 'goals'
type SyncEntity = Todo | List | Goal

const LOCAL_ONLY_FIELDS = new Set([
  'id',
  'user_id',
  'updated_at',
  'revision',
  'server_modified',
  'deleted',
  'list_name',
])

export interface DatabaseAPI {
  getTodos(listId?: string): Promise<Todo[]>
  getLists(): Promise<List[]>
  getGoals(): Promise<Goal[]>
  addTodo(todo: Partial<Todo>): Promise<Todo>
  updateTodo(id: string, updates: Partial<Todo>): Promise<Todo>
  completeTodoWithSuccessor(
    id: string,
    updates: Partial<Todo>,
    successor: Partial<Todo>,
  ): Promise<{ todo: Todo; successor: Todo }>
  deleteTodo(id: string): Promise<Todo>
  hardDeleteTodo(id: string): Promise<void>
  addList(list: Partial<List>): Promise<List>
  updateList(id: string, updates: Partial<List>): Promise<List>
  deleteList(id: string): Promise<List>
  hardDeleteList(id: string): Promise<void>
  addGoal(goal: Partial<Goal>): Promise<Goal>
  updateGoal(id: string, updates: Partial<Goal>): Promise<Goal>
  deleteGoal(id: string): Promise<Goal>
  hardDeleteGoal(id: string): Promise<void>
  importBatch(input: ImportBatchInput): Promise<ImportBatchResult>
  clearLocalData(): Promise<void>
}

export interface ImportBatchInput {
  lists: Partial<List>[]
  todos: Partial<Todo>[]
}

export interface ImportBatchResult {
  lists: List[]
  todos: Todo[]
  skippedLists: number
  skippedTodos: number
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function serverPatch(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key, fieldValue]) => (
      fieldValue !== undefined && !LOCAL_ONLY_FIELDS.has(key)
    )),
  )
}

function baseForPatch(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(Object.keys(patch).map((field) => [field, before[field]]))
}

function sanitizeUpdates<T extends SyncEntity>(updates: Partial<T>): Partial<T> {
  const sanitized = { ...updates }
  delete sanitized.id
  delete sanitized.revision
  delete sanitized.server_modified
  delete sanitized.updated_at
  return sanitized
}

export function createDexieDatabaseAPI(database: TodoDatabase): DatabaseAPI {
  const now = () => new Date().toISOString()

  function makeTodoRecord(todo: Partial<Todo>, timestamp = now()): Todo {
    const deletedAt = todo.deleted_at ?? (todo.deleted ? timestamp : null)
    return {
      id: todo.id ?? randomId(),
      title: todo.title ?? '',
      completed: todo.completed ?? false,
      deleted: deletedAt != null,
      sort_order: todo.sort_order ?? 0,
      due_date: todo.due_date ?? null,
      content: todo.content ?? null,
      tags: todo.tags ?? null,
      priority: todo.priority ?? 0,
      created_time: todo.created_time ?? timestamp,
      completed_time: todo.completed_time ?? null,
      start_date: todo.start_date ?? null,
      list_id: todo.list_id ?? null,
      user_id: todo.user_id ?? DEFAULT_USER_ID,
      repeat: todo.repeat ?? null,
      reminder: todo.reminder ?? null,
      is_recurring: todo.is_recurring ?? false,
      recurring_parent_id: todo.recurring_parent_id ?? null,
      instance_number: todo.instance_number ?? null,
      next_due_date: todo.next_due_date ?? null,
      goal_id: todo.goal_id ?? null,
      sort_order_in_goal: todo.sort_order_in_goal ?? null,
      updated_at: timestamp,
      deleted_at: deletedAt,
      revision: 0,
      server_modified: null,
    }
  }

  function makeListRecord(list: Partial<List>, timestamp = now()): List {
    return {
      id: list.id ?? randomId(),
      name: list.name ?? '',
      sort_order: list.sort_order ?? 0,
      is_hidden: list.is_hidden ?? false,
      user_id: list.user_id ?? DEFAULT_USER_ID,
      updated_at: timestamp,
      deleted_at: list.deleted_at ?? null,
      revision: 0,
      server_modified: null,
    }
  }

  async function insertWithOutbox<T extends SyncEntity>(
    tableName: SyncTableName,
    table: Table<T>,
    record: T,
  ): Promise<T> {
    const deviceId = await getOrCreateDeviceId(database)
    await database.transaction('rw', [table, database.pendingOperations], async () => {
      await table.add(record)
      await enqueueOutboxMutation(database, {
        deviceId,
        table: tableName,
        recordId: record.id,
        operation: 'insert',
        expectedRevision: null,
        patch: serverPatch(record as unknown as Record<string, unknown>),
        baseValues: {},
      })
    })
    notifyOutboxChanged()
    return record
  }

  async function updateWithOutbox<T extends SyncEntity>(
    tableName: SyncTableName,
    table: Table<T>,
    id: string,
    requestedUpdates: Partial<T>,
  ): Promise<T> {
    const deviceId = await getOrCreateDeviceId(database)
    let result: T | undefined

    await database.transaction('rw', [table, database.pendingOperations], async () => {
      const before = await table.get(id)
      if (!before) throw new Error(`${tableName} record not found: ${id}`)

      const updates = sanitizeUpdates(requestedUpdates)
      const updatedAt = now()
      result = {
        ...before,
        ...updates,
        updated_at: updatedAt,
      }

      const patch = serverPatch(updates as Record<string, unknown>)
      if ('completed' in patch || 'completed_time' in patch) {
        patch.completed = (result as unknown as Record<string, unknown>).completed
        patch.completed_time = (result as unknown as Record<string, unknown>).completed_time
      }

      await table.put(result)
      if (Object.keys(patch).length > 0) {
        const deleting = patch.deleted_at != null
        const restoring = Object.prototype.hasOwnProperty.call(patch, 'deleted_at')
          && patch.deleted_at === null
        await enqueueOutboxMutation(database, {
          deviceId,
          table: tableName,
          recordId: id,
          operation: deleting ? 'delete' : restoring ? 'restore' : 'update',
          expectedRevision: Number(before.revision ?? 0) > 0
            ? Number(before.revision)
            : null,
          patch,
          baseValues: baseForPatch(
            before as unknown as Record<string, unknown>,
            patch,
          ),
        })
      }
    })

    notifyOutboxChanged()
    return result!
  }

  return {
    async getTodos(listId?: string): Promise<Todo[]> {
      if (listId !== undefined) {
        return database.todos
          .filter((todo) => todo.deleted_at == null && todo.list_id === listId)
          .toArray()
      }
      return database.todos.filter((todo) => todo.deleted_at == null).toArray()
    },

    async getLists(): Promise<List[]> {
      return database.lists.filter((list) => list.deleted_at == null).toArray()
    },

    async getGoals(): Promise<Goal[]> {
      return database.goals.filter((goal) => goal.deleted_at == null).toArray()
    },

    async addTodo(todo: Partial<Todo>): Promise<Todo> {
      const timestamp = now()
      const record = makeTodoRecord(todo, timestamp)
      return insertWithOutbox('todos', database.todos, record)
    },

    async updateTodo(id: string, updates: Partial<Todo>): Promise<Todo> {
      const normalized = { ...updates }
      if (updates.deleted === true && updates.deleted_at === undefined) {
        normalized.deleted_at = now()
      }
      if (updates.deleted === false && updates.deleted_at === undefined) {
        normalized.deleted_at = null
      }
      return updateWithOutbox('todos', database.todos, id, normalized)
    },

    async completeTodoWithSuccessor(
      id: string,
      requestedUpdates: Partial<Todo>,
      successorInput: Partial<Todo>,
    ): Promise<{ todo: Todo; successor: Todo }> {
      if (!successorInput.id) throw new Error('Recurring successor requires a deterministic id')
      const deviceId = await getOrCreateDeviceId(database)
      let todo!: Todo
      let successor!: Todo

      await database.transaction(
        'rw',
        [database.todos, database.pendingOperations],
        async () => {
          const before = await database.todos.get(id)
          if (!before) throw new Error(`todos record not found: ${id}`)
          const timestamp = now()
          const updates = sanitizeUpdates({
            ...requestedUpdates,
            completed: true,
            completed_time: requestedUpdates.completed_time ?? timestamp,
          })
          todo = { ...before, ...updates, updated_at: timestamp }
          const patch = serverPatch(updates as Record<string, unknown>)
          patch.completed = todo.completed
          patch.completed_time = todo.completed_time
          await database.todos.put(todo)
          await enqueueOutboxMutation(database, {
            deviceId,
            table: 'todos',
            recordId: id,
            operation: 'update',
            expectedRevision: Number(before.revision ?? 0) || null,
            patch,
            baseValues: baseForPatch(before as unknown as Record<string, unknown>, patch),
          })

          const existingSuccessor = await database.todos.get(successorInput.id!)
          successor = existingSuccessor ?? makeTodoRecord(successorInput, timestamp)
          if (!existingSuccessor) {
            await database.todos.add(successor)
            await enqueueOutboxMutation(database, {
              deviceId,
              table: 'todos',
              recordId: successor.id,
              operation: 'insert',
              expectedRevision: null,
              patch: serverPatch(successor as unknown as Record<string, unknown>),
              baseValues: {},
            })
          }
        },
      )
      notifyOutboxChanged()
      return { todo, successor }
    },

    async deleteTodo(id: string): Promise<Todo> {
      return updateWithOutbox('todos', database.todos, id, {
        deleted: true,
        deleted_at: now(),
      })
    },

    async hardDeleteTodo(id: string): Promise<void> {
      await updateWithOutbox('todos', database.todos, id, {
        deleted: true,
        deleted_at: now(),
      })
    },

    async addList(list: Partial<List>): Promise<List> {
      const timestamp = now()
      return insertWithOutbox('lists', database.lists, makeListRecord(list, timestamp))
    },

    async updateList(id: string, updates: Partial<List>): Promise<List> {
      return updateWithOutbox('lists', database.lists, id, updates)
    },

    async deleteList(id: string): Promise<List> {
      return updateWithOutbox('lists', database.lists, id, { deleted_at: now() })
    },

    async hardDeleteList(id: string): Promise<void> {
      await updateWithOutbox('lists', database.lists, id, { deleted_at: now() })
    },

    async addGoal(goal: Partial<Goal>): Promise<Goal> {
      const timestamp = now()
      return insertWithOutbox('goals', database.goals, {
        id: goal.id ?? randomId(),
        name: goal.name ?? '',
        description: goal.description ?? null,
        list_id: goal.list_id ?? null,
        start_date: goal.start_date ?? null,
        due_date: goal.due_date ?? null,
        priority: goal.priority ?? 0,
        created_time: goal.created_time ?? timestamp,
        is_archived: goal.is_archived ?? false,
        user_id: goal.user_id ?? DEFAULT_USER_ID,
        updated_at: timestamp,
        deleted_at: null,
        revision: 0,
        server_modified: null,
      })
    },

    async updateGoal(id: string, updates: Partial<Goal>): Promise<Goal> {
      return updateWithOutbox('goals', database.goals, id, updates)
    },

    async deleteGoal(id: string): Promise<Goal> {
      return updateWithOutbox('goals', database.goals, id, { deleted_at: now() })
    },

    async hardDeleteGoal(id: string): Promise<void> {
      await updateWithOutbox('goals', database.goals, id, { deleted_at: now() })
    },

    async importBatch(input: ImportBatchInput): Promise<ImportBatchResult> {
      const deviceId = await getOrCreateDeviceId(database)
      const timestamp = now()
      const listRecords = input.lists.map((list) => makeListRecord(list, timestamp))
      const todoRecords = input.todos.map((todo) => makeTodoRecord(todo, timestamp))
      const insertedLists: List[] = []
      const insertedTodos: Todo[] = []

      await database.transaction(
        'rw',
        [database.lists, database.todos, database.pendingOperations],
        async () => {
          for (const record of listRecords) {
            if (await database.lists.get(record.id)) continue
            await database.lists.add(record)
            await enqueueOutboxMutation(database, {
              deviceId,
              table: 'lists',
              recordId: record.id,
              operation: 'insert',
              expectedRevision: null,
              patch: serverPatch(record as unknown as Record<string, unknown>),
              baseValues: {},
            })
            insertedLists.push(record)
          }

          for (const record of todoRecords) {
            if (await database.todos.get(record.id)) continue
            await database.todos.add(record)
            await enqueueOutboxMutation(database, {
              deviceId,
              table: 'todos',
              recordId: record.id,
              operation: 'insert',
              expectedRevision: null,
              patch: serverPatch(record as unknown as Record<string, unknown>),
              baseValues: {},
            })
            insertedTodos.push(record)
          }
        },
      )

      if (insertedLists.length > 0 || insertedTodos.length > 0) notifyOutboxChanged()
      return {
        lists: insertedLists,
        todos: insertedTodos,
        skippedLists: listRecords.length - insertedLists.length,
        skippedTodos: todoRecords.length - insertedTodos.length,
      }
    },

    async clearLocalData(): Promise<void> {
      await database.transaction(
        'rw',
        [
          database.todos,
          database.lists,
          database.goals,
          database.goal_progress,
          database.meta,
          database.pendingOperations,
        ],
        async () => {
          await Promise.all([
            database.todos.clear(),
            database.lists.clear(),
            database.goals.clear(),
            database.goal_progress.clear(),
            database.meta.clear(),
            database.pendingOperations.clear(),
          ])
        },
      )
    },
  }
}
