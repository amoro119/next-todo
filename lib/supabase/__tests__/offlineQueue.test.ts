import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createOfflineQueue } from '../realtime/offlineQueue'
import type { PendingOperation } from '../realtime/types'

const makeOp = (overrides?: Partial<Omit<PendingOperation, 'id' | 'timestamp' | 'retryCount'>>) => ({
  table: 'todos' as const,
  operation: 'insert' as const,
  record: { id: 'r1', title: 'Test' },
  ...overrides,
})

describe('offlineQueue', () => {
  describe('basic operations', () => {
    it('enqueues an operation', () => {
      const q = createOfflineQueue()
      q.enqueue(makeOp())
      expect(q.getQueueLength()).toBe(1)
      q.destroy()
    })

    it('dequeues operations in FIFO order', () => {
      const q = createOfflineQueue()
      q.enqueue(makeOp({ record: { id: '1' } }))
      q.enqueue(makeOp({ record: { id: '2' } }))
      const first = q.dequeue()
      expect(first?.record.id).toBe('1')
      const second = q.dequeue()
      expect(second?.record.id).toBe('2')
      q.destroy()
    })

    it('getQueueLength returns correct count', () => {
      const q = createOfflineQueue()
      expect(q.getQueueLength()).toBe(0)
      q.enqueue(makeOp())
      q.enqueue(makeOp())
      expect(q.getQueueLength()).toBe(2)
      q.destroy()
    })

    it('clearQueue empties the queue', () => {
      const q = createOfflineQueue()
      q.enqueue(makeOp())
      q.enqueue(makeOp())
      q.clearQueue()
      expect(q.getQueueLength()).toBe(0)
      q.destroy()
    })
  })

  describe('processQueue', () => {
    it('calls syncFn for each pending operation when online', async () => {
      const q = createOfflineQueue()
      q.enqueue(makeOp({ record: { id: '1' } }))
      q.enqueue(makeOp({ record: { id: '2' } }))

      const syncFn = vi.fn().mockResolvedValue(true)
      await q.processQueue(syncFn)

      expect(syncFn).toHaveBeenCalledTimes(2)
      q.destroy()
    })

    it('does not process when offline', async () => {
      vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)

      const q = createOfflineQueue()
      q.enqueue(makeOp())

      const syncFn = vi.fn().mockResolvedValue(true)
      await q.processQueue(syncFn)

      expect(syncFn).not.toHaveBeenCalled()
      expect(q.getQueueLength()).toBe(1)

      vi.restoreAllMocks()
      q.destroy()
    })

    it('removes processed operations from queue', async () => {
      const q = createOfflineQueue()
      q.enqueue(makeOp())
      q.enqueue(makeOp())

      const syncFn = vi.fn().mockResolvedValue(true)
      await q.processQueue(syncFn)

      expect(q.getQueueLength()).toBe(0)
      q.destroy()
    })

    it('re-enqueues on syncFn failure', async () => {
      const q = createOfflineQueue()
      q.enqueue(makeOp())

      const syncFn = vi.fn().mockResolvedValue(false)
      await q.processQueue(syncFn)

      expect(q.getQueueLength()).toBe(1)
      const op = q.dequeue()
      expect(op?.retryCount).toBe(1)
      q.destroy()
    })
  })

  describe('network events', () => {
    it('processes queue when online event fires', async () => {
      const syncFn = vi.fn().mockResolvedValue(true)
      const q = createOfflineQueue()
      q.enqueue(makeOp())

      await q.processQueue(syncFn)
      q.enqueue(makeOp())

      window.dispatchEvent(new Event('online'))

      await new Promise((r) => setTimeout(r, 0))

      expect(syncFn).toHaveBeenCalledTimes(2)
      q.destroy()
    })
  })
})
