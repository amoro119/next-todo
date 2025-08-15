// lib/config/initConfig.ts
import { loadDistributionConfig, getDistributionConfig } from './distributionConfig';
import { getUserState, updateUserState } from '../user/userState';
import { logConfigurationStatus } from './configValidator';
import { trackCall } from '../debug/initializationTracker';

let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

export const initializeAppConfig = async (): Promise<void> => {
  if (isInitialized) {
    console.log('🔄 应用配置已初始化，跳过重复调用');
    return;
  }

  if (initializationPromise) {
    console.log('🔄 应用配置正在初始化中，等待完成...');
    return initializationPromise;
  }

  console.log('🚀 初始化应用配置...');
  trackCall('initializeAppConfig');

  initializationPromise = (async () => {

  try {
    // 优化：并行执行配置加载和用户状态检查
    const [distributionConfig] = await Promise.all([
      loadDistributionConfig().then(() => getDistributionConfig()),
      // 可以在这里添加其他并行初始化任务
    ]);
    
    console.log(`📦 已加载 ${distributionConfig.buildType} 版本配置`);

    // 优化：批量处理localStorage操作
    const updates: Partial<ReturnType<typeof getUserState>> = {};
    let needsUpdate = false;

    if (typeof localStorage !== 'undefined') {
      // 开发环境下，清除可能冲突的localStorage值
      if (process.env.NODE_ENV === 'development') {
        const currentSubscription = localStorage.getItem('user_subscription');
        if (currentSubscription && currentSubscription !== distributionConfig.defaultSubscription) {
          console.log(`🧹 开发环境：清除冲突的用户订阅状态`);
          localStorage.removeItem('user_subscription');
          localStorage.removeItem('sync_enabled');
        }
      }
    }

    // 检查并初始化用户状态
    const userState = getUserState();

    // 确保用户订阅状态与分发配置一致
    if (userState.subscription !== distributionConfig.defaultSubscription) {
      updates.subscription = distributionConfig.defaultSubscription;
      needsUpdate = true;
    }

    // 根据分发配置调整同步设置
    if (distributionConfig.buildType === 'free' && userState.syncEnabled) {
      updates.syncEnabled = false;
      needsUpdate = true;
    }

    if (needsUpdate) {
      updateUserState(updates);
    }

    // 优化：延迟非关键操作
    requestIdleCallback(() => {
      // 验证配置一致性
      logConfigurationStatus();

      // 设置应用元数据
      if (typeof document !== 'undefined') {
        document.title = distributionConfig.appName;
      }

      // 触发配置初始化完成事件
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('configInitialized', {
          detail: {
            distributionConfig,
            userState: getUserState(),
          }
        }));
      }
    });

    isInitialized = true;
    console.log('✅ 应用配置初始化完成');

  } catch (error) {
    console.error('❌ 应用配置初始化失败:', error);
    // 重置状态以允许重试
    initializationPromise = null;
    throw error;
  }
  })();

  return initializationPromise;
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