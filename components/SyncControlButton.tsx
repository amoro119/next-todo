'use client';

import React, { useState, useEffect } from 'react';
import { simpleSyncManager } from '../lib/sync/SimpleSyncManager';
import { getSyncConfig } from '../lib/config/syncConfig';

interface SyncControlButtonProps {
  className?: string;
}

interface SyncControlState {
  isRunning: boolean;
}

export function SyncControlButton({ className = '' }: SyncControlButtonProps) {
  const [syncState, setSyncState] = useState<SyncControlState>({
    isRunning: false,
  });

  // 订阅SimpleSyncManager状态变化
  useEffect(() => {
    const unsubscribe = simpleSyncManager.subscribe((isRunning) => {
      setSyncState({ isRunning });
    });
    
    return () => unsubscribe();
  }, []);

  // 组件卸载时清理订阅
  useEffect(() => {
    return () => {
      simpleSyncManager.cleanup();
    };
  }, []);

  const handleStartSync = async () => {
    // 如果已在同步中，不执行任何操作
    if (syncState.isRunning) {
      return;
    }

    try {
      // 启动同步 - 使用SimpleSyncManager的基础功能
      // 完整的同步逻辑（包括初始同步）应该在应用启动时处理
      // 这里只负责控制实时订阅的启动
      await simpleSyncManager.startSync();
      console.log('SyncControlButton: 同步已启动');
    } catch (error) {
      console.error('SyncControlButton: 同步启动失败:', error);
    }
  };

  // 显示适当的按钮文本和图标
  const getButtonText = () => {
    if (syncState.isRunning) {
      return '同步中...';
    }
    return '▶ 启动同步';
  };

  const getButtonClass = () => {
    if (syncState.isRunning) {
      return 'action-sync-running';
    }
    return 'action-sync-resume';
  };

  // 检查同步配置是否启用
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
      disabled={syncState.isRunning}
    />
  );
}