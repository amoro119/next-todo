// components/InboxPerformanceOptimizer.tsx
"use client";

import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import type { Todo } from '../lib/types';

// 高性能收件箱缓存系统
class InboxCache {
  private filterCache = new Map<string, Todo[]>();
  private sortCache = new Map<string, Todo[]>();
  private dateCache = new Map<string, string>();
  private lastTodosHash = '';
  private lastFilterKey = '';

  // 生成todos哈希用于缓存键
  private generateTodosHash(todos: Todo[]): string {
    let hash = 0;
    const str = `${todos.length}-${todos.map(t => 
      `${t.id}-${t.list_id}-${t.due_date}-${t.repeat}-${t.recurring_parent_id}-${t.deleted}`
    ).join(',')}`;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }

  // 缓存日期转换结果
  getDateString(utcDate: string | null | undefined): string {
    if (!utcDate) return '';
    
    const cached = this.dateCache.get(utcDate);
    if (cached !== undefined) return cached;

    try {
      const date = new Date(utcDate);
      if (isNaN(date.getTime())) {
        const dateOnlyMatch = utcDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateOnlyMatch) {
          this.dateCache.set(utcDate, utcDate);
          return utcDate;
        }
        this.dateCache.set(utcDate, '');
        return '';
      }
      
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit'
      });
      
      const result = formatter.format(date);
      
      // 限制缓存大小
      if (this.dateCache.size > 500) {
        const firstKey = this.dateCache.keys().next().value;
        this.dateCache.delete(firstKey);
      }
      
      this.dateCache.set(utcDate, result);
      return result;
    } catch (e) {
      console.error("Error formatting date:", utcDate, e);
      this.dateCache.set(utcDate, '');
      return '';
    }
  }

  // 获取过滤缓存
  getFilteredTodos(todos: Todo[], currentYear: number): Todo[] | null {
    const todosHash = this.generateTodosHash(todos);
    const filterKey = `${todosHash}-${currentYear}`;
    
    if (filterKey === this.lastFilterKey && todosHash === this.lastTodosHash) {
      return this.filterCache.get(filterKey) || null;
    }
    
    return null;
  }

  // 设置过滤缓存
  setFilteredTodos(todos: Todo[], currentYear: number, result: Todo[]): void {
    const todosHash = this.generateTodosHash(todos);
    const filterKey = `${todosHash}-${currentYear}`;
    
    this.lastTodosHash = todosHash;
    this.lastFilterKey = filterKey;
    
    // 限制缓存大小
    if (this.filterCache.size > 10) {
      const firstKey = this.filterCache.keys().next().value;
      this.filterCache.delete(firstKey);
    }
    
    this.filterCache.set(filterKey, result);
  }

  // 获取排序缓存
  getSortedTodos(todos: Todo[]): Todo[] | null {
    const todosHash = this.generateTodosHash(todos);
    return this.sortCache.get(todosHash) || null;
  }

  // 设置排序缓存
  setSortedTodos(todos: Todo[], result: Todo[]): void {
    const todosHash = this.generateTodosHash(todos);
    
    // 限制缓存大小
    if (this.sortCache.size > 10) {
      const firstKey = this.sortCache.keys().next().value;
      this.sortCache.delete(firstKey);
    }
    
    this.sortCache.set(todosHash, result);
  }

  // 清除所有缓存
  clear(): void {
    this.filterCache.clear();
    this.sortCache.clear();
    this.dateCache.clear();
    this.lastTodosHash = '';
    this.lastFilterKey = '';
  }

  // 智能清除 - 只清除相关缓存
  clearFilterCache(): void {
    this.filterCache.clear();
    this.sortCache.clear();
    this.lastTodosHash = '';
    this.lastFilterKey = '';
  }
}

// 全局缓存实例
const inboxCache = new InboxCache();

// 优化的收件箱过滤函数
export const useOptimizedInboxFilter = () => {
  const currentYearRef = useRef(new Date().getFullYear());
  const endOfYearRef = useRef(new Date(currentYearRef.current, 11, 31, 23, 59, 59, 999));

  const filterInboxTodos = useCallback((todos: Todo[]): Todo[] => {
    // 检查缓存
    const cached = inboxCache.getFilteredTodos(todos, currentYearRef.current);
    if (cached) return cached;

    // 优化的过滤逻辑
    const result = todos.filter((todo: Todo) => {
      // 快速排除已删除的任务
      if (todo.deleted) return false;
      
      // 快速排除重复任务相关
      if (todo.repeat || todo.recurring_parent_id) return false;
      
      // 检查列表ID和到期日期条件
      const hasNoListId = !todo.list_id;
      const hasDueDate = !!todo.due_date;
      
      if (!hasNoListId && !hasDueDate) return false;
      
      // 优化的日期检查
      if (hasDueDate) {
        const dueDate = new Date(todo.due_date!);
        if (dueDate > endOfYearRef.current) return false;
      }
      
      return true;
    });

    // 缓存结果
    inboxCache.setFilteredTodos(todos, currentYearRef.current, result);
    return result;
  }, []);

  return { filterInboxTodos, utcToLocalDateString: inboxCache.getDateString.bind(inboxCache) };
};

// 优化的收件箱排序函数
export const useOptimizedInboxSort = () => {
  const sortInboxTodos = useCallback((todos: Todo[]): Todo[] => {
    // 检查缓存
    const cached = inboxCache.getSortedTodos(todos);
    if (cached) return cached;

    // 优化的排序算法
    const result = [...todos].sort((a, b) => {
      const aHasDueDate = !!a.due_date;
      const bHasDueDate = !!b.due_date;
      
      // 使用位运算优化比较
      if (!aHasDueDate && bHasDueDate) return -1;
      if (aHasDueDate && !bHasDueDate) return 1;
      
      if (aHasDueDate && bHasDueDate) {
        // 预计算时间戳避免重复创建Date对象
        const aTime = new Date(a.due_date!).getTime();
        const bTime = new Date(b.due_date!).getTime();
        return bTime - aTime;
      }
      
      return 0;
    });

    // 缓存结果
    inboxCache.setSortedTodos(todos, result);
    return result;
  }, []);

  return { sortInboxTodos };
};

// 收件箱计数优化Hook
export const useOptimizedInboxCount = (todos: Todo[]) => {
  const { filterInboxTodos } = useOptimizedInboxFilter();
  
  const inboxCount = useMemo(() => {
    const uncompletedTodos = todos.filter(t => !t.completed && !t.deleted);
    return filterInboxTodos(uncompletedTodos).length;
  }, [todos, filterInboxTodos]);

  return inboxCount;
};

// 性能监控
class InboxPerformanceMonitor {
  private metrics: Array<{
    operation: string;
    duration: number;
    todoCount: number;
    timestamp: number;
  }> = [];

  startOperation(operation: string): () => void {
    const startTime = performance.now();
    
    return (todoCount: number = 0) => {
      const duration = performance.now() - startTime;
      
      this.metrics.push({
        operation,
        duration,
        todoCount,
        timestamp: Date.now()
      });

      // 只保留最近50次记录
      if (this.metrics.length > 50) {
        this.metrics.shift();
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`Inbox ${operation}: ${duration.toFixed(2)}ms (${todoCount} todos)`);
      }
    };
  }

  getAverageTime(operation: string): number {
    const operationMetrics = this.metrics.filter(m => m.operation === operation);
    if (operationMetrics.length === 0) return 0;
    
    return operationMetrics.reduce((sum, m) => sum + m.duration, 0) / operationMetrics.length;
  }

  getMetrics() {
    return {
      filterAvg: this.getAverageTime('filter'),
      sortAvg: this.getAverageTime('sort'),
      totalOperations: this.metrics.length
    };
  }

  reset() {
    this.metrics = [];
  }
}

export const inboxPerfMonitor = new InboxPerformanceMonitor();

// 清理缓存的Hook
export const useInboxCacheCleanup = () => {
  const clearCache = useCallback(() => {
    inboxCache.clear();
  }, []);

  const clearFilterCache = useCallback(() => {
    inboxCache.clearFilterCache();
  }, []);

  return { clearCache, clearFilterCache };
};

// 性能指标显示组件（仅开发环境显示）
export function InboxPerformanceDisplay() {
  const [metrics, setMetrics] = useState({
    filterAvg: 0,
    sortAvg: 0,
    totalOperations: 0
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(inboxPerfMonitor.getMetrics());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: '60px',
      right: '10px',
      background: 'rgba(0,0,0,0.8)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      fontSize: '12px',
      zIndex: 9998
    }}>
      <div>收件箱性能监控</div>
      <div>过滤平均: {metrics.filterAvg.toFixed(2)}ms</div>
      <div>排序平均: {metrics.sortAvg.toFixed(2)}ms</div>
      <div>总操作数: {metrics.totalOperations}</div>
    </div>
  );
}

export { inboxCache };