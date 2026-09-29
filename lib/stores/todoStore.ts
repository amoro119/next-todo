import { createStore } from 'zustand/vanilla'
import type { StoreApi } from 'zustand/vanilla'
import { dispatchDataChange } from './events'
import type { DatabaseAPI } from '@/lib/db/databaseAPI'
import type { Todo } from '@/lib/db/types'

interface TodoState {
  todos: Todo[]
  addTodo(partial: Partial<Todo>): Promise<void>
  updateTodo(id: string, updates: Partial<Todo>): Promise<void>
  commitTodoNoteDraft(id: string): Promise<Todo | null>
  flushPendingTodoNoteDrafts(): Promise<Todo[]>
  deleteTodo(id: string): Promise<void>
  setTodos(todos: Todo[]): void
}

export function createTodoStore(api: DatabaseAPI): StoreApi<TodoState> {
  return createStore<TodoState>((set) => ({
    todos: [],

    async addTodo(partial) {
      const result = await api.addTodo(partial)
      set((s) => ({ todos: [...s.todos, result] }))
      dispatchDataChange('todos', {
        source: 'local',
        action: 'create',
        id: result.id,
        record: result,
        table: 'todos',
      })
    },

    async updateTodo(id, updates) {
      const updated = await api.updateTodo(id, updates)
      set((s) => ({
        todos: s.todos.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      }))
      dispatchDataChange('todos', {
        source: 'local',
        action: 'update',
        id,
        record: updated,
        table: 'todos',
      })
    },

    async commitTodoNoteDraft(id) {
      const updated = await api.commitTodoNoteDraft(id)
      if (!updated) return null
      set((s) => ({ todos: s.todos.map((todo) => (todo.id === id ? updated : todo)) }))
      dispatchDataChange('todos', {
        source: 'local',
        action: 'update',
        id,
        record: updated,
        table: 'todos',
      })
      return updated
    },

    async flushPendingTodoNoteDrafts() {
      const updatedTodos = await api.flushPendingTodoNoteDrafts()
      if (updatedTodos.length === 0) return updatedTodos

      const updatedById = new Map(updatedTodos.map((todo) => [todo.id, todo]))
      set((s) => ({
        todos: s.todos.map((todo) => updatedById.get(todo.id) ?? todo),
      }))
      for (const updated of updatedTodos) {
        dispatchDataChange('todos', {
          source: 'local',
          action: 'update',
          id: updated.id,
          record: updated,
          table: 'todos',
        })
      }
      return updatedTodos
    },

    async deleteTodo(id) {
      const deleted = await api.deleteTodo(id)
      set((s) => ({ todos: s.todos.filter((t) => t.id !== id) }))
      dispatchDataChange('todos', {
        source: 'local',
        action: 'delete',
        id,
        record: deleted,
        table: 'todos',
      })
    },

    setTodos(todos) {
      set({ todos })
    },
  }))
}
