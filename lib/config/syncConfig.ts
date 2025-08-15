// lib/config/syncConfig.ts
import { getUserState, checkUserSubscription } from '../user/userState';
import { networkStatusManager } from '../sync/NetworkStatusManager';

export interface SyncConfig {
  enabled: boolean;
  reason?: 'free_user' | 'user_preference' | 'disabled_by_user';
}

/**
 * 比较两个SyncConfig对象是否相等
 */
export function isSyncConfigEqual(a: SyncConfig, b: SyncConfig): boolean {
  return a.enabled === b.enabled && a.reason === b.reason;
}

// 缓存同步配置以避免重复计算
let cachedSyncConfig: SyncConfig | null = null;
let lastSyncCacheTime = 0;
const SYNC_CACHE_TTL = 3000; // 3秒缓存

export const getSyncConfig = (): SyncConfig => {
  // 在服务器端渲染时返回默认启用状态
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { enabled: true };
  }

  // 检查缓存是否有效
  const now = Date.now();
  if (cachedSyncConfig && (now - lastSyncCacheTime) < SYNC_CACHE_TTL) {
    return cachedSyncConfig;
  }

  const userState = getUserState();
  const isPaidUser = checkUserSubscription();
  const userPreference = localStorage.getItem('sync_enabled') !== 'false';
  
  let syncConfig: SyncConfig;
  
  // 检查各种禁用条件
  if (!isPaidUser) {
    syncConfig = { enabled: false, reason: 'free_user' };
  } else if (!userPreference) {
    syncConfig = { enabled: false, reason: 'user_preference' };
  } else {
    // 同步功能启用，但网络状态由同步系统内部处理
    syncConfig = { enabled: true };
  }

  // 更新缓存
  cachedSyncConfig = syncConfig;
  lastSyncCacheTime = now;
  
  return syncConfig;
};

export const setSyncNetworkError = (hasError: boolean) => {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return;
  }

  if (hasError) {
    sessionStorage.setItem('sync_network_error', 'true');
  } else {
    sessionStorage.removeItem('sync_network_error');
  }

  // 清除缓存，强制重新计算
  cachedSyncConfig = null;
  lastSyncCacheTime = 0;

  // 触发配置更新事件
  window.dispatchEvent(new CustomEvent('syncConfigChanged'));
};

/**
 * 清除同步配置缓存
 */
export const clearSyncConfigCache = () => {
  cachedSyncConfig = null;
  lastSyncCacheTime = 0;
};

export const getSyncDisabledMessage = (reason?: string): string => {
  switch (reason) {
    case 'free_user':
      return '免费版本 - 仅本地存储';
    case 'user_preference':
      return '同步已禁用 - 仅本地模式';
    case 'disabled_by_user':
      return '用户已禁用同步';
    default:
      return '本地模式';
  }
};