import type { TodoDatabase } from '@/lib/db/dexie'
import type {
  PendingOperation,
  PendingOperationType,
} from '@/lib/db/types'

export const OUTBOX_CHANGED_EVENT = 'syncOutboxChanged'

const BASE_RETRY_DELAY_MS = 1_000
const MAX_RETRY_DELAY_MS = 5 * 60_000
const TABLE_PRIORITY: Record<PendingOperation['table'], number> = {
  lists: 0,
  goals: 1,
  todos: 2,
}

export interface QueueProcessResult {
  success: boolean
  retryable?: boolean
  error?: string
}

export interface OutboxMutationInput {
  deviceId: string
  table: PendingOperation['table']
  recordId: string
  operation: PendingOperationType
  expectedRevision: number | null
  patch: Record<string, unknown>
  baseValues: Record<string, unknown>
}

type LegacyEnqueueInput = {
  table: PendingOperation['table']
  operation: 'insert' | 'update' | 'delete'
  record: Record<string, unknown>
}

export interface OfflineQueue {
  enqueue(operation: LegacyEnqueueInput | OutboxMutationInput): Promise<void>
  dequeue(): Promise<PendingOperation | undefined>
  processQueue(
    syncFn: (op: PendingOperation) => Promise<boolean | QueueProcessResult>,
  ): Promise<void>
  processQueueOnStart(
    syncFn: (op: PendingOperation) => Promise<boolean | QueueProcessResult>,
  ): Promise<void>
  getQueueLength(): Promise<number>
  getBlockedCount(): Promise<number>
  getNextAttemptAt(): Promise<string | null>
  clearQueue(): Promise<void>
  destroy(): void
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  return JSON.stringify(a) === JSON.stringify(b)
}

function nextOperation(
  previous: PendingOperationType,
  incoming: PendingOperationType,
): PendingOperationType | null {
  if (previous === 'insert') {
    return incoming === 'delete' ? null : 'insert'
  }
  if (previous === 'delete') {
    if (incoming === 'restore') return 'restore'
    return 'delete'
  }
  if (incoming === 'delete') return 'delete'
  if (incoming === 'restore') return 'restore'
  return 'update'
}

/**
 * Merge a local mutation into the durable outbox.
 * Must be called inside the same Dexie transaction as the materialized record write.
 */
export async function enqueueOutboxMutation(
  db: TodoDatabase,
  input: OutboxMutationInput,
): Promise<void> {
  const now = new Date().toISOString()
  const existingOps = await db.pendingOperations
    .where('[table+recordId]')
    .equals([input.table, input.recordId])
    .sortBy('createdAt')
  const existing = [...existingOps]
    .reverse()
    .find((candidate) => candidate.status !== 'in_flight')

  if (!existing) {
    const operation: PendingOperation = {
      operationId: randomId(),
      deviceId: input.deviceId,
      table: input.table,
      recordId: input.recordId,
      operation: input.operation,
      expectedRevision: input.expectedRevision,
      patch: { ...input.patch },
      baseValues: { ...input.baseValues },
      generation: 1,
      status: 'pending',
      retryCount: 0,
      nextAttemptAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    }
    await db.pendingOperations.add(operation)
    return
  }

  const operation = nextOperation(existing.operation, input.operation)
  if (operation === null) {
    await db.pendingOperations.delete(existing.operationId)
    return
  }

  const patch = { ...existing.patch }
  const baseValues = { ...existing.baseValues }
  for (const [field, target] of Object.entries(input.patch)) {
    if (!Object.prototype.hasOwnProperty.call(baseValues, field)
      && Object.prototype.hasOwnProperty.call(input.baseValues, field)) {
      baseValues[field] = input.baseValues[field]
    }
    patch[field] = target

    if (operation !== 'insert'
      && Object.prototype.hasOwnProperty.call(baseValues, field)
      && valuesEqual(target, baseValues[field])) {
      delete patch[field]
      delete baseValues[field]
    }
  }

  if (operation !== 'insert' && Object.keys(patch).length === 0) {
    await db.pendingOperations.delete(existing.operationId)
    return
  }

  await db.pendingOperations.put({
    ...existing,
    operation,
    patch,
    baseValues,
    generation: existing.generation + 1,
    status: 'pending',
    retryCount: 0,
    nextAttemptAt: null,
    lastError: null,
    updatedAt: now,
  })
}

export async function getOrCreateDeviceId(db: TodoDatabase): Promise<string> {
  const existing = await db.meta.get('sync_device_id')
  if (existing?.value) return existing.value
  const id = randomId()
  const now = new Date().toISOString()
  await db.meta.put({
    key: 'sync_device_id',
    value: id,
    deleted_at: null,
    updated_at: now,
  })
  return id
}

export function notifyOutboxChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OUTBOX_CHANGED_EVENT))
  }
}

function normalizeResult(result: boolean | QueueProcessResult): QueueProcessResult {
  return typeof result === 'boolean' ? { success: result } : result
}

export function createOfflineQueue(
  db: TodoDatabase,
  onStateChange?: () => void | Promise<void>,
): OfflineQueue {
  let isProcessing = false
  let syncFnRef: ((op: PendingOperation) => Promise<boolean | QueueProcessResult>) | null = null
  let aborted = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  async function scheduleRetry(): Promise<void> {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    if (!syncFnRef || aborted) return
    const candidates = (await db.pendingOperations.toArray())
      .filter((operation) => operation.status === 'pending')
    if (candidates.length === 0) return
    const earliest = candidates.reduce((minimum, operation) => {
      const attempt = operation.nextAttemptAt
        ? new Date(operation.nextAttemptAt).getTime()
        : Date.now()
      return Math.min(minimum, attempt)
    }, Number.POSITIVE_INFINITY)
    const delay = Math.max(0, earliest - Date.now())
    retryTimer = setTimeout(() => {
      retryTimer = null
      if (syncFnRef && !aborted) void processQueue(syncFnRef)
    }, delay)
  }

  const onOnline = () => {
    if (syncFnRef && !aborted) void processQueue(syncFnRef)
  }
  const onOutboxChanged = () => {
    if (syncFnRef && !aborted) void processQueue(syncFnRef)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline)
    window.addEventListener(OUTBOX_CHANGED_EVENT, onOutboxChanged)
  }

  async function enqueue(operation: LegacyEnqueueInput | OutboxMutationInput): Promise<void> {
    if ('record' in operation) {
      const recordId = String(operation.record.id ?? '')
      if (!recordId) return
      await enqueueOutboxMutation(db, {
        deviceId: await getOrCreateDeviceId(db),
        table: operation.table,
        recordId,
        operation: operation.operation,
        expectedRevision: Number(operation.record.revision ?? 0) || null,
        patch: { ...operation.record },
        baseValues: {},
      })
    } else {
      await enqueueOutboxMutation(db, operation)
    }
    notifyOutboxChanged()
  }

  async function dequeue(): Promise<PendingOperation | undefined> {
    const oldest = await db.pendingOperations.orderBy('createdAt').first()
    if (oldest) await db.pendingOperations.delete(oldest.operationId)
    return oldest
  }

  async function processUnlocked(
    syncFn: (op: PendingOperation) => Promise<boolean | QueueProcessResult>,
  ): Promise<void> {
    if (isProcessing || aborted) return
    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      await onStateChange?.()
      return
    }
    isProcessing = true

    try {
      const now = Date.now()
      const ops = (await db.pendingOperations.toArray())
        .filter((op) => op.status !== 'blocked')
        .filter((op) => !op.nextAttemptAt || new Date(op.nextAttemptAt).getTime() <= now)
        .sort((a, b) => {
          const priority = TABLE_PRIORITY[a.table] - TABLE_PRIORITY[b.table]
          return priority || a.createdAt.localeCompare(b.createdAt)
        })

      const seenRecords = new Set<string>()
      for (const snapshot of ops) {
        if (aborted) break
        const recordKey = `${snapshot.table}:${snapshot.recordId}`
        if (seenRecords.has(recordKey)) continue
        seenRecords.add(recordKey)

        const current = await db.pendingOperations.get(snapshot.operationId)
        if (!current || current.generation !== snapshot.generation) continue
        await db.pendingOperations.put({
          ...current,
          status: 'in_flight',
          updatedAt: new Date().toISOString(),
        })

        let result: QueueProcessResult
        try {
          result = normalizeResult(await syncFn({ ...current, status: 'in_flight' }))
        } catch (error) {
          result = {
            success: false,
            retryable: true,
            error: error instanceof Error ? error.message : String(error),
          }
        }

        const latest = await db.pendingOperations.get(current.operationId)
        if (!latest || latest.generation !== current.generation) continue

        if (result.success) {
          await db.pendingOperations.delete(current.operationId)
          continue
        }

        const retryCount = latest.retryCount + 1
        const retryable = result.retryable !== false
        const delay = Math.min(
          MAX_RETRY_DELAY_MS,
          BASE_RETRY_DELAY_MS * (2 ** Math.min(retryCount, 8)),
        )
        await db.pendingOperations.put({
          ...latest,
          status: retryable ? 'pending' : 'blocked',
          retryCount,
          nextAttemptAt: retryable
            ? new Date(Date.now() + delay + Math.floor(Math.random() * 500)).toISOString()
            : null,
          lastError: result.error ?? 'sync-failed',
          updatedAt: new Date().toISOString(),
        })
      }
    } finally {
      isProcessing = false
      void scheduleRetry()
      try {
        await onStateChange?.()
      } catch (error) {
        console.error('[Sync] Failed to refresh outbox state:', error)
      }
    }
  }

  async function processQueue(
    syncFn: (op: PendingOperation) => Promise<boolean | QueueProcessResult>,
  ): Promise<void> {
    syncFnRef = syncFn
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
    if (locks) {
      await locks.request('next-todo-sync-outbox', { ifAvailable: true }, async (lock) => {
        if (lock) await processUnlocked(syncFn)
      })
      return
    }
    await processUnlocked(syncFn)
  }

  async function processQueueOnStart(
    syncFn: (op: PendingOperation) => Promise<boolean | QueueProcessResult>,
  ): Promise<void> {
    syncFnRef = syncFn
    await processQueue(syncFn)
  }

  async function getQueueLength(): Promise<number> {
    return db.pendingOperations.count()
  }

  async function getBlockedCount(): Promise<number> {
    return db.pendingOperations.where('status').equals('blocked').count()
  }

  async function getNextAttemptAt(): Promise<string | null> {
    const attempts = (await db.pendingOperations.toArray())
      .filter((operation) => operation.status === 'pending' && operation.nextAttemptAt)
      .map((operation) => operation.nextAttemptAt!)
      .sort()
    return attempts[0] ?? null
  }

  async function clearQueue(): Promise<void> {
    await db.pendingOperations.clear()
  }

  function destroy(): void {
    aborted = true
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline)
      window.removeEventListener(OUTBOX_CHANGED_EVENT, onOutboxChanged)
    }
  }

  return {
    enqueue,
    dequeue,
    processQueue,
    processQueueOnStart,
    getQueueLength,
    getBlockedCount,
    getNextAttemptAt,
    clearQueue,
    destroy,
  }
}
