// lib/sync/syncErrorHandling.ts
import { isNetworkError } from '../network/errorHandling';

export interface SyncErrorResult {
  type: 'network' | 'auth' | 'config' | 'unknown';
  message: string;
  canRetry: boolean;
  shouldDisableSync: boolean;
}

export const handleSyncStartupError = (error: Error): SyncErrorResult => {
  const errorMessage = error.message || error.toString();

  // 网络错误
  if (isNetworkError(error)) {
    return {
      type: 'network',
      message: '网络连接问题，数据仅保存在本地',
      canRetry: true,
      shouldDisableSync: false, // 不禁用同步设置
    };
  }

  // 认证错误
  if (errorMessage.includes('认证失败') || 
      errorMessage.includes('认证令牌') ||
      errorMessage.includes('Authentication') ||
      errorMessage.includes('Unauthorized')) {
    return {
      type: 'auth',
      message: '认证失败，无法同步数据',
      canRetry: false,
      shouldDisableSync: false, // 不禁用同步设置，可能是临时的认证问题
    };
  }

  // 配置错误
  if (errorMessage.includes('ELECTRIC_PROXY_URL') ||
      errorMessage.includes('配置') ||
      errorMessage.includes('环境变量')) {
    return {
      type: 'config',
      message: '同步配置错误',
      canRetry: false,
      shouldDisableSync: false,
    };
  }

  // 未知错误
  return {
    type: 'unknown',
    message: '同步失败，但应用仍可使用',
    canRetry: false,
    shouldDisableSync: false,
  };
};

export const getSyncStatusFromError = (errorResult: SyncErrorResult): 'error' | 'done' => {
  // 网络错误不算真正的错误，只是暂时无法同步
  if (errorResult.type === 'network') {
    return 'done';
  }
  
  // 其他错误类型返回错误状态
  return 'error';
};