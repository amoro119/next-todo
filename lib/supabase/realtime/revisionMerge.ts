import type { Table } from 'dexie'
import type { TodoDatabase } from '@/lib/db/dexie'
import type { PendingOperation } from '@/lib/db/types'
import type { RealtimeSyncTable, SyncRecord } from './types'

export interface MergeOutcome {
  applied: boolean
  ignoredAsStale: boolean
  rejectedFields: string[]
  record: SyncRecord
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  return JSON.stringify(a) === JSON.stringify(b)
}

function getTable(db: TodoDatabase, table: RealtimeSyncTable): Table {
  return db.table(table)
}

function hasOwn(value: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field)
}

function rejectField(
  operation: PendingOperation,
  field: string,
  rejected: Set<string>,
): void {
  if (!hasOwn(operation.patch, field)) return
  delete operation.patch[field]
  delete operation.baseValues[field]
  rejected.add(field)
}

/** Apply a server record while preserving only non-conflicting optimistic patches. */
export async function mergeRemoteRecord(
  db: TodoDatabase,
  table: RealtimeSyncTable,
  remote: SyncRecord,
): Promise<MergeOutcome> {
  const dexieTable = getTable(db, table)
  const local = await dexieTable.get(remote.id) as SyncRecord | undefined
  if (local && Number(local.revision ?? 0) > Number(remote.revision ?? 0)) {
    return {
      applied: false,
      ignoredAsStale: true,
      rejectedFields: [],
      record: local,
    }
  }

  const pending = await db.pendingOperations
    .where('[table+recordId]')
    .equals([table, remote.id])
    .sortBy('createdAt')
  const hasQuarantinedLegacyOperation = pending.some((operation) => (
    operation.status === 'blocked'
      && operation.lastError === 'legacy-operation-requires-review'
  ))

  // A protocol-v1 operation contains the intended whole local record but no
  // trustworthy base values. Keep the materialized local record unchanged
  // until that operation is reviewed; otherwise the first snapshot would
  // silently replace the unsynced edit with the server copy.
  if (local && hasQuarantinedLegacyOperation) {
    return {
      applied: false,
      ignoredAsStale: false,
      rejectedFields: [],
      record: local,
    }
  }

  const materialized: SyncRecord = table === 'todos'
    ? { ...remote, deleted: remote.deleted_at != null }
    : { ...remote }
  const rejected = new Set<string>()

  for (const original of pending) {
    const operation: PendingOperation = {
      ...original,
      patch: { ...original.patch },
      baseValues: { ...original.baseValues },
    }

    if (operation.status === 'blocked'
      && operation.lastError === 'legacy-operation-requires-review') {
      continue
    }

    if (operation.operation === 'insert') {
      // A Realtime event can arrive after the server commits our insert but before
      // its RPC response reaches this client. Only the idempotent RPC receipt can
      // distinguish that case from a true ID collision, so keep the insert pending.
      for (const [field, target] of Object.entries(operation.patch)) {
        materialized[field] = target
      }
      continue
    }

    const touchesCompletion = hasOwn(operation.patch, 'completed')
      || hasOwn(operation.patch, 'completed_time')
    if (touchesCompletion) {
      const groupMatches = hasOwn(operation.baseValues, 'completed')
        && hasOwn(operation.baseValues, 'completed_time')
        && valuesEqual(materialized.completed, operation.baseValues.completed)
        && valuesEqual(materialized.completed_time, operation.baseValues.completed_time)
      if (!groupMatches) {
        rejectField(operation, 'completed', rejected)
        rejectField(operation, 'completed_time', rejected)
      } else {
        if (hasOwn(operation.patch, 'completed')) {
          materialized.completed = operation.patch.completed
        }
        if (hasOwn(operation.patch, 'completed_time')) {
          materialized.completed_time = operation.patch.completed_time
        }
      }
    }

    for (const [field, target] of Object.entries(operation.patch)) {
      if (field === 'completed' || field === 'completed_time') continue
      if (!hasOwn(operation.baseValues, field)
        || !valuesEqual(materialized[field], operation.baseValues[field])) {
        rejectField(operation, field, rejected)
        continue
      }
      materialized[field] = target
    }

    operation.expectedRevision = Number(remote.revision ?? 0) || null
    operation.updatedAt = new Date().toISOString()
    if (Object.keys(operation.patch).length === 0) {
      await db.pendingOperations.delete(operation.operationId)
    } else {
      await db.pendingOperations.put(operation)
    }
  }

  await dexieTable.put(materialized)
  return {
    applied: true,
    ignoredAsStale: false,
    rejectedFields: [...rejected],
    record: materialized,
  }
}

export async function applySnapshot(
  db: TodoDatabase,
  snapshots: Record<RealtimeSyncTable, SyncRecord[]>,
): Promise<void> {
  await db.transaction(
    'rw',
    [db.todos, db.lists, db.goals, db.pendingOperations],
    async () => {
      for (const table of ['lists', 'goals', 'todos'] as const) {
        for (const remote of snapshots[table]) {
          await mergeRemoteRecord(db, table, remote)
        }
      }
    },
  )
}
