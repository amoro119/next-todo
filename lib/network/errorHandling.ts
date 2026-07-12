// lib/network/errorHandling.ts

/**
 * 检查错误是否为网络相关错误
 */
export const isNetworkError = (error: unknown): boolean => {
  if (!error) return false;

  // 检查常见的网络错误类型
  const networkErrorIndicators = [
    'NETWORK_ERROR',
    'Failed to fetch',
    'NetworkError',
    'ERR_NETWORK',
    'ERR_INTERNET_DISCONNECTED',
    'ERR_CONNECTION_REFUSED',
    'ERR_CONNECTION_TIMED_OUT',
    'ENOTFOUND',
    'ECONNREFUSED',
    'ETIMEDOUT',
  ];

  const errorRecord = typeof error === 'object' && error !== null
    ? error as { message?: unknown; code?: unknown; name?: unknown }
    : undefined;
  const errorMessage = typeof errorRecord?.message === 'string' ? errorRecord.message : String(error);
  const errorCode = typeof errorRecord?.code === 'string' ? errorRecord.code : '';
  const errorName = typeof errorRecord?.name === 'string' ? errorRecord.name : '';

  return networkErrorIndicators.some(indicator => 
    errorMessage.includes(indicator) || 
    errorCode.includes(indicator) || 
    errorName.includes(indicator)
  );
};
