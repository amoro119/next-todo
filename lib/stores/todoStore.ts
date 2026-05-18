import { createStore } from 'zustand/vanilla'
import type { StoreApi } from 'zustand/vanilla'
import { dispatchDataChange } from './events'
import type { DatabaseAPI } from '@/lib/db/databaseAPI'
import type { Todo } from '@/lib/db/types'

interface TodoState {
  todos: Todo[]
  addTodo(partial: Partial<Todo>): Promise<void>
  updateTodo(id: string, updates: Partial<Todo>): Promise<void>
  deleteTodo(id: string): Promise<void>
  setTodos(todos: Todo[]): void
}

export function createTodoStore(api: DatabaseAPI): StoreApi<TodoState> {
  return createStore<TodoState>((set, get) => ({
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
