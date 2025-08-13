// components/CalendarPerformanceMonitor.tsx
"use client";

import { useEffect, useRef, useState } from 'react';

interface PerformanceMetrics {
  renderTime: number;
  todoCount: number;
  cacheHitRate: number;
}

class CalendarPerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private renderStartTime = 0;
  private cacheHits = 0;
  private cacheMisses = 0;

  startRender() {
    this.renderStartTime = performance.now();
  }

  endRender(todoCount: number) {
    const renderTime = performance.now() - this.renderStartTime;
    const cacheHitRate = this.cacheHits / (this.cacheHits + this.cacheMisses) || 0;
    
    this.metrics.push({
      renderTime,
      todoCount,
      cacheHitRate
    });

    // 只保留最近50次的指标
    if (this.metrics.length > 50) {
      this.metrics.shift();
    }

    // 在开发环境下输出性能指标
    if (process.env.NODE_ENV === 'development') {
      console.log(`Calendar render: ${renderTime.toFixed(2)}ms, Todos: ${todoCount}, Cache hit rate: ${(cacheHitRate * 100).toFixed(1)}%`);
    }
  }

  recordCacheHit() {
    this.cacheHits++;
  }

  recordCacheMiss() {
    this.cacheMisses++;
  }

  getAverageRenderTime(): number {
    if (this.metrics.length === 0) return 0;
    return this.metrics.reduce((sum, m) => sum + m.renderTime, 0) / this.metrics.length;
  }

  getAverageCacheHitRate(): number {
    if (this.metrics.length === 0) return 0;
    return this.metrics.reduce((sum, m) => sum + m.cacheHitRate, 0) / this.metrics.length;
  }

  reset() {
    this.metrics = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }
}

// 全局性能监控实例
export const calendarPerfMonitor = new CalendarPerformanceMonitor();

// React Hook for performance monitoring
export function useCalendarPerformanceMonitor(todoCount: number) {
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    calendarPerfMonitor.startRender();
    
    // 使用 requestAnimationFrame 来确保在渲染完成后记录时间
    const rafId = requestAnimationFrame(() => {
      calendarPerfMonitor.endRender(todoCount);
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [todoCount]);
}

// 性能指标显示组件（仅在开发环境显示）
export function CalendarPerformanceDisplay() {
  const [metrics, setMetrics] = useState({
    avgRenderTime: 0,
    avgCacheHitRate: 0
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics({
        avgRenderTime: calendarPerfMonitor.getAverageRenderTime(),
        avgCacheHitRate: calendarPerfMonitor.getAverageCacheHitRate()
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: 'rgba(0,0,0,0.8)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      fontSize: '12px',
      zIndex: 9999
    }}>
      <div>平均渲染时间: {metrics.avgRenderTime.toFixed(2)}ms</div>
      <div>缓存命中率: {(metrics.avgCacheHitRate * 100).toFixed(1)}%</div>
    </div>
  );
}