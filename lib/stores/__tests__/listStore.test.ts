// lib/stores/__tests__/listStore.test.ts
// TDD RED: Tests for listStore Zustand store with dual-write pattern
// Run: bun test lib/stores/__tests__/listStore.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createListStore } from '../listStore'
import type { DatabaseAPI } from '@/lib/db/databaseAPI'
import { LIST_DATA_CHANGED } from '../events'
import type { List } from '@/lib/db/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeList(overrides: Partial<List> = {}): List {
  return {
    id: 'list-1',
    name: 'Test List',
    sort_order: 0,
    is_hidden: false,
    user_id: 'user-1',
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  }
}

function makeMockApi(overrides: Partial<DatabaseAPI> = {}): DatabaseAPI {
  return {
    addList: vi.fn().mockResolvedValue(makeList()),
    updateList: vi.fn().mockResolvedValue(undefined),
    deleteList: vi.fn().mockResolvedValue(undefined),
    // minimal required stubs
    getTodos: vi.fn(),
    addTodo: vi.fn(),
    updateTodo: vi.fn(),
    deleteTodo: vi.fn(),
    getLists: vi.fn(),
    getGoals: vi.fn(),
    addGoal: vi.fn(),
    updateGoal: vi.fn(),
    deleteGoal: vi.fn(),
    ...overrides,
  } as unknown as DatabaseAPI
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createListStore', () => {
  let dispatchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    dispatchSpy = vi.spyOn(window, 'dispatchEvent')
  })

  afterEach(() => {
    dispatchSpy.mockRestore()
  })

  it('initializes with empty lists', () => {
    const api = makeMockApi()
    const store = createListStore(api)
    expect(store.getState().lists).toEqual([])
  })

  describe('addList', () => {
    it('calls api.addList with the provided partial', async () => {
      const api = makeMockApi()
      const store = createListStore(api)
      await store.getState().addList({ name: 'New List' })
      expect(api.addList).toHaveBeenCalledWith({ name: 'New List' })
    })

    it('adds the returned record to state', async () => {
      const record = makeList({ id: 'list-new', name: 'New List' })
      const api = makeMockApi({ addList: vi.fn().mockResolvedValue(record) })
      const store = createListStore(api)
      await store.getState().addList({ name: 'New List' })
      expect(store.getState().lists).toContainEqual(record)
    })

    it('dispatches LIST_DATA_CHANGED with action=create', async () => {
      const record = makeList({ id: 'list-new' })
      const api = makeMockApi({ addList: vi.fn().mockResolvedValue(record) })
      const store = createListStore(api)
      await store.getState().addList({ name: 'New List' })

      expect(dispatchSpy).toHaveBeenCalledOnce()
      const event = dispatchSpy.mock.calls[0][0] as CustomEvent
      expect(event.type).toBe(LIST_DATA_CHANGED)
      expect(event.detail.source).toBe('local')
      expect(event.detail.action).toBe('create')
      expect(event.detail.id).toBe(record.id)
      expect(event.detail.record).toEqual(record)
      expect(event.detail.table).toBe('lists')
    })
  })

  describe('updateList', () => {
    it('calls api.updateList with id and updates', async () => {
      const api = makeMockApi()
      const store = createListStore(api)
      await store.getState().updateList('list-1', { name: 'Updated' })
      expect(api.updateList).toHaveBeenCalledWith('list-1', { name: 'Updated' })
    })

    it('merges updates into state', async () => {
      const existing = makeList({ id: 'list-1', name: 'Old' })
      const api = makeMockApi()
      const store = createListStore(api)
      store.setState({ lists: [existing] })
      await store.getState().updateList('list-1', { name: 'Updated' })
      expect(store.getState().lists[0].name).toBe('Updated')
    })

    it('dispatches LIST_DATA_CHANGED with action=update', async () => {
      const existing = makeList({ id: 'list-1' })
      const api = makeMockApi()
      const store = createListStore(api)
      store.setState({ lists: [existing] })
      await store.getState().updateList('list-1', { name: 'Updated' })

      expect(dispatchSpy).toHaveBeenCalledOnce()
      const event = dispatchSpy.mock.calls[0][0] as CustomEvent
      expect(event.type).toBe(LIST_DATA_CHANGED)
      expect(event.detail.source).toBe('local')
      expect(event.detail.action).toBe('update')
      expect(event.detail.id).toBe('list-1')
      expect(event.detail.table).toBe('lists')
    })
  })

  describe('deleteList', () => {
    it('calls api.deleteList with the id', async () => {
      const api = makeMockApi()
      const store = createListStore(api)
      await store.getState().deleteList('list-1')
      expect(api.deleteList).toHaveBeenCalledWith('list-1')
    })

    it('removes the list from state', async () => {
      const existing = makeList({ id: 'list-1' })
      const api = makeMockApi()
      const store = createListStore(api)
      store.setState({ lists: [existing] })
      await store.getState().deleteList('list-1')
      expect(store.getState().lists).toEqual([])
    })

    it('dispatches LIST_DATA_CHANGED with action=delete', async () => {
      const api = makeMockApi()
      const store = createListStore(api)
      await store.getState().deleteList('list-1')

      expect(dispatchSpy).toHaveBeenCalledOnce()
      const event = dispatchSpy.mock.calls[0][0] as CustomEvent
      expect(event.type).toBe(LIST_DATA_CHANGED)
      expect(event.detail.source).toBe('local')
      expect(event.detail.action).toBe('delete')
      expect(event.detail.id).toBe('list-1')
      expect(event.detail.record).toBeNull()
      expect(event.detail.table).toBe('lists')
    })
  })

  describe('setLists', () => {
    it('replaces state with provided lists', () => {
      const api = makeMockApi()
      const store = createListStore(api)
      const lists = [makeList({ id: 'a' }), makeList({ id: 'b' })]
      store.getState().setLists(lists)
      expect(store.getState().lists).toEqual(lists)
    })

    it('does NOT dispatch any event (remote sync path)', () => {
      const api = makeMockApi()
      const store = createListStore(api)
      store.getState().setLists([makeList()])
      expect(dispatchSpy).not.toHaveBeenCalled()
    })
  })
})
