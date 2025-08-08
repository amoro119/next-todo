// lib/search/searchService.ts
import type { Todo } from '../types';
import { getDbWrapper } from '../sync/initOfflineSync';

export interface SearchOptions {
  fields: ('title' | 'content' | 'tags')[];
  includeCompleted: boolean;
  includeDeleted: boolean;
  limit?: number;
  forceRefresh?: boolean; // 强制刷新，跳过缓存
}

export interface SearchResult {
  todos: Todo[];
  query: string;
  executionTime: number;
  totalMatches: number;
}

/**
 * 搜索任务服务类
 */
export class TaskSearchService {
  private static instance: TaskSearchService;
  private searchCache = new Map<string, { result: SearchResult; timestamp: number }>();
  private queryCache = new Map<string, { sql: string; params: unknown[]; timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存
  private readonly QUERY_CACHE_DURATION = 10 * 60 * 1000; // 10分钟查询缓存
  private readonly DEFAULT_LIMIT = 50;
  private readonly MAX_CACHE_SIZE = 100;
  private searchAbortController: AbortController | null = null;

  private constructor() {}

  static getInstance(): TaskSearchService {
    if (!TaskSearchService.instance) {
      TaskSearchService.instance = new TaskSearchService();
    }
    return TaskSearchService.instance;
  }

  /**
   * 搜索任务
   * @param query 搜索查询字符串
   * @param options 搜索选项
   * @returns 搜索结果
   */
  async searchTodos(query: string, options?: Partial<SearchOptions>): Promise<SearchResult> {
    const startTime = Date.now();
    
    // 如果查询为空，返回空结果
    if (!query.trim()) {
      return {
        todos: [],
        query: query.trim(),
        executionTime: Date.now() - startTime,
        totalMatches: 0
      };
    }

    // 取消之前的搜索请求
    if (this.searchAbortController) {
      this.searchAbortController.abort();
    }
    this.searchAbortController = new AbortController();

    // 检查缓存（除非强制刷新）
    const cacheKey = this.generateCacheKey(query, options);
    const cachedEntry = this.searchCache.get(cacheKey);
    if (!options?.forceRefresh && cachedEntry && Date.now() - cachedEntry.timestamp < this.CACHE_DURATION) {
      return {
        ...cachedEntry.result,
        executionTime: Date.now() - startTime
      };
    }

    try {
      const dbWrapper = getDbWrapper();
      if (!dbWrapper) {
        throw new Error('Database not initialized');
      }

      const searchOptions = this.normalizeSearchOptions(options);
      const { sql, params } = this.buildSearchQueryWithCache(query, searchOptions);
      
      // 检查是否被取消
      if (this.searchAbortController?.signal.aborted) {
        throw new Error('Search cancelled');
      }
      
      const result = await dbWrapper.raw.query(sql, params);
      const todos = result.rows.map((raw: any) => this.normalizeTodo(raw));
      
      const searchResult: SearchResult = {
        todos,
        query: query.trim(),
        executionTime: Date.now() - startTime,
        totalMatches: todos.length
      };

      // 缓存结果
      this.searchCache.set(cacheKey, {
        result: searchResult,
        timestamp: Date.now()
      });
      
      // 清理过期缓存
      this.cleanupCache();

      return searchResult;
    } catch (error) {
      console.error('Search failed:', error);
      return {
        todos: [],
        query: query.trim(),
        executionTime: Date.now() - startTime,
        totalMatches: 0
      };
    }
  }

  /**
   * 构建搜索查询（带缓存）
   * @param query 搜索字符串
   * @param options 搜索选项
   * @returns SQL查询和参数
   */
  private buildSearchQueryWithCache(query: string, options: SearchOptions): { sql: string; params: unknown[] } {
    const queryCacheKey = this.generateQueryCacheKey(query, options);
    const cachedQuery = this.queryCache.get(queryCacheKey);
    
    if (cachedQuery && Date.now() - cachedQuery.timestamp < this.QUERY_CACHE_DURATION) {
      return { sql: cachedQuery.sql, params: cachedQuery.params };
    }
    
    const queryResult = this.buildSearchQuery(query, options);
    
    // 缓存查询
    this.queryCache.set(queryCacheKey, {
      sql: queryResult.sql,
      params: queryResult.params,
      timestamp: Date.now()
    });
    
    return queryResult;
  }

  /**
   * 构建搜索查询
   * @param query 搜索字符串
   * @param options 搜索选项
   * @returns SQL查询和参数
   */
  private buildSearchQuery(query: string, options: SearchOptions): { sql: string; params: unknown[] } {
    const searchTerm = `%${query.trim()}%`;
    const conditions: string[] = [];
    const params: unknown[] = [searchTerm]; // 第一个参数用于排序
    let paramIndex = 2; // 从第二个参数开始

    // 构建搜索条件
    const searchConditions: string[] = [];
    
    if (options.fields.includes('title')) {
      searchConditions.push(`t.title ILIKE $${paramIndex}`);
      params.push(searchTerm);
      paramIndex++;
    }
    
    if (options.fields.includes('content')) {
      searchConditions.push(`t.content ILIKE $${paramIndex}`);
      params.push(searchTerm);
      paramIndex++;
    }
    
    if (options.fields.includes('tags')) {
      searchConditions.push(`t.tags ILIKE $${paramIndex}`);
      params.push(searchTerm);
      paramIndex++;
    }
    
    // 移除ID匹配以避免错误的搜索结果
    // if (options.fields.includes('id')) {
    //   searchConditions.push(`t.id::text ILIKE $${paramIndex}`);
    //   params.push(searchTerm);
    //   paramIndex++;
    // }

    if (searchConditions.length > 0) {
      conditions.push(`(${searchConditions.join(' OR ')})`);
    }

    // 添加完成状态过滤
    if (!options.includeCompleted) {
      conditions.push('t.completed = false');
    }

    // 添加删除状态过滤
    if (!options.includeDeleted) {
      conditions.push('t.deleted = false');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // 构建完整的SQL查询（优化版本）
    const sql = `
      SELECT 
        t.id, t.title, t.completed, t.deleted, t.sort_order, 
        t.due_date, t.content, t.tags, t.priority, t.created_time, 
        t.completed_time, t.start_date, t.list_id,
        t.repeat, t.reminder, t.is_recurring, t.recurring_parent_id, 
        t.instance_number, t.next_due_date,
        l.name as list_name
      FROM todos t 
      LEFT JOIN lists l ON t.list_id = l.id 
      ${whereClause}
      ORDER BY 
        CASE 
          WHEN t.title ILIKE $1 THEN 1 
          WHEN t.content ILIKE $1 THEN 2 
          WHEN t.tags ILIKE $1 THEN 3 
          ELSE 4 
        END,
        t.completed ASC,
        t.priority DESC,
        t.created_time DESC 
      LIMIT ${options.limit || this.DEFAULT_LIMIT}
    `;

    return { sql, params };
  }

  /**
   * 标准化搜索选项
   * @param options 部分搜索选项
   * @returns 完整的搜索选项
   */
  private normalizeSearchOptions(options?: Partial<SearchOptions>): SearchOptions {
    return {
      fields: options?.fields || ['title', 'content', 'tags'],
      includeCompleted: options?.includeCompleted ?? true,
      includeDeleted: options?.includeDeleted ?? false,
      limit: options?.limit || this.DEFAULT_LIMIT
    };
  }

  /**
   * 标准化Todo数据
   * @param raw 原始数据库行
   * @returns 标准化的Todo对象
   */
  private normalizeTodo(raw: Record<string, unknown>): Todo {
    return {
      id: String(raw.id),
      title: String(raw.title || ''),
      completed: Boolean(raw.completed),
      deleted: Boolean(raw.deleted),
      sort_order: Number(raw.sort_order) || 0,
      due_date: this.formatDbDate(raw.due_date),
      content: raw.content ? String(raw.content) : null,
      tags: raw.tags ? String(raw.tags) : null,
      priority: Number(raw.priority) || 0,
      created_time: raw.created_time ? String(raw.created_time) : new Date().toISOString(),
      completed_time: raw.completed_time ? String(raw.completed_time) : null,
      start_date: this.formatDbDate(raw.start_date),
      list_id: raw.list_id ? String(raw.list_id) : null,
      list_name: raw.list_name ? String(raw.list_name) : null,
      // 重复任务相关字段
      repeat: raw.repeat ? String(raw.repeat) : null,
      reminder: raw.reminder ? String(raw.reminder) : null,
      is_recurring: Boolean(raw.is_recurring),
      recurring_parent_id: raw.recurring_parent_id ? String(raw.recurring_parent_id) : null,
      instance_number: raw.instance_number ? Number(raw.instance_number) : null,
      next_due_date: this.formatDbDate(raw.next_due_date),
    };
  }

  /**
   * 格式化数据库日期
   * @param val 日期值
   * @returns 格式化后的日期字符串或null
   */
  private formatDbDate(val: unknown): string | null {
    if (!val) return null;
    if (typeof val === 'string') {
      // 已经是数据库格式
      if (/^\d{4}-\d{2}-\d{2}( 16:00:00\+00)?$/.test(val)) return val;
      // 是 ISO 字符串
      if (/^\d{4}-\d{2}-\d{2}T/.test(val)) return val.slice(0, 10);
      // 是 JS Date 字符串
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const dd = d.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${dd}`;
      }
    }
    // 是 Date 对象
    if (val instanceof Date) {
      const y = val.getFullYear();
      const m = (val.getMonth() + 1).toString().padStart(2, '0');
      const d = val.getDate().toString().padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    // 尝试 new Date
    const d = new Date(val as string);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const dd = d.getDate().toString().padStart(2, '0');
      return `${y}-${m}-${dd}`;
    }
    return null;
  }

  /**
   * 生成缓存键
   * @param query 搜索查询
   * @param options 搜索选项
   * @returns 缓存键
   */
  private generateCacheKey(query: string, options?: Partial<SearchOptions>): string {
    const normalizedOptions = this.normalizeSearchOptions(options);
    return JSON.stringify({
      query: query.trim().toLowerCase(),
      options: normalizedOptions
    });
  }

  /**
   * 生成查询缓存键
   * @param query 搜索查询
   * @param options 搜索选项
   * @returns 查询缓存键
   */
  private generateQueryCacheKey(query: string, options: SearchOptions): string {
    return `query_${JSON.stringify({
      query: query.trim().toLowerCase(),
      options: options
    })}`;
  }

  /**
   * 清理过期缓存
   */
  private cleanupCache(): void {
    const now = Date.now();
    
    // 清理过期的搜索结果缓存
    for (const [key, entry] of this.searchCache.entries()) {
      if (now - entry.timestamp > this.CACHE_DURATION) {
        this.searchCache.delete(key);
      }
    }
    
    // 清理过期的查询缓存
    for (const [key, entry] of this.queryCache.entries()) {
      if (now - entry.timestamp > this.QUERY_CACHE_DURATION) {
        this.queryCache.delete(key);
      }
    }
    
    // 如果缓存项仍然过多，清理最旧的项
    if (this.searchCache.size > this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.searchCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toDelete = entries.slice(0, entries.length - this.MAX_CACHE_SIZE);
      toDelete.forEach(([key]) => this.searchCache.delete(key));
    }
    
    if (this.queryCache.size > this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.queryCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toDelete = entries.slice(0, entries.length - this.MAX_CACHE_SIZE);
      toDelete.forEach(([key]) => this.queryCache.delete(key));
    }
  }

  /**
   * 清空搜索缓存
   */
  clearCache(): void {
    this.searchCache.clear();
    this.queryCache.clear();
  }

  /**
   * 取消当前搜索
   */
  cancelCurrentSearch(): void {
    if (this.searchAbortController) {
      this.searchAbortController.abort();
      this.searchAbortController = null;
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { searchCacheSize: number; queryCacheSize: number } {
    return {
      searchCacheSize: this.searchCache.size,
      queryCacheSize: this.queryCache.size
    };
  }
}

/**
 * 获取搜索服务实例
 * @returns TaskSearchService实例
 */
export function getSearchService(): TaskSearchService {
  return TaskSearchService.getInstance();
}

/**
 * 搜索任务的便捷函数
 * @param query 搜索查询字符串
 * @param options 搜索选项
 * @returns 搜索结果Promise
 */
export async function searchTodos(query: string, options?: Partial<SearchOptions>): Promise<SearchResult> {
  const searchService = getSearchService();
  return searchService.searchTodos(query, options);
}