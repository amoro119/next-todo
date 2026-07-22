import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from '@supabase/supabase-js'
import type { Table } from 'dexie'
import type { TodoDatabase } from '@/lib/db/dexie'
import type { PendingOperation } from '@/lib/db/types'
import { InitialSyncManager, type ProgressCallback } from './InitialSyncManager'
import { createOfflineQueue, type OfflineQueue, type QueueProcessResult } from './offlineQueue'
import {
  SYNC_TABLES,
  type RealtimeSyncTable,
  type RealtimeSyncState,
  type RealtimeSyncConfig,
} from './types'
import {
  applyPendingOperation,
  fetchSyncCapabilities,
  fromSupabaseRow,
  SyncRpcError,
} from '../syncOperations'
import { mergeRemoteRecord } from './revisionMerge'

export interface StateChangeCallback {
  (state: RealtimeSyncState): void
}

const CHANNEL_TIMEOUT_MS = 15_000

function isRetryableSyncError(error: unknown): boolean {
  if (error instanceof SyncRpcError) {
    const code = error.code ?? ''
    if (/^(22|23|42)/.test(code) || code === 'P0001' || code.startsWith('PGRST')) {
      return false
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  return !/protocol|capabilities|invalid|allowlist|forbidden|does not exist|requires|protected fields|violates/i.test(message)
}

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
  private initialSyncManager: InitialSyncManager | null = null
  private stateListeners = new Set<StateChangeCallback>()
  private recordPipelines = new Map<string, Promise<void>>()
  private recoveryPromise: Promise<void> | null = null
  private isInitialized = false
  private destroyed = false

  private state: RealtimeSyncState = {
    isConnected: false,
    isSyncing: false,
    lastSyncTime: null,
    error: null,
    connectionStatus: 'disconnected',
    pendingOperations: 0,
    blockedOperations: 0,
    protocolVersion: null,
    lastSnapshotTime: null,
    lastDrainTime: null,
    nextRetryAt: null,
    blockedReason: null,
    channelStates: {},
  }

  private readonly onVisibilityChange = () => {
    if (document.visibilityState === 'visible') void this.recover('visibility')
  }

  async initialize(
    client: SupabaseClient,
    db: TodoDatabase,
    config?: Partial<RealtimeSyncConfig>,
  ): Promise<void> {
    if (this.isInitialized) return
    this.isInitialized = true
    this.destroyed = false
    this.client = client
    this.db = db
    this.config = {
      tables: config?.tables ?? [...SYNC_TABLES],
      retryDelay: config?.retryDelay ?? 1_000,
      maxRetries: config?.maxRetries,
    }
    this.offlineQueue = createOfflineQueue(db, () => this.refreshQueueState())
    this.initialSyncManager = new InitialSyncManager(client, db)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange)
    }

    this.setState({
      connectionStatus: 'connecting',
      isSyncing: true,
      error: null,
      blockedReason: null,
    })

    try {
      const capabilities = await fetchSyncCapabilities(client)
      this.setState({ protocolVersion: capabilities.protocol_version })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setState({
        connectionStatus: 'blocked',
        isConnected: false,
        isSyncing: false,
        error: message,
        blockedReason: 'upgrade-required',
        pendingOperations: await this.offlineQueue.getQueueLength(),
        blockedOperations: await this.offlineQueue.getBlockedCount(),
      })
      return
    }

    try {
      await this.subscribeToChannels()
      await this.runSnapshot()
      await this.offlineQueue.processQueueOnStart((operation) => this.uploadPending(operation))
      const now = new Date().toISOString()
      const pendingOperations = await this.offlineQueue.getQueueLength()
      const blockedOperations = await this.offlineQueue.getBlockedCount()
      const healthy = pendingOperations === 0 && blockedOperations === 0
      this.setState({
        isConnected: healthy,
        isSyncing: false,
        connectionStatus: blockedOperations > 0
          ? 'blocked'
          : pendingOperations > 0 ? 'degraded' : 'connected',
        lastSyncTime: now,
        lastDrainTime: healthy ? now : this.state.lastDrainTime,
        nextRetryAt: await this.offlineQueue.getNextAttemptAt(),
        pendingOperations,
        blockedOperations,
        blockedReason: blockedOperations === 0 ? null : 'operation-blocked',
        error: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setState({
        connectionStatus: 'degraded',
        isConnected: false,
        isSyncing: false,
        error: message,
        pendingOperations: await this.offlineQueue.getQueueLength(),
        blockedOperations: await this.offlineQueue.getBlockedCount(),
      })
    }
  }

  subscribeToStateChanges(callback: StateChangeCallback): () => void {
    this.stateListeners.add(callback)
    callback({ ...this.state, channelStates: { ...this.state.channelStates } })
    return () => this.stateListeners.delete(callback)
  }

  getState(): RealtimeSyncState {
    return { ...this.state, channelStates: { ...this.state.channelStates } }
  }

  async sync(): Promise<void> {
    await this.recover('manual')
  }

  /** Kept as a compatibility shim; local writes are already durable in DatabaseAPI. */
  async uploadChange(): Promise<void> {
    await this.drainOutbox()
  }

  disconnect(): void {
    this.destroyed = true
    for (const channel of this.channels.values()) {
      void channel.unsubscribe()
    }
    this.channels.clear()
    this.offlineQueue?.destroy()
    this.offlineQueue = null
    this.initialSyncManager?.abort()
    this.initialSyncManager = null
    this.recordPipelines.clear()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange)
    }
    this.isInitialized = false
    this.setState({
      isConnected: false,
      isSyncing: false,
      connectionStatus: 'disconnected',
      channelStates: {},
    })
  }

  private async recover(reason: string): Promise<void> {
    if (this.destroyed || !this.client || !this.db || !this.config) return
    if (this.state.blockedReason === 'upgrade-required') return
    if (this.recoveryPromise) return this.recoveryPromise

    this.recoveryPromise = (async () => {
      this.setState({ isSyncing: true, error: null })
      try {
        if (!this.allChannelsSubscribed()) await this.subscribeToChannels()
        await this.runSnapshot()
        await this.drainOutbox()
        const now = new Date().toISOString()
        const blockedOperations = this.offlineQueue
          ? await this.offlineQueue.getBlockedCount()
          : 0
        const pendingOperations = this.offlineQueue
          ? await this.offlineQueue.getQueueLength()
          : 0
        const healthy = pendingOperations === 0 && blockedOperations === 0
        this.setState({
          isConnected: healthy,
          isSyncing: false,
          connectionStatus: blockedOperations > 0
            ? 'blocked'
            : pendingOperations > 0 ? 'degraded' : 'connected',
          lastSyncTime: now,
          pendingOperations,
          blockedOperations,
          blockedReason: blockedOperations === 0 ? null : 'operation-blocked',
          error: null,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[Sync] ${reason} recovery failed:`, message)
        this.setState({
          isConnected: false,
          isSyncing: false,
          connectionStatus: 'degraded',
          error: message,
        })
      }
    })().finally(() => {
      this.recoveryPromise = null
    })
    return this.recoveryPromise
  }

  private async runSnapshot(): Promise<void> {
    if (!this.initialSyncManager || !this.config) return
    const onProgress: ProgressCallback = () => undefined
    await this.initialSyncManager.performSync({
      tables: this.config.tables,
      onProgress,
    })
    const now = new Date().toISOString()
    this.setState({ lastSnapshotTime: now, lastSyncTime: now })
  }

  private async drainOutbox(): Promise<void> {
    if (!this.offlineQueue) return
    await this.offlineQueue.processQueue((operation) => this.uploadPending(operation))
    const pendingOperations = await this.offlineQueue.getQueueLength()
    const blockedOperations = await this.offlineQueue.getBlockedCount()
    const healthy = pendingOperations === 0 && blockedOperations === 0
    this.setState({
      ...(healthy ? { lastDrainTime: new Date().toISOString() } : {}),
      pendingOperations,
      blockedOperations,
      nextRetryAt: await this.offlineQueue.getNextAttemptAt(),
    })
  }

  private async refreshQueueState(): Promise<void> {
    if (!this.offlineQueue || this.destroyed) return
    const pendingOperations = await this.offlineQueue.getQueueLength()
    const blockedOperations = await this.offlineQueue.getBlockedCount()
    const nextRetryAt = await this.offlineQueue.getNextAttemptAt()
    const healthy = blockedOperations === 0 && pendingOperations === 0
      && this.allChannelsSubscribed() && this.state.lastSnapshotTime !== null
    this.setState({
      pendingOperations,
      blockedOperations,
      nextRetryAt,
      ...(blockedOperations > 0
        ? {
            isConnected: false,
            connectionStatus: 'blocked' as const,
            blockedReason: 'operation-blocked',
          }
        : pendingOperations > 0
          ? {
              isConnected: false,
              connectionStatus: 'degraded' as const,
              blockedReason: null,
            }
          : healthy
            ? {
                isConnected: true,
                connectionStatus: 'connected' as const,
                blockedReason: null,
                error: null,
              }
            : {}),
    })
  }

  private async uploadPending(operation: PendingOperation): Promise<QueueProcessResult> {
    if (!this.client || !this.db) return { success: false, retryable: true }
    try {
      const response = await applyPendingOperation(this.client, operation)
      await this.db.transaction(
        'rw',
        [this.db.table(operation.table), this.db.pendingOperations],
        async () => {
          const current = await this.db!.pendingOperations.get(operation.operationId)
          if (current && current.generation === operation.generation) {
            await this.db!.pendingOperations.delete(operation.operationId)
          }
          await mergeRemoteRecord(this.db!, operation.table, response.record)
        },
      )
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const retryable = isRetryableSyncError(error)
      return { success: false, retryable, error: message }
    }
  }

  private async subscribeToChannels(): Promise<void> {
    if (!this.client || !this.config) return
    for (const channel of this.channels.values()) void channel.unsubscribe()
    this.channels.clear()

    await Promise.all(this.config.tables.map((table) => new Promise<void>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new Error(`Realtime subscription timed out for ${table}`))
        }
      }, CHANNEL_TIMEOUT_MS)

      const channel = this.client!
        .channel(`db-${table}-changes`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            this.handleRealtimeEvent(table, payload)
          },
        )
        .subscribe((status, error) => {
          this.setChannelState(table, status)
          if (status === 'SUBSCRIBED' && !settled) {
            settled = true
            clearTimeout(timer)
            resolve()
          } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && !settled) {
            settled = true
            clearTimeout(timer)
            reject(error ?? new Error(`Realtime ${status} for ${table}`))
          } else if (status === 'SUBSCRIBED' && this.isInitialized && !this.state.isSyncing) {
            void this.recover(`channel-${table}-resubscribed`)
          } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')
            && settled
            && this.isInitialized
            && !this.state.isSyncing) {
            void this.recover(`channel-${table}-${status.toLowerCase()}`)
          }
        })

      this.channels.set(table, channel)
    })))
  }

  private setChannelState(table: RealtimeSyncTable, status: string): void {
    this.setState({
      channelStates: { ...this.state.channelStates, [table]: status },
      ...(status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'
        ? { isConnected: false, connectionStatus: 'degraded' as const }
        : {}),
    })
  }

  private allChannelsSubscribed(): boolean {
    if (!this.config) return false
    return this.config.tables.every((table) => this.state.channelStates[table] === 'SUBSCRIBED')
  }

  private handleRealtimeEvent(
    table: RealtimeSyncTable,
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): void {
    if (payload.eventType === 'DELETE') {
      // Protocol v2 uses UPDATE tombstones. A physical delete means the snapshot must repair state.
      void this.recover(`unexpected-delete-${table}`)
      return
    }
    const raw = payload.new as Record<string, unknown> | undefined
    if (!raw?.id || !this.db) return
    const remote = fromSupabaseRow(raw)
    const key = `${table}:${remote.id}`
    const previous = this.recordPipelines.get(key) ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        if (!this.db) return
        await this.db.transaction(
          'rw',
          [this.db.table(table), this.db.pendingOperations],
          () => mergeRemoteRecord(this.db!, table, remote),
        )
      })
      .finally(() => {
        if (this.recordPipelines.get(key) === next) this.recordPipelines.delete(key)
      })
    this.recordPipelines.set(key, next)
  }

  getDexieTable(table: RealtimeSyncTable): Table | null {
    return this.db?.table(table) ?? null
  }

  private setState(partial: Partial<RealtimeSyncState>): void {
    this.state = { ...this.state, ...partial }
    const snapshot = this.getState()
    for (const listener of this.stateListeners) listener(snapshot)
  }
}
