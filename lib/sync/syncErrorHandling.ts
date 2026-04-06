// lib/sync/syncErrorHandling.ts
import { isNetworkError } from '../network/errorHandling';

export interface SyncErrorResult {
  type: 'network' | 'auth' | 'config' | 'service-unavailable' | 'unknown';
  message: string;
  canRetry: boolean;
  shouldDisableSync: boolean;
  retryDelay?: number; // 建议的重试延迟（毫秒）
}

/**
 * 清除所有与ElectricSQL同步相关的localStorage状态
 * 用于处理503等需要重新开始同步的错误
 */
export function clearSyncStateFromStorage(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  
  try {
    const keysToRemove: string[] = [];
    
    // 收集所有与同步相关的localStorage键
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('global_last_seen_lsn:') ||
        key.startsWith('last_sync_hash:') ||
        key.startsWith('electric:') ||
        key.startsWith('shape:') ||
        key === 'syncStatus'
      )) {
        keysToRemove.push(key);
      }
    }
    
    // 删除收集到的键
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`[SyncState] 清除localStorage键: ${key}`);
    });
    
    console.log(`[SyncState] 已清除 ${keysToRemove.length} 个同步状态键`);
  } catch (error) {
    console.error('[SyncState] 清除同步状态时出错:', error);
  }
}

/**
 * 检查错误是否为503服务不可用错误
 */
function isServiceUnavailableError(error: Error): boolean {
  const errorMessage = error.message || error.toString();
  return (
    errorMessage.includes('503') ||
    errorMessage.includes('Service Unavailable') ||
    errorMessage.includes('service unavailable') ||
    errorMessage.includes('Bad Gateway') ||
    errorMessage.includes('502')
  );
}

/**
 * 检查错误是否与shape handle相关（过期或无效）
 */
function isShapeHandleError(error: Error): boolean {
  const errorMessage = error.message || error.toString();
  return (
    errorMessage.includes('handle') ||
    errorMessage.includes('offset') ||
    errorMessage.includes('shape') ||
    errorMessage.includes('must-refetch')
  );
}

export const handleSyncStartupError = (error: Error): SyncErrorResult => {
  const errorMessage = error.message || error.toString();

  // 503服务不可用错误（长时间未使用后常见）
  if (isServiceUnavailableError(error)) {
    return {
      type: 'service-unavailable',
      message: '同步服务暂时不可用，正在尝试重新连接...',
      canRetry: true,
      shouldDisableSync: false,
      retryDelay: 2000, // 2秒后重试
    };
  }

  // 网络错误
  if (isNetworkError(error)) {
    return {
      type: 'network',
      message: '网络连接问题，数据仅保存在本地',
      canRetry: true,
      shouldDisableSync: false,
      retryDelay: 5000, // 5秒后重试
    };
  }

  // 认证错误
  if (errorMessage.includes('认证失败') || 
      errorMessage.includes('认证令牌') ||
      errorMessage.includes('Authentication') ||
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('401')) {
    return {
      type: 'auth',
      message: '认证失败，无法同步数据',
      canRetry: true, // 认证错误也可以重试（刷新token后）
      shouldDisableSync: false,
      retryDelay: 1000,
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
  // 网络错误和服务不可用错误不算真正的错误，只是暂时无法同步
  if (errorResult.type === 'network' || errorResult.type === 'service-unavailable') {
    return 'done';
  }
  
  // 其他错误类型返回错误状态
  return 'error';
};

/**
 * 计算指数退避延迟
 * @param attempt 当前尝试次数（从0开始）
 * @param baseDelay 基础延迟（毫秒）
 * @param maxDelay 最大延迟（毫秒）
 * @returns 计算后的延迟时间
 */
export function calculateBackoffDelay(
  attempt: number, 
  baseDelay: number = 1000, 
  maxDelay: number = 30000
): number {
  // 指数退避: baseDelay * 2^attempt + 随机抖动
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 1000; // 0-1000ms的随机抖动
  const delay = Math.min(exponentialDelay + jitter, maxDelay);
  return Math.floor(delay);
}

/**
 * 检查是否应该清除同步状态后重试
 */
export function shouldClearStateBeforeRetry(errorResult: SyncErrorResult): boolean {
  return errorResult.type === 'service-unavailable' || errorResult.type === 'auth';
}
