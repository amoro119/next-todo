// lib/supabase/realtime/index.ts
export * from './types'
export { RealtimeSyncService } from './RealtimeSyncService'
export type { StateChangeCallback } from './RealtimeSyncService'
export {
  extractTimestamp,
  resolveConflictLWW,
  resolveConflict,
  batchResolveConflicts,
  shouldAcceptRemoteChange,
  setLastSyncTime,
  getLastSyncTime,
  clearLastSyncTime,
} from './conflictResolver'
export type { BatchResolveResult } from './conflictResolver'
export { createOfflineQueue } from './offlineQueue'
export type { OfflineQueue } from './offlineQueue'
export { performInitialSync } from './InitialSyncManager'
export type { InitialSyncProgress, ProgressCallback, InitialSyncOptions } from './InitialSyncManager'
export { handleRemoteChange } from './handlers/remoteChangeHandler'
export type { RemoteChangeHandlerOptions } from './handlers/remoteChangeHandler'
export { startLocalChangeListener } from './handlers/localChangeListener'
export type { LocalChangeListenerOptions } from './handlers/localChangeListener'
