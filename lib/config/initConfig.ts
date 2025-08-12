// lib/config/initConfig.ts
import { loadDistributionConfig, getDistributionConfig } from './distributionConfig';
import { getUserState, updateUserState } from '../user/userState';
import { logConfigurationStatus } from './configValidator';

let isInitialized = false;

export const initializeAppConfig = async (): Promise<void> => {
  if (isInitialized) {
    return;
  }

  console.log('🚀 初始化应用配置...');

  try {
    // 1. 加载分发配置
    await loadDistributionConfig();
    const distributionConfig = getDistributionConfig();
    
    console.log(`📦 已加载 ${distributionConfig.buildType} 版本配置`);

    // 开发环境下，清除可能冲突的localStorage值
    if (process.env.NODE_ENV === 'development' && typeof localStorage !== 'undefined') {
      const currentSubscription = localStorage.getItem('user_subscription');
      if (currentSubscription && currentSubscription !== distributionConfig.defaultSubscription) {
        console.log(`🧹 开发环境：清除冲突的用户订阅状态 ${currentSubscription} -> ${distributionConfig.defaultSubscription}`);
        localStorage.removeItem('user_subscription');
        localStorage.removeItem('sync_enabled');
      }
    }

    // 2. 检查并初始化用户状态
    const userState = getUserState();
    let needsUpdate = false;
    const updates: Partial<typeof userState> = {};

    // 确保用户订阅状态与分发配置一致
    if (userState.subscription !== distributionConfig.defaultSubscription) {
      updates.subscription = distributionConfig.defaultSubscription;
      needsUpdate = true;
      console.log(`🔧 调整订阅状态以匹配分发配置: ${userState.subscription} -> ${distributionConfig.defaultSubscription}`);
    }

    // 根据分发配置调整同步设置
    if (distributionConfig.buildType === 'free' && userState.syncEnabled) {
      updates.syncEnabled = false;
      needsUpdate = true;
      console.log('🔧 免费版本，禁用同步功能');
    }

    if (needsUpdate) {
      updateUserState(updates);
    }

    // 3. 验证配置一致性
    const validation = logConfigurationStatus();

    // 4. 设置应用元数据
    if (typeof document !== 'undefined') {
      document.title = distributionConfig.appName;
      
      // 设置应用图标（如果有不同版本的图标）
      const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
      if (favicon && distributionConfig.buildType === 'free') {
        // 可以为免费版本设置不同的图标
        // favicon.href = '/favicon-free.ico';
      }
    }

    // 5. 触发配置初始化完成事件
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('configInitialized', {
        detail: {
          distributionConfig,
          userState: getUserState(),
          validation,
        }
      }));
    }

    isInitialized = true;
    console.log('✅ 应用配置初始化完成');

  } catch (error) {
    console.error('❌ 应用配置初始化失败:', error);
    throw error;
  }
};

export const isConfigInitialized = (): boolean => {
  return isInitialized;
};

export const waitForConfigInitialization = (): Promise<void> => {
  if (isInitialized) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const handleConfigInitialized = () => {
      window.removeEventListener('configInitialized', handleConfigInitialized);
      resolve();
    };

    window.addEventListener('configInitialized', handleConfigInitialized);
  });
};