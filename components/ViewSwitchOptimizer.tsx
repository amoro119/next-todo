// components/ViewSwitchOptimizer.tsx
"use client";

import { useCallback, useRef, useEffect } from 'react';
import { useINPOptimization, useINPMonitoring } from './INPOptimizer';

// 视图切换优化器
class ViewSwitchOptimizer {
  private switchQueue: Array<() => void> = [];
  private isProcessing = false;
  private lastSwitchTime = 0;
  private readonly SWITCH_THROTTLE = 100; // 100ms节流

  // 优化的视图切换调度
  scheduleViewSwitch(switchFn: () => void, priority: 'high' | 'normal' = 'high') {
    const now = performance.now();
    
    // 节流处理，避免频繁切换
    if (now - this.lastSwitchTime < this.SWITCH_THROTTLE) {
      // 清除之前的切换任务
      this.switchQueue = [];
    }
    
    this.switchQueue.push(switchFn);
    this.lastSwitchTime = now;
    
    if (!this.isProcessing) {
      this.processSwitchQueue(priority);
    }
  }

  private processSwitchQueue(priority: 'high' | 'normal') {
    this.isProcessing = true;
    
    const processBatch = () => {
      const startTime = performance.now();
      const timeSlice = priority === 'high' ? 16 : 8; // 高优先级给更多时间
      
      while (this.switchQueue.length > 0 && (performance.now() - startTime) < timeSlice) {
        const switchFn = this.switchQueue.shift();
        if (switchFn) {
          try {
            switchFn();
          } catch (error) {
            console.error('视图切换错误:', error);
          }
        }
      }
      
      if (this.switchQueue.length > 0) {
        // 还有任务，在下一帧继续处理
        requestAnimationFrame(processBatch);
      } else {
        this.isProcessing = false;
      }
    };
    
    // 立即开始处理
    processBatch();
  }

  // 预加载视图数据
  preloadViewData(viewName: string, dataLoader: () => Promise<any>) {
    const cacheKey = `view_${viewName}`;
    
    // 使用requestIdleCallback在空闲时预加载
    if ('requestIdleCallback' in window) {
      requestIdleCallback(async () => {
        try {
          const data = await dataLoader();
          // 简单的内存缓存
          (window as any).__viewCache = (window as any).__viewCache || {};
          (window as any).__viewCache[cacheKey] = {
            data,
            timestamp: Date.now()
          };
        } catch (error) {
          console.warn(`预加载视图 ${viewName} 失败:`, error);
        }
      });
    }
  }

  // 获取预加载的数据
  getPreloadedData(viewName: string, maxAge: number = 30000): any | null {
    const cacheKey = `view_${viewName}`;
    const cache = (window as any).__viewCache?.[cacheKey];
    
    if (cache && (Date.now() - cache.timestamp) < maxAge) {
      return cache.data;
    }
    
    return null;
  }

  // 清理缓存
  clearCache() {
    if ((window as any).__viewCache) {
      (window as any).__viewCache = {};
    }
  }
}

// 全局视图切换优化器实例
const viewSwitchOptimizer = new ViewSwitchOptimizer();

// React Hook for optimized view switching
export function useOptimizedViewSwitch() {
  const { scheduleInteraction } = useINPOptimization();
  const { startInteraction, endInteraction } = useINPMonitoring('ViewSwitch');
  const lastViewRef = useRef<string>('');

  const switchView = useCallback((
    newView: string, 
    switchFn: () => void,
    options: {
      priority?: 'high' | 'normal';
      preload?: boolean;
    } = {}
  ) => {
    const { priority = 'high', preload = false } = options;
    
    startInteraction();
    
    // 如果是相同视图，直接返回
    if (lastViewRef.current === newView) {
      endInteraction();
      return;
    }
    
    const optimizedSwitch = () => {
      try {
        switchFn();
        lastViewRef.current = newView;
        
        // 预加载相关视图
        if (preload) {
          const relatedViews = getRelatedViews(newView);
          relatedViews.forEach(view => {
            viewSwitchOptimizer.preloadViewData(view, () => 
              Promise.resolve({ view, timestamp: Date.now() })
            );
          });
        }
        
        endInteraction();
      } catch (error) {
        console.error('视图切换失败:', error);
        endInteraction();
      }
    };
    
    // 使用视图切换优化器调度
    viewSwitchOptimizer.scheduleViewSwitch(optimizedSwitch, priority);
  }, [scheduleInteraction, startInteraction, endInteraction]);

  const preloadView = useCallback((viewName: string, dataLoader: () => Promise<any>) => {
    viewSwitchOptimizer.preloadViewData(viewName, dataLoader);
  }, []);

  const getPreloadedData = useCallback((viewName: string) => {
    return viewSwitchOptimizer.getPreloadedData(viewName);
  }, []);

  return {
    switchView,
    preloadView,
    getPreloadedData
  };
}

// 获取相关视图（用于预加载）
function getRelatedViews(currentView: string): string[] {
  const viewRelations: Record<string, string[]> = {
    'inbox': ['today', 'completed'],
    'today': ['inbox', 'calendar'],
    'calendar': ['today', 'inbox'],
    'completed': ['inbox', 'today'],
    'recycle': ['inbox']
  };
  
  return viewRelations[currentView] || [];
}

// 高性能视图切换按钮Hook
export function useOptimizedViewButton(
  viewName: string,
  currentView: string,
  onViewChange: (view: string) => void
) {
  const { switchView } = useOptimizedViewSwitch();
  
  const handleClick = useCallback(() => {
    switchView(
      viewName,
      () => onViewChange(viewName),
      { 
        priority: 'high',
        preload: true
      }
    );
  }, [viewName, onViewChange, switchView]);
  
  const isActive = currentView === viewName;
  
  return {
    handleClick,
    isActive,
    className: `view-button ${isActive ? 'active' : ''}`,
    'data-view': viewName
  };
}

// 视图切换性能监控Hook
export function useViewSwitchMonitoring() {
  const metricsRef = useRef<Array<{
    from: string;
    to: string;
    duration: number;
    timestamp: number;
  }>>([]);

  const recordSwitch = useCallback((from: string, to: string, duration: number) => {
    metricsRef.current.push({
      from,
      to,
      duration,
      timestamp: Date.now()
    });

    // 只保留最近50次记录
    if (metricsRef.current.length > 50) {
      metricsRef.current.shift();
    }

    // 在开发环境下记录慢切换
    if (process.env.NODE_ENV === 'development' && duration > 200) {
      console.warn(`视图切换较慢: ${from} → ${to} (${duration.toFixed(2)}ms)`);
    }
  }, []);

  const getAverageSwitchTime = useCallback((fromView?: string, toView?: string) => {
    let relevantMetrics = metricsRef.current;
    
    if (fromView) {
      relevantMetrics = relevantMetrics.filter(m => m.from === fromView);
    }
    
    if (toView) {
      relevantMetrics = relevantMetrics.filter(m => m.to === toView);
    }
    
    if (relevantMetrics.length === 0) return 0;
    
    return relevantMetrics.reduce((sum, m) => sum + m.duration, 0) / relevantMetrics.length;
  }, []);

  return {
    recordSwitch,
    getAverageSwitchTime,
    metrics: metricsRef.current
  };
}

export { viewSwitchOptimizer };