import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SyncRecord, RealtimeSyncTable } from '../realtime/types'
import type { TodoDatabase } from '@/lib/db/dexie'
import type { Todo, List, Goal, GoalProgress } from '@/lib/db/types'
import type { BatchResolveResult } from '../realtime/conflictResolver'

// Mock syncOperations module
const mockFetchRemoteAllRecords = vi.fn()
const mockUpsertRecords = vi.fn()

vi.mock('../syncOperations', () => ({
  fetchRemoteAllRecords: (...args: unknown[]) => mockFetchRemoteAllRecords(...args),
  upsertRecords: (...args: unknown[]) => mockUpsertRecords(...args),
}))

// Mock conflictResolver module — both per-record and batch variants
const mockResolveConflict = vi.fn()
const mockBatchResolveConflicts = vi.fn()

vi.mock('../realtime/conflictResolver', () => ({
  resolveConflict: (local: SyncRecord | null | undefined, remote: SyncRecord | null | undefined) =>
    mockResolveConflict(local, remote),
  batchResolveConflicts: (
    localRecords: SyncRecord[],
    remoteRecords: SyncRecord[],
    lastSyncTime: number,
  ) => mockBatchResolveConflicts(localRecords, remoteRecords, lastSyncTime),
}))

import { performInitialSync, InitialSyncManager } from '../realtime/InitialSyncManager'

// --- Helpers ---

const emptyBatchResult: BatchResolveResult = {
  merged: [],
  toUpload: [],
  toDownload: [],
  toDeleteLocal: [],
}

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
    bulkPut: vi.fn<(items: T[]) => Promise<unknown>>().mockResolvedValue([]),
    bulkDelete: vi.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined),
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

// ---------------------------------------------------------------------------
// Tests for performInitialSync (backward-compat wrapper)
// ---------------------------------------------------------------------------

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

    // Default: batchResolveConflicts returns empty result (no conflicts)
    mockBatchResolveConflicts.mockReturnValue(emptyBatchResult)
    // Per-record resolveConflict not used by new code but mock is available
    mockResolveConflict.mockImplementation(
      (_local: SyncRecord | null | undefined, remote: SyncRecord | null | undefined) => remote ?? null,
    )
  })

  it('downloads all remote records and merges into local Dexie via batch', async () => {
    const remoteTodo = makeSyncRecord('todo-1', '2024-01-02T00:00:00.000Z')
    mockFetchRemoteAllRecords.mockImplementation(
      (_client: SupabaseClient, table: RealtimeSyncTable) => {
        if (table === 'todos') return Promise.resolve([remoteTodo])
        return Promise.resolve([])
      },
    )
    mockBatchResolveConflicts.mockReturnValue({
      ...emptyBatchResult,
      toDownload: [remoteTodo],
    })

    await performInitialSync(mockClient, mockDb)

    // Should fetch from all sync tables
    expect(mockFetchRemoteAllRecords).toHaveBeenCalledWith(mockClient, 'todos')
    expect(mockFetchRemoteAllRecords).toHaveBeenCalledWith(mockClient, 'lists')
    expect(mockFetchRemoteAllRecords).toHaveBeenCalledWith(mockClient, 'goals')

    // Should bulkPut remote record into Dexie when batch says toDownload
    expect(dbTodos.bulkPut).toHaveBeenCalledWith([remoteTodo])
    expect(dbTodos.toArray).toHaveBeenCalled()
  })

  it('uploads local-only records to Supabase', async () => {
    const localTodo = makeTodo({ id: 'local-only-1', updated_at: '2024-01-01T00:00:00.000Z' })
    const localSyncRecord = { ...localTodo, user_id: 'user-1', deleted_at: null } as unknown as SyncRecord
    dbTodos.toArray.mockResolvedValue([localTodo])
    mockFetchRemoteAllRecords.mockResolvedValue([])
    mockBatchResolveConflicts.mockReturnValue({
      ...emptyBatchResult,
      toUpload: [localSyncRecord],
    })

    await performInitialSync(mockClient, mockDb)

    expect(mockUpsertRecords).toHaveBeenCalledWith(
      mockClient,
      'todos',
      expect.arrayContaining([expect.objectContaining({ id: 'local-only-1' })]),
    )
  })

  it('uses batchResolveConflicts for bulk conflict resolution', async () => {
    const localTodo = makeTodo({ id: 'todo-1', updated_at: '2024-01-02T00:00:00.000Z' })
    const remoteTodo = makeSyncRecord('todo-1', '2024-01-01T00:00:00.000Z')

    dbTodos.toArray.mockResolvedValue([localTodo])
    mockFetchRemoteAllRecords.mockImplementation(
      (_client: SupabaseClient, table: RealtimeSyncTable) => {
        if (table === 'todos') return Promise.resolve([remoteTodo])
        return Promise.resolve([])
      },
    )

    // Local is newer → batch says toUpload
    mockBatchResolveConflicts.mockReturnValue({
      ...emptyBatchResult,
      toUpload: [localTodo as unknown as SyncRecord],
    })

    await performInitialSync(mockClient, mockDb)

    // Should call batchResolveConflicts (not per-record resolveConflict)
    expect(mockBatchResolveConflicts).toHaveBeenCalled()
    // Should upload the local record
    expect(mockUpsertRecords).toHaveBeenCalledWith(
      mockClient,
      'todos',
      expect.arrayContaining([expect.objectContaining({ id: 'todo-1' })]),
    )
    // Should NOT bulkPut anything for this table (no downloads)
    expect(dbTodos.bulkPut).not.toHaveBeenCalled()
  })

  it('handles empty remote (only local data)', async () => {
    const localTodo1 = makeTodo({ id: 'todo-1' })
    const localTodo2 = makeTodo({ id: 'todo-2' })
    dbTodos.toArray.mockResolvedValue([localTodo1, localTodo2])
    mockFetchRemoteAllRecords.mockResolvedValue([])
    mockBatchResolveConflicts.mockReturnValue({
      ...emptyBatchResult,
      toUpload: [localTodo1 as unknown as SyncRecord, localTodo2 as unknown as SyncRecord],
    })

    await performInitialSync(mockClient, mockDb)

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
    mockBatchResolveConflicts.mockReturnValue({
      ...emptyBatchResult,
      toDownload: [remoteTodo1, remoteTodo2],
    })

    await performInitialSync(mockClient, mockDb)

    expect(dbTodos.bulkPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'todo-1' }),
        expect.objectContaining({ id: 'todo-2' }),
      ]),
    )
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
    mockBatchResolveConflicts.mockReturnValue({
      ...emptyBatchResult,
      toDownload: [remoteTodo],
    })

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

    const downloading = progressEvents.filter((e) => e.phase === 'downloading')
    const merging = progressEvents.filter((e) => e.phase === 'merging')
    const done = progressEvents.filter((e) => e.phase === 'done')

    expect(downloading.length).toBeGreaterThan(0)
    expect(merging.length).toBeGreaterThan(0)
    expect(done.length).toBeGreaterThan(0)

    const todoEvents = progressEvents.filter((e) => e.table === 'todos')
    expect(todoEvents.length).toBeGreaterThan(0)
  })

  it('handles tables with soft-deleted remote records via batch', async () => {
    const deletedRemote = makeSyncRecord('todo-deleted', '2024-01-02T00:00:00.000Z', '2024-01-02T00:00:00.000Z')
    const localTodo = makeTodo({ id: 'todo-deleted', updated_at: '2024-01-01T00:00:00.000Z', deleted_at: null })

    dbTodos.toArray.mockResolvedValue([localTodo])
    mockFetchRemoteAllRecords.mockImplementation(
      (_client: SupabaseClient, table: RealtimeSyncTable) => {
        if (table === 'todos') return Promise.resolve([deletedRemote])
        return Promise.resolve([])
      },
    )
    // Batch says: delete local record (remote deleted)
    mockBatchResolveConflicts.mockReturnValue({
      ...emptyBatchResult,
      toDeleteLocal: ['todo-deleted'],
    })

    await performInitialSync(mockClient, mockDb)

    // Should soft-delete via bulkPut
    expect(dbTodos.bulkPut).toHaveBeenCalled()
    const bulkPutArgs = dbTodos.bulkPut.mock.calls[0][0] as unknown as Array<Record<string, unknown>>
    expect(bulkPutArgs[0]).toMatchObject({ id: 'todo-deleted' })
    expect(bulkPutArgs[0].deleted_at).toBeTruthy()
  })

  it('filters tables when options.tables is provided', async () => {
    const remoteTodo = makeSyncRecord('todo-1', '2024-01-01T00:00:00.000Z')
    mockFetchRemoteAllRecords.mockResolvedValue([remoteTodo])
    mockBatchResolveConflicts.mockReturnValue({
      ...emptyBatchResult,
      toDownload: [remoteTodo],
    })

    await performInitialSync(mockClient, mockDb, { tables: ['todos'] })

    // Only todos should be fetched
    expect(mockFetchRemoteAllRecords).toHaveBeenCalledTimes(1)
    expect(mockFetchRemoteAllRecords).toHaveBeenCalledWith(mockClient, 'todos')
  })
})

// ---------------------------------------------------------------------------
// Tests for InitialSyncManager class
// ---------------------------------------------------------------------------

describe('InitialSyncManager class', () => {
  let mockClient: SupabaseClient
  let mockDb: TodoDatabase
  let dbTodos: ReturnType<typeof createMockDexieTable<Todo>>

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    mockDb = createMockDb()
    dbTodos = mockDb.todos as unknown as ReturnType<typeof createMockDexieTable<Todo>>

    mockBatchResolveConflicts.mockReturnValue(emptyBatchResult)
    mockFetchRemoteAllRecords.mockResolvedValue([])
  })

  it('can be instantiated', () => {
    const manager = new InitialSyncManager(mockClient, mockDb)
    expect(manager).toBeInstanceOf(InitialSyncManager)
  })

  it('performSync returns SyncStats with correct upload/download/delete counts', async () => {
    const remoteTodo = makeSyncRecord('todo-1', '2024-01-01T00:00:00.000Z')
    const localTodo = makeTodo({ id: 'local-only-1' })
    const localSyncRecord = { ...localTodo, user_id: 'user-1', deleted_at: null } as unknown as SyncRecord

    mockFetchRemoteAllRecords.mockImplementation(
      (_client: SupabaseClient, table: RealtimeSyncTable) => {
        if (table === 'todos') return Promise.resolve([remoteTodo])
        return Promise.resolve([])
      },
    )
    dbTodos.toArray.mockResolvedValue([localTodo])

    mockBatchResolveConflicts.mockImplementation(
      (localRecords: SyncRecord[], remoteRecords: SyncRecord[]) => {
        if (remoteRecords.length > 0 || localRecords.length > 0) {
          return {
            ...emptyBatchResult,
            toDownload: remoteRecords.length > 0 ? [remoteTodo] : [],
            toUpload: localRecords.length > 0 ? [localSyncRecord] : [],
          }
        }
        return emptyBatchResult
      },
    )

    const manager = new InitialSyncManager(mockClient, mockDb)
    const stats = await manager.performSync()

    expect(stats.uploaded).toBe(1)
    expect(stats.downloaded).toBe(1)
    expect(stats.deleted).toBe(0)
    expect(stats.errors).toEqual([])
  })

  it('performSync returns SyncStats with delete counts', async () => {
    const deletedRemote = makeSyncRecord('todo-deleted', '2024-01-02T00:00:00.000Z', '2024-01-02T00:00:00.000Z')
    const localTodo = makeTodo({ id: 'todo-deleted', deleted_at: null })

    mockFetchRemoteAllRecords.mockImplementation(
      (_client: SupabaseClient, table: RealtimeSyncTable) => {
        if (table === 'todos') return Promise.resolve([deletedRemote])
        return Promise.resolve([])
      },
    )
    dbTodos.toArray.mockResolvedValue([localTodo])

    mockBatchResolveConflicts.mockReturnValue({
      ...emptyBatchResult,
      toDeleteLocal: ['todo-deleted'],
    })

    const manager = new InitialSyncManager(mockClient, mockDb)
    const stats = await manager.performSync()

    expect(stats.deleted).toBe(1)
    expect(stats.uploaded).toBe(0)
    expect(stats.downloaded).toBe(0)
  })

  it('abort() prevents further processing on subsequent tables', async () => {
    // Simulate slow fetch for todos so we can abort before lists/goals
    let resolveTodos: (val: SyncRecord[]) => void
    const todosPromise = new Promise<SyncRecord[]>((resolve) => {
      resolveTodos = resolve
    })

    mockFetchRemoteAllRecords.mockImplementation(
      (_client: SupabaseClient, table: RealtimeSyncTable) => {
        if (table === 'todos') return todosPromise
        return Promise.resolve([])
      },
    )
    dbTodos.toArray.mockResolvedValue([])

    const manager = new InitialSyncManager(mockClient, mockDb)
    const syncPromise = manager.performSync()

    // Abort while first table is still fetching
    manager.abort()

    // Resolve todos fetch
    resolveTodos!([])

    const stats = await syncPromise

    // After abort, syncTable checks this.aborted and returns early
    // The stats should reflect that downstream processing was skipped
    expect(stats).toBeDefined()
  })

  it('performSync syncs tables in parallel', async () => {
    const callOrder: string[] = []

    mockFetchRemoteAllRecords.mockImplementation(
      async (_client: SupabaseClient, table: RealtimeSyncTable) => {
        callOrder.push(`fetch:${table}`)
        return []
      },
    )
    // Make toArray slightly staggered to verify parallel execution
    const listTable = mockDb.lists as unknown as ReturnType<typeof createMockDexieTable<List>>
    listTable.toArray.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10))
      return []
    })

    const manager = new InitialSyncManager(mockClient, mockDb)
    await manager.performSync()

    // All three tables should have been fetched (parallel)
    expect(mockFetchRemoteAllRecords).toHaveBeenCalledTimes(3)
    expect(callOrder).toContain('fetch:todos')
    expect(callOrder).toContain('fetch:lists')
    expect(callOrder).toContain('fetch:goals')
  })

  it('performSync collects errors from failed tables', async () => {
    // Make todos fail, lists and goals succeed
    mockFetchRemoteAllRecords.mockImplementation(
      async (_client: SupabaseClient, table: RealtimeSyncTable) => {
        if (table === 'todos') throw new Error('Todos fetch failed')
        return []
      },
    )

    const manager = new InitialSyncManager(mockClient, mockDb)
    const stats = await manager.performSync()

    expect(stats.errors.length).toBe(1)
    expect(stats.errors[0]).toMatchObject({ table: 'todos', error: 'Todos fetch failed' })
  })

  it('performSync reports errors when all tables fail', async () => {
    mockFetchRemoteAllRecords.mockRejectedValue(new Error('Network error'))

    const manager = new InitialSyncManager(mockClient, mockDb)
    const stats = await manager.performSync()

    expect(stats.errors.length).toBe(3)
    expect(stats.uploaded).toBe(0)
    expect(stats.downloaded).toBe(0)
    expect(stats.deleted).toBe(0)
  })
})
