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
    if (this.isInitialized) {
      console.log('[Sync] Already initialized, skipping')
      return
    }

    console.log('[Sync] Initializing...', { tables: config?.tables ?? [...SYNC_TABLES] })

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
      console.log('[Sync] Running initial sync...')
      await this.runInitialSync()
      console.log('[Sync] Initial sync complete')

      console.log('[Sync] Subscribing to channels...')
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
      console.log('[Sync] Initialization complete')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[Sync] Initialization failed:', message)
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
    if (!this.client || !this.db || !this.config) {
      console.warn('[Sync] sync() called but not initialized')
      return
    }

    if (this.state.isSyncing) {
      console.log('[Sync] Sync already in progress, skipping')
      return
    }

    console.log('[Sync] Starting manual sync...')
    this.setState({ isSyncing: true, error: null })

    try {
      if (this.offlineQueue) {
        const queueLength = this.offlineQueue.getQueueLength()
        console.log(`[Sync] Processing ${queueLength} offline operations...`)
        await this.offlineQueue.processQueue(async (op) => {
          const result = await uploadLocalChanges(this.client!, op.table, [
            op.record as SyncRecord,
          ])
          console.log(`[Sync] Offline upload ${result.success ? 'succeeded' : 'failed'} for ${op.table}`, result)
          return result.success
        })
      }

      const since = this.state.lastSyncTime ?? '1970-01-01T00:00:00Z'
      console.log(`[Sync] Fetching remote changes since ${since}`)
      for (const table of this.config.tables) {
        console.log(`[Sync] Merging remote changes for table: ${table}`)
        await this.mergeRemoteChanges(table, since)
      }

      const now = new Date().toISOString()
      setLastSyncTime(now)
      this.setState({
        lastSyncTime: now,
        pendingOperations: this.offlineQueue?.getQueueLength() ?? 0,
      })
      console.log('[Sync] Manual sync complete')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[Sync] Manual sync failed:', message)
      this.setState({ error: message })
    } finally {
      this.setState({ isSyncing: false })
    }
  }

  /** Upload a local change to Supabase immediately, or enqueue if offline */
  async uploadChange(table: RealtimeSyncTable, record: Record<string, unknown>): Promise<void> {
    if (!this.client || !this.config) {
      console.warn('[Sync] uploadChange called but not initialized')
      return
    }

    const syncRecord = record as SyncRecord
    console.log(`[Sync] uploadChange: ${table} id=${syncRecord.id}`, { online: window.navigator.onLine })

    if (typeof window !== 'undefined' && window.navigator.onLine) {
      const result = await uploadLocalChanges(this.client, table, [syncRecord])
      console.log(`[Sync] uploadChange result for ${table}:`, result)
      if (result.success) {
        this.trackSentRecord(syncRecord)
      } else {
        console.log(`[Sync] Enqueuing offline operation for ${table}`)
        this.offlineQueue?.enqueue({
          table,
          operation: 'update',
          record: syncRecord as Record<string, unknown>,
        })
      }
    } else {
      console.log(`[Sync] Offline - enqueuing operation for ${table}`)
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
    console.log(`[Sync] Subscribing to ${tables.length} channels:`, tables)

    for (const table of tables) {
      console.log(`[Sync] Subscribing to channel: db-${table}-changes`)
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
            console.log(`[Sync] Realtime event on ${table}:`, payload.eventType, payload.new ?? payload.old)
            this.handleRealtimeEvent(table, payload)
          },
        )
        .subscribe((status, err) => {
          console.log(`[Sync] Channel db-${table}-changes status: ${status}`, err ? { error: err.message } : '')
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
    console.log(`[Sync] handleChannelStatus for ${table}: ${status}`, err ? { error: err.message } : '')
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
    console.log(`[Sync] handleRealtimeEvent: ${table} ${payload.eventType}`)
    const dexieTable = this.getDexieTable(table)
    if (!dexieTable) {
      console.warn(`[Sync] No dexie table found for ${table}`)
      return
    }

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
    if (!remote?.id) {
      console.warn('[Sync] applyRemoteUpsert: no remote id')
      return
    }

    if (this.isEchoRecord(remote)) {
      console.log(`[Sync] applyRemoteUpsert: ignoring echo record ${remote.id}`)
      return
    }

    try {
      const local = await dexieTable.get(remote.id)
      const localSyncRecord: SyncRecord | null = local
        ? (local as unknown as SyncRecord)
        : null

      console.log(`[Sync] applyRemoteUpsert: ${remote.id}`, { local: !!localSyncRecord, remote })
      const winner = resolveConflict(localSyncRecord, remote)
      if (winner) {
        await dexieTable.put(winner as never)
        console.log(`[Sync] applyRemoteUpsert: stored winner ${winner.id}`)
      } else {
        console.log(`[Sync] applyRemoteUpsert: no winner for ${remote.id}`)
      }
    } catch (err) {
      console.error(`[Sync] applyRemoteUpsert failed for ${remote.id}:`, err)
    }
  }

  private async applyRemoteDelete(
    dexieTable: Table,
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): Promise<void> {
    const old = payload.old as Partial<SyncRecord> | undefined
    if (!old?.id) {
      console.warn('[Sync] applyRemoteDelete: no old id')
      return
    }

    if (old.id && old.updated_at && this.recentlySent.get(old.id) === old.updated_at) {
      console.log(`[Sync] applyRemoteDelete: ignoring echo delete for ${old.id}`)
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
        console.log(`[Sync] applyRemoteDelete: soft-deleted ${old.id}`)
      } else {
        console.log(`[Sync] applyRemoteDelete: local record ${old.id} not found`)
      }
    } catch (err) {
      console.error(`[Sync] applyRemoteDelete failed for ${old.id}:`, err)
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

    console.log(`[Sync] mergeRemoteChanges: ${table} since=${since}`)
    const changes = await downloadRemoteChanges(this.client, table, since)
    console.log(`[Sync] mergeRemoteChanges: ${table} received ${changes.length} changes`)

    let applied = 0
    for (const remote of changes) {
      if (this.isEchoRecord(remote)) {
        console.log(`[Sync] mergeRemoteChanges: skipping echo ${remote.id}`)
        continue
      }

      try {
        const local = await dexieTable.get(remote.id)
        const localSyncRecord: SyncRecord | null = local
          ? (local as unknown as SyncRecord)
          : null

        const winner = resolveConflict(localSyncRecord, remote)
        if (winner) {
          await dexieTable.put(winner as never)
          applied++
        }
      } catch (err) {
        console.error(`[Sync] mergeRemoteChanges: failed to apply ${remote.id}:`, err)
      }
    }
    console.log(`[Sync] mergeRemoteChanges: ${table} applied ${applied}/${changes.length} changes`)
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
    const prev = this.state.connectionStatus
    this.state = { ...this.state, ...partial }
    if (prev !== this.state.connectionStatus) {
      console.log(`[Sync] State change: ${prev} → ${this.state.connectionStatus}`, {
        isConnected: this.state.isConnected,
        isSyncing: this.state.isSyncing,
        pendingOperations: this.state.pendingOperations,
        error: this.state.error,
      })
    }
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
