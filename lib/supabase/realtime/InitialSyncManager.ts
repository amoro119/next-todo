import type { SupabaseClient } from '@supabase/supabase-js'
import type { RealtimeSyncTable, SyncRecord } from './types'
import type { TodoDatabase } from '@/lib/db/dexie'
import { fetchRemoteAllRecords, upsertRecords } from '../syncOperations'
import { resolveConflict } from './conflictResolver'

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

const DEXIE_SYNC_TABLES: RealtimeSyncTable[] = ['todos', 'lists', 'goals']

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

export async function performInitialSync(
  client: SupabaseClient,
  db: TodoDatabase,
  options?: InitialSyncOptions,
): Promise<void> {
  const tables = options?.tables ?? DEXIE_SYNC_TABLES
  const onProgress = options?.onProgress

  console.log(`[InitialSync] Starting initial sync for tables:`, tables)

  for (const table of tables) {
    const dexieTable = getDexieTable(db, table)
    if (!dexieTable) {
      console.warn(`[InitialSync] Skipping table "${table}" (Dexie table not found)`)
      continue
    }

    try {
      console.log(`[InitialSync] [${table}] Phase: downloading`)
      onProgress?.({ table, phase: 'downloading', processed: 0, total: 0 })
      const remoteRecords = await fetchRemoteAllRecords(client, table)
      console.log(`[InitialSync] [${table}] Downloaded ${remoteRecords.length} remote records`)

      const localRecords = await dexieTable.toArray()
      console.log(`[InitialSync] [${table}] Found ${localRecords.length} local records`)

      const localMap = new Map<string, SyncRecord>()
      for (const record of localRecords) {
        const sr = record as unknown as SyncRecord
        localMap.set(sr.id, sr)
      }

      const remoteMap = new Map<string, SyncRecord>()
      for (const record of remoteRecords) {
        remoteMap.set(record.id, record)
      }

      onProgress?.({ table, phase: 'merging', processed: 0, total: remoteRecords.length })

      let merged = 0
      for (const remote of remoteRecords) {
        const local = localMap.get(remote.id)
        const winner = resolveConflict(local ?? null, remote)

        if (winner && winner === (remote as SyncRecord)) {
          await dexieTable.put(winner as never)
        }

        merged++
        onProgress?.({ table, phase: 'merging', processed: merged, total: remoteRecords.length })
      }
      console.log(`[InitialSync] [${table}] Merged ${merged} remote records`)

      const localOnly = localRecords.filter(
        (record) => !remoteMap.has((record as unknown as SyncRecord).id),
      )

      if (localOnly.length > 0) {
        console.log(`[InitialSync] [${table}] Uploading ${localOnly.length} local-only records`)
        onProgress?.({ table, phase: 'uploading', processed: 0, total: localOnly.length })
        const result = await upsertRecords(
          client,
          table,
          localOnly.map((r) => r as unknown as SyncRecord),
        )
        console.log(`[InitialSync] [${table}] Upload result:`, result)
        onProgress?.({ table, phase: 'done', processed: localOnly.length, total: localOnly.length })
      } else {
        onProgress?.({ table, phase: 'done', processed: 0, total: 0 })
      }
    } catch (err) {
      console.warn(`[InitialSync] Skipping table "${table}" (not found or unavailable):`, err)
    }
  }

  console.log(`[InitialSync] Initial sync complete for all tables`)
}
