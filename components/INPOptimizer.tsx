// components/INPOptimizer.tsx
"use client";

import { useEffect, useRef, useCallback } from 'react';

// INP优化器 - 专门针对Interaction to Next Paint优化
class INPOptimizer {
  private interactionQueue: Array<() => void> = [];
  private isProcessing = false;
  private frameDeadline = 0;
  private readonly TARGET_INP = 200; // 目标INP时间（毫秒）
  private readonly TIME_SLICE = 5; // 每个时间片的长度（毫秒）

  // 调度交互处理
  scheduleInteraction(callback: () => void, priority: 'high' | 'normal' | 'low' = 'normal') {
    if (priority === 'high') {
      // 高优先级任务立即执行
      this.executeWithTimeSlicing(callback);
    } else {
      // 普通和低优先级任务加入队列
      this.interactionQueue.push(callback);
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
      const task = this.interactionQueue.shift();
      if (task) {
        this.executeWithTimeSlicing(task);
      }
    }

    if (this.interactionQueue.length > 0) {
      // 还有任务，继续在下一帧处理
      requestAnimationFrame(() => {
        this.frameDeadline = performance.now() + this.TIME_SLICE;
        this.processQueueChunk();
      });
    } else {
      this.isProcessing = false;
    }
  };

  // 批量处理DOM更新
  batchDOMUpdates(updates: Array<() => void>) {
    const batchUpdate = () => {
      updates.forEach(update => {
        try {
          update();
        } catch (error) {
          console.error('批量DOM更新错误:', error);
        }
      });
    };

    this.scheduleInteraction(batchUpdate, 'normal');
  }

  // 优化事件处理器
  optimizeEventHandler<T extends Event>(
    handler: (event: T) => void,
    options: { 
      debounce?: number;
      throttle?: number;
      priority?: 'high' | 'normal' | 'low';
    } = {}
  ) {
    const { debounce, throttle, priority = 'normal' } = options;
    let timeoutId: NodeJS.Timeout | null = null;
    let lastExecution = 0;

    return (event: T) => {
      const now = performance.now();
      
      // 防抖处理
      if (debounce) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          this.scheduleInteraction(() => handler(event), priority);
        }, debounce);
        return;
      }

      // 节流处理
      if (throttle && now - lastExecution < throttle) {
        return;
      }

      lastExecution = now;
      this.scheduleInteraction(() => handler(event), priority);
    };
  }

  // 清理资源
  cleanup() {
    this.interactionQueue = [];
    this.isProcessing = false;
  }
}

// 全局INP优化器实例
const inpOptimizer = new INPOptimizer();

// React Hook for INP optimization
export function useINPOptimization() {
  const optimizerRef = useRef(inpOptimizer);

  useEffect(() => {
    return () => {
      optimizerRef.current.cleanup();
    };
  }, []);

  const scheduleInteraction = useCallback((
    callback: () => void, 
    priority: 'high' | 'normal' | 'low' = 'normal'
  ) => {
    optimizerRef.current.scheduleInteraction(callback, priority);
  }, []);

  const batchDOMUpdates = useCallback((updates: Array<() => void>) => {
    optimizerRef.current.batchDOMUpdates(updates);
  }, []);

  const optimizeEventHandler = useCallback(<T extends Event>(
    handler: (event: T) => void,
    options: { 
      debounce?: number;
      throttle?: number;
      priority?: 'high' | 'normal' | 'low';
    } = {}
  ) => {
    return optimizerRef.current.optimizeEventHandler(handler, options);
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

  return useCallback((event: React.MouseEvent<T>) => {
    if (preventDefault) event.preventDefault();
    if (stopPropagation) event.stopPropagation();

    const executeHandler = () => handler(event);

    if (debounce > 0) {
      // 防抖处理
      const timeoutId = setTimeout(() => {
        scheduleInteraction(executeHandler, priority);
      }, debounce);
      
      // 清理函数
      return () => clearTimeout(timeoutId);
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
    data: any,
    options: { priority?: 'high' | 'normal' | 'low' } = {}
  ) => {
    const { priority = 'high' } = options;
    
    scheduleInteraction(() => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/json', JSON.stringify(data));
    }, priority);
  }, [scheduleInteraction]);

  const handleDrop = useCallback((
    event: React.DragEvent,
    processor: (data: any) => void,
    options: { priority?: 'high' | 'normal' | 'low' } = {}
  ) => {
    event.preventDefault();
    const { priority = 'normal' } = options;

    scheduleInteraction(() => {
      try {
        const dataString = event.dataTransfer.getData('application/json');
        if (dataString) {
          const data = JSON.parse(dataString);
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