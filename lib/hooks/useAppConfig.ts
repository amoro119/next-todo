// lib/hooks/useAppConfig.ts
import { useState, useEffect } from 'react';
import { getUserState, getSyncConfig, networkStatusManager, type UserState, type SyncConfig } from '../config';

export interface AppConfig {
  user: UserState;
  sync: SyncConfig;
  isOnline: boolean;
}

export const useAppConfig = (): AppConfig => {
  const [config, setConfig] = useState<AppConfig>(() => ({
    user: getUserState(),
    sync: getSyncConfig(),
    isOnline: networkStatusManager.isOnline(),
  }));

  useEffect(() => {
    const updateConfig = () => {
      setConfig({
        user: getUserState(),
        sync: getSyncConfig(),
        isOnline: networkStatusManager.isOnline(),
      });
    };

    // 监听用户状态变化
    const handleUserStateChange = () => updateConfig();
    window.addEventListener('userStateChanged', handleUserStateChange);

    // 监听同步配置变化
    const handleSyncConfigChange = () => updateConfig();
    window.addEventListener('syncConfigChanged', handleSyncConfigChange);

    // 使用现有的网络状态监控系统
    networkStatusManager.onNetworkChange(() => updateConfig());

    return () => {
      window.removeEventListener('userStateChanged', handleUserStateChange);
      window.removeEventListener('syncConfigChanged', handleSyncConfigChange);
      // 注意：networkStatusManager 的监听器会在组件卸载时自动清理
    };
  }, []);

  return config;
};

// 便捷的单独 hooks
export const useUserState = (): UserState => {
  const { user } = useAppConfig();
  return user;
};

export const useSyncConfig = (): SyncConfig => {
  const { sync } = useAppConfig();
  return sync;
};

export const useIsOnline = (): boolean => {
  const { isOnline } = useAppConfig();
  return isOnline;
};