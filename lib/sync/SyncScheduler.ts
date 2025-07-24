// lib/sync/SyncScheduler.ts
import { SyncQueueManager } from './SyncQueueManager';
import { BatchSyncProcessor } from './BatchSyncProcessor';
import { networkStatusManager } from './NetworkStatusManager';
import { SyncStatus, QueueStats } from './types';

export interface SyncScheduler {
  // Start sync scheduling
  start(): void;
  
  // Stop sync scheduling
  stop(): void;
  
  // Trigger sync immediately
  triggerSync(): Promise<void>;
  
  // Check if sync is in progress
  isSyncing(): boolean;
  
  // Get sync status
  getSyncStatus(): SyncStatus;
  
  // Register sync status change callback
  onSyncStatusChange(callback: (status: SyncStatus) => void): void;
  
  // Set sync interval
  setSyncInterval(intervalMs: number): void;
  
  // Get current sync interval
  getSyncInterval(): number;
  
  // Enable/disable adaptive sync
  setAdaptiveSync(enabled: boolean): void;
}

export class SyncSchedulerImpl implements SyncScheduler {
  private isActive = false;
  private isSyncInProgress = false;
  private syncStatusCallbacks: ((status: SyncStatus) => void)[] = [];
  private currentStatus: SyncStatus = {
    isActive: false,
    progress: 0
  };
  private syncInterval?: NodeJS.Timeout;
  private syncIntervalMs = 5 * 60 * 1000; // Default 5 minutes
  private adaptiveSyncEnabled = true;
  private minSyncInterval = 30 * 1000; // Minimum 30 seconds
  private maxSyncInterval = 10 * 60 * 1000; // Maximum 10 minutes
  private consecutiveFailures = 0;
  private maxConsecutiveFailures = 3;
  private lastNetworkQuality: 'good' | 'poor' | 'unknown' = 'unknown';

  constructor(
    private syncQueueManager: SyncQueueManager,
    private batchSyncProcessor: BatchSyncProcessor
  ) {}

  start(): void {
    if (this.isActive) return;
    
    console.log('SyncScheduler: Starting sync scheduler');
    this.isActive = true;
    this.updateSyncStatus({ isActive: true });
    
    // Register network status change listener
    networkStatusManager.onNetworkChange(this.handleNetworkChange);
    
    // Start periodic sync check
    this.startPeriodicSync();
    
    // Initial sync check - 添加更多日志
    console.log('SyncScheduler: 执行初始同步检查');
    this.checkAndTriggerSync().then(() => {
      console.log('SyncScheduler: 初始同步检查完成');
    }).catch(error => {
      console.error('SyncScheduler: 初始同步检查失败', error);
    });
  }

  stop(): void {
    if (!this.isActive) return;
    
    console.log('SyncScheduler: Stopping sync scheduler');
    this.isActive = false;
    this.updateSyncStatus({ isActive: false });
    
    // Clear interval
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }
  }

  async triggerSync(): Promise<void> {
    if (this.isSyncInProgress) {
      console.log('SyncScheduler: Sync already in progress');
      return;
    }
    
    if (!networkStatusManager.isOnline()) {
      console.log('SyncScheduler: Cannot sync while offline');
      this.updateSyncStatus({ 
        progress: 0,
        syncStage: 'failed',
        error: 'Network is offline. Changes will sync when connection is restored.'
      });
      return;
    }
    
    const syncStartTime = new Date();
    let syncHistory = [...(this.currentStatus.syncHistory || [])];
    
    try {
      this.isSyncInProgress = true;
      
      // Preparing stage
      this.updateSyncStatus({ 
        progress: 5, 
        syncStage: 'preparing',
        syncStartTime: syncStartTime.toISOString(),
        currentItem: 'Preparing for sync...'
      });
      
      // Get queue stats before sync
      const queueStatsBefore = await this.syncQueueManager.getQueueStats();
      
      if (queueStatsBefore.pending === 0) {
        console.log('SyncScheduler: No pending changes to sync');
        
        // Add to sync history
        const syncEndTime = new Date();
        const syncDuration = syncEndTime.getTime() - syncStartTime.getTime();
        
        syncHistory = [
          {
            timestamp: syncStartTime.toISOString(),
            success: true,
            itemsProcessed: 0,
            duration: syncDuration
          },
          ...syncHistory.slice(0, 9) // Keep last 10 entries
        ];
        
        this.updateSyncStatus({ 
          progress: 100, 
          syncStage: 'completed',
          lastSyncTime: syncEndTime.toISOString(),
          queueStats: queueStatsBefore,
          syncHistory
        });

        return;
      }
      
      // Test server connection before attempting sync
      this.updateSyncStatus({ 
        progress: 10,
        currentItem: 'Testing server connection...'
      });
      
      const isServerReachable = await networkStatusManager.testServerConnection();
      if (!isServerReachable) {
        throw new Error('Server is unreachable. Will retry later.');
      }
      
      // Processing stage
      console.log(`SyncScheduler: Processing ${queueStatsBefore.pending} pending changes`);
      this.updateSyncStatus({ 
        progress: 20,
        syncStage: 'processing',
        currentItem: `Syncing ${queueStatsBefore.pending} changes`,
        totalItemsToSync: queueStatsBefore.pending,
        itemsProcessed: 0
      });
      
      // Start monitoring progress
      const progressMonitoringInterval = setInterval(() => {
        if (!this.isSyncInProgress) {
          clearInterval(progressMonitoringInterval);
          return;
        }
        
        const elapsedTime = (new Date().getTime() - syncStartTime.getTime()) / 1000; // in seconds
        const itemsProcessed = this.currentStatus.itemsProcessed || 0;
        const totalItems = this.currentStatus.totalItemsToSync || 1;
        
        if (elapsedTime > 0 && itemsProcessed > 0) {
          const processingSpeed = itemsProcessed / elapsedTime;
          const remainingItems = totalItems - itemsProcessed;
          const estimatedTimeRemaining = remainingItems / processingSpeed;
          
          const progress = Math.min(90, 20 + Math.floor((itemsProcessed / totalItems) * 70));
          
          this.updateSyncStatus({
            progress,
            processingSpeed,
            estimatedTimeRemaining,
            currentItem: `Processed ${itemsProcessed}/${totalItems} changes (${Math.round(processingSpeed * 100) / 100}/s)`
          });
        }
      }, 1000);
      
      // Process sync queue with progress callback
      const results = await this.batchSyncProcessor.processSyncQueue((processed, total) => {
        if (total > 0) {
          const progress = Math.min(90, 20 + Math.floor((processed / total) * 70));
          this.updateSyncStatus({
            progress,
            itemsProcessed: processed,
            totalItemsToSync: total,
            currentItem: `Processed ${processed}/${total} changes`
          });
        }
      });
      
      // Clear progress monitoring
      clearInterval(progressMonitoringInterval);
      
      // Cleaning stage
      this.updateSyncStatus({ 
        progress: 95,
        syncStage: 'cleaning',
        currentItem: 'Cleaning up completed changes...'
      });
      
      // Get queue stats after sync
      const queueStatsAfter = await this.syncQueueManager.getQueueStats();
      
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      console.log(`SyncScheduler: Sync completed. Success: ${successCount}, Failed: ${failCount}`);
      
      // Update network quality based on sync results
      this.updateNetworkQuality(successCount, failCount);
      
      // Reset consecutive failures on success
      if (successCount > 0) {
        this.consecutiveFailures = 0;
      }
      
      // Clean up completed changes
      await this.syncQueueManager.cleanupCompletedChanges(24); // Clean up changes older than 24 hours
      
      // Add to sync history
      const syncEndTime = new Date();
      const syncDuration = syncEndTime.getTime() - syncStartTime.getTime();
      
      syncHistory = [
        {
          timestamp: syncStartTime.toISOString(),
          success: true,
          itemsProcessed: successCount,
          duration: syncDuration
        },
        ...syncHistory.slice(0, 9) // Keep last 10 entries
      ];
      
      // Completed stage
      this.updateSyncStatus({
        progress: 100,
        syncStage: 'completed',
        lastSyncTime: syncEndTime.toISOString(),
        queueStats: queueStatsAfter,
        itemsProcessed: successCount,
        syncHistory
      });
      
      // Adjust sync interval based on queue size and network quality if adaptive sync is enabled
      if (this.adaptiveSyncEnabled) {
        this.adjustSyncInterval(queueStatsAfter);
      }
    } catch (error) {
      console.error('SyncScheduler: Error during sync:', error);
      this.consecutiveFailures++;
      
      // If we've had too many consecutive failures, increase the sync interval
      if (this.consecutiveFailures >= this.maxConsecutiveFailures && this.adaptiveSyncEnabled) {
        this.increaseSyncInterval();
      }
      
      // Add to sync history
      const syncEndTime = new Date();
      const syncDuration = syncEndTime.getTime() - syncStartTime.getTime();
      
      syncHistory = [
        {
          timestamp: syncStartTime.toISOString(),
          success: false,
          itemsProcessed: 0,
          duration: syncDuration,
          error: error instanceof Error ? error.message : String(error)
        },
        ...syncHistory.slice(0, 9) // Keep last 10 entries
      ];
      
      this.updateSyncStatus({
        progress: 0,
        syncStage: 'failed',
        error: error instanceof Error ? error.message : String(error),
        syncHistory
      });
    } finally {
      this.isSyncInProgress = false;
    }
  }

  isSyncing(): boolean {
    return this.isSyncInProgress;
  }

  getSyncStatus(): SyncStatus {
    return this.currentStatus;
  }

  onSyncStatusChange(callback: (status: SyncStatus) => void): void {
    this.syncStatusCallbacks.push(callback);
    
    // Immediately call with current status
    try {
      callback(this.currentStatus);
    } catch (error) {
      console.error('SyncScheduler: Error in sync status callback:', error);
    }
  }
  
  setSyncInterval(intervalMs: number): void {
    // Ensure interval is within bounds
    this.syncIntervalMs = Math.max(
      this.minSyncInterval,
      Math.min(intervalMs, this.maxSyncInterval)
    );
    
    console.log(`SyncScheduler: Sync interval set to ${this.syncIntervalMs}ms`);
    
    // Restart periodic sync with new interval
    if (this.isActive) {
      this.restartPeriodicSync();
    }
  }
  
  getSyncInterval(): number {
    return this.syncIntervalMs;
  }
  
  setAdaptiveSync(enabled: boolean): void {
    this.adaptiveSyncEnabled = enabled;
    console.log(`SyncScheduler: Adaptive sync ${enabled ? 'enabled' : 'disabled'}`);
  }

  private handleNetworkChange = (isOnline: boolean): void => {
    console.log(`SyncScheduler: Network status changed to ${isOnline ? 'online' : 'offline'}`);
    
    if (isOnline) {
      // When network comes back online, trigger sync immediately
      // This fulfills requirement 2.3: "WHEN 系统检测到网络恢复 THEN 系统 SHALL 触发同步队列处理"
      console.log('SyncScheduler: Network restored, triggering immediate sync');
      this.checkAndTriggerSync();
    } else {
      // When network goes offline, update status
      this.updateSyncStatus({
        progress: 0,
        error: 'Network is offline. Changes will sync when connection is restored.'
      });
    }
  };

  private startPeriodicSync(): void {
    // Check for pending changes at configured interval
    this.syncInterval = setInterval(() => {
      this.checkAndTriggerSync();
    }, this.syncIntervalMs);
    
    console.log(`SyncScheduler: Started periodic sync with interval ${this.syncIntervalMs}ms`);
  }
  
  private restartPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    this.startPeriodicSync();
  }

  private async checkAndTriggerSync(): Promise<void> {
    if (!this.isActive || this.isSyncInProgress) {
      return;
    }
    
    // Check if we're online before attempting to get queue stats
    if (!networkStatusManager.isOnline()) {
      console.log('SyncScheduler: Network is offline, skipping sync check');
      return;
    }
    
    try {
      const stats = await this.syncQueueManager.getQueueStats();
      
      // Update status with current queue stats even if we don't sync
      this.updateSyncStatus({ queueStats: stats });
      
      if (stats.pending > 0) {
        console.log(`SyncScheduler: Found ${stats.pending} pending changes, triggering sync`);
        await this.triggerSync();
      } else {
        console.log('SyncScheduler: No pending changes found');
      }
    } catch (error) {
      console.error('SyncScheduler: Error checking sync queue:', error);
    }
  }

  private updateSyncStatus(update: Partial<SyncStatus>): void {
    this.currentStatus = {
      ...this.currentStatus,
      ...update
    };
    
    // Notify all listeners
    this.syncStatusCallbacks.forEach(callback => {
      try {
        callback(this.currentStatus);
      } catch (error) {
        console.error('SyncScheduler: Error in sync status callback:', error);
      }
    });
  }
  
  private updateNetworkQuality(successCount: number, failCount: number): void {
    // Simple heuristic to determine network quality
    if (failCount === 0 && successCount > 0) {
      this.lastNetworkQuality = 'good';
    } else if (failCount > successCount) {
      this.lastNetworkQuality = 'poor';
    }
    
    console.log(`SyncScheduler: Network quality assessed as ${this.lastNetworkQuality}`);
  }
  
  private adjustSyncInterval(queueStats: QueueStats): void {
    // Adjust sync interval based on queue size and network quality
    // This fulfills requirement 7.2: "WHEN 同步过程进行时 THEN 系统 SHALL 不阻塞用户界面的正常操作"
    // by optimizing the sync frequency
    
    const pendingCount = queueStats.pending;
    
    if (pendingCount > 50 && this.lastNetworkQuality === 'good') {
      // Many pending changes and good network - sync more frequently
      this.decreaseSyncInterval();
    } else if (pendingCount < 5 && this.lastNetworkQuality !== 'poor') {
      // Few pending changes - sync less frequently
      this.increaseSyncInterval();
    } else if (this.lastNetworkQuality === 'poor') {
      // Poor network quality - sync less frequently
      this.increaseSyncInterval();
    }
  }
  
  private decreaseSyncInterval(): void {
    // Decrease interval (sync more frequently) but not below minimum
    const newInterval = Math.max(this.syncIntervalMs / 2, this.minSyncInterval);
    
    if (newInterval !== this.syncIntervalMs) {
      console.log(`SyncScheduler: Decreasing sync interval from ${this.syncIntervalMs}ms to ${newInterval}ms`);
      this.setSyncInterval(newInterval);
    }
  }
  
  private increaseSyncInterval(): void {
    // Increase interval (sync less frequently) but not above maximum
    const newInterval = Math.min(this.syncIntervalMs * 1.5, this.maxSyncInterval);
    
    if (newInterval !== this.syncIntervalMs) {
      console.log(`SyncScheduler: Increasing sync interval from ${this.syncIntervalMs}ms to ${newInterval}ms`);
      this.setSyncInterval(newInterval);
    }
  }
}