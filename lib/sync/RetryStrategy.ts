// lib/sync/RetryStrategy.ts
import { RetryConfig } from './types';

/**
 * 重试策略接口
 */
export interface RetryStrategy {
  /**
   * 判断是否应该重试
   * @param error 错误对象
   * @param retryCount 当前重试次数
   * @returns 是否应该重试
   */
  shouldRetry(error: unknown, retryCount: number): boolean;
  
  /**
   * 计算下一次重试的延迟时间
   * @param retryCount 当前重试次数
   * @returns 延迟时间（毫秒）
   */
  getNextDelay(retryCount: number): number;
}

/**
 * 指数退避重试策略
 * 随着重试次数增加，延迟时间呈指数增长
 */
export class ExponentialBackoffStrategy implements RetryStrategy {
  constructor(private config: RetryConfig) {}
  
  shouldRetry(error: unknown, retryCount: number): boolean {
    if (retryCount >= this.config.maxRetries) {
      return false;
    }
    
    if (!(error instanceof Error)) {
      return false;
    }
    
    const errorMessage = error.message.toLowerCase();
    
    return this.config.retryableErrors.some(retryableError => 
      errorMessage.includes(retryableError.toLowerCase())
    ) || 
    errorMessage.includes('network') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('connection') ||
    errorMessage.includes('fetch');
  }
  
  getNextDelay(retryCount: number): number {
    // 指数退避算法: baseDelay * (backoffMultiplier ^ retryCount)
    const delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, retryCount);
    
    // 添加随机抖动，避免多个请求同时重试
    const jitter = Math.random() * 0.3 + 0.85; // 0.85-1.15 之间的随机数
    
    // 确保不超过最大延迟
    return Math.min(delay * jitter, this.config.maxDelay);
  }
}