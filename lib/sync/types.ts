// lib/sync/types.ts
/**
 * 同步队列相关的类型定义
 */

export interface DatabaseOperation {
  table: 'todos' | 'lists'
  operation: 'insert' | 'update' | 'delete'
  data: Record<string, any>
  id: string
  timestamp: string
}

export interface ChangeRecord {
  id: string
  table_name: 'todos' | 'lists'
  operation: 'insert' | 'update' | 'delete'
  record_id: string
  data: Record<string, any>
  timestamp: string
  retry_count: number
  max_retries: number
  status: 'pending' | 'syncing' | 'completed' | 'failed'
  error_message?: string
  created_at: string
  updated_at: string
}

export interface QueueStats {
  pending: number
  syncing: number
  failed: number
  completed: number
  total: number
}

export interface SyncResult {
  changeId: string
  success: boolean
  error?: string
  retryable: boolean
}

export interface SyncStatus {
  isActive: boolean
  progress: number // 0-100
  currentItem?: string
  error?: string
  lastSyncTime?: string
  queueStats?: QueueStats
  syncStage?: 'preparing' | 'processing' | 'cleaning' | 'completed' | 'failed'
  syncStartTime?: string
  processingSpeed?: number // items per second
  estimatedTimeRemaining?: number // in seconds
  totalItemsToSync?: number
  itemsProcessed?: number
  syncHistory?: SyncHistoryEntry[]
}

export interface RetryConfig {
  maxRetries: number // 最大重试次数
  baseDelay: number // 基础延迟时间（毫秒）
  maxDelay: number // 最大延迟时间（毫秒）
  backoffMultiplier: number // 退避倍数
  retryableErrors: string[] // 可重试的错误类型
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: ['NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR', 'CONNECTION_ERROR']
}

// write-server API 相关类型
export interface ListChange {
  id: string
  name?: string | null
  sort_order?: number | null
  is_hidden?: boolean | null
  modified_columns?: string[] | null
  new?: boolean | null
}

export interface TodoChange {
  id: string
  title?: string | null
  completed?: boolean | null
  deleted?: boolean | null
  sort_order?: number | null
  due_date?: string | null
  content?: string | null
  tags?: string | null
  priority?: number | null
  created_time?: string | null
  completed_time?: string | null
  start_date?: string | null
  list_id?: string | null
  // 重复任务相关字段
  repeat?: string | null
  reminder?: string | null
  is_recurring?: boolean | null
  recurring_parent_id?: string | null
  instance_number?: number | null
  next_due_date?: string | null
  modified_columns?: string[] | null
  new?: boolean | null
}

export interface SyncHistoryEntry {
  timestamp: string
  success: boolean
  itemsProcessed: number
  duration: number // in milliseconds
  error?: string
}

export interface ChangeSet {
  lists: ListChange[]
  todos: TodoChange[]
}