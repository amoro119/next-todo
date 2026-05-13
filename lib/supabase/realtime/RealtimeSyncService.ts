import type { SupabaseClient, RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import type { TodoDatabase } from '@/lib/db/dexie'
import { performInitialSync, type ProgressCallback } from './InitialSyncManager'
import { createOfflineQueue } from './offlineQueue'
import type { OfflineQueue } from './offlineQueue'
import { setLastSyncTime, resolveConflict } from './conflictResolver'
import {
  SYNC_TABLES,
  type RealtimeSyncTable,
  type RealtimeSyncState,
  type RealtimeConnectionStatus,
  type RealtimeSyncConfig,
  type SyncRecord,
  type PendingOperation,
  DEFAULT_USER_ID,
} from './types'
import { downloadRemoteChanges, uploadLocalChanges } from '../syncOperations'

import type { Table } from 'dexie'

export interface StateChangeCallback {
  (state: RealtimeSyncState): void
}

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000
const SENT_TRACK_TTL_MS = 10_000

export class RealtimeSyncService {
  private static instance: RealtimeSyncService | null = null

  static getInstance(): RealtimeSyncService {
    if (!RealtimeSyncService.instance) {
      RealtimeSyncService.instance = new RealtimeSyncService()
    }
    return RealtimeSyncService.instance
  }

  private client: SupabaseClient | null = null
  private db: TodoDatabase | null = null
  private config: RealtimeSyncConfig | null = null
  private channels = new Map<RealtimeSyncTable, RealtimeChannel>()
  private offlineQueue: OfflineQueue | null = null
  private state: RealtimeSyncState = {
    isConnected: false,
    isSyncing: false,
    lastSyncTime: null,
    error: null,
    connectionStatus: 'disconnected',
    pendingOperations: 0,
  }
  private stateListeners = new Set<StateChangeCallback>()
  private isInitialized = false
  /** Tracks recently uploaded records to prevent echo */
  private recentlySent = new Map<string, string>()
  private sentTrackerTimer: ReturnType<typeof setTimeout> | null = null

  /** Initialize the sync service: initial sync + realtime subscriptions */
  async initialize(
    client: SupabaseClient,
    db: TodoDatabase,
    config?: Partial<RealtimeSyncConfig>,
  ): Promise<void> {
    if (this.isInitialized) return

    this.client = client
    this.db = db
    this.config = {
      tables: config?.tables ?? [...SYNC_TABLES],
      retryDelay: config?.retryDelay ?? RETRY_DELAY_MS,
      maxRetries: config?.maxRetries ?? MAX_RETRIES,
    }

    this.offlineQueue = createOfflineQueue()

    this.setState({ connectionStatus: 'connecting', isSyncing: true })

    try {
      await this.runInitialSync()
      await this.subscribeToChannels()

      const now = new Date().toISOString()
      setLastSyncTime(now)
      this.setState({
        isConnected: true,
        isSyncing: false,
        connectionStatus: 'connected',
        lastSyncTime: now,
        pendingOperations: this.offlineQueue?.getQueueLength() ?? 0,
        error: null,
      })

      this.isInitialized = true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.setState({
        connectionStatus: 'error',
        isSyncing: false,
        error: message,
      })
      throw err
    }
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribeToStateChanges(callback: StateChangeCallback): () => void {
    this.stateListeners.add(callback)
    try {
      callback({ ...this.state })
    } catch {
    }
    return () => {
      this.stateListeners.delete(callback)
    }
  }

  /** Return a snapshot of the current sync state */
  getState(): RealtimeSyncState {
    return { ...this.state }
  }

  /** Manually trigger a full sync cycle */
  async sync(): Promise<void> {
    if (!this.client || !this.db || !this.config) return

    if (this.state.isSyncing) return
    this.setState({ isSyncing: true, error: null })

    try {
      if (this.offlineQueue) {
        await this.offlineQueue.processQueue(async (op) => {
          const result = await uploadLocalChanges(this.client!, op.table, [
            op.record as SyncRecord,
          ])
          return result.success
        })
      }

      const since = this.state.lastSyncTime ?? '1970-01-01T00:00:00Z'
      for (const table of this.config.tables) {
        await this.mergeRemoteChanges(table, since)
      }

      const now = new Date().toISOString()
      setLastSyncTime(now)
      this.setState({
        lastSyncTime: now,
        pendingOperations: this.offlineQueue?.getQueueLength() ?? 0,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.setState({ error: message })
    } finally {
      this.setState({ isSyncing: false })
    }
  }

  /** Upload a local change to Supabase immediately, or enqueue if offline */
  async uploadChange(table: RealtimeSyncTable, record: Record<string, unknown>): Promise<void> {
    if (!this.client || !this.config) return

    const syncRecord = record as SyncRecord

    if (typeof window !== 'undefined' && window.navigator.onLine) {
      const result = await uploadLocalChanges(this.client, table, [syncRecord])
      if (result.success) {
        this.trackSentRecord(syncRecord)
      } else {
        this.offlineQueue?.enqueue({
          table,
          operation: 'update',
          record: syncRecord as Record<string, unknown>,
        })
      }
    } else {
      this.offlineQueue?.enqueue({
        table,
        operation: 'update',
        record: syncRecord as Record<string, unknown>,
      })
    }

    this.setState({
      pendingOperations: this.offlineQueue?.getQueueLength() ?? 0,
    })
  }

  /** Disconnect all realtime channels and tear down resources */
  disconnect(): void {
    this.channels.forEach((channel) => {
      try {
        channel.unsubscribe()
      } catch {
      }
    })
    this.channels.clear()

    this.offlineQueue?.destroy()
    this.offlineQueue = null

    this.recentlySent.clear()
    if (this.sentTrackerTimer !== null) {
      clearTimeout(this.sentTrackerTimer)
      this.sentTrackerTimer = null
    }

    this.setState({
      isConnected: false,
      isSyncing: false,
      connectionStatus: 'disconnected',
    })

    this.isInitialized = false
  }

  private async runInitialSync(): Promise<void> {
    if (!this.client || !this.db || !this.config) return

    const onProgress: ProgressCallback = (progress) => {
      if (progress.phase === 'done') {
        const now = new Date().toISOString()
        setLastSyncTime(now)
        this.setState({ lastSyncTime: now })
      }
    }

    await performInitialSync(this.client, this.db, {
      tables: this.config.tables,
      onProgress,
    })
  }

  private async subscribeToChannels(): Promise<void> {
    if (!this.client || !this.config) return

    const { tables } = this.config

    for (const table of tables) {
      const channel = this.client
        .channel(`db-${table}-changes`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table,
          },
          (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            this.handleRealtimeEvent(table, payload)
          },
        )
        .subscribe((status, err) => {
          this.handleChannelStatus(table, status, err)
        })

      this.channels.set(table, channel)
    }
  }

  private handleChannelStatus(
    table: RealtimeSyncTable,
    status: string,
    err?: Error,
  ): void {
    switch (status) {
      case 'SUBSCRIBED':
        this.setState({ connectionStatus: 'connected', isConnected: true, error: null })
        break
      case 'CHANNEL_ERROR':
        this.setState({
          connectionStatus: 'error',
          error: err?.message ?? `Channel error on table ${table}`,
        })
        break
      case 'TIMED_OUT':
        this.setState({
          error: `Realtime subscription timed out for table ${table}`,
        })
        break
      case 'CLOSED':
        this.setState({ connectionStatus: 'disconnected', isConnected: false })
        break
      default:
        break
    }
  }


  private handleRealtimeEvent(
    table: RealtimeSyncTable,
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): void {
    const dexieTable = this.getDexieTable(table)
    if (!dexieTable) return

    const eventType = payload.eventType

    if (eventType === 'DELETE') {
      void this.applyRemoteDelete(dexieTable, payload)
    } else if (eventType === 'INSERT' || eventType === 'UPDATE') {
      void this.applyRemoteUpsert(dexieTable, payload)
    }
  }

  private async applyRemoteUpsert(
    dexieTable: Table,
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): Promise<void> {
    const remote = payload.new as SyncRecord | undefined
    if (!remote?.id) return

    if (this.isEchoRecord(remote)) return

    try {
      const local = await dexieTable.get(remote.id)
      const localSyncRecord: SyncRecord | null = local
        ? (local as unknown as SyncRecord)
        : null

      const winner = resolveConflict(localSyncRecord, remote)
      if (winner) {
        await dexieTable.put(winner as never)
      }
    } catch {
    }
  }

  private async applyRemoteDelete(
    dexieTable: Table,
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): Promise<void> {
    const old = payload.old as Partial<SyncRecord> | undefined
    if (!old?.id) return

    if (old.id && old.updated_at && this.recentlySent.get(old.id) === old.updated_at) {
      this.recentlySent.delete(old.id)
      return
    }

    try {
      const local = await dexieTable.get(old.id)
      if (local) {
        const now = new Date().toISOString()
        const updated = {
          ...(local as Record<string, unknown>),
          deleted_at: now,
          updated_at: now,
        }
        await dexieTable.put(updated as never)
      }
    } catch {
    }
  }

  private trackSentRecord(record: SyncRecord): void {
    if (!record.id || !record.updated_at) return
    this.recentlySent.set(record.id, record.updated_at)
    this.scheduleSentCleanup()
  }

  private isEchoRecord(record: SyncRecord): boolean {
    if (!record.id || !record.updated_at) return false
    const trackedTimestamp = this.recentlySent.get(record.id)
    if (trackedTimestamp === record.updated_at) {
      this.recentlySent.delete(record.id)
      return true
    }
    return false
  }

  private scheduleSentCleanup(): void {
    if (this.sentTrackerTimer !== null) return
    this.sentTrackerTimer = setTimeout(() => {
      this.recentlySent.clear()
      this.sentTrackerTimer = null
    }, SENT_TRACK_TTL_MS)
  }

  private async mergeRemoteChanges(table: RealtimeSyncTable, since: string): Promise<void> {
    if (!this.client || !this.config) return

    const dexieTable = this.getDexieTable(table)
    if (!dexieTable) return

    const changes = await downloadRemoteChanges(this.client, table, since)

    for (const remote of changes) {
      if (this.isEchoRecord(remote)) continue

      try {
        const local = await dexieTable.get(remote.id)
        const localSyncRecord: SyncRecord | null = local
          ? (local as unknown as SyncRecord)
          : null

        const winner = resolveConflict(localSyncRecord, remote)
        if (winner) {
          await dexieTable.put(winner as never)
        }
      } catch {
      }
    }
  }


  getDexieTable(table: RealtimeSyncTable): Table | null {
    switch (table) {
      case 'todos':
        return this.db?.todos ?? null
      case 'lists':
        return this.db?.lists ?? null
      case 'goals':
        return this.db?.goals ?? null
      case 'goal_progress':
        return this.db?.goal_progress ?? null
      default:
        return null
    }
  }

  private setState(partial: Partial<RealtimeSyncState>): void {
    this.state = { ...this.state, ...partial }
    this.notifyListeners()
  }

  private notifyListeners(): void {
    const snapshot = { ...this.state }
    this.stateListeners.forEach((cb) => {
      try {
        cb(snapshot)
      } catch {
      }
    })
  }
}
