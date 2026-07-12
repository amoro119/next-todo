import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { createOfflineQueue } from '../realtime/offlineQueue'
import type { PendingOperation } from '../realtime/types'
import type { TodoDatabase } from '@/lib/db/dexie'

const makeOp = (overrides?: Partial<Omit<PendingOperation, 'id' | 'timestamp' | 'retryCount'>>) => ({
  table: 'todos' as const,
  operation: 'insert' as const,
  record: { id: 'r1', title: 'Test' },
  ...overrides,
})

function makeFullOp(overrides?: Partial<PendingOperation>): PendingOperation {
  return {
    id: crypto.randomUUID(),
    table: 'todos',
    operation: 'insert',
    record: { id: 'r1', title: 'Test' },
    timestamp: new Date().toISOString(),
    retryCount: 0,
    ...overrides,
  }
}

function createMockPendingOps() {
  return {
    add: vi.fn().mockResolvedValue('new-id'),
    put: vi.fn().mockResolvedValue('id'),
    delete: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
    orderBy: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue([]),
    first: vi.fn().mockResolvedValue(undefined),
    where: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
    and: vi.fn().mockReturnThis(),
  }
}

function createMockDb(mockOps = createMockPendingOps()) {
  return {
    pendingOperations: mockOps,
  } as unknown as TodoDatabase
}

// Mock window for node environment
let onlineCallback: (() => void) | null = null

beforeAll(() => {
  const win = {
    addEventListener: (event: string, cb: EventListenerOrEventListenerObject) => {
      if (event === 'online') onlineCallback = cb as () => void
    },
    removeEventListener: () => {
      onlineCallback = null
    },
    navigator: {
      onLine: true,
    },
  }
  ;(globalThis as Record<string, unknown>).window = win
})

afterEach(() => {
  onlineCallback = null
})

describe('offlineQueue', () => {
  let mockOps: ReturnType<typeof createMockPendingOps>
  let db: TodoDatabase

  beforeEach(() => {
    mockOps = createMockPendingOps()
    db = createMockDb(mockOps)
    vi.restoreAllMocks()
  })

  describe('basic operations', () => {
    it('enqueues an operation', async () => {
      const q = createOfflineQueue(db)
      mockOps.count.mockResolvedValue(1)
      await q.enqueue(makeOp())
      expect(mockOps.add).toHaveBeenCalledTimes(1)
      await expect(q.getQueueLength()).resolves.toBe(1)
      q.destroy()
    })

    it('dequeues operations in FIFO order', async () => {
      const q = createOfflineQueue(db)
      const ops = [
        makeFullOp({ id: '1', record: { id: 'a' } }),
        makeFullOp({ id: '2', record: { id: 'b' } }),
      ]

      mockOps.first
        .mockResolvedValueOnce(ops[0])
        .mockResolvedValueOnce(ops[1])
        .mockResolvedValue(undefined)

      const first = await q.dequeue()
      expect(first?.id).toBe('1')
      expect(mockOps.delete).toHaveBeenCalledWith('1')

      const second = await q.dequeue()
      expect(second?.id).toBe('2')
      expect(mockOps.delete).toHaveBeenCalledWith('2')

      q.destroy()
    })

    it('getQueueLength returns count from Dexie', async () => {
      const q = createOfflineQueue(db)
      mockOps.count.mockResolvedValue(5)
      await expect(q.getQueueLength()).resolves.toBe(5)
      q.destroy()
    })

    it('clearQueue empties the queue', async () => {
      const q = createOfflineQueue(db)
      await q.clearQueue()
      expect(mockOps.clear).toHaveBeenCalledTimes(1)
      q.destroy()
    })
  })

  describe('processQueue', () => {
    it('calls syncFn for each pending operation when online', async () => {
      mockOps.toArray.mockResolvedValue([
        makeFullOp({ id: '1' }),
        makeFullOp({ id: '2' }),
      ])

      const q = createOfflineQueue(db)
      const syncFn = vi.fn().mockResolvedValue(true)
      await q.processQueue(syncFn)

      expect(syncFn).toHaveBeenCalledTimes(2)
      expect(mockOps.delete).toHaveBeenCalledTimes(2)
      q.destroy()
    })

    it('does not process when offline', async () => {
      // Set navigator.onLine to false
      ;(globalThis.window as Record<string, unknown>).navigator = { onLine: false }

      const q = createOfflineQueue(db)
      const syncFn = vi.fn().mockResolvedValue(true)
      await q.processQueue(syncFn)

      expect(syncFn).not.toHaveBeenCalled()
      expect(mockOps.orderBy).not.toHaveBeenCalled()

      // Restore navigator
      ;(globalThis.window as Record<string, unknown>).navigator = { onLine: true }
      q.destroy()
    })

    it('removes processed operations from queue', async () => {
      mockOps.toArray.mockResolvedValue([makeFullOp({ id: '1' })])

      const q = createOfflineQueue(db)
      const syncFn = vi.fn().mockResolvedValue(true)
      await q.processQueue(syncFn)

      expect(mockOps.delete).toHaveBeenCalledWith('1')
      q.destroy()
    })

    it('re-enqueues on syncFn failure (increments retryCount)', async () => {
      const op = makeFullOp({ id: '1', retryCount: 0 })
      mockOps.toArray.mockResolvedValue([op])

      const q = createOfflineQueue(db)
      const syncFn = vi.fn().mockResolvedValue(false)
      await q.processQueue(syncFn)

      expect(mockOps.put).toHaveBeenCalledWith({ ...op, retryCount: 1 })
      expect(mockOps.delete).not.toHaveBeenCalled()
      q.destroy()
    })

    it('discards operations after maxRetries (3)', async () => {
      const op = makeFullOp({ id: 'discard-me', retryCount: 2 })
      mockOps.toArray.mockResolvedValue([op])

      const q = createOfflineQueue(db)
      const syncFn = vi.fn().mockResolvedValue(false)
      await q.processQueue(syncFn)

      // retryCount would be 3 (>= MAX_RETRIES), so delete instead of put
      expect(mockOps.delete).toHaveBeenCalledWith('discard-me')
      expect(mockOps.put).not.toHaveBeenCalled()
      q.destroy()
    })
  })

  describe('deduplication', () => {
    it('deduplicates: same table+recordId updates existing instead of adding', async () => {
      const q = createOfflineQueue(db)

      const existingOp = makeFullOp({
        id: 'existing-id',
        operation: 'insert',
        record: { id: 'r1', title: 'Old' },
      })

      // First enqueue: no existing -> add
      mockOps.first.mockResolvedValueOnce(undefined)
      await q.enqueue(makeOp({ record: { id: 'r1' } }))
      expect(mockOps.add).toHaveBeenCalledTimes(1)
      expect(mockOps.put).not.toHaveBeenCalled()

      // Second enqueue: same table+recordId -> existing found -> update
      mockOps.first.mockResolvedValueOnce(existingOp)
      await q.enqueue(makeOp({
        operation: 'update',
        record: { id: 'r1', title: 'Updated' },
      }))
      expect(mockOps.put).toHaveBeenCalledTimes(1)
      // add should still be 1 (not called again)
      expect(mockOps.add).toHaveBeenCalledTimes(1)

      q.destroy()
    })

    it('does not deduplicate when record has no id', async () => {
      const q = createOfflineQueue(db)

      mockOps.first.mockResolvedValue(undefined)
      await q.enqueue(makeOp({ record: {} }))
      await q.enqueue(makeOp({ record: {} }))

      // Both should be adds since no record.id for dedup
      expect(mockOps.add).toHaveBeenCalledTimes(2)
      expect(mockOps.where).not.toHaveBeenCalled()

      q.destroy()
    })
  })

  describe('processQueueOnStart', () => {
    it('processes historical queue when count > 0', async () => {
      mockOps.count.mockResolvedValue(3)
      mockOps.toArray.mockResolvedValue([
        makeFullOp({ id: 'h1' }),
        makeFullOp({ id: 'h2' }),
        makeFullOp({ id: 'h3' }),
      ])

      const q = createOfflineQueue(db)
      const syncFn = vi.fn().mockResolvedValue(true)
      await q.processQueueOnStart(syncFn)

      expect(syncFn).toHaveBeenCalledTimes(3)
      q.destroy()
    })

    it('skips processing when count is 0', async () => {
      mockOps.count.mockResolvedValue(0)

      const q = createOfflineQueue(db)
      const syncFn = vi.fn().mockResolvedValue(true)
      await q.processQueueOnStart(syncFn)

      expect(syncFn).not.toHaveBeenCalled()
      expect(mockOps.orderBy).not.toHaveBeenCalled()
      q.destroy()
    })
  })

  describe('network events', () => {
    it('processes queue when online event fires', async () => {
      mockOps.toArray.mockResolvedValue([makeFullOp({ id: 'ev1' })])

      const syncFn = vi.fn().mockResolvedValue(true)
      const q = createOfflineQueue(db)

      // First, seed the syncFnRef by calling processQueue once
      await q.processQueue(syncFn)
      expect(syncFn).toHaveBeenCalledTimes(1)

      // Reset toArray for the second call triggered by online event
      mockOps.toArray.mockResolvedValue([makeFullOp({ id: 'ev2' })])

      // Simulate online event by calling the captured callback
      expect(onlineCallback).not.toBeNull()
      onlineCallback!()

      // Wait for async processQueue to complete
      await new Promise((r) => setTimeout(r, 10))

      expect(syncFn).toHaveBeenCalledTimes(2)
      q.destroy()
    })
  })
})
