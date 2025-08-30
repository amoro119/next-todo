'use client';

import React, { useState, useEffect } from 'react';
import { simpleSyncManager } from '../lib/sync/SimpleSyncManager';
import { getSyncConfig } from '../lib/config/syncConfig';

interface SyncControlButtonProps {
  className?: string;
}

interface SyncControlState {
  isRunning: boolean;
  isTransitioning: boolean;
}

export function SyncControlButton({ className = '' }: SyncControlButtonProps) {
  const [syncState, setSyncState] = useState<SyncControlState>({
    isRunning: false,
    isTransitioning: false,
  });

  // 订阅SimpleSyncManager状态变化
  useEffect(() => {
    const unsubscribe = simpleSyncManager.subscribe((isRunning) => {
      setSyncState(prev => ({
        ...prev,
        isRunning,
        isTransitioning: false, // 状态更新时清除过渡状态
      }));
    });
    
    return () => unsubscribe();
  }, []);

  // 组件卸载时清理订阅
  useEffect(() => {
    return () => {
      simpleSyncManager.cleanup();
    };
  }, []);

  const handleToggleSync = async () => {
    // 防止重复点击
    if (syncState.isTransitioning) {
      return;
    }

    setSyncState(prev => ({ ...prev, isTransitioning: true }));

    try {
      if (syncState.isRunning) {
        // 停止同步
        simpleSyncManager.stopSync();
        console.log('SyncControlButton: 同步已停止');
      } else {
        // 启动同步 - 使用SimpleSyncManager的基础功能
        // 完整的同步逻辑（包括初始同步）应该在应用启动时处理
        // 这里只负责控制实时订阅的启动和停止
        await simpleSyncManager.startSync();
        console.log('SyncControlButton: 同步已启动');
      }
    } catch (error) {
      console.error('SyncControlButton: 同步操作失败:', error);
      // 操作失败时重置过渡状态
      setSyncState(prev => ({ ...prev, isTransitioning: false }));
    }
  };

  // 显示适当的按钮文本和图标
  const getButtonText = () => {
    if (syncState.isTransitioning) {
      return syncState.isRunning ? '⏸ 停止中...' : '▶ 启动中...';
    }
    
    if (syncState.isRunning) {
      return '同步中...';
    }
    return '▶ 启动同步';
  };

  const getButtonClass = () => {
    if (syncState.isRunning) {
      return 'action-sync-pause';
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
      onClick={handleToggleSync}
      disabled={syncState.isTransitioning}
    />
  );
}