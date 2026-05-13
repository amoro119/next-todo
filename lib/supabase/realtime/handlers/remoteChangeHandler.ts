import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import type { Table } from 'dexie'
import { resolveConflict } from '../conflictResolver'
import type { SyncRecord, RealtimeSyncTable } from '../types'

export interface RemoteChangeHandlerOptions {
  /** Current user ID — changes from this user are ignored (echo prevention) */
  currentUserId: string
  /** Dexie table to apply changes to */
  dexieTable: Table
}

/**
 * Handle an incoming Postgres Changes event from Supabase Realtime.
 * Applies INSERT/UPDATE/DELETE to local Dexie with LWW conflict resolution.
 */
export async function handleRemoteChange(
  _table: RealtimeSyncTable,
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  options: RemoteChangeHandlerOptions,
): Promise<void> {
  const { currentUserId, dexieTable } = options

  if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
    const remote = payload.new as SyncRecord

    if (remote.user_id === currentUserId) return

    const local = (await dexieTable.get(remote.id)) as SyncRecord | undefined
    const winner = resolveConflict(local ?? null, remote)

    if (winner) {
      await dexieTable.put(winner)
    }
  } else if (payload.eventType === 'DELETE') {
    const oldId = payload.old.id as string | undefined
    if (!oldId) return

    const local = (await dexieTable.get(oldId)) as SyncRecord | undefined
    if (local) {
      const now = new Date().toISOString()
      await dexieTable.put({ ...local, deleted_at: now, updated_at: now })
    }
  }
}
