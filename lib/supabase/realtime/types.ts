// lib/supabase/realtime/types.ts
// Sync-related types and constants for Dexie + Supabase sync system

// Sync tables (must exist in Supabase)
export const SYNC_TABLES = ['todos', 'lists', 'goals'] as const
export type RealtimeSyncTable = typeof SYNC_TABLES[number]

// Default user ID for local-only / non-auth mode
export const DEFAULT_USER_ID = 'default_user'

// Connection status
export type RealtimeConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

// Sync state
export interface RealtimeSyncState {
  isConnected: boolean
  isSyncing: boolean
  lastSyncTime: string | null
  error: string | null
  connectionStatus: RealtimeConnectionStatus
  pendingOperations: number
}

// Pending operation for offline queue
export interface PendingOperation {
  id: string
  table: RealtimeSyncTable
  operation: 'insert' | 'update' | 'delete'
  record: Record<string, unknown>
  timestamp: string
  retryCount: number
}

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
  [key: string]: unknown
}
