// lib/stores/__tests__/todoStore.test.ts
// TDD RED: Tests for todoStore (Zustand) with dual-write pattern
// Run: bun test lib/stores/__tests__/todoStore.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTodoStore } from '../todoStore'
import { TODO_DATA_CHANGED } from '../events'
import type { DatabaseAPI } from '@/lib/db/databaseAPI'
import type { Todo } from '@/lib/db/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'todo-1',
    title: 'Test todo',
    completed: false,
    deleted: false,
    sort_order: 0,
    due_date: null,
    content: null,
    tags: null,
    priority: 0,
    created_time: null,
    completed_time: null,
    start_date: null,
    list_id: null,
    user_id: 'user-1',
    repeat: null,
    reminder: null,
    is_recurring: false,
    recurring_parent_id: null,
    instance_number: null,
    next_due_date: null,
    goal_id: null,
    sort_order_in_goal: null,
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  }
}

function makeMockApi(overrides: Partial<DatabaseAPI> = {}): DatabaseAPI {
  return {
    getTodos: vi.fn().mockResolvedValue([]),
    addTodo: vi.fn().mockResolvedValue(makeTodo({ id: 'todo-new' })),
    updateTodo: vi.fn().mockResolvedValue(undefined),
    deleteTodo: vi.fn().mockResolvedValue(undefined),
    getLists: vi.fn().mockResolvedValue([]),
    addList: vi.fn().mockResolvedValue({}),
    updateList: vi.fn().mockResolvedValue(undefined),
    deleteList: vi.fn().mockResolvedValue(undefined),
    getGoals: vi.fn().mockResolvedValue([]),
    addGoal: vi.fn().mockResolvedValue({}),
    updateGoal: vi.fn().mockResolvedValue(undefined),
    deleteGoal: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as DatabaseAPI
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createTodoStore', () => {
  let dispatchEventSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes with empty todos array', () => {
    const api = makeMockApi()
    const useStore = createTodoStore(api)
    const state = useStore.getState()
    expect(state.todos).toEqual([])
  })

  it('setTodos updates state without dispatching event', () => {
    const api = makeMockApi()
    const useStore = createTodoStore(api)
    const todos = [makeTodo({ id: 'a' }), makeTodo({ id: 'b' })]

    useStore.getState().setTodos(todos)

    expect(useStore.getState().todos).toEqual(todos)
    expect(dispatchEventSpy).not.toHaveBeenCalled()
  })

  describe('addTodo', () => {
    it('calls api.addTodo with given partial', async () => {
      const api = makeMockApi()
      const useStore = createTodoStore(api)

      await useStore.getState().addTodo({ title: 'New todo' })

      expect(api.addTodo).toHaveBeenCalledWith({ title: 'New todo' })
    })

    it('appends returned todo to state', async () => {
      const newTodo = makeTodo({ id: 'todo-new', title: 'New todo' })
      const api = makeMockApi({ addTodo: vi.fn().mockResolvedValue(newTodo) })
      const useStore = createTodoStore(api)

      await useStore.getState().addTodo({ title: 'New todo' })

      expect(useStore.getState().todos).toContainEqual(newTodo)
    })

    it('dispatches todoDataChanged event with create action', async () => {
      const newTodo = makeTodo({ id: 'todo-new' })
      const api = makeMockApi({ addTodo: vi.fn().mockResolvedValue(newTodo) })
      const useStore = createTodoStore(api)

      await useStore.getState().addTodo({ title: 'New todo' })

      expect(dispatchEventSpy).toHaveBeenCalledOnce()
      const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent
      expect(event.type).toBe(TODO_DATA_CHANGED)
      expect(event.detail).toMatchObject({
        source: 'local',
        action: 'create',
        id: newTodo.id,
        record: newTodo,
        table: 'todos',
      })
    })
  })

  describe('updateTodo', () => {
    it('calls api.updateTodo with id and updates', async () => {
      const api = makeMockApi()
      const useStore = createTodoStore(api)
      const existing = makeTodo({ id: 'todo-1' })
      useStore.getState().setTodos([existing])

      await useStore.getState().updateTodo('todo-1', { title: 'Updated' })

      expect(api.updateTodo).toHaveBeenCalledWith('todo-1', { title: 'Updated' })
    })

    it('merges updates into matching todo in state', async () => {
      const api = makeMockApi()
      const useStore = createTodoStore(api)
      const existing = makeTodo({ id: 'todo-1', title: 'Old' })
      useStore.getState().setTodos([existing])

      await useStore.getState().updateTodo('todo-1', { title: 'New' })

      const updated = useStore.getState().todos.find((t) => t.id === 'todo-1')
      expect(updated?.title).toBe('New')
    })

    it('dispatches todoDataChanged event with update action', async () => {
      const api = makeMockApi()
      const useStore = createTodoStore(api)
      const existing = makeTodo({ id: 'todo-1' })
      useStore.getState().setTodos([existing])

      await useStore.getState().updateTodo('todo-1', { title: 'Updated' })

      expect(dispatchEventSpy).toHaveBeenCalledOnce()
      const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent
      expect(event.type).toBe(TODO_DATA_CHANGED)
      expect(event.detail).toMatchObject({
        source: 'local',
        action: 'update',
        id: 'todo-1',
        table: 'todos',
      })
    })
  })

  describe('deleteTodo', () => {
    it('calls api.deleteTodo with id', async () => {
      const api = makeMockApi()
      const useStore = createTodoStore(api)
      const existing = makeTodo({ id: 'todo-1' })
      useStore.getState().setTodos([existing])

      await useStore.getState().deleteTodo('todo-1')

      expect(api.deleteTodo).toHaveBeenCalledWith('todo-1')
    })

    it('removes todo from state array', async () => {
      const api = makeMockApi()
      const useStore = createTodoStore(api)
      const existing = makeTodo({ id: 'todo-1' })
      useStore.getState().setTodos([existing])

      await useStore.getState().deleteTodo('todo-1')

      expect(useStore.getState().todos).not.toContainEqual(existing)
    })

    it('dispatches todoDataChanged event with delete action', async () => {
      const api = makeMockApi()
      const useStore = createTodoStore(api)
      const existing = makeTodo({ id: 'todo-1' })
      useStore.getState().setTodos([existing])

      await useStore.getState().deleteTodo('todo-1')

      expect(dispatchEventSpy).toHaveBeenCalledOnce()
      const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent
      expect(event.type).toBe(TODO_DATA_CHANGED)
      expect(event.detail).toMatchObject({
        source: 'local',
        action: 'delete',
        id: 'todo-1',
        table: 'todos',
      })
    })
  })

  it('factory creates independent stores (not singleton)', () => {
    const api1 = makeMockApi()
    const api2 = makeMockApi()
    const store1 = createTodoStore(api1)
    const store2 = createTodoStore(api2)

    store1.getState().setTodos([makeTodo({ id: 'a' })])

    expect(store1.getState().todos).toHaveLength(1)
    expect(store2.getState().todos).toHaveLength(0)
  })
})
