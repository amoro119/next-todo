// components/INPOptimizer.tsx
"use client";

import { useEffect, useRef, useCallback } from 'react';

// INP优化器 - 专门针对Interaction to Next Paint优化
interface QueuedTask {
  owner: object | null;
  task: () => void;
}

class INPOptimizer {
  private interactionQueue: QueuedTask[] = [];
  private isProcessing = false;
  private frameDeadline = 0;
  private pendingRafId: number | null = null;
  // 每个 owner 的 debounce 定时器，cleanup(owner) 时一并取消
  private ownerTimers = new Map<object, Set<ReturnType<typeof setTimeout>>>();
  private readonly TARGET_INP = 200; // 目标INP时间（毫秒）
  private readonly TIME_SLICE = 5; // 每个时间片的长度（毫秒）

  private trackTimer(owner: object | null, timer: ReturnType<typeof setTimeout>) {
    if (!owner) return;
    let timers = this.ownerTimers.get(owner);
    if (!timers) {
      timers = new Set();
      this.ownerTimers.set(owner, timers);
    }
    timers.add(timer);
  }

  private untrackTimer(owner: object | null, timer: ReturnType<typeof setTimeout>) {
    if (!owner) return;
    const timers = this.ownerTimers.get(owner);
    if (timers) {
      timers.delete(timer);
      if (timers.size === 0) this.ownerTimers.delete(owner);
    }
  }

  // 调度交互处理
  scheduleInteraction(
    callback: () => void,
    priority: 'high' | 'normal' | 'low' = 'normal',
    owner: object | null = null
  ) {
    if (priority === 'high') {
      // 高优先级任务立即执行
      this.executeWithTimeSlicing(callback);
    } else {
      // 普通和低优先级任务加入队列
      this.interactionQueue.push({ owner, task: callback });
      this.processQueue();
    }
  }

  private executeWithTimeSlicing(callback: () => void) {
    const startTime = performance.now();
    
    try {
      callback();
    } catch (error) {
      console.error('INP优化器执行错误:', error);
    }
    
    const executionTime = performance.now() - startTime;
    
    // 如果执行时间超过目标，记录警告
    if (executionTime > this.TARGET_INP) {
      console.warn(`交互执行时间过长: ${executionTime.toFixed(2)}ms`);
    }
  }

  private processQueue = () => {
    if (this.isProcessing || this.interactionQueue.length === 0) return;
    
    this.isProcessing = true;
    this.frameDeadline = performance.now() + this.TIME_SLICE;
    
    this.processQueueChunk();
  };

  private processQueueChunk = () => {
    while (this.interactionQueue.length > 0 && performance.now() < this.frameDeadline) {
      const item = this.interactionQueue.shift();
      if (item) {
        this.executeWithTimeSlicing(item.task);
      }
    }

    if (this.interactionQueue.length > 0) {
      // 还有任务，继续在下一帧处理
      this.pendingRafId = requestAnimationFrame(() => {
        this.pendingRafId = null;
        this.frameDeadline = performance.now() + this.TIME_SLICE;
        this.processQueueChunk();
      });
    } else {
      this.isProcessing = false;
    }
  };

  // 批量处理DOM更新
  batchDOMUpdates(updates: Array<() => void>, owner: object | null = null) {
    const batchUpdate = () => {
      updates.forEach(update => {
        try {
          update();
        } catch (error) {
          console.error('批量DOM更新错误:', error);
        }
      });
    };

    this.scheduleInteraction(batchUpdate, 'normal', owner);
  }

  // 优化事件处理器
  optimizeEventHandler<T extends Event>(
    handler: (event: T) => void,
    options: {
      debounce?: number;
      throttle?: number;
      priority?: 'high' | 'normal' | 'low';
    } = {},
    owner: object | null = null
  ) {
    const { debounce, throttle, priority = 'normal' } = options;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastExecution = 0;

    return (event: T) => {
      const now = performance.now();

      // 防抖处理
      if (debounce) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          this.untrackTimer(owner, timeoutId);
        }
        const timer = setTimeout(() => {
          this.untrackTimer(owner, timer);
          timeoutId = null;
          this.scheduleInteraction(() => handler(event), priority, owner);
        }, debounce);
        timeoutId = timer;
        this.trackTimer(owner, timer);
        return;
      }

      // 节流处理
      if (throttle && now - lastExecution < throttle) {
        return;
      }

      lastExecution = now;
      this.scheduleInteraction(() => handler(event), priority, owner);
    };
  }

  // 清理资源：传入 owner 时只移除该消费者的排队任务与 debounce 定时器，
  // 不影响其他仍挂载的组件；队列清空后取消挂起的 rAF，避免帧回调持有闭包
  cleanup(owner?: object) {
    if (owner) {
      this.interactionQueue = this.interactionQueue.filter((item) => item.owner !== owner);
      const timers = this.ownerTimers.get(owner);
      if (timers) {
        timers.forEach(clearTimeout);
        this.ownerTimers.delete(owner);
      }
    } else {
      this.interactionQueue = [];
      this.ownerTimers.forEach((timers) => timers.forEach(clearTimeout));
      this.ownerTimers.clear();
    }
    if (this.interactionQueue.length === 0) {
      if (this.pendingRafId != null) {
        cancelAnimationFrame(this.pendingRafId);
        this.pendingRafId = null;
      }
      this.isProcessing = false;
    }
  }
}

// 全局INP优化器实例
const inpOptimizer = new INPOptimizer();

// React Hook for INP optimization
export function useINPOptimization() {
  const optimizerRef = useRef(inpOptimizer);
  // 每个 hook 实例独立的 owner 令牌，卸载时只清理自己的排队任务
  const ownerRef = useRef<object | null>(null);
  if (ownerRef.current === null) {
    ownerRef.current = {};
  }

  useEffect(() => {
    const optimizer = optimizerRef.current;
    const owner = ownerRef.current;
    return () => {
      optimizer.cleanup(owner ?? undefined);
    };
  }, []);

  const scheduleInteraction = useCallback((
    callback: () => void,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ) => {
    optimizerRef.current.scheduleInteraction(callback, priority, ownerRef.current);
  }, []);

  const batchDOMUpdates = useCallback((updates: Array<() => void>) => {
    optimizerRef.current.batchDOMUpdates(updates, ownerRef.current);
  }, []);

  const optimizeEventHandler = useCallback(<T extends Event>(
    handler: (event: T) => void,
    options: {
      debounce?: number;
      throttle?: number;
      priority?: 'high' | 'normal' | 'low';
    } = {}
  ) => {
    return optimizerRef.current.optimizeEventHandler(handler, options, ownerRef.current);
  }, []);

  return {
    scheduleInteraction,
    batchDOMUpdates,
    optimizeEventHandler
  };
}

// 高性能点击处理器Hook
export function useOptimizedClick<T = HTMLElement>(
  handler: (event: React.MouseEvent<T>) => void,
  options: {
    debounce?: number;
    preventDefault?: boolean;
    stopPropagation?: boolean;
    priority?: 'high' | 'normal' | 'low';
  } = {}
) {
  const { scheduleInteraction } = useINPOptimization();
  const { debounce = 0, preventDefault = false, stopPropagation = false, priority = 'high' } = options;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 卸载时取消挂起的 debounce，避免卸载后仍调度任务
  useEffect(() => () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  return useCallback((event: React.MouseEvent<T>) => {
    if (preventDefault) event.preventDefault();
    if (stopPropagation) event.stopPropagation();

    const executeHandler = () => handler(event);

    if (debounce > 0) {
      // 防抖处理
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        scheduleInteraction(executeHandler, priority);
      }, debounce);
    } else {
      // 立即调度
      scheduleInteraction(executeHandler, priority);
    }
  }, [handler, preventDefault, stopPropagation, debounce, priority, scheduleInteraction]);
}

// 高性能拖拽处理器Hook
export function useOptimizedDrag() {
  const { scheduleInteraction } = useINPOptimization();

  const handleDragStart = useCallback((
    event: React.DragEvent,
    data: unknown,
    options: { priority?: 'high' | 'normal' | 'low' } = {}
  ) => {
    const { priority = 'high' } = options;
    
    scheduleInteraction(() => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/json', JSON.stringify(data));
    }, priority);
  }, [scheduleInteraction]);

  const handleDrop = useCallback(<T,>(
    event: React.DragEvent,
    processor: (data: T) => void,
    options: { priority?: 'high' | 'normal' | 'low' } = {}
  ) => {
    event.preventDefault();
    const { priority = 'normal' } = options;

    scheduleInteraction(() => {
      try {
        const dataString = event.dataTransfer.getData('application/json');
        if (dataString) {
          const data = JSON.parse(dataString) as T;
          processor(data);
        }
      } catch (error) {
        console.error('拖拽数据处理错误:', error);
      }
    }, priority);
  }, [scheduleInteraction]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  return {
    handleDragStart,
    handleDrop,
    handleDragOver
  };
}

// INP性能监控Hook
export function useINPMonitoring(componentName: string) {
  const interactionStartTime = useRef<number>(0);
  const interactionCount = useRef<number>(0);

  const startInteraction = useCallback(() => {
    interactionStartTime.current = performance.now();
    interactionCount.current++;
  }, []);

  const endInteraction = useCallback(() => {
    const duration = performance.now() - interactionStartTime.current;
    
    if (duration > 200) {
      console.warn(`${componentName} INP过长: ${duration.toFixed(2)}ms (交互 #${interactionCount.current})`);
    }
    
    // 在开发环境下记录详细信息
    if (process.env.NODE_ENV === 'development' && duration > 100) {
      console.log(`${componentName} INP: ${duration.toFixed(2)}ms`);
    }
  }, [componentName]);

  return { startInteraction, endInteraction };
}

export { inpOptimizer };
