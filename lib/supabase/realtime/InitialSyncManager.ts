import type { SupabaseClient } from '@supabase/supabase-js'
import type { RealtimeSyncTable, SyncRecord } from './types'
import { SYNC_TABLES } from './types'
import type { TodoDatabase } from '@/lib/db/dexie'
import { fetchRemoteAllRecords } from '../syncOperations'
import { applySnapshot } from './revisionMerge'

export interface InitialSyncProgress {
  table: RealtimeSyncTable
  phase: 'downloading' | 'merging' | 'done'
  processed: number
  total: number
}

export type ProgressCallback = (progress: InitialSyncProgress) => void

export interface InitialSyncOptions {
  tables?: RealtimeSyncTable[]
  onProgress?: ProgressCallback
}

export interface SyncStats {
  uploaded: number
  downloaded: number
  deleted: number
  errors: Array<{ table: string; error: string }>
}

const TABLE_TIMEOUT_MS = 60_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`[InitialSync] Timeout after ${ms}ms for ${label}`)),
        ms,
      )
      promise.finally(() => clearTimeout(timer)).catch(() => undefined)
    }),
  ])
}

/** Downloads every requested table before atomically touching the live Dexie tables. */
export class InitialSyncManager {
  private aborted = false

  constructor(
    private readonly client: SupabaseClient,
    private readonly db: TodoDatabase,
  ) {}

  abort(): void {
    this.aborted = true
  }

  async performSync(options?: InitialSyncOptions): Promise<SyncStats> {
    this.aborted = false
    const tables = options?.tables ?? [...SYNC_TABLES]
    const snapshots: Record<RealtimeSyncTable, SyncRecord[]> = {
      todos: [],
      lists: [],
      goals: [],
    }

    const downloads = await Promise.all(tables.map(async (table) => {
      options?.onProgress?.({ table, phase: 'downloading', processed: 0, total: 0 })
      const records = await withTimeout(
        fetchRemoteAllRecords(this.client, table),
        TABLE_TIMEOUT_MS,
        table,
      )
      return { table, records }
    }))

    if (this.aborted) throw new Error('[InitialSync] Aborted')
    for (const { table, records } of downloads) snapshots[table] = records

    for (const { table, records } of downloads) {
      options?.onProgress?.({
        table,
        phase: 'merging',
        processed: 0,
        total: records.length,
      })
    }
    await applySnapshot(this.db, snapshots)
    if (this.aborted) throw new Error('[InitialSync] Aborted')

    for (const { table, records } of downloads) {
      options?.onProgress?.({
        table,
        phase: 'done',
        processed: records.length,
        total: records.length,
      })
    }

    return {
      uploaded: 0,
      downloaded: downloads.reduce((sum, item) => sum + item.records.length, 0),
      deleted: downloads.reduce(
        (sum, item) => sum + item.records.filter((record) => record.deleted_at != null).length,
        0,
      ),
      errors: [],
    }
  }
}

export async function performInitialSync(
  client: SupabaseClient,
  db: TodoDatabase,
  options?: InitialSyncOptions,
): Promise<void> {
  await new InitialSyncManager(client, db).performSync(options)
}
