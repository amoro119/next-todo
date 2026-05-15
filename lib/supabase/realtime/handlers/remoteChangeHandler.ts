import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import type { Table } from 'dexie'
import { resolveConflictLWW, extractTimestamp } from '../conflictResolver'
import type { SyncRecord, RealtimeSyncTable } from '../types'

export interface RemoteChangeHandlerOptions {
  /** Current user ID — changes from this user are ignored (echo prevention) */
  currentUserId: string
  /** Dexie table to apply changes to */
  dexieTable: Table
}

/**
 * Apply a remote soft-delete to the local Dexie table.
 * Protects against stale deletions: if local data is newer than the remote
 * DELETE record (by timestamp comparison), the delete is ignored.
 */
async function handleRemoteDelete(
  dexieTable: Table,
  recordId: string,
  remoteRecord: SyncRecord,
): Promise<void> {
  const local = (await dexieTable.get(recordId)) as SyncRecord | undefined

  if (!local) {
    // No local record — nothing to delete
    console.log(`[RemoteChange] DELETE ${recordId}: no local record, skipping`)
    return
  }

  // Timestamp protection: old remote delete should not overwrite newer local data
  const remoteTime = extractTimestamp(remoteRecord)
  const localTime = extractTimestamp(local)

  if (remoteTime < localTime) {
    console.log(
      `[RemoteChange] DELETE ${recordId}: remote (${remoteTime}) older than local (${localTime}), ignoring`,
    )
    return
  }

  // Apply soft-delete
  const now = new Date().toISOString()
  await dexieTable.put({ ...local, deleted_at: now, updated_at: now })
  console.log(`[RemoteChange] DELETE ${recordId}: soft-deleted locally`)
}

/**
 * Handle a remote INSERT/UPDATE event.
 * Detects soft-delete UPDATEs (deleted_at != null) and delegates to handleRemoteDelete.
 * Otherwise resolves conflicts with LWW and applies the winner to Dexie.
 */
async function handleRemoteUpsert(
  dexieTable: Table,
  remoteRecord: SyncRecord,
): Promise<void> {
  // Detect soft-delete UPDATE: if remote record has deleted_at, treat as delete
  if (remoteRecord.deleted_at != null) {
    console.log(
      `[RemoteChange] UPSERT ${remoteRecord.id}: has deleted_at, treating as delete`,
    )
    await handleRemoteDelete(dexieTable, remoteRecord.id, remoteRecord)
    return
  }

  const local = (await dexieTable.get(remoteRecord.id)) as SyncRecord | undefined
  const winner = resolveConflictLWW(local ?? null, remoteRecord)

  if (winner) {
    await dexieTable.put(winner)
    console.log(
      `[RemoteChange] UPSERT ${remoteRecord.id}: winner=${winner === remoteRecord ? 'remote' : 'local'}`,
    )
  }
}

/**
 * Handle an incoming Postgres Changes event from Supabase Realtime.
 * Applies INSERT/UPDATE/DELETE to local Dexie with LWW conflict resolution.
 *
 * Note: echo prevention (user_id check) is handled by the RealtimeSyncService layer.
 * This handler focuses on data merging logic only.
 */
export async function handleRemoteChange(
  _table: RealtimeSyncTable,
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  options: RemoteChangeHandlerOptions,
): Promise<void> {
  const { dexieTable } = options

  if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
    const remote = payload.new as SyncRecord
    await handleRemoteUpsert(dexieTable, remote)
  } else if (payload.eventType === 'DELETE') {
    const oldId = payload.old.id as string | undefined
    if (!oldId) return
    const remoteRecord = payload.old as SyncRecord
    await handleRemoteDelete(dexieTable, oldId, remoteRecord)
  }
}
