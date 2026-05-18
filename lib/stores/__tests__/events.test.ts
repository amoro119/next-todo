// lib/stores/__tests__/events.test.ts
// TDD RED: Tests for CustomEvent data-change dispatch/listen utilities
// Run: bun test lib/stores/__tests__/events.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  TODO_DATA_CHANGED,
  LIST_DATA_CHANGED,
  GOAL_DATA_CHANGED,
  dispatchDataChange,
  listenDataChange,
  isRemoteSource,
} from '../events'
import type { TodoChangePayload, ListChangePayload, GoalChangePayload } from '../events'

// ---------------------------------------------------------------------------
// Helper: create a minimal valid payload of each type
// ---------------------------------------------------------------------------

function makeTodoPayload(overrides: Partial<TodoChangePayload> = {}): TodoChangePayload {
  return {
    source: 'local',
    action: 'create',
    id: 'todo-1',
    record: null,
    table: 'todos',
    ...overrides,
  }
}

function makeListPayload(overrides: Partial<ListChangePayload> = {}): ListChangePayload {
  return {
    source: 'local',
    action: 'create',
    id: 'list-1',
    record: null,
    table: 'lists',
    ...overrides,
  }
}

function makeGoalPayload(overrides: Partial<GoalChangePayload> = {}): GoalChangePayload {
  return {
    source: 'local',
    action: 'create',
    id: 'goal-1',
    record: null,
    table: 'goals',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('events', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('dispatch + listen roundtrip', () => {
    it('dispatches todoDataChanged event and handler receives correct detail', () => {
      const handler = vi.fn()
      const cleanup = listenDataChange(TODO_DATA_CHANGED, handler)

      const payload = makeTodoPayload({
        source: 'local',
        action: 'update',
        id: 'todo-abc',
        table: 'todos',
        record: { id: 'todo-abc', title: 'Test todo' } as any,
      })

      dispatchDataChange('todos', payload)

      expect(handler).toHaveBeenCalledTimes(1)

      const event = handler.mock.calls[0][0] as CustomEvent
      expect(event.type).toBe(TODO_DATA_CHANGED)
      expect(event.detail.source).toBe('local')
      expect(event.detail.action).toBe('update')
      expect(event.detail.id).toBe('todo-abc')
      expect(event.detail.table).toBe('todos')
      expect(event.detail.record).toEqual({ id: 'todo-abc', title: 'Test todo' })

      cleanup()
    })

    it('dispatches listDataChanged event and handler receives correct detail', () => {
      const handler = vi.fn()
      const cleanup = listenDataChange(LIST_DATA_CHANGED, handler)

      const payload = makeListPayload({
        source: 'remote',
        action: 'delete',
        id: 'list-xyz',
        table: 'lists',
        record: null,
      })

      dispatchDataChange('lists', payload)

      expect(handler).toHaveBeenCalledTimes(1)
      const event = handler.mock.calls[0][0] as CustomEvent
      expect(event.type).toBe(LIST_DATA_CHANGED)
      expect(event.detail.source).toBe('remote')
      expect(event.detail.action).toBe('delete')
      expect(event.detail.id).toBe('list-xyz')

      cleanup()
    })

    it('dispatches goalDataChanged event and handler receives correct detail', () => {
      const handler = vi.fn()
      const cleanup = listenDataChange(GOAL_DATA_CHANGED, handler)

      const payload = makeGoalPayload({
        source: 'local',
        action: 'create',
        id: 'goal-456',
        table: 'goals',
        record: { id: 'goal-456', name: 'My goal' } as any,
      })

      dispatchDataChange('goals', payload)

      expect(handler).toHaveBeenCalledTimes(1)
      const event = handler.mock.calls[0][0] as CustomEvent
      expect(event.type).toBe(GOAL_DATA_CHANGED)
      expect(event.detail.source).toBe('local')
      expect(event.detail.action).toBe('create')
      expect(event.detail.id).toBe('goal-456')

      cleanup()
    })

    it('triggers handler synchronously on dispatch (no microtask delay)', () => {
      const handler = vi.fn()
      const cleanup = listenDataChange(TODO_DATA_CHANGED, handler)

      const payload = makeTodoPayload()
      dispatchDataChange('todos', payload)

      // Handler must have been called already — event dispatch is sync
      expect(handler).toHaveBeenCalledTimes(1)

      cleanup()
    })
  })

  describe('isRemoteSource', () => {
    it('returns true when source is remote', () => {
      const handler = vi.fn()
      const cleanup = listenDataChange(TODO_DATA_CHANGED, handler)

      dispatchDataChange('todos', makeTodoPayload({ source: 'remote' }))

      const event = handler.mock.calls[0][0] as CustomEvent
      expect(isRemoteSource(event)).toBe(true)

      cleanup()
    })

    it('returns false when source is local', () => {
      const handler = vi.fn()
      const cleanup = listenDataChange(TODO_DATA_CHANGED, handler)

      dispatchDataChange('todos', makeTodoPayload({ source: 'local' }))

      const event = handler.mock.calls[0][0] as CustomEvent
      expect(isRemoteSource(event)).toBe(false)

      cleanup()
    })
  })

  describe('cleanup (listener removal)', () => {
    it('cleanup function removes event listener so handler is no longer called', () => {
      const handler = vi.fn()

      const cleanup = listenDataChange(TODO_DATA_CHANGED, handler)

      // Dispatch while listening → handler should be called
      dispatchDataChange('todos', makeTodoPayload())
      expect(handler).toHaveBeenCalledTimes(1)

      // Cleanup removes the listener
      cleanup()

      // Dispatch again → handler should NOT be called
      dispatchDataChange('todos', makeTodoPayload())
      expect(handler).toHaveBeenCalledTimes(1) // still 1, not 2
    })

    it('multiple calls to cleanup are idempotent', () => {
      const handler = vi.fn()

      const cleanup = listenDataChange(TODO_DATA_CHANGED, handler)
      cleanup()
      cleanup() // second call should not throw

      dispatchDataChange('todos', makeTodoPayload())
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('detail data integrity', () => {
    it('preserves all fields through dispatch→receive cycle for todos', () => {
      const handler = vi.fn()
      const cleanup = listenDataChange(TODO_DATA_CHANGED, handler)

      const now = new Date().toISOString()
      const todoRecord = {
        id: 'todo-full',
        title: 'Full test todo',
        completed: false,
        deleted: false,
        sort_order: 1,
        due_date: '2026-06-01',
        content: 'Some content',
        tags: 'test,important',
        priority: 3,
        created_time: now,
        completed_time: null,
        start_date: '2026-05-01',
        list_id: 'list-1',
        user_id: 'user-1',
        repeat: null,
        reminder: null,
        is_recurring: false,
        recurring_parent_id: null,
        instance_number: null,
        next_due_date: null,
        goal_id: null,
        sort_order_in_goal: null,
        updated_at: now,
        deleted_at: null,
      }

      const payload: TodoChangePayload = {
        source: 'remote',
        action: 'update',
        id: 'todo-full',
        record: todoRecord,
        table: 'todos',
      }

      dispatchDataChange('todos', payload)

      const event = handler.mock.calls[0][0] as CustomEvent
      expect(event.detail.source).toBe('remote')
      expect(event.detail.action).toBe('update')
      expect(event.detail.id).toBe('todo-full')
      expect(event.detail.table).toBe('todos')
      expect(event.detail.record).toEqual(todoRecord)

      cleanup()
    })

    it('preserves all fields through dispatch→receive cycle for lists', () => {
      const handler = vi.fn()
      const cleanup = listenDataChange(LIST_DATA_CHANGED, handler)

      const listRecord = {
        id: 'list-full',
        name: 'Full list',
        sort_order: 2,
        is_hidden: false,
        user_id: 'user-1',
        updated_at: '2026-05-18T00:00:00.000Z',
        deleted_at: null,
      }

      const payload: ListChangePayload = {
        source: 'local',
        action: 'create',
        id: 'list-full',
        record: listRecord,
        table: 'lists',
      }

      dispatchDataChange('lists', payload)

      const event = handler.mock.calls[0][0] as CustomEvent
      expect(event.detail.record).toEqual(listRecord)
      expect(event.detail.source).toBe('local')
      expect(event.detail.action).toBe('create')

      cleanup()
    })

    it('preserves record as null for delete actions', () => {
      const handler = vi.fn()
      const cleanup = listenDataChange(GOAL_DATA_CHANGED, handler)

      const payload: GoalChangePayload = {
        source: 'remote',
        action: 'delete',
        id: 'goal-deleted',
        record: null,
        table: 'goals',
      }

      dispatchDataChange('goals', payload)

      const event = handler.mock.calls[0][0] as CustomEvent
      expect(event.detail.record).toBeNull()
      expect(event.detail.action).toBe('delete')
      expect(event.detail.id).toBe('goal-deleted')

      cleanup()
    })
  })

  describe('unknown table name (edge case)', () => {
    it('handles manually dispatched events with unknown event names', () => {
      const handler = vi.fn()
      const cleanup = listenDataChange('unknownEvent', handler)

      // Manually dispatch to the unknown event name
      window.dispatchEvent(
        new CustomEvent('unknownEvent', {
          detail: { source: 'local' },
        })
      )

      expect(handler).toHaveBeenCalledTimes(1)

      cleanup()
    })
  })
})
