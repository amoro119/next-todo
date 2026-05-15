import type { SupabaseClient } from '@supabase/supabase-js'
import type { TodoDatabase } from '@/lib/db/dexie'
import type { RealtimeSyncTable, SyncRecord } from '../types'
import { uploadLocalChanges } from '../../syncOperations'
import type { OfflineQueue } from '../offlineQueue'

export interface LocalChangeListenerOptions {
  db: TodoDatabase
  client: SupabaseClient
  userId: string
  offlineQueue: OfflineQueue
  tables?: RealtimeSyncTable[]
  /** Optional override for uploading a record — use to hook in echo suppression */
  onUpload?: (table: RealtimeSyncTable, record: SyncRecord) => Promise<void>
}

const DEFAULT_TABLES: RealtimeSyncTable[] = ['todos', 'lists', 'goals', 'goal_progress']

function toSyncRecord(obj: Record<string, unknown>, userId: string): SyncRecord {
  return {
    ...obj,
    id: obj['id'] as string,
    user_id: (obj['user_id'] as string) ?? userId,
    updated_at: (obj['updated_at'] as string) ?? new Date().toISOString(),
    deleted_at: (obj['deleted_at'] as string | null) ?? null,
  }
}

function fireAndForget(promise: Promise<unknown>): void {
  promise.catch(() => undefined)
}

export function startLocalChangeListener(options: LocalChangeListenerOptions): () => void {
  const { db, client, userId, offlineQueue, tables = DEFAULT_TABLES, onUpload } = options

  type DexieTable = typeof db.todos

  const cleanups: Array<() => void> = []

  for (const tableName of tables) {
    const table = db[tableName as keyof typeof db] as DexieTable | undefined
    if (!table) continue

    const creatingHook = function (
      _primKey: unknown,
      obj: Record<string, unknown>,
      _trans: unknown,
    ) {
      const record = toSyncRecord(obj, userId)
      if (window.navigator.onLine) {
        fireAndForget(onUpload ? onUpload(tableName, record) : uploadLocalChanges(client, tableName, [record]))
      } else {
        offlineQueue.enqueue({ table: tableName, operation: 'insert', record })
      }
    }

    const updatingHook = function (
      modifications: Record<string, unknown>,
      _primKey: unknown,
      obj: Record<string, unknown>,
      _trans: unknown,
    ) {
      const record = toSyncRecord({ ...obj, ...modifications }, userId)
      if (window.navigator.onLine) {
        fireAndForget(onUpload ? onUpload(tableName, record) : uploadLocalChanges(client, tableName, [record]))
      } else {
        offlineQueue.enqueue({ table: tableName, operation: 'update', record })
      }
    }

    const deletingHook = function (
      _primKey: unknown,
      obj: Record<string, unknown>,
      _trans: unknown,
    ) {
      const now = new Date().toISOString()
      const record = toSyncRecord({ ...obj, deleted_at: now, updated_at: now }, userId)
      if (window.navigator.onLine) {
        fireAndForget(onUpload ? onUpload(tableName, record) : uploadLocalChanges(client, tableName, [record]))
      } else {
        offlineQueue.enqueue({ table: tableName, operation: 'delete', record })
      }
    }

    table.hook('creating', creatingHook)
    table.hook('updating', updatingHook)
    table.hook('deleting', deletingHook)

    cleanups.push(() => {
      table.hook('creating').unsubscribe(creatingHook)
      table.hook('updating').unsubscribe(updatingHook)
      table.hook('deleting').unsubscribe(deletingHook)
    })
  }

  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}
