import type { SyncRecord } from './types'

const LAST_SYNC_KEY = 'supabase_last_sync'

export function resolveConflict(
  local: SyncRecord | null | undefined,
  remote: SyncRecord | null | undefined,
): SyncRecord | null {
  if (!local) return remote ?? null
  if (!remote) return local

  if (local.updated_at > remote.updated_at) return local
  return remote
}

export function setLastSyncTime(timestamp: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LAST_SYNC_KEY, timestamp)
  }
}

export function getLastSyncTime(): string | null {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(LAST_SYNC_KEY)
  }
  return null
}

export function clearLastSyncTime(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(LAST_SYNC_KEY)
  }
}
