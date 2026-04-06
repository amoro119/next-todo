'use client';

import React, { useState, useEffect } from 'react';
import { simpleSyncManager } from '../lib/sync/SimpleSyncManager';
import { getSyncConfig } from '../lib/config/syncConfig';

interface SyncControlButtonProps {
  className?: string;
}

interface SyncControlState {
  isRunning: boolean;
  isRetrying: boolean;
  retryAttempt: number;
}

export function SyncControlButton({ className = '' }: SyncControlButtonProps) {
  const [syncState, setSyncState] = useState<SyncControlState>({
    isRunning: false,
    isRetrying: false,
    retryAttempt: 0,
  });

  useEffect(() => {
    const unsubscribe = simpleSyncManager.subscribe((isRunning) => {
      const status = simpleSyncManager.getStatus();
      setSyncState({
        isRunning,
        isRetrying: status.isRetrying,
        retryAttempt: status.retryAttempt,
      });
    });
    
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      simpleSyncManager.cleanup();
    };
  }, []);

  const handleStartSync = async () => {
    if (syncState.isRunning) {
      return;
    }

    try {
      await simpleSyncManager.startSync();
      console.log('SyncControlButton: Sync started');
    } catch (error) {
      console.error('SyncControlButton: Sync start failed:', error);
    }
  };

  const getButtonText = () => {
    if (syncState.isRetrying) {
      return `Retrying ${syncState.retryAttempt}/5...`;
    }
    if (syncState.isRunning) {
      return 'Syncing...';
    }
    return '▶ Start Sync';
  };

  const getButtonClass = () => {
    if (syncState.isRetrying) {
      return 'action-sync-retrying';
    }
    if (syncState.isRunning) {
      return 'action-sync-running';
    }
    return 'action-sync-resume';
  };

  const syncConfig = getSyncConfig();
  if (!syncConfig.enabled) {
    return null;
  }

  return (
    <input
      type="button"
      className={`btn-small ${getButtonClass()} ${className}`}
      value={getButtonText()}
      onClick={handleStartSync}
      disabled={syncState.isRunning || syncState.isRetrying}
    />
  );
}
