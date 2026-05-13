import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SyncRecord, RealtimeSyncTable } from '../realtime/types'
import type { TodoDatabase } from '@/lib/db/dexie'
import type { Todo, List, Goal, GoalProgress } from '@/lib/db/types'

// Mock syncOperations module
const mockFetchRemoteAllRecords = vi.fn()
const mockUpsertRecords = vi.fn()

vi.mock('../syncOperations', () => ({
  fetchRemoteAllRecords: (...args: unknown[]) => mockFetchRemoteAllRecords(...args),
  upsertRecords: (...args: unknown[]) => mockUpsertRecords(...args),
}))

// Mock conflictResolver module
const mockResolveConflict = vi.fn()

vi.mock('../realtime/conflictResolver', () => ({
  resolveConflict: (local: SyncRecord | null | undefined, remote: SyncRecord | null | undefined) =>
    mockResolveConflict(local, remote),
}))

import { performInitialSync } from '../realtime/InitialSyncManager'

// --- Helpers ---

const makeSyncRecord = (
  id: string,
  updated_at: string,
  deleted_at: string | null = null,
  overrides: Partial<SyncRecord> = {},
): SyncRecord => ({
  id,
  user_id: 'user-1',
  updated_at,
  deleted_at,
  title: `Record ${id}`,
  completed: false,
  ...overrides,
})

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'todo-1',
    title: 'Test Todo',
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
    updated_at: '2024-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

function makeList(overrides: Partial<List> = {}): List {
  return {
    id: 'list-1',
    name: 'Test List',
    sort_order: 0,
    is_hidden: false,
    user_id: 'user-1',
    updated_at: '2024-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

function createMockDexieTable<T>() {
  return {
    toArray: vi.fn<() => Promise<T[]>>().mockResolvedValue([]),
    put: vi.fn<(item: T) => Promise<string>>().mockResolvedValue('ok'),
  }
}

function createMockDb(): TodoDatabase {
  return {
    todos: createMockDexieTable<Todo>(),
    lists: createMockDexieTable<List>(),
    goals: createMockDexieTable<Goal>(),
    goal_progress: createMockDexieTable<GoalProgress>(),
    meta: createMockDexieTable<GoalProgress>(),
  } as unknown as TodoDatabase
}

// Mock Supabase client
function createMockSupabaseClient(): SupabaseClient {
  return {} as SupabaseClient
}

describe('performInitialSync', () => {
  let mockClient: SupabaseClient
  let mockDb: TodoDatabase
  let dbTodos: ReturnType<typeof createMockDexieTable<Todo>>
  let dbLists: ReturnType<typeof createMockDexieTable<List>>
  let dbGoals: ReturnType<typeof createMockDexieTable<Goal>>

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    mockDb = createMockDb()
    dbTodos = mockDb.todos as unknown as ReturnType<typeof createMockDexieTable<Todo>>
    dbLists = mockDb.lists as unknown as ReturnType<typeof createMockDexieTable<List>>
    dbGoals = mockDb.goals as unknown as ReturnType<typeof createMockDexieTable<Goal>>

    // Default: resolveConflict returns remote (LWW default is remote wins on tie)
    mockResolveConflict.mockImplementation(
      (_local: SyncRecord | null | undefined, remote: SyncRecord | null | undefined) => remote ?? null,
    )
  })

  it('downloads all remote records and merges into local Dexie', async () => {
    const remoteTodo = makeSyncRecord('todo-1', '2024-01-02T00:00:00.000Z')
    mockFetchRemoteAllRecords.mockImplementation(
      (_client: SupabaseClient, table: RealtimeSyncTable) => {
        if (table === 'todos') return Promise.resolve([remoteTodo])
        return Promise.resolve([])
      },
    )
    mockResolveConflict.mockReturnValue(remoteTodo)

    await performInitialSync(mockClient, mockDb)

    // Should fetch from all sync tables
    expect(mockFetchRemoteAllRecords).toHaveBeenCalledWith(mockClient, 'todos')
    expect(mockFetchRemoteAllRecords).toHaveBeenCalledWith(mockClient, 'lists')
    expect(mockFetchRemoteAllRecords).toHaveBeenCalledWith(mockClient, 'goals')

    // Should put remote record into Dexie when remote wins
    expect(dbTodos.put).toHaveBeenCalledWith(remoteTodo)
    expect(dbTodos.toArray).toHaveBeenCalled()
  })

  it('uploads local-only records to Supabase', async () => {
    const localTodo = makeTodo({ id: 'local-only-1', updated_at: '2024-01-01T00:00:00.000Z' })
    dbTodos.toArray.mockResolvedValue([localTodo])
    mockFetchRemoteAllRecords.mockResolvedValue([])

    await performInitialSync(mockClient, mockDb)

    // Should upload local-only records
    expect(mockUpsertRecords).toHaveBeenCalledWith(
      mockClient,
      'todos',
      expect.arrayContaining([expect.objectContaining({ id: 'local-only-1' })]),
    )
  })

  it('uses LWW: keeps newer record via resolveConflict', async () => {
    const localTodo = makeTodo({ id: 'todo-1', updated_at: '2024-01-02T00:00:00.000Z' })
    const remoteTodo = makeSyncRecord('todo-1', '2024-01-01T00:00:00.000Z')

    dbTodos.toArray.mockResolvedValue([localTodo])
    mockFetchRemoteAllRecords.mockImplementation(
      (_client: SupabaseClient, table: RealtimeSyncTable) => {
        if (table === 'todos') return Promise.resolve([remoteTodo])
        return Promise.resolve([])
      },
    )

    // Local has newer timestamp → resolveConflict returns local
    mockResolveConflict.mockReturnValue(localTodo as unknown as SyncRecord)

    await performInitialSync(mockClient, mockDb)

    // Should have called resolveConflict with local and remote
    expect(mockResolveConflict).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'todo-1' }),
      expect.objectContaining({ id: 'todo-1' }),
    )

    // Local won, so it should NOT be put into Dexie (already there)
    // Remote should NOT overwrite local
    expect(dbTodos.put).not.toHaveBeenCalled()
  })

  it('handles empty remote (only local data)', async () => {
    const localTodo1 = makeTodo({ id: 'todo-1' })
    const localTodo2 = makeTodo({ id: 'todo-2' })
    dbTodos.toArray.mockResolvedValue([localTodo1, localTodo2])
    mockFetchRemoteAllRecords.mockResolvedValue([])

    await performInitialSync(mockClient, mockDb)

    // All local records should be uploaded since no remote exists
    expect(mockUpsertRecords).toHaveBeenCalledWith(
      mockClient,
      'todos',
      expect.arrayContaining([
        expect.objectContaining({ id: 'todo-1' }),
        expect.objectContaining({ id: 'todo-2' }),
      ]),
    )
  })

  it('handles empty local (only remote data)', async () => {
    const remoteTodo1 = makeSyncRecord('todo-1', '2024-01-01T00:00:00.000Z')
    const remoteTodo2 = makeSyncRecord('todo-2', '2024-01-01T00:00:00.000Z')

    dbTodos.toArray.mockResolvedValue([])
    mockFetchRemoteAllRecords.mockImplementation(
      (_client: SupabaseClient, table: RealtimeSyncTable) => {
        if (table === 'todos') return Promise.resolve([remoteTodo1, remoteTodo2])
        return Promise.resolve([])
      },
    )
    mockResolveConflict.mockImplementation(
      (_local: SyncRecord | null | undefined, remote: SyncRecord | null | undefined) => remote,
    )

    await performInitialSync(mockClient, mockDb)

    // Both remote records should be put into Dexie (remote wins since no local)
    expect(dbTodos.put).toHaveBeenCalledTimes(2)
    expect(dbTodos.put).toHaveBeenCalledWith(expect.objectContaining({ id: 'todo-1' }))
    expect(dbTodos.put).toHaveBeenCalledWith(expect.objectContaining({ id: 'todo-2' }))
  })

  it('emits progress callbacks during sync', async () => {
    const remoteTodo = makeSyncRecord('todo-1', '2024-01-01T00:00:00.000Z')
    dbTodos.toArray.mockResolvedValue([])
    mockFetchRemoteAllRecords.mockImplementation(
      (_client: SupabaseClient, table: RealtimeSyncTable) => {
        if (table === 'todos') return Promise.resolve([remoteTodo])
        return Promise.resolve([])
      },
    )
    mockResolveConflict.mockReturnValue(remoteTodo)

    const progressEvents: Array<{
      table: RealtimeSyncTable
      phase: string
      processed: number
      total: number
    }> = []

    const onProgress = (progress: {
      table: RealtimeSyncTable
      phase: string
      processed: number
      total: number
    }) => {
      progressEvents.push(progress)
    }

    await performInitialSync(mockClient, mockDb, { onProgress })

    // Should have progress events
    const downloading = progressEvents.filter((e) => e.phase === 'downloading')
    const merging = progressEvents.filter((e) => e.phase === 'merging')
    const done = progressEvents.filter((e) => e.phase === 'done')

    expect(downloading.length).toBeGreaterThan(0)
    expect(merging.length).toBeGreaterThan(0)
    expect(done.length).toBeGreaterThan(0)

    // Verify table is set in events
    const todoEvents = progressEvents.filter((e) => e.table === 'todos')
    expect(todoEvents.length).toBeGreaterThan(0)
  })

  it('handles tables with soft-deleted remote records', async () => {
    const deletedRemote = makeSyncRecord('todo-deleted', '2024-01-02T00:00:00.000Z', '2024-01-02T00:00:00.000Z')
    const localTodo = makeTodo({ id: 'todo-deleted', updated_at: '2024-01-01T00:00:00.000Z', deleted_at: null })

    dbTodos.toArray.mockResolvedValue([localTodo])
    mockFetchRemoteAllRecords.mockImplementation(
      (_client: SupabaseClient, table: RealtimeSyncTable) => {
        if (table === 'todos') return Promise.resolve([deletedRemote])
        return Promise.resolve([])
      },
    )
    // Remote wins (newer timestamp) and has deleted_at
    mockResolveConflict.mockReturnValue(deletedRemote)

    await performInitialSync(mockClient, mockDb)

    // The deleted remote record should be put into Dexie (overwriting local)
    expect(dbTodos.put).toHaveBeenCalledWith(expect.objectContaining({ id: 'todo-deleted' }))
    expect(dbTodos.put).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'todo-deleted', deleted_at: '2024-01-02T00:00:00.000Z' }),
    )
  })

  it('filters tables when options.tables is provided', async () => {
    const remoteTodo = makeSyncRecord('todo-1', '2024-01-01T00:00:00.000Z')
    mockFetchRemoteAllRecords.mockResolvedValue([remoteTodo])
    mockResolveConflict.mockReturnValue(remoteTodo)

    await performInitialSync(mockClient, mockDb, { tables: ['todos'] })

    // Only todos should be fetched
    expect(mockFetchRemoteAllRecords).toHaveBeenCalledTimes(1)
    expect(mockFetchRemoteAllRecords).toHaveBeenCalledWith(mockClient, 'todos')
  })


})
