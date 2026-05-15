import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RealtimeSyncService } from '../realtime/RealtimeSyncService'

// Stub window for node env (no jsdom)
Object.defineProperty(globalThis, 'window', {
  value: {
    navigator: { onLine: true },
    addEventListener: () => {},
    removeEventListener: () => {},
  },
  writable: true,
  configurable: true,
})

vi.mock('../realtime/InitialSyncManager', () => ({
  InitialSyncManager: vi.fn().mockImplementation(() => ({
    performSync: vi.fn().mockResolvedValue({ uploaded: 0, downloaded: 0, deleted: 0, errors: [] }),
    abort: vi.fn(),
  })),
}))

vi.mock('../syncOperations', () => ({
  uploadLocalChanges: vi.fn().mockResolvedValue({ success: true }),
  downloadRemoteChanges: vi.fn().mockResolvedValue([]),
  fetchRemoteAllRecords: vi.fn().mockResolvedValue([]),
  upsertRecords: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../realtime/conflictResolver', () => ({
  setLastSyncTime: vi.fn(),
  resolveConflict: vi.fn((local: unknown, remote: unknown) => remote),
}))

vi.mock('../realtime/handlers/localChangeListener', () => ({
  startLocalChangeListener: vi.fn().mockReturnValue(() => {}),
}))

vi.mock('../realtime/offlineQueue', () => ({
  createOfflineQueue: vi.fn((_db: unknown) => ({
    enqueue: vi.fn(),
    dequeue: vi.fn(),
    processQueue: vi.fn().mockResolvedValue(undefined),
    processQueueOnStart: vi.fn().mockResolvedValue(undefined),
    getQueueLength: vi.fn().mockReturnValue(0),
    clearQueue: vi.fn(),
    destroy: vi.fn(),
  })),
}))

function makeChannel() {
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockImplementation((cb?: (status: string) => void) => {
      cb?.('SUBSCRIBED')
      return channel
    }),
    unsubscribe: vi.fn(),
  }
  return channel
}

function makeSupabaseClient() {
  const channel = makeChannel()
  return {
    channel: vi.fn().mockReturnValue(channel),
    _channel: channel,
  }
}

function makeDexieDb() {
  const table = {
    toArray: vi.fn().mockResolvedValue([]),
    put: vi.fn().mockResolvedValue(undefined),
  }
  return {
    todos: table,
    lists: table,
    goals: table,
    goal_progress: table,
  }
}

beforeEach(() => {
  const service = (RealtimeSyncService as unknown as { instance: RealtimeSyncService | null }).instance
  service?.disconnect?.()
  ;(RealtimeSyncService as unknown as { instance: null }).instance = null

  // Reset to online
  ;(window as unknown as { navigator: { onLine: boolean } }).navigator.onLine = true
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('RealtimeSyncService', () => {
  it('initializes with correct state — transitions to connected', async () => {
    const client = makeSupabaseClient()
    const db = makeDexieDb()

    const service = RealtimeSyncService.getInstance()
    expect(service.getState().connectionStatus).toBe('disconnected')

    await service.initialize(client as never, db as never)

    const state = service.getState()
    expect(state.connectionStatus).toBe('connected')
    expect(state.isConnected).toBe(true)
    expect(state.isSyncing).toBe(false)
    expect(state.error).toBeNull()
  })

  it('subscribes to state changes — callback fires on state change', async () => {
    const client = makeSupabaseClient()
    const db = makeDexieDb()
    const service = RealtimeSyncService.getInstance()

    const cb = vi.fn()
    service.subscribeToStateChanges(cb)

    // callback fires immediately with current state
    expect(cb).toHaveBeenCalledOnce()

    await service.initialize(client as never, db as never)

    // at minimum called again during initialization transitions
    expect(cb.mock.calls.length).toBeGreaterThan(1)
    const lastCall = cb.mock.calls.at(-1)![0]
    expect(lastCall.connectionStatus).toBe('connected')
  })

  it('unsubscribe removes listener — callback not called after', async () => {
    const client = makeSupabaseClient()
    const db = makeDexieDb()
    const service = RealtimeSyncService.getInstance()

    const cb = vi.fn()
    const unsubscribe = service.subscribeToStateChanges(cb)

    const callsBeforeUnsub = cb.mock.calls.length
    unsubscribe()

    await service.initialize(client as never, db as never)

    // no new calls after unsubscribe
    expect(cb.mock.calls.length).toBe(callsBeforeUnsub)
  })

  it('uploadChange uploads when online — calls uploadLocalChanges', async () => {
    const { uploadLocalChanges } = await import('../syncOperations')
    const client = makeSupabaseClient()
    const db = makeDexieDb()
    const service = RealtimeSyncService.getInstance()
    await service.initialize(client as never, db as never)

    ;(window as unknown as { navigator: { onLine: boolean } }).navigator.onLine = true

    await service.uploadChange('todos', { id: 'abc', updated_at: '2024-01-01T00:00:00Z' })

    expect(uploadLocalChanges).toHaveBeenCalledWith(
      client,
      'todos',
      [{ id: 'abc', updated_at: '2024-01-01T00:00:00Z' }],
    )
  })

  it('uploadChange enqueues when offline — calls offlineQueue.enqueue', async () => {
    const { uploadLocalChanges } = await import('../syncOperations')
    const { createOfflineQueue } = await import('../realtime/offlineQueue')

    const client = makeSupabaseClient()
    const db = makeDexieDb()
    const service = RealtimeSyncService.getInstance()
    await service.initialize(client as never, db as never)

    ;(window as unknown as { navigator: { onLine: boolean } }).navigator.onLine = false

    await service.uploadChange('todos', { id: 'xyz', updated_at: '2024-01-01T00:00:00Z' })

    expect(uploadLocalChanges).not.toHaveBeenCalled()

    // offlineQueue was created via createOfflineQueue — grab the mock instance
    const mockQueue = (createOfflineQueue as ReturnType<typeof vi.fn>).mock.results[0]?.value
    expect(mockQueue?.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'todos', operation: 'update' }),
    )
  })

  it('disconnect clears channels and state — state becomes disconnected', async () => {
    const client = makeSupabaseClient()
    const db = makeDexieDb()
    const service = RealtimeSyncService.getInstance()
    await service.initialize(client as never, db as never)

    expect(service.getState().connectionStatus).toBe('connected')

    service.disconnect()

    const state = service.getState()
    expect(state.connectionStatus).toBe('disconnected')
    expect(state.isConnected).toBe(false)
    expect(state.isSyncing).toBe(false)
  })

  it('initial sync runs on initialize — InitialSyncManager.performSync is called', async () => {
    const { InitialSyncManager } = await import('../realtime/InitialSyncManager')
    const client = makeSupabaseClient()
    const db = makeDexieDb()
    const service = RealtimeSyncService.getInstance()

    await service.initialize(client as never, db as never)

    expect(InitialSyncManager).toHaveBeenCalledWith(client, db)

    const instance = (InitialSyncManager as ReturnType<typeof vi.fn>).mock.results[0]?.value
    expect(instance?.performSync).toHaveBeenCalledOnce()
    expect(instance?.performSync).toHaveBeenCalledWith(
      expect.objectContaining({
        tables: expect.any(Array),
        onProgress: expect.any(Function),
      }),
    )
  })
})
