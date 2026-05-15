import type { SupabaseClient } from '@supabase/supabase-js'
import type { RealtimeSyncTable, SyncRecord } from './types'
import type { TodoDatabase } from '@/lib/db/dexie'
import { fetchRemoteAllRecords, upsertRecords } from '../syncOperations'
import { batchResolveConflicts } from './conflictResolver'

export interface InitialSyncProgress {
  table: RealtimeSyncTable
  phase: 'downloading' | 'merging' | 'uploading' | 'done'
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

const DEXIE_SYNC_TABLES: RealtimeSyncTable[] = ['todos', 'lists', 'goals']

const TABLE_TIMEOUT_MS = 60_000

function getDexieTable(db: TodoDatabase, table: RealtimeSyncTable) {
  switch (table) {
    case 'todos':
      return db.todos
    case 'lists':
      return db.lists
    case 'goals':
      return db.goals
    default:
      return null
  }
}

/**
 * Race a promise against a timeout.
 * If the promise does not resolve within `ms`, reject with a timeout error.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[InitialSync] Timeout after ${ms}ms for ${label}`)), ms),
    ),
  ])
}

/**
 * InitialSyncManager — class-based initial sync orchestrator.
 *
 * Performs a one-shot sync of all syncable tables in parallel,
 * with per-table 60s timeout protection and an abort mechanism.
 *
 * Usage:
 * ```ts
 * const manager = new InitialSyncManager(client, db)
 * const stats = await manager.performSync({ onProgress })
 * // or call manager.abort() to stop in-flight work
 * ```
 */
export class InitialSyncManager {
  private client: SupabaseClient
  private db: TodoDatabase
  private aborted = false

  constructor(client: SupabaseClient, db: TodoDatabase) {
    this.client = client
    this.db = db
  }

  /** Signal in-flight sync work to stop at the next check-point. */
  abort(): void {
    this.aborted = true
  }

  /**
   * Run initial sync across all tables in parallel.
   *
   * @returns SyncStats with upload/download/delete counts and any per-table errors.
   */
  async performSync(options?: InitialSyncOptions): Promise<SyncStats> {
    this.aborted = false
    const tables = options?.tables ?? DEXIE_SYNC_TABLES
    const stats: SyncStats = { uploaded: 0, downloaded: 0, deleted: 0, errors: [] }

    console.log(`[InitialSync] Starting initial sync for tables:`, tables)

    const results = await Promise.allSettled(
      tables.map((table) =>
        withTimeout(
          this.syncTable(table, stats, options?.onProgress),
          TABLE_TIMEOUT_MS,
          table,
        ),
      ),
    )

    for (const result of results) {
      if (result.status === 'rejected') {
        const table = 'unknown' // table name not available from allSettled directly
        stats.errors.push({ table, error: String(result.reason) })
        console.warn(`[InitialSync] Table sync failed:`, result.reason)
      }
    }

    // Attach table name to errors where possible by re-checking per-table
    // The syncTable method catches per-table errors internally already
    // These errors from allSettled are from timeouts or truly unexpected failures

    console.log(
      `[InitialSync] Sync complete — uploaded=${stats.uploaded} downloaded=${stats.downloaded} deleted=${stats.deleted} errors=${stats.errors.length}`,
    )
    return stats
  }

  private async syncTable(
    table: RealtimeSyncTable,
    stats: SyncStats,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    if (this.aborted) return

    const dexieTable = getDexieTable(this.db, table)
    if (!dexieTable) {
      console.warn(`[InitialSync] Skipping table "${table}" (Dexie table not found)`)
      return
    }

    try {
      console.log(`[InitialSync] [${table}] Phase: downloading`)
      onProgress?.({ table, phase: 'downloading', processed: 0, total: 0 })

      // Parallel fetch: remote + local
      const [remoteRecords, localRecordsRaw] = await Promise.all([
        fetchRemoteAllRecords(this.client, table),
        dexieTable.toArray(),
      ])

      if (this.aborted) return

      const localRecords = localRecordsRaw as unknown as SyncRecord[]
      console.log(
        `[InitialSync] [${table}] Downloaded ${remoteRecords.length} remote, found ${localRecords.length} local records`,
      )

      onProgress?.({ table, phase: 'merging', processed: 0, total: remoteRecords.length })

      // First sync → treat all local records as potentially new (lastSyncTime = 0)
      const lastSyncTime = 0
      const { toUpload, toDownload, toDeleteLocal } = batchResolveConflicts(
        localRecords,
        remoteRecords,
        lastSyncTime,
      )

      if (this.aborted) return

      // Apply downloads — use bulkPut for efficiency
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tableApi = dexieTable as any

      if (toDownload.length > 0) {
        await tableApi.bulkPut(toDownload)
        stats.downloaded += toDownload.length
        console.log(`[InitialSync] [${table}] Downloaded ${toDownload.length} records`)
      }

      // Apply soft-deletes for remote-deleted records
      if (toDeleteLocal.length > 0) {
        const now = new Date().toISOString()
        const toSoftDelete = toDeleteLocal
          .map((id) => {
            const local = localRecords.find((r) => r.id === id)
            return local ? { ...local, deleted_at: now, updated_at: now } : null
          })
          .filter(Boolean)

        if (toSoftDelete.length > 0) {
          await tableApi.bulkPut(toSoftDelete)
          stats.deleted += toSoftDelete.length
          console.log(`[InitialSync] [${table}] Soft-deleted ${toSoftDelete.length} local records`)
        }
      }

      // Upload local-only records
      if (toUpload.length > 0) {
        onProgress?.({ table, phase: 'uploading', processed: 0, total: toUpload.length })
        const result = await upsertRecords(this.client, table, toUpload)
        stats.uploaded += toUpload.length
        console.log(`[InitialSync] [${table}] Uploaded ${toUpload.length} records:`, result)
      }

      onProgress?.({ table, phase: 'done', processed: remoteRecords.length, total: remoteRecords.length })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[InitialSync] [${table}] Sync failed:`, message)
      stats.errors.push({ table, error: message })
    }
  }
}

/**
 * Backward-compatible wrapper that mirrors the original `performInitialSync` signature.
 *
 * @deprecated Prefer `new InitialSyncManager(client, db).performSync(options)` for
 *             access to SyncStats and abort support.
 */
export async function performInitialSync(
  client: SupabaseClient,
  db: TodoDatabase,
  options?: InitialSyncOptions,
): Promise<void> {
  const manager = new InitialSyncManager(client, db)
  const stats = await manager.performSync(options)
  if (stats.errors.length > 0) {
    console.warn('[InitialSync] Completed with errors:', stats.errors)
  }
}
