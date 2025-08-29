'use client';

import React, { useState, useEffect } from 'react';
import { useSyncStatus } from '../lib/sync/useSyncStatus';
import { shapeSyncManager } from '../lib/sync/ShapeSyncManager';

interface SyncControlButtonProps {
  className?: string;
}

export function SyncControlButton({ className = '' }: SyncControlButtonProps) {
  const { syncStatus, triggerSync, isTriggering } = useSyncStatus();
  const [isSyncPaused, setIsSyncPaused] = useState(false);

  // 订阅ShapeSyncManager状态变化
  useEffect(() => {
    const unsubscribe = shapeSyncManager.subscribe((isStopped) => {
      setIsSyncPaused(isStopped);
    });
    
    return () => unsubscribe();
  }, []);

  const handleToggleSync = () => {
    if (isSyncPaused) {
      // 恢复同步
      shapeSyncManager.startAll();
      console.log('SyncControlButton: Sync resumed');
    } else {
      // 暂停同步
      shapeSyncManager.stopAll();
      console.log('SyncControlButton: Sync paused');
    }
  };

  // 显示适当的按钮文本和图标
  const getButtonText = () => {
    if (isSyncPaused) {
      return '▶ 启动同步';
    }
    return '⏸ 暂停同步';
  };

  const getButtonClass = () => {
    if (isSyncPaused) {
      return 'btn-small action-sync-resume';
    }
    return 'btn-small action-sync-pause';
  };

  // 如果同步未激活，不显示按钮
  if (!syncStatus.isActive) {
    return null;
  }

  return (
    <input
      type="button"
      className={`btn-small ${getButtonClass()} ${className}`}
      value={getButtonText()}
      onClick={handleToggleSync}
      disabled={isTriggering}
    />
  );
}