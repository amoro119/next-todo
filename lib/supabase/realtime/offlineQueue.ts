import type { TodoDatabase } from '@/lib/db/dexie'
import type { PendingOperation } from './types'

const MAX_RETRIES = 3

export interface OfflineQueue {
  enqueue(operation: Omit<PendingOperation, 'id' | 'timestamp' | 'retryCount'>): Promise<void>
  dequeue(): Promise<PendingOperation | undefined>
  processQueue(syncFn: (op: PendingOperation) => Promise<boolean>): Promise<void>
  processQueueOnStart(syncFn: (op: PendingOperation) => Promise<boolean>): Promise<void>
  getQueueLength(): Promise<number>
  clearQueue(): Promise<void>
  destroy(): void
}

export function createOfflineQueue(db: TodoDatabase): OfflineQueue {
  let isProcessing = false
  let syncFnRef: ((op: PendingOperation) => Promise<boolean>) | null = null
  let aborted = false

  const onOnline = () => {
    if (syncFnRef && !aborted) {
      processQueue(syncFnRef)
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline)
  }

  async function enqueue(operation: Omit<PendingOperation, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
    const recordId = (operation.record as Record<string, unknown>).id as string | undefined

    // Deduplication: same table + recordId → update existing, not add new
    if (recordId) {
      const existing = await db.pendingOperations
        .where('table')
        .equals(operation.table)
        .and((op) => op.record && (op.record as Record<string, unknown>).id === recordId)
        .first()

      if (existing) {
        await db.pendingOperations.put({
          ...existing,
          operation: operation.operation,
          record: operation.record,
          timestamp: new Date().toISOString(),
        })
        console.log(
          `[OfflineQueue] Deduplicated ${operation.operation} for ${operation.table} (id=${recordId})`
        )
        return
      }
    }

    const newOp: PendingOperation = {
      ...operation,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      retryCount: 0,
    }
    await db.pendingOperations.add(newOp)
    const count = await db.pendingOperations.count()
    console.log(
      `[OfflineQueue] Enqueued ${operation.operation} for ${operation.table}, queueLength=${count}`
    )
  }

  async function dequeue(): Promise<PendingOperation | undefined> {
    const oldest = await db.pendingOperations.orderBy('timestamp').first()
    if (oldest) {
      await db.pendingOperations.delete(oldest.id)
    }
    return oldest
  }

  async function processQueue(syncFn: (op: PendingOperation) => Promise<boolean>): Promise<void> {
    syncFnRef = syncFn

    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      console.log('[OfflineQueue] processQueue skipped: offline')
      return
    }
    if (isProcessing) {
      console.log('[OfflineQueue] processQueue skipped: already processing')
      return
    }

    isProcessing = true

    try {
      const ops = await db.pendingOperations.orderBy('timestamp').toArray()
      console.log(`[OfflineQueue] Processing ${ops.length} offline operations...`)

      let successCount = 0
      let failCount = 0
      let discardCount = 0

      for (const op of ops) {
        if (aborted) break

        const success = await syncFn(op)
        if (success) {
          await db.pendingOperations.delete(op.id)
          successCount++
        } else {
          if (op.retryCount + 1 >= MAX_RETRIES) {
            // Discard after max retries
            await db.pendingOperations.delete(op.id)
            console.warn(
              `[OfflineQueue] Discarding ${op.operation} for ${op.table} after ${MAX_RETRIES} retries`
            )
            discardCount++
          } else {
            await db.pendingOperations.put({
              ...op,
              retryCount: op.retryCount + 1,
            })
            failCount++
          }
        }
      }

      console.log(
        `[OfflineQueue] Processed ${ops.length} ops: ${successCount} succeeded, ${failCount} re-queued, ${discardCount} discarded`
      )
    } finally {
      isProcessing = false
    }
  }

  /** Recover and process historical queue on app start */
  async function processQueueOnStart(
    syncFn: (op: PendingOperation) => Promise<boolean>
  ): Promise<void> {
    const count = await db.pendingOperations.count()
    if (count > 0) {
      console.log(
        `[OfflineQueue] Recovering ${count} pending operations from previous session`
      )
      await processQueue(syncFn)
    }
  }

  async function getQueueLength(): Promise<number> {
    return db.pendingOperations.count()
  }

  async function clearQueue(): Promise<void> {
    await db.pendingOperations.clear()
  }

  function destroy(): void {
    aborted = true
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline)
    }
  }

  return {
    enqueue,
    dequeue,
    processQueue,
    processQueueOnStart,
    getQueueLength,
    clearQueue,
    destroy,
  }
}
