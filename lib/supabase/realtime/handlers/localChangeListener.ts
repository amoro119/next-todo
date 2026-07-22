import type { SupabaseClient } from '@supabase/supabase-js'
import type { RealtimeSyncTable, SyncRecord } from '../types'
import type { OfflineQueue } from '../offlineQueue'

export interface LocalChangeListenerOptions {
  client: SupabaseClient
  offlineQueue: OfflineQueue
  onUpload?: (table: RealtimeSyncTable, record: SyncRecord) => Promise<void>
}

/**
 * @deprecated Local writes are persisted with their outbox entry by DatabaseAPI.
 * CustomEvents are deliberately no longer an upload or durability boundary.
 */
export function startLocalChangeListener(options: LocalChangeListenerOptions): () => void {
  void options
  console.warn('[Sync] startLocalChangeListener is deprecated and intentionally inert')
  return () => undefined
}
