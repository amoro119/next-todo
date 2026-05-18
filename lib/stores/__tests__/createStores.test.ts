// lib/stores/__tests__/createStores.test.ts
// TDD RED: Tests for createAllStores factory + StoreProvider + useStores
// Run: npx vitest run lib/stores/__tests__/createStores.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { createAllStores, StoreProvider, useStores } from '../createStores'
import type { DatabaseAPI } from '@/lib/db/databaseAPI'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMockApi(): DatabaseAPI {
  return {
    getTodos: vi.fn().mockResolvedValue([]),
    addTodo: vi.fn().mockResolvedValue({ id: 'todo-new', title: 'Test todo' }),
    updateTodo: vi.fn().mockResolvedValue(undefined),
    deleteTodo: vi.fn().mockResolvedValue(undefined),
    getLists: vi.fn().mockResolvedValue([]),
    addList: vi.fn().mockResolvedValue({ id: 'list-new', title: 'Test list' }),
    updateList: vi.fn().mockResolvedValue(undefined),
    deleteList: vi.fn().mockResolvedValue(undefined),
    getGoals: vi.fn().mockResolvedValue([]),
    addGoal: vi.fn().mockResolvedValue({ id: 'goal-new', title: 'Test goal' }),
    updateGoal: vi.fn().mockResolvedValue(undefined),
    deleteGoal: vi.fn().mockResolvedValue(undefined),
  } as unknown as DatabaseAPI
}

// ---------------------------------------------------------------------------
// createAllStores — pure factory tests
// ---------------------------------------------------------------------------

describe('createAllStores', () => {
  it('returns 3 non-null stores each with getState()', () => {
    const api = makeMockApi()
    const stores = createAllStores(api)

    expect(stores).toHaveProperty('todoStore')
    expect(stores).toHaveProperty('listStore')
    expect(stores).toHaveProperty('goalStore')

    expect(stores.todoStore).toBeTruthy()
    expect(stores.listStore).toBeTruthy()
    expect(stores.goalStore).toBeTruthy()

    // Verify each store has the expected state shape via getState()
    const todoState = stores.todoStore.getState()
    expect(todoState).toHaveProperty('todos')
    expect(typeof todoState.addTodo).toBe('function')
    expect(typeof todoState.updateTodo).toBe('function')
    expect(typeof todoState.deleteTodo).toBe('function')
    expect(typeof todoState.setTodos).toBe('function')

    const listState = stores.listStore.getState()
    expect(listState).toHaveProperty('lists')
    expect(typeof listState.addList).toBe('function')
    expect(typeof listState.updateList).toBe('function')
    expect(typeof listState.deleteList).toBe('function')
    expect(typeof listState.setLists).toBe('function')

    const goalState = stores.goalStore.getState()
    expect(goalState).toHaveProperty('goals')
    expect(typeof goalState.addGoal).toBe('function')
    expect(typeof goalState.updateGoal).toBe('function')
    expect(typeof goalState.deleteGoal).toBe('function')
    expect(typeof goalState.setGoals).toBe('function')
  })

  it('all 3 stores share the same api instance', async () => {
    const api = makeMockApi()
    const stores = createAllStores(api)

    // Calling store methods should delegate to the same api object
    await stores.todoStore.getState().addTodo({ title: 'Buy milk' })
    expect(api.addTodo).toHaveBeenCalledTimes(1)
    expect(api.addTodo).toHaveBeenCalledWith({ title: 'Buy milk' })

    await stores.listStore.getState().addList({ title: 'Work' })
    expect(api.addList).toHaveBeenCalledTimes(1)
    expect(api.addList).toHaveBeenCalledWith({ title: 'Work' })

    await stores.goalStore.getState().addGoal({ title: 'Fitness' })
    expect(api.addGoal).toHaveBeenCalledTimes(1)
    expect(api.addGoal).toHaveBeenCalledWith({ title: 'Fitness' })
  })
})

// ---------------------------------------------------------------------------
// StoreProvider / useStores — React Context tests
// ---------------------------------------------------------------------------

describe('StoreProvider / useStores', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('provides stores via useStores() inside StoreProvider', () => {
    const api = makeMockApi()

    const { result } = renderHook(() => useStores(), {
      wrapper: ({ children }: { children: React.ReactNode }) =>
        React.createElement(StoreProvider, { api }, children),
    })

    expect(result.current).toHaveProperty('todoStore')
    expect(result.current).toHaveProperty('listStore')
    expect(result.current).toHaveProperty('goalStore')

    // Verify stores are usable (have getState with expected shape)
    expect(result.current.todoStore.getState()).toHaveProperty('todos')
    expect(result.current.listStore.getState()).toHaveProperty('lists')
    expect(result.current.goalStore.getState()).toHaveProperty('goals')
  })

  it('useStores() outside StoreProvider throws an error', () => {
    // Suppress expected React error output
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      renderHook(() => useStores())
    }).toThrow('useStores must be used within a StoreProvider')

    consoleSpy.mockRestore()
  })
})
