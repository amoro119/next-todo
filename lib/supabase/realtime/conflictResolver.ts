import type { SyncRecord } from './types'

const LAST_SYNC_KEY = 'supabase_last_sync'

export interface BatchResolveResult {
  merged: SyncRecord[]
  toUpload: SyncRecord[]
  toDownload: SyncRecord[]
  toDeleteLocal: string[]
}

/**
 * Extract timestamp from a record, checking fields in priority order:
 * updatedAt → timestamp → updated_at. Returns 0 if no valid timestamp found.
 */
export function extractTimestamp(record: SyncRecord | Record<string, unknown>): number {
  const candidates = [record.updatedAt, record.timestamp, record.updated_at, record.modified]
  for (const value of candidates) {
    if (value !== undefined && value !== null) {
      const ts = new Date(value as string).getTime()
      if (!isNaN(ts) && ts > 0) {
        return ts
      }
    }
  }
  return 0
}

/**
 * LWW conflict resolution with Cloud-Authoritative tiebreaker:
 * equal timestamps → remote wins.
 */
export function resolveConflictLWW(
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

  const localTs = extractTimestamp(local)
  const remoteTs = extractTimestamp(remote)
  const winner = localTs > remoteTs ? local : remote

  console.log(
    `[Conflict] ${local.id}: localTs=${localTs} (${local.updated_at}), ` +
    `remoteTs=${remoteTs} (${remote.updated_at}) → winner=${winner === local ? 'local' : 'remote'}`,
  )
  return winner
}

export const resolveConflict = resolveConflictLWW

export function batchResolveConflicts(
  localRecords: SyncRecord[],
  remoteRecords: SyncRecord[],
  lastSyncTime: number,
): BatchResolveResult {
  const merged: SyncRecord[] = []
  const toUpload: SyncRecord[] = []
  const toDownload: SyncRecord[] = []
  const toDeleteLocal: string[] = []

  const localMap = new Map<string, SyncRecord>()
  for (const rec of localRecords) {
    localMap.set(rec.id, rec)
  }

  const remoteMap = new Map<string, SyncRecord>()
  for (const rec of remoteRecords) {
    remoteMap.set(rec.id, rec)
  }

  for (const remote of remoteRecords) {
    const local = localMap.get(remote.id)

    if (remote.deleted_at) {
      if (local && !local.deleted_at) {
        toDeleteLocal.push(remote.id)
      }
      continue
    }

    if (!local) {
      toDownload.push(remote)
      merged.push(remote)
      continue
    }

    const winner = resolveConflictLWW(local, remote)
    if (winner === remote) {
      toDownload.push(remote)
    }
    merged.push(winner!)
  }

  for (const local of localRecords) {
    if (remoteMap.has(local.id)) {
      continue
    }

    if (extractTimestamp(local) > lastSyncTime) {
      toUpload.push(local)
    } else {
      merged.push(local)
    }
  }

  return { merged, toUpload, toDownload, toDeleteLocal }
}

export function shouldAcceptRemoteChange(
  local: SyncRecord | null | undefined,
  remote: SyncRecord,
): boolean {
  if (!local) return true
  return resolveConflictLWW(local, remote) === remote
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
