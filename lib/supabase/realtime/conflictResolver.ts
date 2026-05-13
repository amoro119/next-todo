import type { SyncRecord } from './types'

const LAST_SYNC_KEY = 'supabase_last_sync'

export function resolveConflict(
  local: SyncRecord | null | undefined,
  remote: SyncRecord | null | undefined,
): SyncRecord | null {
  if (!local) {
    console.log(`[Conflict] No local record, using remote ${remote?.id}`)
    return remote ?? null
  }
  if (!remote) {
    console.log(`[Conflict] No remote record, keeping local ${local.id}`)
    return local
  }

  const winner = local.updated_at > remote.updated_at ? local : remote
  console.log(`[Conflict] ${local.id}: local=${local.updated_at}, remote=${remote.updated_at} → winner=${winner === local ? 'local' : 'remote'}`)
  return winner
}

export function setLastSyncTime(timestamp: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LAST_SYNC_KEY, timestamp)
    console.log(`[Conflict] Last sync time updated: ${timestamp}`)
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
