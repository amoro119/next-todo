// components/PerformanceOptimizer.tsx
"use client";

import { useCallback, useEffect, useRef, useMemo } from 'react';
import type { Todo } from '../lib/types';

// 高性能时间切片调度器
class TimeSliceScheduler {
  private tasks: Array<() => void> = [];
  private isRunning = false;
  private frameDeadline = 0;

  schedule(task: () => void) {
    this.tasks.push(task);
    if (!this.isRunning) {
      this.runTasks();
    }
  }

  private runTasks = () => {
    this.isRunning = true;
    this.frameDeadline = performance.now() + 5; // 5ms时间片

    while (this.tasks.length > 0 && performance.now() < this.frameDeadline) {
      const task = this.tasks.shift();
      task?.();
    }

    if (this.tasks.length > 0) {
      requestIdleCallback(this.runTasks, { timeout: 16 });
    } else {
      this.isRunning = false;
    }
  };
}

// 全局调度器实例
const scheduler = new TimeSliceScheduler();

// 高性能缓存系统 - 使用WeakMap避免内存泄漏
class AdvancedCache {
  private cache = new Map<string, any>();
  private weakCache = new WeakMap<object, Map<string, any>>();
  private hitCount = 0;
  private missCount = 0;
  private maxSize = 100;

  get<T>(key: string, context?: object): T | undefined {
    let result: T | undefined;
    
    if (context) {
      const contextCache = this.weakCache.get(context);
      result = contextCache?.get(key);
    } else {
      result = this.cache.get(key);
    }

    if (result !== undefined) {
      this.hitCount++;
      return result;
    }

    this.missCount++;
    return undefined;
  }

  set<T>(key: string, value: T, context?: object): void {
    if (context) {
      let contextCache = this.weakCache.get(context);
      if (!contextCache) {
        contextCache = new Map();
        this.weakCache.set(context, contextCache);
      }
      contextCache.set(key, value);
    } else {
      if (this.cache.size >= this.maxSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(key, value);
    }
  }

  getHitRate(): number {
    const total = this.hitCount + this.missCount;
    return total > 0 ? this.hitCount / total : 0;
  }

  clear(): void {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }
}

// 全局缓存实例
const advancedCache = new AdvancedCache();

// 批量DOM更新优化器
class BatchDOMUpdater {
  private updates: Array<() => void> = [];
  private scheduled = false;

  schedule(update: () => void) {
    this.updates.push(update);
    if (!this.scheduled) {
      this.scheduled = true;
      requestAnimationFrame(() => {
        const batch = this.updates.splice(0);
        batch.forEach(update => update());
        this.scheduled = false;
      });
    }
  }
}

const domUpdater = new BatchDOMUpdater();

// 高性能数据处理Hook
export function useOptimizedDataProcessing<T, R>(
  data: T[],
  processor: (data: T[]) => R,
  dependencies: any[] = []
): R {
  const cacheKey = useMemo(() => 
    `${data.length}-${JSON.stringify(dependencies)}`, 
    [data.length, ...dependencies]
  );

  return useMemo(() => {
    const cached = advancedCache.get<R>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const result = processor(data);
    advancedCache.set(cacheKey, result);
    return result;
  }, [data, cacheKey, processor]);
}

// 虚拟化列表Hook
export function useVirtualizedList<T>(
  items: T[],
  containerHeight: number,
  itemHeight: number,
  overscan: number = 5
) {
  const scrollTop = useRef(0);
  
  return useMemo(() => {
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const startIndex = Math.max(0, Math.floor(scrollTop.current / itemHeight) - overscan);
    const endIndex = Math.min(items.length - 1, startIndex + visibleCount + overscan * 2);
    
    return {
      visibleItems: items.slice(startIndex, endIndex + 1),
      startIndex,
      endIndex,
      totalHeight: items.length * itemHeight,
      offsetY: startIndex * itemHeight
    };
  }, [items, containerHeight, itemHeight, overscan]);
}

// 防抖Hook优化
export function useOptimizedDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const callbackRef = useRef(callback);
  
  // 更新回调引用但不触发重新创建
  useEffect(() => {
    callbackRef.current = callback;
  });

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }, [delay]) as T;
}

// 智能重渲染控制Hook
export function useSmartRerender(dependencies: any[], threshold: number = 100) {
  const lastRenderTime = useRef(0);
  const pendingUpdate = useRef(false);
  
  return useCallback(() => {
    const now = performance.now();
    
    if (now - lastRenderTime.current < threshold && !pendingUpdate.current) {
      pendingUpdate.current = true;
      scheduler.schedule(() => {
        pendingUpdate.current = false;
        lastRenderTime.current = performance.now();
      });
      return false; // 延迟渲染
    }
    
    lastRenderTime.current = now;
    return true; // 立即渲染
  }, dependencies);
}

// 内存优化的事件处理器工厂
export function useEventHandlerFactory<T>() {
  const handlersCache = useRef(new Map<string, (item: T) => void>());
  
  return useCallback((key: string, handler: (item: T) => void) => {
    if (!handlersCache.current.has(key)) {
      handlersCache.current.set(key, handler);
    }
    return handlersCache.current.get(key)!;
  }, []);
}

// 性能监控Hook
export function usePerformanceMonitor(componentName: string) {
  const renderStart = useRef(0);
  const renderCount = useRef(0);
  
  useEffect(() => {
    renderStart.current = performance.now();
    renderCount.current++;
    
    return () => {
      const renderTime = performance.now() - renderStart.current;
      if (renderTime > 16) { // 超过一帧的时间
        console.warn(`${componentName} render took ${renderTime.toFixed(2)}ms (render #${renderCount.current})`);
      }
    };
  });
}

// 导出工具函数
export { scheduler, advancedCache, domUpdater };