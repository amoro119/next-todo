// lib/sync/initOfflineSync.ts
import { PGlite } from '@electric-sql/pglite';
import { SyncQueueManagerImpl } from './SyncQueueManager';
import { ChangeInterceptorImpl, DatabaseWrapper } from './ChangeInterceptor';
import { BatchSyncProcessorImpl } from './BatchSyncProcessor';
import { SyncSchedulerImpl } from './SyncScheduler';
import { QueueMaintenance } from './QueueMaintenance';
import { networkStatusManager } from './NetworkStatusManager';
import { setSyncScheduler } from './useSyncStatus';

let isInitialized = false;
let syncScheduler: SyncSchedulerImpl | null = null;
let queueMaintenance: QueueMaintenance | null = null;
let dbWrapper: DatabaseWrapper | null = null;

export function initOfflineSync(db: PGlite): { dbWrapper: DatabaseWrapper } {
  if (isInitialized) {
    return { dbWrapper: dbWrapper! };
  }
  
  console.log('Initializing offline sync system...');
  
  // Initialize components
  const syncQueueManager = new SyncQueueManagerImpl(db);
  const batchSyncProcessor = new BatchSyncProcessorImpl(syncQueueManager);
  
  // Create database wrapper
  dbWrapper = new DatabaseWrapper(db);
  
  // Create change interceptor
  const changeInterceptor = new ChangeInterceptorImpl(db, syncQueueManager);
  
  // Set change interceptor on database wrapper
  dbWrapper.setChangeInterceptor(changeInterceptor);
  
  // Create sync scheduler
  syncScheduler = new SyncSchedulerImpl(syncQueueManager, batchSyncProcessor);
  
  // Create queue maintenance
  queueMaintenance = new QueueMaintenance(syncQueueManager, {
    completedRetentionHours: 24, // 保留已完成变更24小时
    completedCleanupInterval: 24 * 60 * 60 * 1000, // 24小时
    failedCleanupInterval: 24 * 60 * 60 * 1000 // 24小时
  });
  
  // Make sync scheduler available to React hooks
  setSyncScheduler(syncScheduler);
  
  // Initialize network status manager
  networkStatusManager.initialize();
  
  // Start sync scheduler
  syncScheduler.start();
  
  // Start queue maintenance
  queueMaintenance.start();
  
  isInitialized = true;
  console.log('Offline sync system initialized');
  
  return { dbWrapper };
}

export function getDbWrapper(): DatabaseWrapper | null {
  return dbWrapper;
}

export function getSyncScheduler(): SyncSchedulerImpl | null {
  return syncScheduler;
}

export function getQueueMaintenance(): QueueMaintenance | null {
  return queueMaintenance;
}

export function cleanupOfflineSync(): void {
  if (!isInitialized) return;
  
  console.log('Cleaning up offline sync system...');
  
  if (syncScheduler) {
    syncScheduler.stop();
  }
  
  if (queueMaintenance) {
    queueMaintenance.stop();
  }
  
  networkStatusManager.cleanup();
  
  isInitialized = false;
  console.log('Offline sync system cleaned up');
}