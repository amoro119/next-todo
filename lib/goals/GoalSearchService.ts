import type { Goal, GoalWithProgress } from '../types';
import { getDbWrapper } from '../sync/initOfflineSync';

export interface GoalSearchOptions {
  fields: ('name' | 'description')[];
  includeArchived: boolean;
  priority?: number;
  listId?: string;
  limit?: number;
  forceRefresh?: boolean; // 强制刷新，跳过缓存
}

export interface GoalSearchResult {
  goals: Goal[];
  query: string;
  executionTime: number;
  totalMatches: number;
}

/**
 * 目标搜索服务类
 */
export class GoalSearchService {
  private static instance: GoalSearchService;
  private searchCache = new Map<string, { result: GoalSearchResult; timestamp: number }>();
  private queryCache = new Map<string, { sql: string; params: unknown[]; timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存
  private readonly QUERY_CACHE_DURATION = 10 * 60 * 1000; // 10分钟查询缓存
  private readonly DEFAULT_LIMIT = 50;
  private readonly MAX_CACHE_SIZE = 100;
  private searchAbortController: AbortController | null = null;

  private constructor() {}

  static getInstance(): GoalSearchService {
    if (!GoalSearchService.instance) {
      GoalSearchService.instance = new GoalSearchService();
    }
    return GoalSearchService.instance;
  }

  /**
   * 搜索目标
   * @param query 搜索查询字符串
   * @param options 搜索选项
   * @returns 搜索结果
   */
  async searchGoals(query: string, options?: Partial<GoalSearchOptions>): Promise<GoalSearchResult> {
    const startTime = Date.now();
    
    // 如果查询为空，返回空结果
    if (!query.trim()) {
      return {
        goals: [],
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
      const goals = result.rows.map((raw: any) => this.normalizeGoal(raw));
      
      const searchResult: GoalSearchResult = {
        goals,
        query: query.trim(),
        executionTime: Date.now() - startTime,
        totalMatches: goals.length
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
      console.error('Goal search failed:', error);
      return {
        goals: [],
        query: query.trim(),
        executionTime: Date.now() - startTime,
        totalMatches: 0
      };
    }
  }

  /**
   * 构建搜索查询（带缓存）
   */
  private buildSearchQueryWithCache(query: string, options: GoalSearchOptions): { sql: string; params: unknown[] } {
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
   */
  private buildSearchQuery(query: string, options: GoalSearchOptions): { sql: string; params: unknown[] } {
    const searchTerm = `%${query.trim()}%`;
    const conditions: string[] = [];
    const params: unknown[] = [searchTerm]; // 第一个参数用于排序
    let paramIndex = 2; // 从第二个参数开始

    // 构建搜索条件
    const searchConditions: string[] = [];
    
    if (options.fields.includes('name')) {
      searchConditions.push(`g.name ILIKE $${paramIndex}`);
      params.push(searchTerm);
      paramIndex++;
    }
    
    if (options.fields.includes('description')) {
      searchConditions.push(`g.description ILIKE $${paramIndex}`);
      params.push(searchTerm);
      paramIndex++;
    }

    if (searchConditions.length > 0) {
      conditions.push(`(${searchConditions.join(' OR ')})`);
    }

    // 添加存档状态过滤
    if (!options.includeArchived) {
      conditions.push('g.is_archived = false');
    }

    // 添加优先级过滤
    if (options.priority !== undefined) {
      conditions.push(`g.priority = $${paramIndex}`);
      params.push(options.priority);
      paramIndex++;
    }

    // 添加列表过滤
    if (options.listId) {
      conditions.push(`g.list_id = $${paramIndex}`);
      params.push(options.listId);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // 构建完整的SQL查询
    const sql = `
      SELECT 
        g.id, g.name, g.description, g.list_id, g.start_date, g.due_date,
        g.priority, g.created_time, g.is_archived,
        l.name as list_name
      FROM goals g 
      LEFT JOIN lists l ON g.list_id = l.id 
      ${whereClause}
      ORDER BY 
        CASE 
          WHEN g.name ILIKE $1 THEN 1 
          WHEN g.description ILIKE $1 THEN 2 
          ELSE 3 
        END,
        g.priority DESC,
        g.created_time DESC 
      LIMIT ${options.limit || this.DEFAULT_LIMIT}
    `;

    return { sql, params };
  }

  /**
   * 标准化搜索选项
   */
  private normalizeSearchOptions(options?: Partial<GoalSearchOptions>): GoalSearchOptions {
    return {
      fields: options?.fields || ['name', 'description'],
      includeArchived: options?.includeArchived ?? false,
      priority: options?.priority,
      listId: options?.listId,
      limit: options?.limit || this.DEFAULT_LIMIT
    };
  }

  /**
   * 标准化目标数据
   */
  private normalizeGoal(raw: Record<string, unknown>): Goal {
    return {
      id: String(raw.id),
      name: String(raw.name || ''),
      description: raw.description ? String(raw.description) : null,
      list_id: raw.list_id ? String(raw.list_id) : null,
      list_name: raw.list_name ? String(raw.list_name) : null,
      start_date: this.formatDbDate(raw.start_date),
      due_date: this.formatDbDate(raw.due_date),
      priority: Number(raw.priority) || 0,
      created_time: raw.created_time ? String(raw.created_time) : new Date().toISOString(),
      is_archived: Boolean(raw.is_archived)
    };
  }

  /**
   * 格式化数据库日期
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
   */
  private generateCacheKey(query: string, options?: Partial<GoalSearchOptions>): string {
    const normalizedOptions = this.normalizeSearchOptions(options);
    return JSON.stringify({
      query: query.trim().toLowerCase(),
      options: normalizedOptions
    });
  }

  /**
   * 生成查询缓存键
   */
  private generateQueryCacheKey(query: string, options: GoalSearchOptions): string {
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
 * 获取目标搜索服务实例
 */
export function getGoalSearchService(): GoalSearchService {
  return GoalSearchService.getInstance();
}

/**
 * 搜索目标的便捷函数
 */
export async function searchGoals(query: string, options?: Partial<GoalSearchOptions>): Promise<GoalSearchResult> {
  const searchService = getGoalSearchService();
  return searchService.searchGoals(query, options);
}