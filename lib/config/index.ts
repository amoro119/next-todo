// lib/config/index.ts
import { networkStatusManager } from '../sync/NetworkStatusManager';

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
  isNetworkError, 
  withNetworkErrorHandling, 
  handleSyncError, 
  retryWithBackoff 
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

// 导出现有的网络状态管理器
export { networkStatusManager } from '../sync/NetworkStatusManager';

// 便捷的组合函数
export const getAppConfig = () => {
  const userState = getUserState();
  const syncConfig = getSyncConfig();
  
  return {
    user: userState,
    sync: syncConfig,
    isOnline: networkStatusManager.isOnline(),
  };
};