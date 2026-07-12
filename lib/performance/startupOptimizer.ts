// lib/performance/startupOptimizer.ts
/**
 * 启动性能优化工具
 * 通过预加载、缓存和并行处理来加速应用启动
 */

interface StartupMetrics {
  configInit: number;
  dbInit: number;
  syncInit: number;
  totalTime: number;
}

class StartupOptimizer {
  private startTime: number = 0;
  private metrics: Partial<StartupMetrics> = {};
  private preloadPromises: Map<string, Promise<unknown>> = new Map();

  constructor() {
    this.startTime = performance.now();
  }

  /**
   * 预加载关键模块（防重复调用）
   */
  preloadCriticalModules() {
    if (this.preloadPromises.size > 0) {
      console.log('🔄 模块已预加载，跳过重复调用');
      return;
    }
    
    // 预加载同步相关模块
    this.preloadPromises.set('auth', import('../auth'));
    this.preloadPromises.set('syncConfig', import('../config/syncConfig'));
    this.preloadPromises.set('syncErrorHandling', import('../sync/syncErrorHandling'));
    
    // 预加载数据库相关模块
    this.preloadPromises.set('migrations', import('../../db/migrations-client'));
    
    console.log('🚀 预加载关键模块...');
  }

  /**
   * 获取预加载的模块
   */
  async getPreloadedModule<T>(name: string): Promise<T> {
    const promise = this.preloadPromises.get(name);
    if (promise) {
      return promise as T;
    }
    throw new Error(`Module ${name} was not preloaded`);
  }

  /**
   * 记录性能指标
   */
  recordMetric(name: keyof StartupMetrics, startTime: number) {
    this.metrics[name] = performance.now() - startTime;
    console.log(`⏱️ ${name}: ${this.metrics[name]?.toFixed(2)}ms`);
  }

  /**
   * 优化localStorage操作
   */
  batchLocalStorageOperations(operations: Array<{ key: string; value: string | null }>) {
    if (typeof localStorage === 'undefined') return;
    
    // 批量执行localStorage操作，减少DOM访问次数
    operations.forEach(({ key, value }) => {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    });
  }

  /**
   * 检查是否为首次启动
   */
  isFirstLaunch(): boolean {
    if (typeof localStorage === 'undefined') return true;
    return !localStorage.getItem('app_initialized');
  }

  /**
   * 标记应用已初始化
   */
  markAsInitialized() {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('app_initialized', 'true');
    localStorage.setItem('last_startup_time', Date.now().toString());
  }

  /**
   * 获取启动性能报告
   */
  getPerformanceReport(): StartupMetrics & { isFirstLaunch: boolean } {
    const totalTime = performance.now() - this.startTime;
    return {
      configInit: this.metrics.configInit || 0,
      dbInit: this.metrics.dbInit || 0,
      syncInit: this.metrics.syncInit || 0,
      totalTime,
      isFirstLaunch: this.isFirstLaunch(),
    };
  }

  /**
   * 清理预加载缓存
   */
  cleanup() {
    this.preloadPromises.clear();
  }
}

// 全局启动优化器实例
export const startupOptimizer = new StartupOptimizer();

// 防止重复初始化的标志
let isStartupOptimizationInitialized = false;

/**
 * 启动时预加载关键资源（防重复调用）
 */
export function initializeStartupOptimization() {
  if (isStartupOptimizationInitialized) {
    console.log('🔄 启动优化已初始化，跳过重复调用');
    return;
  }

  isStartupOptimizationInitialized = true;
  console.log('🚀 初始化启动优化...');

  // 在应用启动时立即开始预加载
  startupOptimizer.preloadCriticalModules();
}

/**
 * 智能缓存管理
 */
export class SmartCache {
  private cache = new Map<string, { data: unknown; timestamp: number; ttl: number }>();
  
  set(key: string, data: unknown, ttlMs: number = 5 * 60 * 1000) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }
  
  get(key: string): unknown | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }
  
  clear() {
    this.cache.clear();
  }
}

export const smartCache = new SmartCache();
