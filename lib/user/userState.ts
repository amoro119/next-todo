// lib/user/userState.ts
export interface UserState {
  subscription: 'free' | 'premium' | 'pro';
  syncEnabled: boolean;
  lastSyncTime?: string;
  offlineMode: boolean;
}

export const getUserState = (): UserState => {
  // 在服务器端渲染时返回默认状态
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return {
      subscription: 'premium', // 默认为高级版本
      syncEnabled: true,
      offlineMode: false,
    };
  }

  // 获取分发配置的默认订阅状态
  let defaultSubscription: UserState['subscription'] = 'premium';
  try {
    // 尝试获取分发配置，如果失败则使用默认值
    const { getDistributionConfig } = require('../config/distributionConfig');
    const distributionConfig = getDistributionConfig();
    defaultSubscription = distributionConfig.defaultSubscription;
  } catch (error) {
    // 如果配置还未加载，使用默认值
  }

  const subscription = localStorage.getItem('user_subscription') as UserState['subscription'] || defaultSubscription;
  const syncEnabled = localStorage.getItem('sync_enabled') !== 'false';
  const lastSyncTime = localStorage.getItem('last_sync_time') || undefined;
  const offlineMode = !navigator.onLine;
  
  return {
    subscription,
    syncEnabled: syncEnabled && subscription !== 'free',
    lastSyncTime,
    offlineMode,
  };
};

export const updateUserState = (updates: Partial<UserState>) => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }

  const currentState = getUserState();
  const newState = { ...currentState, ...updates };
  
  localStorage.setItem('user_subscription', newState.subscription);
  localStorage.setItem('sync_enabled', newState.syncEnabled.toString());
  if (newState.lastSyncTime) {
    localStorage.setItem('last_sync_time', newState.lastSyncTime);
  }

  // 触发状态更新事件
  window.dispatchEvent(new CustomEvent('userStateChanged', { detail: newState }));
};

export const checkUserSubscription = (): boolean => {
  const userState = getUserState();
  return userState.subscription === 'premium' || userState.subscription === 'pro';
};