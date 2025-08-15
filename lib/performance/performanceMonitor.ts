// lib/performance/performanceMonitor.ts
/**
 * 性能监控工具
 * 用于监控和分析应用性能瓶颈
 */

interface PerformanceEntry {
  name: string;
  startTime: number;
  duration: number;
  metadata?: Record<string, any>;
}

class PerformanceMonitor {
  private entries: PerformanceEntry[] = [];
  private activeTimers: Map<string, number> = new Map();
  private maxEntries = 100; // 限制内存使用

  /**
   * 开始性能计时
   */
  start(name: string, metadata?: Record<string, any>): void {
    this.activeTimers.set(name, performance.now());
    if (metadata) {
      this.activeTimers.set(`${name}_metadata`, metadata as any);
    }
  }

  /**
   * 结束性能计时并记录
   */
  end(name: string): number {
    const startTime = this.activeTimers.get(name);
    if (!startTime) {
      console.warn(`Performance timer '${name}' was not started`);
      return 0;
    }

    const endTime = performance.now();
    const duration = endTime - startTime;
    const metadata = this.activeTimers.get(`${name}_metadata`) as Record<string, any>;

    // 记录性能条目
    this.entries.push({
      name,
      startTime,
      duration,
      metadata,
    });

    // 清理
    this.activeTimers.delete(name);
    this.activeTimers.delete(`${name}_metadata`);

    // 限制条目数量
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    console.log(`⏱️ ${name}: ${duration.toFixed(2)}ms`);
    return duration;
  }

  /**
   * 获取性能统计
   */
  getStats(name?: string): {
    count: number;
    totalTime: number;
    averageTime: number;
    minTime: number;
    maxTime: number;
  } {
    const filteredEntries = name 
      ? this.entries.filter(entry => entry.name === name)
      : this.entries;

    if (filteredEntries.length === 0) {
      return {
        count: 0,
        totalTime: 0,
        averageTime: 0,
        minTime: 0,
        maxTime: 0,
      };
    }

    const durations = filteredEntries.map(entry => entry.duration);
    const totalTime = durations.reduce((sum, duration) => sum + duration, 0);

    return {
      count: filteredEntries.length,
      totalTime,
      averageTime: totalTime / filteredEntries.length,
      minTime: Math.min(...durations),
      maxTime: Math.max(...durations),
    };
  }

  /**
   * 获取性能报告
   */
  getReport(): string {
    const report = ['📊 性能监控报告', '='.repeat(50)];
    
    const uniqueNames = [...new Set(this.entries.map(entry => entry.name))];
    
    uniqueNames.forEach(name => {
      const stats = this.getStats(name);
      report.push(
        `${name}:`,
        `  调用次数: ${stats.count}`,
        `  总时间: ${stats.totalTime.toFixed(2)}ms`,
        `  平均时间: ${stats.averageTime.toFixed(2)}ms`,
        `  最短时间: ${stats.minTime.toFixed(2)}ms`,
        `  最长时间: ${stats.maxTime.toFixed(2)}ms`,
        ''
      );
    });

    return report.join('\n');
  }

  /**
   * 清理性能数据
   */
  clear(): void {
    this.entries = [];
    this.activeTimers.clear();
  }

  /**
   * 检测性能瓶颈
   */
  detectBottlenecks(thresholdMs: number = 1000): PerformanceEntry[] {
    return this.entries.filter(entry => entry.duration > thresholdMs);
  }

  /**
   * 导出性能数据
   */
  export(): PerformanceEntry[] {
    return [...this.entries];
  }
}

// 全局性能监控器实例
export const performanceMonitor = new PerformanceMonitor();

/**
 * 性能装饰器
 */
export function measurePerformance(name?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const measureName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      performanceMonitor.start(measureName, { args: args.length });
      try {
        const result = await originalMethod.apply(this, args);
        performanceMonitor.end(measureName);
        return result;
      } catch (error) {
        performanceMonitor.end(measureName);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * 简单的性能测量函数
 */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  performanceMonitor.start(name, metadata);
  try {
    const result = await fn();
    performanceMonitor.end(name);
    return result;
  } catch (error) {
    performanceMonitor.end(name);
    throw error;
  }
}

/**
 * 同步性能测量函数
 */
export function measure<T>(
  name: string,
  fn: () => T,
  metadata?: Record<string, any>
): T {
  performanceMonitor.start(name, metadata);
  try {
    const result = fn();
    performanceMonitor.end(name);
    return result;
  } catch (error) {
    performanceMonitor.end(name);
    throw error;
  }
}

/**
 * Web Vitals 监控
 */
export function initWebVitalsMonitoring() {
  if (typeof window === 'undefined') return;

  // 监控 Largest Contentful Paint (LCP)
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          if (entry.entryType === 'largest-contentful-paint') {
            console.log(`🎯 LCP: ${entry.startTime.toFixed(2)}ms`);
          }
        });
      });
      observer.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (error) {
      console.warn('无法监控 LCP:', error);
    }
  }

  // 监控 First Input Delay (FID)
  if ('addEventListener' in window) {
    let firstInputDelay: number | null = null;
    
    const measureFID = (event: Event) => {
      if (firstInputDelay === null) {
        firstInputDelay = performance.now() - (event as any).timeStamp;
        console.log(`🎯 FID: ${firstInputDelay.toFixed(2)}ms`);
      }
    };

    ['mousedown', 'keydown', 'touchstart', 'pointerdown'].forEach(type => {
      window.addEventListener(type, measureFID, { once: true, passive: true });
    });
  }
}