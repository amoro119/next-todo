import type { TodoDatabase } from './dexie'
import type { Todo, List, Goal } from './types'

const DEFAULT_USER_ID = 'default_user'

export interface DatabaseAPI {
  getTodos(listId?: string): Promise<Todo[]>
  getLists(): Promise<List[]>
  getGoals(): Promise<Goal[]>
  addTodo(todo: Partial<Todo>): Promise<Todo>
  updateTodo(id: string, updates: Partial<Todo>): Promise<Todo>
  deleteTodo(id: string): Promise<Todo>
  addList(list: Partial<List>): Promise<List>
  updateList(id: string, updates: Partial<List>): Promise<List>
  deleteList(id: string): Promise<List>
  addGoal(goal: Partial<Goal>): Promise<Goal>
  updateGoal(id: string, updates: Partial<Goal>): Promise<Goal>
  deleteGoal(id: string): Promise<Goal>
  clearLocalData(): Promise<void>
}

export function createDexieDatabaseAPI(database: TodoDatabase): DatabaseAPI {
  const now = () => new Date().toISOString()
  const newId = () => crypto.randomUUID()

  return {
    async getTodos(listId?: string): Promise<Todo[]> {
      if (listId !== undefined) {
        return database.todos
          .filter(t => t.deleted_at == null && t.list_id === listId)
          .toArray()
      }
      return database.todos
        .filter(t => t.deleted_at == null)
        .toArray()
    },

    async getLists(): Promise<List[]> {
      return database.lists.filter(l => l.deleted_at === null).toArray()
    },

    async getGoals(): Promise<Goal[]> {
      return database.goals.filter(g => g.deleted_at === null).toArray()
    },

    async addTodo(todo: Partial<Todo>): Promise<Todo> {
      const record: Todo = {
        id: todo.id ?? newId(),
        title: todo.title ?? '',
        completed: todo.completed ?? false,
        deleted: todo.deleted ?? false,
        sort_order: todo.sort_order ?? 0,
        due_date: todo.due_date ?? null,
        content: todo.content ?? null,
        tags: todo.tags ?? null,
        priority: todo.priority ?? 0,
        created_time: todo.created_time ?? now(),
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
        updated_at: now(),
        deleted_at: null,
      }
      await database.todos.add(record)
      return record
    },

    async updateTodo(id: string, updates: Partial<Todo>): Promise<Todo> {
      const patch: Partial<Todo> & { updated_at: string } = { ...updates, updated_at: now() }
      if (updates.deleted === true && updates.deleted_at === undefined) {
        patch.deleted_at = now()
      }
      if (updates.deleted === false && updates.deleted_at === undefined) {
        patch.deleted_at = null
      }
      await database.todos.update(id, patch)
      const record = await database.todos.get(id)
      if (!record) throw new Error(`Todo not found: ${id}`)
      return record
    },

    async deleteTodo(id: string): Promise<Todo> {
      const record = await database.todos.get(id)
      if (!record) throw new Error(`Todo not found: ${id}`)
      await database.todos.update(id, { deleted_at: now(), updated_at: now() })
      return record
    },

    async addList(list: Partial<List>): Promise<List> {
      const record: List = {
        id: list.id ?? newId(),
        name: list.name ?? '',
        sort_order: list.sort_order ?? 0,
        is_hidden: list.is_hidden ?? false,
        user_id: list.user_id ?? DEFAULT_USER_ID,
        updated_at: now(),
        deleted_at: null,
      }
      await database.lists.add(record)
      return record
    },

    async updateList(id: string, updates: Partial<List>): Promise<List> {
      await database.lists.update(id, { ...updates, updated_at: now() })
      const record = await database.lists.get(id)
      if (!record) throw new Error(`List not found: ${id}`)
      return record
    },

    async deleteList(id: string): Promise<List> {
      const record = await database.lists.get(id)
      if (!record) throw new Error(`List not found: ${id}`)
      await database.lists.update(id, { deleted_at: now(), updated_at: now() })
      return record
    },

    async addGoal(goal: Partial<Goal>): Promise<Goal> {
      const record: Goal = {
        id: goal.id ?? newId(),
        name: goal.name ?? '',
        description: goal.description ?? null,
        list_id: goal.list_id ?? null,
        start_date: goal.start_date ?? null,
        due_date: goal.due_date ?? null,
        priority: goal.priority ?? 0,
        created_time: goal.created_time ?? now(),
        is_archived: goal.is_archived ?? false,
        user_id: goal.user_id ?? DEFAULT_USER_ID,
        updated_at: now(),
        deleted_at: null,
      }
      await database.goals.add(record)
      return record
    },

    async updateGoal(id: string, updates: Partial<Goal>): Promise<Goal> {
      await database.goals.update(id, { ...updates, updated_at: now() })
      const record = await database.goals.get(id)
      if (!record) throw new Error(`Goal not found: ${id}`)
      return record
    },

    async deleteGoal(id: string): Promise<Goal> {
      const record = await database.goals.get(id)
      if (!record) throw new Error(`Goal not found: ${id}`)
      await database.goals.update(id, { deleted_at: now(), updated_at: now() })
      return record
    },

    async clearLocalData(): Promise<void> {
      await database.transaction(
        'rw',
        [database.todos, database.lists, database.goals, database.goal_progress, database.meta, database.pendingOperations],
        async () => {
          await Promise.all([
            database.todos.clear(),
            database.lists.clear(),
            database.goals.clear(),
            database.goal_progress.clear(),
            database.meta.clear(),
            database.pendingOperations.clear(),
          ])
        }
      )
    },
  }
}
