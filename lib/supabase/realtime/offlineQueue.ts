import type { PendingOperation } from './types'

export interface OfflineQueue {
  enqueue(operation: Omit<PendingOperation, 'id' | 'timestamp' | 'retryCount'>): void
  dequeue(): PendingOperation | undefined
  processQueue(syncFn: (op: PendingOperation) => Promise<boolean>): Promise<void>
  getQueueLength(): number
  clearQueue(): void
  destroy(): void
}

export function createOfflineQueue(): OfflineQueue {
  const queue: PendingOperation[] = []
  let isProcessing = false
  let syncFnRef: ((op: PendingOperation) => Promise<boolean>) | null = null

  const onOnline = () => {
    if (syncFnRef) {
      processQueue(syncFnRef)
    }
  }

  window.addEventListener('online', onOnline)

  function enqueue(operation: Omit<PendingOperation, 'id' | 'timestamp' | 'retryCount'>): void {
    const item = {
      ...operation,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      retryCount: 0,
    }
    queue.push(item)
    console.log(`[OfflineQueue] Enqueued ${operation.operation} for ${operation.table}, queueLength=${queue.length}`)
  }

  function dequeue(): PendingOperation | undefined {
    return queue.shift()
  }

  async function processQueue(syncFn: (op: PendingOperation) => Promise<boolean>): Promise<void> {
    syncFnRef = syncFn

    if (!window.navigator.onLine) {
      console.log('[OfflineQueue] processQueue skipped: offline')
      return
    }
    if (isProcessing) {
      console.log('[OfflineQueue] processQueue skipped: already processing')
      return
    }

    isProcessing = true

    const ops = [...queue]
    queue.length = 0
    console.log(`[OfflineQueue] Processing ${ops.length} offline operations...`)

    let successCount = 0
    let failCount = 0
    for (const op of ops) {
      const success = await syncFn(op)
      if (!success) {
        queue.push({ ...op, retryCount: op.retryCount + 1 })
        failCount++
      } else {
        successCount++
      }
    }

    console.log(`[OfflineQueue] Processed ${ops.length} ops: ${successCount} succeeded, ${failCount} failed, ${queue.length} re-queued`)
    isProcessing = false
  }

  function getQueueLength(): number {
    return queue.length
  }

  function clearQueue(): void {
    queue.length = 0
  }

  function destroy(): void {
    window.removeEventListener('online', onOnline)
  }

  return { enqueue, dequeue, processQueue, getQueueLength, clearQueue, destroy }
}
