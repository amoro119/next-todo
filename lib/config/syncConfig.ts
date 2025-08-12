// lib/config/syncConfig.ts
import { getUserState, checkUserSubscription } from '../user/userState';
import { networkStatusManager } from '../sync/NetworkStatusManager';

export interface SyncConfig {
  enabled: boolean;
  reason?: 'free_user' | 'user_preference' | 'disabled_by_user';
}

export const getSyncConfig = (): SyncConfig => {
  // 在服务器端渲染时返回默认启用状态
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { enabled: true };
  }

  const userState = getUserState();
  const isPaidUser = checkUserSubscription();
  const userPreference = localStorage.getItem('sync_enabled') !== 'false';
  
  // 检查各种禁用条件
  if (!isPaidUser) {
    return { enabled: false, reason: 'free_user' };
  }
  
  if (!userPreference) {
    return { enabled: false, reason: 'user_preference' };
  }
  
  // 同步功能启用，但网络状态由同步系统内部处理
  return { enabled: true };
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

  // 触发配置更新事件
  window.dispatchEvent(new CustomEvent('syncConfigChanged'));
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