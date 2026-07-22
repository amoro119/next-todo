// lib/supabase/realtime/types.ts
// Sync-related types and constants for Dexie + Supabase sync system

// Sync tables (must exist in Supabase)
export const SYNC_TABLES = ['todos', 'lists', 'goals'] as const
export type RealtimeSyncTable = typeof SYNC_TABLES[number]

// Default user ID for local-only / non-auth mode
export const DEFAULT_USER_ID = 'default_user'

// Connection status
export type RealtimeConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'degraded'
  | 'blocked'
  | 'error'

// Sync state
export interface RealtimeSyncState {
  isConnected: boolean
  isSyncing: boolean
  lastSyncTime: string | null
  error: string | null
  connectionStatus: RealtimeConnectionStatus
  pendingOperations: number
  blockedOperations: number
  protocolVersion: number | null
  lastSnapshotTime: string | null
  lastDrainTime: string | null
  nextRetryAt: string | null
  blockedReason: string | null
  channelStates: Partial<Record<RealtimeSyncTable, string>>
}

export type { PendingOperation } from '@/lib/db/types'

// Result of a sync operation
export interface SyncOperationResult {
  success: boolean
  error?: string
  affectedRows?: number
}

// Config for realtime sync
export interface RealtimeSyncConfig {
  tables: RealtimeSyncTable[]
  retryDelay?: number
  maxRetries?: number
}

// Generic record type for sync operations
export interface SyncRecord {
  id: string
  user_id?: string
  updated_at: string
  deleted_at: string | null
  revision?: number
  server_modified?: string | null
  [key: string]: unknown
}
