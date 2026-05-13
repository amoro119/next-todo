// lib/config/index.ts

export { 
  type UserState, 
  getUserState, 
  updateUserState, 
  checkUserSubscription 
} from '../user/userState';

export { 
  type SyncConfig, 
  getSyncConfig, 
  setSyncNetworkError, 
  getSyncDisabledMessage 
} from './syncConfig';

export { 
  isNetworkError
} from '../network/errorHandling';

export {
  type DistributionConfig,
  loadDistributionConfig,
  getDistributionConfig,
  isFeatureEnabled,
  shouldShowUpgradePrompts,
  getAppMetadata
} from './distributionConfig';

export {
  initializeAppConfig,
  isConfigInitialized,
  waitForConfigInitialization
} from './initConfig';

export {
  validateConfiguration,
  logConfigurationStatus,
  type ConfigValidationResult
} from './configValidator';

// 网络状态管理器（简化版，替代已删除的 lib/sync/NetworkStatusManager）
const networkListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => networkListeners.forEach((cb) => cb()));
  window.addEventListener('offline', () => networkListeners.forEach((cb) => cb()));
}

export const networkStatusManager = {
  isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  },
  onNetworkChange(callback: () => void): () => void {
    networkListeners.add(callback);
    return () => networkListeners.delete(callback);
  },
};

// 便捷的组合函数
export const getAppConfig = () => {
  const currentUserState = getUserState();
  const currentSyncConfig = getSyncConfig();

  return {
    user: currentUserState,
    sync: currentSyncConfig,
    isOnline: networkStatusManager.isOnline(),
  };
};