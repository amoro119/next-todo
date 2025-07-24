'use client';

import { useState, useEffect } from 'react';
import { SyncStatus } from './types';
import { SyncScheduler } from './SyncScheduler';

// This will be initialized in the app startup
let syncSchedulerInstance: SyncScheduler | null = null;

export function setSyncScheduler(scheduler: SyncScheduler): void {
  syncSchedulerInstance = scheduler;
}

export function useSyncStatus() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isActive: false,
    progress: 0
  });
  
  const [isTriggering, setIsTriggering] = useState(false);
  const [syncInterval, setSyncInterval] = useState<number>(0);

  useEffect(() => {
    if (!syncSchedulerInstance) {
      console.warn('useSyncStatus: Sync scheduler not initialized');
      return;
    }
    
    // Get initial status
    setSyncStatus(syncSchedulerInstance.getSyncStatus());
    setSyncInterval(syncSchedulerInstance.getSyncInterval());
    
    // Register for status updates
    const handleStatusChange = (status: SyncStatus) => {
      setSyncStatus(status);
    };
    
    syncSchedulerInstance.onSyncStatusChange(handleStatusChange);
    
    // Cleanup
    return () => {
      // No way to unregister in current implementation
    };
  }, []);

  const triggerSync = async () => {
    if (!syncSchedulerInstance) {
      console.warn('useSyncStatus: Sync scheduler not initialized');
      return;
    }
    
    setIsTriggering(true);
    try {
      await syncSchedulerInstance.triggerSync();
    } finally {
      setIsTriggering(false);
    }
  };
  
  const updateSyncInterval = (intervalMs: number) => {
    if (!syncSchedulerInstance) {
      console.warn('useSyncStatus: Sync scheduler not initialized');
      return;
    }
    
    syncSchedulerInstance.setSyncInterval(intervalMs);
    setSyncInterval(syncSchedulerInstance.getSyncInterval());
  };
  
  const toggleAdaptiveSync = (enabled: boolean) => {
    if (!syncSchedulerInstance) {
      console.warn('useSyncStatus: Sync scheduler not initialized');
      return;
    }
    
    syncSchedulerInstance.setAdaptiveSync(enabled);
  };

  return {
    syncStatus,
    triggerSync,
    isTriggering,
    syncInterval,
    updateSyncInterval,
    toggleAdaptiveSync
  };
}