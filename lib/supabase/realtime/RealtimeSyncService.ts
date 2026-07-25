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
  private teardownPromise: Promise<void> | null = null
  private initializationPromise: Promise<void> | null = null
  private pendingSubscriptionCancels = new Set<() => void>()
  // 生命周期纪元：disconnect 时递增，用于让旧异步流程与旧 channel 回调失效
  private generation = 0
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

  initialize(
    client: SupabaseClient,
    db: TodoDatabase,
    config?: Partial<RealtimeSyncConfig>,
  ): Promise<void> {
    // 生命周期互斥：并发的 initialize 共享同一次初始化，
    // 防止第二个调用在 teardown 未完成时绕过 barrier
    if (this.initializationPromise) return this.initializationPromise
    if (this.isInitialized) return Promise.resolve()
    const promise = this.doInitialize(client, db, config)
    this.initializationPromise = promise
    const clearInitialization = () => {
      if (this.initializationPromise === promise) this.initializationPromise = null
    }
    // 同时处理 fulfilled/rejected，避免 finally 派生出无人处理的 rejected Promise。
    void promise.then(clearInitialization, clearInitialization)
    return promise
  }

  private async doInitialize(
    client: SupabaseClient,
    db: TodoDatabase,
    config?: Partial<RealtimeSyncConfig>,
  ): Promise<void> {
    // teardown barrier：等待所有已排队的 channel 清理完成，
    // 避免 client.channel(topic) 复用到仍处于 leaving 状态的旧 channel。
    // 进入新生命周期：此前 disconnect 置位的 destroyed 已由当时的 generation 递增记录，
    // 这里重置；barrier 等待期间若发生新的 disconnect，会被 generation 变化捕获。
    const preGen = this.generation
    this.destroyed = false
    if (this.teardownPromise) {
      await this.teardownPromise.catch(() => {})
    }
    // barrier 等待期间可能被 disconnect（或新一轮生命周期）打断
    if (this.destroyed || this.generation !== preGen) return
    this.isInitialized = true
    const gen = ++this.generation
    this.client = client
    this.db = db
    this.config = {
      tables: config?.tables ?? [...SYNC_TABLES],
      retryDelay: config?.retryDelay ?? 1_000,
      maxRetries: config?.maxRetries,
    }
    const offlineQueue = createOfflineQueue(db, () => this.refreshQueueState())
    this.offlineQueue = offlineQueue
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
      if (this.destroyed || gen !== this.generation) return
      this.setState({ protocolVersion: capabilities.protocol_version })
    } catch (error) {
      if (this.destroyed || gen !== this.generation) return
      const message = error instanceof Error ? error.message : String(error)
      const [pendingOperations, blockedOperations] = await Promise.all([
        offlineQueue.getQueueLength(),
        offlineQueue.getBlockedCount(),
      ])
      if (this.destroyed || gen !== this.generation || this.offlineQueue !== offlineQueue) return
      this.setState({
        connectionStatus: 'blocked',
        isConnected: false,
        isSyncing: false,
        error: message,
        blockedReason: 'upgrade-required',
        pendingOperations,
        blockedOperations,
      })
      return
    }

    try {
      await this.subscribeToChannels()
      if (this.destroyed || gen !== this.generation) return
      await this.runSnapshot()
      if (this.destroyed || gen !== this.generation) return
      await offlineQueue.processQueueOnStart((operation) => this.uploadPending(operation))
      if (this.destroyed || gen !== this.generation || this.offlineQueue !== offlineQueue) return
      const now = new Date().toISOString()
      const [pendingOperations, blockedOperations, nextRetryAt] = await Promise.all([
        offlineQueue.getQueueLength(),
        offlineQueue.getBlockedCount(),
        offlineQueue.getNextAttemptAt(),
      ])
      if (this.destroyed || gen !== this.generation || this.offlineQueue !== offlineQueue) return
      const healthy = pendingOperations === 0 && blockedOperations === 0
      this.setState({
        isConnected: healthy,
        isSyncing: false,
        connectionStatus: blockedOperations > 0
          ? 'blocked'
          : pendingOperations > 0 ? 'degraded' : 'connected',
        lastSyncTime: now,
        lastDrainTime: healthy ? now : this.state.lastDrainTime,
        nextRetryAt,
        pendingOperations,
        blockedOperations,
        blockedReason: blockedOperations === 0 ? null : 'operation-blocked',
        error: null,
      })
    } catch (error) {
      if (this.destroyed || gen !== this.generation) return
      const message = error instanceof Error ? error.message : String(error)
      const [pendingOperations, blockedOperations] = await Promise.all([
        offlineQueue.getQueueLength(),
        offlineQueue.getBlockedCount(),
      ])
      if (this.destroyed || gen !== this.generation || this.offlineQueue !== offlineQueue) return
      this.setState({
        connectionStatus: 'degraded',
        isConnected: false,
        isSyncing: false,
        error: message,
        pendingOperations,
        blockedOperations,
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
    // 递增生命周期纪元：使进行中的初始化/订阅流程与旧 channel 回调失效
    this.generation++
    // 旧初始化仍会依靠 generation 自行退出；立即释放字段，允许重挂载启动新生命周期。
    // 旧 Promise 的身份清理不会覆盖随后创建的新 Promise。
    this.initializationPromise = null
    this.cancelPendingSubscriptions()
    // 串行合并 teardown，不覆盖仍在执行的清理（否则其后续流程会"复活" channel）
    this.enqueueTeardown()
    this.recoveryPromise = null
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
    // 初始化本身已包含 channel 建立、反熵快照和 outbox drain；
    // 初始化期间的 visibility/manual 请求直接复用该生命周期。
    if (this.initializationPromise) return this.initializationPromise
    if (this.state.blockedReason === 'upgrade-required') return
    if (this.recoveryPromise) return this.recoveryPromise

    const gen = this.generation
    const promise = (async () => {
      this.setState({ isSyncing: true, error: null })
      try {
        if (!this.allChannelsSubscribed()) await this.subscribeToChannels()
        if (this.destroyed || gen !== this.generation) return
        await this.runSnapshot()
        if (this.destroyed || gen !== this.generation) return
        await this.drainOutbox()
        if (this.destroyed || gen !== this.generation) return
        const now = new Date().toISOString()
        const blockedOperations = this.offlineQueue
          ? await this.offlineQueue.getBlockedCount()
          : 0
        const pendingOperations = this.offlineQueue
          ? await this.offlineQueue.getQueueLength()
          : 0
        if (this.destroyed || gen !== this.generation) return
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
        if (this.destroyed || gen !== this.generation) return
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[Sync] ${reason} recovery failed:`, message)
        this.setState({
          isConnected: false,
          isSyncing: false,
          connectionStatus: 'degraded',
          error: message,
        })
      }
    })()
    this.recoveryPromise = promise
    const clearRecovery = () => {
      if (this.recoveryPromise === promise) this.recoveryPromise = null
    }
    void promise.then(clearRecovery, clearRecovery)
    return promise
  }

  private async runSnapshot(): Promise<void> {
    const manager = this.initialSyncManager
    const config = this.config
    if (!manager || !config) return
    const gen = this.generation
    const onProgress: ProgressCallback = () => undefined
    await manager.performSync({
      tables: config.tables,
      onProgress,
    })
    if (this.destroyed || gen !== this.generation || this.initialSyncManager !== manager) return
    const now = new Date().toISOString()
    this.setState({ lastSnapshotTime: now, lastSyncTime: now })
  }

  private async drainOutbox(): Promise<void> {
    const offlineQueue = this.offlineQueue
    if (!offlineQueue) return
    const gen = this.generation
    await offlineQueue.processQueue((operation) => this.uploadPending(operation))
    if (this.destroyed || gen !== this.generation || this.offlineQueue !== offlineQueue) return
    const [pendingOperations, blockedOperations, nextRetryAt] = await Promise.all([
      offlineQueue.getQueueLength(),
      offlineQueue.getBlockedCount(),
      offlineQueue.getNextAttemptAt(),
    ])
    if (this.destroyed || gen !== this.generation || this.offlineQueue !== offlineQueue) return
    const healthy = pendingOperations === 0 && blockedOperations === 0
    this.setState({
      ...(healthy ? { lastDrainTime: new Date().toISOString() } : {}),
      pendingOperations,
      blockedOperations,
      nextRetryAt,
    })
  }

  private async refreshQueueState(): Promise<void> {
    const offlineQueue = this.offlineQueue
    if (!offlineQueue || this.destroyed) return
    const gen = this.generation
    const [pendingOperations, blockedOperations, nextRetryAt] = await Promise.all([
      offlineQueue.getQueueLength(),
      offlineQueue.getBlockedCount(),
      offlineQueue.getNextAttemptAt(),
    ])
    if (this.destroyed || gen !== this.generation || this.offlineQueue !== offlineQueue) return
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

  /**
   * 将 channel 清理串行排入 teardown 链。
   * 所有 teardown 共用一条链：disconnect 不会覆盖订阅流程正在执行的清理，
   * initialize 的 barrier 也总能等到最后一次 teardown。
   */
  private enqueueTeardown(): Promise<void> {
    const previous = this.teardownPromise
    const promise = (previous ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.teardownChannels())
    this.teardownPromise = promise
    return promise
  }

  /**
   * 等待旧 channel 真正从 socket 移除。
   * realtime-js 的 unsubscribe 在 'error' 分支正常 resolve 但不触发 close/_remove，
   * 旧 topic 会滞留 client.channels 导致后续 channel(topic) 复用 leaving 状态对象，
   * 此时兜底 removeAllChannels 强制清空（该 client 的 realtime 仅由本服务使用）。
   */
  private async teardownChannels(): Promise<void> {
    const client = this.client
    const old = [...this.channels.values()]
    this.channels.clear()
    if (!client || old.length === 0) return

    const statuses = await Promise.all(
      old.map((channel) => client.removeChannel(channel).catch(() => 'error' as const)),
    )
    const lingering = old.some((channel) => client.getChannels().includes(channel))
    if (lingering || statuses.some((s) => s === 'error')) {
      await client.removeAllChannels().catch(() => {})
    }
  }

  private cancelPendingSubscriptions(): void {
    for (const cancel of [...this.pendingSubscriptionCancels]) cancel()
    this.pendingSubscriptionCancels.clear()
  }

  private async subscribeToChannels(): Promise<void> {
    if (!this.client || !this.config) return
    const gen = this.generation
    await this.enqueueTeardown()
    // teardown 等待期间若已 disconnect 或进入新生命周期，禁止继续创建 channel
    if (this.destroyed || gen !== this.generation || !this.client || !this.config) return

    const localCancels = new Set<() => void>()
    const subscriptions = this.config.tables.map((table) => new Promise<void>((resolve, reject) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | null = null

      const cleanupWait = (cancel: () => void) => {
        if (timer != null) clearTimeout(timer)
        timer = null
        localCancels.delete(cancel)
        this.pendingSubscriptionCancels.delete(cancel)
      }
      const cancel = () => {
        if (settled) return
        settled = true
        cleanupWait(cancel)
        resolve()
      }
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        cleanupWait(cancel)
        reject(error)
      }

      localCancels.add(cancel)
      this.pendingSubscriptionCancels.add(cancel)
      timer = setTimeout(
        () => fail(new Error(`Realtime subscription timed out for ${table}`)),
        CHANNEL_TIMEOUT_MS,
      )

      const channel = this.client!
        .channel(`db-${table}-changes`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            // 仅当前生命周期的现役 channel 允许写入本地库
            if (this.destroyed || gen !== this.generation || this.channels.get(table) !== channel) return
            this.handleRealtimeEvent(table, payload)
          },
        )
        .subscribe((status, error) => {
          // 旧 channel 的回调（如 unsubscribe 完成后派发的 CLOSED）不得污染当前状态
          if (this.destroyed || gen !== this.generation || this.channels.get(table) !== channel) {
            cancel()
            return
          }
          this.setChannelState(table, status)
          if (status === 'SUBSCRIBED' && !settled) {
            cancel()
          } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && !settled) {
            fail(error ?? new Error(`Realtime ${status} for ${table}`))
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
    }))

    try {
      await Promise.all(subscriptions)
    } catch (error) {
      // Promise.all 首次失败后，其余表的等待器也必须立即释放。
      for (const cancel of [...localCancels]) cancel()
      throw error
    }
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
