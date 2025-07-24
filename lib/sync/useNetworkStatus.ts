// lib/sync/useNetworkStatus.ts
'use client';

import { useState, useEffect } from 'react';
import { networkStatusManager } from './NetworkStatusManager';

export interface NetworkStatus {
  isOnline: boolean;
  isLoading: boolean;
  lastChecked?: string;
  responseTime?: number;
  reconnectAttempts: number;
}

/**
 * React Hook for monitoring network status
 * 
 * @returns NetworkStatus object with current network state
 */
export function useNetworkStatus(): NetworkStatus {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isOnline: true, // 默认假设在线
    isLoading: true,
    reconnectAttempts: 0
  });

  useEffect(() => {
    // 初始化网络状态管理器
    networkStatusManager.initialize();

    // 获取初始状态
    const updateNetworkStatus = () => {
      const isOnline = networkStatusManager.isOnline();
      const stats = networkStatusManager.getNetworkStats();
      
      setNetworkStatus({
        isOnline,
        isLoading: false,
        lastChecked: stats?.lastChecked,
        responseTime: stats?.responseTime,
        reconnectAttempts: stats?.reconnectAttempts || 0
      });
    };

    // 立即更新一次状态
    updateNetworkStatus();

    // 监听网络状态变化
    const handleNetworkChange = () => {
      updateNetworkStatus();
    };

    // 注册网络状态变化监听器
    networkStatusManager.onNetworkChange(handleNetworkChange);

    // 监听自定义网络状态变化事件
    const handleCustomNetworkChange = (event: CustomEvent) => {
      updateNetworkStatus();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('networkStatusChange', handleCustomNetworkChange as EventListener);
    }

    // 清理函数
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('networkStatusChange', handleCustomNetworkChange as EventListener);
      }
    };
  }, []);

  return networkStatus;
}

/**
 * Hook for manually refreshing network status
 */
export function useNetworkRefresh() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshNetworkStatus = async (): Promise<boolean> => {
    setIsRefreshing(true);
    try {
      const result = await networkStatusManager.refreshNetworkStatus();
      return result;
    } finally {
      setIsRefreshing(false);
    }
  };

  return {
    refreshNetworkStatus,
    isRefreshing
  };
}