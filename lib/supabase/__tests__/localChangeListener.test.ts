import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { startLocalChangeListener } from '../realtime/handlers/localChangeListener'
import {
  TODO_DATA_CHANGED,
  LIST_DATA_CHANGED,
  GOAL_DATA_CHANGED,
  dispatchDataChange,
} from '@/lib/stores/events'
import type { OfflineQueue } from '../realtime/offlineQueue'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/supabase/syncOperations', () => ({
  uploadLocalChanges: vi.fn().mockResolvedValue(undefined),
}))

// events.ts uses window.addEventListener/dispatchEvent — set up in node env
beforeAll(() => {
  const target = new EventTarget()
  const nav = { onLine: true }
  ;(globalThis as Record<string, unknown>).window = {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    navigator: nav,
  }
  Object.defineProperty(globalThis, 'navigator', { value: nav, writable: true, configurable: true })
  ;(globalThis as Record<string, unknown>).CustomEvent = CustomEvent
})

function makeOfflineQueue(): OfflineQueue {
  return {
    enqueue: vi.fn().mockResolvedValue(undefined),
    dequeue: vi.fn(),
    processQueue: vi.fn(),
    processQueueOnStart: vi.fn(),
    getQueueLength: vi.fn(),
    clearQueue: vi.fn(),
    destroy: vi.fn(),
  }
}

const mockClient = {} as SupabaseClient

const todoRecord = {
  id: 'todo-1',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  title: 'Test todo',
  user_id: 'u1',
}

const listRecord = {
  id: 'list-1',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  name: 'Test list',
  user_id: 'u1',
}

const goalRecord = {
  id: 'goal-1',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  title: 'Test goal',
  user_id: 'u1',
}

describe('startLocalChangeListener', () => {
  let onUpload: ReturnType<typeof vi.fn>
  let offlineQueue: OfflineQueue
  let cleanup: () => void

  beforeEach(() => {
    onUpload = vi.fn().mockResolvedValue(undefined)
    offlineQueue = makeOfflineQueue()
    // Default: online
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
  })


  afterEach(() => {
    cleanup?.()
  })

  it('local todo create event → onUpload called with todos and record', async () => {
    cleanup = startLocalChangeListener({ client: mockClient, offlineQueue, onUpload })

    dispatchDataChange('todos', { source: 'local', action: 'create', id: todoRecord.id, record: todoRecord as any, table: 'todos' })
    await Promise.resolve()

    expect(onUpload).toHaveBeenCalledWith('todos', todoRecord)
  })

  it('local todo update event → onUpload called', async () => {
    cleanup = startLocalChangeListener({ client: mockClient, offlineQueue, onUpload })

    dispatchDataChange('todos', { source: 'local', action: 'update', id: todoRecord.id, record: todoRecord as any, table: 'todos' })
    await Promise.resolve()

    expect(onUpload).toHaveBeenCalledWith('todos', todoRecord)
  })

  it('local todo delete event → onUpload called', async () => {
    cleanup = startLocalChangeListener({ client: mockClient, offlineQueue, onUpload })

    dispatchDataChange('todos', { source: 'local', action: 'delete', id: todoRecord.id, record: todoRecord as any, table: 'todos' })
    await Promise.resolve()

    expect(onUpload).toHaveBeenCalledWith('todos', todoRecord)
  })

  it('remote event → onUpload NOT called (ignored)', async () => {
    cleanup = startLocalChangeListener({ client: mockClient, offlineQueue, onUpload })

    dispatchDataChange('todos', { source: 'remote', action: 'update', id: todoRecord.id, record: todoRecord as any, table: 'todos' })
    await Promise.resolve()

    expect(onUpload).not.toHaveBeenCalled()
  })

  it('cleanup removes listeners — dispatch after cleanup → no call', async () => {
    const listener = startLocalChangeListener({ client: mockClient, offlineQueue, onUpload })
    listener()
    cleanup = () => {}

    dispatchDataChange('todos', { source: 'local', action: 'create', id: todoRecord.id, record: todoRecord as any, table: 'todos' })
    await Promise.resolve()

    expect(onUpload).not.toHaveBeenCalled()
  })

  it('offline: onLine=false → offlineQueue.enqueue called with insert, onUpload NOT called', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    cleanup = startLocalChangeListener({ client: mockClient, offlineQueue, onUpload })

    dispatchDataChange('todos', { source: 'local', action: 'create', id: todoRecord.id, record: todoRecord as any, table: 'todos' })
    await Promise.resolve()

    expect(onUpload).not.toHaveBeenCalled()
    expect(offlineQueue.enqueue).toHaveBeenCalledWith({ table: 'todos', operation: 'insert', record: todoRecord })
  })

  it('offline: update → enqueue with operation=update', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    cleanup = startLocalChangeListener({ client: mockClient, offlineQueue, onUpload })

    dispatchDataChange('todos', { source: 'local', action: 'update', id: todoRecord.id, record: todoRecord as any, table: 'todos' })
    await Promise.resolve()

    expect(offlineQueue.enqueue).toHaveBeenCalledWith({ table: 'todos', operation: 'update', record: todoRecord })
  })

  it('offline: delete → enqueue with operation=delete', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    cleanup = startLocalChangeListener({ client: mockClient, offlineQueue, onUpload })

    dispatchDataChange('todos', { source: 'local', action: 'delete', id: todoRecord.id, record: todoRecord as any, table: 'todos' })
    await Promise.resolve()

    expect(offlineQueue.enqueue).toHaveBeenCalledWith({ table: 'todos', operation: 'delete', record: todoRecord })
  })

  it('lists event → onUpload called with lists table', async () => {
    cleanup = startLocalChangeListener({ client: mockClient, offlineQueue, onUpload })

    dispatchDataChange('lists', { source: 'local', action: 'create', id: listRecord.id, record: listRecord as any, table: 'lists' })
    await Promise.resolve()

    expect(onUpload).toHaveBeenCalledWith('lists', listRecord)
  })

  it('goals event → onUpload called with goals table', async () => {
    cleanup = startLocalChangeListener({ client: mockClient, offlineQueue, onUpload })

    dispatchDataChange('goals', { source: 'local', action: 'update', id: goalRecord.id, record: goalRecord as any, table: 'goals' })
    await Promise.resolve()

    expect(onUpload).toHaveBeenCalledWith('goals', goalRecord)
  })
})
